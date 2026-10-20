/* Home page: link or text input, validation, and navigation to the report. */
(function () {
  const form = document.getElementById("job-form");
  if (!form) return;
  const url = document.getElementById("job-url"), text = document.getElementById("job-text");
  const urlRow = document.getElementById("url-row"), textRow = document.getElementById("text-row");
  const toggle = document.getElementById("toggle-text"), err = document.getElementById("form-error"), count = document.getElementById("char-count");
  let textMode = false;

  toggle.addEventListener("click", function () {
    textMode = !textMode;
    urlRow.hidden = textMode; textRow.hidden = !textMode;
    toggle.textContent = textMode ? "Paste a job link instead" : "Paste job text instead";
    err.textContent = "";
    (textMode ? text : url).focus();
  });
  text.addEventListener("input", function () { count.textContent = text.value.length + " / 200 characters minimum"; });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (textMode) {
      if (text.value.trim().length < 200) { err.textContent = "Please paste at least 200 characters of the job text."; return; }
      try { sessionStorage.setItem("gc_text", text.value.trim()); } catch (x) {}
      location.href = "report.html?mode=text";
      return;
    }
    const v = url.value.trim();
    if (!/^https?:\/\/\S+\.\S+/i.test(v)) { err.textContent = "Please paste a full job link starting with http."; url.focus(); return; }
    location.href = "report.html?url=" + encodeURIComponent(v);
  });

  const proof = document.getElementById("proof");
  if (proof) { if (GC.PROOF_STAT) proof.textContent = GC.PROOF_STAT; else proof.hidden = true; }
})();
