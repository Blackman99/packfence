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

  let t0 = null;
  const duration = 5000;

  function frame(ts) {
    if (t0 == null) t0 = ts;
    const p = ((ts - t0) % duration) / duration;
    // suitcase travels left→right across viewport
    const x = -140 + p * (suitcase.parentElement.clientWidth + 200);
    suitcase.style.transform = "translateX(" + x + "px)";
    // sweep pulses
    if (sweep) {
      sweep.style.opacity = String(0.25 + 0.5 * Math.abs(Math.sin(p * Math.PI * 4)));
    }
    // marquee
    const w = track.scrollWidth / 2;
    track.style.transform = "translateX(" + (-(p * w)) + "px)";
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
