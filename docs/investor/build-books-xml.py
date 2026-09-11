"""Builds the Symmetry App bookkeeping workbook as SpreadsheetML 2003 (Excel's
XML text format). Uploaded to Drive as application/vnd.ms-excel it converts to
a native multi-tab Google Sheet; it is the only text format the Drive tool can
carry that gives tabs, dropdowns and number formats (the tool cannot carry a
binary .xlsx of this size).

    python3 docs/investor/build-books-xml.py out.xml

One ledger tab (Transactions) is typed into; every other tab is formulas over
it: monthly profit and loss against the proposal's plan, balance sheet, loan
register, members' capital for the K-1s, Texas sales tax, 1099 tracker and a
tax summary for the year in Settings.

Google's importer quirks, all verified on 11 Sep 2026: formulas must be R1C1
(converted below from A1); `&` works only with a string literal on its left, so
keys are numeric (category number * 100000 + month serial) rather than joined
text; array literals `{...}` fail; ARRAYFORMULA, SCAN/LAMBDA, SUMIF with array
criteria, MATCH arrays, wildcard SUMIFS and cross-tab references all work;
ss:Index is ignored on Row, Cell and Column, so gaps must be written as
explicit empty elements; and a run of self-closing <Cell/> elements collapses
into one on import unless the cell that ends the run carries a <Data> child,
which is why every formula cell here carries an empty <Data/> child it never reads
-- drop it and adjacent formula cells swallow each other, the row shifts left
and every ARRAYFORMULA in the file reads blank; a DataValidation range past row 1000 makes the whole
conversion fail; sheet names must be a single word, because a quoted reference
such as 'Start Here'!R5C2 is silently dropped. Column number formats only reach
rows the file actually contains, so a blank row a user types into is unformatted
until they copy a formatted cell down; padding every sheet out instead would
add tens of thousands of empty <Row/> elements for no real gain.
"""
import sys, re, datetime
from xml.sax.saxutils import escape

OUT = sys.argv[1] if len(sys.argv) > 1 else "books.xml"

def colnum(s):
    n = 0
    for ch in s: n = n * 26 + ord(ch) - 64
    return n
def col(n):
    s = ""
    while n:
        n, r = divmod(n - 1, 26); s = chr(65 + r) + s
    return s

# ---------------------------------------------------------------- A1 -> R1C1
REF = re.compile(r"(?<![A-Za-z0-9_$])(?:(\$?)([A-Z]{1,3})(\$?)(\d+)(?::(\$?)([A-Z]{1,3})(\$?)(\d+))?|(\$?)([A-Z]{1,3}):(\$?)([A-Z]{1,3}))(?![A-Za-z0-9_(\[])")
def _part(abs_, val, base, letter):
    if abs_: return f"{letter}{val}"
    d = val - base
    return letter if d == 0 else f"{letter}[{d}]"
def to_r1c1(formula, row, c):
    out, i = [], 0
    while i < len(formula):
        j = formula.find('"', i)
        chunk = formula[i:] if j < 0 else formula[i:j]
        def cell(m):
            a1, c1, a2, r1, a3, c3, a4, r3, b1, d1, b2, d2 = m.groups()
            if d1: return _part(b1, colnum(d1), c, "C") + ":" + _part(b2, colnum(d2), c, "C")
            s = _part(a2, int(r1), row, "R") + _part(a1, colnum(c1), c, "C")
            if c3: s += ":" + _part(a4, int(r3), row, "R") + _part(a3, colnum(c3), c, "C")
            return s
        out.append(REF.sub(cell, chunk))
        if j < 0: break
        k = formula.find('"', j + 1); out.append(formula[j:k + 1]); i = k + 1
    return "".join(out)

# ---------------------------------------------------------------- model
S = dict(def_="def", b="b", title="title", head="head", cur="cur", curb="curb", date="date", mon="mon", pct="pct", wrap="wrap", int_="int", note="note")
class Sheet:
    def __init__(self, name, widths=None, freeze=0, colstyles=None):
        self.name, self.cells, self.widths, self.freeze = name, {}, widths or {}, freeze
        self.colstyles = colstyles or {}; self.validations = []
        self.merges = {}      # (row, col) -> how many extra columns the cell spans
        self.heights = {}     # row -> point height
    def put(self, r, c, v, s=None, merge=0):
        if isinstance(c, str): c = colnum(c)
        self.cells[(r, c)] = (v, s)
        if merge: self.merges[(r, c)] = merge
    def banner(self, r, text, span, style="bn", height=22):
        """A section title filled across `span` columns."""
        self.put(r, 1, text, style, merge=span - 1); self.heights[r] = height
    def text(self, r, c, v, s=None, merge=0): self.put(r, c, str(v), s, merge)
    def f(self, r, c, formula, s=None): self.put(r, c, ("f", formula), s)
    def date(self, r, c, d, s="mon"): self.put(r, c, ("d", d), s)
    def xml(self):
        rows = {}
        for (r, c), v in self.cells.items(): rows.setdefault(r, []).append((c, v))
        o = [f'<Worksheet ss:Name="{escape(self.name)}"><Table>']
        for c in range(1, max(list(self.widths) + list(self.colstyles) + [1]) + 1):
            a = (f' ss:Width="{self.widths[c]}"' if c in self.widths else "") + (f' ss:StyleID="{self.colstyles[c]}"' if c in self.colstyles else "")
            o.append(f"<Column{a}/>")
        for r in range(1, max(rows) + 1):
            if r not in rows:
                o.append("<Row/>"); continue
            h = self.heights.get(r)
            o.append(f'<Row ss:Height="{h}">' if h else "<Row>")
            last = 0
            for c, (v, s) in sorted(rows[r]):
                o.append("<Cell/>" * (c - last - 1))
                a = f' ss:StyleID="{s}"' if s else ""
                m = self.merges.get((r, c), 0)
                if m: a += f' ss:MergeAcross="{m}"'
                last = c + m
                if isinstance(v, tuple) and v[0] == "f":
                    fx = escape(to_r1c1(v[1], r, c), {'"': "&quot;"})
                    o.append(f'<Cell{a} ss:Formula="{fx}"><Data/></Cell>')
                elif isinstance(v, tuple) and v[0] == "d":
                    o.append(f'<Cell{a}><Data ss:Type="DateTime">{v[1].isoformat()}T00:00:00.000</Data></Cell>')
                elif isinstance(v, (int, float)):
                    o.append(f'<Cell{a}><Data ss:Type="Number">{v}</Data></Cell>')
                elif v == "":
                    o.append(f"<Cell{a}/>")
                else:
                    o.append(f'<Cell{a}><Data ss:Type="String">{escape(v)}</Data></Cell>')
            o.append("</Row>")
        o.append("</Table>")
        if self.freeze:
            o.append(f'<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>{self.freeze}</SplitHorizontal><TopRowBottomPane>{self.freeze}</TopRowBottomPane><ActivePane>2</ActivePane></WorksheetOptions>')
        for rng, val in self.validations:
            o.append(f'<DataValidation xmlns="urn:schemas-microsoft-com:office:excel"><Range>{rng}</Range><Type>List</Type><Value>{escape(val)}</Value></DataValidation>')
        o.append("</Worksheet>")
        return "".join(o)

sheets = []
def new(name, widths=None, freeze=0, colstyles=None):
    s = Sheet(name, widths, freeze, colstyles); sheets.append(s); return s

