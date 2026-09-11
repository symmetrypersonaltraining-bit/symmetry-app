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
every formula cell needs <Data ss:Type="Number">0</Data> (without it the cell,
and cells after it, are dropped; an empty String Data does the same);
ss:Index is ignored on Row, Cell and Column, so gaps are written as explicit
empty elements; a DataValidation range past row 1000 makes the whole
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
    def put(self, r, c, v, s=None):
        if isinstance(c, str): c = colnum(c)
        self.cells[(r, c)] = (v, s)
    def text(self, r, c, v, s=None): self.put(r, c, str(v), s)
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
            o.append("<Row>")
            last = 0
            for c, (v, s) in sorted(rows[r]):
                o.append("<Cell/>" * (c - last - 1))
                a = f' ss:StyleID="{s}"' if s else ""
                last = c
                if isinstance(v, tuple) and v[0] == "f":
                    fx = escape(to_r1c1(v[1], r, c), {'"': "&quot;"})
                    o.append(f'<Cell{a} ss:Formula="{fx}"><Data ss:Type="Number">0</Data></Cell>')
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
def T(c): return f"{TX}!${c}$2:${c}${NTX}"
TxDate, TxPayee, TxCat, TxIn, TxOut, TxAcct, TxMonth, TxNet, TxKey, TxType, TxLine, Tx1099, TxNec = (T(c) for c in "ABDEFGJKMNOPQ")
CATS = f"{CAT}!$A$3:$A$60"
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
st.text(1, 1, "Symmetry App LLC: the books", "title")
st.text(2, 1, "One workbook for everything that comes in and goes out. You type on the Ledger tab only; every other tab is worked out from it. Built 11 Sep 2026 from the investor proposal. The tax notes are a guide for a two-member Texas LLC taxed as a partnership; have a CPA check the first return.", "wrap")
st.text(4, 1, "SETTINGS (change these here only)", "head"); st.text(4, 2, "", "head"); st.text(4, 3, "", "head")
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
    st.text(r, 1, label); st.put(r, 2, val, sty); st.text(r, 3, note, "note")
    names[nm] = f"{SET}{r}"
r = 5 + len(settings) + 1
for txt, sty in [
    ("HOW TO DO THE BOOKS (about an hour a month)", "head"),
    ("1. Every time money moves, add one line on the Ledger: date, who, what for, category from the dropdown, amount in OR out, and which account it moved through. Loan draws, loan payments, money you take out, sales tax: all of it goes in the same list. Columns J to Q fill themselves; do not type there. The dropdowns cover the first 1,000 lines; after that, copy a filled cell down or just type the category exactly.", "wrap"),
    ("2. A loan payment is two lines: the interest part (category Loan interest) and the principal part (Loan principal repayment). The Loan tab shows how much interest has built up.", "wrap"),
    ("3. Stripe: record customer charges as Trainer subscriptions or Individual subscriptions in the Stripe account, Stripe's fee as Payment processing fees, and the payout to the bank as Transfer between accounts (one line out of Stripe, one line into Bank).", "wrap"),
    ("4. Month end: check that the Balance Sheet cash for each account equals the bank, Stripe and card statements. If it does not, a line is missing or wrong. Then read the Profit & Loss for the month.", "wrap"),
    ("5. Keep the receipt: paste a Drive link or the email subject in the Receipt column. The IRS wants a receipt for anything over $75 and for every meal.", "wrap"),
    ("6. Never delete a line to fix a mistake; add a reversing line so the history stays honest. If a category shows NOT A CATEGORY in column N, the spelling does not match the Categories tab.", "wrap"),
    ("", None),
    ("TAX CALENDAR (dates fall in the year after the one being reported)", "head"),
    ("15 Jan: last quarterly estimated tax payment for the members. Dustin and Lauren pay income tax personally on their share; the LLC itself pays none.", "wrap"),
    ("31 Jan: 1099-NEC to every contractor the Form1099 tab marks YES, and a copy to the IRS.", "wrap"),
    ("20th of each month (or quarter, as the Comptroller assigns): Texas sales tax return and payment. Register at comptroller.texas.gov before the first Texas sale.", "wrap"),
    ("15 Mar: Form 1065 partnership return with a Schedule K-1 for each member. Late penalty $255 per member per month. Extension to 15 Sep with Form 7004.", "wrap"),
    ("15 Apr: members' personal returns (Form 1040 with Schedule E and Schedule SE) and the Q1 estimate. 15 Jun: Q2 estimate. 15 Sep: Q3 estimate.", "wrap"),
    ("15 May: Texas franchise tax. Under $2.65M of revenue nothing is owed, but the Public Information Report must still be filed or the LLC loses good standing.", "wrap"),
    ("", None),
    ("WHAT THE TABS ARE", "head"),
    ("Ledger: the only tab you type on. Categories: the dropdown list, with the tax line each one lands on. Profit & Loss: month by month for the year in Settings, against the proposal's plan. Balance Sheet: cash, what is owed and members' equity at year end, with a check that the books balance. Loan: draws, interest built up, payments and balance by month. Owners: contributions, distributions and each member's share of profit for the K-1s. Sales Tax: what Texas is owed each month. Form1099: contractor totals against the threshold. Tax Summary: the numbers the Form 1065 preparer needs and a rough idea of the members' own tax. Plan: the proposal's monthly budget, editable.", "wrap"),
]:
    if txt: st.text(r, 1, txt, sty)
    r += 1

