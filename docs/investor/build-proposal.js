const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType,
  HeadingLevel, BorderStyle, ShadingType, LevelFormat, PageBreak, Footer, PageNumber,
} = require("docx");

const NAVY = "0C2A47", GOLD = "C69E3C", INK = "1F2A37", GREY = "5B6470", LINE = "D9D6CD", SOFT = "F3F1EA";
const FONT = "Calibri";
const W = 9360; // 6.5in text width in DXA

const p = (text, opts = {}) => new Paragraph({
  spacing: { after: opts.after ?? 120, before: opts.before ?? 0, line: 276 },
  alignment: opts.align,
  children: (Array.isArray(text) ? text : [text]).map((t) =>
    typeof t === "string" ? new TextRun({ text: t, font: FONT, size: opts.size ?? 22, color: opts.color ?? INK, bold: opts.bold, italics: opts.italics }) : t),
});
const b = (text) => new TextRun({ text, font: FONT, size: 22, color: INK, bold: true });
const r = (text, o = {}) => new TextRun({ text, font: FONT, size: o.size ?? 22, color: o.color ?? INK, bold: o.bold, italics: o.italics });
const h1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 120 }, children: [new TextRun({ text: t, font: FONT, size: 30, bold: true, color: NAVY })] });
const h2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 80 }, children: [new TextRun({ text: t, font: FONT, size: 24, bold: true, color: NAVY })] });
const bullet = (children) => new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 80, line: 276 }, children: (Array.isArray(children) ? children : [children]).map((t) => typeof t === "string" ? r(t) : t) });
const num = (children) => new Paragraph({ numbering: { reference: "numbers", level: 0 }, spacing: { after: 80, line: 276 }, children: (Array.isArray(children) ? children : [children]).map((t) => typeof t === "string" ? r(t) : t) });
const rule = () => new Paragraph({ spacing: { after: 160 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: GOLD, space: 1 } }, children: [] });
const callout = (runs) => new Table({
  width: { size: W, type: WidthType.DXA }, columnWidths: [W],
  rows: [new TableRow({ children: [new TableCell({
    width: { size: W, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill: SOFT, color: "auto" },
    borders: { top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, left: { style: BorderStyle.SINGLE, size: 24, color: GOLD } },
    margins: { top: 140, bottom: 140, left: 200, right: 200 },
    children: runs.map((x) => new Paragraph({ spacing: { after: 80, line: 276 }, children: x.map((t) => typeof t === "string" ? r(t) : t) })),
  })] })],
});

function table(headers, rows, widths, opts = {}) {
  const cell = (text, i, isHead, isTotal) => new TableCell({
    width: { size: widths[i], type: WidthType.DXA },
    shading: isHead ? { type: ShadingType.CLEAR, fill: NAVY, color: "auto" } : isTotal ? { type: ShadingType.CLEAR, fill: SOFT, color: "auto" } : undefined,
    borders: { top: { style: BorderStyle.SINGLE, size: 4, color: LINE }, bottom: { style: BorderStyle.SINGLE, size: 4, color: LINE }, left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } },
    margins: { top: 70, bottom: 70, left: 100, right: 100 },
    children: [new Paragraph({ alignment: (opts.numeric && opts.numeric.includes(i)) ? AlignmentType.RIGHT : AlignmentType.LEFT, spacing: { after: 0 }, children: [new TextRun({ text: String(text), font: FONT, size: isHead ? 18 : 19, bold: isHead || isTotal, color: isHead ? "FFFFFF" : INK })] })],
  });
  return new Table({
    width: { size: W, type: WidthType.DXA }, columnWidths: widths,
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, i, true, false)) }),
      ...rows.map((row) => new TableRow({ children: row.cells.map((c, i) => cell(c, i, false, !!row.total)) })),
    ],
  });
}
const row = (cells, total = false) => ({ cells, total });

