(() => {
  // Overlay highlight
  const overlay = document.createElement("div");
  overlay.style.position = "absolute";
  overlay.style.border = "2px solid red";
  overlay.style.pointerEvents = "none";
  overlay.style.zIndex = "9999";
  document.body.appendChild(overlay);

  // Info box
  const infoBox = document.createElement("div");
  infoBox.style.position = "fixed";
  infoBox.style.bottom = "10px";
  infoBox.style.right = "10px";
  infoBox.style.background = "rgba(0,0,0,0.8)";
  infoBox.style.color = "#fff";
  infoBox.style.padding = "6px 10px";
  infoBox.style.font = "12px monospace";
  infoBox.style.borderRadius = "4px";
  infoBox.style.zIndex = "10000";
  document.body.appendChild(infoBox);

  let current = null;
  let locked = false;

  const highlightElement = (el) => {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    overlay.style.left = rect.left + window.scrollX + "px";
    overlay.style.top = rect.top + window.scrollY + "px";
    overlay.style.width = rect.width + "px";
    overlay.style.height = rect.height + "px";

    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : "";
    const cls = el.classList.length ? "." + [...el.classList].join(".") : "";
    infoBox.textContent = `${tag}${id}${cls} | ${Math.round(rect.width)}×${Math.round(rect.height)}`;
  };

  // Hover update
  document.addEventListener("mousemove", (e) => {
    if (locked) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (el && el !== overlay && el !== infoBox) {
      current = el;
      highlightElement(el);
    }
  }, true);

  document.addEventListener("dblclick", async (e) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === overlay || el === infoBox) return;

    try {
      await navigator.clipboard.writeText(el.outerHTML);
      infoBox.textContent = "COPIED HTML (DOUBLE CLICK)";
      e.preventDefault();
      e.stopPropagation();
    } catch (err) {
      console.error("Clipboard error", err);
    }
  }, true);

  // Phím tắt:
  // Alt+L lock/unlock
  // Alt+C copy selector
  // Alt+H copy outerHTML (toàn bộ khối DOM)
  document.addEventListener("keydown", async (e) => {
    if (e.altKey && e.key.toLowerCase() === "l") {
      locked = !locked;
      infoBox.textContent += locked ? " [LOCKED]" : " [UNLOCK OFF]";
    }
    if (e.altKey && e.key.toLowerCase() === "c" && current) {
      const selector = makeUniqueSelector(current);
      try {
        await navigator.clipboard.writeText(selector);
        infoBox.textContent += " [COPIED SELECTOR]";
      } catch (err) {
        console.error("Clipboard error", err);
      }
    }
    if (e.altKey && e.key.toLowerCase() === "h" && current) {
      try {
        await navigator.clipboard.writeText(current.outerHTML);
        infoBox.textContent += " [COPIED HTML]";
      } catch (err) {
        console.error("Clipboard error", err);
      }
    }
  });

  // Hàm tạo selector duy nhất
  const makeUniqueSelector = (el) => {
    if (el.id) return `#${CSS.escape(el.id)}`;
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.documentElement) {
      let part = cur.tagName.toLowerCase();
      if (cur.classList.length) {
        part += "." + [...cur.classList].map(c => CSS.escape(c)).join(".");
      }
      const parent = cur.parentElement;
      if (parent) {
        const sameTag = [...parent.children].filter(ch => ch.tagName === cur.tagName);
        if (sameTag.length > 1) {
          const idx = [...parent.children].indexOf(cur) + 1;
          part += `:nth-child(${idx})`;
        }
      }
      parts.unshift(part);
      if (cur.id) break;
      cur = parent;
    }
    return parts.join(" > ");
  };
})();