TX, CAT = "Ledger", "Categories"
NTX = 5000
def T(c): return f"{TX}!${c}$3:${c}${NTX}"
TxDate, TxPayee, TxCat, TxIn, TxOut, TxAcct, TxMonth, TxNet, TxKey, TxType, TxLine, Tx1099, TxNec = (T(c) for c in "ABDEFGJKMNOPQ")
CATS = f"{CAT}!$A$4:$A$61"
SET = "Settings!$B$"
names = {}   # filled from the settings rows below

def keyof(catname_or_ref): return f"MATCH({catname_or_ref},{CATS},0)*100000"
def by_month_block(cat_range, month_ref, sign=""):
    """ARRAYFORMULA: net amount for each category in cat_range in the month at month_ref."""
    return f"=ARRAYFORMULA({sign}SUMIF({TxKey},{keyof(cat_range)}+{month_ref},{TxNet}))"
def cat_months(catname, month_range, sign=""):
    return f"=ARRAYFORMULA({sign}SUMIF({TxKey},{keyof(chr(34) + catname + chr(34))}+{month_range},{TxNet}))"
def net_between(catname, lo, hi):
    return f"SUMIFS({TxNet},{TxCat},\"{catname}\",{TxDate},\">=\"&{lo},{TxDate},\"<\"&{hi})"
def net_before(catname, hi):
    return f"SUMIFS({TxNet},{TxCat},\"{catname}\",{TxDate},\"<\"&{hi})"
def profit(lo, hi):
    return f"(SUMIFS({TxNet},{TxType},\"Income\",{TxDate},\">=\"&{lo},{TxDate},\"<\"&{hi})+SUMIFS({TxNet},{TxType},\"Expense\",{TxDate},\">=\"&{lo},{TxDate},\"<\"&{hi}))"
YR0, YR1 = "DATE(TaxYear,1,1)", "DATE(TaxYear+1,1,1)"
EPOCH = "DATE(2000,1,1)"

# ======================================================================= Start Here
st = new("Settings", {1: 300, 2: 90, 3: 520})
st.text(1, 1, "Symmetry App LLC \u2014 the books", "title", merge=2); st.heights[1] = 30
st.text(2, 1, "One workbook for everything that comes in and goes out. You type on the Ledger tab only; every other tab is worked out from it. Built 11 Sep 2026 from the investor proposal. The tax notes are a guide for a two-member Texas LLC taxed as a partnership; have a CPA check the first return.", "sub", merge=2); st.heights[2] = 44
st.banner(4, "SETTINGS \u2014 change these here and every tab follows", 3)
settings = [
    ("TaxYear", "Year to report on (drives every report tab)", 2026, "int", "Change to 2027 in January and every report follows."),
    ("LoanRate", "Loan interest rate per year", 0.07, "pct", "Proposal §3: 7% simple interest on drawn funds."),
    ("Facility", "Committed facility from Lauren", 274000, "cur", "Proposal §3: drawn month by month, only when the account needs it."),
    ("PctDustin", "Dustin's membership interest", 0.90, "pct", "Profit, loss and distributions split on these percentages (Schedule K-1)."),
    ("PctLauren", "Lauren's membership interest", 0.10, "pct", "Proposal §3."),
    ("SalesTaxRate", "Texas sales tax rate (state 6.25% + local, 8.25% max)", 0.0825, "pct", "Rate at the customer's Texas address. Out-of-state customers follow their own state's rules (most start at $100k of sales there)."),
    ("TaxablePortion", "Share of a software subscription that Texas taxes", 0.80, "pct", "Texas treats SaaS as a data processing service: 80% of the charge is taxable, 20% exempt (Tax Code §151.351)."),
    ("Threshold1099", "1099-NEC threshold", 2000, "cur", "Payments to one contractor in a year at or above this need a 1099-NEC by 31 January ($2,000 from 2026, indexed after 2027)."),
    ("Reserve", "Cash reserve held before any distribution", 139000, "cur", "Proposal §3, §5: about four months of running costs."),
]
for i, (nm, label, val, sty, note) in enumerate(settings):
    r = 5 + i
    st.text(r, 1, label, "lab"); st.put(r, 2, val, "in" + sty); st.text(r, 3, note, "note")
    names[nm] = f"{SET}{r}"
r = 5 + len(settings) + 1
st.banner(r, "WHAT THE COLOURS MEAN", 3); r += 1
st.text(r, 1, "Cells like this one are yours to type in.", "in")
st.text(r, 2, "", "in")
st.text(r, 3, "Cream with a box round it: an entry field. Everything else on a report tab is worked out for you.", "note"); r += 1
st.text(r, 1, "Grey italic columns fill themselves.", "auto")
st.text(r, 2, "", "auto")
st.text(r, 3, "On the Ledger, columns J to Q. Typing over them breaks the reports.", "note"); r += 2
banner_rows = []
for txt, sty in [
    ("HOW TO DO THE BOOKS \u2014 about an hour a month", "bn"),
    ("1. Every time money moves, add one line on the Ledger: date, who, what for, category from the dropdown, amount in OR out, and which account it moved through. Loan draws, loan payments, money you take out, sales tax: all of it goes in the same list. Columns J to Q fill themselves; do not type there. The dropdowns cover the first 1,000 lines; after that, copy a filled cell down or just type the category exactly.", "wrap"),
    ("2. A loan payment is two lines: the interest part (category Loan interest) and the principal part (Loan principal repayment). The Loan tab shows how much interest has built up.", "wrap"),
    ("3. Stripe: record customer charges as Trainer subscriptions or Individual subscriptions in the Stripe account, Stripe's fee as Payment processing fees, and the payout to the bank as Transfer between accounts (one line out of Stripe, one line into Bank).", "wrap"),
    ("4. Month end: check that the Balance Sheet cash for each account equals the bank, Stripe and card statements. If it does not, a line is missing or wrong. Then read the Profit & Loss for the month.", "wrap"),
    ("5. Keep the receipt: paste a Drive link or the email subject in the Receipt column. The IRS wants a receipt for anything over $75 and for every meal.", "wrap"),
    ("6. Never delete a line to fix a mistake; add a reversing line so the history stays honest. If a category shows NOT A CATEGORY in column N, the spelling does not match the Categories tab.", "wrap"),
    ("", None),
    ("TAX CALENDAR \u2014 dates fall in the year after the one being reported", "bn"),
    ("15 Jan: last quarterly estimated tax payment for the members. Dustin and Lauren pay income tax personally on their share; the LLC itself pays none.", "wrap"),
    ("31 Jan: 1099-NEC to every contractor the Form1099 tab marks YES, and a copy to the IRS.", "wrap"),
    ("20th of each month (or quarter, as the Comptroller assigns): Texas sales tax return and payment. Register at comptroller.texas.gov before the first Texas sale.", "wrap"),
    ("15 Mar: Form 1065 partnership return with a Schedule K-1 for each member. Late penalty $255 per member per month. Extension to 15 Sep with Form 7004.", "wrap"),
    ("15 Apr: members' personal returns (Form 1040 with Schedule E and Schedule SE) and the Q1 estimate. 15 Jun: Q2 estimate. 15 Sep: Q3 estimate.", "wrap"),
    ("15 May: Texas franchise tax. Under $2.65M of revenue nothing is owed, but the Public Information Report must still be filed or the LLC loses good standing.", "wrap"),
    ("", None),
    ("WHAT THE TABS ARE", "bn"),
    ("Ledger is the only tab you type on. Categories feeds its dropdown. ProfitLoss, BalanceSheet, Loan, Owners, SalesTax, Form1099 and TaxSummary all read the Ledger. Plan holds the proposal's budget and ProfitLoss compares actuals to it.", "wrap"),
]:
    if txt:
        if sty == "bn": st.banner(r, txt, 3)
        else: st.text(r, 1, txt, sty, merge=2)
    r += 1