const children = [];
// ---- Cover block
children.push(new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "SYMMETRY PERSONAL TRAINING", font: FONT, size: 20, bold: true, color: GOLD, characterSpacing: 40 })] }));
children.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: "Symmetry App: Launch Investment Proposal", font: FONT, size: 40, bold: true, color: NAVY })] }));
children.push(p("A $274,000 loan facility, drawn as needed, plus 10% ownership to take a working coaching platform to market", { size: 26, color: GREY, after: 200 }));
children.push(table(["", ""], [
  row(["Prepared for", "Lauren Standefer"]), row(["Prepared by", "Dustin Gautreaux, Symmetry Personal Training"]),
  row(["Date", "12 September 2026 (replaces the proposal of 3 July 2026)"]), row(["Contact", "symmetrypersonaltraining@gmail.com · 972-832-6201 · Princeton, TX"]),
], [2200, 7160]));
children.push(p("", { after: 120 }));
children.push(h1("The proposal in five sentences"));
children.push(p("The Symmetry app already exists and runs my training business every day: 27 clients, 1,330 workouts and 13,975 sets logged since June, 2,367 meals logged, and $19,472 collected through its own invoicing. This money is not to build it; it is to turn it into a product other trainers and individuals pay for. I am asking for a committed $274,000 facility, drawn month by month only as the business needs it (about $238,000 on the base path, $146,000 on the optimistic), to fund one developer, a marketing lead, the launch, and six months of operations, with a review five months after launch. In return you receive 7% interest on the loan, with payments starting the month the app first covers its own running costs, and a 10% ownership stake in the company with a share of profits for as long as you hold it. Neither of us draws profit until the company has four months of expenses saved, and my training income stays separate, so the app never has to feed me before it feeds the business."));

// ---- 1
children.push(h1("1. What already exists"));
children.push(p("This is what makes the investment unusual: the product is built, live, and in daily use. Measured from the live database on 11 September 2026:"));
children.push(table(["Measure", "Today"], [
  row(["Active clients", "27 (36 all-time); 20 logged a workout in the last 7 days"]),
  row(["Workouts and sets logged since 17 June", "1,330 workouts, 13,975 sets"]),
  row(["Meals logged", "2,367"]),
  row(["Collected through the app's invoicing", "$19,472 across 41 invoices ($8,992 in July, $8,050 in August)"]),
  row(["AI features", "24 of 71 server routes are AI-backed; measured cost $0.55 per client per month"]),
  row(["Screens", "50 user-facing screens: trainer console and client app"]),
  row(["Engineering discipline", "320 automated test files, browser tests, three mandatory checks before every release, error log, health monitor"]),
], [3600, 5760]));
children.push(p("", { after: 80 }));
children.push(p([b("Built and in daily use: "), r("a trainer console (roster, client files, programme builder and calendar, exercise and video libraries, invoicing with emailed reminders, schedule-change queue, a phone-camera movement screen, AI and data health pages) and a client app (workout logger, nutrition with photo and text AI logging, meal-plan generation, progress charts, messages and group chat, recipes, body-fat calculator, onboarding). Two-way Google Calendar sync, email, and push notifications.")]));
children.push(p([b("What the developer builds: "), r("multi-trainer accounts with separated data (today one trainer is hard-wired), Stripe subscriptions, trainer sign-up and onboarding, then App Store and Google Play packaging. The app already installs to a phone's home screen as a web app, so the March launch does not wait for the stores.")]));
children.push(p([b("Why this matters to you: "), r("the 123,000-line codebase was built in under three months by one trainer working with AI coding tools, with no developer payroll. The expensive, risky part, building and proving the product with real clients, is done.")]));

