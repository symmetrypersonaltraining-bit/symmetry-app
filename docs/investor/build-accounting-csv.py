"""Builds the single-sheet Google Sheets version of the accounting workbook as
CSV text, for upload to Drive with the Google Drive tool (text/csv converts to
a native Google Sheet and keeps formulas). One tab, six sections stacked top to
bottom: INPUTS, SUMMARY, PROJECTION, LOAN, P&L, ACTUALS. Same figures and the
same formulas as build-accounting-sheet.py (the multi-tab xlsx), just with
in-sheet references instead of tab names.

Why CSV: the Drive tool carries file bytes inline and a workbook of any real
size does not survive the trip; formula text does.

    python3 docs/investor/build-accounting-csv.py out.csv
"""
import csv, sys

OUT = sys.argv[1] if len(sys.argv) > 1 else "Symmetry-App-Accounting-2026-09-12.csv"
cells = {}
def put(ref, v):
    col = "".join(ch for ch in ref if ch.isalpha()); row = int("".join(ch for ch in ref if ch.isdigit()))
    cells[(row, col)] = v
def col_n(c):
    n = 0
    for ch in c: n = n * 26 + ord(ch) - 64
    return n
def n_col(n):
    s = ""
    while n: n, r = divmod(n - 1, 26); s = chr(65 + r) + s
    return s

# ---------------- title
put("A1", "SYMMETRY APP: ACCOUNTING WORKBOOK (single sheet). Seeded 12 Sep 2026 from the Launch Investment Proposal to Lauren Standefer.")
put("A2", "Sections top to bottom: INPUTS (rows 4-47), SUMMARY (50-77), PROJECTION (80-128), LOAN (131-199), P&L (202-243), ACTUALS (250-278). Type only in INPUTS and in the ACTUALS input columns. Rows marked 'array formula' fill their whole column; do not type below them.")

# ---------------- INPUTS (same addresses as the Inputs tab of the xlsx)
put("A4", "INPUTS: Scenario (1 = Conservative, 2 = Base, 3 = Optimistic)"); put("B4", 2); put("C4", '=CHOOSE(B4,"Conservative","Base","Optimistic")'); put("F4", "The proposal's headline figures are the Base case")
put("A6", "Timeline"); put("F6", "Source in the 12 Sep 2026 proposal")
put("A7", "Model start (first month of costs; setup lands here)"); put("B7", "=DATE(2027,1,1)"); put("F7", "§2: developer and marketing lead start January 2027")
put("A8", "Web launch month"); put("B8", "=DATE(2027,3,1)"); put("F8", "§2: web launch March 2027")
put("A9", "Developer drops to three days a week from"); put("B9", "=DATE(2027,4,1)"); put("F9", "§2: full time in March, three days a week after")
put("A10", "'After' cost phase begins"); put("B10", "=DATE(2027,9,1)"); put("F10", "§2: launch phase March to August 2027")
put("A12", "Pricing")
put("A13", "Average revenue per trainer per month"); put("B13", 115); put("F13", "§4, §6: $79 + $15 per 5 clients, cap $199; $115 modelled average; replace with the measured number after 30 sign-ups")
put("A14", "Individual subscription per month"); put("B14", 49); put("F14", "§6")
put("A16", "Monthly costs")
for r, lab, val, src in [
    (17, "Developer, full time (to the launch)", 10000, "§2, §8: budgeted $10,000; confirm with the developer's written rate"),
    (18, "Developer, three days a week (from the date in B9)", 7000, "§2"),
    (19, "Marketing, pre-launch", 12000, "§2 monthly table"),
    (20, "Marketing, launch and after", 20000, "§2 monthly table; held after the review while cost per trainer is under target"),
    (21, "Hosting and AI, pre-launch", 500, "§2"), (22, "Hosting and AI, launch", 2000, "§2; AI measured at $0.55 per client per month"),
    (23, "Hosting and AI, after", 3000, "§2"), (24, "Legal, accounting, insurance, payroll service", 1500, "§2"),
    (25, "Tools", 300, "§2"), (26, "One-time setup (LLC, agreements, trademark, store accounts, insurance)", 8000, "§2: $8,000"),
]:
    put(f"A{r}", lab); put(f"B{r}", val); put(f"F{r}", src)
