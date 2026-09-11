// Builds Symmetry-Business-Plan-<date>.docx from the figures in the 12 Sep 2026
// investment proposal (build-proposal.js). Every number here comes from that
// proposal or the working page symmetry-launch-plan-v2.html; change it there
// first, then here, then rebuild both.
//
//   npm install docx@9   (in a scratch dir)
//   NODE_PATH=<scratch>/node_modules node docs/investor/build-business-plan.js out.docx
const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType,
  HeadingLevel, BorderStyle, ShadingType, LevelFormat, Footer, PageNumber, PageBreak,
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
const num = (children, inst = 0) => new Paragraph({ numbering: { reference: "numbers", level: 0, instance: inst }, spacing: { after: 80, line: 276 }, children: (Array.isArray(children) ? children : [children]).map((t) => typeof t === "string" ? r(t) : t) });
const pageBreak = () => new Paragraph({ children: [new PageBreak()] });
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

const c = [];
const gap = (after = 80) => c.push(p("", { after }));

// ---- Cover
c.push(new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "SYMMETRY PERSONAL TRAINING", font: FONT, size: 20, bold: true, color: GOLD, characterSpacing: 40 })] }));
c.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: "Symmetry App: Business Plan", font: FONT, size: 40, bold: true, color: NAVY })] }));
c.push(p("Taking a working, client-proven coaching platform to market as a subscription product for trainers and individuals", { size: 26, color: GREY, after: 200 }));
c.push(table(["", ""], [
  row(["Company", "Symmetry Personal Training; the app to be held by a new Texas LLC"]),
  row(["Prepared by", "Dustin Gautreaux, founder and product owner"]),
  row(["Date", "12 September 2026"]),
  row(["Companion document", "Symmetry App: Launch Investment Proposal, 12 September 2026, prepared for Lauren Standefer"]),
  row(["Contact", "symmetrypersonaltraining@gmail.com · 972-832-6201 · Princeton, TX"]),
], [2200, 7160]));
gap(120);
c.push(callout([
  [b("How to read this plan. "), r("The investment proposal is the short document: what is being asked for and what the investor receives. This is the long one: how the business works, who it sells to, how it reaches them, what it costs to run, and what happens on each of three revenue paths. Every figure in here is the same figure as in the proposal. Where a number is an estimate still to be confirmed with a quote, section 11 says so.")],
]));

// ---- 1
c.push(h1("1. Executive summary"));
c.push(p("Symmetry is a coaching platform built by a working personal trainer, for the way personal training is actually delivered. It has run Symmetry Personal Training's client roster every day since June 2026: 27 active clients, 1,330 workouts and 13,975 sets logged, 2,367 meals logged, and $19,472 collected through its own invoicing. It is a trainer console and a client app in one product, with AI logging, meal planning, programme building, a phone-camera movement screen, and two-way Google Calendar sync. The 123,000-line codebase was built in under three months by one trainer working with AI coding tools, with no developer payroll."));
c.push(p("The business plan is to turn that proven single-trainer product into a subscription product that other trainers and individuals pay for. That requires four pieces of engineering (multi-trainer accounts with separated data, Stripe subscriptions, trainer sign-up and onboarding, and store packaging), a marketing function that exists before launch day, and about eight months of funded operations."));
c.push(p([b("The offer. "), r("Trainers pay $79 a month for up to 5 clients, plus $15 for each further 5, capped at $199. Individuals training on their own pay $49 a month. No fee on client payments, no add-ons, no price cliffs. The product's wedge is assessment-driven corrective programming for post-rehab and over-40 clients, which none of the ten leading trainer platforms offers.")]));
c.push(p([b("The plan. "), r("A fractional marketing lead and one senior developer start in January 2027. Two months of build, a web launch in March 2027, six months of launch marketing at $20,000 a month, and a hard review in August 2027, five months after launch. After the web launch the developer drops to three days a week.")]));
c.push(p([b("The money. "), r("A committed $274,000 loan facility from Lauren Standefer to the LLC, drawn month by month only against that month's shortfall, at 7% interest accruing on drawn funds, with payments starting the first month revenue covers running costs and then amortising over five years. Lauren also takes a 10% membership interest in the LLC with 10% of profit distributions. The base projection draws about $238,000 of the facility; the optimistic about $146,000.")]));
c.push(p([b("The outcome, base case. "), r("About 120 paying trainers and 65 individuals by the August 2027 review ($17,000 a month), 217 trainers and $30,000 a month at month 12, monthly break-even around month 14 (spring 2028), and cash-positive with the loan payment included around month 18. The optimistic case breaks even at month 7. The conservative case never reaches expenses on its own, and the August review is designed to catch that early and change course before more money is spent.")]));
c.push(table(["Headline figures", ""], [
  row(["Funding sought", "$274,000 committed loan facility, drawn as needed; 7% on drawn funds; five-year amortisation from break-even"]),
  row(["Investor ownership", "10% membership interest with 10% of profit distributions, and a right to sell it back later"]),
  row(["Monthly running cost after launch", "$31,800 (developer $7,000, marketing $20,000, hosting and AI $3,000, legal and accounting $1,500, tools $300)"]),
  row(["Revenue at month 12, base case", "$30,000 a month from 217 trainers and 105 individuals"]),
  row(["Break-even, base case", "Month 14 after launch, spring 2028; loan payments of about $4,710 a month start then"]),
  row(["Profit policy", "No draws by either owner until four months of expenses (about $139,000) are held in retained earnings"]),
], [3000, 6360]));