# ======================================================================= Categories
ca = new(CAT, {1: 200, 2: 70, 3: 210, 4: 45, 5: 520}, freeze=3)
ca.banner(1, "CATEGORIES \u2014 the dropdown on the Ledger", 5)
ca.text(2, 1, "Categories: the dropdown on the Ledger. Add a row to add a category (keep it inside rows 4 to 61). Type decides where it lands: Income and Expense make profit; Loan, Owner, Tax and Transfer are cash moves that are not profit.", "wrap")
for c, h in enumerate(["Category", "Type", "Form 1065 line", "1099?", "What goes here"], start=1): ca.text(3, c, h, "head")
ca.heights[3] = 30
cats = [
    ("Trainer subscriptions", "Income", "1a Gross receipts", "", "Monthly trainer plans ($79 + $15 per 5 clients, cap $199). Gross charge; Stripe's fee goes on its own line."),
    ("Individual subscriptions", "Income", "1a Gross receipts", "", "Individual users at $49 a month."),
    ("Other income", "Income", "7 Other income", "", "Anything else earned: setup fees, bank interest, referral income."),
    ("Refunds to customers", "Income", "1b Returns and allowances", "", "Money returned to a customer. Enter it as money OUT under this category."),
    ("Developer (contractor)", "Expense", "20 Other deductions (software development §174A)", "Yes", "The contract developer. Domestic software development cost is deductible in the year paid for tax years after 2024."),
    ("Marketing and advertising", "Expense", "20 Other deductions", "Yes", "Ads, content, the marketing lead. The Yes only applies to a person or LLC, not an ad platform."),
    ("Hosting, AI and software tools", "Expense", "20 Other deductions", "", "Vercel, Supabase, AI usage, domain, email, subscriptions."),
    ("Payment processing fees", "Expense", "20 Other deductions", "", "Stripe and card fees taken out of customer payments."),
    ("Legal and professional", "Expense", "20 Other deductions", "Yes", "Lawyer, CPA, bookkeeper. Attorneys always get a 1099, even incorporated ones."),
    ("Insurance", "Expense", "20 Other deductions", "", "Business liability, cyber, errors and omissions."),
    ("Bank and merchant fees", "Expense", "20 Other deductions", "", "Bank charges, wire fees, chargeback fees."),
    ("Office, equipment and supplies", "Expense", "20 Other deductions", "", "Laptop, phone, supplies. Anything over $2,500 per item should be depreciated; ask the CPA."),
    ("Travel", "Expense", "20 Other deductions", "", "Flights, hotel, mileage at the IRS rate (keep a log). Fully deductible."),
    ("Meals", "Expense", "20 Other deductions (50% limit)", "", "Business meals. Only 50% is deductible; the Tax Summary applies that."),
    ("Loan interest", "Expense", "15 Interest", "", "The interest part of a payment to Lauren. Deductible."),
    ("Taxes, licences and filing fees", "Expense", "14 Taxes and licenses", "", "Texas franchise/PIR filing, registered agent, business licences. Not income tax, not sales tax."),
    ("Startup costs (before launch)", "Expense", "20 Other deductions (§195 election)", "", "Formation, market research and the like, before the first sale. Up to $50,000 deductible in the first year of business."),
    ("Guaranteed payment to Dustin", "Expense", "10 Guaranteed payments", "", "A fixed monthly amount Dustin pays himself, if any. Deductible to the LLC, taxable to him, and subject to self-employment tax."),
    ("Other expense", "Expense", "20 Other deductions", "", "Anything that does not fit; add a category if it repeats."),
    ("Loan draw from Lauren", "Loan", "not on P&L (balance sheet)", "", "Money IN when a draw on the facility lands in the bank."),
    ("Loan principal repayment", "Loan", "not on P&L (balance sheet)", "", "The principal part of a payment to Lauren, money OUT."),
    ("Member contribution: Dustin", "Owner", "K-1 capital account", "", "Money Dustin puts in. Money IN."),
    ("Member contribution: Lauren", "Owner", "K-1 capital account", "", "Money Lauren puts in as a member (not the loan). Money IN."),
    ("Member distribution: Dustin", "Owner", "K-1 box 19 distributions", "", "Profit paid out to Dustin, money OUT. Not an expense. Personal tax paid from the business account counts here."),
    ("Member distribution: Lauren", "Owner", "K-1 box 19 distributions", "", "Profit paid out to Lauren, money OUT (10% of whatever is distributed)."),
    ("Sales tax collected", "Tax", "not on P&L (owed to Texas)", "", "Sales tax charged to customers. Money IN. It is Texas's money, not revenue."),
    ("Sales tax remitted to Texas", "Tax", "not on P&L (owed to Texas)", "", "The sales tax return payment. Money OUT."),
    ("Transfer between accounts", "Transfer", "ignored", "", "Stripe payout to the bank, or bank to card. Two lines: OUT of one, IN to the other. Cancels out."),
]
for i, row in enumerate(cats):
    for c, v in enumerate(row, start=1):
        if v or c == 4: ca.text(4 + i, c, v, "note" if c == 5 else "lab")

# ======================================================================= Transactions
tx = new(TX, {1: 78, 2: 140, 3: 190, 4: 185, 5: 85, 6: 85, 7: 70, 8: 140, 9: 160, 10: 68, 11: 78, 12: 52, 13: 78, 14: 78, 15: 118, 16: 52, 17: 78}, freeze=2,
         colstyles={1: "indate", 2: "in", 3: "in", 4: "in", 5: "incur", 6: "incur", 7: "in", 8: "in", 9: "in",
                    10: "automon", 11: "autocur", 12: "auto", 13: "auto", 14: "auto", 15: "auto", 16: "auto", 17: "autocur"})
tx.banner(1, "YOU TYPE HERE \u2014 one line every time money moves", 9)
tx.put(1, 10, "THE SHEET FILLS THESE IN \u2014 do not type", "bn", merge=7)
for c, h in enumerate(["Date", "Payee / who", "What for", "Category (pick from list)", "Money in", "Money out", "Account", "Receipt link / ref", "Notes",
                       "Month", "Net", "Cat #", "Key", "Type", "Tax line", "1099", "1099 this year"], start=1):
    tx.text(2, c, h, "headl" if c in (2, 3, 4, 8, 9) else "head")
tx.heights[2] = 32
tx.date(3, 1, datetime.date(2026, 9, 11), "indate"); tx.text(3, 2, "Example: Texas SOS", "in"); tx.text(3, 3, "LLC filing fee (example line: overwrite it)", "in")
tx.text(3, 4, "Startup costs (before launch)", "in"); tx.put(3, 6, 300, "incur"); tx.text(3, 7, "Bank", "in")
A = f"$A$3:$A${NTX}"
def auto(expr): return f"=ARRAYFORMULA(IF({A}=\"\",\"\",{expr}))"
tx.f(3, 10, auto(f"DATE(YEAR({A}),MONTH({A}),1)"))
tx.f(3, 11, auto(f"$E$3:$E${NTX}-$F$3:$F${NTX}"))
tx.f(3, 12, auto(f"IFERROR(MATCH($D$3:$D${NTX},{CATS},0),0)"))
tx.f(3, 13, auto(f"$L$3:$L${NTX}*100000+$J$3:$J${NTX}"))
tx.f(3, 14, auto(f"IFERROR(VLOOKUP($D$3:$D${NTX},{CAT}!$A$4:$B$61,2,FALSE),\"NOT A CATEGORY\")"))
tx.f(3, 15, auto(f"IFERROR(VLOOKUP($D$3:$D${NTX},{CAT}!$A$4:$C$61,3,FALSE),\"\")"))
tx.f(3, 16, auto(f"IFERROR(VLOOKUP($D$3:$D${NTX},{CAT}!$A$4:$D$61,4,FALSE),\"\")"))
tx.f(3, 17, auto(f"IF(($P$3:$P${NTX}=\"Yes\")*(YEAR({A})=TaxYear),$F$3:$F${NTX},0)"))
# Google refuses to convert a validation range past row 1000, so the dropdowns cover the first 1000 lines.
tx.validations.append(("R3C4:R1000C4", f"{CAT}!R4C1:R61C1"))
tx.validations.append(("R3C7:R1000C7", '"Bank,Stripe,Card,Cash"'))

