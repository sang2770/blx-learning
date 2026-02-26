(async () => {
    // Optional kill-switch stored in chrome.storage (default enabled)
    const { enabled = true } = await chrome.storage.local.get(["enabled"]);
    if (!enabled) return;

    const src = chrome.runtime.getURL("unfocus.js");

    const s = document.createElement("script");
    s.src = src;
    s.async = false;

    // Execute as early as possible
    (document.documentElement || document.head).appendChild(s);
    s.remove();
})();