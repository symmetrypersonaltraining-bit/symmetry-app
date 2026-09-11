# Cost of taking a single-trainer web app to a multi-trainer App Store / Google Play SaaS and running it for year one

**Prepared:** 11 September 2026. **Location basis:** Princeton, TX (Dallas–Fort Worth–Arlington MSA). **Stack:** Next.js on Vercel, Supabase Postgres, Anthropic Claude API, Google Calendar sync, Stripe (planned), Capacitor wrapper for the stores.

**How to read this.** Every figure is a range with a source URL and the date of the source (or the date I accessed it, 11 Sep 2026, where the page carries no date). "Bootstrapped" after a range tells you which end applies to a small self-funded company. Where a primary vendor page was unreachable from this environment (many vendor domains are egress-blocked here: BLS, levels.fyi, Glassdoor, Supabase, Vercel, Twilio, Sentry, HHS, FTC, SBA, IDEA), the figure comes from a dated secondary summary that quotes the vendor, and is marked *(secondary)*. Anthropic's pricing page, Apple's Xcode Cloud page and Apple's Small Business Program page were fetched directly. Before committing money, re-check anything marked *(verify)*.

---

## 1. DEVELOPERS — fully loaded annual cost, 2026

### Loading assumptions (apply to every W-2 line below)
| Component | Rate | Source |
|---|---|---|
| Employer FICA | 7.65% of wages | Deel, Texas payroll tax guide 2026 — https://www.deel.com/blog/us-payroll-tax-guide-texas/ (2026) |
| FUTA | 0.6% net on first $7,000 (= $42/yr) | same |
| Texas SUTA (new employer) | 2.70% on first $9,000 (= $243/yr) | Texas Workforce Commission — https://www.twc.texas.gov/programs/unemployment-tax/tax-rates (2026) |
| Benefits (health, retirement, PTO) | BLS: benefits = 30.1% of total comp (≈43% of wages) in private industry, March 2026. Small startups typically spend 15–25% of wages. | BLS ECEC March 2026, released 12 Jun 2026 — https://www.bls.gov/news.release/ecec.nr0.htm |
| Rule of thumb multiplier | 1.25×–1.40× base salary | TrueTools employee cost calculator 2026 — https://truetools.org/tools/employee-cost-calculator-usa |
| Equipment | MacBook Pro M5 $1,699–$2,699 + monitor/peripherals ≈ $2,500–$4,000 per engineer | MacRumors, 2 May 2026 — https://www.macrumors.com/2026/05/02/apples-2026-macbook-pro-low/ |
| Recruiting (if you use an agency) | 20–25% of first-year salary; 30% for senior | Dover tech recruiter fee guide, Aug 2026 — https://www.dover.com/blog/tech-recruiter-fees-cost-guide |
| Payroll software | Gusto Simple $49/mo + $6/employee (from Mar 2026) | Rivermate Gusto pricing 2026 — https://rivermate.com/blog/gusto-pricing |

### (a) Senior full-stack engineer (TypeScript/React/Postgres), DFW, W-2
| Source | Figure | Date |
|---|---|---|
| BLS OEWS, Software Developers (15-1252), Dallas-Fort Worth-Arlington: median $133,290; 25th–75th pct $105,660–$164,100 *(secondary: hyring.com quoting BLS OEWS May 2025)* | https://hyring.com/jobseeker-toolkit/salary/software-developer-salary-in-dallas ; primary: https://www.bls.gov/regions/southwest/news-release/occupationalemploymentandwages_dallasfortworth.htm | May 2025 data, accessed 11 Sep 2026 |
| levels.fyi, Senior SWE, Dallas: median total comp $172,500; 25th $140,000; 75th $217,000 *(secondary summary of levels.fyi page)* | https://www.levels.fyi/t/software-engineer/levels/senior/locations/dallas-usa-1 | accessed 11 Sep 2026 |
| Glassdoor, Senior Software Engineer, DFW: avg total pay $203,265; 25th–75th $167,577–$251,164; $98/hr | https://www.glassdoor.com/Salaries/dallas-fort-worth-tx-senior-software-engineer-salary-SRCH_IL.0,20_IM218_KO21,45.htm | "as of Aug 2026" |

- **Base salary a small bootstrapped company can actually hire at:** $150,000–$185,000 (BLS 75th pct to levels.fyi median; Glassdoor skews to large employers).
- **Fully loaded (×1.25–1.40 + $3k equipment):** **$190,000–$262,000/yr** (≈ $16k–$22k/mo). **Bootstrapped end: $190k–$215k.** Add $30k–$45k one-time if an agency recruits.

### (b) Same person as a US 1099 contractor (hourly × 2,000 h)
| Source | Figure | Date |
|---|---|---|
| Toptal senior developers: $90–$200/hr, plus $500 deposit and $79/mo fee *(secondary)* | https://www.hireinsouth.com/post/how-much-does-toptal-cost ; https://www.thefrontendcompany.com/posts/toptal-pricing | 2026 |
| contractrates.fyi, Senior Software Engineer freelance: $101/hr average | https://www.contractrates.fyi/Senior-Software-Engineer/hourly-rates | 2026 |
| Arc.dev freelance software developers: $81–$100/hr average, platform margin 20–40% on top of dev net rate | https://arc.dev/freelance-developer-rates/software-development | 2026 |
| Glassdoor DFW senior SWE hourly: $98/hr | (as above) | Aug 2026 |

- **Range: $90–$150/hr × 2,000 h = $180,000–$300,000/yr.** No payroll tax, benefits or equipment, but no retention either. **Bootstrapped end: $90–$120/hr = $180k–$240k**, typically found direct (referrals, LinkedIn) rather than through Toptal.

### (c) Mid-level engineer (3–5 yrs), DFW
| Source | Figure | Date |
|---|---|---|
| Glassdoor, Software Engineer II, DFW: avg $146,274; 25th–75th $128,252–$170,113 | https://www.glassdoor.com/Salaries/dallas-fort-worth-tx-software-engineer-ii-salary-SRCH_IL.0,20_IM218_KO21,41.htm | as of Jul 2026 |
| BLS OEWS DFW median (all software developers) $133,290 | (as above) | May 2025 |