# ======================================================================= Categories
ca = new(CAT, {1: 200, 2: 70, 3: 210, 4: 45, 5: 520}, freeze=2)
ca.text(1, 1, "Categories: the dropdown on the Ledger. Add a row to add a category (keep it inside rows 3 to 60). Type decides where it lands: Income and Expense make profit; Loan, Owner, Tax and Transfer are cash moves that are not profit.", "wrap")
for c, h in enumerate(["Category", "Type", "Form 1065 line", "1099?", "What goes here"], start=1): ca.text(2, c, h, "head")
cats = [
    ("Trainer subscriptions", "Income", "1a Gross receipts", "", "Monthly trainer plans ($79 + $15 per 5 clients, cap $199). Record the gross charge; Stripe's fee goes on its own line."),
    ("Individual subscriptions", "Income", "1a Gross receipts", "", "Individual users at $49 a month."),
    ("Other income", "Income", "7 Other income", "", "Anything else earned: setup fees, bank interest, referral income."),
    ("Refunds to customers", "Income", "1b Returns and allowances", "", "Money returned to a customer. Enter it as money OUT under this category."),
    ("Developer (contractor)", "Expense", "20 Other deductions (software development §174A)", "Yes", "The contract developer. Domestic software development cost is deductible in the year paid for tax years after 2024."),
    ("Marketing and advertising", "Expense", "20 Other deductions", "Yes", "Ads, content, the marketing lead. The Yes only matters when paid to a person or LLC, not to a corporation or an ad platform."),
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
    ("Startup costs (before launch)", "Expense", "20 Other deductions (§195 election)", "", "Getting-ready costs before the first sale that are not development or marketing: formation, market research. Up to $50,000 deductible in the first year of business."),
    ("Guaranteed payment to Dustin", "Expense", "10 Guaranteed payments", "", "A fixed monthly amount Dustin pays himself for work, if any. Deductible to the LLC, taxable to Dustin, subject to self-employment tax."),
    ("Other expense", "Expense", "20 Other deductions", "", "Anything that does not fit; add a category if it repeats."),
    ("Loan draw from Lauren", "Loan", "not on P&L (balance sheet)", "", "Money IN when a draw on the facility lands in the bank."),
    ("Loan principal repayment", "Loan", "not on P&L (balance sheet)", "", "The principal part of a payment to Lauren, money OUT."),
    ("Member contribution: Dustin", "Owner", "K-1 capital account", "", "Money Dustin puts in. Money IN."),
    ("Member contribution: Lauren", "Owner", "K-1 capital account", "", "Money Lauren puts in as a member (not the loan). Money IN."),
    ("Member distribution: Dustin", "Owner", "K-1 box 19 distributions", "", "Profit paid out to Dustin, money OUT. Not an expense. Personal tax paid from the business account is a distribution."),
    ("Member distribution: Lauren", "Owner", "K-1 box 19 distributions", "", "Profit paid out to Lauren, money OUT (10% of whatever is distributed)."),
    ("Sales tax collected", "Tax", "not on P&L (owed to Texas)", "", "Sales tax charged to customers. Money IN. It is Texas's money, not revenue."),
    ("Sales tax remitted to Texas", "Tax", "not on P&L (owed to Texas)", "", "The sales tax return payment. Money OUT."),
    ("Transfer between accounts", "Transfer", "ignored", "", "Stripe payout to the bank, bank to card payment. Two lines: OUT of one account, IN to the other. Cancels out."),
]
for i, row in enumerate(cats):
    for c, v in enumerate(row, start=1):
        if v or c == 4: ca.text(3 + i, c, v, "note" if c == 5 else None)

# ======================================================================= Transactions
tx = new(TX, {1: 70, 2: 130, 3: 170, 4: 180, 5: 80, 6: 80, 7: 60, 8: 130, 9: 150, 10: 65, 11: 75, 12: 80, 13: 80, 14: 110, 15: 70}, freeze=1,
         colstyles={1: "date", 5: "cur", 6: "cur", 10: "mon", 11: "cur"})
