/* Shared header, footer, mobile menu, and waitlist dialog. */
(function () {
  const ghost = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C7.6 2 4 5.6 4 10v11l2.7-2 2.6 2 2.7-2 2.7 2 2.6-2 2.7 2V10c0-4.4-3.6-8-8-8z"/><circle cx="9" cy="10" r="1.5" fill="#fff"/><circle cx="15" cy="10" r="1.5" fill="#fff"/></svg>';
  const page = location.pathname.split("/").pop() || "index.html";
  const link = (href, label) => '<a href="' + href + '"' + (page === href ? ' aria-current="page"' : "") + ">" + label + "</a>";

  const header = document.getElementById("site-header");
  if (header) {
    header.className = "site-header";
    header.innerHTML =
      '<div class="wrap bar"><a class="brand" href="index.html">' + ghost + "GhostCheck</a>" +
      '<button class="menu-toggle" aria-expanded="false" aria-controls="nav">Menu</button>' +
      '<nav class="nav" id="nav" aria-label="Main">' + link("how-it-works.html", "How it works") + link("pricing.html", "Pricing") +
      '<a class="btn small" href="index.html#check">Check a job</a></nav></div>';
    const toggle = header.querySelector(".menu-toggle"), nav = header.querySelector("#nav");
    toggle.addEventListener("click", function () {
      const open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
  }

  const footer = document.getElementById("site-footer");
  if (footer) {
    footer.className = "site-footer";
    footer.innerHTML =
      '<div class="wrap"><p>GhostCheck gives estimates based on public information, not statements of fact about any employer.</p>' +
      '<p>Built for Kritical Hacks 2026. <a href="https://github.com/" rel="noopener">GitHub</a></p></div>';
  }

  // Waitlist dialog (no data is sent anywhere)
  const dlg = document.getElementById("waitlist");
  if (dlg) {
    const form = dlg.querySelector("form"), msg = dlg.querySelector(".form-error");
    document.querySelectorAll("[data-waitlist]").forEach(function (b) {
      b.addEventListener("click", function () {
        dlg.querySelector("[data-plan]").textContent = b.getAttribute("data-waitlist");
        form.hidden = false; dlg.querySelector(".thanks").hidden = true; msg.textContent = "";
        dlg.showModal();
      });
    });
    dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
    dlg.querySelector("[data-close]").addEventListener("click", function () { dlg.close(); });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      const email = form.elements.email.value.trim();
      if (!/^\S+@\S+\.\S+$/.test(email)) { msg.textContent = "Enter a valid email address."; return; }
      form.hidden = true; dlg.querySelector(".thanks").hidden = false;
    });
  }
})();