put("A28", "The facility")
put("A29", "Committed facility from Lauren"); put("B29", 274000); put("F29", "§3. Option B: enter 209000 and set the developer lines to 0")
put("A30", "Interest rate, per year, on drawn funds"); put("B30", 0.07); put("F30", "§3: 7% from the day funds are drawn")
put("A31", "Repayment term, months, from the first payment"); put("B31", 60); put("F31", "§3: five years")
put("A32", "Payments start when monthly revenue >= running costs (loan payment excluded)"); put("F32", "§3, §5; applied automatically in PROJECTION column V")
put("A34", "Ownership and reserve")
put("A35", "Lauren's share of profit distributions"); put("B35", 0.10); put("F35", "§3: 10% membership interest")
put("A36", "Dustin's share of profit distributions"); put("B36", "=1-B35")
put("A37", "Reserve held before any distribution"); put("B37", 139000); put("F37", "§3, §5: four months of operating expenses, about $139,000")
put("A39", "Scenario assumptions"); put("B39", "Conservative"); put("C39", "Base"); put("D39", "Optimistic"); put("E39", "Selected"); put("F39", "Source")
for r, lab, vals, src in [
    (40, "Cost to win one paying trainer", [1500, 800, 500], "§4 benchmark $500 to $1,500"),
    (41, "Monthly trainer churn", [0.07, 0.055, 0.04], "§4 benchmark 4% to 7%"),
    (42, "New individuals per month at full marketing spend", [5, 15, 30], "Page §5"),
    (43, "Monthly individual churn", [0.10, 0.10, 0.10], "Page §5"),
    (44, "Ramp, first launch month", [0.6, 0.6, 0.6], "Page §5: funnel built before launch"),
    (45, "Ramp, second launch month", [0.85, 0.85, 0.85], "Page §5"),
    (46, "Trainers on the books at launch (besides the model's sign-ups)", [0, 0, 0], "Projections start from zero"),
    (47, "Individuals on the books at launch", [0, 0, 0], "As above"),
]:
    put(f"A{r}", lab)
    for c, v in zip("BCD", vals): put(f"{c}{r}", v)
    put(f"E{r}", f"=INDEX(B{r}:D{r},1,$B$4)"); put(f"F{r}", src)

# ---------------- PROJECTION layout constants
N = 48; R0 = 81; R1 = R0 + N - 1
rg = lambda c: f"{c}{R0}:{c}{R1}"
af = lambda e: f"=ARRAYFORMULA({e})"
rx = lambda k: af(f'VALUE(REGEXEXTRACT({rg("AM")},"^(?:[^|]*\\|){{{k}}}([^|]*)"))') if k else af(f'VALUE(REGEXEXTRACT({rg("AM")},"^([^|]*)"))')
LR0 = 140; LR1 = LR0 + 60 - 1   # loan schedule rows
AR0 = 252; AN = 27; AR1 = AR0 + AN - 1   # actuals rows
ar = lambda c: f"{c}{AR0}:{c}{AR1}"

# ---------------- SUMMARY
put("A50", "SUMMARY: what today's numbers say (all pulled from PROJECTION; switch scenario in B4)")
put("A52", "Scenario"); put("B52", "=C4")
put("A53", "Row of first break-even month (helper)"); put("B53", f"=IFERROR(MATCH(1,{rg('V')},0),0)")
put("A55", "Break-even and the loan")
for r, lab, f, note in [
    (56, "First month revenue covers running costs; loan payments start", f'=IF(B53=0,"not reached",TEXT(INDEX({rg("B")},B53),"mmm yyyy"))', "Proposal: month 14 (spring 2028) base, month 7 (late 2027) optimistic, never on conservative"),
    (57, "Months after launch", f'=IF(B53=0,"—",INDEX({rg("C")},B53))', ""),
    (58, "Loan balance when payments start, including accrued interest", f'=IF(B53=0,"—",ROUND(INDEX({rg("W")},B53)+INDEX({rg("X")},B53)))', "Proposal: $238,000 base, $145,900 optimistic"),
    (59, "Monthly loan payment, five years", f'=IF(B53=0,"—",ROUND(INDEX({rg("Y")},B53)))', "Proposal: $4,710 base, $2,890 optimistic"),
    (60, "Peak drawn from the facility (cumulative draws)", f"=ROUND(MAX({rg('AD')}))", "Proposal: about $238,000 drawn on the base path"),
    (61, "Peak loan balance, including accrued interest", f"=ROUND(MAX({rg('AC')}))", "Proposal: about $242,000 base, $146,000 optimistic"),
    (62, "Facility headroom at the peak", "=B29-B60", "Proposal: about $32,000 on the base path"),
    (63, "Total interest to Lauren (accrued before payments start, plus the five-year schedule)", '=IF(B53=0,"—",ROUND(C138+C137))', "Proposal: about $62,000 base, $32,500 optimistic"),
    (64, "Final loan payment", '=IF(B53=0,"not reached",TEXT(EDATE(C132,C135-1),"mmm yyyy"))', "Five years after the first payment"),
    (65, "Cash check", f'=IF(MIN({rg("AF")})<-0.5,"FACILITY EXHAUSTED: cash goes negative","OK: the facility covers every month")', "If exhausted, the plan needs Option B or a smaller marketing line"),
]:
    put(f"A{r}", lab); put(f"B{r}", f); put(f"C{r}", note)