for c, h in enumerate(["Date", "Payee / who", "What for", "Category (pick from list)", "Money in", "Money out", "Account", "Receipt link / ref", "Notes",
                       "Month (auto)", "Net (auto)", "Cat # (auto)", "Key (auto)", "Type (auto)", "Tax line (auto)", "1099 (auto)", "1099 this year (auto)"], start=1): tx.text(1, c, h, "head")
tx.date(2, 1, datetime.date(2026, 9, 11), "date"); tx.text(2, 2, "Example: Texas SOS"); tx.text(2, 3, "LLC filing fee (example line: overwrite it)")
tx.text(2, 4, "Startup costs (before launch)"); tx.put(2, 6, 300, "cur"); tx.text(2, 7, "Bank")
A = f"$A$2:$A${NTX}"
def auto(expr): return f"=ARRAYFORMULA(IF({A}=\"\",\"\",{expr}))"
tx.f(2, 10, auto(f"DATE(YEAR({A}),MONTH({A}),1)"))
tx.f(2, 11, auto(f"$E$2:$E${NTX}-$F$2:$F${NTX}"))
tx.f(2, 12, auto(f"IFERROR(MATCH($D$2:$D${NTX},{CATS},0),0)"))
tx.f(2, 13, auto(f"$L$2:$L${NTX}*100000+$J$2:$J${NTX}"))
tx.f(2, 14, auto(f"IFERROR(VLOOKUP($D$2:$D${NTX},{CAT}!$A$3:$B$60,2,FALSE),\"NOT A CATEGORY\")"))
tx.f(2, 15, auto(f"IFERROR(VLOOKUP($D$2:$D${NTX},{CAT}!$A$3:$C$60,3,FALSE),\"\")"))
tx.f(2, 16, auto(f"IFERROR(VLOOKUP($D$2:$D${NTX},{CAT}!$A$3:$D$60,4,FALSE),\"\")"))
tx.f(2, 17, auto(f"IF(($P$2:$P${NTX}=\"Yes\")*(YEAR({A})=TaxYear),$F$2:$F${NTX},0)"))
# Google refuses to convert a validation range past row 1000, so the dropdowns cover the first 1000 lines.
tx.validations.append(("R2C4:R1000C4", f"{CAT}!R3C1:R60C1"))
tx.validations.append(("R2C7:R1000C7", '"Bank,Stripe,Card,Cash"'))

# ======================================================================= Profit & Loss
pl = new("ProfitLoss", {1: 230, 2: 60, **{c: 78 for c in range(3, 18)}}, freeze=2, colstyles={c: "cur" for c in range(3, 18)})
pl.text(1, 1, "Profit & Loss, month by month, for the year in Settings:", "title"); pl.f(1, 3, "=TaxYear", "int")
pl.text(2, 1, "Category", "head"); pl.text(2, 2, "Type", "head")
pl.f(2, 3, f"=ARRAYFORMULA(EDATE({YR0},SEQUENCE(1,12,0)))", "mon")
for c in range(4, 15): pl.put(2, c, "", "mon")
pl.text(2, 15, "Year total", "head"); pl.text(2, 16, "Plan (proposal)", "head"); pl.text(2, 17, "Over / (under) plan", "head")
inc = [c for c in cats if c[1] == "Income"]; exp = [c for c in cats if c[1] == "Expense"]
r = 3; pl.text(r, 1, "INCOME", "b"); r += 1
inc0 = r
for cname, typ, *_ in inc: pl.text(r, 1, cname); pl.text(r, 2, typ); r += 1
inc1 = r - 1
for c in range(3, 15): pl.f(inc0, c, by_month_block(f"$A{inc0}:$A{inc1}", f"{col(c)}$2"))
pl.text(r, 1, "Total income", "b")
for c in range(3, 15): pl.f(r, c, f"=SUM({col(c)}{inc0}:{col(c)}{inc1})", "curb")
tot_inc = r; r += 2
pl.text(r, 1, "EXPENSES", "b"); r += 1
exp0 = r
for cname, typ, *_ in exp: pl.text(r, 1, cname); pl.text(r, 2, typ); r += 1
exp1 = r - 1
for c in range(3, 15): pl.f(exp0, c, by_month_block(f"$A{exp0}:$A{exp1}", f"{col(c)}$2", "-"))
pl.text(r, 1, "Total expenses", "b")
for c in range(3, 15): pl.f(r, c, f"=SUM({col(c)}{exp0}:{col(c)}{exp1})", "curb")
tot_exp = r; r += 2
pl.text(r, 1, "NET PROFIT (LOSS)", "b")
for c in range(3, 15): pl.f(r, c, f"={col(c)}{tot_inc}-{col(c)}{tot_exp}", "curb")
net = r; r += 2
pl.text(r, 1, "CASH MOVES THAT ARE NOT PROFIT (shown as positive amounts)", "b"); r += 1
below = [c[0] for c in cats if c[1] in ("Loan", "Owner", "Tax")]
b0 = r
for cname in below: pl.text(r, 1, cname); pl.text(r, 2, "in" if cname.startswith(("Loan draw", "Member contribution", "Sales tax collected")) else "out"); r += 1
b1 = r - 1
for c in range(3, 15): pl.f(b0, c, f"=ARRAYFORMULA(ABS(SUMIF({TxKey},{keyof(f'$A{b0}:$A{b1}')}+{col(c)}$2,{TxNet})))")
pl.text(r, 1, "Net change in cash (every line for the month)", "b")
for c in range(3, 15): pl.f(r, c, f"=SUMIF({TxMonth},{col(c)}$2,{TxNet})", "curb")
r += 1
pl.text(r, 1, "Cash in all accounts at month end", "b")
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
bs.text(1, 1, "Balance Sheet at 31 December of the year in Settings:", "title"); bs.f(1, 2, "=TaxYear", "int")
bs.text(2, 1, "Everything is counted from the first line ever entered up to the end of that year.", "note")
bs.text(4, 1, "ASSETS", "head"); bs.text(4, 2, "", "head")
r = 5
for a in ["Bank", "Stripe", "Card", "Cash"]:
    bs.text(r, 1, f"Cash in {a}"); bs.f(r, 2, f"=SUMIFS({TxNet},{TxAcct},\"{a}\",{TxDate},\"<\"&{YR1})", "cur")
    bs.text(r, 3, "Must match the statement. A card balance you owe shows as a negative." if a == "Card" else "Must match the statement.", "note"); r += 1
