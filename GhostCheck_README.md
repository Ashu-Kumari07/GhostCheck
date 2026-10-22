# GhostCheck

**Stop applying to jobs that do not exist.**
Paste a job link. A web agent checks the employer's own careers page and returns an explainable **Ghost Score (0-100)** with the evidence behind it.

- Live demo: https://ghostcheck-navy.vercel.app/
- Demo video: https://drive.google.com/file/d/1kFtSaVM0kKdvXwEJf3tpRnTzRBckK_Ao/view?usp=sharing


## Problem

Job boards show postings, but not whether a role is genuinely open. Listings can stay live to project growth, build talent pipelines, meet compliance requirements, or hold a role for a chosen candidate. Reposts can reset dates, and a verified employer badge confirms identity, not hiring intent. Candidates must check each employer's careers page by hand, which does not scale, and a bare score from a tool is hard to trust without proof.

## Solution

GhostCheck verifies a posting against live evidence and explains its verdict.

mermaid
flowchart LR
    A[Paste job link] --> B[Read posting]
    B --> C[TinyFish agent checks<br/>employer careers page]
    C --> D[Analyze signals<br/>age, reposts, wording, pay, news]
    D --> E[Ghost Score 0-100<br/>+ evidence + confidence]
    E --> F{Score band}
    F -->|0-34| G[Likely Real]
    F -->|35-64| H[Uncertain]
    F -->|65-100| I[Likely Ghost]


### Ghost Score

Each signal returns 0 (healthy) to 1 (suspicious). The score is the weighted average of the signals that could be checked, scaled to 100. If a signal cannot be checked it is skipped and the confidence label drops.

| Signal | What it checks | Weight |
|---|---|---|
| Careers-page match | Is the role listed on the employer's own careers page? | 30 |
| Posting age | How long the role has been open | 20 |
| Reposts and duplicates | Same role listed many times or places | 15 |
| Description quality | Specific duties, tools and team vs generic wording | 15 |
| Pay transparency | Whether a salary range is shown | 10 |
| Company hiring news | Recent layoff or hiring-freeze news | 10 |

Bands: **0-34 Likely Real**, **35-64 Uncertain**, **65-100 Likely Ghost**.

## How TinyFish is used

TinyFish is the verification engine. Text-only tools guess from the posting; GhostCheck sends an agent to the employer's own site and shows the user what it did.

| TinyFish capability | What GhostCheck asks it to do | Output used |
|---|---|---|
| **Agent API** (`/v1/automation/run-sse`), run 1 | Open the job posting and extract title, company, location, days since posted, salary shown, reposted flag, the company's careers-page link and the description | Posting fields, age, pay, description quality |
| **Agent API**, run 2 | Open the employer's careers page, search for the role, and report whether it is listed (with link and date) | **Careers-page match** (weight 30) |
| **Search API** (web) | Find the official careers page when the posting does not link to it, and count duplicate listings of the same role | Reposts and duplicates |
| **Search API** (news, last 6 months) | Look for layoff or hiring-freeze news about the company | Company hiring news |
| **Streaming events** (`PROGRESS`, `STREAMING_URL`) | Forward the agent's progress text and live browser view to the report page | "Watch the agent browse" panel |

Both agent runs use `output_schema`, so TinyFish returns typed JSON instead of free text. The posting and careers-page runs go in sequence; the careers-page run, duplicate search and news search then run in parallel to keep the wait short.

Example goal sent in run 2:

> Today is 2026-10-20. This is a company's careers or jobs page. Search or browse it to find an open role titled "Data Analyst" in or near "Austin, TX". A close match counts. If there is a search box, use it. Do not apply or sign in. Report whether a matching role is listed, the URL of the listing if found, and how many days ago it was posted if shown.

The API key stays on the server (`TINYFISH_API_KEY` in `api/analyze.js`) and never reaches the browser. If one signal fails, it is shown as "Not checked" and the confidence label drops instead of failing the whole report.

Code: [`lib/tinyfish.js`](lib/tinyfish.js) (client), [`lib/analyze.js`](lib/analyze.js) (goals, schemas, orchestration), [`lib/score.js`](lib/score.js) (scoring), [`api/analyze.js`](api/analyze.js) (streaming endpoint).

### Integration status

- [x] Agent API run: posting extraction with `output_schema`
- [x] Agent API run: careers-page check
- [x] Search API: careers-page discovery, duplicate listings, layoff news
- [x] Live progress and "Watch the agent browse" view streamed to the report page
- [x] Unit tests with mocked TinyFish responses (`npm test`, no key needed)
- [ ] `[Add after your first real run]` Live end-to-end check against real postings (see Validation)

> **Demo mode:** the three example buttons use prepared sample data (fictional companies) and are labelled "Demo data". If the live API is unreachable, the report page says so and shows a sample report instead of hiding it.

## Features

