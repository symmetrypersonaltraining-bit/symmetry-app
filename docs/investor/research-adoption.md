# Realistic Revenue Expectations: Solo-Founder Coaching SaaS for Personal Trainers

**Prepared:** 11 September 2026
**Context:** A coaching app already in daily use by one trainer's 27 clients. The founder (a full-time trainer, not a marketer) plans to sell it to other trainers at roughly $29 / $59 / $99 per month.

**Sourcing note.** Every figure below carries a URL. Where a number could not be sourced, the report says so explicitly rather than inventing one. Several primary sites (Starter Story, Indie Hackers, ChartMogul, Baremetrics, MicroConf, Stripe, Google's blog) were not directly fetchable from this research environment; figures from them are quoted as they appear in search-indexed excerpts of those pages and in secondary reports that cite them. Apple's developer pages were fetched directly. Treat all third-party "benchmark roundup" numbers as indicative ranges, not audited data.

---

## 1. Benchmarks for early-stage SMB SaaS

### 1a. Free-trial-to-paid conversion

| Metric | Figure | Source |
|---|---|---|
| Opt-in trial (no credit card) → paid | ~8.9% average; a second dataset reports 18.2% | Compiled in [Flint, "29 B2B SaaS Free Trial Conversion Rate Statistics"](https://www.flint.com/articles/b2b-saas-free-trial-conversion-rate-statistics) and [Userpilot](https://userpilot.com/blog/saas-average-conversion-rate/) |
| Opt-out trial (card required) → paid | ~31.4% average; one dataset reports 48.8% | Same two sources |
| Median B2B SaaS trial conversion, 2025 | 18.5% (top performers 35–45%) | [1Capture, "Free Trial Conversion Benchmarks 2025"](https://www.1capture.io/blog/free-trial-conversion-benchmarks-2025) |
| Website visitor → trial signup | 5% (free trial products), 9% (freemium) | [OpenView 2022 Product Benchmarks](https://openviewpartners.com/2022-product-benchmarks/) |
| Freemium → paid (self-serve B2B median) | 2.6%; top quartile 5–8% | OpenView 2025 benchmarks as cited by [productgrowth.blog](https://www.productgrowth.blog/calculators/freemium) |
| Consumer Health & Fitness mobile apps, trial → paid | 37.7% (mobile consumer apps, not B2B; 17–32-day trials convert ~70% better than ≤4-day trials: 42.5% vs 25.5%) | [RevenueCat State of Subscription Apps 2026](https://www.revenuecat.com/state-of-subscription-apps), summarised at [tasu.ai](https://tasu.ai/library/trial-to-paid-conversion-rate-benchmark) |

**No trainer-software-specific trial conversion figure was found.** The RevenueCat fitness number is for consumer apps sold through app stores and should not be used for a B2B trainer subscription.

### 1b. Monthly logo churn, SMB SaaS

| Segment | Monthly churn | Source |
|---|---|---|
| SMB SaaS (general) | 3–5% monthly | [Vena, "2025 SaaS Churn Rate"](https://www.venasolutions.com/blog/saas-churn-rate); [ChurnFree B2B benchmarks](https://churnfree.com/blog/b2b-saas-churn-rate-benchmarks/) |
| SMB SaaS (wider range) | 3–7% monthly (31–58% annual) | [Culta](https://culta.ai/blog/saas-churn-rate-guide-benchmarks) |
| Early-stage (<$300K ARR), self-serve | 6.5% monthly median | ChartMogul data as cited by [SaaS Flywheel](https://saasflywheel.io/blog/saas-churn-rate-benchmarks-2026) |
| ARPA > $1K | 1.8% monthly median | Same (ChartMogul via SaaS Flywheel) |
| 600 small/medium SaaS companies | 7.5% average monthly (61% annual) | Baremetrics analysis, cited in [Cobloom meta-analysis](https://www.cobloom.com/blog/churn-rate-how-high-is-too-high) and [HubiFi](https://www.hubifi.com/blog/calculate-saas-churn-rate) |
| Timing of SMB churn | 43% of SMB customer losses happen in the first 90 days | [Genesys Growth](https://genesysgrowth.com/blog/saas-churn-rates-stats-for-marketing-leaders) |
| Involuntary churn | Up to 48% of churn; ~9% of MRR lost to failed payments on average | [Vena](https://www.venasolutions.com/blog/saas-churn-rate); Baremetrics via [Averi](https://www.averi.ai/blog/15-essential-saas-metrics-every-founder-must-track-in-2026-(with-benchmarks)) |
| Plan-term effect at low ARPA | Under $25 ARPA, annual plans retained 62% of customers vs 41% for monthly | [ChartMogul SaaS Retention Report](https://chartmogul.com/reports/saas-retention-report/) |

**Fitness/coaching-specific B2B churn:** no published churn figure for trainer-software vendors (Trainerize, TrueCoach, PT Distinction, Everfit) was found; their public pages are feature/pricing comparisons only ([PT Distinction comparison](https://www.ptdistinction.com/pt-distinction-trainerize-everfit-truecoach-comparison)). The closest proxy is trainer career attrition: an oft-repeated industry claim that ~80% of new personal trainers leave within 1–2 years ([American Spa](https://www.americanspa.com/sponsored/fitness-industry-s-80-percent-annual-trainer-turnover-problem-has-a-solution); [FitBudd](https://www.fitbudd.com/post/why-most-personal-trainers-quit-within-a-year--and-how-to-beat-the-odds)). FitBudd itself notes no original peer-reviewed source for the 80% figure exists. Implication: a meaningful share of trainer customers will churn because they quit training, not because of the product, which argues for modelling churn at the high end of SMB ranges (5–7%/month) rather than the low end.

### 1c. Customer acquisition cost in the fitness-software category

**Paid search (Google Ads).**
- No published CPC for the exact keywords "personal trainer software" or "online coaching app" was found; keyword-tool sites describe the tools but do not publish those CPCs ([Semrush Keyword Magic](https://www.semrush.com/analytics/keywordmagic/)). This number is unsourced.
- Adjacent trainer-marketing keywords: $1.50–$5 CPC, with "personal trainer near me" at $2–5 ([Origym Google Ads guide](https://www.origym.co.uk/blog/google-ads-for-personal-trainers/)); a 2026 average around $2.90 ([Datalatte](https://datalatte.pro/blog/best-google-ad-keywords-for-personal-trainers-in-2026)); health & fitness vertical ~$5.00 CPC ([Scale Growth Digital](https://scalegrowth.digital/resources/ppc/google-ads-for-fitness-2/)).
- Cross-industry search: average CPC $5.26 and CPL $70.11 (16,000+ campaigns, Apr 2024–Mar 2025) ([WordStream 2025](https://www.wordstream.com/blog/2025-google-ads-benchmarks)); $5.42 in 2026 ([LocaliQ 2026](https://localiq.com/resources/search-advertising-benchmarks-report/)); Business Services CPL $103.54 ([WordStream 2025](https://www.wordstream.com/blog/2025-google-ads-benchmarks)). Health & Fitness CPC rose ~23% year-over-year ([WordStream 2026](https://www.wordstream.com/blog/2026-google-ads-benchmarks)).
- Software-category B2B search terms typically sit above the cross-industry average; a working assumption of $4–8 CPC for "personal trainer software" is a judgement, not a sourced figure.

**Meta (Facebook/Instagram) ads.**
- Median CPM across industries $13.48 (2025); Health & Wellness the highest median CPM at $21.80 ([WordStream Facebook Ads Benchmarks 2025](https://www.wordstream.com/blog/facebook-ads-benchmarks-2025)); Health & Wellness $20.70 in ecommerce data ([Triple Whale](https://www.triplewhale.com/blog/facebook-ads-benchmarks)).
- Lead-gen: average CPL $27.66 across industries; Health & Fitness the most expensive at $52.98 CPL ([WordStream 2025](https://www.wordstream.com/blog/facebook-ads-benchmarks-2025)).
- B2B SaaS on Meta: raw lead CPL ~$58–63; free-trial signups $30–80; demo requests $80–250 ([Get Ryze](https://www.get-ryze.ai/blog/meta-ads-cost-lead-generation-b2b-benchmarks); [Aimers](https://aimers.io/blog/facebook-ads-cost)). Lead-focused CPC planning range $1.90–2.10 ([Digital Applied 2026](https://www.digitalapplied.com/blog/facebook-ads-benchmarks-2026-cpc-cpm-ctr-industry)).
- One indie case: a founder reached $6,772 MRR on $20/day Meta ads ([MRR Story](https://www.mrrstory.com/stories/this-indie-hacker-reached-6772-mrr-with-just-20day-meta-ads)) — page not fetchable, product category unverified.

**Implied paid CAC at these price points.** At $30–80 per trial signup and 10–20% trial conversion, a paid-acquired trainer costs roughly $150–800. Against a $29–59 plan and 5–7% monthly churn (LTV ≈ ARPA / churn ≈ $500–1,200 gross, ~$400–1,000 after processing), paid acquisition is at best break-even for a solo founder and is not a growth engine. This is arithmetic on the sourced ranges, not a sourced CAC.

### 1d. Months to $1k / $5k / $10k MRR (bootstrapped)

| Milestone | Finding | Source |
|---|---|---|
| First $1k MRR | Average 9 months; 25th/50th/75th percentile = 5 / 8 / 12 months (Stripe-verified Indie Hackers products) | [Indie Hackers, "It takes 5 months to reach $1k in MRR"](https://www.indiehackers.com/post/it-takes-5-months-to-reach-1k-in-mrr-491742f806) |
| First $1k MRR | Median 12–18 months "even for founders executing well" (MicroConf / Indie Hackers / Freemius data) | [Freemius, State of Micro-SaaS 2025](https://freemius.com/blog/state-of-micro-saas-2025/); [Shno.co](https://www.shno.co/marketing-statistics/micro-saas-launch-statistics) |
| Share never reaching $1k MRR | ~70% (54% of indie products make $0) | [Solo Operator Stack](https://solooperatorstack.com/blog/indie-hacker-revenue-distribution-tam-clarity/); [BuildMVPFast](https://www.buildmvpfast.com/blog/saas-only-way-out-indie-hacker-dream-desperation-2026) |
| $10k MRR | Median 12–18 months from first dollar, for the minority that get there; only 8–10% of indie hackers report >$10k MRR | [Unbuilt Lab](https://unbuiltlab.com/blog/indie-hacker-10k-mrr-case-study.html); [Superframeworks](https://superframeworks.com/articles/best-micro-saas-ideas-solopreneurs); [TruStats](https://trustats.live/blog/how-much-do-indie-hackers-make) |
| Revenue distribution of published indie products | ~40% under $1k MRR, ~35% $1k–5k, ~15% $5k–10k, 8–10% over $10k | [Steal What Works](https://stealwhatworks.com/blogs/news/indie-hackers-over-10k-per-month) |
| $1M ARR | Typical 2–5 years; only 3.3% get there in under 12 months (2,500+ companies) | [ChartMogul 2025 SaaS Growth Report](https://chartmogul.com/reports/saas-growth-the-odds-of-making-it/) |
| Full-time vs part-time | Full-time founders grow 2.2x faster; ~50% of independent SaaS are solo-founded | [MicroConf State of Independent SaaS](https://microconf.com/state-of-indie-saas) via [Shno.co](https://www.shno.co/marketing-statistics/micro-saas-launch-statistics) |
| Average MRR of Baremetrics-benchmarked companies | $19,000; average Quick Ratio 1.4 | [Baremetrics, "Most startups are not crushing it"](https://baremetrics.com/blog/most-startups-are-not-crushing-it) |

**No sourced figure for months-to-$5k MRR was found;** interpolating between the $1k and $10k data points (~9–12 months to $1k, 12–18 months from first dollar to $10k for the successful minority) suggests roughly 12–15 months for those on a successful trajectory, but that is an inference.

The "part-time founder" point matters here: the founder is a full-time trainer, so the product is a part-time business, and MicroConf's data says part-time founders grow at less than half the rate of full-time ones.

---

## 2. Case studies: small coaching-software / fitness-SaaS launches

Detailed month-3/6/12/24 MRR is rarely published; where it is absent the table says "not published".

### 2.1 FitSW (personal-trainer software) — Jacob Montoya, bootstrapped
- **What:** Web + mobile software for trainers: workouts, progress tracking, meal plans, payments, scheduling ([Starter Story, "$20K/Month Software For Personal Trainers"](https://www.starterstory.com/software-for-personal-trainers)).
- **Launch:** Side project in 2016; founder built an MVP and "mentioned it on a couple of personal trainer forums"; started charging monthly; "many people quickly signed up"; went full-time and launched as an official business in March 2017 ([Kimp founder story](https://www.kimp.io/jacob-montoya-fitsw/); [Starter Story](https://www.starterstory.com/software-for-personal-trainers)).
- **Revenue timeline:** $20K/month at first Starter Story interview; $25K/month with 20,000+ trainers in a later update; $50K/month and 30,000+ trainers by the 2025 update ([Starter Story update](https://www.starterstory.com/stories/we-have-bootstrapped-our-monthly-revenue-to-50k-over-last-year)). Month-3/6/12/24 MRR: not published. Note this is ~8 years to $50K/month, with a technical founder working full-time from 2017.
- **Acquisition:** trainer forums for the first users, then SEO/blogging and link-building as the core channel ([SEO Buddy interview](https://seobuddy.com/blog/my-seo-journey-fitsw/)).
- **Hardest part (per interviews):** SEO took years to compound; the founder's own account stresses "start a blog, know on-page SEO, build links" as the three big lessons ([SEO Buddy](https://seobuddy.com/blog/my-seo-journey-fitsw/)).

### 2.2 TrueCoach (formerly Fitbot) — Casey Jenks & Robert Jack, bootstrapped, acquired 2020
- **What:** Remote-coaching workout delivery for coaches; founded 2015 after Jenks, an OPEX remote-coaching client, saw coaches running on "email and spreadsheets" ([GrowthMarketer, "From Idea to Exit"](https://growthmarketer.com/from-idea-to-exit-the-story-of-truecoach/); [Athletech News](https://athletechnews.com/opex-hires-truecoach-founder-casey-jenks-to-lead-coachrx/)).
- **Early customers:** "an amazing group of supportive early users and beta testers — a group of serious coaches that used their MVP before it was fully-baked"; early users were happy to start paying ([GrowthMarketer](https://growthmarketer.com/blog/how-i-scaled-truecoach-to-exit/)).
- **Acquisition:** personal savings allocated to test paid Facebook and Google campaigns; then digital-marketing-led growth ([GrowthMarketer](https://growthmarketer.com/blog/how-i-scaled-truecoach-to-exit/)).
- **Revenue timeline:** month-3/6/12/24 MRR not published. Served 20,000+ coaches at acquisition by TSG in April 2020 ([Health & Fitness Association](https://www.healthandfitness.org/tsg-announces-acquisition-of-truecoach/)); $1.3M revenue in 2021 per [GetLatka](https://getlatka.com/companies/truecoach) (third-party estimate). That is roughly 5 years to ~$100K MRR with two technical co-founders.
- **Hardest part:** the founder narrative emphasises that the product was easy relative to finding a repeatable paid channel with limited savings ([GrowthMarketer](https://growthmarketer.com/from-idea-to-exit-the-story-of-truecoach/)).

### 2.3 ALTR Project (programming tool for CrossFit gyms & coaches) — Aimee Tawhai
- **What:** Programming/coaching dashboard for gym owners and coaches, replacing spreadsheets; founder was 23, a gym co-owner, building "from her bedroom" ([Starter Story, "How I Launched A $7K/Month SaaS For Gyms"](https://www.starterstory.com/how-to-launch-a-saas-for-gyms)).
- **Revenue:** averaging $7–8K USD/month at interview, used in 26 countries; month-3/6/12/24 MRR not published.
- **Acquisition:** "social media outreach and personalized demo calls"; CrossFit-name ambassadors ([Starter Story](https://www.starterstory.com/starters/aimee-tawhai)).
- **Hardest part:** not quotable from the accessible excerpt; the story frames growth as inflecting only after a full redesign of the coaching dashboard.
- **Why relevant:** closest analogue to this founder — a practitioner selling to peers via outreach and demos, plateauing in the $7–8K/month band.

### 2.4 Hevy Coach (trainer-facing companion to the Hevy workout app) — Guillem Ros & Desmond McNamee
- **What:** Coaching software launched on top of the consumer Hevy app; priced by client brackets from USD 25/month for up to 10 clients ([Coachway Hevy Coach review](https://coachway.io/articles/hevy-coach-review/); [Hevy Coach pricing](https://hevycoach.com/pricing/)).
- **Launch:** public launch announced November 2023 ([Guillem Ros LinkedIn](https://www.linkedin.com/posts/guillemrossalvador_today-we-launch-hevy-coach-a-tool-for-personal-activity-7127705085454733312-hxrh)).
- **Revenue:** Hevy Coach revenue is not published separately. The parent Hevy app reached ~$2M annual revenue by March 2023 ([Ottawa Business Journal](https://obj.ca/fitness-app-entrepreneur-pumped-by-hevys-progress-to-2m-in-annual-revenue/)) after 2M downloads with no paid marketing ([RevenueCat podcast](https://www.revenuecat.com/blog/growth/guillem-ros-hevy-podcast)). (A third-party estimate of $240K ARR in 2023 at [GetLatka](https://getlatka.com/companies/hevyapp.com) conflicts with OBJ's reported figure; treat both as unverified.)
- **Acquisition:** the coach product was pulled by demand from an existing consumer user base ("launched in response to user feedback") — a distribution asset this founder does not have.
- **Hardest part:** growth "based on word of mouth and App Store and Google Play algorithms" after "reaching out to their immediate network" — i.e. years of consumer traction preceded the B2B product ([RevenueCat](https://www.revenuecat.com/blog/growth/guillem-ros-hevy-podcast)).

### 2.5 Floga (app for yoga teachers and practitioners) — Umberto Mezzadra
- **What:** Mobile app for yoga teachers/practitioners, built on five years of the PlayPauseBe yoga-deck brand ([RevenueCat customer story](https://www.revenuecat.com/customers/floga)).
- **Launch:** pre-launched May 2025 with a lifetime deal sold outside the app stores; $120K+ in 24 hours ([Indie Hackers interview, June 2026](https://www.indiehackers.com/post/tech/from-physical-product-to-10k-mo-app-JLVZDxJ9RfjdYdvINqgp)).
- **Revenue:** ~$10K/month with ~4,000 active users about 12 months after launch ([Indie Hackers](https://www.indiehackers.com/post/tech/from-physical-product-to-10k-mo-app-JLVZDxJ9RfjdYdvINqgp)). Month-3/6 MRR not published (the LTD spike distorts early MRR).
- **Acquisition:** pre-existing email/customer audience from the physical product; LTD launch.
- **Hardest part:** the story's framing is that the app only worked because the audience existed first ("built an audience around a physical product, then built an app").

### 2.6 CoachDesk (all-in-one for self-employed personal trainers) — solo UK founder, 2026
- **What:** Clients, bookings, invoicing, workout plans in one place; built "in under a week" ([Indie Hackers, June 2026](https://www.indiehackers.com/post/i-built-a-saas-for-personal-trainers-in-under-a-week-turns-out-that-was-the-easy-part-29c9e88209)).
- **Revenue:** "a handful of trial signups with zero conversions" at the time of posting; MRR effectively $0.
- **Acquisition:** the thread's feedback centred on the website explaining "what the product does before explaining why a personal trainer should care" — positioning, not features, was the blocker.
- **Hardest part (founder's own title):** building was "the easy part"; customer acquisition was the hard part.

### 2.7 Trainerize (for scale reference) — Sharad Mohan, 2008
- Founded 2008 as Gym Technik, a $4.99 consumer app, by founders keeping day jobs; bootstrapped "for more than a decade" before acquisition; ~$5M revenue with 51 staff in 2021 ([Club Solutions Magazine](https://clubsolutionsmagazine.com/2018/06/the-inspirational-story-behind-why-sharad-mohan-founded-trainerize/); [Techcouver](https://techcouver.com/2023/01/12/pandemic-exit-trainerize-growth-milestone/); [GetLatka](https://getlatka.com/companies/trainerize)). Included to show the category's incumbents took 10+ years and full teams to reach mid-seven-figure revenue.

**Pattern across the cases:** (1) every trainer-software company that reached $7K+/month had either a technical founder working full-time, a pre-existing audience, or paid-acquisition budget; (2) the one 2026 solo-founder launch with no audience (CoachDesk) reported zero conversions from its first trials; (3) none published month-by-month MRR, so the scenarios in Section 5 rest on the general SaaS benchmarks rather than category-specific curves.

---

## 3. Founder-led distribution: what a personal network and communities can realistically deliver

### 3a. What the evidence says about early customer counts
- The first ten customers "rarely come from ads and usually come from relationships, outreach, and persistence" ([SaaS Club, "First Customers"](https://saasclub.io/podcast/first-customers/)); one bootstrapped SaaS "scrapp[ed] together 2 to 4 new customers each month," and another took "nearly a year to get the first 10 paying customers" ([SaaS Club, "Founder-Led Sales"](https://saasclub.io/podcast/founder-led-sales/)).
- MicroConf/Freemius data: ~50% of independent SaaS founders rely on communities and referrals for early customers and report stronger LTV from them; word of mouth is named as the highest-impact early channel ([Freemius State of Micro-SaaS 2025](https://freemius.com/blog/state-of-micro-saas-2025/); [Shno.co roundup](https://www.shno.co/marketing-statistics/micro-saas-launch-statistics)).
- FitSW's founder got its first paying trainers by mentioning the MVP "on a couple of personal trainer forums" and reported people "quickly signed up" — no count published ([Kimp](https://www.kimp.io/jacob-montoya-fitsw/)). ALTR grew via "social media outreach and personalized demo calls" ([Starter Story](https://www.starterstory.com/starters/aimee-tawhai)). TrueCoach's first payers were a "group of serious coaches" who beta-tested the MVP ([GrowthMarketer](https://growthmarketer.com/blog/how-i-scaled-truecoach-to-exit/)).
- **No survey was found that quantifies the percentage of first customers coming from personal networks**, nor one that counts customers recruited from trainer Facebook groups. Any specific number here would be unsourced. Practitioner playbooks claim warm-intro reply rates of 25–40% and close rates of 25–35% ([Scout blog](https://askscout.ai/blog/warm-intro-prospecting-saas-founders)), but these are vendor claims, not survey data.

### 3b. Size of the reachable communities
- r/personaltraining: 74K+ members ([Pain on Social subreddit list](https://painonsocial.com/subreddits/personal-trainers)). The same source and [FitBudd's Reddit guide](https://www.fitbudd.com/reddit-for-personal-trainers) warn that trainer subreddits restrict self-promotion; software pitches are typically removed.
- Facebook: trainer groups such as "Personal Trainers & Fitness Professional Support Group," "Profitable Personal Trainers," "Personal Trainers USA," "Online Trainers Unite" and "Fitness Business Freedom Formula" are widely recommended ([Exercise.com list](https://www.exercise.com/grow/best-fitness-business-owner-facebook-groups/); [WellnessLiving list](https://www.wellnessliving.com/blog/facebook-groups-fitness-businesses-should-join/)). **Member counts were not retrievable** from indexed pages; the founder should check them directly (they are typically in the 5K–50K range, but that is unsourced).
- Instagram: no quantitative evidence on B2B trainer recruitment via Instagram was found; case studies mention "social media outreach" without counts.

### 3c. Do network/community customers stick?
- The best-sourced evidence is the Wharton bank study: referred customers were 18% less likely to churn than non-referred customers, with the gap persisting over 33 months, and ~25% higher lifetime value ([Schmitt, Skiera & Van den Bulte 2011, Wharton](https://faculty.wharton.upenn.edu/wp-content/uploads/2012/04/Schmitt-Skiera-vandenBulte-2011-Referral-Programs-Customer-Value.pdf); [Extole summary](https://www.extole.com/blog/referral-marketing-customers-significantly-more-valuable-loyal-ama-study/)). This is retail banking, not SaaS, so treat it as directional.
- Counter-pressure: 43% of SMB churn happens in the first 90 days ([Genesys Growth](https://genesysgrowth.com/blog/saas-churn-rates-stats-for-marketing-leaders)), and "friend" customers who sign up out of goodwill rather than need are a well-known source of that early churn — but no study quantifying "goodwill churn" was found.
- **Working estimate (judgement, not sourced):** a trainer with a real local network can plausibly get 5–15 peers to try the product in the first 6 months and 3–8 to pay, with community posts adding a similar number of trials at lower conversion. Of paying network customers, expect roughly 60–75% to still be paying at month 6 (consistent with 5–7% monthly churn, moderated by the referral-loyalty effect).

---

## 4. App store and payment economics (as of 11 September 2026)

### 4a. Apple App Store Small Business Program
- **Commission:** 15% (instead of 30%) on paid apps and in-app purchases including subscriptions ([Apple Developer, Small Business Program](https://developer.apple.com/app-store/small-business-program/) — fetched directly).
- **Threshold:** eligible if the developer and all Associated Developer Accounts earned no more than **$1,000,000 USD in proceeds** (sales net of Apple's commission and certain taxes/adjustments) in the prior calendar year; new developers are eligible. Exceeding $1M mid-year moves future sales to the standard rate; falling back under re-qualifies the following year ([Apple](https://developer.apple.com/app-store/small-business-program/)).
- Because the threshold is on proceeds after commission, it equates to roughly $1.18M gross ([RevenueCat guide](https://www.revenuecat.com/blog/engineering/small-business-program)).

### 4b. Google Play service fees
- **From 30 June 2026 (US, EEA, UK first):** Google separated its service fee from its billing fee. Service fee is **10% on the first $1M of annual earnings and on all auto-renewing subscriptions**, "regardless of whether you use Google Play's billing system, alternative billing, or external web links." Using Google Play Billing adds a **5% billing fee**, so Play-billed subscriptions cost 15% total; routing to alternative billing or a web link leaves Google's cut at 10% plus your own processor ([Android Developers Blog, June 2026](https://android-developers.googleblog.com/2026/06/play-expanded-billing.html); [Adapty explainer](https://adapty.io/blog/google-play-billing-changes-subscriptions-fees/); [PricePush](https://pricepush.app/blog/google-play-subscription-fees-2026-real-math)). One-time purchases: 20% (new installs) / 25% (existing installs) per the same secondary sources.
- Legacy/reference: the prior 15%-on-first-$1M tier terms remain published ([Google Play 15% tier terms](https://play.google/intl/en_us/additional-service-fee-tier-terms/)); official fee page: [Play Console Help, Service fees](https://support.google.com/googleplay/android-developer/answer/112622?hl=en).

### 4c. Can a coaching app use Stripe web checkout? (US, post-2025 rulings)
- **Apple's rule text (fetched directly):** "Apps on the United States storefront are not prohibited from including buttons, external links, or other calls to action that direct customers to purchasing mechanisms other than in-app purchase" (Guideline 3.1.1). Outside the US, such links are prohibited except under 3.1.1(a)/3.1.3(a) ([App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)).
- **Also relevant:** 3.1.3(b) Multiplatform Services lets users access subscriptions bought on your website inside the app "provided those items are also available as in-app purchases within the app"; 3.1.3(d) Person-to-Person Services explicitly allows non-IAP payment for "real-time person-to-person services … for example … fitness training" between two individuals, while "one-to-few and one-to-many real-time services must use in-app purchase" ([Apple guidelines](https://developer.apple.com/app-store/review/guidelines/)). So a trainer's own 1:1 client payments collected through the app may run on Stripe, but group programs sold to clients in-app must use IAP.
- **Legal status:**
  - 30 April 2025: the N.D. Cal. district court (Judge Gonzalez Rogers) found Apple in willful contempt of the 2021 injunction, barred it from taking any commission on purchases made via external links, and banned deterrent screens ([Median.co explainer](https://median.co/blog/epic-v-apple-payment-links-ruling-explained); [CommLaw Group](https://commlawgroup.com/2025/major-app-store-policy-changes-following-recent-epic-v-apple-ruling/)). Apple updated guidelines 3.1.1/3.1.3 in May 2025 — no entitlement, no approval, no commission ([Stora implementation guide](https://stora.sh/blog/2026-05-16-apple-app-store-external-purchase-links-implementation-guide)).
  - 11 December 2025: the Ninth Circuit upheld the contempt finding but held the total ban on link-out commissions overbroad, allowing Apple a cost-based fee for its IP once the district court approves one ([Ninth Circuit opinion, Justia](https://law.justia.com/cases/federal/appellate-courts/ca9/25-2935/25-2935-2025-12-11.html); [MacRumors](https://www.macrumors.com/2025/12/11/app-store-fees-external-payment-links/)).
  - 13–14 August 2026: Apple asked the district court to approve **15% standard, 10% for partner programs, and 5% for Small Business Program members** on link-out purchases ([MacRumors](https://www.macrumors.com/2026/08/13/app-store-fees-apple-link-outs/); [Slashdot](https://news.slashdot.org/story/26/08/14/0947204/apple-wants-to-charge-developers-up-to-15-percent-for-linking-outside-the-app-store)). **As of today the commission on US link-outs remains 0%** until the court approves a rate; a related question is before the Supreme Court with Apple's brief due 14 September 2026 ([Value Add Pulse](https://valueaddvc.com/pulse/apple-15-percent-app-store-external-purchases-2026); [tiun.io](https://tiun.io/blog/ios-external-payments-us-cost-2026)).
- **Practical implementation:** an in-app button opens a web view or browser to a Stripe/Paddle checkout and returns the user to the app ([RevenueCat monetization guide](https://www.revenuecat.com/blog/growth/apple-anti-steering-ruling-monetization-strategy)). Plan for a 5% (SBP) fee on link-outs if Apple's proposal is approved.
- **Category practice:** incumbents price and sell coach subscriptions on their websites (e.g. Trainerize Pro 5 at $25/month for 5 clients, $175 for 50; TrueCoach $26 / $58 / $137–164 for 5 / 20 / 50 clients; PT Distinction $89.90 flat for 50 clients) ([QuickCoach Trainerize pricing](https://www.quickcoach.fit/trainerize-pricing-2026.html); [QuickCoach TrueCoach pricing](https://www.quickcoach.fit/truecoach-pricing-2026.html); [PT Distinction comparison](https://www.ptdistinction.com/pt-distinction-trainerize-everfit-truecoach-comparison)). TrueCoach additionally takes 5% of client payments processed through it ([Coachway](https://coachway.io/articles/truecoach-vs-trainerize-vs-my-pt-hub/)). This confirms the $29/$59/$99 tiers are inside the market's range.

### 4d. Stripe fees
- Standard US online card rate **2.9% + 30¢** per successful charge; ACH Direct Debit 0.8% capped at $5 ([Stripe Pricing](https://stripe.com/pricing); [Stripe Billing pricing](https://stripe.com/billing/pricing)).
- **Stripe Billing** (recurring subscriptions, dunning, customer portal): **0.7% of billing volume** on pay-as-you-go, on top of processing (Starter 0.5% and Scale 0.8% were merged into 0.7% in July 2024) ([UsageBox](https://usagebox.com/articles/stripe-billing-fees-2026-the-07-percent-math); [Flexprice](https://flexprice.io/blog/stripe-pricing-breakdown-2026)). Stripe's page shows 0.67% for volume above $1M/month ([Stripe Billing pricing](https://stripe.com/billing/pricing)).
- International cards +1.5%; currency conversion +1%; disputes $15 ([PriceWorld](https://priceworld.com/merchant-fees/stripe/); [Checkout Page](https://checkoutpage.com/blog/stripe-processing-fees)).
- **Worked example:** a $59 monthly plan via Stripe Billing nets about $59 − ($1.71 + $0.30 + $0.41) ≈ $56.58 (≈4.1% all-in). The same plan via Apple IAP under the Small Business Program nets $50.15 (15%); via Google Play Billing nets $50.15 (10% + 5%); via a Play external link nets $53.10 minus Stripe.

---

## 5. Three revenue scenarios, months 1–24

### Modelling method
Paying accounts(m) = accounts(m−1) × (1 − churn) + trials(m) × conversion. MRR = accounts × ARPA. "Seed" accounts are trainers from the founder's direct network who pay in month 1 without a trial. Trials start from the founder's outreach and community posts only (no paid ads) in Conservative and Base; Optimistic assumes a modest ad/content budget from month 6. The founder's own 27 clients are users, not revenue, and are excluded.

### Assumptions

| Assumption | Conservative | Base | Optimistic | Benchmark anchor |
|---|---|---|---|---|
| Seed paying trainers, month 1 (network) | 2 | 4 | 8 | "First ten customers … from relationships"; 2–4 new customers/month typical ([SaaS Club](https://saasclub.io/podcast/founder-led-sales/)) |
| Trial starts / month, months 1–3 | 10 → 6 | 15 → 12 | 25 | Network exhausts fast; communities restrict promotion ([FitBudd Reddit guide](https://www.fitbudd.com/reddit-for-personal-trainers)) |
| Trial starts / month, months 4–12 | 5–6 | 12–16 | 28–42 | Part-time founders grow <½ as fast ([MicroConf via Shno](https://www.shno.co/marketing-statistics/micro-saas-launch-statistics)) |
| Trial starts / month, months 13–24 | 6–8 | 18–25 | 44–66 | Optimistic assumes SEO/referral compounding as in FitSW ([SEO Buddy](https://seobuddy.com/blog/my-seo-journey-fitsw/)) |
| Trial → paid conversion | 10% | 15% | 22% | Opt-in trials 8.9–18.2%; B2B median 18.5% ([Flint](https://www.flint.com/articles/b2b-saas-free-trial-conversion-rate-statistics); [1Capture](https://www.1capture.io/blog/free-trial-conversion-benchmarks-2025)) |
| Monthly logo churn | 7% | 5% | 3.5% | Small SaaS avg 7.5%; early-stage self-serve 6.5%; SMB 3–5% ([Cobloom](https://www.cobloom.com/blog/churn-rate-how-high-is-too-high); [SaaS Flywheel](https://saasflywheel.io/blog/saas-churn-rate-benchmarks-2026); [Vena](https://www.venasolutions.com/blog/saas-churn-rate)) |
| ARPA (blended $29/$59/$99) | $36 | $44 | $50 | Incumbent price points $25–$175/month ([QuickCoach](https://www.quickcoach.fit/trainerize-pricing-2026.html)) |
| Total trials over 24 months | 160 | 423 | 1,043 | — |

### Resulting MRR (gross, before Stripe/app-store fees)

| Month | Conservative | Base | Optimistic |
|---|---|---|---|
| 3 | ~4 paying, **$137** | ~9 paying, **$413** | ~23 paying, **$1,156** |
| 6 | ~5 paying, **$161** | ~13 paying, **$580** | ~39 paying, **$1,953** |
| 12 | ~6 paying, **$205** | ~22 paying, **$954** | ~77 paying, **$3,828** |
| 18 | ~7 paying, **$254** | ~31 paying, **$1,368** | ~121 paying, **$6,067** |
| 24 | ~9 paying, **$310** | ~42 paying, **$1,832** | ~172 paying, **$8,602** |

Net of Stripe (~4.1%) these are about 4% lower; if sold through Apple IAP under the Small Business Program, about 15% lower.

### Why each scenario is plausible

**Conservative (~$200 MRR at month 12, ~$300 at month 24).** This is the modal outcome for an indie product: ~70% never reach $1K MRR and 54% make $0 ([Solo Operator Stack](https://solooperatorstack.com/blog/indie-hacker-revenue-distribution-tam-clarity/)). The 2026 CoachDesk launch — a solo founder selling to personal trainers with no audience — reported a handful of trials and zero conversions ([Indie Hackers](https://www.indiehackers.com/post/i-built-a-saas-for-personal-trainers-in-under-a-week-turns-out-that-was-the-easy-part-29c9e88209)). With 5–8 trials a month, 10% conversion and 7% churn, the customer base plateaus at roughly (trials × conv) / churn ≈ 8–11 accounts; that is the arithmetic ceiling, not pessimism. Churn is set high because trainers themselves leave the profession at high rates ([American Spa](https://www.americanspa.com/sponsored/fitness-industry-s-80-percent-annual-trainer-turnover-problem-has-a-solution)).

**Base (~$950 MRR at month 12, ~$1.8K at month 24).** Reaching ~$1K MRR at month 12 sits between the Indie Hackers Stripe-verified median (8 months) and the MicroConf/Freemius median (12–18 months) ([Indie Hackers](https://www.indiehackers.com/post/it-takes-5-months-to-reach-1k-in-mrr-491742f806); [Freemius](https://freemius.com/blog/state-of-micro-saas-2025/)), which is appropriate for a part-time founder with a credible personal network. 15% conversion is mid-range for opt-in trials with founder-led onboarding; 5% churn is the SMB benchmark midpoint ([Vena](https://www.venasolutions.com/blog/saas-churn-rate)). It lands in the "$1K–5K MRR" band that ~35% of revenue-generating indie products occupy ([Steal What Works](https://stealwhatworks.com/blogs/news/indie-hackers-over-10k-per-month)). ALTR Project — a gym co-owner selling to peers via outreach and demo calls — plateaued around $7–8K/month, so Base is well inside what a practitioner-founder has achieved ([Starter Story](https://www.starterstory.com/how-to-launch-a-saas-for-gyms)).

**Optimistic (~$3.8K MRR at month 12, ~$8.6K at month 24).** This requires the founder to behave like the successful minority: strong network seeding (8 paying trainers on day one), a working content/SEO or referral loop by month 6, some paid spend, 22% conversion (still below the credit-card-required average of 31%) and 3.5% churn (best-in-class for SMB). Approaching $10K MRR around month 24–26 matches the 12–18-months-from-first-dollar path reported for the 8–10% of indie products that get there ([Unbuilt Lab](https://unbuiltlab.com/blog/indie-hacker-10k-mrr-case-study.html); [TruStats](https://trustats.live/blog/how-much-do-indie-hackers-make)). It is slower than Floga (~$10K/month at 12 months) because Floga launched to a five-year-old audience ([Indie Hackers](https://www.indiehackers.com/post/tech/from-physical-product-to-10k-mo-app-JLVZDxJ9RfjdYdvINqgp)), and far slower than FitSW's eventual $50K/month, which took ~8 years of full-time SEO work ([Starter Story](https://www.starterstory.com/stories/we-have-bootstrapped-our-monthly-revenue-to-50k-over-last-year)). Paid acquisition is not the engine even here: at $30–80 per trial signup ([Get Ryze](https://www.get-ryze.ai/blog/meta-ads-cost-lead-generation-b2b-benchmarks)) and 22% conversion, CAC is $135–365 against a ~$50 ARPA.

### What would move the founder from Conservative toward Base
1. Charge from the founder's own 27 clients' outcomes: a case study is the only marketing asset that exists today.
2. Require a card at trial start (opt-out) only once onboarding is strong; it roughly triples conversion in benchmark data but suppresses trial starts ([Flint](https://www.flint.com/articles/b2b-saas-free-trial-conversion-rate-statistics)).
3. Offer annual plans early: at low ARPA, annual plans retained 62% vs 41% for monthly ([ChartMogul](https://chartmogul.com/reports/saas-retention-report/)).
4. Sell coach subscriptions on the web via Stripe (0% Apple link-out commission today; plan for 5% under SBP if Apple's August 2026 proposal is approved) rather than IAP at 15%.
5. Treat the first 90 days of every account as the churn window (43% of SMB losses) and do the onboarding personally.