// ---- 2
children.push(h1("2. What the $274,000 covers"));
children.push(p("A fractional marketing lead and one senior developer start in January 2027; I am the product owner. Two months of build, a web launch in March 2027, six months of launch marketing, and a review in August 2027. After the web launch the developer drops to three days a week, because the remaining work is store packaging and fixes, not a build. The money is a committed facility drawn month by month against that month's shortfall, so interest accrues only on money actually in use: the base path draws about $238,000 of the $274,000 before it turns, the optimistic about $146,000, and the rest stays available if the launch runs slower. Every line is a real launch cost; nothing here is salary for me."));
children.push(table(["Block", "Amount"], [
  row(["One-time setup: Texas LLC and registered agent, operating agreement, terms of service and privacy policy with lawyer review, trademark, Apple and Google developer accounts, D-U-N-S, SMS registration, insurance", "$8,000"]),
  row(["Pre-launch, January to February 2027: marketing lead, content and waitlist $24,000; developer $20,000; hosting, legal, tools $4,600", "$48,600"]),
  row(["Launch, March to August 2027: developer $45,000 (full time in March, three days a week after); marketing $120,000; hosting and AI $12,000; legal, accounting, insurance $9,000; tools $1,800", "$187,800"]),
  row(["Contingency, 12%", "$29,300"]),
  row(["Total", "$274,000"], true),
], [7160, 2200], { numeric: [1] }));
children.push(p("", { after: 80 }));
children.push(table(["Monthly running costs", "Pre-launch (Jan–Feb)", "Launch (Mar–Aug)", "After"], [
  row(["Developer (full time to launch, then three days a week)", "$10,000", "$10,000 then $7,000", "$7,000"]),
  row(["Marketing: fractional marketing lead, media buyer, content freelancer, and ads across paid search, Meta and Instagram, trainer podcasts and a newsletter, one trade-show booth", "$12,000", "$20,000", "$20,000"]),
  row(["Hosting and AI (Supabase, Vercel, Claude API, email, SMS, monitoring)", "$500", "$2,000", "$3,000"]),
  row(["Legal, accounting, insurance, payroll", "$1,500", "$1,500", "$1,500"]),
  row(["Tools", "$300", "$300", "$300"]),
  row(["Total", "$24,300", "$33,800 then $30,800", "$31,800"], true),
], [4260, 1700, 1700, 1700], { numeric: [1, 2, 3] }));
children.push(p("", { after: 80 }));
children.push(p([b("Who runs the marketing. "), r("Not a full-service agency: at $20,000 a month an agency takes $6,500 to $10,000 in fees, wants a 6 to 12 month contract above the entry tier, includes no PR, and still needs me for positioning and every piece of trainer-facing content. The plan uses a fractional marketing lead who has launched software before (1 to 2 days a week), a freelance media buyer on a flat fee, and a content freelancer, started January 2027 so the funnel is working on launch day, with a three-month fitness-industry PR push around March. If a single company is preferred, two fit the budget and stage on month-to-month terms (Directive, Bay Leaf Digital in Texas), with our own ad accounts and a 90-day exit written in.")]));
children.push(p([b("Option B. "), r("If you would rather not fund the developer, that line ($65,000 for January to August) is borrowed elsewhere and the commitment from you becomes $209,000; everything else stays the same.")]));

// ---- 3
children.push(h1("3. How the investment is structured"));
children.push(table(["Term", "Detail"], [
  row(["You commit", "A $274,000 loan facility to the company (a Texas LLC). The company draws only each month's shortfall, starting January 2027; the projections draw about $238,000 on the base path and $146,000 on the optimistic, and the full amount is there if the launch runs slower"]),
  row(["Loan interest", "7% a year, accruing from the day funds are drawn"]),
  row(["Loan repayment", "Payments begin the first month the app's revenue covers its running costs (break-even), then amortise over five years"]),
  row(["Ownership", "10% membership interest in the LLC, written into the operating agreement"]),
  row(["Profit share", "10% of profit distributions for as long as you hold the interest; you may sell it back to me later if you wish"]),
  row(["Profit draws", "No profit is drawn by either of us until the business account holds four months of operating expenses (about $139,000) in retained earnings"]),
  row(["Control", "Day-to-day decisions stay with me; the operating agreement sets out what needs your consent"]),
  row(["Who owes the money", "The LLC only. My personal training income is separate and is not part of this"]),
  row(["Your risk", "Payments come from the company's revenue. If revenue is slow, payments start later; there is no personal guarantee"]),
], [2600, 6760]));
children.push(p("", { after: 80 }));
children.push(p([b("Why a loan plus a stake rather than a straight sale of equity: "), r("the loan gives you a defined return with a clear finish line; the 10% stake gives you the upside if the app becomes what I believe it can, and a share of the company if it is ever sold. Both are in one plain agreement reviewed by a lawyer before either of us signs.")]));

