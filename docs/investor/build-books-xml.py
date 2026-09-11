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
                    # ss:Type="String" is only needed where Google might guess a number,
                    # a date or a formula; on a plain label the attribute is 22 wasted
                    # bytes, and the file has to fit in one upload message.
                    risky = v[:1] in "=+-@" or not re.search(r"[A-Za-z]", v)
                    t = ' ss:Type="String"' if risky else ""
                    o.append(f'<Cell{a}><Data{t}>{escape(v)}</Data></Cell>')
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
def two(r, label, body, lsty="stepl"):
    """A manual row: short label in column A, the explanation across B and C."""
    st.text(r, 1, label, lsty); st.text(r, 2, body, "wrap", merge=1)
    return r + 1
st.text(1, 1, "Symmetry App LLC \u2014 the books", "title", merge=2); st.heights[1] = 30
st.text(2, 1, "Everything that comes in and goes out of the business, in one workbook. You type on the Ledger tab only; every other tab works itself out from it. Built 11 Sep 2026 from the investor proposal. The tax notes are a guide for a two-member Texas LLC taxed as a partnership \u2014 have a CPA check the first return.", "sub", merge=2); st.heights[2] = 44

r = 4
st.banner(r, "START HERE \u2014 READ THIS ONCE, IT TAKES FIVE MINUTES", 3); r += 1
for t in [
    "You do not need to know any accounting to use this. There is one rule: every time money moves in or out of the business, you add ONE line to the Ledger tab. That is the whole job. Profit and loss, the balance sheet, the loan, the sales tax, the tax return numbers \u2014 all of it is worked out from those lines. You never type on those tabs.",
    "The tabs are the row of names along the bottom of the screen. Click Ledger. Row 1 is a gold banner, row 2 is the column headings, and row 3 already has an example line in it so you can see what a finished line looks like. When you are ready, type straight over row 3 with your first real transaction \u2014 it is only there as a sample, and until you replace it the reports will show a $300 filing fee that never happened.",
    "The cream cells with a box round them are the only things you ever change on this tab. There are nine of them, just below. Everything else on this tab is instructions.",
]:
    st.text(r, 1, t, "wrap", merge=2); r += 1
r += 1

st.banner(r, "BEFORE THE FIRST LINE \u2014 five one-off jobs", 3); r += 1
for label, body in [
    ("An EIN", "A federal tax ID for the LLC, like a social security number for the business. You need one to file a partnership return and to send 1099s. Free from irs.gov \u2014 search \u201capply for an EIN online\u201d. It takes about fifteen minutes and you get the number on the screen at the end. Do not pay a service for this."),
    ("A business bank account", "Open it in the LLC's name using the EIN. Then keep it clean: never pay a business cost from a personal account or a personal cost from the business account. If it happens anyway, do not hide it \u2014 record it as Member contribution: Dustin (money in) or Member distribution: Dustin (money out) and the books stay straight."),
    ("A Texas sales tax permit", "Register at comptroller.texas.gov before your first sale to a Texas customer. It is free. You are not allowed to charge sales tax without it, and you are required to collect it once you have Texas customers."),
    ("A W-9 from every contractor", "Before you pay a contractor their first dollar, get a signed Form W-9 back from them (free download from irs.gov). It gives you their legal name and tax ID, which you will need in January to send their 1099. Chasing it a year later is painful and some people simply stop answering."),
    ("A receipts folder", "One folder in Drive per year. Every time you enter a line, drop the receipt in it and paste the link into the Receipt column."),
]:
    r = two(r, label, body)
r += 1

