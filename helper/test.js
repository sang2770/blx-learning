(() => {
  // Overlay highlight
  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.border = "2px solid red";
  overlay.style.pointerEvents = "none";
  overlay.style.zIndex = "9999";
  overlay.style.width = "100px";
  overlay.style.height = "100px";
  document.body.appendChild(overlay);

  setInterval(() => {
    overlay.style.left = Math.random() * window.innerWidth + "px";
    overlay.style.top = Math.random() * window.innerHeight + "px";
  }, 2000);
})();
