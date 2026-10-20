/* Ghost Score logic: signals, weights, verdict, summary. Pure functions, no network. */
const WEIGHTS = { careers: 30, age: 20, reposts: 15, description: 15, pay: 10, news: 10 };
const NAMES = {
  careers: "Careers-page match", age: "Posting age", reposts: "Reposts and duplicates",
  description: "Description quality", pay: "Pay transparency", news: "Company hiring news"
};
const BUZZ = ["fast-paced", "dynamic environment", "rockstar", "ninja", "self-starter", "wear many hats", "passionate", "synergy", "results-driven", "go-getter"];

const statusOf = (v) => (v <= 0.2 ? "good" : v <= 0.6 ? "warning" : "bad");
const sig = (id, value, detail) => ({ id, name: NAMES[id], weight: WEIGHTS[id], value, status: value === null ? "unchecked" : statusOf(value), detail });

function analyzeDescription(text) {
  const t = String(text || "");
  const words = t.split(/\s+/).filter(Boolean).length;
  const flags = [];
  if (words < 100) flags.push("very short");
  if (BUZZ.filter((b) => t.toLowerCase().includes(b)).length >= 3) flags.push("buzzword-heavy");
  if (!/(years?|degree|bachelor|proficien|experience (with|in)|knowledge of|familiar)/i.test(t)) flags.push("no concrete requirements");
  if (!/(team|report(s|ing)? to|manager|department)/i.test(t)) flags.push("no team or manager named");
  return { value: flags.length / 4, flags };
}

function ageValue(d) { return d < 30 ? 0 : d < 60 ? 0.4 : d < 90 ? 0.7 : 1; }

/**
 * inputs: { extracted, careers, careersHost, dupCount, newsFlag }
 *  careers:  { listed:boolean, posted_days_ago?:number } or null when it could not be checked
 *  dupCount: number or null;  newsFlag: boolean or null
 */
function buildSignals({ extracted, careers, careersHost, dupCount, newsFlag }) {
  const out = [];

  out.push(careers && typeof careers.listed === "boolean"
    ? sig("careers", careers.listed ? 0 : 1, careers.listed ? "Found on " + (careersHost || "the careers page") : "Role not found on " + (careersHost || "the careers page"))
    : sig("careers", null, "Careers page could not be checked"));

  let days = Number.isFinite(extracted.posted_days_ago) ? extracted.posted_days_ago : null;
  if (days === null && careers && Number.isFinite(careers.posted_days_ago)) days = careers.posted_days_ago;
  out.push(days === null
    ? sig("age", null, "Posted date not shown")
    : sig("age", ageValue(days), days === 0 ? "Posted today" : days < 30 ? "Posted " + days + " days ago" : "Open for " + days + " days"));

  let rv = null, rd = "Could not search for duplicates";
  if (Number.isFinite(dupCount)) { rv = dupCount <= 1 ? 0 : dupCount <= 3 ? 0.5 : 1; rd = dupCount >= 2 ? "Same role found on " + dupCount + " listings" : "No duplicates found"; }
  if (extracted.reposted === true) { rv = Math.max(rv === null ? 0 : rv, 0.7); rd = "Marked as reposted" + (dupCount >= 2 ? " and found on " + dupCount + " listings" : ""); }
  out.push(sig("reposts", rv, rd));

  const d = analyzeDescription(extracted.description);
  out.push(sig("description", d.value, d.flags.length ? "Generic: " + d.flags.join(", ") : "Specific duties and requirements"));

  out.push(extracted.salary_listed === true
    ? sig("pay", 0, "Salary range listed" + (extracted.salary_text ? ": " + String(extracted.salary_text).slice(0, 60) : ""))
    : sig("pay", 0.6, "No salary range listed"));

  out.push(newsFlag === null || newsFlag === undefined
    ? sig("news", null, "Hiring news could not be checked")
    : sig("news", newsFlag ? 1 : 0, newsFlag ? "Layoff or hiring-freeze news in the last 6 months" : "No recent layoff news found"));
  return out;
}

const PHRASE = {
  careers: () => "not found on the careers page",
  age: (s) => s.detail.charAt(0).toLowerCase() + s.detail.slice(1),
  reposts: (s) => s.detail.charAt(0).toLowerCase() + s.detail.slice(1),
  description: () => "a generic job description",
  pay: () => "no salary listed",
  news: () => "recent layoff or hiring-freeze news"
};
const GOOD = { careers: "listed on the careers page", age: null, pay: "salary listed", description: "specific duties and requirements" };

function sentence(parts) {
  if (!parts.length) return "No major warning signs were found in the signals we could check.";
  const p = parts.slice(0, 3);
  const s = p.length === 1 ? p[0] : p.length === 2 ? p[0] + " and " + p[1] : p[0] + ", " + p[1] + ", and " + p[2];
  return s.charAt(0).toUpperCase() + s.slice(1) + ".";
}

function finalize(signals) {
  const checked = signals.filter((s) => s.value !== null);
  const wsum = checked.reduce((a, s) => a + s.weight, 0);
  if (!wsum) return null;
  const score = Math.round((100 * checked.reduce((a, s) => a + s.weight * s.value, 0)) / wsum);
  const coverage = wsum / 100;
  const confidence = coverage >= 0.85 ? "High" : coverage >= 0.6 ? "Medium" : "Low";
  const verdict = score < 35 ? "Likely Real" : score < 65 ? "Uncertain" : "Likely Ghost";

  const risky = checked.filter((s) => s.value > 0.2).sort((a, b) => b.weight * b.value - a.weight * a.value).map((s) => PHRASE[s.id](s));
  let parts = risky;
  if (!parts.length) {
    parts = checked.map((s) => (s.id === "age" ? (s.detail.startsWith("Posted") ? s.detail.toLowerCase() : null) : GOOD[s.id])).filter(Boolean);
  }
  return { score, confidence, verdict, summary: sentence(parts) };
}

function buildResult(inputs) {
  const signals = buildSignals(inputs);
  const f = finalize(signals);
  if (!f) return null;
  const x = inputs.extracted;
  return {
    id: "live", live: true,
    jobTitle: x.title || "Job posting", company: x.company || "Unknown employer", location: x.location || "",
    score: f.score, verdict: f.verdict, confidence: f.confidence, summary: f.summary,
    signals: signals.map(({ id, name, status, detail, weight }) => ({ id, name, status, detail, weight })),
    checkedAt: new Date().toISOString()
  };
}

module.exports = { WEIGHTS, buildSignals, buildResult, finalize, analyzeDescription, ageValue };