// ---- 4
children.push(h1("4. What the launch brings in"));
children.push(p("These are projections built from published benchmarks for small-business software (trial conversion of 10 to 15%, monthly churn of 4 to 7%, cost of $500 to $1,500 to win one paying trainer), and from what founder-led launches in this category actually did. They are not guarantees. Trainers are modelled at an average of $115 a month on the pricing below; individuals at $49."));
children.push(table(["Months after the March 2027 launch", "Conservative", "Base", "Optimistic"], [
  row(["6 (August 2027, the review)", "62 trainers + 22 individuals · $8,200/mo", "120 + 65 · $17,000/mo", "199 + 131 · $29,300/mo"]),
  row(["12 (February 2028)", "107 + 35 · $14,100", "217 + 105 · $30,000", "373 + 210 · $53,200"]),
  row(["18 (August 2028)", "137 + 42 · $17,800", "285 + 126 · $39,000", "509 + 252 · $70,900"]),
  row(["24 (February 2029)", "156 + 46 · $20,100", "334 + 137 · $45,100", "616 + 275 · $84,300"]),
  row(["36 (February 2030)", "176 + 49 · $22,600", "393 + 146 · $52,400", "765 + 293 · $102,300"]),
  row(["Monthly break-even ($31,800); loan payments start", "not reached", "month 14, spring 2028", "month 7, late 2027"], true),
  row(["Cash-positive with the loan payment included", "not reached", "month 18, autumn 2028", "month 8, late 2027"], true),
], [3060, 2100, 2100, 2100]));
children.push(p("", { after: 80 }));
children.push(p([b("What the August 2027 review decides. "), r("The facility carries the base case through its deepest need, about $242,000 drawn at the peak including the first months of loan payments, with about $32,000 of headroom and no second loan; the optimistic case peaks at about $146,000. The conservative case is the one money cannot fix: revenue never reaches expenses, so on that path the decision is to cut paid marketing to what the founder-led funnel supports and rethink the channel. The number to read in August is cost per paying trainer: under $900 and holding, keep going; over $1,200, stop paid spend.")]));
children.push(p([b("What you receive. "), r("Interest of about $32,500 to $62,000 on the money actually drawn, over the five years of payments, with the first payment in late 2027 on the optimistic path or mid 2028 on the base path, plus 10% of profit distributions once the reserve is met, plus 10% of the company's value if it is ever sold.")]));
children.push(table(["Path", "Payments start", "Balance then, incl. accrued 7%", "Monthly payment, 5 years", "Total interest to you"], [
  row(["Optimistic", "month 7 after launch, late 2027", "$145,900", "$2,890", "$32,500"]),
  row(["Base", "month 14, spring 2028", "$238,000", "$4,710", "$62,000"]),
  row(["Conservative", "not reached; the August review changes course", "accrues", "—", "—"]),
], [1500, 2700, 1900, 1660, 1600], { numeric: [2, 3, 4] }));

// ---- 5
children.push(h1("5. How the money will be handled"));
children.push(num("All app revenue lands in a dedicated business bank account under the LLC."));
children.push(num("Operating costs (developer, marketing, hosting, fees) are paid first."));
children.push(num("Retained earnings build in that account until they cover four months of operating expenses."));
children.push(num("Your loan payments begin the first month revenue covers running costs; on the base projection that is spring 2028."));
children.push(num("Once the four-month reserve is met, profit distributions start, 10% to you and 90% to me, with the reserve kept in place."));
children.push(num("Until then I take nothing from the app. My training business is my income."));

// ---- 6
children.push(h1("6. Pricing and the market"));
children.push(p([b("Symmetry pricing: "), r("trainers pay $79 a month for up to 5 clients, plus $15 for each further 5 clients, capped at $199. Individuals training on their own pay $49 a month. No fee on client payments, no add-ons, no price cliffs.")]));
children.push(table(["Clients", "Symmetry", "Competitors at the same size (2026)"], [
  row(["5", "$79", "CoachRx $29 · TrueCoach $29.98 · PT Distinction $19.90 (3 clients)"]),
  row(["20", "$124", "TrueCoach $69.98 · PT Distinction $59.90 (25)"]),
  row(["30", "$154", "Trainerize about $115 plus add-ons"]),
  row(["45 and up", "$199 cap", "PT Distinction $89.90 · Kahunas $69–99 · CoachRx $79 · TrueCoach $164.98 · Trainerize about $190 with add-ons"]),
], [1400, 1400, 6560]));
children.push(p("", { after: 80 }));
children.push(p([b("Why a specialist can charge this: "), r("of the ten leading trainer platforms, only one offers any movement assessment and none turns an assessment into a corrective programme. Symmetry's assessment-driven corrective programming is the wedge, aimed at the post-rehab and over-40 market, which is the fastest-growing gym cohort and the least served by trainers.")]));
children.push(p([b("What trainers complain about, and Symmetry avoids: "), r("hidden add-ons (Trainerize, Everfit), fees on client payments (CoachRx charges 2% on top of Stripe), price cliffs at 20 or 50 clients, client apps that lose a workout mid-session, and support decay after the two market leaders were acquired.")]));
children.push(p([b("The market, honestly: "), r("about 323,000 employed trainers and instructors in the US, roughly 450,000 to 600,000 including independents. The incumbents took ten or more years and full teams to reach $5 to $25 million in revenue; none raised more than about $4.5 million. This is a durable, mid-sized market, not a lottery ticket.")]));