// ---- 2
c.push(h1("2. The company"));
c.push(p([b("What Symmetry Personal Training is today. "), r("A personal training business in Princeton, Texas, run by Dustin Gautreaux, with 27 active clients (19 in person, 8 online) and 36 clients all-time. The business has invoiced through the app since July 2026: $8,992 in July, $8,050 in August, $19,472 in total across 41 invoices. That training business is the founder's income and stays entirely separate from the app company.")]));
c.push(p([b("What is being formed. "), r("A new Texas LLC to own and operate the Symmetry app. Dustin Gautreaux holds 90% and runs it day to day; Lauren Standefer holds a 10% membership interest written into the operating agreement, which sets out what needs her consent. The LLC is the only borrower under the loan facility; there is no personal guarantee.")]));
c.push(p([b("Mission. "), r("Give trainers the tool a trainer would have built: one product that runs the whole relationship with a client (assessment, programme, logging, nutrition, messages, scheduling and payment), priced plainly, with no fees on client payments and no add-ons.")]));
c.push(p([b("Stage. "), r("Product built, live, and in daily use with real clients. Not yet a company, not yet multi-tenant, not yet selling subscriptions. The funding in this plan is for commercialisation, not for building the product.")]));
c.push(p([b("Legal and compliance footing. "), r("Setup covers the Texas LLC and registered agent, the operating agreement, terms of service and privacy policy with lawyer review, a trademark, Apple and Google developer accounts, a D-U-N-S number, SMS registration, and general liability plus cyber insurance. HIPAA does not apply to this product; the FTC Health Breach Notification Rule and Texas privacy law do, and the terms and privacy work is scoped to them.")]));

