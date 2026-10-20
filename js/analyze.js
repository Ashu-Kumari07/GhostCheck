/*
 * analyzeJob(input, handlers) -> Promise<AnalysisResult>
 *   input:    { url?: string, text?: string, demo?: "real" | "uncertain" | "ghost" }
 *   handlers: { onStep(i, state), onAgent(text), onStream(url), onNotice(text) }
 *
 * Live mode calls POST /api/analyze (see api/analyze.js, which uses TinyFish).
 * Demo examples, and any case where the API is unreachable (for example opening the
 * files directly or on a static host), use prepared sample data and say so in the UI.
 */
(function () {
  function hash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    return h;
  }

  GC.pickResult = function (input) {
    if (input.demo && GC.RESULTS[input.demo]) return GC.RESULTS[input.demo];
    if (input.text) return GC.RESULTS.uncertain;
    const url = (input.url || "").toLowerCase();
    if (url.includes("ghost")) return GC.RESULTS.ghost;
    if (url.includes("uncertain")) return GC.RESULTS.uncertain;
    const keys = ["real", "uncertain", "ghost"];
    return GC.RESULTS[keys[hash(url) % 3]];
  };

  function simulate(input, h, fallback) {
    const base = GC.pickResult(input);
    const result = Object.assign({}, base, { demo: true, fallback: !!fallback });
    const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const delay = reduce ? 150 : 1300;
    return new Promise(function (resolve) {
      let i = 0;
      (function next() {
        if (i >= GC.STEPS.length) { resolve(result); return; }
        h.onStep(i, "running");
        setTimeout(function () { h.onStep(i, "done"); i++; next(); }, delay);
      })();
    });
  }

  function fatal(message) { const e = new Error(message); e.fatal = true; return e; }

  async function live(input, h) {
    let res;
    try {
      res = await fetch("/api/analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input.text ? { text: input.text } : { url: input.url })
      });
    } catch (e) { throw new Error("unreachable"); }
    if (!res.ok || !res.body) throw new Error("unavailable");

    const reader = res.body.getReader(), decoder = new TextDecoder();
    let buf = "", result = null;
    const handle = function (line) {
      line = line.trim(); if (!line) return;
      let ev; try { ev = JSON.parse(line); } catch (e) { return; }
      if (ev.type === "step") h.onStep(ev.index, ev.state);
      else if (ev.type === "agent") h.onAgent(ev.text);
      else if (ev.type === "stream") h.onStream(ev.url);
      else if (ev.type === "result") result = Object.assign({}, ev.data, { live: true });
      else if (ev.type === "error") throw fatal(ev.message);
    };
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buf += decoder.decode(chunk.value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) { handle(buf.slice(0, i)); buf = buf.slice(i + 1); }
    }
    if (buf.trim()) handle(buf);
    if (!result) throw fatal("The check ended unexpectedly. Please try again.");
    return result;
  }

  GC.analyzeJob = function (input, handlers) {
    const h = Object.assign({ onStep() {}, onAgent() {}, onStream() {}, onNotice() {} }, handlers);
    if (input.demo) return simulate(input, h, false);
    return live(input, h).catch(function (err) {
      if (err && err.fatal) throw err;     // a real error from the live check: show it, do not hide it behind a sample
      h.onNotice("The live check is not reachable here, so this is a prepared sample report.");
      return simulate(input, h, true);
    });
  };
})();