st.banner(r, "SETTINGS \u2014 change these here and every tab follows", 3); r += 1
settings = [
    ("TaxYear", "Year to report on", 2026, "int", "The reporting year. Every report tab shows this year and nothing else. Change it to 2027 in January and the whole workbook moves with it; last year's numbers are not lost, they come back when you put the year back."),
    ("LoanRate", "Loan interest rate per year", 0.07, "pct", "Proposal \u00a73: 7% simple interest, charged only on money actually drawn."),
    ("Facility", "Committed facility from Lauren", 274000, "cur", "Proposal \u00a73: the most that can be drawn in total, taken month by month only when the account needs it."),
    ("PctDustin", "Dustin's membership interest", 0.90, "pct", "Profit, loss and distributions are split on these two percentages. They are what each Schedule K-1 reports."),
    ("PctLauren", "Lauren's membership interest", 0.10, "pct", "Proposal \u00a73. The two must add up to 100%."),
    ("SalesTaxRate", "Texas sales tax rate", 0.0825, "pct", "6.25% state plus local, capped at 8.25% in total. Use the rate at the customer's Texas address. Customers in other states follow their own state's rules and usually owe nothing until you pass about $100,000 of sales there."),
    ("TaxablePortion", "Share of a subscription Texas taxes", 0.80, "pct", "Texas treats software sold as a subscription as a data processing service: 80% of the charge is taxable and 20% is exempt (Tax Code \u00a7151.351)."),
    ("Threshold1099", "1099-NEC threshold", 2000, "cur", "Pay one contractor this much or more in a year and you must send them a 1099-NEC by 31 January. $2,000 from 2026, rising with inflation after 2027."),
    ("Reserve", "Cash reserve before any distribution", 139000, "cur", "Proposal \u00a73 and \u00a75: about four months of running costs stays in the account before anybody takes money out."),
]
for nm, label, val, sty, note in settings:
    st.text(r, 1, label, "lab"); st.put(r, 2, val, "in" + sty); st.text(r, 3, note, "note")
    names[nm] = f"{SET}{r}"
    r += 1
r += 1

st.banner(r, "WHAT THE COLOURS MEAN", 3); r += 1
st.text(r, 1, "Cream with a box round it.", "in"); st.text(r, 2, "", "in")
st.text(r, 3, "A cell you type in.", "note"); r += 1
st.text(r, 1, "Grey italic.", "auto"); st.text(r, 2, "", "auto")
st.text(r, 3, "The sheet fills it in. On the Ledger that is columns J to Q. Typing over them breaks the reports.", "note"); r += 1
st.text(r, 1, "Gold box.", "keyb"); st.text(r, 2, "", "keyb")
st.text(r, 3, "A number worth looking at: the balance check, the profit for the year, what is available to distribute.", "note"); r += 2

st.banner(r, "THE LEDGER, COLUMN BY COLUMN \u2014 what goes in each box", 3); r += 1
for label, body in [
    ("A \u2014 Date", "The day the money actually moved, not the date on the invoice. Type it like 9/11/2026."),
    ("B \u2014 Payee / who", "Who you paid, or who paid you. Spell a contractor's name exactly the same way every single time \u2014 the 1099 tab adds up by this name, and \u201cJohn Smith\u201d and \u201cJohn Smith LLC\u201d are two different people to a spreadsheet."),
    ("C \u2014 What for", "A plain sentence in your own words: \u201cSeptember hosting\u201d, \u201cLLC filing fee\u201d. This is what you will be reading in a year's time when you cannot remember."),
    ("D \u2014 Category", "Pick it from the dropdown. Click the cell and a small arrow appears at its right-hand edge; click the arrow and choose from the list. The list comes from the Categories tab. This is the one column that has to be right \u2014 every report in the workbook is built on it. If you cannot see an arrow, read IF SOMETHING LOOKS WRONG at the bottom of this tab."),
    ("E \u2014 Money in", "Money that came INTO the business. Fill in E or F, never both on the same line."),
    ("F \u2014 Money out", "Money that LEFT the business. Type it as a plain positive number: 300, not -300. The sheet knows it is money going out because of the column it is in."),
    ("G \u2014 Account", "Which pot it moved through: Bank, Stripe, Card or Cash. Also a dropdown. This is what lets the Balance Sheet be checked against each statement."),
    ("H \u2014 Receipt link / ref", "The Drive link to the receipt, or the subject line of the email receipt. Takes five seconds now and saves an afternoon later."),
    ("I \u2014 Notes", "Anything else worth remembering. Optional, except for meals."),
    ("J to Q \u2014 leave alone", "Grey italic, and worked out for you: the month, the net amount, the category number, the type, the tax line it lands on and whether it counts toward a 1099. Do not type in them. If one of them looks wrong the answer is always in columns A to I."),
]:
    r = two(r, label, body)
