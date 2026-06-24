(() => {
    // Preserve original methods
    const originalRAF = window.requestAnimationFrame;
    const originalSetTimeout = window.setTimeout;
    const originalSetInterval = window.setInterval;
    const originalPerformanceNow = performance.now.bind(performance);
    const originalDateNow = Date.now;
    const originalAddEventListener = window.addEventListener;
    const originalDocumentAddEventListener = document.addEventListener;

    let timeOffset = 0;

    // Emulate constant visibility state safely on prototypes
    Object.defineProperty(Document.prototype, 'visibilityState', { get: () => 'visible', configurable: true });
    Object.defineProperty(Document.prototype, 'webkitVisibilityState', { get: () => 'visible', configurable: true });
    Object.defineProperty(Document.prototype, 'hidden', { get: () => false, configurable: true });
    document.onvisibilitychange = null;

    // Emulate fullscreen state
    Object.defineProperty(Document.prototype, 'fullscreenElement', { get: function() { return this.documentElement; }, configurable: true });
    Object.defineProperty(Document.prototype, 'webkitFullscreenElement', { get: function() { return this.documentElement; }, configurable: true });
    Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => true, configurable: true });
    Object.defineProperty(Document.prototype, 'webkitFullscreenEnabled', { get: () => true, configurable: true });
    document.onfullscreenchange = null;
    document.onwebkitfullscreenchange = null;

    // Override isTrusted to always be true for events
    try {
        Object.defineProperty(Event.prototype, 'isTrusted', { get: () => true, configurable: true });
    } catch(e) {}

    // Override `requestAnimationFrame` to ensure consistent activity
    window.requestAnimationFrame = function(callback) {
        return originalRAF(() => {
            try { callback(originalPerformanceNow()); } catch (e) { }
        });
    };

    // Adjust timers to simulate activity
    window.setTimeout = function(callback, delay, ...args) {
        return originalSetTimeout(() => {
            try { callback(...args); } catch (e) { }
        }, Math.max(0, delay));
    };

    window.setInterval = function(callback, delay, ...args) {
        return originalSetInterval(() => {
            try { callback(...args); } catch (e) { }
        }, Math.max(0, delay));
    };

    // Offset performance.now and Date.now for consistency
    originalSetInterval(() => {
        timeOffset += 10;
    }, 100);

    performance.now = function() { return originalPerformanceNow() + timeOffset; };
    Date.now = function() { return originalDateNow() + timeOffset; };

    // Allow essential event listeners but block visibility and fullscreen-related ones
    const blockedEvents = new Set([
        'visibilitychange',
        'webkitvisibilitychange',
        'blur',
        'mouseleave',
        'mouseout',
        'fullscreenchange',
        'webkitfullscreenchange',
    ]);

    window.addEventListener = function(type, listener, options) {
        if (blockedEvents.has(type)) return;
        return originalAddEventListener.call(this, type, listener, options);
    };

    document.addEventListener = function(type, listener, options) {
        if (blockedEvents.has(type)) return;
        return originalDocumentAddEventListener.call(this, type, listener, options);
    };

    // Allow only critical MutationObserver changes
    const originalObserver = MutationObserver.prototype.observe;
    MutationObserver.prototype.observe = function (target, options) {
        if (target === document || target === document.documentElement) return;
        return originalObserver.call(this, target, options);
    };

    // Advanced Stealth: Hide the fact that we overrode functions
    const originalToString = Function.prototype.toString;
    Function.prototype.toString = function() {
        if (this === window.addEventListener) return "function addEventListener() { [native code] }";
        if (this === document.addEventListener) return "function addEventListener() { [native code] }";
        if (this === window.setTimeout) return "function setTimeout() { [native code] }";
        if (this === window.setInterval) return "function setInterval() { [native code] }";
        if (this === window.requestAnimationFrame) return "function requestAnimationFrame() { [native code] }";
        if (this === performance.now) return "function now() { [native code] }";
        if (this === Date.now) return "function now() { [native code] }";
        if (this === MutationObserver.prototype.observe) return "function observe() { [native code] }";
        return originalToString.call(this);
    };
})();