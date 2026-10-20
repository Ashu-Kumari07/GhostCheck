/*
 * POST /api/analyze   body: { url } or { text }
 * Streams newline-delimited JSON events (see lib/analyze.js). Deploy on Vercel; set TINYFISH_API_KEY.
 */
const { analyze } = require("../lib/analyze");

const cache = new Map();     // normalized url -> { at, result }   (best effort; resets on cold start)
const hits = new Map();      // ip -> [timestamps]
const TTL = 24 * 60 * 60 * 1000, LIMIT = 10, WINDOW = 60 * 60 * 1000;

function normalize(u) { try { const x = new URL(u); x.hash = ""; return x.href.replace(/\/$/, ""); } catch (_) { return null; } }
function blockedHost(h) { return /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0)/.test(h) || h.endsWith(".local") || /^172\.(1[6-9]|2\d|3[01])\./.test(h); }
function limited(ip) {
  const now = Date.now(), list = (hits.get(ip) || []).filter((t) => now - t < WINDOW);
  if (list.length >= LIMIT) { hits.set(ip, list); return true; }
  list.push(now); hits.set(ip, list); return false;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") { res.statusCode = 405; res.setHeader("Allow", "POST"); res.end("Method not allowed"); return; }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  body = body || {};

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  const emit = (ev) => res.write(JSON.stringify(ev) + "\n");
  const fail = (message) => { emit({ type: "error", message }); res.end(); };

  const text = typeof body.text === "string" ? body.text.trim().slice(0, 20000) : "";
  let url = null;
  if (!text) {
    url = typeof body.url === "string" && body.url.length <= 2000 ? normalize(body.url) : null;
    if (!url || !/^https?:\/\//.test(url) || blockedHost(new URL(url).hostname)) return fail("Please paste a full public job link starting with http.");
  } else if (text.length < 200) {
    return fail("Please paste at least 200 characters of the job text.");
  }

  const ip = String(req.headers["x-forwarded-for"] || "local").split(",")[0].trim();
  if (limited(ip)) return fail("Too many checks from this connection. Please try again in an hour.");

  if (url && cache.has(url) && Date.now() - cache.get(url).at < TTL) {
    for (let i = 0; i < 6; i++) emit({ type: "step", index: i, state: "done" });
    emit({ type: "result", data: cache.get(url).result });
    res.end(); return;
  }

  try {
    const result = await analyze({ url, text }, emit);
    if (url) cache.set(url, { at: Date.now(), result });
    emit({ type: "result", data: result });
    res.end();
  } catch (err) {
    console.error("analyze failed:", err && err.message);
    const msg = err && err.friendly ? err.friendly
      : err && err.code === "NO_KEY" ? "The live check is not configured yet."
      : err && (err.status === 401 || err.status === 402) ? "Live checks are temporarily unavailable."
      : err && err.status === 429 ? "The checker is busy. Please try again in a minute."
      : "The check did not finish. Please try again, or paste the job text instead.";
    fail(msg);
  }
};
