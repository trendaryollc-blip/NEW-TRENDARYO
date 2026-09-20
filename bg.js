/**
 * bg.js — Trendaryo Universal 3D Background
 * Drop <script src="bg.js"></script> anywhere in any page. That's it.
 * Self-healing: loads Three.js if missing, creates canvas if missing,
 * fixes z-index conflicts, handles resize and mouse/touch reactivity.
 */
// 'use client'; - This is a client-side only script for browser execution
(function () {
    'use strict';

    var THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    var CANVAS_ID = 'three-canvas';
    var scene, camera, renderer, particles, mx = 0, my = 0, running = false;
    var started = false; // three scene OR 2D fallback — never both, never twice

    /* ── 2D fallback: dependency-free starfield (CDN blocked / offline / no WebGL).
       Guarantees the sky is never blank. Same palette + mouse drift as 3D. ── */
    function startFallback2D() {
        if (started) return;
        started = true;
        running = true;
        var canvas = ensureCanvas();
        ensureThemeBg();
        var ctx = canvas.getContext('2d');
        if (!ctx) return;
        // Small screens hide the canvas via CSS — one static frame is enough.
        var tinyScreen = window.matchMedia('(max-width: 768px)').matches;
        var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        var mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        var COUNT = mobile ? 90 : 220;
        var COLORS = ['0,229,255', '255,61,166', '46,230,168'];
        var dpr = 1;
        function sizeCanvas() {
            dpr = Math.min(window.devicePixelRatio || 1, 1.5);
            canvas.width = Math.floor(window.innerWidth * dpr);
            canvas.height = Math.floor(window.innerHeight * dpr);
        }
        sizeCanvas();
        window.addEventListener('resize', sizeCanvas);
        var stars = [];
        for (var i = 0; i < COUNT; i++) {
            stars.push({
                x: Math.random(), y: Math.random(),
                r: 0.6 + Math.random() * 1.8,
                c: COLORS[(Math.random() * COLORS.length) | 0],
                tw: Math.random() * Math.PI * 2,
                sp: 0.3 + Math.random() * 0.9
            });
        }
        var t = Math.random() * 100;
        function paint(now) {
            var W = canvas.width, H = canvas.height;
            ctx.clearRect(0, 0, W, H);
            ctx.globalCompositeOperation = 'lighter';
            var px = mx * 0.12 * dpr, py = my * 0.12 * dpr;
            for (var j = 0; j < stars.length; j++) {
                var s = stars[j];
                var y = reduceMotion ? s.y : (s.y + t * 0.004 * s.sp) % 1;
                var a = reduceMotion ? 0.5 : 0.35 + 0.35 * Math.sin(t * s.sp + s.tw);
                ctx.beginPath();
                ctx.fillStyle = 'rgba(' + s.c + ',' + a.toFixed(3) + ')';
                ctx.arc(s.x * W - px * s.sp, y * H - py * s.sp, s.r * dpr, 0, 6.2832);
                ctx.fill();
            }
            ctx.globalCompositeOperation = 'source-over';
        }
        function draw() {
            requestAnimationFrame(draw);
            if (document.hidden) return;
            if (!reduceMotion) { t += 0.016; }
            paint();
        }
        paint();
        if (!tinyScreen && !reduceMotion) { draw(); }
        /* tiny screens hide the canvas via CSS and reduced-motion users get
           the single static frame — no loop, no battery drain. */
    }

    function ensureComponentsLoaded() {
        try {
            var hasComponents = typeof window.renderHeader === 'function' || typeof window.initComponents === 'function';
            if (!hasComponents) {
                var existingScript = document.querySelector('script[src$="components.js"], script[src*="/components.js"]');
                if (!existingScript) {
                    var s = document.createElement('script');
                    s.src = 'components.js';
                    document.head.appendChild(s);
                }
            }

            var hasSharedCss = !!document.querySelector('link[rel="stylesheet"][href$="shared.css"], link[rel="stylesheet"][href*="/shared.css"]');
            if (!hasSharedCss) {
                var l = document.createElement('link');
                l.rel = 'stylesheet';
                l.href = 'shared.css';
                document.head.appendChild(l);
            }
        } catch (e) {}
    }

    /* ── 1. Ensure canvas exists and has correct CSS ── */
    function ensureCanvas() {
        var c = document.getElementById(CANVAS_ID);
        if (!c) {
            c = document.createElement('canvas');
            c.id = CANVAS_ID;
            document.body.insertBefore(c, document.body.firstChild);
        }
        // Always enforce correct styles — fixes z-index:0, z-index:1, pointer-events issues
        c.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:-1;pointer-events:none;';
        return c;
    }

    /* ── 1b. Create theme background div behind canvas so body stays transparent ── */
    function ensureThemeBg() {
        var bg = document.getElementById('__theme-bg');
        if (!bg) {
            bg = document.createElement('div');
            bg.id = '__theme-bg';
            bg.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:-2;pointer-events:none;transition:background 0.4s ease;background:linear-gradient(180deg,#0a0a2a,#1a1a40);';
            document.body.insertBefore(bg, document.body.firstChild);
        }
        window.__themeBgDiv = bg;
        document.body.style.background = 'transparent';
    }

    /* ── 2. Build the Three.js scene ── */
    function init() {
        if (running || started) return;

        var canvas = ensureCanvas();
        ensureThemeBg();

        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.z = 100;

        try {
            renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: false });
        } catch (err) {
            console.warn('bg.js: WebGL unavailable — using 2D fallback background.');
            startFallback2D();
            return;
        }
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        // Particles
        var count = 1500;
        var geo = new THREE.BufferGeometry();
        var pos = new Float32Array(count * 3);
        var col = new Float32Array(count * 3);
        var c1 = new THREE.Color(0x00f0ff);
        var c2 = new THREE.Color(0xff00aa);
        var c3 = new THREE.Color(0x00ff88);

        for (var i = 0; i < count * 3; i += 3) {
            pos[i]     = (Math.random() - 0.5) * 800;
            pos[i + 1] = (Math.random() - 0.5) * 800;
            pos[i + 2] = (Math.random() - 0.5) * 500;
            var cc = Math.random() < 0.33 ? c1 : Math.random() < 0.66 ? c2 : c3;
            col[i] = cc.r; col[i + 1] = cc.g; col[i + 2] = cc.b;
        }

        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('color',    new THREE.BufferAttribute(col, 3));

        particles = new THREE.Points(geo, new THREE.PointsMaterial({
            size: 2, vertexColors: true, transparent: true,
            opacity: 0.8, blending: THREE.AdditiveBlending
        }));
        scene.add(particles);

        window.addEventListener('resize', function () {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });

        running = true;
        started = true;
        animate();
    }

    function forceResize() {
        if (!renderer || !camera) return;
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }

    function animate() {
        requestAnimationFrame(animate);
        if (document.hidden) return;
        camera.position.x += (mx - camera.position.x) * 0.05;
        camera.position.y += (-my - camera.position.y) * 0.05;
        camera.lookAt(scene.position);
        particles.rotation.y += 0.001;
        particles.rotation.x += 0.0005;
        renderer.render(scene, camera);
    }

    function restartIfNeeded() {
        if (!running) {
            if (typeof THREE !== 'undefined') init();
            return;
        }
        forceResize();
        if (renderer) {
            try { renderer.render(scene, camera); } catch (e) {}
        }
    }

    /* ── 3. Mouse / touch tracking ── */
    document.addEventListener('mousemove', function (e) {
        mx = (e.clientX - window.innerWidth  / 2) * 0.5;
        my = (e.clientY - window.innerHeight / 2) * 0.5;
        // Expose normalised [-1..1] values so hero section can sync
        window.__bgMouse = {
            nx: (e.clientX - window.innerWidth  / 2) / (window.innerWidth  / 2),
            ny: (e.clientY - window.innerHeight / 2) / (window.innerHeight / 2)
        };
    });
    document.addEventListener('touchmove', function (e) {
        if (e.touches[0]) {
            mx = (e.touches[0].clientX - window.innerWidth  / 2) * 0.5;
            my = (e.touches[0].clientY - window.innerHeight / 2) * 0.5;
            window.__bgMouse = {
                nx: (e.touches[0].clientX - window.innerWidth  / 2) / (window.innerWidth  / 2),
                ny: (e.touches[0].clientY - window.innerHeight / 2) / (window.innerHeight / 2)
            };
        }
    }, { passive: true });

    /* ── 5. Theme update support ── */
    window.updateParticlesTheme = function(theme) {
        if (!particles || !particles.geometry) return;
        
        const colors = particles.geometry.attributes.color.array;
        const c1 = new THREE.Color(theme.accent || 0x00f0ff);
        const c2 = new THREE.Color(theme.accent2 || 0xff00aa);
        const c3 = new THREE.Color(theme.accent3 || 0x00ff88);
        
        for (var i = 0; i < colors.length; i += 3) {
            var cc = Math.random() < 0.33 ? c1 : Math.random() < 0.66 ? c2 : c3;
            colors[i] = cc.r; 
            colors[i + 1] = cc.g; 
            colors[i + 2] = cc.b;
        }
        particles.geometry.attributes.color.needsUpdate = true;
        
        console.log('🎨 bg.js particles updated with theme colors');
    };

    /* ── 6. Bootstrap ── */
    function domReady(fn) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', fn);
        } else {
            fn();
        }
    }

    domReady(function() {
        ensureComponentsLoaded();
        if (typeof THREE !== 'undefined') {
            init();
        } else {
            document.querySelectorAll('script[src*="three"]').forEach(function(s){ s.remove(); });
            var s = document.createElement('script');
            s.src = THREE_CDN;
            s.onload = init;
            s.onerror = function () {
                console.warn('bg.js: Three.js CDN failed — using 2D fallback background.');
                startFallback2D();
            };
            document.head.appendChild(s);
            // Watchdog: a hanging CDN request (offline/adblock) must not leave a dead sky.
            setTimeout(function () {
                if (!started && typeof THREE === 'undefined') {
                    console.warn('bg.js: Three.js load timed out — using 2D fallback background.');
                    startFallback2D();
                }
            }, 7000);
        }
    });

    window.addEventListener('pageshow', function (e) {
        if (e && e.persisted) {
            restartIfNeeded();
        }
    });

    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) {
            restartIfNeeded();
        }
    });
})();