put("A67", "Reserve and profit distributions")
put("A68", "First month the reserve is met and a distribution is made"); put("B68", f'=IFERROR(TEXT(INDEX({rg("B")},MATCH(1,{rg("AK")},0)),"mmm yyyy"),"not within the model")'); put("C68", "Reserve: B37")
put("A69", "Distributions to Lauren through December 2030"); put("B69", f"=ROUND(SUM({rg('AG')}))")
put("A70", "Distributions to Dustin through December 2030"); put("B70", f"=ROUND(SUM({rg('AH')}))")
put("A72", "Growth after the March 2027 launch"); put("B72", "Trainers"); put("C72", "Individuals"); put("D72", "Monthly revenue"); put("E72", "Proposal base case")
ref = {6: "120 + 65 · $17,000", 12: "217 + 105 · $30,000", 18: "285 + 126 · $39,000", 24: "334 + 137 · $45,100", 36: "393 + 146 · $52,400 (beyond this sheet's 48 months)"}
for i, k in enumerate([6, 12, 18, 24, 36]):
    r = 73 + i
    put(f"A{r}", f"Month {k} after launch")
    put(f"B{r}", f'=IFERROR(ROUND(INDEX({rg("N")},MATCH({k},{rg("C")},0))),"")')
    put(f"C{r}", f'=IFERROR(ROUND(INDEX({rg("P")},MATCH({k},{rg("C")},0))),"")')
    put(f"D{r}", f'=IFERROR(ROUND(INDEX({rg("S")},MATCH({k},{rg("C")},0))),"")')
    put(f"E{r}", ref[k])
put("A78", "The August 2027 review rule: cost per paying trainer under $900 and holding, keep going; over $1,200, stop paid spend. Track it in ACTUALS column R.")

# ---------------- PROJECTION
put("A80", "PROJECTION, month by month, January 2027 to December 2030 (row 81 holds one array formula per column; do not type over it)")
heads = ["Month #", "Month", "Months since launch", "", "Developer", "Marketing", "Hosting and AI", "Legal, accounting, insurance", "Tools", "One-time setup",
    "Running costs", "Total costs", "New trainers", "Trainers, end of month", "New individuals", "Individuals, end of month",
    "Trainer revenue", "Individual revenue", "Total revenue", "Operating profit", "", "Break-even reached; loan payments active (1/0)",
    "Loan opening balance", "Interest accrued", "Fixed monthly payment", "Loan payment made", "Cash before any draw", "Facility draw",
    "Loan closing balance", "Cumulative drawn", "Distributable above reserve", "Closing cash", "Distribution to Lauren", "Distribution to Dustin",
    "", "", "Distribution this month (1/0)", "Year", "Loan and cash engine (packed; leave alone)"]
for i, h in enumerate(heads, start=1):
    if h: put(f"{n_col(i)}{R0 - 1}", h)