// ---- 3
c.push(h1("3. Product and services"));
c.push(h2("3.1 What exists and is in daily use"));
c.push(p("Measured from the live database and codebase on 11 September 2026:"));
c.push(table(["Measure", "Today"], [
  row(["Active clients", "27 (36 all-time); 20 logged a workout in the last 7 days"]),
  row(["Workouts and sets logged since 17 June", "1,330 workouts, 13,975 sets"]),
  row(["Meals logged", "2,367"]),
  row(["Collected through the app's invoicing", "$19,472 across 41 invoices"]),
  row(["AI features", "24 of 71 server routes are AI-backed; measured cost $0.55 per client per month"]),
  row(["Screens", "50 user-facing screens across the trainer console and the client app"]),
  row(["Engineering discipline", "320 automated test files, browser tests, three mandatory checks before every release, an error log and a health monitor"]),
], [3600, 5760]));
gap();
c.push(p([b("Trainer console: "), r("roster, client files, programme builder and calendar, exercise and video libraries, invoicing with emailed reminders, a schedule-change queue, a phone-camera movement screen, and AI and data health pages.")]));
c.push(p([b("Client app: "), r("workout logger, nutrition with photo and text AI logging, meal-plan generation, progress charts, messages and group chat, recipes, a body-fat calculator, and onboarding. The app installs to a phone's home screen as a web app today.")]));
c.push(p([b("Integrations: "), r("two-way Google Calendar sync, email, and push notifications.")]));
c.push(h2("3.2 What the developer builds before launch"));
c.push(num([b("Multi-trainer accounts with separated data. "), r("Today one trainer is hard-wired. This is the largest build item and the one most likely to slip; the March web launch depends on it landing in January and February.")], 1));
c.push(num([b("Stripe subscriptions. "), r("Plans, seats and billing, sold on the web. The app tracks invoices today, but subscription money does not move through it yet.")], 1));
c.push(num([b("Trainer sign-up and onboarding. "), r("Self-serve account creation and a first-run path for a trainer arriving from an ad or a podcast.")], 1));
c.push(num([b("App Store and Google Play packaging, "), r("April to August, alongside the launch. The web app launches first and does not wait for the stores.")], 1));
c.push(h2("3.3 Pricing"));
c.push(p("Trainers pay $79 a month for up to 5 clients, plus $15 for each further 5 clients, capped at $199. Individuals pay $49 a month. Both count as app revenue. The projections model trainers at a $115 average across a typical client mix; after the first 30 sign-ups that becomes the measured number."));
c.push(table(["Clients", "Symmetry", "Competitors at the same size (2026)"], [
  row(["5", "$79", "CoachRx $29 · TrueCoach $29.98 · PT Distinction $19.90 (3 clients)"]),
  row(["20", "$124", "TrueCoach $69.98 · PT Distinction $59.90 (25)"]),
  row(["30", "$154", "Trainerize about $115 plus add-ons"]),
  row(["45 and up", "$199 cap", "PT Distinction $89.90 · Kahunas $69–99 · CoachRx $79 · TrueCoach $164.98 · Trainerize about $190 with add-ons"]),
], [1400, 1400, 6560]));
gap();
c.push(p("Below 20 clients Symmetry is priced above every competitor, sometimes by three times. That holds only if the assessment-to-programme engine is live and visible on day one, because it is the one thing nobody else sells. The cap removes the price cliff trainers complain about most, and charging nothing on client payments is the norm that the exceptions are resented for."));
c.push(h2("3.4 Unit economics"));
c.push(p("Hosting and AI are the only costs that scale with users. AI cost is measured at $0.55 per client per month; the plan budgets $2,000 a month for hosting and AI during launch and $3,000 after, including AI at scale. Against $79 to $199 a month per trainer, the number that decides the business is the cost to win one paying trainer: it has to stay under about $800 to $1,200, and any marketing structure that spends more than half its budget on fees is fighting that arithmetic."));