# ======================================================================= Profit & Loss
pl = new("ProfitLoss", {1: 230, 2: 60, **{c: 78 for c in range(3, 18)}}, freeze=2, colstyles={c: "cur" for c in range(3, 18)})
pl.text(1, 1, "PROFIT & LOSS \u2014 month by month, for the year in Settings", "title", merge=1); pl.heights[1] = 28
pl.f(1, 3, "=TaxYear", "title")
pl.text(2, 1, "Category", "headl"); pl.text(2, 2, "Type", "head"); pl.heights[2] = 30
pl.f(2, 3, f"=ARRAYFORMULA(EDATE({YR0},SEQUENCE(1,12,0)))", "mon")
for c in range(4, 15): pl.put(2, c, "", "mon")
pl.text(2, 15, "Year total", "head"); pl.text(2, 16, "Plan (proposal)", "head"); pl.text(2, 17, "Over / (under) plan", "head")
inc = [c for c in cats if c[1] == "Income"]; exp = [c for c in cats if c[1] == "Expense"]
r = 3; pl.banner(r, "INCOME", 17); r += 1
inc0 = r
for cname, typ, *_ in inc: pl.text(r, 1, cname, "lab"); pl.text(r, 2, typ, "note"); r += 1
inc1 = r - 1
for c in range(3, 15): pl.f(inc0, c, by_month_block(f"$A{inc0}:$A{inc1}", f"{col(c)}$2"))
pl.text(r, 1, "Total income", "tot"); pl.text(r, 2, "", "tot")
for c in range(3, 15): pl.f(r, c, f"=SUM({col(c)}{inc0}:{col(c)}{inc1})", "curb")
tot_inc = r; r += 2
pl.banner(r, "EXPENSES", 17); r += 1
exp0 = r
for cname, typ, *_ in exp: pl.text(r, 1, cname, "lab"); pl.text(r, 2, typ, "note"); r += 1
exp1 = r - 1
for c in range(3, 15): pl.f(exp0, c, by_month_block(f"$A{exp0}:$A{exp1}", f"{col(c)}$2", "-"))
pl.text(r, 1, "Total expenses", "tot"); pl.text(r, 2, "", "tot")
for c in range(3, 15): pl.f(r, c, f"=SUM({col(c)}{exp0}:{col(c)}{exp1})", "curb")
tot_exp = r; r += 2
pl.text(r, 1, "NET PROFIT (LOSS)", "tot"); pl.text(r, 2, "", "tot")
for c in range(3, 15): pl.f(r, c, f"={col(c)}{tot_inc}-{col(c)}{tot_exp}", "curb")
net = r; r += 2
pl.banner(r, "CASH MOVES THAT ARE NOT PROFIT \u2014 shown as positive amounts", 17); r += 1
below = [c[0] for c in cats if c[1] in ("Loan", "Owner", "Tax")]
b0 = r
for cname in below: pl.text(r, 1, cname, "lab"); pl.text(r, 2, "in" if cname.startswith(("Loan draw", "Member contribution", "Sales tax collected")) else "out", "note"); r += 1
b1 = r - 1
for c in range(3, 15): pl.f(b0, c, f"=ARRAYFORMULA(ABS(SUMIF({TxKey},{keyof(f'$A{b0}:$A{b1}')}+{col(c)}$2,{TxNet})))")
pl.text(r, 1, "Net change in cash (every line for the month)", "tot"); pl.text(r, 2, "", "tot")
for c in range(3, 15): pl.f(r, c, f"=SUMIF({TxMonth},{col(c)}$2,{TxNet})", "curb")
r += 1
pl.text(r, 1, "Cash in all accounts at month end", "tot"); pl.text(r, 2, "", "tot")
for c in range(3, 15): pl.f(r, c, f"=SUMIF({TxDate},\"<\"&EDATE({col(c)}$2,1),{TxNet})", "curb")
cash_r = r; r += 1
for x in list(range(inc0, inc1 + 1)) + list(range(exp0, exp1 + 1)) + list(range(b0, b1 + 1)) + [tot_inc, tot_exp, net, cash_r - 1]:
    pl.f(x, 15, f"=SUM(C{x}:N{x})", "curb" if x in (tot_inc, tot_exp, net, cash_r - 1) else None)
pl.f(cash_r, 15, f"=N{cash_r}", "curb")
for lo, hi in [(inc0, inc1), (exp0, exp1)]:
    pl.f(lo, 16, f"=ARRAYFORMULA(IFERROR(VLOOKUP($A{lo}:$A{hi},Plan!$A$3:$Z$40,26,FALSE),0))")
    pl.f(lo, 17, f"=ARRAYFORMULA(O{lo}:O{hi}-P{lo}:P{hi})")
for x, lo, hi in [(tot_inc, inc0, inc1), (tot_exp, exp0, exp1)]:
    pl.f(x, 16, f"=SUM(P{lo}:P{hi})", "curb"); pl.f(x, 17, f"=O{x}-P{x}", "curb")
pl.f(net, 16, f"=P{tot_inc}-P{tot_exp}", "curb"); pl.f(net, 17, f"=O{net}-P{net}", "curb")
pl.text(r + 1, 1, "Income rows are money in less refunds; expense rows are money out less any vendor refunds. Loan interest is an expense; loan principal, draws and distributions are not. Cash at month end counts every line ever entered up to that date, so it must equal bank + Stripe + card balances.", "note")

# ======================================================================= Balance Sheet
bs = new("BalanceSheet", {1: 330, 2: 100, 3: 480})
bs.text(1, 1, "BALANCE SHEET \u2014 at 31 December of the year in Settings", "title"); bs.f(1, 2, "=TaxYear", "title"); bs.text(1, 3, "", "title"); bs.heights[1] = 28
bs.text(2, 1, "Everything is counted from the first line ever entered up to the end of that year.", "note")
bs.banner(4, "ASSETS \u2014 what the business has", 3)
r = 5
for a in ["Bank", "Stripe", "Card", "Cash"]:
    bs.text(r, 1, f"Cash in {a}", "lab"); bs.f(r, 2, f"=SUMIFS({TxNet},{TxAcct},\"{a}\",{TxDate},\"<\"&{YR1})", "cur")
    bs.text(r, 3, "Must match the statement. A card balance you owe shows as a negative." if a == "Card" else "Must match the statement.", "note"); r += 1