- **Base $110,000–$140,000 → fully loaded $140,000–$200,000/yr.** 1099 equivalent: $65–$95/hr = $130k–$190k. **Bootstrapped end: $140k–$160k W-2, or a nearshore mid (see f) at $80k–$120k.**

### (d) Mobile / React Native or Capacitor specialist
| Source | Figure | Date |
|---|---|---|
| ZipRecruiter, React Native Developer, Dallas: avg $127,956; 25th–75th $104,900–$155,300 | https://www.ziprecruiter.com/Salaries/React-Native-Developer-Salary-in-Dallas,TX | 22 Sep 2025, page dated Jan 2026 |
| Glassdoor React Native Developer Dallas: $75k–$120k | https://www.glassdoor.com/Salaries/react-native-developer-salary-SRCH_KO0,22.htm | 2026 |
| Upwork React Native hourly: median $30, typical $24–$45 (global); mid-level 2–5 yrs $65–$90/hr | https://www.upwork.com/hire/react-native-developers/cost/ ; https://www.reactsquad.io/blog/cost-to-hire-react-native-developers | 2026 |
| Secondtalent US senior RN cost-to-hire: $140–$165/hr | https://www.secondtalent.com/cost-to-hire/react-native-developer/ | 2026 |

- **W-2 base $115,000–$160,000 → loaded $145,000–$225,000/yr.** Contract: $65–$90/hr mid, $100–$165/hr senior US.
- **For a Capacitor wrapper you do not need a year of this person.** A senior web engineer who has shipped Capacitor apps to both stores, on a 3–4-month contract (see §3), is the bootstrapped answer: **$40k–$70k total**.

### (e) Product designer
| Source | Figure | Date |
|---|---|---|
| levels.fyi Product Designer, Greater Dallas: avg total comp $120,000; range $100k–$160k; entry $85k–$120k | https://www.levels.fyi/t/product-designer/locations/greater-dallas-area | accessed 11 Sep 2026 |
| Glassdoor Product Designer DFW: 25th–75th $91,632–$151,459 (200 salaries) | https://www.glassdoor.com/Salaries/dallas-fort-worth-tx-product-designer-salary-SRCH_IL.0,20_IM218_KO21,37.htm | as of Aug 2026 |

- **W-2 base $95,000–$140,000 → loaded $120,000–$195,000/yr.** Fractional (10 hrs/wk at $75–$125/hr): **$39k–$65k/yr**; this is the bootstrapped choice — a full-time designer is not justified for one product.

### (f) Offshore / nearshore senior engineers
| Region | Agency-billed senior rate | Direct-hire senior rate | Annualised @2,000 h (agency) | Source |
|---|---|---|---|---|
| Latin America (Mexico, Colombia, Brazil, Argentina) | $50–$90/hr; Mexico seniors $60–$80 | $40–$60/hr | $100k–$180k | Bertoni nearshore rates 2026 — https://bertonisolutions.com/blog/nearshore-software-development-rates-2026 ; Curotec LatAm 2026 — https://www.curotec.com/insights/latam-developer-hourly-rates-in-2025/ ; Clutch LatAm $25–$149 — https://clutch.co/developers/pricing (Aug 2026) |
| Eastern Europe (Poland, Romania, Ukraine) | $45–$80/hr | $35–$60/hr (avg CEE salary ≈ $62k) | $90k–$160k | Arc.dev salaries — https://arc.dev/salaries ; hireinsouth by-country — https://www.hireinsouth.com/post/software-developer-rates-by-country (2026) |
| Philippines | $35–$45/hr | $20–$30/hr | $70k–$90k | Qubit Labs offshore rates 2026 — https://qubit-labs.com/average-hourly-rates-offshore-development-services-software-development-costs-guide/ |
| India | $25–$50/hr (avg ~$18 for cost-driven work) | $15–$30/hr | $50k–$100k | Full Scale offshore rates 2026 — https://fullscale.io/blog/comparing-offshore-software-development-rates-by-country/ ; Clutch $25–$49 India/Ukraine/Philippines |

**Quality caveats (sourced):**
- Agencies mark up developer pay 30–60%; a $22/hr Pune quote lands at $35–$38/hr all-in after coordination, QA and revision overhead; loaded cost is **1.4–1.8× the headline rate** — https://www.blog.devpartners.co/post/offshore-developer-hourly-rate (2026); https://distantjob.com/blog/offshore-developer-rates/ (2026).
- 67% of failed offshore hires cite unclear contracts (no NDA/milestones) and weak vetting; time-zone and IP-protection risk are the top complaints — https://www.agilesoftlabs.com/blog/2026/04/how-to-hire-offshore-developers-risk (Apr 2026).
- LatAm gives US time-zone overlap; CEE gives the best quality-to-cost ratio; Philippines/India are cheapest but need a US-based lead to review PRs — https://www.hireinsouth.com/post/software-developer-rates-by-country.
- **Bootstrapped recommendation:** LatAm mid/senior at $45–$70/hr direct or via a small agency, under a US senior lead. Do not put an offshore-only team on a health-data app without a US reviewer who owns security and RLS policies.

### (g) Fractional senior engineer (20 hrs/week)
| Source | Figure | Date |
|---|---|---|
| Fractional CTO benchmarks: $150–$250/hr junior-fractional; 20 hrs/wk embedded = $10k–$15k/mo | https://www.gofractional.com/insights/rates/cto ; https://ctoondemand.com/fractional-cto-cost | 2026 |
| Mid-band fractional CTO $175/hr (25th pct) to $250/hr (75th) | https://truvisory.com/fractional-cto/fractional-cto-cost/ | 2026 |
| Senior freelance engineer (not CTO-titled) $90–$150/hr | contractrates.fyi / Toptal (above) | 2026 |

- **Senior IC fractional: $100–$150/hr × 1,040 h = $104k–$156k/yr ($8.7k–$13k/mo).** Fractional CTO-level: $10k–$15k/mo. **Bootstrapped end: $100–$120/hr.**

### Recommended team: 6–9-month build to store launch + 3 months hardening

Design principle: one accountable US senior, cheaper hands under them, specialists only for the months they are needed, and the founder acting as product owner.

