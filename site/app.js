// GRID site: resolve the download buttons from the latest GitHub release, mark the visitor's OS, and a screenshot lightbox.
(() => {
  const REPO = "blackmetaltech/grid";
  const ua = navigator.userAgent;
  const os = /Windows/i.test(ua) ? "windows" : /Macintosh|Mac OS X/i.test(ua) && !/iPhone|iPad/i.test(ua) ? "macos" : /Linux|X11/i.test(ua) && !/Android/i.test(ua) ? "linux" : "";
  const $ = (id) => document.getElementById(id);
  if (os) $("dl-" + os)?.classList.add("mine");
  fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } })
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((rel) => {
      const find = (re) => (rel.assets || []).find((a) => re.test(a.name));
      const mb = (a) => `${Math.round(a.size / 1e6)} MB`;
      const linux = find(/linux.*\.(zip|tar\.gz)$/i), win = find(/windows.*\.zip$/i), mac = find(/macos.*\.zip$/i), sums = find(/SHA256SUMS/i);
      if (linux) { $("dl-linux").href = linux.browser_download_url; $("dl-linux").querySelector("span").textContent = `x86_64 · ${linux.name.endsWith(".zip") ? "zip" : "tar.gz"} · ${mb(linux)}`; }
      if (win) { $("dl-windows").href = win.browser_download_url; $("dl-windows").querySelector("span").textContent = `x64 · zip · ${mb(win)}`; }
      if (mac) { $("dl-macos").href = mac.browser_download_url; $("dl-macos").querySelector("span").textContent = `universal · zip · ${mb(mac)}`; }
      if (sums) $("dl-sums").href = sums.browser_download_url;
      $("dl-ver").textContent = `${rel.tag_name}${rel.name && rel.name !== rel.tag_name ? " · " + rel.name.replace(/^GRID\s*/i, "") : ""}`;
      const mine = os === "windows" ? win : os === "linux" ? linux : os === "macos" ? mac : null;
      if (mine) { $("dl-main").href = mine.browser_download_url; $("dl-main-sub").textContent = `${rel.tag_name} · ${os === "windows" ? "Windows" : os === "macos" ? "macOS (untested)" : "Linux"}`; }
      else { $("dl-main").href = "#download"; $("dl-main-sub").textContent = rel.tag_name; }
    })
    .catch(() => {});
  const box = $("lightbox");
  if (box && box.showModal) {
    const img = box.querySelector("img");
    document.querySelectorAll("#gallery a, a.zoom").forEach((a) => a.addEventListener("click", (e) => {
      e.preventDefault(); img.src = a.href; img.alt = a.querySelector("img").alt; box.showModal();
    }));
    box.addEventListener("click", () => box.close());
  }
})();