// ---- 4
c.push(h1("4. Market analysis"));
c.push(h2("4.1 Who the customers are"));
c.push(p([b("Trainers. "), r("Independent and gym-based personal trainers who run a roster of clients and need one tool for programming, logging, nutrition, messaging, scheduling and getting paid. The specific wedge is trainers working with post-rehab and over-40 clients, the fastest-growing gym cohort and the least served by trainers, where assessment-driven corrective programming is the core of the service.")]));
c.push(p([b("Individuals. "), r("People training on their own who want the client app's logging, nutrition, meal planning and progress tracking without a trainer, at $49 a month.")]));
c.push(h2("4.2 Market size, honestly"));
c.push(p("About 323,000 employed trainers and instructors in the US, roughly 450,000 to 600,000 including independents. Published market-size reports for trainer software vary so widely that they are not usable; the incumbents took ten or more years and full teams to reach $5 to $25 million in revenue, and none raised more than about $4.5 million. This is a durable, mid-sized market, not a lottery ticket. The base case in this plan, 393 trainers at month 36, is a fraction of one percent of the employed population."));
c.push(h2("4.3 Competition and where it is weak"));
c.push(p("The ten leading trainer platforms (Trainerize, TrueCoach, PT Distinction, CoachRx, Kahunas, Everfit, Hevy Coach and others) were priced from two independent listings each on 11 September 2026. What trainers complain about, consistently:"));
c.push(bullet("Hidden add-ons (Trainerize, Everfit) that make the list price meaningless at any real roster size."));
c.push(bullet("Fees on client payments (CoachRx charges 2% on top of Stripe)."));
c.push(bullet("Price cliffs at 20 or 50 clients."));
c.push(bullet("Client apps that lose a workout mid-session."));
c.push(bullet("Support decay after the two market leaders were acquired."));
c.push(p("Only one of the ten offers any movement assessment, and none turns an assessment into a corrective programme. Symmetry's assessment-driven corrective programming is the differentiator the pricing depends on, and it is why a specialist can charge above the field below 20 clients and sit with TrueCoach and Trainerize-with-add-ons at the cap."));
c.push(h2("4.4 How launches in this category actually go"));
c.push(p("With no marketing budget, founder-led software launches in this category typically sit under $1,000 a month at month 12. The closest analogue, a gym co-owner selling a programming tool to peers, plateaued at $7,000 to $8,000 a month. TrueCoach's founders reached about $100,000 a month in five years by putting savings into paid ads. Acquisition spend is what separates those outcomes, which is why this plan funds the launch more heavily than the build, and why the model was also run with marketing cut to $10,000 a month after month 6: every scenario got worse, so the spend stays unless the funnel is shown not to work."));

// ---- 5
c.push(h1("5. Marketing and sales plan"));
c.push(h2("5.1 Positioning"));
c.push(p("The trainer's tool, built by a trainer, that turns a movement assessment into a corrective programme, with plain pricing and no fees on client payments. Aimed first at trainers serving post-rehab and over-40 clients, where that capability is the whole service, and then outward."));
c.push(h2("5.2 Who runs it"));
c.push(p("Not a full-service agency. At $20,000 a month an agency takes $6,500 to $10,000 in fees, wants a 6 to 12 month contract above its entry tier, includes no PR, and still needs the founder for positioning and every piece of trainer-facing content. The plan uses:"));
c.push(bullet([b("A fractional marketing lead "), r("who has launched software before, one to two days a week, owning the plan from January 2027.")]));
c.push(bullet([b("A freelance media buyer "), r("on a flat fee, which beats a percentage below $20,000 of monthly spend.")]));
c.push(bullet([b("A content freelancer "), r("producing trainer-facing content the founder directs.")]));
c.push(bullet([b("A three-month fitness-industry PR push "), r("around the March launch, paid for from the ad line in those months.")]));
c.push(p("If a single company is preferred, two fit the budget and the stage on month-to-month terms (Directive, and Bay Leaf Digital in Texas), with the company owning its own ad accounts, a 90-day exit, and trial and paid-conversion targets written into the contract."));
c.push(h2("5.3 Channels"));
c.push(p("Paid search, Meta and Instagram, trainer podcasts, an industry newsletter, and one trade-show booth. No agency category exists for marketing to trainers on behalf of fitness software, so the reachable vertical channels are trainer podcasts, the fitness-industry newsletters, and the Perform Better and IDEA events. Subscriptions are sold on the web through Stripe; a US app may link out to web checkout with 0% Apple commission today (a 5% small-business rate is proposed and pending), against 15% if sold in-app."));
c.push(h2("5.4 Budget and timing"));
c.push(table(["Phase", "Monthly marketing", "What it buys"], [
  row(["Pre-launch, January to February 2027", "$12,000", "Marketing lead and content, light ads, positioning, site, tracking and a waitlist, so the funnel exists on launch day"]),
  row(["Launch, March to August 2027", "$20,000", "Lead, media buyer, content freelancer, ads across the channels above, the PR push, one booth"]),
  row(["After the August review", "$20,000", "Held at this level while cost per paying trainer stays under target"]),
], [3000, 1700, 4660]));
gap();
c.push(h2("5.5 The funnel arithmetic"));
c.push(p("The projections are a cohort model. Each month, marketing spend divided by the cost to win one paying trainer gives new trainers; a monthly churn rate removes some. The first two launch months run at 60% and 85% of that rate because the funnel, site and waitlist are built before launch. Individuals are modelled at 5, 15 or 30 new a month with 10% monthly churn, scaled to spend. The base case needs about 190 trial sign-ups a month at 10 to 15% trial conversion from the $20,000 budget. No company in this category has published growth like that from a standing start, which is why it is the biggest risk in the plan and why the August review exists."));
c.push(table(["Scenario", "Cost to win one paying trainer", "Monthly trainer churn"], [
  row(["Conservative", "$1,500", "7%"]),
  row(["Base", "$800", "5.5%"]),
  row(["Optimistic", "$500", "4%"]),
], [2400, 3800, 3160]));