| Role | Engagement | Months | Monthly cost | Total |
|---|---|---|---|---|
| Senior full-stack lead (TS/Next/Postgres/Supabase), US, 1099 full-time (~170 h/mo) | $100–$130/hr | 1–12 | $17k–$22k | $204k–$264k |
| Mid-level full-stack, LatAm, direct or small agency | $45–$70/hr × 170 h | 1–12 | $7.7k–$12k | $92k–$144k |
| Mobile/Capacitor release specialist, US contract (wrapper, push, deep links, privacy manifest, store review) | $100–$150/hr × ~120 h/mo | 4–7, then 10 h/mo retainer | $12k–$18k (4 mo); $1k–$1.5k after | $53k–$80k |
| Product designer, fractional 10 h/wk | $75–$125/hr | 1–6, ad hoc after | $3.2k–$5.4k | $19k–$32k |
| QA/test contractor, offshore part-time (60 h/mo) | $25–$40/hr | 3–12 | $1.5k–$2.4k | $15k–$24k |
| **Totals** | | | **Build (mo 1–9): $33k–$47k/mo; hardening (mo 10–12): $27k–$38k/mo** | **$383k–$544k** |

- **Lean variant (~$300k–$340k/yr):** LatAm senior as lead ($70–$90/hr, $12k–$15k/mo) + US senior reviewer 10 h/wk ($5k–$7k/mo) + the same designer/mobile/QA plan. Risk: no US-based owner of architecture and security.
- **High variant (~$650k–$800k/yr):** all-US: senior W-2 ($215k loaded), mid US 1099 ($190k), mobile 6 months ($90k), designer 12 months ($72k), QA ($30k), plus agency recruiting fees ($40k–$90k).
- **Absolute floor (~$150k–$220k dev):** founder as PM + one US fractional senior at 20 h/wk ($105k–$156k) + LatAm mid ($92k–$144k), heavy use of AI coding tools; expect 9–12 months to store launch rather than 6–9.

---

## 2. INFRASTRUCTURE at 10 / 100 / 500 trainers (≈20 clients each → 200 / 2,000 / 10,000 clients)

### Price list used
| Service | Price | Source / date |
|---|---|---|
| Supabase Pro | $25/mo incl. $10 compute credit, 8 GB DB, 100 GB storage, 250 GB egress, 100k MAU; DB overage $0.125/GB; storage $0.021/GB; egress $0.09/GB *(secondary)* | Makerkit Supabase pricing 2026 — https://makerkit.dev/blog/saas/supabase-pricing ; Flexprice — https://flexprice.io/blog/supabase-pricing-breakdown ; primary https://supabase.com/pricing |
| Supabase compute | Micro $10, Small $15, Medium $60, Large $110, XL $210, 2XL $410/mo (hourly billed) *(secondary)* | Jetadmin Supabase 2026 — https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/ |
| Supabase PITR | $100/mo per 7 days retention; needs ≥ Small compute *(secondary)* | https://backupdrill.com/compare/supabase-pitr (2026) |
| Supabase Team | $599/mo (SOC 2, SSO, HIPAA add-on eligibility) *(secondary)* | https://www.nocode.mba/articles/supabase-pricing (2026) |
| Vercel Pro | $20/seat/mo + $20 usage credit; 1 TB fast data transfer and 10M edge requests included; overage $0.15/GB, $2/M edge requests *(secondary)* | Flexprice Vercel — https://flexprice.io/blog/vercel-pricing-breakdown ; https://www.fencode.dev/en/blog/vercel-free-vs-pro-2026-official-limits-pricing (2026); primary https://vercel.com/pricing |
| Claude Haiku 4.5 | $1 / MTok input, $5 / MTok output, cache read $0.10 | **Anthropic pricing page (fetched 11 Sep 2026)** — https://platform.claude.com/docs/en/about-claude/pricing |
| Claude Sonnet 5 | $2 / $10 per MTok, cache read $0.20 (introductory price made permanent; the 1 Sep 2026 rise to $3/$15 was cancelled) | same |
| Claude Sonnet 4.6 | $3 / $15 per MTok | same |
| Batch API | 50% off; prompt cache hit = 10% of input price | same |
| Image tokens | ≈ (width × height) / 750; a 1,000×1,000 px image ≈ 1,334 tokens *(secondary quoting Anthropic vision docs)* | https://www.cloudzero.com/blog/anthropic-claude-api-pricing/ (2026); primary https://platform.claude.com/docs/en/build-with-claude/vision |
| Resend | Free 3,000/mo; Pro $20 (50k); Scale from $90 *(secondary)* | https://flexprice.io/blog/detailed-resend-pricing-guide (2026); primary https://resend.com/pricing |
| Postmark | Basic $15/mo for 10k, overage $1.80/1k *(secondary)* | https://www.saaspricepulse.com/tools/postmark (2026) |
| Twilio US SMS | $0.0083/segment + carrier $0.0035–$0.0045 ≈ $0.012–$0.013 effective; local number $1.15/mo; A2P 10DLC brand $4.50 (low-volume) or $46 (standard w/ vetting) one-time; campaign vetting $15 one-time; campaign $1.50–$10/mo *(secondary)* | https://textbee.dev/blog/twilio-pricing-real-cost-breakdown ; https://www.telphiconsulting.com/blog/twilio-cost-2026 ; primary https://www.twilio.com/en-us/sms/pricing/us |
| Sentry | Developer free; Team $26/mo (50k errors); Business $80/mo; overage from $0.0003625/error *(secondary)* | https://middleware.io/blog/sentry-pricing/ (2026); primary https://sentry.io/pricing/ |
| Domain/DNS | Cloudflare .com $10.46/yr (rising to $11.15 on 1 Nov 2026); DNS free | https://tld-list.com/registrars/cloudflare (Sep 2026); https://www.cloudflare.com/plans/free/ |
| Google Workspace | Business Starter $7/user/mo annual ($8.40 flexible); Standard $14 ($16.80) | https://www.cloudwards.net/google-workspace-plans-and-pricing/ (2026); primary https://workspace.google.com/pricing |

### Claude API usage model (the line that dominates)
Assumptions: each client logs **2 meals/day with a photo** (photo resized client-side to ~1,000×1,000 px ≈ 1,334 tokens; 100 tokens of user text; 800-token cached system prompt; 300-token structured output). Each trainer makes **20 assistant calls/day** (2,000 uncached input tokens of client context + 2,000 cached tokens + 500 output). 30 days/month.