bs.text(r, 1, "Total assets", "tot"); bs.f(r, 2, f"=SUM(B5:B{r-1})", "curb"); ta = r; r += 2
bs.banner(r, "LIABILITIES \u2014 what the business owes", 3); r += 1
bs.text(r, 1, "Loan from Lauren: principal outstanding", "lab"); bs.f(r, 2, f"={net_before('Loan draw from Lauren', YR1)}+{net_before('Loan principal repayment', YR1)}", "cur"); lp = r; r += 1
bs.text(r, 1, "Loan interest built up and not yet paid", "lab"); bs.f(r, 2, f"=SUMIFS(Loan!$D$9:$D$71,Loan!$A$9:$A$71,\"<\"&{YR1})+{net_before('Loan interest', YR1)}", "cur")
bs.text(r, 3, "From the Loan tab: interest accrued to date less interest actually paid.", "note"); li = r; r += 1
bs.text(r, 1, "Sales tax collected and not yet remitted", "lab"); bs.f(r, 2, f"={net_before('Sales tax collected', YR1)}+{net_before('Sales tax remitted to Texas', YR1)}", "cur"); stx = r; r += 1
bs.text(r, 1, "Total liabilities", "tot"); bs.f(r, 2, f"=SUM(B{lp}:B{stx})", "curb"); tl = r; r += 2
bs.banner(r, "MEMBERS' EQUITY \u2014 what is left for the owners", 3); r += 1
bs.text(r, 1, "Contributions from members", "lab"); bs.f(r, 2, f"={net_before('Member contribution: Dustin', YR1)}+{net_before('Member contribution: Lauren', YR1)}", "cur"); e1 = r; r += 1
bs.text(r, 1, "Less distributions to members", "lab"); bs.f(r, 2, f"={net_before('Member distribution: Dustin', YR1)}+{net_before('Member distribution: Lauren', YR1)}", "cur"); r += 1
bs.text(r, 1, "Profit (loss) kept in the business since day one", "lab"); bs.f(r, 2, "=" + profit(EPOCH, YR1), "cur"); e3 = r; r += 1
bs.text(r, 1, "Total members' equity", "tot"); bs.f(r, 2, f"=SUM(B{e1}:B{e3})", "curb"); te = r; r += 2
bs.text(r, 1, "CHECK: assets less loan principal, sales tax owed and equity (should be 0)", "tot")
bs.f(r, 2, f"=ROUND(B{ta}-B{lp}-B{stx}-B{te},2)", "keyb")
bs.text(r, 3, "Not zero means a Transfer line is missing its other half, or a line has both an in and an out. Unpaid loan interest is left out on purpose: cash basis.", "note")
bs.text(r + 2, 1, "Cash basis: income counts when it lands, costs when they are paid. That is what a small LLC files on. This is Schedule L of Form 1065 (only required above $1M of assets, but keep it anyway).", "note")

# ======================================================================= Loan
ln = new("Loan", {1: 70, **{c: 88 for c in range(2, 10)}}, freeze=8, colstyles={1: "mon", **{c: "cur" for c in range(2, 10)}})
ln.text(1, 1, "LOAN FROM LAUREN \u2014 the register, worked out from the lines on the Ledger", "title", merge=8); ln.heights[1] = 28
for i, (label, fx) in enumerate([
    ("Principal drawn to date", f"=SUMIF({TxCat},\"Loan draw from Lauren\",{TxNet})"),
    ("Principal repaid to date", f"=-SUMIF({TxCat},\"Loan principal repayment\",{TxNet})"),
    ("Principal outstanding", "=C2-C3"),
    ("Interest paid to Lauren to date", f"=-SUMIF({TxCat},\"Loan interest\",{TxNet})"),
    ("Facility still available", "=Facility-C2")]):
    ln.text(2 + i, 1, label, "lab"); ln.f(2 + i, 3, fx, "keyb")
ln.text(2, 5, "Interest builds at the Settings rate / 12 on the principal outstanding at the start of each month. Payments start once monthly revenue covers running costs (proposal §3); until then it accrues in column G. When you pay, enter the interest part as Loan interest and the rest as Loan principal repayment.", "note")
for c, h in enumerate(["Month", "Opening principal", "Draws", "Interest for the month", "Interest paid", "Principal repaid", "Interest unpaid (running)", "Closing principal", "Owed in total"], start=1): ln.text(8, c, h, "head")
ln.heights[8] = 34
L0, L1 = 9, 71   # Oct 2026 .. Dec 2031
ln.f(L0, 1, f"=ARRAYFORMULA(EDATE(DATE(2026,10,1),SEQUENCE({L1 - L0 + 1},1,0)))")
M = f"$A${L0}:$A${L1}"
ln.f(L0, 3, cat_months("Loan draw from Lauren", M))
ln.f(L0, 5, cat_months("Loan interest", M, "-"))
ln.f(L0, 6, cat_months("Loan principal repayment", M, "-"))
ln.f(L0, 8, f"=SCAN(0,ARRAYFORMULA(C{L0}:C{L1}-F{L0}:F{L1}),LAMBDA(a,x,a+x))")
ln.f(L0, 2, f"=ARRAYFORMULA(H{L0}:H{L1}-C{L0}:C{L1}+F{L0}:F{L1})")
ln.f(L0, 4, f"=ARRAYFORMULA(ROUND(B{L0}:B{L1}*LoanRate/12,2))")
ln.f(L0, 7, f"=SCAN(0,ARRAYFORMULA(D{L0}:D{L1}-E{L0}:E{L1}),LAMBDA(a,x,a+x))")
ln.f(L0, 9, f"=ARRAYFORMULA(H{L0}:H{L1}+G{L0}:G{L1})")

# ======================================================================= Owners
ow = new("Owners", {1: 330, 2: 95, 3: 95, 4: 95, 5: 420}, colstyles={2: "cur", 3: "cur", 4: "cur"})
ow.text(1, 1, "OWNERS \u2014 members' capital, and what goes on each Schedule K-1", "title", merge=1); ow.f(1, 2, "=TaxYear", "title"); ow.text(1, 3, "", "title"); ow.text(1, 4, "", "title"); ow.heights[1] = 28
for c, h in enumerate(["For the year in Settings", "Dustin", "Lauren", "Total", "Notes"], start=1): ow.text(3, c, h, "headl" if c in (1, 5) else "head")
ow.heights[3] = 26
ow.text(4, 1, "Membership interest", "lab"); ow.f(4, 2, "=PctDustin", "pct"); ow.f(4, 3, "=PctLauren", "pct"); ow.f(4, 4, "=B4+C4", "pct")
ow.text(5, 1, "Capital account at start of year", "lab")
ow.f(5, 2, f"={net_before('Member contribution: Dustin', YR0)}+{net_before('Member distribution: Dustin', YR0)}+PctDustin*{profit(EPOCH, YR0)}")
ow.f(5, 3, f"={net_before('Member contribution: Lauren', YR0)}+{net_before('Member distribution: Lauren', YR0)}+PctLauren*{profit(EPOCH, YR0)}")
ow.text(6, 1, "Contributions this year", "lab"); ow.f(6, 2, "=" + net_between("Member contribution: Dustin", YR0, YR1)); ow.f(6, 3, "=" + net_between("Member contribution: Lauren", YR0, YR1))
ow.text(7, 1, "Share of net profit (loss) this year", "lab"); ow.f(7, 2, f"=PctDustin*ProfitLoss!$O${net}"); ow.f(7, 3, f"=PctLauren*ProfitLoss!$O${net}")
ow.text(7, 5, "K-1 box 1, split on the percentages, after guaranteed payments. The operating agreement can change the split; tell the CPA if it does.", "note")
ow.text(8, 1, "Guaranteed payments received", "lab"); ow.f(8, 2, "=-" + net_between("Guaranteed payment to Dustin", YR0, YR1)); ow.put(8, 3, 0)
ow.text(8, 5, "K-1 box 4. Already deducted in the P&L, so not part of the profit share.", "note")
ow.text(9, 1, "Distributions this year (negative)", "lab"); ow.f(9, 2, "=" + net_between("Member distribution: Dustin", YR0, YR1)); ow.f(9, 3, "=" + net_between("Member distribution: Lauren", YR0, YR1))
ow.text(9, 5, "K-1 box 19. Distributions are not taxed again; the profit share was.", "note")
ow.text(10, 1, "Capital account at end of year", "tot"); ow.f(10, 2, "=B5+B6+B7+B9", "curb"); ow.f(10, 3, "=C5+C6+C7+C9", "curb")
for x in range(5, 11): ow.f(x, 4, f"=B{x}+C{x}", "curb" if x == 10 else None)
ow.banner(12, "DISTRIBUTION CHECK \u2014 what could be paid out today", 5)
ow.text(13, 1, "Cash in all accounts today", "lab"); ow.f(13, 2, f"=SUMIF({TxDate},\"<=\"&TODAY(),{TxNet})")
ow.text(14, 1, "Less reserve and unremitted sales tax", "lab"); ow.f(14, 2, f"=-(Reserve+BalanceSheet!$B${stx})")
ow.text(15, 1, "Available to distribute", "lab"); ow.f(15, 2, "=MAX(0,B13+B14)", "keyb")
ow.text(16, 1, "Of which Dustin / Lauren", "lab"); ow.f(16, 2, "=B15*PctDustin"); ow.f(16, 3, "=B15*PctLauren")
ow.text(17, 1, "Lauren's share of everything distributed so far (should read 10%)", "lab")
ow.f(17, 3, f"=IFERROR(SUMIF({TxCat},\"Member distribution: Lauren\",{TxNet})/(SUMIF({TxCat},\"Member distribution: Lauren\",{TxNet})+SUMIF({TxCat},\"Member distribution: Dustin\",{TxNet})),0)", "pct")
ow.text(17, 5, "Proposal §3: distributions only above the reserve and always in the 90/10 split.", "note")