r += 1

st.banner(r, "EVERY KIND OF TRANSACTION \u2014 exactly what to type", 3); r += 1
for label, body in [
    ("A customer pays you $115 through Stripe", "One line. Date = the day Stripe charged them. Payee = the customer. Category = Trainer subscriptions. Money in = 115. Account = Stripe. Enter the FULL amount they were charged, not the smaller amount that lands after fees."),
    ("Stripe keeps its fee, say $3.45", "A second line. Payee = Stripe. Category = Payment processing fees. Money out = 3.45. Account = Stripe. The fee is a business expense in its own right, which is why it gets its own line."),
    ("Stripe pays $111.55 over to the bank", "Two lines, same date and same amount. First: Category = Transfer between accounts, Money out = 111.55, Account = Stripe. Second: Category = Transfer between accounts, Money in = 111.55, Account = Bank. Transfers always come in pairs, they cancel each other out, and they are neither income nor expense \u2014 the money was already yours."),
    ("You pay the developer $10,000", "One line. Payee = the developer's name, spelled the same as last month. Category = Developer (contractor). Money out = 10000. Account = Bank."),
    ("You put your own money in", "Category = Member contribution: Dustin. Money in. This is not income and nobody is taxed on it."),
    ("Lauren sends over a draw on the loan", "Category = Loan draw from Lauren. Money in. Not income either \u2014 it is borrowed. From that month the Loan tab starts charging 7% a year on it."),
    ("You pay Lauren back", "TWO lines. The interest part: Category = Loan interest, Money out. The principal part: Category = Loan principal repayment, Money out. Column G on the Loan tab shows how much interest has built up so far, which tells you how to split the payment. Only the interest part is a business expense; paying back the principal is not."),
    ("You take money out for yourself", "Category = Member distribution: Dustin. Money out. It is not an expense and you are not taxed on it again \u2014 you already pay tax on your share of the profit whether you take it out or not. Paying your personal tax bill out of the business account belongs here too."),
    ("You charge a Texas customer sales tax", "Two lines: the subscription (Category = Trainer subscriptions, Money in = the charge) and the tax (Category = Sales tax collected, Money in = the tax). The tax has never been your money \u2014 you are holding it for Texas, and the SalesTax tab keeps count of what you owe."),
    ("You pay Texas its sales tax", "Category = Sales tax remitted to Texas. Money out."),
    ("A customer wants a refund", "Category = Refunds to customers, and put it in Money OUT. Do not type a negative number into Money in."),
    ("You buy a $1,800 laptop", "Category = Office, equipment and supplies. Money out. Over $2,500 for one item, ask the CPA whether it has to be written off over several years instead of all at once."),
    ("You take a client to lunch", "Category = Meals. Money out. Write who you met and what you discussed in the Notes column \u2014 that is what the IRS asks for. Only half of a business meal is deductible, and the Tax Summary tab takes care of that for you."),
    ("You realise last month was wrong", "Never delete the line. Add a new line that reverses it \u2014 same amount, opposite column, a note saying what it fixes \u2014 and then enter the correct line. The history stays honest and the balance check keeps working."),
]:
    r = two(r, label, body, "lab")
r += 1

