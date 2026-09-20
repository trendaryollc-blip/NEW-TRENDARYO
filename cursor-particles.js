/**
 * cursor-particles.js — Global glowing cursor trail + click bursts (every page)
 * Restored original feel: big soft glow dots on the move, radial burst on click.
 * Transform/opacity only (compositor), rAF-throttled, capped live nodes,
 * desktop fine-pointer only. Loaded via components.js ensureLuxuryTheme().
 */
(function () {
    'use strict';

    if (window.__cursorTrailActive) return;
    window.__cursorTrailActive = true;

    function init() {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

        var TRAIL_COLORS = ['#00e5ff', '#00e5ff', '#00e5ff', '#ffd166'];
        var BURST_COLORS = ['#00e5ff', '#ff3da6', '#ffd166', '#00e5ff'];
        var MAX_LIVE = 90;
        var DIST_GATE = 22;
        var LIFETIME = 900;
        var BURST_COUNT = 14;
        var BURST_LIFETIME = 800;
        var live = 0;
        var lastX = 0, lastY = 0, pending = false, lastEvt = null;

        function makeDot(size, color, glow) {
            var el = document.createElement('div');
            el.className = 'cursor-dust';
            el.style.width = size + 'px';
            el.style.height = size + 'px';
            el.style.background = 'radial-gradient(circle, ' + color + ', transparent 70%)';
            el.style.backgroundColor = color;
            el.style.boxShadow = '0 0 ' + glow + 'px ' + color;
            document.body.appendChild(el);
            return el;
        }

        function spawn(x, y) {
            if (live >= MAX_LIVE) return;
            if (document.hidden) return;
            live++;
            // Big soft dots: 4–8px with a wide glow halo
            var size = 4 + Math.random() * 4;
            var color = TRAIL_COLORS[(Math.random() * TRAIL_COLORS.length) | 0];
            var el = makeDot(size, color, size * 3);
            el.style.opacity = '0.9';

            var vx = (Math.random() - 0.5) * 60;
            var vy = (Math.random() - 0.5) * 60 - 30;
            var t0 = performance.now();
            function frame(now) {
                var p = (now - t0) / LIFETIME;
                if (p >= 1) { el.remove(); live--; return; }
                var e = 1 - Math.pow(1 - p, 2);
                el.style.transform = 'translate(' + (x + vx * e) + 'px,' + (y + vy * e) + 'px) scale(' + (1 - p * 0.5) + ')';
                el.style.opacity = String(0.9 * (1 - p));
                requestAnimationFrame(frame);
            }
            requestAnimationFrame(frame);
        }

        // Click burst: radial explosion, like the original pod/button bursts
        function burst(x, y) {
            if (document.hidden) return;
            for (var i = 0; i < BURST_COUNT; i++) {
                if (live >= MAX_LIVE) return;
                live++;
                var angle = (i / BURST_COUNT) * Math.PI * 2 + Math.random() * 0.4;
                var dist = 70 + Math.random() * 70;
                var vx = Math.cos(angle) * dist;
                var vy = Math.sin(angle) * dist;
                var size = 4 + Math.random() * 4;
                var color = BURST_COLORS[(Math.random() * BURST_COLORS.length) | 0];
                (function (el, vx, vy, t0) {
                    function frame(now) {
                        var p = (now - t0) / BURST_LIFETIME;
                        if (p >= 1) { el.remove(); live--; return; }
                        var e = 1 - Math.pow(1 - p, 3);
                        el.style.transform = 'translate(' + (x + vx * e) + 'px,' + (y + vy * e) + 'px) scale(' + (1 - p * 0.6) + ')';
                        el.style.opacity = String(1 - p);
                        requestAnimationFrame(frame);
                    }
                    requestAnimationFrame(frame);
                })(makeDot(size, color, size * 3), vx, vy, performance.now());
            }
        }

        document.addEventListener('mousemove', function (e) {
            lastEvt = e;
            if (pending) return;
            pending = true;
            requestAnimationFrame(function () {
                pending = false;
                if (!lastEvt) return;
                var dx = lastEvt.clientX - lastX, dy = lastEvt.clientY - lastY;
                if (dx * dx + dy * dy > DIST_GATE * DIST_GATE) {
                    lastX = lastEvt.clientX; lastY = lastEvt.clientY;
                    spawn(lastX, lastY);
                }
            });
        }, { passive: true });

        // Burst on every click except text editing (original behaviour)
        document.addEventListener('click', function (e) {
            var t = e.target;
            if (t && t.closest && t.closest('input, textarea, select, [contenteditable]')) return;
            burst(e.clientX, e.clientY);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