ramp = f"IF({rg('C')}=1,$E$44,IF({rg('C')}=2,$E$45,1))"
f = {
    "A": f"=SEQUENCE({N})",
    "B": af(f"EDATE($B$7,{rg('A')}-1)"),
    "C": af(f"IF({rg('B')}<$B$8,0,(YEAR({rg('B')})-YEAR($B$8))*12+MONTH({rg('B')})-MONTH($B$8)+1)"),
    "E": af(f"IF({rg('B')}<$B$9,$B$17,$B$18)"),
    "F": af(f"IF({rg('B')}<$B$8,$B$19,$B$20)"),
    "G": af(f"IF({rg('B')}<$B$8,$B$21,IF({rg('B')}<$B$10,$B$22,$B$23))"),
    "H": af(f"{rg('A')}*0+$B$24"),
    "I": af(f"{rg('A')}*0+$B$25"),
    "J": af(f"IF({rg('B')}=$B$7,$B$26,0)"),
    "K": af(f"{rg('E')}+{rg('F')}+{rg('G')}+{rg('H')}+{rg('I')}"),
    "L": af(f"{rg('K')}+{rg('J')}"),
    "M": af(f"IF({rg('C')}=0,0,{rg('F')}/$E$40*{ramp}+IF({rg('C')}=1,$E$46,0))"),
    "N": f"=SCAN(0,{rg('M')},LAMBDA(a,x,a*(1-$E$41)+x))",
    "O": af(f"IF({rg('C')}=0,0,$E$42*{rg('F')}/$B$20*{ramp}+IF({rg('C')}=1,$E$47,0))"),
    "P": f"=SCAN(0,{rg('O')},LAMBDA(a,x,a*(1-$E$43)+x))",
    "Q": af(f"{rg('N')}*$B$13"),
    "R": af(f"{rg('P')}*$B$14"),
    "S": af(f"{rg('Q')}+{rg('R')}"),
    "T": af(f"{rg('S')}-{rg('L')}"),
    "V": f"=SCAN(0,ARRAYFORMULA({rg('S')}>={rg('K')}),LAMBDA(a,x,IF(OR(a=1,x),1,0)))",
    "AM": (f'=SCAN("0|0|0|0",SEQUENCE({N}),LAMBDA(acc,i,LET(qs,SPLIT(acc,"|"),qBal,VALUE(INDEX(qs,1,1)),qCash,VALUE(INDEX(qs,1,2)),qDrawn,VALUE(INDEX(qs,1,3)),qPmt0,VALUE(INDEX(qs,1,4)),'
           f'qT,INDEX({rg("T")},i),qV,INDEX({rg("V")},i),qRt,$B$30/12,qX,qBal*qRt,'
           f'qPmt,IF(qV=1,IF(qPmt0=0,PMT(qRt,$B$31,-(qBal+qX)),qPmt0),0),qZ,IF(qV=1,MIN(qPmt,qBal+qX),0),qAA,qCash+qT-qZ,'
           f'qAB,IF(qAA<0,MIN(-qAA,$B$29-qDrawn),0),qAC,qBal+qX+qAB-qZ,qAD,qDrawn+qAB,qAE,MAX(0,qAA+qAB-$B$37),qAF,qAA+qAB-qAE,'
           f'TEXTJOIN("|",FALSE,qAC,qAF,qAD,qPmt,qX,qZ,qAA,qAB,qAE))))'),
    "W": f"={{0;AC{R0}:AC{R1 - 1}}}",
    "X": rx(4), "Y": rx(3), "Z": rx(5), "AA": rx(6), "AB": rx(7), "AC": rx(0), "AD": rx(2), "AE": rx(8), "AF": rx(1),
    "AG": af(f"{rg('AE')}*$B$35"),
    "AH": af(f"{rg('AE')}*$B$36"),
    "AK": af(f"IF({rg('AE')}>0,1,0)"),
    "AL": af(f"YEAR({rg('B')})"),
}
for col, formula in f.items(): put(f"{col}{R0}", formula)