st.banner(r, "THE MONTHLY ROUTINE \u2014 about an hour, the same day each month", 3); r += 1
for label, body in [
    ("1. Enter everything", "Open last month's bank, Stripe and card statements. Work down them line by line and make sure every single transaction has a line on the Ledger. Nothing else in the workbook can be right if this is not."),
    ("2. Check the cash agrees", "BalanceSheet tab. Cash in Bank, Cash in Stripe and Cash in Card each have to equal the closing balance on that statement. If one is out, a line is missing, entered twice, or sitting in the wrong account."),
    ("3. Check the balance check", "Same tab, the gold box near the bottom. It must read $0.00. If it does not, almost always a Transfer between accounts is missing its second line, or a line has an amount in both Money in and Money out."),
    ("4. Read the month", "ProfitLoss tab. The column for that month shows what came in, what went out, and the profit or loss. The three columns on the right compare the year so far against the proposal's plan."),
    ("5. Sales tax", "If you had Texas sales, the SalesTax tab has the numbers. File and pay by the 20th \u2014 see the calendar below."),
    ("6. Put the tax money aside", "TaxSummary tab, the bottom of the Schedule K-1 block: \u201cSet aside for quarterly estimates\u201d. Move that much into a separate savings account and do not touch it. No employer is withholding tax for you any more, and this is the step people regret skipping."),
]:
    r = two(r, label, body)
r += 1

st.banner(r, "TAX CALENDAR \u2014 what is due, when, and what to do about it", 3); r += 1
st.text(r, 1, "A two-member LLC is treated by the IRS as a partnership. The LLC itself pays no income tax: it files a return that reports the profit, and then each of you pays tax personally on your share, whether or not you actually took the money out. Dates below fall in the year AFTER the year being reported \u2014 the 2026 books are filed in 2027. If a date lands on a weekend or a federal holiday it moves to the next working day.", "wrap", merge=2); r += 1
for label, body in [
    ("The 20th, every month", "TEXAS SALES TAX. File and pay online at comptroller.texas.gov (their system is called Webfile). The SalesTax tab gives you every number you need. The Comptroller may put you on quarterly filing instead \u2014 they will tell you which when you register. File even in a month when you collected nothing: a zero return is still required and a missed one starts at a $50 penalty."),
    ("31 January", "1099-NEC FORMS. Open the Form1099 tab: anyone it marks \u201cYES, send one\u201d needs a 1099-NEC, sent to them and filed with the IRS by this date. You need their W-9 to fill it in. An attorney gets one even if they are a corporation; other corporations do not get one. File free through the IRS IRIS system online, or let a payroll service do it. Late filing runs $60 to $340 per form."),
    ("15 January", "Q4 ESTIMATED TAX. Paid personally by each member at irs.gov/payments, not by the LLC. The amount is on the TaxSummary tab under \u201cSet aside for quarterly estimates\u201d."),
    ("15 March", "FORM 1065 \u2014 the partnership return, with a Schedule K-1 for each of you. This is the big one. Hand the CPA the TaxSummary tab and they have almost everything they need. The late penalty is $255 per member per month, which is $510 a month for the two of you, so if you are not ready then file Form 7004 by this same date for an automatic extension to 15 September. The extension buys time for the FORM, not for the money \u2014 estimates are still due on their own dates."),
    ("15 April", "YOUR PERSONAL RETURNS. Each of you files a Form 1040 that includes your K-1: Schedule E page 2 for the share of profit, and Schedule SE for self-employment tax on Dustin's share. Lauren is a passive investor so her share is usually not subject to self-employment tax \u2014 have the CPA confirm that for her. Q1 ESTIMATED TAX is due the same day."),
    ("15 May", "TEXAS FRANCHISE TAX and the PUBLIC INFORMATION REPORT, at comptroller.texas.gov. Below $2.65M of revenue there is no tax to pay, but the Public Information Report still has to be filed every single year. Skip it and the LLC loses its good standing, and with it the liability protection that is the entire point of having an LLC. It takes about ten minutes."),
    ("15 June", "Q2 ESTIMATED TAX."),
    ("15 September", "Q3 ESTIMATED TAX. Also the final deadline for Form 1065 if you took the extension in March."),
    ("All year round", "KEEP THE RECEIPTS. The IRS wants a receipt for anything over $75 and for every meal, with who you met and why. A line on a bank statement is not a receipt."),
    ("Three things to tell the CPA", "One: the developer is writing software in the United States, so \u00a7174A lets you deduct what you pay them in the year you pay it rather than spreading it out. Two: money spent before the business opens is \u00a7195 startup cost \u2014 up to $50,000 is deductible in the year it opens (launch is March 2027) and the rest is spread over fifteen years, which is why those costs have their own category. Three: the money from Lauren is a genuine loan, so the interest is deductible here and is interest income to her, and she needs a 1099-INT from you if it comes to $600 or more in a year."),
]:
    r = two(r, label, body)