# ======================================================================= Sales Tax
sx = new("SalesTax", {1: 70, **{c: 95 for c in range(2, 8)}, 8: 420}, freeze=4, colstyles={1: "mon", **{c: "cur" for c in range(2, 8)}})
sx.text(1, 1, "TEXAS SALES TAX \u2014 for the year in Settings", "title", merge=1); sx.text(1, 3, "", "title"); sx.f(1, 3, "=TaxYear", "title"); sx.heights[1] = 28
sx.text(2, 1, "Texas taxes 80% of a software subscription (data processing) at the customer's local rate. Column D is what would be due if every customer were in Texas at the Settings rate — a check against what was actually collected in column E. File by the 20th. Other states: nothing until you pass their threshold, usually $100,000.", "note")
for c, h in enumerate(["Month", "Subscription revenue", "Taxable part", "Tax at Settings rate", "Tax collected", "Tax remitted", "Owed (running)"], start=1): sx.text(4, c, h, "head")
sx.heights[4] = 34
X0, X1 = 5, 16
sx.f(X0, 1, f"=ARRAYFORMULA(EDATE({YR0},SEQUENCE(12,1,0)))")
MX = f"$A${X0}:$A${X1}"
sx.f(X0, 2, f"=ARRAYFORMULA(SUMIF({TxKey},{keyof(chr(34) + 'Trainer subscriptions' + chr(34))}+{MX},{TxNet})+SUMIF({TxKey},{keyof(chr(34) + 'Individual subscriptions' + chr(34))}+{MX},{TxNet})+SUMIF({TxKey},{keyof(chr(34) + 'Refunds to customers' + chr(34))}+{MX},{TxNet}))")
sx.f(X0, 3, f"=ARRAYFORMULA(B{X0}:B{X1}*TaxablePortion)")
sx.f(X0, 4, f"=ARRAYFORMULA(ROUND(C{X0}:C{X1}*SalesTaxRate,2))")
sx.f(X0, 5, cat_months("Sales tax collected", MX))
sx.f(X0, 6, cat_months("Sales tax remitted to Texas", MX, "-"))
sx.text(3, 7, "Owed at start of year", "tot"); sx.f(3, 8, f"={net_before('Sales tax collected', YR0)}+{net_before('Sales tax remitted to Texas', YR0)}", "cur")
sx.f(X0, 7, f"=SCAN($H$3,ARRAYFORMULA(E{X0}:E{X1}-F{X0}:F{X1}),LAMBDA(a,x,a+x))")
sx.text(X0 + 12, 1, "Year", "tot")
for c in range(2, 7): sx.f(X0 + 12, c, f"=SUM({col(c)}{X0}:{col(c)}{X1})", "curb")

# ======================================================================= 1099s
nn = new("Form1099", {1: 200, 2: 95, 3: 95, 4: 80, 5: 80, 6: 400}, freeze=4, colstyles={2: "cur"})
nn.text(1, 1, "1099-NEC TRACKER \u2014 for the year in Settings", "title"); nn.f(1, 2, "=TaxYear", "title"); nn.text(1, 3, "", "title"); nn.heights[1] = 28
nn.text(2, 1, "Type each contractor's name in column A exactly as it appears in the Ledger's Payee column. Column B totals what they were paid this year in the categories marked Yes. Get a W-9 before the first payment. Corporations are exempt; attorneys are not. Due 31 January.", "note")
for c, h in enumerate(["Contractor (payee)", "Paid this year", "1099 needed?", "W-9 on file?", "Corporation?", "Notes / address (never type the TIN here)"], start=1): nn.text(4, c, h, "headl" if c in (1, 6) else "head")
nn.heights[4] = 34
N0, N1 = 5, 16
nn.text(N0, 1, "(type the developer's name here)", "in")
for rr in range(N0, N1 + 1):
    for cc in (4, 5, 6): nn.text(rr, cc, "", "in")
    if rr > N0: nn.text(rr, 1, "", "in")
nn.f(N0, 2, f"=ARRAYFORMULA(IF($A${N0}:$A${N1}=\"\",\"\",SUMIF({TxPayee},$A${N0}:$A${N1},{TxNec})))")
nn.f(N0, 3, f"=ARRAYFORMULA(IF($A${N0}:$A${N1}=\"\",\"\",IF(($B${N0}:$B${N1}>=Threshold1099)*($E${N0}:$E${N1}<>\"Yes\"),\"YES, send one\",\"no\")))")
nn.validations.append((f"R{N0}C4:R{N1}C5", '"Yes,No"'))

# ======================================================================= Tax Summary
ts = new("TaxSummary", {1: 360, 2: 110, 3: 110, 4: 420}, colstyles={2: "cur", 3: "cur"})
ts.text(1, 1, "TAX SUMMARY \u2014 the numbers to hand the Form 1065 preparer", "title"); ts.f(1, 2, "=TaxYear", "title"); ts.text(1, 3, "", "title"); ts.text(1, 4, "", "title"); ts.heights[1] = 28
ts.text(2, 1, "Worked out from the Ledger on a cash basis, for a two-member LLC taxed as a partnership. A CPA signs off the return.", "note")
def line(prefix, sign): return f"={sign}SUMIFS({TxNet},{TxLine},\"{prefix}*\",{TxDate},\">=\"&{YR0},{TxDate},\"<\"&{YR1})"
r = 4
ts.banner(r, "FORM 1065 \u2014 the LLC's return; it pays no tax itself", 4)
r += 1; first = r
for label, pref, sign, note in [
    ("Line 1a Gross receipts", "1a", "", "Trainer and individual subscriptions, before Stripe fees."),
    ("Line 1b Returns and allowances", "1b", "-", "Refunds to customers."),
    ("Line 7 Other income", "7 ", "", ""),
    ("Line 10 Guaranteed payments to partners", "10", "-", "Dustin's fixed pay, if any."),
    ("Line 14 Taxes and licenses", "14", "-", "Franchise/PIR filing, licences. Not sales tax, not income tax."),
    ("Line 15 Interest", "15", "-", "Interest paid to Lauren."),
    ("Line 20 Other deductions (every other expense category)", "20", "-", "Attach a statement listing them by category from the Profit & Loss tab."),
]:
    ts.text(r, 1, label, "lab"); ts.f(r, 2, line(pref, sign), "cur"); ts.text(r, 4, note, "note"); r += 1