| Per call | Haiku 4.5 | Sonnet 5 |
|---|---|---|
| Meal photo analysis | $0.0030 | $0.0060 |
| Trainer assistant turn | $0.0047 | $0.0094 |

| Scale | Meal calls/mo | Assistant calls/mo | All-Haiku | Haiku meals + Sonnet 5 assistant (recommended) | All-Sonnet 5 |
|---|---|---|---|---|---|
| 10 trainers / 200 clients | 12,000 | 6,000 | $64 | $92 | $129 |
| 100 / 2,000 | 120,000 | 60,000 | $643 | $925 | $1,288 |
| 500 / 10,000 | 600,000 | 300,000 | $3,215 | $4,625 | $6,440 |

Add 30–60% headroom: retries, tool-use system prompt overhead (496 tokens on Haiku 4.5 per the pricing page), longer conversation histories, and the newer tokenizer on Sonnet 5 (~30% more tokens for the same text, per Anthropic's pricing page). Realistic monthly Claude ranges: **10T $60–$200; 100T $600–$2,000; 500T $3,000–$10,000.** Levers: Batch API (50% off) for non-interactive nutrition re-analysis; cap AI use per plan tier.

### Monthly totals per scale
| Line | 10 trainers | 100 trainers | 500 trainers |
|---|---|---|---|
| Supabase (Pro + compute + storage/egress + PITR at scale) | $25–$35 (Micro/Small) | $30–$180 (Small–Medium; +$100 PITR optional) | $270–$1,000 (Large–XL, PITR, ~2 TB photos by year-end ≈ $43/mo storage, egress overage ≈ $26; Team plan $599 if SOC 2/HIPAA needed) |
| Vercel Pro | $20–$40 (1–2 seats) | $40–$110 (2–3 seats + small overages) | $60–$250 (3 seats + bandwidth/image overages) |
| Anthropic Claude | $60–$200 | $600–$2,000 | $3,000–$10,000 |
| Transactional email | $0–$20 (Resend free / Postmark $15) | $20 (Resend Pro, ~21k emails) | $90 (Resend Scale, ~105k emails) |
| Twilio SMS (2 payment reminders/client/mo + number + campaign fee) | $8–$16 | $55–$65 | $255–$265 |
| Sentry | $0–$26 | $26 | $26–$150 |
| Domain/DNS | $1 | $1 | $1 |
| Google Workspace | $14–$28 (2 users) | $21–$42 (3 users) | $70 (5 users, Standard) |
| **Monthly total** | **$130–$370** | **$800–$2,450** | **$3,800–$11,900** |
| **Annual total** | **$1,600–$4,400** | **$9,600–$29,000** | **$45,000–$142,000** |

One-time infra setup: Twilio A2P brand + campaign vetting $20–$61; nothing else material.
Photo storage assumption: 300 KB/photo after compression → 3.6 GB/mo (10T), 36 GB/mo (100T), 180 GB/mo (500T) of new storage.
Reality check: at 500 trainers × ~$79/mo ≈ $39.5k MRR, AI alone is 8–25% of revenue. Price AI features as a metered or tiered add-on.
Not asked for but real: GitHub Team ($4/user), Figma, Linear, 1Password ≈ $50–$300/mo across the team.

---

## 3. STORE AND PAYMENTS

| Item | Cost | Source / date |
|---|---|---|
| Apple Developer Program | $99/yr; organisation enrolment requires a D-U-N-S number and Apple verification of the legal entity | https://developer.apple.com/programs/enroll/ ; https://developer.apple.com/help/account/membership/program-enrollment/ (accessed 11 Sep 2026) |
| Google Play developer account | $25 one-time; organisation account requires D-U-N-S; from Sep 2026 all new personal accounts need identity verification (org accounts already do) *(secondary)* | https://testerbee.com/blog/google-play-developer-verification-2026 ; https://www.iconikai.com/blog/google-play-developer-account-fee-2026 |
| D-U-N-S number | Free, up to 30 business days; expedited $229 (8 business days) — a $49/5-day option is also reported *(verify)* | https://www.dnb.com/en-us/smb/duns/get-a-duns.html ; https://www.nerdwallet.com/business/credit-cards/learn/duns-number (2026) |
| Apple Small Business Program | 15% commission (vs 30%) if prior-year proceeds ≤ $1M across all apps and Associated Developer Accounts; new developers eligible; adjustment starts 15 days after the fiscal month of approval | **Apple (fetched 11 Sep 2026)** — https://developer.apple.com/app-store/small-business-program/ |
| Google Play service fee (US, from 30 Jun 2026) | 10% service fee on first $1M/yr and on all auto-renewing subscriptions + 5% billing fee if you use Play Billing = **15% on subscriptions**; 20% standard above $1M for non-subscription items; 0% billing fee with alternative billing/link-out *(secondary)* | https://pricepush.app/blog/google-play-subscription-fees-2026-real-math ; https://adapty.io/blog/google-play-billing-changes-subscriptions-fees/ ; https://www.revenuecat.com/docs/platform-resources/google-platform-resources/15-reduced-service-fee |
| Apple external-link commission (US) | Since May 2025 US-storefront apps may link to web checkout with no entitlement; 9th Circuit (11 Dec 2025) allows Apple a "reasonable" fee but none is chargeable until the district court sets one; Apple proposed 15% standard / 5% Small Business in Aug 2026 (contested) | https://www.macrumors.com/2025/12/11/apple-app-store-fees-external-payment-links/ ; https://appleinsider.com/articles/26/08/13/apples-latest-commission-rates-for-external-app-store-purchases-havent-satisfied-epic ; https://www.revenuecat.com/blog/engineering/app-to-web-purchase-guidelines |
| Stripe card processing | 2.9% + $0.30 per successful card charge | https://checkoutpage.com/blog/stripe-processing-fees (2026); https://flexprice.io/blog/stripe-pricing-breakdown-2026 |
| Stripe Billing | 0.7% of billing volume (flat since Jul 2024) | same |
| Stripe Tax | 0.5% per transaction | same |
| RevenueCat (if you use IAP) | Free to $2,500 monthly tracked revenue, then 1% of MTR | https://costbench.com/software/subscription-billing/revenuecat/ (2026) |

**Worked example, 100 trainers × $79/mo = $7,900 MRR:** Stripe (2.9% + 0.7% + 0.5% + $0.30 × 100) ≈ **$354/mo (4.5%)**. The same revenue through Apple IAP (Small Business) or Google Play Billing costs **$1,185/mo (15%)**.
**Recommendation:** sell the trainer subscription on the web via Stripe (Guideline 3.1.3(b) multiplatform services; the app must offer genuine free utility, or it is rejected as a "thin client" under 4.2 — https://ptkd.com/journal/apple-rejection-3-1-1-in-app-purchase-links , 2026). Budget for IAP as a fallback if Apple rejects the flow.

### Capacitor / Expo wrapper build and App Review preparation
| Item | Estimate | Basis |
|---|---|---|
| Capacitor wrap of an existing, mobile-responsive Next.js app (static/export or remote-URL shell), native plugins (push, camera for meal photos, calendar/deep links), icons/splash, signing | 160–320 senior hours = **$16k–$48k** at $100–$150/hr | Capgo: "hours to get running, budget 1–2 weeks minimum for a serious first submission, longer with billing or closed testing" — https://capgo.app/blog/how-easy-is-it-to-make-web-app-into-mobile-app-with-capacitor/ (2026) |
| Store-review preparation: privacy manifest + SDK declarations, privacy nutrition labels, in-app account deletion (Guideline 5.1.1(v), required since 30 Jun 2022), health-data handling (5.1.3: no health data in iCloud, no marketing use), Google Play Data Safety form and closed-testing requirement, screenshots, 1–3 review rounds | 40–120 hours = **$4k–$18k** | https://developer.apple.com/news/upcoming-requirements/?id=06302022b ; https://developer.apple.com/app-store/review/guidelines/ ; https://www.revenuecat.com/blog/growth/the-ultimate-guide-to-app-store-rejections (2026) |
| **Capacitor wrap + review prep total** | **$20k–$66k** (bootstrapped end $20k–$35k) | |
| Expo/React Native rewrite instead | Not recommended: requires a separate mobile codebase and RN specialists; Capacitor is the standard choice for wrapping an existing web app | https://www.pkgpulse.com/guides/react-native-vs-expo-vs-capacitor-cross-platform-mobile-2026 ; https://nextnative.dev/comparisons/nextjs-vs-expo |
| Expo EAS (only if you go RN) | Production plan $199/mo + usage | https://docs.expo.dev/billing/plans/ (2026) |

### Build machine
| Option | Cost | Source |
|---|---|---|
| Xcode Cloud | **25 compute hours/month free** with the Developer Program; 100 h $49.99/mo; 250 h $99.99/mo | **Apple (fetched 11 Sep 2026)** — https://developer.apple.com/xcode-cloud/ |
| Mac mini (base) | $799 → $899 after Apple's 2026 price rises; plus TX sales tax | https://www.macrumors.com/2026/05/02/apple-just-raised-mac-mini-starting-price/ ; https://www.tomshardware.com/desktops/mini-pcs/apple-price-hikes-continue-as-mac-mini-with-16gb-ram-and-256gb-is-now-usd899-1tb-storage-option-adds-usd500-to-entry-level-headless-system (2026) |
| Codemagic hosted macOS CI | 500 free minutes/mo then $0.095/min | https://docs.codemagic.io/billing/pricing/ (2026) |
| MacStadium hosted Mac | $79–$599+/mo | https://www.vendr.com/marketplace/macstadium (2026) |

Bootstrapped answer: Xcode Cloud's free tier plus the mobile contractor's own Mac = **$0**; buy an $899 Mac mini only if you want local signing/debugging in-house.

---

## 4. LEGAL AND COMPLIANCE — Texas LLC selling a health-adjacent SaaS

| Item | Cost | Source / date |
|---|---|---|
| Texas Certificate of Formation (Form 205) | $300 (+2.7% card fee online); no annual report fee; franchise tax + Public Information Report due 15 May, no tax below $2.65M revenue | https://www.zenbusiness.com/texas-filing-fees/ ; https://1800accountant.com/blog/llc-cost-texas (2026) |
| Registered agent | $0 (self) or $50–$300/yr (typical $125) | same |
| Operating agreement | Template $0–$200; Texas lawyer flat fee avg **$560 to draft, $630 to review**; multi-member with vesting/IP assignment $1,000–$2,500 | ContractsCounsel Texas OA cost — https://www.contractscounsel.com/b/texas-llc-operating-agreement-drafting-cost (2026) |
| Terms of Service + Privacy Policy — templated | Termly Starter ~$10/mo annual, Pro+ ~$15/mo ($180/yr); iubenda $5–$25/mo | https://www.enzuzo.com/blog/termly-vs-iubenda (2026); https://termly.io/resources/compare/termly-vs-iubenda/ |
| ToS + PP — lawyer review of template | Avg privacy-policy review $660; draft $980; simple site $500–$1,500 | https://www.contractscounsel.com/b/privacy-policy-cost ; https://www.contractscounsel.com/b/terms-of-service-and-privacy-policy-cost (2026) |
| ToS + PP + subscription agreement — SaaS lawyer flat package | $4,500–$5,500 (adds AUP, cookie policy, AI-feature terms) | Andrew S. Bosin SaaS law — https://www.njbusiness-attorney.com/how-much-do-saas-terms-and-conditions-and-privacy-policy-agreements-cost-to-get-drafted-for-most-saas-startups/ (2026) |
| **Recommended for this app:** Termly/iubenda base + lawyer review with explicit health-data, AI-output disclaimer, trainer–client data-processing and account-deletion language | **$1,500–$3,000** (bootstrapped); $4,500–$5,500 if you want a subscription agreement drafted for multi-trainer studios | |

### Does HIPAA apply?
- **HHS position:** HIPAA governs only *covered entities* (providers, plans, clearinghouses) and their *business associates*. Health information held by an app that is neither is not subject to HIPAA — HHS, "The access right, health apps, & APIs" — https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/access-right-health-apps-apis/index.html (HHS FAQ; accessed via secondary summary 11 Sep 2026).
- **Law-firm analysis:** Dickinson Wright: "most healthcare, fitness tracker and wellness apps are not covered by HIPAA"; a fitness app found in the App Store with no affiliation to a provider is outside HIPAA — https://www.dickinson-wright.com/news-alerts/app-users-beware ; also https://www.mondaq.com/unitedstates/data-protection/805076/ . Accountable HQ reaches the same conclusion for direct-to-consumer fitness apps — https://www.accountablehq.com/post/do-fitness-apps-need-to-be-hipaa-compliant-when-it-applies-and-when-it-doesn-t (2026).
- **Conclusion for a trainer/client coaching app storing injury notes and body metrics:** HIPAA does **not** apply as long as (i) trainers are not covered entities and (ii) you do not receive PHI on behalf of a clinic, physical-therapy practice or physician under a BAA. **Triggers that would change this:** selling to PT clinics or medically-supervised programmes, accepting physician referrals with records, or a customer demanding a BAA. If that happens, Supabase's HIPAA add-on requires the Team plan ($599/mo) plus a BAA, and legal review rises to $5k–$15k.
- **Even without HIPAA:** (a) the **FTC Health Breach Notification Rule** (amended 2024) applies to health apps not covered by HIPAA and requires breach notice to users and the FTC — https://www.ftc.gov/legal-library/browse/rules/health-breach-notification-rule *(page egress-blocked here; verify)*; (b) **Washington My Health My Data Act** (in force 31 Mar 2024) covers fitness-app data of Washington residents, requires opt-in consent and has a private right of action — https://iapp.org/resources/article/washington-my-health-my-data-act-overview ; (c) the FTC Act's unfair/deceptive standard applies to your privacy promises.

### Texas Data Privacy and Security Act (TDPSA, HB 4, effective 1 Jul 2024)
- Applies to anyone doing business in Texas or serving Texas residents who processes personal data — **no revenue or consumer-count threshold** — https://privacylawmap.com/blog/texas-data-privacy-and-security-act-guide ; https://iapp.org/news/a/texas-latest-to-add-comprehensive-state-privacy-law .
- **Small-business exemption:** businesses meeting the SBA small-business definition are exempt from most obligations, **but** must still obtain opt-in consent before *selling* sensitive data (health, biometrics, precise geolocation) — https://www.ketch.com/regulatory-compliance/texas-data-privacy-security-act-tdpsa ; https://usercentrics.com/knowledge-hub/texas-data-privacy-and-security-act-tdpsa/ (2026). The SBA size standard for software publishers is a receipts test in the tens of millions, so a year-one company is exempt *(SBA table egress-blocked; verify at https://www.sba.gov/document/support-table-size-standards)*.
- **Practical obligations to budget anyway** (they are what Apple, Google and enterprise trainers will ask for): privacy notice listing categories and purposes, opt-in consent for health data, no selling of health data, data-protection assessment if you do targeted ads on health data, consumer rights handling (access/delete/correct) with a 45-day response, and a 30-day cure period for AG enforcement. Cost: covered by the ToS/PP work above plus 20–40 engineering hours for export/delete tooling (already required by Apple 5.1.1(v)).

### Insurance
| Policy | Annual premium | Source / date |
|---|---|---|
| General liability (tech company, < $1M revenue) | median $250/yr (tech) to $1,474/yr (small-business avg, $1M/$2M limits); NEXT from $19/mo, median $75/mo; Hiscox from $22/mo, median $109/mo | https://www.vouch.us/blog/general-liability-insurance-cost ; https://www.moneygeek.com/insurance/business/general-liability/cost/ ; https://businessinsurancecost.com/carrier/next-insurance ; https://businessinsurancecost.com/carrier/hiscox (2026) |
| Cyber liability (small SaaS) | $1,000–$3,000/yr; SaaS average ≈ $1,837/yr | https://www.proinsgrp.com/business/cyber-liability-insurance/cost/ ; https://kioptrix.com/cyber-insurance-cost-for-saas-startups/ (2026) |
| Cyber + Tech E&O combined (< $1M revenue) | $2,500–$6,000/yr | https://anvo-insurance.com/blog/tech-saas-insurance-cost-2026/ (2026) |
| Full startup program via Vouch (acquired by Hiscox 2025) / Embroker (GL + E&O + cyber + D&O) | $5,000–$15,000/yr; neither publishes flat pricing | https://www.quotesweep.com/blog/embroker-vs-vouch ; https://valueaddvc.com/blog/best-startup-insurance-providers-in-2026-embroker-vouch-coalition-next-compared (2026) |
| **Bootstrapped total (GL + cyber/E&O, no D&O)** | **$2,000–$5,000/yr** | |

### Accounting, banking, trademark
| Item | Cost | Source / date |
|---|---|---|
| Bookkeeping | $200–$600/mo (online/offshore, QuickBooks) up to $300–$2,000/mo local | https://catalyst-cpa.com/bookkeeping-cost-small-business-2026/ ; https://beancount.io/blog/2026/04/03/how-much-does-a-cpa-cost-small-business-pricing-guide (2026) |
| CPA tax return | Single-member LLC $300–$1,500; multi-member (Form 1065) or S-corp typically $1,000–$2,500; advisory retainers $250–$900/mo | https://www.sdocpa.com/business-tax-preparation-cost/ ; https://www.skfinancial.com/blog/average-cost-of-tax-preparation-by-cpa (2026) |
| **Year-one accounting total** | **$3,000–$12,000** (bootstrapped $3k–$5k: online bookkeeping + one return) | |
| Business bank account | Mercury $0, Relay $0; Chase Business Complete $15/mo waived at $2,000 balance | https://www.rho.co/blog/mercury-vs-relay ; https://relayfi.com/blog/relay-vs-chase/ (2026) |
| USPTO trademark | $350 per class (electronic, ID Manual descriptions); +$200/class free-form surcharge; software (Class 9) + SaaS (Class 42) = $700 government | https://tmarkmetric.com/insights/uspto-trademark-fees-2026 ; https://www.anchorfilings.com/blog/uspto-trademark-fees-2025-restructure.html (fees effective 18 Jan 2025) |
| Trademark attorney | Clearance search/opinion $300–$800; filing $400–$1,200 per class; all-in **$1,000–$2,500** to registration | https://ipboutiquelaw.com/cost-to-file-trademark-application-2026-usa-dc/ (2026) |

**Legal/compliance one-time (bootstrapped):** LLC $300 + agent $125 + OA $560 + ToS/PP $1,500–$3,000 + trademark $1,400–$2,500 + D-U-N-S $0 ≈ **$3,900–$6,500**. **Ongoing year one:** insurance $2k–$5k + bookkeeping/CPA $3k–$12k + Termly $180 + Gusto ~$700–$1,300 ≈ **$6k–$19k**.

---

## 5. MARKETING — year-one launch to US independent personal trainers

Market size for calibration: ~325,671 personal-trainer businesses and ~376,635 employed trainers in the US (IBISWorld 2026 — https://www.ibisworld.com/united-states/number-of-businesses/personal-trainers/4189/); incumbents price at $19–$250/mo (Trainerize) and $19–$99/mo (TrueCoach) — https://assistantcoach.fit/blog/real-cost-fitness-coaching-software/ (2026).

### Channel unit costs
| Channel | Unit cost | Source / date |
|---|---|---|
| Google Search — fitness/health category CPC | $5.03–$6.17 avg; personal-trainer service keywords $1.50–$5 | WordStream 2026 benchmarks (13,474 US campaigns, Apr 2025–Mar 2026) — https://www.wordstream.com/blog/2026-google-ads-benchmarks ; https://datalatte.pro/blog/best-google-ad-keywords-for-personal-trainers-in-2026 |
| Google Search — B2B SaaS non-brand CPC | $8.50–$14.00; SaaS avg $5.34 (+29% YoY); SMB SaaS CPL ≈ $87 | https://www.kampaio.com/blog/b2b-saas-google-ads-benchmarks-2026 ; https://www.get-ryze.ai/blog/google-ads-cost-benchmarks-by-industry-2026 |
| "Personal trainer software"-type keywords (inferred: fitness category floor to B2B SaaS ceiling) | **$4–$12 CPC** *(inferred — pull Keyword Planner before budgeting)* | |
| Meta/Instagram | IG CPC $1.83–$3.35; lead-gen CPM $25–$40; B2B CPL IG $138 / FB $145 | https://www.webfx.com/blog/social-media/meta-benchmarks/ ; https://www.adamigo.ai/blog/meta-ads-benchmarks-2026-by-objective-and-placement ; https://metadata.io/b2b-advertising-benchmarks (2026) |
| YouTube | Skippable CPV $0.03–$0.12 (cross-network avg $0.024 Q1 2026); CPM $5–$10; Shorts CPM ~$4 | https://www.storegrowers.com/youtube-ads-benchmarks/ ; https://adwave.com/resources/youtube-ad-costs (2026) |
| Podcast host-read | Health & fitness $27 CPM (Libsyn); planning range $25–$40 CPM; a 50k-download show mid-roll $1,000–$1,500; small trainer-business shows (5–20k downloads) ≈ $150–$800/episode | https://www.shopify.com/blog/podcast-sponsorship-rates ; https://www.millionpodcasts.com/blog/podcast-advertising-cost-cpm-rates-by-genre-size/ (2026) |
| Newsletter sponsorship | Health/wellness $15–$35 CPM; niche pro audiences $40–$100 CPM; a 20k-subscriber trainer newsletter ≈ $500–$2,000/send | https://www.paved.com/blog/newsletter-sponsorship-rates/ ; https://sponsorcal.com/blog/newsletter-sponsorship-pricing (2026). PTDC/Mind Pump publish no public rate card — request media kits. |
| Trade shows | Perform Better 3-Day Summit attendee $289 early / $389 standard (Chicago Jun 18–20, Long Beach Jul 9–11, Providence Aug 20–22, 2026) — https://www.performbetter.com/3-day-functional-training-summits/ ; NSCA National Conference (New Orleans, Jul 8–11, 2026) has replaced booths with an "Annual Engagement Package" — pricing by request — https://www.nsca.com/events/exhibitors/ ; IDEA World (Indianapolis, Jul 17–19, 2026; 5–10k attendees) booth pricing is by prospectus, third-party all-in estimate $15k–$40k *(verify)* — https://www.ideafit.com/fitness-conferences/2026-idea-world/become-an-exhibitor/ ; https://withorbital.com/conferences/idea-world-fitness-convention-2026 . Working assumption: **attend-only $1,500–$3,000/event incl. travel; exhibit $8k–$25k/event all-in (space, display, shipping, travel, staff).** |
| Affiliate/referral programme | Rewardful $49/mo (to $7.5k affiliate revenue) – $99/mo; PartnerStack from ~$500/mo + 3–15% of commissions; typical SaaS commission 20–40% recurring | https://affonso.io/blog/partnerstack-pricing-guide ; https://www.rewardful.com/articles/best-affiliate-software-for-ai-saas-companies (2026) |
| Video editor | $45–$85/hr mid; $300–$1,500 per YouTube video; $250–$1,200 per short ad | https://golance.com/hiring/best-freelance-video-editors-hourly-rate ; https://vidico.com/news/video-editor-cost/ (2026) |
| Copywriter (SaaS) | $85–$160/hr mid; $600–$1,200/page mid; senior $1,500–$3,000/landing page or $5k–$9k/mo retainer | https://www.mediabistro.com/employer/blog/trends/freelance-copywriter-rates/ ; https://www.solopricing.com/freelance-copywriter-rates-2026 (2026) |
| Launch PR | Project launch $5k–$25k; boutique retainer $3.5k–$10k/mo; startups typically $5k–$25k/mo | https://everything-pr.com/how-much-does-a-pr-firm-cost-in-2026 ; https://www.jenniferbett.com/the-spin/how-much-does-pr-cost-for-startups-in-2026 |
| Fractional CMO / part-time marketer | Fractional CMO $5k–$25k/mo (median $10k–$12k) at 10–20 h/wk, $200–$500/hr; a non-executive fractional marketing manager sits at the bottom of that band, $3k–$6k/mo | https://www.gofractional.com/blog/fractional-cmo-salary ; https://marketful.com/fractional-cmo (2026) |

### CAC and conversion benchmarks used
- SMB SaaS CAC $200–$700; self-serve median $702; "good" B2B SaaS CAC $300–$800 — https://userpilot.com/blog/average-customer-acquisition-cost/ ; https://www.saashero.net/strategy/b2b-saas-cac-benchmarks-2026/ ; https://www.gtm8020.com/blog/customer-acquisition-cost-statistics (2026).
- Free-trial → paid 10–15%; freemium ≈ 5% — https://www.saashero.net/strategy/saas-cac-benchmarks-2026/ (2026).
- Search CPL for SMB SaaS ≈ $87; Meta B2B CPL ≈ $138–$145 (above).
- Haircut: a brand-new product with no reviews usually runs 1.5–2× benchmark CAC in its first year. Figures below show benchmark first, then the haircut.

### Three budget tiers
| | **Lean** | **Solid** | **Heavy ("full-scale", as requested)** |
|---|---|---|---|
| Monthly budget | $5k–$8k | $15k–$25k | $40k–$70k |
| Annual | **$60k–$100k** | **$180k–$300k** | **$500k–$850k** |
| Paid search | $2k/mo | $5k–$8k/mo | $12k–$18k/mo |
| Meta/Instagram | $1k/mo | $3k–$5k/mo | $8k–$12k/mo |
| YouTube | — | $1k–$2k/mo | $4k–$6k/mo |
| Podcasts + newsletters | 1–2 small trainer-business shows, $500/mo | $2k–$3k/mo (2–3 shows + 1 newsletter) | $8k–$14k/mo (6–8 shows incl. one 50k+ show, 2 newsletters) |
| Trade shows | Attend 1 Perform Better ($2k) | Attend 2, exhibit at 1 ($15k–$25k/yr) | Exhibit at Perform Better ×2 + IDEA World, NSCA package ($60k–$100k/yr) |
| Affiliate/referral | Rewardful $49/mo + 25% recurring commissions | Rewardful $99/mo + commissions + 5 seeded trainer-influencers ($5k) | PartnerStack or Rewardful + affiliate manager (fractional $2k/mo) + 20 seeded influencers ($20k) |
| Content production | 1 freelance editor/copywriter $1.5k/mo | Editor $2k + copywriter $1.5k/mo | Editor retainer $4k + senior copywriter $5k/mo |
| Launch PR | DIY + $0–$2k | $10k–$15k launch project | $5k–$8k/mo boutique retainer ($60k–$96k) |
| Marketer | Fractional marketing manager 20 h/mo, $2k–$3k/mo (or founder) | Fractional CMO $6k–$8k/mo | Fractional CMO $12k/mo + paid-media contractor $3k/mo |
| **Expected paying customers (benchmark CAC $400–$700; haircut 1.5–2×)** | 115–200 → **60–130** | 340–600 → **180–400** | 900–1,600 → **450–1,000** |
| **Trials needed (10–15% trial→paid)** | 800–2,000 | 2,300–6,000 | 6,000–16,000 |
| Year-end ARR at $79/mo (haircut case) | $57k–$123k | $170k–$380k | $430k–$950k |

Which end applies to a bootstrapped company: Lean, or Solid only after the first 30–50 paying trainers prove retention. The Heavy tier spends more on marketing than the product will return in year one (payback > 12 months at $79/mo) and only makes sense with outside capital or a higher price point for studios.

---

## 6. SUMMARY TABLE — 12-month runway

| Category | Low (lean team, lean marketing, 10→100 trainers) | Mid (recommended team, solid marketing, 10→100 trainers) | High (US team, heavy marketing, 100→500 trainers) |
|---|---|---|---|
| **One-time startup costs** (LLC, agent, operating agreement, ToS/PP, trademark, Apple + Google accounts, D-U-N-S, A2P registration, Mac/CI, insurance binder) | $3,500 | $8,000 | $16,000 |
| **Infrastructure** (Supabase, Vercel, Claude, email, SMS, Sentry, domain, Workspace; annualised across the growth curve) | $2,400 ($200/mo) | $11,000 ($900/mo) | $48,000 ($4,000/mo) |
| **Team tooling** (GitHub, Figma, Linear, 1Password) | $600 | $2,000 | $3,600 |
| **Legal, accounting, insurance, payroll (ongoing)** | $6,000 | $12,000 | $20,000 |
| **Developer payroll / contractors** (incl. Capacitor wrap + store prep) | $320,000 | $460,000 | $700,000 |
| **Marketing** | $80,000 | $240,000 | $650,000 |
| **Subtotal** | **$412,500** | **$733,000** | **$1,437,600** |
| **Contingency** | 15% = $62,000 | 20% = $147,000 | 25% = $359,000 |
| **12-month total** | **≈ $475,000** | **≈ $880,000** | **≈ $1,800,000** |
| Monthly burn (average) | ≈ $40k | ≈ $73k | ≈ $150k |

Not in the table because they scale with revenue: Stripe ≈ 4.1% + $0.30 per charge; Apple/Google 15% if you sell through IAP; Claude usage above the 100-trainer assumption.

**Absolute floor** (founder as PM, one fractional US senior + one LatAm mid, lean marketing, 12-month build): ≈ **$250k–$300k**, with materially higher schedule and quality risk.

### Items to verify before budgeting (could not be confirmed from primary pages in this session)
1. BLS OEWS May 2025 DFW mean wage for 15-1252 (median $133,290 came from a secondary quote) — https://www.bls.gov/oes/current/oes_19100.htm
2. IDEA World 2026 exhibitor and attendee pricing — request prospectus at https://www.ideafit.com/fitness-conferences/2026-idea-world/become-an-exhibitor/
3. NSCA Annual Engagement Package pricing — jen.rutolo@nsca.com
4. Perform Better exhibitor pricing — https://www.performbetter.com/seminars/
5. FTC Health Breach Notification Rule current text — https://www.ftc.gov/legal-library/browse/rules/health-breach-notification-rule
6. SBA size standard for NAICS 513210 (TDPSA exemption) — https://www.sba.gov/document/support-table-size-standards
7. Current Supabase/Vercel/Twilio/Sentry list prices on the vendor pages (figures above are from 2026 secondary summaries that quote them).
8. Google Ads Keyword Planner CPC for "personal trainer software", "online coaching app", "fitness coaching software" (the $4–$12 range is inferred).