r += 1

st.banner(r, "IF SOMETHING LOOKS WRONG", 3); r += 1
for label, body in [
    ("No dropdown in the Category column", "Click the cell first \u2014 the little arrow only appears on the cell you have selected, and only from row 3 down. If there is still no arrow, you can build it yourself in about twenty seconds: click cell D3, then in the menu go Data \u25b8 Data validation \u25b8 Add rule, set Criteria to \u201cDropdown (from a range)\u201d, type Categories!A4:A61 in the box, tick \u201cShow warning\u201d, then Done. Drag the little blue square at the bottom-right of D3 down the column to copy it to the rows below. Or skip it entirely and type the category by hand \u2014 it just has to be spelled exactly as it is on the Categories tab. The built-in dropdowns only cover rows 3 to 1000; past that, copy a filled cell down."),
    ("Column N says NOT A CATEGORY", "Whatever is in column D on that line is not spelled the same as anything on the Categories tab. Pick it from the dropdown again, or fix the spelling."),
    ("The balance check is not $0.00", "Nearly always one of two things: a Transfer between accounts that only got one of its two lines, or a line with an amount typed into both Money in and Money out."),
    ("A whole month shows nothing", "Check the Year in Settings at the top of this tab. The report tabs only ever show that one year."),
    ("The balance sheet does not match the bank", "A line is missing, has been entered twice, or is sitting in the wrong Account."),
    ("You need a category that is not there", "Add it on the Categories tab, on the first empty row between 4 and 61. Fill in all five columns \u2014 the Type column decides whether it counts as profit \u2014 and it turns up in the dropdown straight away."),
    ("You are not sure how to record something", "Put it in with your best guess and write what really happened in the Notes column. A line with a note is easy to fix later; a transaction you never entered is invisible."),
]:
    r = two(r, label, body, "lab")
r += 1

st.banner(r, "WHAT THE TABS ARE", 3); r += 1
for label, body in [
    ("Ledger", "The only tab you type on."),
    ("Categories", "The list behind the dropdown, and the tax line each category lands on."),
    ("ProfitLoss", "What came in and went out, month by month, for the year in Settings, next to the proposal's plan."),
    ("BalanceSheet", "What the business owns and owes at the end of that year, and the check that it all balances."),
    ("Loan", "Lauren's facility month by month: drawn, repaid, interest built up, still available."),
    ("Owners", "Each member's capital account, the numbers for their K-1, and what could be paid out today."),
    ("SalesTax", "What Texas is owed each month and what has been paid."),
    ("Form1099", "What each contractor has been paid this year against the $2,000 threshold."),
    ("TaxSummary", "The numbers to hand whoever prepares Form 1065."),
    ("Plan", "The proposal's monthly budget. ProfitLoss compares the real numbers to it. Edit it freely."),
]:
    r = two(r, label, body)

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
    _st("stepl", F(Size=10, Bold=1, Color=NAVY), align=AL(Vertical="Top", WrapText="1")),
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

# The whole workbook has to be typed into one upload message, so style IDs are
# rewritten to one or two characters on the way out. The names above stay
# readable in this file; only the emitted XML is shortened.
_ids = sorted(set(re.findall(r'ss:ID="([^"]+)"', data)) - {"Default"})
_alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
_short = {}
for i, _name in enumerate(_ids):
    _short[_name] = _alphabet[i] if i < len(_alphabet) else _alphabet[i // 52 - 1] + _alphabet[i % 52]
data = re.sub(r'(ss:(?:ID|StyleID)=")([^"]+)(")',
              lambda m: m.group(1) + _short.get(m.group(2), m.group(2)) + m.group(3), data)
open(OUT, "w", encoding="utf-8").write(data)
print("written", OUT, len(data.encode()), "bytes;", [s.name for s in sheets])
