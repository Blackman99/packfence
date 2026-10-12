(function () {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const suitcase = document.getElementById("suitcase");
  const sweep = document.getElementById("sweep");
  const track = document.getElementById("strip-track");
  if (!suitcase || !track) return;

  const findings = [
    { path: "dist/index.js", status: "clear" },
    { path: "package.json", status: "clear" },
    { path: "README.md", status: "clear" },
    { path: "LICENSE", status: "clear" },
    { path: "dist/index.js.map", status: "hold", note: "sourcesContent" },
    { path: ".env", status: "hold", note: "secret-env" },
    { path: "dist/cli.js", status: "clear" },
  ];

  function renderStrip() {
    track.innerHTML = "";
    for (const f of findings) {
      const el = document.createElement("div");
      el.className = "item " + f.status + (f.status === "hold" ? " flash" : "");
      el.innerHTML =
        '<span class="badge">' +
        f.status.toUpperCase() +
        "</span><span>" +
        f.path +
        (f.note ? " · " + f.note : "") +
        "</span>";
      track.appendChild(el);
    }
    // duplicate for marquee
    for (const f of findings) {
      const el = document.createElement("div");
      el.className = "item " + f.status;
      el.innerHTML =
        '<span class="badge">' +
        f.status.toUpperCase() +
        "</span><span>" +
        f.path +
        (f.note ? " · " + f.note : "") +
        "</span>";
      track.appendChild(el);
    }
  }
  renderStrip();

  if (reduce) {
    suitcase.style.left = "18%";
    return;
  }

  suitcase.style.left = "0";
  let t0 = null;
  const duration = 6000;

  function frame(ts) {
    if (t0 == null) t0 = ts;
    const p = ((ts - t0) % duration) / duration;
    const panel = suitcase.parentElement.clientWidth;
    // enter from left, pause under sweep (~42%), then exit right
    let x;
    if (p < 0.35) {
      x = -130 + (p / 0.35) * (panel * 0.42 + 130);
    } else if (p < 0.55) {
      x = panel * 0.42;
    } else {
      x = panel * 0.42 + ((p - 0.55) / 0.45) * (panel * 0.7);
    }
    suitcase.style.transform = "translateX(" + x + "px)";
    if (sweep) {
      sweep.style.opacity = String(0.25 + 0.55 * Math.abs(Math.sin(p * Math.PI * 6)));
    }
    const w = track.scrollWidth / 2;
    track.style.transform = "translateX(" + (-(p * w)) + "px)";
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