bs.text(r, 1, "Total assets", "b"); bs.f(r, 2, f"=SUM(B5:B{r-1})", "curb"); ta = r; r += 2
bs.text(r, 1, "LIABILITIES (what is owed)", "head"); bs.text(r, 2, "", "head"); r += 1
bs.text(r, 1, "Loan from Lauren: principal outstanding"); bs.f(r, 2, f"={net_before('Loan draw from Lauren', YR1)}+{net_before('Loan principal repayment', YR1)}", "cur"); lp = r; r += 1
bs.text(r, 1, "Loan interest built up and not yet paid"); bs.f(r, 2, f"=SUMIFS(Loan!$D$9:$D$71,Loan!$A$9:$A$71,\"<\"&{YR1})+{net_before('Loan interest', YR1)}", "cur")
bs.text(r, 3, "From the Loan tab: interest accrued to date less interest actually paid.", "note"); li = r; r += 1
bs.text(r, 1, "Sales tax collected and not yet remitted"); bs.f(r, 2, f"={net_before('Sales tax collected', YR1)}+{net_before('Sales tax remitted to Texas', YR1)}", "cur"); stx = r; r += 1
bs.text(r, 1, "Total liabilities", "b"); bs.f(r, 2, f"=SUM(B{lp}:B{stx})", "curb"); tl = r; r += 2
bs.text(r, 1, "MEMBERS' EQUITY", "head"); bs.text(r, 2, "", "head"); r += 1
bs.text(r, 1, "Contributions from members"); bs.f(r, 2, f"={net_before('Member contribution: Dustin', YR1)}+{net_before('Member contribution: Lauren', YR1)}", "cur"); e1 = r; r += 1
bs.text(r, 1, "Less distributions to members"); bs.f(r, 2, f"={net_before('Member distribution: Dustin', YR1)}+{net_before('Member distribution: Lauren', YR1)}", "cur"); r += 1
bs.text(r, 1, "Profit (loss) kept in the business since day one"); bs.f(r, 2, "=" + profit(EPOCH, YR1), "cur"); e3 = r; r += 1
bs.text(r, 1, "Total members' equity", "b"); bs.f(r, 2, f"=SUM(B{e1}:B{e3})", "curb"); te = r; r += 2
bs.text(r, 1, "CHECK: assets less loan principal, sales tax owed and equity (should be 0)", "b")
bs.f(r, 2, f"=ROUND(B{ta}-B{lp}-B{stx}-B{te},2)", "curb")
bs.text(r, 3, "Not zero means a Transfer line is missing its other half, or a line has both an in and an out. Unpaid loan interest is left out on purpose: cash basis.", "note")
bs.text(r + 2, 1, "Cash basis: income counts when it lands, costs when they are paid. That is what a small LLC files on. This is Schedule L of Form 1065 (only required above $1M of assets, but keep it anyway).", "note")

