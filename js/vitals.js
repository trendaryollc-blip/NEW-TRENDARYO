'use strict';
(function () {
  var sent = false;

  function sendVitals() {
    if (sent) return;
    sent = true;

    var entry = {
      page: location.pathname,
      lcp: null,
      cls: null,
      fcp: null,
      ttfb: null,
      jsErrors: window.__jsErrors || [],
      userAgent: navigator.userAgent,
    };

    try {
      if (window.performance && window.performance.getEntriesByType) {
        var nav = window.performance.getEntriesByType('navigation')[0];
        if (nav) {
          entry.ttfb = nav.responseStart || null;
          entry.fcp = nav.domContentLoadedEventEnd || null;
        }
      }
    } catch (e) { /* ignore */ }

    try {
      var po = new PerformanceObserver(function (list) {
        var entries = list.getEntries();
        if (entries.length) {
          var last = entries[entries.length - 1];
          if (entry.lcp === null || last.startTime > entry.lcp) {
            entry.lcp = last.startTime;
          }
        }
      });
      po.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch (e) { /* ignore */ }

    try {
      var co = new PerformanceObserver(function (list) {
        for (var i = 0; i < list.getEntries().length; i++) {
          var e = list.getEntries()[i];
          if (!e.hadRecentInput) {
            entry.cls = (entry.cls || 0) + e.value;
          }
        }
      });
      co.observe({ type: 'layout-shift', buffered: true });
    } catch (e) { /* ignore */ }

    setTimeout(function () {
      fetch('/api/vitals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      }).catch(function () { /* ignore */ });
    }, 3000);
  }

  window.addEventListener('error', function (e) {
    if (!window.__jsErrors) window.__jsErrors = [];
    window.__jsErrors.push(String(e.message || e.type).slice(0, 500));
    if (window.__jsErrors.length > 10) window.__jsErrors.shift();
  });

  if (document.readyState === 'complete') {
    sendVitals();
  } else {
    window.addEventListener('load', sendVitals);
  }
})();