// ---- 6
c.push(h1("6. Operations plan"));
c.push(h2("6.1 Team"));
c.push(table(["Role", "Who", "Cost", "Notes"], [
  row(["Founder and product owner", "Dustin Gautreaux", "Nothing from the app", "Product decisions, onboarding, first customers, content direction; continues to run a full training roster, which is his income"]),
  row(["Senior full-stack developer", "One hire, January 2027; a candidate is in view", "$10,000 a month full time to launch, then $7,000 at three days a week", "Next.js, Supabase and Stripe experience required; carries the engineering"]),
  row(["Fractional marketing lead", "To be engaged, January 2027", "Within the $8,500 a month budgeted for lead plus media buyer", "One to two days a week; has launched software before"]),
  row(["Media buyer, content freelancer", "Freelance", "Within the marketing line", "Flat-fee media; content directed by the founder"]),
  row(["Lawyer, accountant, insurer", "Engaged as needed", "$1,500 a month plus setup", "Operating agreement, loan note, terms and privacy; books and tax; general liability plus cyber"]),
], [2000, 2300, 2300, 2760]));
gap();
c.push(h2("6.2 Timeline"));
c.push(table(["When", "What happens"], [
  row(["Autumn 2026", "Agreement with Lauren; lawyer drafts the loan note and operating agreement from a one-page term sheet; quotes gathered for the figures in section 11"]),
  row(["December 2026", "Texas LLC formed, business bank account opened, developer and marketing lead contracted"]),
  row(["January 2027", "First draw. Developer starts the multi-trainer build; marketing lead starts positioning, site, tracking and waitlist"]),
  row(["February 2027", "Stripe subscriptions, trainer sign-up and onboarding; waitlist and content running"]),
  row(["March 2027", "Web launch. Marketing to $20,000 a month; PR push begins; developer full time through March"]),
  row(["April to August 2027", "Developer at three days a week: store packaging, fixes; App Store and Google Play submissions"]),
  row(["August 2027", "The review, five months after launch (section 9)"]),
  row(["Spring 2028 (base case)", "Monthly break-even; loan payments begin"]),
], [2400, 6960]));
gap();
c.push(h2("6.3 Infrastructure"));
c.push(p("Next.js on Vercel, Supabase Postgres, the Claude API for AI features, email, SMS, monitoring, domain and workspace. Budgeted at $500 a month pre-launch, $2,000 a month through launch and $3,000 a month after, including AI at scale. The app already carries an error log, a health monitor, browser tests and three mandatory checks before every release."));
c.push(h2("6.4 How the money is handled"));
c.push(num("All app revenue lands in a dedicated business bank account under the LLC.", 2));
c.push(num("Operating costs (developer, marketing, hosting, fees) are paid first.", 2));
c.push(num("Each month's shortfall, and only the shortfall, is drawn from the facility.", 2));
c.push(num("Retained earnings build in that account until they cover four months of operating expenses, about $139,000.", 2));
c.push(num("Loan payments begin the first month revenue covers running costs; on the base projection that is spring 2028.", 2));
c.push(num("Once the four-month reserve is met, profit distributions start, 10% to Lauren and 90% to Dustin, with the reserve kept in place.", 2));
c.push(num("Until then the founder takes nothing from the app.", 2));