# ======================================================================= Loan
ln = new("Loan", {1: 70, **{c: 88 for c in range(2, 10)}}, freeze=8, colstyles={1: "mon", **{c: "cur" for c in range(2, 10)}})
ln.text(1, 1, "Loan from Lauren: the register, worked out from the lines on the Ledger", "title")
for i, (label, fx) in enumerate([
    ("Principal drawn to date", f"=SUMIF({TxCat},\"Loan draw from Lauren\",{TxNet})"),
    ("Principal repaid to date", f"=-SUMIF({TxCat},\"Loan principal repayment\",{TxNet})"),
    ("Principal outstanding", "=C2-C3"),
    ("Interest paid to Lauren to date", f"=-SUMIF({TxCat},\"Loan interest\",{TxNet})"),
    ("Facility still available", "=Facility-C2")]):
    ln.text(2 + i, 1, label); ln.f(2 + i, 3, fx, "curb")
ln.text(2, 5, "Interest builds at the Settings rate / 12 on the principal outstanding at the start of each month. Payments start once monthly revenue covers running costs (proposal §3); until then interest builds up in column G. When you pay, enter the interest part as Loan interest and the rest as Loan principal repayment.", "note")
for c, h in enumerate(["Month", "Opening principal", "Draws", "Interest for the month", "Interest paid", "Principal repaid", "Interest unpaid (running)", "Closing principal", "Owed in total"], start=1): ln.text(8, c, h, "head")
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
ow.text(1, 1, "Members' capital (what goes on each Schedule K-1) for the year in Settings:", "title"); ow.f(1, 2, "=TaxYear", "int")
for c, h in enumerate(["", "Dustin", "Lauren", "Total", ""], start=1): ow.text(3, c, h, "head")
ow.text(4, 1, "Membership interest"); ow.f(4, 2, "=PctDustin", "pct"); ow.f(4, 3, "=PctLauren", "pct"); ow.f(4, 4, "=B4+C4", "pct")
ow.text(5, 1, "Capital account at start of year")
ow.f(5, 2, f"={net_before('Member contribution: Dustin', YR0)}+{net_before('Member distribution: Dustin', YR0)}+PctDustin*{profit(EPOCH, YR0)}")
ow.f(5, 3, f"={net_before('Member contribution: Lauren', YR0)}+{net_before('Member distribution: Lauren', YR0)}+PctLauren*{profit(EPOCH, YR0)}")
ow.text(6, 1, "Contributions this year"); ow.f(6, 2, "=" + net_between("Member contribution: Dustin", YR0, YR1)); ow.f(6, 3, "=" + net_between("Member contribution: Lauren", YR0, YR1))
ow.text(7, 1, "Share of net profit (loss) this year"); ow.f(7, 2, f"=PctDustin*ProfitLoss!$O${net}"); ow.f(7, 3, f"=PctLauren*ProfitLoss!$O${net}")
ow.text(7, 5, "K-1 box 1, split on the percentages, after guaranteed payments. The operating agreement can change the split; tell the CPA if it does.", "note")
ow.text(8, 1, "Guaranteed payments received"); ow.f(8, 2, "=-" + net_between("Guaranteed payment to Dustin", YR0, YR1)); ow.put(8, 3, 0)
ow.text(8, 5, "K-1 box 4. Already deducted in the P&L, so not part of the profit share.", "note")
ow.text(9, 1, "Distributions this year (negative)"); ow.f(9, 2, "=" + net_between("Member distribution: Dustin", YR0, YR1)); ow.f(9, 3, "=" + net_between("Member distribution: Lauren", YR0, YR1))
ow.text(9, 5, "K-1 box 19. Distributions are not taxed again; the profit share was.", "note")
ow.text(10, 1, "Capital account at end of year", "b"); ow.f(10, 2, "=B5+B6+B7+B9", "curb"); ow.f(10, 3, "=C5+C6+C7+C9", "curb")
for x in range(5, 11): ow.f(x, 4, f"=B{x}+C{x}", "curb" if x == 10 else None)
for c in range(1, 6): ow.text(12, c, "Distribution check (today)" if c == 1 else "", "head")
ow.text(13, 1, "Cash in all accounts today"); ow.f(13, 2, f"=SUMIF({TxDate},\"<=\"&TODAY(),{TxNet})")
ow.text(14, 1, "Less reserve and unremitted sales tax"); ow.f(14, 2, f"=-(Reserve+BalanceSheet!$B${stx})")
ow.text(15, 1, "Available to distribute"); ow.f(15, 2, "=MAX(0,B13+B14)", "curb")
ow.text(16, 1, "Of which Dustin / Lauren"); ow.f(16, 2, "=B15*PctDustin"); ow.f(16, 3, "=B15*PctLauren")
ow.text(17, 1, "Lauren's share of everything distributed so far (should read 10%)")
ow.f(17, 3, f"=IFERROR(SUMIF({TxCat},\"Member distribution: Lauren\",{TxNet})/(SUMIF({TxCat},\"Member distribution: Lauren\",{TxNet})+SUMIF({TxCat},\"Member distribution: Dustin\",{TxNet})),0)", "pct")
ow.text(17, 5, "Proposal §3: distributions only above the reserve and always in the 90/10 split.", "note")

