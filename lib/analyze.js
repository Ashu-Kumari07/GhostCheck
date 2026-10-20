/*
 * Orchestrates one analysis. emit(event) streams progress to the browser.
 * Events: {type:"step",index,state} {type:"agent",text} {type:"stream",url} {type:"result",data} {type:"error",message}
 * Step indexes match the UI list: 0 read, 1 open careers, 2 search role, 3 duplicates, 4 news, 5 score.
 */
const tf = require("./tinyfish");
const { buildResult } = require("./score");

const BOARDS = ["linkedin.com", "indeed.com", "glassdoor.com", "naukri.com", "ziprecruiter.com", "monster.com", "wellfound.com", "internshala.com", "simplyhired.com", "foundit.in", "instahyre.com"];
const LAYOFF = /(layoff|laid off|job cuts|cuts jobs|hiring freeze|workforce reduction|redundanc)/i;
const SIX_MONTHS_MIN = 6 * 30 * 24 * 60;

const EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    company: { type: "string" },
    location: { type: "string", nullable: true },
    posted_days_ago: { type: "integer", minimum: 0, nullable: true },
    salary_listed: { type: "boolean" },
    salary_text: { type: "string", nullable: true },
    reposted: { type: "boolean" },
    careers_page_url: { type: "string", nullable: true },
    description: { type: "string" }
  },
  required: ["title", "company", "description", "salary_listed"]
};
const CAREERS_SCHEMA = {
  type: "object",
  properties: {
    listed: { type: "boolean" },
    matching_url: { type: "string", nullable: true },
    posted_days_ago: { type: "integer", minimum: 0, nullable: true },
    notes: { type: "string", nullable: true }
  },
  required: ["listed"]
};

const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (_) { return ""; } };
const isBoard = (u) => BOARDS.some((b) => host(u) === b || host(u).endsWith("." + b));
const httpUrl = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : null; } catch (_) { return null; } };
const today = () => new Date().toISOString().slice(0, 10);

function extractGoal() {
  return "Today is " + today() + ". This page is a job posting. Extract: the job title; the hiring company name; the job location; " +
    "how many days ago it was posted as an integer (use the posted date or text such as '3 days ago', relative to today; leave empty if not shown); " +
    "whether a salary or pay range is shown, and the pay text if so; whether the page says the job was reposted; " +
    "the URL of the company's own careers page if the page links to it; and the full job description text. " +
    "Do not apply, sign in or fill forms.";
}
function careersGoal(title, location) {
  return "Today is " + today() + ". This is a company's careers or jobs page. Search or browse it to find an open role titled \"" + title + "\"" +
    (location ? " in or near \"" + location + "\"" : "") + ". A close match (same role, minor wording differences) counts. " +
    "If there is a search box, use it. Do not apply or sign in. Report whether a matching role is listed, the URL of the listing if found, " +
    "and how many days ago it was posted if shown.";
}

async function findCareersUrl(extracted, postingUrl, search) {
  const given = extracted.careers_page_url && httpUrl(extracted.careers_page_url);
  if (given) return given;
  try {
    const results = await search({ query: extracted.company + " careers", purpose: "Find the official careers page of this employer" });
    const hit = results.find((r) => r.url && /career|jobs/i.test(r.url) && !isBoard(r.url));
    if (hit) return hit.url;
  } catch (_) { /* fall through */ }
  return postingUrl && !isBoard(postingUrl) ? new URL(postingUrl).origin : null;
}

async function analyze(input, emit, deps) {
  const d = Object.assign({ runAgent: tf.runAgent, search: tf.search }, deps || {});
  const step = (index, state) => emit({ type: "step", index, state });
  const onProgress = (text) => emit({ type: "agent", text });
  const onStreamingUrl = (url) => { if (/^https:\/\//.test(url)) emit({ type: "stream", url }); };

  let extracted, postingUrl = null;

  // ---- 0. read the posting ----
  step(0, "running");
  if (input.text) {
    extracted = { title: "Pasted job description", company: "", description: input.text, salary_listed: /(\$|€|£|₹|salary|compensation|per (year|hour|month)|\bLPA\b)/i.test(input.text) };
  } else {
    postingUrl = input.url;
    extracted = await d.runAgent({ url: postingUrl, goal: extractGoal(), outputSchema: EXTRACT_SCHEMA, onProgress, onStreamingUrl });
    if (!extracted || !extracted.title) { const e = new Error("unreadable"); e.friendly = "We could not read this posting. Paste the job text instead."; throw e; }
  }
  step(0, "done");

  const company = (extracted.company || "").trim();
  const canVerify = !input.text && company;

  // ---- 1-2. careers page (agent), 3. duplicates (search), 4. news (search): run in parallel ----
  let careers = null, careersHost = "", dupCount = null, newsFlag = null;

  const careersTask = async () => {
    if (!canVerify) { step(1, "done"); step(2, "done"); return; }
    step(1, "running"); step(2, "running");
    try {
      const url = await findCareersUrl(extracted, postingUrl, d.search);
      if (url) {
        careersHost = host(url);
        careers = await d.runAgent({ url, goal: careersGoal(extracted.title, extracted.location), outputSchema: CAREERS_SCHEMA, onProgress, onStreamingUrl });
      }
    } catch (_) { careers = null; }
    step(1, "done"); step(2, "done");
  };

  const dupTask = async () => {
    if (!canVerify) { step(3, "done"); return; }
    step(3, "running");
    try {
      const results = await d.search({ query: extracted.title + " " + company + " job", purpose: "Count duplicate listings of the same job" });
      const t = extracted.title.toLowerCase();
      const urls = new Set(results.filter((r) => (String(r.title) + " " + String(r.snippet)).toLowerCase().includes(t) && r.url !== postingUrl).map((r) => r.url));
      dupCount = urls.size;
    } catch (_) { dupCount = null; }
    step(3, "done");
  };

  const newsTask = async () => {
    if (!canVerify) { step(4, "done"); return; }
    step(4, "running");
    try {
      const results = await d.search({ query: company + " layoffs hiring freeze", domain_type: "news", recency_minutes: SIX_MONTHS_MIN, purpose: "Find recent layoff or hiring-freeze news" });
      const key = (company.split(/\s+/)[0].length >= 3 ? company.split(/\s+/)[0] : company).toLowerCase();
      newsFlag = results.some((r) => { const s = (String(r.title) + " " + String(r.snippet)).toLowerCase(); return LAYOFF.test(s) && s.includes(key); });
    } catch (_) { newsFlag = null; }
    step(4, "done");
  };

  await Promise.all([careersTask(), dupTask(), newsTask()]);

  // ---- 5. score ----
  step(5, "running");
  const result = buildResult({ extracted, careers, careersHost, dupCount, newsFlag });
  if (!result) { const e = new Error("no signals"); e.friendly = "We could not check enough signals for this posting. Try pasting the job text."; throw e; }
  step(5, "done");
  return result;
}

module.exports = { analyze, extractGoal, careersGoal, EXTRACT_SCHEMA, CAREERS_SCHEMA };