// ---- 7
children.push(h1("7. The honest risks"));
children.push(bullet([b("The paid funnel working at scale. "), r("The base case needs about 190 trial sign-ups a month from a $20,000 budget. No company in this category has published growth like that from a standing start. This is the biggest risk, and the August review exists to catch it early.")]));
children.push(bullet([b("Founder time. "), r("I run a full training roster. The developer carries the engineering; I carry product decisions, onboarding and the first customers. Part-time founders grow slower than full-time ones, and the projections already assume that.")]));
children.push(bullet([b("Multi-trainer engineering. "), r("Separating one trainer's data into many is the largest build item and the one most likely to slip. A March web launch depends on it landing in two months; the stores follow.")]));
children.push(bullet([b("Timing of your repayment. "), r("Payments start at break-even, which the projections put at month 8 to 16 after launch. On the conservative path the app never gets there on its own, which is why the August 2027 review is a hard checkpoint: if the cost to win a trainer is over $1,200, paid marketing stops and the plan changes before more money is spent.")]));

// ---- 8 figures to confirm
children.push(h1("8. Figures to confirm before signing"));
children.push(p("Competitor prices were cross-checked against two independent listings each on 11 September 2026, and ad-cost benchmarks are from 2026 industry reports. The items below are estimates I will replace with quotes over the next few weeks; each changes the totals by a few thousand dollars at most and the model updates in minutes."));
children.push(bullet([b("Developer: "), r("rate, hours, January start and prior Next.js, Supabase and Stripe work, in writing (budgeted $10,000 a month full time, $7,000 at three days a week).")]));
children.push(bullet([b("Marketing lead and media buyer: "), r("two quotes for a fractional software-marketing lead at one to two days a week and one flat-fee media buyer (budgeted $8,500 a month together).")]));
children.push(bullet([b("Lawyer: "), r("a fixed fee for the operating agreement with your 10% interest, the loan note, and the terms and privacy review (budgeted $3,000 to $5,500 within setup).")]));
children.push(bullet([b("Insurance: "), r("one quote for general liability plus cyber for a small software LLC (budgeted $2,000 to $5,000 a year).")]));
children.push(bullet([b("Hosting: "), r("current Supabase and Vercel list prices (budgeted $2,000 to $3,000 a month including AI at scale).")]));
children.push(bullet([b("Average trainer price: "), r("the $115 average assumes a typical client mix; after the first 30 sign-ups it becomes the measured number.")]));
children.push(bullet([b("Apple link-out fee: "), r("0% today for US web checkout; a 5% small-business rate is proposed and pending court approval.")]));
// ---- 9
children.push(h1("9. Next steps"));
children.push(num("You review this and ask me anything."));
children.push(num("If you are in, a lawyer drafts the loan note and the operating agreement with your 10% interest from a one-page term sheet we agree first."));
children.push(num("I form the LLC and open the business bank account."));
children.push(num("First draw in January 2027 when the developer and marketing lead start; draws continue month by month against the shortfall; review August 2027."));
children.push(p("", { after: 120 }));
children.push(p("This is a plain-language planning document, not legal or financial advice. Revenue figures are good-faith projections from published benchmarks, not guarantees. Cost figures are 2026 estimates to be confirmed with quotes. Any final agreement will be put in writing and reviewed by a lawyer before either of us signs.", { size: 19, color: GREY, italics: true }));

const doc = new Document({
  creator: "Dustin Gautreaux",
  title: "Symmetry App: Launch Investment Proposal",
  styles: { default: { document: { run: { font: FONT, size: 22, color: INK } } } },
  numbering: { config: [
    { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] },
    { reference: "numbers", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 300 } } } }] },
  ] },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1300, bottom: 1200, left: 1440, right: 1440 } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Symmetry Personal Training · Confidential · Page ", font: FONT, size: 16, color: GREY }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: GREY })] })] }) },
    children,
  }],
});
Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(process.argv[2], buf); console.log("written", buf.length); });