// ---- 7
c.push(h1("7. Management and ownership"));
c.push(p([b("Dustin Gautreaux, founder, 90%. "), r("Working personal trainer; built the 123,000-line Symmetry codebase in under three months with AI coding tools and runs his business on it daily. Product owner for the app company; draws no salary and no profit from it until the reserve is met.")]));
c.push(p([b("Lauren Standefer, member, 10%. "), r("Lender under the $274,000 facility and holder of a 10% membership interest with 10% of profit distributions for as long as she holds it, and the right to sell the interest back to Dustin later. Day-to-day decisions stay with Dustin; the operating agreement sets out what needs her consent.")]));
c.push(p([b("Why a loan plus a stake rather than a straight sale of equity. "), r("The loan gives the investor a defined return with a clear finish line; the 10% stake gives her the upside if the app becomes what the founder believes it can, and a share of the company if it is ever sold. Both sit in one plain agreement reviewed by a lawyer before either party signs.")]));

// ---- 8
c.push(pageBreak());
c.push(h1("8. Financial plan"));
c.push(h2("8.1 Use of funds"));
c.push(table(["Block", "Amount"], [
  row(["One-time setup: Texas LLC and registered agent, operating agreement, terms of service and privacy policy with lawyer review, trademark, Apple and Google developer accounts, D-U-N-S, SMS registration, insurance", "$8,000"]),
  row(["Pre-launch, January to February 2027: marketing lead, content and waitlist $24,000; developer $20,000; hosting, legal, tools $4,600", "$48,600"]),
  row(["Launch, March to August 2027: developer $45,000 (full time in March, three days a week after); marketing $120,000; hosting and AI $12,000; legal, accounting, insurance $9,000; tools $1,800", "$187,800"]),
  row(["Contingency, 12%", "$29,300"]),
  row(["Total facility", "$274,000"], true),
  row(["Of which the developer, January to August (Option B: borrowed separately if the investor prefers not to fund it; the commitment then becomes $209,000)", "$65,000"]),
], [7160, 2200], { numeric: [1] }));
gap();
c.push(h2("8.2 Monthly operating budget"));
c.push(table(["Line", "Pre-launch (Jan–Feb)", "Launch (Mar–Aug)", "After"], [
  row(["Developer (full time to launch, then three days a week)", "$10,000", "$10,000 then $7,000", "$7,000"]),
  row(["Marketing: fractional lead, media buyer, content freelancer, ads, podcasts, newsletter, one booth", "$12,000", "$20,000", "$20,000"]),
  row(["Hosting and AI (Supabase, Vercel, Claude API, email, SMS, monitoring)", "$500", "$2,000", "$3,000"]),
  row(["Legal, accounting, insurance, payroll", "$1,500", "$1,500", "$1,500"]),
  row(["Tools", "$300", "$300", "$300"]),
  row(["Total", "$24,300", "$33,800 then $30,800", "$31,800"], true),
], [4260, 1700, 1700, 1700], { numeric: [1, 2, 3] }));
gap();
c.push(p("Monthly break-even is defined as revenue of $31,800 or more, the running cost after launch with the loan payment excluded. Loan payments start the first month that line is crossed."));
c.push(h2("8.3 Revenue projections"));
c.push(p("Three paths from the cohort model in section 5.5. Trainers at the $115 average, individuals at $49. These are projections built from published benchmarks for small-business software (trial conversion of 10 to 15%, monthly churn of 4 to 7%, cost of $500 to $1,500 to win one paying trainer) and from what founder-led launches in this category actually did. They are not guarantees."));
c.push(table(["Months after the March 2027 launch", "Conservative", "Base", "Optimistic"], [
  row(["6 (August 2027, the review)", "62 trainers + 22 individuals · $8,200/mo", "120 + 65 · $17,000/mo", "199 + 131 · $29,300/mo"]),
  row(["12 (February 2028)", "107 + 35 · $14,100", "217 + 105 · $30,000", "373 + 210 · $53,200"]),
  row(["18 (August 2028)", "137 + 42 · $17,800", "285 + 126 · $39,000", "509 + 252 · $70,900"]),
  row(["24 (February 2029)", "156 + 46 · $20,100", "334 + 137 · $45,100", "616 + 275 · $84,300"]),
  row(["36 (February 2030)", "176 + 49 · $22,600", "393 + 146 · $52,400", "765 + 293 · $102,300"]),
  row(["Monthly break-even ($31,800); loan payments start", "not reached", "month 14, spring 2028", "month 7, late 2027"], true),
  row(["Peak drawn from the facility", "keeps growing", "about $242,000", "about $146,000"], true),
  row(["Cash-positive with the loan payment included", "not reached", "month 18, autumn 2028", "month 8, late 2027"], true),
], [3060, 2100, 2100, 2100]));
gap();
c.push(h2("8.4 The facility and how it is repaid"));
c.push(p("The facility is $274,000. Because it is drawn month by month against the shortfall, interest accrues only on money actually in use. The base path draws about $238,000 before it turns and peaks at about $242,000 including the first months of loan payments, leaving about $32,000 of headroom with no second loan and without Option B. The optimistic path peaks at about $146,000. Under Option B the commitment is $209,000 and the base path draws about $175,000."));
c.push(table(["Path", "Payments start", "Balance then, incl. accrued 7%", "Monthly payment, 5 years", "Total interest to the investor", "Trainers needed to cover the payment"], [
  row(["Optimistic", "month 7, late 2027", "$145,900", "$2,890", "$32,500", "about 25"]),
  row(["Base", "month 14, spring 2028", "$238,000", "$4,710", "$62,000", "about 41"]),
  row(["Base, Option B", "month 14, spring 2028", "about $175,000", "about $3,450", "—", "about 30"]),
  row(["Conservative", "not reached; the August review changes course", "accrues", "—", "—", "—"]),
], [1500, 1900, 1700, 1500, 1500, 1260], { numeric: [2, 3, 4, 5] }));
gap();
c.push(h2("8.5 What the investor receives"));
c.push(p("Interest of about $32,500 to $62,000 on the money actually drawn, over the five years of payments, with the first payment in late 2027 on the optimistic path or spring 2028 on the base path. Then 10% of profit distributions once the four-month reserve is met: on the base path that runs at roughly $1,000 to $1,500 a month in year three and grows with the business, several times that on the optimistic path. And 10% of whatever the company is worth if it is ever sold."));
c.push(h2("8.6 Profit and reserve policy"));
c.push(p("No profit is drawn by either owner until the business account holds four months of operating expenses, about $139,000, in retained earnings. Once that reserve is met, distributions run 10% to Lauren and 90% to Dustin with the reserve kept in place. The founder's training income is separate and never feeds the app; the app never has to feed the founder before it feeds the business."));