meals = r
ts.text(r, 1, "Less the non-deductible half of meals", "lab"); ts.f(r, 2, "=0.5*" + net_between("Meals", YR0, YR1), "cur"); ts.text(r, 4, "Meals sit in line 20 at 100%; only half is deductible, so this is negative.", "note"); r += 1
ts.text(r, 1, "Line 22 Ordinary business income (loss)", "tot")
ts.f(r, 2, f"=B{first}-B{first+1}+B{first+2}-SUM(B{first+3}:B{first+6})+B{meals}", "keyb")
ts.text(r, 4, "Goes to each K-1 box 1 in the ownership split below. A loss in the launch years is normal and flows to the members' personal returns.", "note"); obi = r; r += 2
ts.banner(r, "SCHEDULE K-1 SPLIT", 4); r += 1
ts.text(r, 1, "", "headl"); ts.text(r, 2, "Dustin", "head"); ts.text(r, 3, "Lauren", "head"); ts.text(r, 4, "", "headl"); r += 1
ts.text(r, 1, "Box 1 Ordinary business income (loss)"); ts.f(r, 2, f"=B{obi}*PctDustin"); ts.f(r, 3, f"=B{obi}*PctLauren"); k1 = r; r += 1
ts.text(r, 1, "Box 4 Guaranteed payments"); ts.f(r, 2, f"=B{first+3}"); ts.put(r, 3, 0); k4 = r; r += 1
ts.text(r, 1, "Box 19 Distributions"); ts.f(r, 2, "=-Owners!$B$9"); ts.f(r, 3, "=-Owners!$C$9"); r += 1
ts.text(r, 1, "Rough self-employment tax (15.3% of 92.35% of boxes 1 + 4)"); ts.f(r, 2, f"=MAX(0,ROUND((B{k1}+B{k4})*0.9235*0.153,0))")
ts.text(r, 4, "Dustin works in the business, so his share is self-employment income. Lauren is a passive investor; her share is usually not subject to SE tax. Income tax on top depends on each member's own return.", "note"); r += 1
ts.text(r, 1, "Set aside for quarterly estimates (rule of thumb: 30% Dustin, 25% Lauren)"); ts.f(r, 2, f"=MAX(0,ROUND((B{k1}+B{k4})*0.3,0))"); ts.f(r, 3, f"=MAX(0,ROUND(C{k1}*0.25,0))"); r += 2
ts.banner(r, "TEXAS", 4)
r += 1
ts.text(r, 1, "Total revenue for franchise tax"); ts.f(r, 2, f"=B{first}-B{first+1}+B{first+2}"); tr = r; r += 1
ts.text(r, 1, "Franchise tax due?"); ts.f(r, 2, f"=IF(B{tr}<2650000,\"No tax; file the Public Information Report by 15 May\",\"Above the no-tax-due threshold: CPA prepares the franchise return\")", "def"); r += 1
ts.text(r, 1, "Sales tax collected this year"); ts.f(r, 2, "=" + net_between("Sales tax collected", YR0, YR1)); r += 1
ts.text(r, 1, "Sales tax remitted this year"); ts.f(r, 2, "=-" + net_between("Sales tax remitted to Texas", YR0, YR1)); r += 1
ts.text(r, 1, "Still owed to Texas at year end"); ts.f(r, 2, f"=SalesTax!$G${X1}"); r += 2
ts.banner(r, "OTHER", 4)
r += 1
ts.text(r, 1, "1099-NECs to send by 31 January"); ts.f(r, 2, f"=COUNTIF(Form1099!$C${N0}:$C${N1},\"YES*\")", "int"); r += 1
ts.text(r, 1, "Software development paid this year (§174A, deductible in full)"); ts.f(r, 2, "=-" + net_between("Developer (contractor)", YR0, YR1))
ts.text(r, 4, "Domestic software development is expensed in the year paid for tax years after 2024 (One Big Beautiful Bill Act). Tell the CPA the developer is building the product.", "note"); r += 1
ts.text(r, 1, "Startup costs before launch (§195)"); ts.f(r, 2, "=-" + net_between("Startup costs (before launch)", YR0, YR1))
ts.text(r, 4, "Up to $50,000 deductible in the year the business opens (launch, March 2027); the rest over 15 years. 2026 costs are claimed on the 2027 return, so keep them here.", "note"); r += 1
ts.text(r, 1, "Interest paid to Lauren (she reports it as interest income; 1099-INT if $600 or more)"); ts.f(r, 2, "=-" + net_between("Loan interest", YR0, YR1)); r += 1

# ======================================================================= Plan
pn = new("Plan", {1: 200, **{c: 62 for c in range(2, 26)}, 26: 110}, freeze=2, colstyles={c: "int" for c in range(2, 27)})
pn.text(1, 1, "PLAN \u2014 the investor proposal's monthly budget; edit freely, ProfitLoss compares actuals to it", "title", merge=25); pn.heights[1] = 28
months = [datetime.date(2027, 1, 1)]
while len(months) < 24:
    m = months[-1]; months.append(datetime.date(m.year + (m.month == 12), m.month % 12 + 1, 1))
pn.text(2, 1, "Category", "headl"); pn.heights[2] = 26
pn.f(2, 2, "=ARRAYFORMULA(EDATE(DATE(2027,1,1),SEQUENCE(1,24,0)))", "mon")
for c in range(3, 26): pn.put(2, c, "", "mon")
launch, devdrop, after = datetime.date(2027, 3, 1), datetime.date(2027, 4, 1), datetime.date(2027, 9, 1)
trainers = indiv = 0.0
plan = {k: [] for k in ["Trainer subscriptions", "Individual subscriptions", "Developer (contractor)", "Marketing and advertising", "Hosting, AI and software tools",
                        "Legal and professional", "Payment processing fees", "Startup costs (before launch)"]}
for m in months:
    since = 0 if m < launch else (m.year - launch.year) * 12 + m.month - launch.month + 1
    ramp = 0.6 if since == 1 else 0.85 if since == 2 else 1
    mkt = 12000 if m < launch else 20000
    if since:
        trainers = trainers * (1 - 0.055) + mkt / 800 * ramp
        indiv = indiv * 0.9 + 15 * mkt / 20000 * ramp
    rt, ri = round(trainers * 115), round(indiv * 49)
    plan["Trainer subscriptions"].append(rt); plan["Individual subscriptions"].append(ri)
    plan["Developer (contractor)"].append(10000 if m < devdrop else 7000); plan["Marketing and advertising"].append(mkt)
    plan["Hosting, AI and software tools"].append((500 if m < launch else 2000 if m < after else 3000) + 300)
    plan["Legal and professional"].append(1500); plan["Payment processing fees"].append(round((rt + ri) * 0.03))
    plan["Startup costs (before launch)"].append(8000 if m == months[0] else 0)