# ======================================================================= Sales Tax
sx = new("SalesTax", {1: 70, **{c: 95 for c in range(2, 8)}, 8: 420}, freeze=4, colstyles={1: "mon", **{c: "cur" for c in range(2, 8)}})
sx.text(1, 1, "Texas sales tax for the year in Settings:", "title"); sx.f(1, 3, "=TaxYear", "int")
sx.text(2, 1, "Texas taxes 80% of a software subscription (data processing) at the customer's local rate. Column D is what would be due if every customer were in Texas at the Settings rate: a sanity check against what Stripe Tax (or you) actually collected in column E. File and pay by the 20th on the schedule the Comptroller assigns. Customers in other states: nothing until you pass that state's threshold, usually $100,000 of sales there.", "note")
for c, h in enumerate(["Month", "Subscription revenue", "Taxable part", "Tax at Settings rate", "Tax collected", "Tax remitted", "Owed (running)"], start=1): sx.text(4, c, h, "head")
X0, X1 = 5, 16
sx.f(X0, 1, f"=ARRAYFORMULA(EDATE({YR0},SEQUENCE(12,1,0)))")
MX = f"$A${X0}:$A${X1}"
sx.f(X0, 2, f"=ARRAYFORMULA(SUMIF({TxKey},{keyof(chr(34) + 'Trainer subscriptions' + chr(34))}+{MX},{TxNet})+SUMIF({TxKey},{keyof(chr(34) + 'Individual subscriptions' + chr(34))}+{MX},{TxNet})+SUMIF({TxKey},{keyof(chr(34) + 'Refunds to customers' + chr(34))}+{MX},{TxNet}))")
sx.f(X0, 3, f"=ARRAYFORMULA(B{X0}:B{X1}*TaxablePortion)")
sx.f(X0, 4, f"=ARRAYFORMULA(ROUND(C{X0}:C{X1}*SalesTaxRate,2))")
sx.f(X0, 5, cat_months("Sales tax collected", MX))
sx.f(X0, 6, cat_months("Sales tax remitted to Texas", MX, "-"))
sx.text(3, 7, "Owed at start of year", "b"); sx.f(3, 8, f"={net_before('Sales tax collected', YR0)}+{net_before('Sales tax remitted to Texas', YR0)}", "cur")
sx.f(X0, 7, f"=SCAN($H$3,ARRAYFORMULA(E{X0}:E{X1}-F{X0}:F{X1}),LAMBDA(a,x,a+x))")
sx.text(X0 + 12, 1, "Year", "b")
for c in range(2, 7): sx.f(X0 + 12, c, f"=SUM({col(c)}{X0}:{col(c)}{X1})", "curb")

# ======================================================================= 1099s
nn = new("Form1099", {1: 200, 2: 95, 3: 95, 4: 80, 5: 80, 6: 400}, freeze=4, colstyles={2: "cur"})
nn.text(1, 1, "1099-NEC tracker for the year in Settings:", "title"); nn.f(1, 2, "=TaxYear", "int")
nn.text(2, 1, "Type each contractor's name in column A exactly as it appears in the Payee column on the Ledger. Column B adds up what was paid to them this year in the categories marked Yes on Categories. Collect a W-9 before the first payment. Corporations are exempt (attorneys are not). Due to the contractor and the IRS by 31 January.", "note")
for c, h in enumerate(["Contractor (payee)", "Paid this year", "1099 needed?", "W-9 on file?", "Corporation?", "Notes / address (never type the TIN here)"], start=1): nn.text(4, c, h, "head")
N0, N1 = 5, 16
nn.text(N0, 1, "(type the developer's name here)")
nn.f(N0, 2, f"=ARRAYFORMULA(IF($A${N0}:$A${N1}=\"\",\"\",SUMIF({TxPayee},$A${N0}:$A${N1},{TxNec})))")
nn.f(N0, 3, f"=ARRAYFORMULA(IF($A${N0}:$A${N1}=\"\",\"\",IF(($B${N0}:$B${N1}>=Threshold1099)*($E${N0}:$E${N1}<>\"Yes\"),\"YES, send one\",\"no\")))")
nn.validations.append((f"R{N0}C4:R{N1}C5", '"Yes,No"'))

