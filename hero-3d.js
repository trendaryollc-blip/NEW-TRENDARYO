(function () {
    'use strict';

    var THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js';
    var GLTF_CDN = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js';
    var ROOM_CDN = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/environments/RoomEnvironment.js';

    // Shared loader (same helper bg.js uses) so a page loads each library once.
    window.__loadScriptOnce = window.__loadScriptOnce || function (src, cb) {
        var states = window.__scriptState || (window.__scriptState = {});
        if (states[src] === 'done') { cb(); return; }
        if (states[src]) { states[src].push(cb); return; }
        states[src] = [cb];
        var s = document.createElement('script');
        s.src = src;
        s.onload = function () { var q = states[src]; states[src] = 'done'; q.forEach(function (f) { f(); }); };
        s.onerror = function () { var q = states[src]; delete states[src]; q.forEach(function (f) { f(); }); };
        document.head.appendChild(s);
    };

    /* ── ORBIT STAGE ───────────────────────────────────────────────
       Every product rides the ellipse drawn in CSS by #hero .hero-ring.
       angle = start position on that ring (0 = right, 90° = top).
       size  = target bounding-box diagonal, in world units.          */
    var MODELS = [
        { name: 'BoomBox',             url: 'assets/models/BoomBox.glb',             angle: 0.0,    size: 1.5,  remote: 'BoomBox',             spin: 0.4,  phase: 0 },
        { name: 'Shoe',                url: 'assets/models/MaterialsVariantsShoe.glb', angle: 1.2566, size: 1.4, remote: 'MaterialsVariantsShoe', spin: 0.35, phase: 1.6 },
        { name: 'WaterBottle',         url: 'assets/models/WaterBottle.glb',         angle: 2.5133, size: 1.5,  remote: 'WaterBottle',         spin: 0.5,  phase: 3.1 },
        { name: 'AntiqueCamera',       url: 'assets/models/AntiqueCamera.glb',       angle: 3.7699, size: 1.35, remote: 'AntiqueCamera',       spin: 0.45, phase: 4.4 },
        { name: 'IridescenceLamp',     url: 'assets/models/IridescenceLamp.glb',     angle: 5.0265, size: 1.42, remote: 'IridescenceLamp',     spin: 0.5,  phase: 5.5 }
    ];

    /* Spec card copy — edit these to match your real test results */
    var SPECS = {
        BoomBox:         { title: 'Portable Speaker',   score: '9.2', verdict: 'Big sound, honest price.' },
        Shoe:            { title: 'Premium Sneakers',   score: '9.0', verdict: 'All-day comfort, true to size.' },
        WaterBottle:     { title: 'Steel Bottle 500ml', score: '9.4', verdict: 'Still cold 24 hours later.' },
        AntiqueCamera:   { title: 'Action Camera 4K',   score: '8.8', verdict: 'Sharp stills, rugged build.' },
        IridescenceLamp: { title: 'Smart LED Lamp',     score: '9.1', verdict: 'Warm, dimmable, silent.' }
    };

    var CAM_Z = 7.5;
    var ORBIT_SPEED = 0.085;   /* rad/s — one full lap ≈ 74s */
    var Z_AMP = 0.75;          /* how far the ring tilts toward/away from camera */
    var ENTER_MS = 900;
    var ENTER_STAGGER = 110;

    function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }
    function clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }

    function init() {
        var canvas = document.getElementById('hero-3d');
        if (!canvas || !window.THREE || !THREE.GLTFLoader) return;

        var renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.outputEncoding = THREE.sRGBEncoding;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.0;
        var scene = new THREE.Scene();
        /* Camera sits dead-centre so screen space ↔ world space stays a clean
           scale mapping — that keeps the CSS ring and the orbit in lockstep. */
        var camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
        camera.position.set(0, 0, CAM_Z);
        camera.lookAt(0, 0, 0);

        // Realistic lighting via RoomEnvironment
        try {
            var pmrem = new THREE.PMREMGenerator(renderer);
            pmrem.compileEquirectangularShader();
            scene.environment = pmrem.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
        } catch (e) {
            scene.add(new THREE.AmbientLight(0xffffff, 0.8));
        }
        scene.add(new THREE.HemisphereLight(0x9fd8ff, 0x33221a, 0.5));
        var key = new THREE.DirectionalLight(0xffe0b0, 1.2);
        key.position.set(4, 6, 5);
        scene.add(key);
        var rim = new THREE.DirectionalLight(0x2ee6a8, 1.0);
        rim.position.set(-3, 3, -6);
        scene.add(rim);

        /* ── Orbit geometry, read from the CSS ring ─────────────────── */
        var el = { cx: 0, cy: 0, rx: 4, ry: 1.4 };
        var cw = 400, ch = 500, fit = 1;
        var heroEl = document.getElementById('hero');
        var ringEl = document.querySelector('#hero .hero-ring');

        function updateEllipse() {
            cw = canvas.clientWidth || 400;
            ch = canvas.clientHeight || 500;
            fit = Math.min(1, cw / 1100) * (cw < 700 ? 0.62 : (cw < 1000 ? 0.82 : 1));
            if (!ringEl) return;
            var rr = ringEl.getBoundingClientRect();
            if (!rr.width || !rr.height) return;
            /* world units per pixel on the z=0 plane (camera looks straight down -z) */
            var s = 2 * Math.tan((camera.fov * Math.PI / 180) / 2) * CAM_Z / ch;
            var cxPx = rr.left + rr.width / 2 - canvas.getBoundingClientRect().left;
            var cyPx = rr.top + rr.height / 2 - canvas.getBoundingClientRect().top;
            el.cx = (cxPx - cw / 2) * s;
            el.cy = -(cyPx - ch / 2) * s;
            el.rx = (rr.width / 2) * s;
            el.ry = (rr.height / 2) * s;
        }

        function ringPoint(th, out) {
            var z = Math.sin(th) * Z_AMP;
            var k = (CAM_Z - z) / CAM_Z;
            out.set(el.cx + el.rx * Math.cos(th) * k, el.cy + el.ry * Math.sin(th) * k, z);
            return out;
        }

        /* ── Products ───────────────────────────────────────────────── */
        var products = [];
        var placeIndex = 0;
        var loader = new THREE.GLTFLoader();

        MODELS.forEach(function (m) {
            loader.load(m.url, function (gltf) { placeModel(gltf, m); }, undefined, function () {
                // local fetch blocked (opened via file://) — retry on a CDN
                var mirrors = [
                    'https://cdn.jsdelivr.net/gh/KhronosGroupArchives/glTF-Sample-Models@main/2.0/' + m.remote + '/glTF-Binary/' + m.remote + '.glb',
                    'https://raw.githubusercontent.com/KhronosGroupArchives/glTF-Sample-Models/main/2.0/' + m.remote + '/glTF-Binary/' + m.remote + '.glb'
                ];
                var attempt = 0;
                var tryNext = function () {
                    if (attempt >= mirrors.length) return;
                    loader.load(mirrors[attempt++], function (gltf2) { placeModel(gltf2, m); }, undefined, tryNext);
                };
                tryNext();
            });
        });

        function placeModel(gltf, m) {
            var group = new THREE.Group();
            var model = gltf.scene;
            var box = new THREE.Box3().setFromObject(model);
            var center = box.getCenter(new THREE.Vector3());
            var len = box.getSize(new THREE.Vector3()).length() || 1;
            var s = m.size / len;
            model.scale.setScalar(s);
            model.position.sub(center.multiplyScalar(s));
            group.add(model);
            scene.add(group);

            var mats = [];
            model.traverse(function (c) {
                if (!c.isMesh || !c.material) return;
                var list = Array.isArray(c.material) ? c.material : [c.material];
                for (var i = 0; i < list.length; i++) {
                    if (mats.indexOf(list[i]) === -1) mats.push(list[i]);
                }
            });

            products.push({
                obj: group, mats: mats, matsTransparent: null, matsOp: null,
                spin: m.spin, phase: m.phase, base: m.angle,
                spec: SPECS[m.name] || null, name: m.name,
                born: performance.now() + placeIndex * ENTER_STAGGER
            });
            placeIndex++;
            canvas.style.opacity = '1'; // first model ready — fade canvas in
        }

        function setEntry(p, k) {
            var needTransparent = k < 0.999;
            if (p.matsTransparent !== needTransparent) {
                for (var i = 0; i < p.mats.length; i++) {
                    p.mats[i].transparent = needTransparent;
                    p.mats[i].needsUpdate = true;
                }
                p.matsTransparent = needTransparent;
            }
            /* opacity must end at 1 — the canvas alpha channel uses it even
               for non-blended materials, so leaving it at the entrance value
               would draw the product fully transparent. */
            if (p.matsOp === k) return;
            p.matsOp = k;
            for (var j = 0; j < p.mats.length; j++) p.mats[j].opacity = k;
        }

        /* Floating dust for depth */
        var dustGeo = new THREE.BufferGeometry();
        var dustCount = 90;
        var dustPos = new Float32Array(dustCount * 3);
        for (var i = 0; i < dustCount; i++) {
            dustPos[i * 3] = (Math.random() - 0.5) * 9;
            dustPos[i * 3 + 1] = (Math.random() - 0.5) * 9;
            dustPos[i * 3 + 2] = (Math.random() - 0.5) * 6 - 1;
        }
        dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
        var dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0x88ffd9, size: 0.05, transparent: true, opacity: 0.7 }));
        scene.add(dust);

        /* Travelling satellite dot — the ring's pulse */
        var dot = new THREE.Mesh(
            new THREE.SphereGeometry(0.05, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0x2ee6a8 })
        );
        scene.add(dot);

        /* ── Hover spec card ────────────────────────────────────────── */
        var card = null, cardTarget = null, hideAt = 0;
        if (heroEl) {
            card = document.createElement('div');
            card.className = 'hero-card';
            card.innerHTML =
                '<span class="hero-card-kicker">Tested by us</span>' +
                '<b class="hero-card-title"></b>' +
                '<div class="hero-card-row"><span class="hero-card-score"></span>' +
                '<span class="hero-card-verdict"></span></div>' +
                '<span class="hero-card-go">Every pick is lab-checked</span>';
            heroEl.appendChild(card);
        }

        function fillCard(p) {
            if (!card || !p.spec) return;
            card.querySelector('.hero-card-title').textContent = p.spec.title;
            card.querySelector('.hero-card-score').innerHTML = p.spec.score + '<em>/10</em>';
            card.querySelector('.hero-card-verdict').textContent = p.spec.verdict;
        }

        function placeCard(p) {
            var v = tmpV.copy(p.obj.position).project(camera);
            var sx = (v.x * 0.5 + 0.5) * cw;
            var sy = (-v.y * 0.5 + 0.5) * ch;
            var left = Math.max(128, Math.min(cw - 128, sx));
            var top = sy - 172;
            if (top < 8) top = Math.min(ch - 160, sy + 96);
            card.style.left = left + 'px';
            card.style.top = top + 'px';
        }

        /* ── Pointer ────────────────────────────────────────────────── */
        var raycaster = new THREE.Raycaster();
        var ndc = new THREE.Vector2();
        var tmpV = new THREE.Vector3();
        var tmpP = new THREE.Vector3();
        var pointerIn = false;
        var hovered = null;
        var pointerMoved = false;
        var frame = 0;

        canvas.addEventListener('pointermove', function (e) {
            var r = canvas.getBoundingClientRect();
            ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
            ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
            pointerIn = true;
            pointerMoved = true;
        });
        canvas.addEventListener('pointerleave', function () {
            pointerIn = false;
            hovered = null;
        });

        function rootOf(obj) {
            for (var i = 0; i < products.length; i++) {
                var root = products[i].obj;
                var found = false;
                root.traverse(function (c) { if (c === obj) found = true; });
                if (found) return products[i];
            }
            return null;
        }

        function pick() {
            if (!pointerIn || !products.length) { hovered = null; return; }
            raycaster.setFromCamera(ndc, camera);
            var groups = [];
            for (var i = 0; i < products.length; i++) groups.push(products[i].obj);
            var hits = raycaster.intersectObjects(groups, true);
            hovered = hits.length ? rootOf(hits[0].object) : null;
        }

        function resize() {
            var w = canvas.clientWidth || 400;
            var h = canvas.clientHeight || 500;
            renderer.setSize(w, h, false);
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            updateEllipse();
        }
        resize();
        window.addEventListener('resize', resize);
        if ('ResizeObserver' in window && heroEl) new ResizeObserver(resize).observe(heroEl);
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(resize).catch(function () {});
        setTimeout(resize, 700);
        setTimeout(resize, 2200);

        function animate(now) {
            requestAnimationFrame(animate);
            var t = (now || 0) * 0.001;

            for (var i = 0; i < products.length; i++) {
                var p = products[i];
                var entry = easeOutCubic(clamp01((now - p.born) / ENTER_MS));
                var th = p.base + t * ORBIT_SPEED + (1 - entry) * 0.55;
                ringPoint(th, tmpP);
                p.obj.position.copy(tmpP);
                p.obj.position.y += Math.sin(t * 1.1 + p.phase) * 0.05;
                p.obj.rotation.y = t * p.spin + p.phase;
                p.obj.rotation.x = Math.sin(t * 0.5 + p.phase) * 0.12;
                p.obj.scale.setScalar(entry * fit);
                setEntry(p, entry);
            }

            ringPoint(-t * 0.52 + 1.1, tmpP);
            dot.position.copy(tmpP);
            dot.scale.setScalar(fit);

            dust.rotation.y = t * 0.09;
            renderer.render(scene, camera);

            /* Raycast only when the cursor moved (plus a slow sweep so a
               product drifting into a still cursor still counts as a hover) */
            frame++;
            if (pointerMoved || frame % 5 === 0) {
                pointerMoved = false;
                pick();
            }

            if (card) {
                if (hovered && hovered.spec) {
                    if (cardTarget !== hovered) { fillCard(hovered); cardTarget = hovered; }
                    hideAt = 0;
                    placeCard(hovered);
                    card.classList.add('is-on');
                } else if (cardTarget) {
                    if (!hideAt) hideAt = now + 320;
                    if (now > hideAt) { card.classList.remove('is-on'); cardTarget = null; }
                }
                canvas.style.cursor = hovered ? 'pointer' : 'default';
            }
        }
        requestAnimationFrame(animate);
    }

    /* Dependencies load as soon as this file parses — no waiting on window.load.
       three first (the example loaders attach to it), then GLTF + Room in parallel. */
    var deps = { three: false, gltf: false, room: false };
    var inited = false;
    function tryInit() {
        if (inited || !deps.three || !deps.gltf || !deps.room) return;
        if (!window.THREE || !THREE.GLTFLoader || !THREE.RoomEnvironment) return;
        inited = true;
        init();
    }
    window.__loadScriptOnce(THREE_CDN, function () {
        deps.three = !!window.THREE;
        if (!deps.three) return;
        window.__loadScriptOnce(GLTF_CDN, function () { deps.gltf = true; tryInit(); });
        window.__loadScriptOnce(ROOM_CDN, function () { deps.room = true; tryInit(); });
        tryInit();
    });
})();