// ---- 9
c.push(h1("9. Milestones and the August 2027 review"));
c.push(table(["Milestone", "Target", "How it is measured"], [
  row(["Multi-trainer build landed", "End of February 2027", "A second trainer can sign up and see only their own data"]),
  row(["Subscriptions live", "End of February 2027", "A trainer can pay through Stripe on the web"]),
  row(["Web launch", "March 2027", "Public sign-up open; paid channels running"]),
  row(["Stores", "April to August 2027", "App Store and Google Play listings live"]),
  row(["Review", "August 2027", "Cost per paying trainer, trainers and individuals on the books, monthly revenue against the three paths"]),
  row(["Break-even", "Spring 2028 on the base path", "Revenue at or above $31,800 a month; first loan payment"]),
  row(["Reserve met", "After break-even", "$139,000 in retained earnings; distributions begin"]),
], [2600, 2400, 4360]));
gap();
c.push(callout([
  [b("The August 2027 review, decided in advance. "), r("The number to read is cost per paying trainer. Under $900 and holding: keep going at $20,000 a month. Over $1,200: stop paid spend, cut marketing to what the founder-led funnel supports, and rethink the channel. That is a marketing decision and a channel decision, not a decision to borrow more. On the conservative path revenue never reaches expenses, and the review is what stops that path from consuming the rest of the facility.")],
]));