# ---------------- LOAN
put("A131", "LOAN: the clean five-year repayment schedule from the balance on the day payments start (the one to show Lauren)")
put("A132", "Payments start"); put("C132", f'=IF(B53=0,"—",INDEX({rg("B")},B53))')
put("A133", "Starting balance"); put("C133", f'=IF(B53=0,"—",INDEX({rg("W")},B53)+INDEX({rg("X")},B53))')
put("A134", "Rate per year"); put("C134", "=B30")
put("A135", "Term, months"); put("C135", "=B31")
put("A136", "Monthly payment"); put("C136", '=IF(ISNUMBER(C133),PMT(C134/12,C135,-C133),"—")')
put("A137", "Total interest over the term"); put("C137", f"=SUM(D{LR0}:D{LR1})")
put("A138", "Interest accrued before payments start"); put("C138", f'=IF(B53=0,"—",SUMPRODUCT(({rg("V")}=0)*{rg("X")}))')
for c, h in zip("ABCDEFG", ["#", "Month", "Opening balance", "Interest", "Principal", "Payment", "Closing balance"]): put(f"{c}{LR0 - 1}", h)
L = lambda c: f"{c}{LR0}:{c}{LR1}"
put(f"A{LR0}", '=IF(ISNUMBER($C$133),SEQUENCE($C$135),"")')
put(f"B{LR0}", f'=ARRAYFORMULA(IF({L("A")}="",,EDATE($C$132,{L("A")}-1)))')
put(f"C{LR0}", f'=ARRAYFORMULA(IF({L("A")}="",,$C$133*(1+$C$134/12)^({L("A")}-1)-$C$136*((1+$C$134/12)^({L("A")}-1)-1)/($C$134/12)))')
put(f"D{LR0}", f'=ARRAYFORMULA(IF({L("A")}="",,{L("C")}*$C$134/12))')
put(f"F{LR0}", f'=ARRAYFORMULA(IF({L("A")}="",,IF({L("A")}=$C$135,{L("C")}+{L("D")},$C$136)))')
put(f"E{LR0}", f'=ARRAYFORMULA(IF({L("A")}="",,{L("F")}-{L("D")}))')
put(f"G{LR0}", f'=ARRAYFORMULA(IF({L("A")}="",,{L("C")}+{L("D")}-{L("F")}))')

# ---------------- P&L
put("A202", "P&L by year: projected on the selected scenario, then actual from ACTUALS")
years = [2026, 2027, 2028, 2029, 2030]; LASTC = n_col(1 + len(years))
def block(top, label, rows, yearcol, r0, r1, datecol, extra):
    put(f"A{top}", label)
    for i, y in enumerate(years): put(f"{n_col(2 + i)}{top}", y)
    r = top + 1; idx = {}
    for lab, col in rows:
        idx[lab] = r; put(f"A{r}", lab)
        if isinstance(col, tuple):
            if col[0] == "OP": fm = f"=ARRAYFORMULA(B{idx[col[1]]}:{LASTC}{idx[col[1]]}-B{idx[col[2]]}:{LASTC}{idx[col[2]]})"
            else: fm = "=ARRAYFORMULA(" + "+".join(f"B{idx[x]}:{LASTC}{idx[x]}" for x in col) + ")"
        else:
            fm = f"=ARRAYFORMULA(SUMIF(${yearcol}${r0}:${yearcol}${r1},B${top}:{LASTC}${top},${col}${r0}:${col}${r1}))"
        put(f"B{r}", fm); r += 1
    for lab, col in extra:
        put(f"A{r}", lab)
        for i, y in enumerate(years):
            cl = n_col(2 + i)
            put(f"{cl}{r}", f'=IFERROR(INDEX(${col}${r0}:${col}${r1},MATCH(DATE({cl}${top},12,1),${datecol}${r0}:${datecol}${r1},0)),"")')
        r += 1
    return r
proj_rows = [("Trainer revenue", "Q"), ("Individual revenue", "R"), ("Total revenue", ("Trainer revenue", "Individual revenue")),
    ("Developer", "E"), ("Marketing", "F"), ("Hosting and AI", "G"), ("Legal, accounting, insurance", "H"), ("Tools", "I"), ("One-time setup", "J"),
    ("Total costs", ("Developer", "Marketing", "Hosting and AI", "Legal, accounting, insurance", "Tools", "One-time setup")),
    ("Operating profit", ("OP", "Total revenue", "Total costs")),
    ("Interest accrued on the facility", "X"), ("Loan payments made", "Z"), ("Drawn from the facility", "AB"),
    ("Distributions to Lauren", "AG"), ("Distributions to Dustin", "AH")]
end = block(204, "Projected", proj_rows, "AL", R0, R1, "B", [("Trainers at year end", "N"), ("Individuals at year end", "P"), ("Loan balance at year end", "AC"), ("Cash at year end", "AF")])
act_rows = [("Trainer revenue", "E"), ("Individual revenue", "F"), ("Other revenue", "G"), ("Total revenue", "H"),
    ("Developer", "I"), ("Marketing", "J"), ("Hosting and AI", "K"), ("Legal, accounting, insurance", "L"), ("Tools", "M"), ("Setup and one-time", "N"), ("Other expenses", "O"),
    ("Total expenses", "P"), ("Operating profit", "Q"), ("Interest accrued on the facility", "U"), ("Loan payments made", "V"), ("Drawn from the facility", "S"),
    ("Distributions to Lauren", "X"), ("Distributions to Dustin", "Y")]
