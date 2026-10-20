/* Report page: live (or demo) progress, then the result (gauge, verdict, evidence). */
(function () {
  const params = new URLSearchParams(location.search);
  const $ = function (id) { return document.getElementById(id); };
  const progress = $("progress"), result = $("result"), empty = $("empty"), errorBox = $("error");
  const list = $("step-list"), bar = $("bar"), note = $("progress-note"), agentLine = $("agent-line");
  const watch = $("watch"), frame = $("watch-frame");

  const input = {};
  if (params.get("demo")) input.demo = params.get("demo");
  else if (params.get("url")) input.url = params.get("url");
  else if (params.get("mode") === "text") { try { input.text = sessionStorage.getItem("gc_text") || ""; } catch (x) {} }

  if (!input.demo && !input.url && !input.text) { progress.hidden = true; empty.hidden = false; return; }

  note.textContent = input.demo
    ? "Demo mode: results shown are sample data."
    : "An agent is browsing the employer's site. This can take a minute or two.";

  GC.STEPS.forEach(function (label, i) {
    const li = document.createElement("li");
    li.id = "step-" + i;
    li.innerHTML = '<span class="mark" aria-hidden="true"></span><span></span>';
    li.lastChild.textContent = label;
    list.appendChild(li);
  });

  const state = {};
  function updateBar() {
    let done = 0, running = 0;
    Object.keys(state).forEach(function (k) { if (state[k] === "done") done++; else running++; });
    bar.style.width = Math.min(100, Math.round(((done + running * 0.4) / GC.STEPS.length) * 100)) + "%";
  }

  GC.analyzeJob(input, {
    onStep: function (i, s) {
      const li = $("step-" + i); if (!li) return;
      state[i] = s; li.className = s === "running" ? "active" : "done"; updateBar();
    },
    onAgent: function (text) { agentLine.textContent = String(text).slice(0, 160); },
    onStream: function (url) { if (/^https:\/\//.test(url)) { frame.src = url; watch.hidden = false; } },
    onNotice: function (text) { note.textContent = text; }
  }).then(function (r) {
    progress.hidden = true;
    render(r, input);
  }).catch(function (err) {
    progress.hidden = true;
    errorBox.hidden = false;
    $("error-text").textContent = (err && err.message) || "Something went wrong. Please try again.";
  });

  function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

  function render(r, input) {
    const score = Math.max(0, Math.min(100, Number(r.score) || 0));
    const vclass = r.verdict === "Likely Real" ? "v-real" : r.verdict === "Uncertain" ? "v-mid" : "v-ghost";
    const color = r.verdict === "Likely Real" ? "var(--green)" : r.verdict === "Uncertain" ? "var(--amber)" : "var(--red)";
    document.title = r.jobTitle + (r.company ? " at " + r.company : "") + " - GhostCheck";
    result.className = "panel " + vclass;
    result.hidden = false;

    const head = el("div", "result-head");
    head.appendChild(el("h1", null, r.jobTitle + (r.company ? " at " + r.company : "")));
    if (r.location) head.appendChild(el("span", "badge", r.location));
    head.appendChild(el("span", r.demo ? "badge" : "badge live", r.demo ? "Demo data" : "Live check"));
    result.appendChild(head);

    let src = "";
    if (r.demo) {
      src = r.fallback ? "The live check was not reachable, so this is a prepared sample report." : "This is a prepared sample report with fictional companies.";
    } else if (input.url) { try { src = "Link checked: " + new URL(input.url).hostname; } catch (x) {} }
    else if (input.text) src = "Based on the pasted job text. Careers page, duplicates and news were not checked.";
    if (src) result.appendChild(el("p", "muted", src));

    const grid = el("div", "verdict-grid");
    const gauge = el("div", "gauge");
    gauge.innerHTML = '<svg viewBox="0 0 200 120" role="img" aria-label="Ghost Score ' + score + ' out of 100">' +
      '<path class="track" d="M 20 100 A 80 80 0 0 1 180 100"/>' +
      '<path class="arc" d="M 20 100 A 80 80 0 0 1 180 100" stroke="' + color + '"/>' +
      '<text class="num" x="100" y="92">0</text><text class="of" x="100" y="112">out of 100</text></svg>';
    grid.appendChild(gauge);

    const side = el("div");
    side.appendChild(el("span", "verdict-chip", String(r.verdict).toUpperCase()));
    side.appendChild(el("span", "confidence", "Confidence: " + r.confidence));
    side.appendChild(el("p", "summary", r.summary));
    grid.appendChild(side);
    result.appendChild(grid);

    const ev = el("section", "evidence");
    ev.appendChild(el("h2", null, "Evidence"));
    const labels = { good: "Good", warning: "Warning", bad: "Bad", unchecked: "Not checked" };
    r.signals.forEach(function (s) {
      const row = el("div", "signal");
      row.appendChild(el("strong", null, s.name));
      row.appendChild(el("span", "weight", "Weight " + s.weight + "%"));
      row.appendChild(el("span", "status s-" + s.status, labels[s.status] || "Not checked"));
      row.appendChild(el("p", "detail", s.detail));
      ev.appendChild(row);
    });
    result.appendChild(ev);

    const next = el("div", "next");
    next.appendChild(el("p", null, GC.NEXT_STEPS[r.verdict] || ""));
    result.appendChild(next);

    const actions = el("div", "actions");
    const again = el("a", "btn", "Check another job"); again.href = "index.html#check";
    actions.appendChild(again);
    if (!input.text) {
      const copy = el("button", "btn secondary", "Copy link"); copy.type = "button";
      copy.addEventListener("click", function () {
        const done = function () { copy.textContent = "Link copied"; setTimeout(function () { copy.textContent = "Copy link"; }, 2000); };
        if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(done, done); else done();
      });
      actions.appendChild(copy);
    }
    result.appendChild(actions);
    result.appendChild(el("p", "disclaimer", "This is an estimate based on public information, not a statement of fact about the employer."));

    const arc = gauge.querySelector(".arc"), num = gauge.querySelector(".num");
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      arc.style.strokeDashoffset = String(251.33 * (1 - score / 100));
      let n = 0; const step = Math.max(1, Math.round(score / 30));
      const t = setInterval(function () { n = Math.min(score, n + step); num.textContent = n; if (n >= score) clearInterval(t); }, 30);
    }); });
    result.setAttribute("tabindex", "-1"); result.focus();
  }
})();