# ======================================================================= Tax Summary
ts = new("TaxSummary", {1: 360, 2: 110, 3: 110, 4: 420}, colstyles={2: "cur", 3: "cur"})
ts.text(1, 1, "Tax summary: the numbers to hand the Form 1065 preparer, for the year in Settings:", "title"); ts.f(1, 2, "=TaxYear", "int")
ts.text(2, 1, "Worked out from the Ledger on a cash basis, for a two-member LLC taxed as a partnership. A CPA signs off the return.", "note")
def line(prefix, sign): return f"={sign}SUMIFS({TxNet},{TxLine},\"{prefix}*\",{TxDate},\">=\"&{YR0},{TxDate},\"<\"&{YR1})"
r = 4
for c in range(1, 5): ts.text(r, c, "FORM 1065 (the LLC's return; it pays no tax itself)" if c == 1 else "", "head")
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
    ts.text(r, 1, label); ts.f(r, 2, line(pref, sign)); ts.text(r, 4, note, "note"); r += 1
meals = r
ts.text(r, 1, "Less the non-deductible half of meals"); ts.f(r, 2, "=0.5*" + net_between("Meals", YR0, YR1)); ts.text(r, 4, "Meals sit in line 20 at 100%; only half is deductible, so this is negative.", "note"); r += 1
ts.text(r, 1, "Line 22 Ordinary business income (loss)", "b")
ts.f(r, 2, f"=B{first}-B{first+1}+B{first+2}-SUM(B{first+3}:B{first+6})+B{meals}", "curb")
ts.text(r, 4, "Goes to each K-1 box 1 in the ownership split below. A loss in the launch years is normal and flows to the members' personal returns.", "note"); obi = r; r += 2
ts.text(r, 1, "SCHEDULE K-1 SPLIT", "head"); ts.text(r, 2, "Dustin", "head"); ts.text(r, 3, "Lauren", "head"); ts.text(r, 4, "", "head"); r += 1
ts.text(r, 1, "Box 1 Ordinary business income (loss)"); ts.f(r, 2, f"=B{obi}*PctDustin"); ts.f(r, 3, f"=B{obi}*PctLauren"); k1 = r; r += 1
ts.text(r, 1, "Box 4 Guaranteed payments"); ts.f(r, 2, f"=B{first+3}"); ts.put(r, 3, 0); k4 = r; r += 1
ts.text(r, 1, "Box 19 Distributions"); ts.f(r, 2, "=-Owners!$B$9"); ts.f(r, 3, "=-Owners!$C$9"); r += 1
ts.text(r, 1, "Rough self-employment tax (15.3% of 92.35% of boxes 1 + 4)"); ts.f(r, 2, f"=MAX(0,ROUND((B{k1}+B{k4})*0.9235*0.153,0))")
ts.text(r, 4, "Dustin works in the business, so his share is self-employment income. Lauren is a passive investor; her share is usually not subject to SE tax. Income tax on top depends on each member's own return.", "note"); r += 1
ts.text(r, 1, "Set aside for quarterly estimates (rule of thumb: 30% Dustin, 25% Lauren)"); ts.f(r, 2, f"=MAX(0,ROUND((B{k1}+B{k4})*0.3,0))"); ts.f(r, 3, f"=MAX(0,ROUND(C{k1}*0.25,0))"); r += 2
for c in range(1, 5): ts.text(r, c, "TEXAS" if c == 1 else "", "head")
r += 1
ts.text(r, 1, "Total revenue for franchise tax"); ts.f(r, 2, f"=B{first}-B{first+1}+B{first+2}"); tr = r; r += 1
ts.text(r, 1, "Franchise tax due?"); ts.f(r, 2, f"=IF(B{tr}<2650000,\"No tax; file the Public Information Report by 15 May\",\"Above the no-tax-due threshold: CPA prepares the franchise return\")", "def"); r += 1
ts.text(r, 1, "Sales tax collected this year"); ts.f(r, 2, "=" + net_between("Sales tax collected", YR0, YR1)); r += 1
ts.text(r, 1, "Sales tax remitted this year"); ts.f(r, 2, "=-" + net_between("Sales tax remitted to Texas", YR0, YR1)); r += 1
ts.text(r, 1, "Still owed to Texas at year end"); ts.f(r, 2, f"=SalesTax!$G${X1}"); r += 2
for c in range(1, 5): ts.text(r, c, "OTHER" if c == 1 else "", "head")
r += 1
ts.text(r, 1, "1099-NECs to send by 31 January"); ts.f(r, 2, f"=COUNTIF(Form1099!$C${N0}:$C${N1},\"YES*\")", "int"); r += 1
ts.text(r, 1, "Software development paid this year (§174A, deductible in full)"); ts.f(r, 2, "=-" + net_between("Developer (contractor)", YR0, YR1))
ts.text(r, 4, "Domestic software development is expensed in the year paid for tax years after 2024 (One Big Beautiful Bill Act). Tell the CPA the developer is building the product.", "note"); r += 1
ts.text(r, 1, "Startup costs before launch (§195)"); ts.f(r, 2, "=-" + net_between("Startup costs (before launch)", YR0, YR1))
ts.text(r, 4, "Up to $50,000 is deductible in the year the business opens (launch, March 2027); more than that is spread over 15 years. 2026 pre-launch costs are claimed on the 2027 return, so keep them in this category.", "note"); r += 1
ts.text(r, 1, "Interest paid to Lauren (she reports it as interest income; 1099-INT if $600 or more)"); ts.f(r, 2, "=-" + net_between("Loan interest", YR0, YR1)); r += 1