- Paste a job link, or paste the job text when a link cannot be read
- Live progress screen showing each verification step
- Animated Ghost Score gauge, verdict, confidence and per-signal evidence
- Plain-language next-step advice for each verdict
- How it works page with every signal and weight; Pricing page with waitlist
- Responsive, keyboard-accessible, respects reduced-motion settings

## How GhostCheck is different

| | LinkedIn today | Other trackers | GhostCheck |
|---|---|---|---|
| Posting age / repost hints | Yes (limited) | Yes | Yes |
| Verifies the employer, not hiring intent | Identity only | Varies | Checks the role itself |
| Live check of the employer's careers page | No | Limited | Core feature |
| Evidence and confidence shown | No verdict | Varies | Every signal |
| Works on any public job link | n/a | Often one or two boards | Yes |

Some existing tools already attempt careers-page matching or company-level rates, so our edge is **live verification with visible proof** across any link. Crowd-reported outcomes and company ghost rates are on the roadmap.

## Tech stack

HTML, CSS and JavaScript (no build step) - Node.js serverless function on Vercel - TinyFish Agent and Search APIs.

## Project structure

```
index.html            Home: link input, examples, FAQ
report.html           Live progress, agent view, then the Ghost Score report
how-it-works.html     Steps, signal weights, bands, limits
pricing.html          Plans, unit economics, waitlist dialog
css/styles.css        All styles (design tokens at the top)
js/data.js            Demo results and settings
js/analyze.js         Calls /api/analyze; falls back to demo data if unreachable
js/common.js          Header, footer, menu, waitlist dialog
js/home.js            Home form validation
js/report.js          Progress and report rendering
api/analyze.js        Streaming endpoint: validation, cache, rate limit
lib/tinyfish.js       TinyFish Agent + Search client
lib/analyze.js        Goals, output schemas, parallel orchestration
lib/score.js          Signals, weights, verdict, summary
test/run.js           Tests with mocked TinyFish responses
```

## Run locally

```bash
git clone [repo-url] && cd ghostcheck
cp .env.example .env              # add TINYFISH_API_KEY (https://agent.tinyfish.ai/api-keys)
npm test                          # mocked tests, no key needed
npx vercel dev                    # http://localhost:3000 with the live API
```

Opening `index.html` directly (or `python3 -m http.server`) works too, but there is no API, so reports fall back to labelled sample data.

## Deploy

1. Import the repository in Vercel.
2. Add the environment variable `TINYFISH_API_KEY`.
3. Deploy. `vercel.json` sets the function's max duration to 300 s; lower it if your plan allows less.

Results are cached for 24 hours per link, and each connection is limited to 10 checks per hour to protect credits.

## Validation

We checked real, public postings and spot-checked the verdicts against each employer's careers page.

| Metric | Result |
|---|---|
| Postings checked | `[N]` |
| Flagged as likely ghost | `[X%]` |
| Spot-checks where verdict matched manual review | `[Y of Z]` |
| Median time from link to report | `[seconds]` |
| Runs that needed a fallback (a signal "Not checked") | `[count]` |

Fill this table with real results only, and describe the sample honestly (for example, "in our sample of N postings").

## Business model

| Plan | Price | For |
|---|---|---|
| Free | $0, 3 checks per day | Casual job seekers (acquisition) |
| Pro | $7 / month, unlimited checks, history, stale-posting alerts | Active job seekers |
| Teams | $39 / month, 25 seats, shared dashboard, CSV export | Coaches, bootcamps, career centers |

**Pricing rationale:** Pro sits below typical resume and job-tracking subscriptions, and one avoided wasted application saves hours. Teams spreads cost across many job seekers.

**Unit economics:** cost per check = agent run + search calls; repeated links are cached, so a posting is verified once.

| Item | Value |
|---|---|
| Cost per full check | `[from TinyFish pricing - add source]` |
| Checks per Pro user per month | `[estimate]` |
| Target gross margin | above 70% |

**Market research:** `[add 3-4 cited facts with links: job-seeker volume, ghost-posting prevalence, competing tool prices]`

## Impact

- Job seekers save hours by skipping roles that were never open
- Students and placement cells get evidence-based guidance early in careers
- Visible verification nudges employers toward more honest hiring
- A free tier keeps hiring transparency accessible to everyone

## Limitations and ethics

- Scores are estimates from public information, not statements of fact about any employer
- Some sites block automated checks; the paste-text mode is the fallback, and confidence drops when a signal is missing
- We respect site terms and robots rules, do not bypass logins or CAPTCHAs, and store no personal data

## Roadmap

1. **Now:** web app with live careers-page verification
2. **Next:** browser extension with inline badges and saved-job alerts
3. **Then:** crowd-reported outcomes and an ML classifier trained on labeled postings
4. **Later:** company ghost-rate insights, employer verified badge, public API, more languages

## Team

`[Team name]` - `[Member 1]`, `[Member 2]`, `[Member 3]`, `[Member 4]`

Built for **Kritical Hacks 2026**.

## License

MIT