pn.text(2, 26, "Total for the Settings year", "head")
H = "$B$2:$Y$2"
step = {"Developer (contractor)": f"=ARRAYFORMULA(IF({H}<DATE(2027,4,1),10000,7000))",
        "Marketing and advertising": f"=ARRAYFORMULA(IF({H}<DATE(2027,3,1),12000,20000))",
        "Hosting, AI and software tools": f"=ARRAYFORMULA(300+IF({H}<DATE(2027,3,1),500,IF({H}<DATE(2027,9,1),2000,3000)))",
        "Legal and professional": f"=ARRAYFORMULA(IF({H}>0,1500,0))",
        "Startup costs (before launch)": f"=ARRAYFORMULA(IF({H}=DATE(2027,1,1),8000,0))"}
for i, (k, vals) in enumerate(plan.items()):
    pn.text(3 + i, 1, k)
    if k in step: pn.f(3 + i, 2, step[k])
    else:
        for j, v in enumerate(vals): pn.put(3 + i, 2 + j, v)
    pn.f(3 + i, 26, f"=SUMPRODUCT(($B$2:$Y$2>={YR0})*($B$2:$Y$2<{YR1})*B{3 + i}:Y{3 + i})", "int")
pn.text(3 + len(plan) + 1, 1, "Proposal base case: developer $10k then $7k from April 2027; marketing $12k pre-launch, $20k after; hosting $500 / $2k / $3k plus $300 tools; legal $1.5k; setup $8k in Jan 2027; $800 per trainer won; 5.5% monthly churn; 15 individuals a month at full spend; $115 and $49 average; 3% processing. Loan interest depends on the draws.", "note")

# ======================================================================= write
def subst_names(fx):
    for nm, ref_ in names.items(): fx = re.sub(rf"(?<![A-Za-z0-9_'])({nm})(?![A-Za-z0-9_(])", ref_, fx)
    return fx
for s in sheets:
    for k, (v, sty) in list(s.cells.items()):
        if isinstance(v, tuple) and v[0] == "f": s.cells[k] = (("f", subst_names(v[1])), sty)

def _st(sid, font="", fill="", align="", border="", numfmt=""):
    return f'<Style ss:ID="{sid}">{font}{align}{border}{fill}{numfmt}</Style>'

F = lambda **k: "<Font ss:FontName=\"Arial\"" + "".join(f' ss:{a}="{v}"' for a, v in k.items()) + "/>"
FILL = lambda c: f'<Interior ss:Color="{c}" ss:Pattern="Solid"/>'
AL = lambda **k: "<Alignment" + "".join(f' ss:{a}="{v}"' for a, v in k.items()) + "/>"
def BOX(*sides, color="#D9D6CD", weight=1):
    # Short form: LineStyle defaults to Continuous and Weight to 1 in the importer.
    body = "".join(f'<Border ss:Position="{p}" ss:LineStyle="Continuous"' +
                   (f' ss:Weight="{weight}"' if weight != 1 else "") +
                   (f' ss:Color="{color}"' if color != "#D9D6CD" else "") + "/>" for p in sides)
    return "<Borders>" + body + "</Borders>"
NF = lambda f: f'<NumberFormat ss:Format="{f}"/>'

# Palette, the same one the proposal and the business plan use.
NAVY, GOLD, CREAM, PAPER, GREY, LINE = "#0C2A47", "#C69E3C", "#F3F1EA", "#FFF8E7", "#5B6470", "#D9D6CD"
MONEY = "&quot;$&quot;#,##0.00;[Red]\\(&quot;$&quot;#,##0.00\\)"

STYLES = "<Styles>" + "".join([
    _st("Default", F(Size=10), align=AL(Vertical="Top")).replace('ss:ID="Default"', 'ss:ID="Default" ss:Name="Normal"'),
    # text
    _st("b", F(Size=10, Bold=1)),
    _st("def", F(Size=10)),
    _st("title", F(Size=14, Bold=1, Color="#FFFFFF"), FILL(NAVY), AL(Vertical="Center", WrapText="1")),
    _st("sub", F(Size=10, Italic=1, Color="#FFFFFF"), FILL(NAVY), AL(Vertical="Center", WrapText="1")),
    _st("bn", F(Size=11, Bold=1, Color=NAVY), FILL(GOLD), AL(Vertical="Center"), BOX("Top", "Bottom", color=NAVY)),
    _st("note", F(Size=9, Italic=1, Color=GREY), align=AL(Vertical="Top", WrapText="1")),
    _st("wrap", F(Size=10), align=AL(Vertical="Top", WrapText="1")),
    _st("lab", F(Size=10), align=AL(Vertical="Center", WrapText="1")),
    # column headers
    _st("head", F(Size=10, Bold=1, Color="#FFFFFF"), FILL(NAVY), AL(Horizontal="Center", Vertical="Center", WrapText="1")),
    _st("headl", F(Size=10, Bold=1, Color="#FFFFFF"), FILL(NAVY), AL(Horizontal="Left", Vertical="Center", WrapText="1")),
    _st("mon", F(Size=10, Bold=1, Color="#FFFFFF"), FILL(NAVY), AL(Horizontal="Center", Vertical="Center"), numfmt=NF("mmm yyyy")),
    # cells the user types in
    _st("in", border=BOX("Right", "Bottom"), fill=FILL(PAPER)),
    _st("incur", border=BOX("Right", "Bottom"), fill=FILL(PAPER), numfmt=NF(MONEY)),
    _st("indate", border=BOX("Right", "Bottom"), fill=FILL(PAPER), numfmt=NF("m/d/yyyy")),
    _st("inpct", border=BOX("Right", "Bottom"), fill=FILL(PAPER), numfmt=NF("0.00%")),
    _st("inint", border=BOX("Right", "Bottom"), fill=FILL(PAPER), numfmt=NF("#,##0")),
    # cells the sheet fills in
    _st("auto", F(Size=9, Color=GREY), FILL("#F0F0F0")),
    _st("autocur", F(Size=9, Color=GREY), FILL("#F0F0F0"), numfmt=NF(MONEY)),
    _st("automon", F(Size=9, Color=GREY), FILL("#F0F0F0"), numfmt=NF("mmm yyyy")),
    # calculated values
    _st("cur", numfmt=NF(MONEY)),
    _st("pct", numfmt=NF("0.00%")),
    _st("int", numfmt=NF("#,##0")),
    _st("date", numfmt=NF("m/d/yyyy")),
    # totals and checks
    _st("tot", F(Size=10, Bold=1, Color=NAVY), FILL(CREAM), AL(Vertical="Center"), BOX("Top", color=NAVY, weight=2)),
    _st("curb", F(Size=10, Bold=1, Color=NAVY), FILL(CREAM), AL(Vertical="Center"), BOX("Top", color=NAVY, weight=2), NF(MONEY)),
    _st("pctb", F(Size=10, Bold=1, Color=NAVY), FILL(CREAM), AL(Vertical="Center"), BOX("Top", color=NAVY, weight=2), NF("0.00%")),
    _st("intb", F(Size=10, Bold=1, Color=NAVY), FILL(CREAM), AL(Vertical="Center"), BOX("Top", color=NAVY, weight=2), NF("#,##0")),
    _st("keyb", F(Size=10, Bold=1, Color=NAVY), FILL(CREAM), AL(Vertical="Center"), BOX("Top", "Right", "Bottom", "Left", color=GOLD, weight=2), NF(MONEY)),
]) + "</Styles>"

doc = ['<?xml version="1.0"?>', '<?mso-application progid="Excel.Sheet"?>',
       '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:x="urn:schemas-microsoft-com:office:excel">', STYLES]
import os
keep = os.environ.get("SHEETS")
doc += [s.xml() for s in sheets if not keep or s.name in keep.split(",")]
doc.append("</Workbook>")
data = "\n".join(doc)
open(OUT, "w", encoding="utf-8").write(data)
print("written", OUT, len(data.encode()), "bytes;", [s.name for s in sheets])
