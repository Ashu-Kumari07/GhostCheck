/* Tests with mocked TinyFish responses (no network, no API key needed). Run: node test/run.js */
const assert = require("assert");
const { buildResult, analyzeDescription } = require("../lib/score");

process.env.TINYFISH_API_KEY = "test-key";

// ---------- scoring ----------
(function scoring() {
  const generic = "We are looking for a dynamic, fast-paced, passionate rockstar to join us.";
  assert.deepStrictEqual(analyzeDescription(generic).flags.length, 4);
  const r = buildResult({
    extracted: { title: "Data Analyst", company: "Acme Corp", posted_days_ago: 74, salary_listed: false, reposted: true, description: generic },
    careers: { listed: false }, careersHost: "acme.com", dupCount: 4, newsFlag: true
  });
  assert.strictEqual(r.score, 90);              // 30 + 14 + 15 + 15 + 6 + 10
  assert.strictEqual(r.verdict, "Likely Ghost");
  assert.strictEqual(r.confidence, "High");
  assert.ok(/not found on the careers page/i.test(r.summary), r.summary);

  const real = buildResult({
    extracted: { title: "Designer", company: "Brightwave", posted_days_ago: 9, salary_listed: true, salary_text: "$90-110k",
      description: ("You will design product flows with Figma and report to the design manager in a small team. We expect 3 years of experience. ").repeat(12) },
    careers: { listed: true }, careersHost: "brightwave.com", dupCount: 1, newsFlag: false
  });
  assert.strictEqual(real.score, 0);
  assert.strictEqual(real.verdict, "Likely Real");

  // careers check failed: signal skipped, confidence drops
  const part = buildResult({
    extracted: { title: "Data Analyst", company: "Acme", posted_days_ago: 10, salary_listed: true, description: real.summary.repeat(30) + " team 2 years" },
    careers: null, dupCount: 0, newsFlag: false
  });
  assert.strictEqual(part.signals[0].status, "unchecked");
  assert.strictEqual(part.confidence, "Medium");
  console.log("ok scoring");
})();

// ---------- orchestration with a fake TinyFish ----------
function sse(events, splitAt) {
  const text = events.map((e) => "data: " + JSON.stringify(e)).join("\n") + "\n";
  const bytes = Buffer.from(text);
  const chunks = [bytes.subarray(0, splitAt), bytes.subarray(splitAt)];   // split mid-line to test buffering
  return { ok: true, status: 200, body: (async function* () { for (const c of chunks) yield c; })() };
}
const GENERIC = "We are looking for a dynamic, fast-paced, passionate rockstar to join us.";

async function run(fetchImpl, input) {
  global.fetch = fetchImpl;
  delete require.cache[require.resolve("../lib/tinyfish")];
  delete require.cache[require.resolve("../lib/analyze")];
  const { analyze } = require("../lib/analyze");
  const events = [];
  const result = await analyze(input, (e) => events.push(e));
  return { result, events };
}

(async function main() {
  let agentCalls = 0;
  const fakeFetch = async (url, opts) => {
    if (String(url).startsWith("https://agent.tinyfish.ai/v1/automation/run-sse")) {
      assert.strictEqual(opts.headers["X-API-Key"], "test-key");
      const body = JSON.parse(opts.body);
      assert.ok(body.url && body.goal && body.output_schema, "agent body has url, goal, output_schema");
      agentCalls++;
      const first = agentCalls === 1;
      return sse([
        { type: "STARTED", run_id: "r" + agentCalls },
        { type: "STREAMING_URL", run_id: "r", streaming_url: "https://tf-x.tinyfish.example/stream/0" },
        { type: "PROGRESS", run_id: "r", purpose: first ? "Reading the job posting" : "Searching the careers page" },
        { type: "COMPLETE", run_id: "r", status: "COMPLETED", result: first
          ? { title: "Data Analyst", company: "Acme Corp", location: "Austin, TX", posted_days_ago: 74, salary_listed: false, reposted: true, careers_page_url: "https://acme.com/careers", description: GENERIC }
          : { listed: false, matching_url: null, posted_days_ago: null } }
      ], 37);
    }
    if (String(url).startsWith("https://api.search.tinyfish.ai")) {
      assert.strictEqual(opts.headers["X-API-Key"], "test-key");
      const q = new URL(url).searchParams;
      const news = q.get("domain_type") === "news";
      const results = news
        ? [{ title: "Acme Corp announces layoffs", snippet: "workforce cut", url: "https://news.example/acme" }]
        : [1, 2, 3, 4].map((i) => ({ title: "Data Analyst - Acme Corp", snippet: "apply", url: "https://board" + i + ".example/job" }));
      return { ok: true, status: 200, json: async () => ({ results }) };
    }
    throw new Error("unexpected fetch " + url);
  };

  const { result, events } = await run(fakeFetch, { url: "https://www.linkedin.com/jobs/view/123" });
  assert.strictEqual(result.score, 90);
  assert.strictEqual(result.verdict, "Likely Ghost");
  assert.strictEqual(result.jobTitle, "Data Analyst");
  assert.strictEqual(agentCalls, 2, "one agent run for the posting, one for the careers page");
  assert.ok(events.some((e) => e.type === "stream" && e.url.startsWith("https://")), "streaming url forwarded");
  assert.ok(events.some((e) => e.type === "agent" && /careers/i.test(e.text)), "progress text forwarded");
  for (let i = 0; i < 6; i++) assert.ok(events.some((e) => e.type === "step" && e.index === i && e.state === "done"), "step " + i + " done");
  console.log("ok orchestration (score " + result.score + ", " + events.length + " events)");

  // careers agent fails -> signal unchecked, result still returned
  let n = 0;
  const flaky = async (url, opts) => {
    if (String(url).startsWith("https://agent.tinyfish.ai")) {
      n++;
      if (n === 2) return sse([{ type: "COMPLETE", status: "FAILED" }], 10);
      return fakeFetch(url, opts, (agentCalls = 0));
    }
    return fakeFetch(url, opts);
  };
  agentCalls = 0;
  const f = await run(flaky, { url: "https://jobs.example/acme/1" });
  assert.strictEqual(f.result.signals[0].status, "unchecked");
  console.log("ok graceful failure of careers check");

  // text mode: no agent calls, partial confidence
  let calls = 0;
  const textOnly = async () => { calls++; throw new Error("no network expected"); };
  const t = await run(textOnly, { text: GENERIC.repeat(3) });
  assert.strictEqual(calls, 0);
  assert.strictEqual(t.result.confidence, "Low");
  console.log("ok text mode");

  // handler: validation and NDJSON framing
  const handler = require("../api/analyze");
  const call = async (body) => {
    const out = []; const res = { setHeader() {}, write: (s) => out.push(s), end: () => {}, statusCode: 0 };
    await handler({ method: "POST", body, headers: { "x-forwarded-for": "1.1.1.1" } }, res);
    return out.join("").trim().split("\n").map((l) => JSON.parse(l));
  };
  assert.strictEqual((await call({ url: "http://localhost/admin" }))[0].type, "error");
  assert.strictEqual((await call({ url: "not a url" }))[0].type, "error");
  assert.strictEqual((await call({ text: "too short" }))[0].type, "error");
  console.log("ok handler validation");
  console.log("ALL TESTS PASSED");
})().catch((e) => { console.error("FAILED:", e); process.exit(1); });
