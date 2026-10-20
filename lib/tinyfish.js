/*
 * Minimal TinyFish client (server-side only: the API key must never reach the browser).
 *  - runAgent(): Agent API, streaming endpoint (/run-sse). Natural-language goal -> structured result.
 *  - search():   Search API (GET). Ranked web or news results.
 * Docs: https://docs.tinyfish.ai
 */
const AGENT_URL = "https://agent.tinyfish.ai/v1/automation/run-sse";
const SEARCH_URL = "https://api.search.tinyfish.ai";

function apiKey() {
  const k = process.env.TINYFISH_API_KEY;
  if (!k) { const e = new Error("TINYFISH_API_KEY is not set"); e.code = "NO_KEY"; throw e; }
  return k;
}

/**
 * Run a goal on a page and stream progress.
 * Resolves with the final result object, rejects if the run fails or times out.
 */
async function runAgent({ url, goal, outputSchema, onProgress, onStreamingUrl, timeoutMs = 110000 }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(AGENT_URL, {
      method: "POST",
      headers: { "X-API-Key": apiKey(), "Content-Type": "application/json" },
      body: JSON.stringify({ url, goal, output_schema: outputSchema }),
      signal: ctrl.signal
    });
    if (!res.ok) { const e = new Error("TinyFish agent HTTP " + res.status); e.status = res.status; throw e; }

    const decoder = new TextDecoder();
    let buf = "", final = null, failure = null;

    const handle = (raw) => {
      let line = raw.trim();
      if (line.startsWith("data:")) line = line.slice(5).trim();   // tolerate SSE framing
      if (!line.startsWith("{")) return;
      let ev; try { ev = JSON.parse(line); } catch (_) { return; }
      if (ev.type === "STREAMING_URL" && ev.streaming_url && onStreamingUrl) onStreamingUrl(ev.streaming_url);
      else if (ev.type === "PROGRESS" && ev.purpose && onProgress) onProgress(String(ev.purpose));
      else if (ev.type === "COMPLETE") {
        if (ev.status === "COMPLETED") final = ev.result && typeof ev.result === "object" ? ev.result : {};
        else failure = new Error("TinyFish run ended with status " + ev.status);
      }
    };

    for await (const chunk of res.body) {
      buf += decoder.decode(chunk, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) { handle(buf.slice(0, i)); buf = buf.slice(i + 1); }
    }
    if (buf.trim()) handle(buf);

    if (failure) throw failure;
    if (!final) throw new Error("TinyFish run finished without a result");
    return final;
  } finally {
    clearTimeout(timer);
  }
}

/** Search API. Returns the results array. */
async function search(params) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null) qs.set(k, String(v)); });
  const res = await fetch(SEARCH_URL + "?" + qs.toString(), { headers: { "X-API-Key": apiKey() } });
  if (!res.ok) { const e = new Error("TinyFish search HTTP " + res.status); e.status = res.status; throw e; }
  const data = await res.json();
  return Array.isArray(data.results) ? data.results : [];
}

module.exports = { runAgent, search };