// ---- 10
c.push(h1("10. Risks and how they are handled"));
c.push(table(["Risk", "Why it matters", "What the plan does about it"], [
  row(["The paid funnel working at scale", "The base case needs about 190 trial sign-ups a month from $20,000. No company in this category has published growth like that from a standing start. This is the biggest risk.", "Funnel built before launch so month one is not spent learning; cost per paying trainer tracked from the first month; the August review with its stop rule"]),
  row(["Founder time", "The founder runs a full training roster. Part-time founders grow slower than full-time ones.", "The developer carries the engineering and the marketing lead owns the plan; the projections already assume a part-time founder"]),
  row(["Multi-trainer engineering slipping", "Separating one trainer's data into many is the largest build item and the one most likely to slip; the March launch depends on it landing in two months.", "Developer full time from January; the web launch does not wait for the stores; 12% contingency in the facility"]),
  row(["Timing of repayment", "Payments start at break-even, which the projections put at month 7 to 14 after launch, and never on the conservative path.", "Payments are tied to revenue rather than a calendar; the review changes course early rather than late; the LLC is the only borrower"]),
  row(["Pricing above the field below 20 clients", "The premium holds only if the assessment-to-programme engine is live and visible on day one.", "That capability already exists in the product; it is the launch message"]),
  row(["Store and payment rules", "Apple's link-out terms could change from 0% to a proposed 5%.", "Subscriptions sold on the web through Stripe; the fee is listed in section 11 to re-check before signing"]),
], [2200, 3580, 3580]));

// ---- 11
c.push(h1("11. Assumptions and figures still to confirm"));
c.push(p("Competitor prices were cross-checked against two independent listings each on 11 September 2026, and ad-cost benchmarks come from 2026 industry reports. The items below are estimates to be replaced with quotes over the next few weeks; each changes the totals by a few thousand dollars at most, and the model updates in minutes."));
c.push(bullet([b("Developer: "), r("rate, hours, January start and prior Next.js, Supabase and Stripe work, in writing (budgeted $10,000 a month full time, $7,000 at three days a week).")]));
c.push(bullet([b("Marketing lead and media buyer: "), r("two quotes for a fractional software-marketing lead at one to two days a week and one flat-fee media buyer (budgeted $8,500 a month together).")]));
c.push(bullet([b("Lawyer: "), r("a fixed fee for the operating agreement with the 10% interest, the loan note, and the terms and privacy review (budgeted $3,000 to $5,500 within setup).")]));
c.push(bullet([b("Insurance: "), r("one quote for general liability plus cyber for a small software LLC (budgeted $2,000 to $5,000 a year).")]));
c.push(bullet([b("Hosting: "), r("current Supabase and Vercel list prices (budgeted $2,000 to $3,000 a month including AI at scale).")]));
c.push(bullet([b("Average trainer price: "), r("the $115 average assumes a typical client mix; after the first 30 sign-ups it becomes the measured number.")]));
c.push(bullet([b("Apple link-out fee: "), r("0% today for US web checkout; a 5% small-business rate is proposed and pending court approval.")]));

// ---- 12
c.push(h1("12. Next steps"));
c.push(num("Lauren reviews the proposal and this plan and asks anything.", 3));
c.push(num("A one-page term sheet is agreed; a lawyer drafts the loan note and the operating agreement with the 10% interest.", 3));
c.push(num("The LLC is formed and the business bank account opened.", 3));
c.push(num("Quotes replace the estimates in section 11; the model and both documents are updated.", 3));
c.push(num("First draw in January 2027 when the developer and marketing lead start; draws continue month by month against the shortfall; web launch March 2027; review August 2027.", 3));
gap(120);
c.push(p("This is a plain-language planning document, not legal or financial advice. Revenue figures are good-faith projections from published benchmarks, not guarantees. Cost figures are 2026 estimates to be confirmed with quotes. Any final agreement will be put in writing and reviewed by a lawyer before either party signs.", { size: 19, color: GREY, italics: true }));

const doc = new Document({
  creator: "Dustin Gautreaux",
  title: "Symmetry App: Business Plan",
  styles: { default: { document: { run: { font: FONT, size: 22, color: INK } } } },
  numbering: { config: [
    { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] },
    { reference: "numbers", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 300 } } } }] },
  ] },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1300, bottom: 1200, left: 1440, right: 1440 } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Symmetry Personal Training · Confidential · Page ", font: FONT, size: 16, color: GREY }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: GREY })] })] }) },
    children: c,
  }],
});
Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(process.argv[2], buf); console.log("written", buf.length); });