block(end + 1, "Actual (from ACTUALS)", act_rows, "AC", AR0, AR1, "A", [("Loan balance at year end", "W"), ("Cash at year end, per the books", "Z")])

# ---------------- ACTUALS
put("A250", "ACTUALS: what really happened, month by month. Type into the columns marked (type); the others calculate from row 252 down. Cost per paying trainer (column R) is the August 2027 review number: under $900 keep going; over $1,200 stop paid spend.")
aheads = ["Month", "Paying trainers (type)", "New paying trainers this month (type)", "Individuals (type)", "Trainer revenue (type)", "Individual revenue (type)", "Other revenue (type)", "Total revenue",
    "Developer (type)", "Marketing (type)", "Hosting and AI (type)", "Legal, accounting, insurance (type)", "Tools (type)", "Setup and one-time (type)", "Other expenses (type)",
    "Total expenses", "Operating profit", "Cost per paying trainer", "Facility draw (type)", "Loan opening balance", "Interest accrued", "Loan payment (type)", "Loan closing balance",
    "Distribution to Lauren (type)", "Distribution to Dustin (type)", "Cash balance per these books", "Bank balance per statement (type)", "Difference", "Year", "Notes (type)"]
for i, h in enumerate(aheads, start=1): put(f"{n_col(i)}{AR0 - 2}", h)
put(f"A{AR0 - 1}", "Opening position"); put(f"W{AR0 - 1}", 0); put(f"Z{AR0 - 1}", 0)
W0 = f"$W${AR0 - 1}"; Z0 = f"$Z${AR0 - 1}"
put(f"A{AR0}", f"=ARRAYFORMULA(EDATE(DATE(2026,10,1),SEQUENCE({AN})-1))")
put(f"H{AR0}", f"=ARRAYFORMULA(N({ar('E')})+N({ar('F')})+N({ar('G')}))")
put(f"P{AR0}", f"=ARRAYFORMULA(N({ar('I')})+N({ar('J')})+N({ar('K')})+N({ar('L')})+N({ar('M')})+N({ar('N')})+N({ar('O')}))")
put(f"Q{AR0}", f"=ARRAYFORMULA({ar('H')}-{ar('P')})")
put(f"R{AR0}", f'=ARRAYFORMULA(IF(N({ar("C")})>0,N({ar("J")})/N({ar("C")}),""))')
put(f"W{AR0}", f"=SCAN({W0},SEQUENCE({AN}),LAMBDA(a,i,a*(1+$B$30/12)+N(INDEX({ar('S')},i))-N(INDEX({ar('V')},i))))")
put(f"T{AR0}", f"={{{W0};W{AR0}:W{AR1 - 1}}}")
put(f"U{AR0}", f"=ARRAYFORMULA({ar('T')}*$B$30/12)")
put(f"Z{AR0}", f"=SCAN({Z0},SEQUENCE({AN}),LAMBDA(a,i,a+INDEX({ar('Q')},i)+N(INDEX({ar('S')},i))-N(INDEX({ar('V')},i))-N(INDEX({ar('X')},i))-N(INDEX({ar('Y')},i))))")
put(f"AB{AR0}", f'=ARRAYFORMULA(IF({ar("AA")}="","",{ar("AA")}-{ar("Z")}))')
put(f"AC{AR0}", f"=ARRAYFORMULA(YEAR({ar('A')}))")

# ---------------- write CSV
# a "." keeps otherwise-empty rows from being dropped on import, so every row
# number above stays true. It sits in a column no array formula spills into:
# D inside the projection band, H inside the loan band, A elsewhere.
maxr = 252
for r in range(1, maxr + 1):
    if not any(rr == r for rr, _ in cells):
        cells[(r, "D" if R0 < r <= R1 else "H" if LR0 < r <= LR1 else "A")] = "."
maxc = max(col_n(c) for _, c in cells)
with open(OUT, "w", newline="", encoding="utf-8") as fh:
    w = csv.writer(fh, lineterminator="\n")
    for r in range(1, maxr + 1):
        row = [cells.get((r, n_col(c)), "") for c in range(1, maxc + 1)]
        while row and row[-1] == "": row.pop()
        w.writerow(row)
import os; print("written", OUT, os.path.getsize(OUT), "bytes,", maxr, "rows")