# ======================================================================= Plan
pn = new("Plan", {1: 200, **{c: 62 for c in range(2, 26)}, 26: 110}, freeze=2, colstyles={c: "int" for c in range(2, 27)})
pn.text(1, 1, "Plan from the investor proposal, month by month (edit freely; the Profit & Loss tab compares actuals to this)", "title")
months = [datetime.date(2027, 1, 1)]
while len(months) < 24:
    m = months[-1]; months.append(datetime.date(m.year + (m.month == 12), m.month % 12 + 1, 1))
pn.text(2, 1, "Category", "head")
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
pn.text(3 + len(plan) + 1, 1, "Base case from the proposal: developer $10k then $7k from April 2027; marketing $12k before the March 2027 launch, $20k after; hosting $500 / $2k / $3k plus $300 of tools; legal $1.5k; setup $8k in January 2027; $800 to win a trainer; 5.5% monthly trainer churn; 15 individuals a month at full spend; $115 and $49 average revenue; 3% processing. Loan interest depends on the draws, so it is not planned here.", "note")

# ======================================================================= write
def subst_names(fx):
    for nm, ref_ in names.items(): fx = re.sub(rf"(?<![A-Za-z0-9_'])({nm})(?![A-Za-z0-9_(])", ref_, fx)
    return fx
for s in sheets:
    for k, (v, sty) in list(s.cells.items()):
        if isinstance(v, tuple) and v[0] == "f": s.cells[k] = (("f", subst_names(v[1])), sty)

STYLES = ('<Styles>'
    '<Style ss:ID="Default" ss:Name="Normal"><Font ss:FontName="Arial" ss:Size="10"/><Alignment ss:Vertical="Top"/></Style>'
    '<Style ss:ID="b"><Font ss:FontName="Arial" ss:Size="10" ss:Bold="1"/></Style>'
    '<Style ss:ID="title"><Font ss:FontName="Arial" ss:Size="13" ss:Bold="1" ss:Color="#0C2A47"/></Style>'
    '<Style ss:ID="head"><Font ss:FontName="Arial" ss:Size="10" ss:Bold="1"/><Interior ss:Color="#DCE6F1" ss:Pattern="Solid"/></Style>'
    '<Style ss:ID="cur"><NumberFormat ss:Format="&quot;$&quot;#,##0.00;[Red]\\(&quot;$&quot;#,##0.00\\)"/></Style>'
    '<Style ss:ID="curb"><Font ss:FontName="Arial" ss:Size="10" ss:Bold="1"/><NumberFormat ss:Format="&quot;$&quot;#,##0.00;[Red]\\(&quot;$&quot;#,##0.00\\)"/></Style>'
    '<Style ss:ID="date"><NumberFormat ss:Format="m/d/yyyy"/></Style>'
    '<Style ss:ID="mon"><Font ss:FontName="Arial" ss:Size="10" ss:Bold="1"/><Interior ss:Color="#DCE6F1" ss:Pattern="Solid"/><NumberFormat ss:Format="mmm yyyy"/></Style>'
    '<Style ss:ID="pct"><NumberFormat ss:Format="0.00%"/></Style>'
    '<Style ss:ID="wrap"><Alignment ss:Vertical="Top" ss:WrapText="1"/></Style>'
    '<Style ss:ID="int"><NumberFormat ss:Format="#,##0"/></Style>'
    '<Style ss:ID="note"><Font ss:FontName="Arial" ss:Size="9" ss:Italic="1" ss:Color="#5B6470"/><Alignment ss:Vertical="Top" ss:WrapText="1"/></Style>'
    '<Style ss:ID="def"><Font ss:FontName="Arial" ss:Size="10"/></Style>'
    '</Styles>')
doc = ['<?xml version="1.0"?>', '<?mso-application progid="Excel.Sheet"?>',
       '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:x="urn:schemas-microsoft-com:office:excel">', STYLES]
import os
keep = os.environ.get("SHEETS")
doc += [s.xml() for s in sheets if not keep or s.name in keep.split(",")]
doc.append("</Workbook>")
data = "\n".join(doc)
open(OUT, "w", encoding="utf-8").write(data)
print("written", OUT, len(data.encode()), "bytes;", [s.name for s in sheets])
