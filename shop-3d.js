(function () {
    'use strict';

    var THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js';
    var GLTF_CDN = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js';
    var ROOM_CDN = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/environments/RoomEnvironment.js';

    var MODELS = [
        { name: 'DamagedHelmet',        url: 'assets/models/DamagedHelmet.glb',        pos: [-3.6, 0.9, 0],    size: 2.2, remote: 'DamagedHelmet', spin: 0.4 },
        { name: 'Corset',               url: 'assets/models/Corset.glb',               pos: [-1.9, -0.9, -0.4], size: 2.0, remote: 'Corset', spin: 0.35 },
        { name: 'GlamVelvetSofa',       url: 'assets/models/GlamVelvetSofa.glb',       pos: [0.0, 1.0, -1.2],   size: 2.4, remote: 'GlamVelvetSofa', spin: 0.3 },
        { name: 'SheenChair',           url: 'assets/models/SheenChair.glb',           pos: [1.9, -0.9, 0.3],   size: 2.2, remote: 'SheenChair', spin: 0.4 },
        { name: 'Lantern',              url: 'assets/models/Lantern.glb',              pos: [3.6, 0.9, -0.3],   size: 2.0, remote: 'Lantern', spin: 0.45 },
        { name: 'LightsPunctualLamp',   url: 'assets/models/LightsPunctualLamp.glb',   pos: [-3.6, -1.0, -0.5], size: 2.2, remote: 'LightsPunctualLamp', spin: 0.5 },
        { name: 'ReciprocatingSaw',     url: 'assets/models/ReciprocatingSaw.glb',     pos: [-1.9, 1.0, 0.4],   size: 2.0, remote: 'ReciprocatingSaw', spin: 0.55 },
        { name: 'ToyCar',               url: 'assets/models/ToyCar.glb',               pos: [0.0, -1.1, 0.6],   size: 2.2, remote: 'ToyCar', spin: 0.6 },
        { name: 'CesiumMilkTruck',      url: 'assets/models/CesiumMilkTruck.glb',      pos: [1.9, 1.0, -0.6],   size: 2.4, remote: 'CesiumMilkTruck', spin: 0.35 },
        { name: 'IridescentDish',       url: 'assets/models/IridescentDishWithOlives.glb', pos: [3.6, -1.0, 0.5], size: 2.2, remote: 'IridescentDishWithOlives', spin: 0.45 }
    ];
    MODELS.forEach(function (m, i) { m.phase = i * 1.3; });

    function init() {
        var canvas = document.getElementById('shop-3d');
        if (!canvas || !window.THREE || !THREE.GLTFLoader) return;

        var renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.outputEncoding = THREE.sRGBEncoding;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.0;
        var scene = new THREE.Scene();
        var camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
        camera.position.set(0, 0.4, 7.5);

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

        var products = [];
        var loader = new THREE.GLTFLoader();

        MODELS.forEach(function (m) {
            loader.load(m.url, function (gltf) { placeModel(gltf, m); }, undefined, function () {
                // local fetch failed (e.g. opened via file://) — retry from CDN
                var remote = 'https://raw.githubusercontent.com/KhronosGroupArchives/glTF-Sample-Models/main/2.0/' + m.remote + '/glTF-Binary/' + m.remote + '.glb';
                loader.load(remote, function (gltf2) { placeModel(gltf2, m); }, undefined, function () {});
            });
        });

        function placeModel(gltf, m) {
            var group = new THREE.Group();
            var model = gltf.scene;
            var box = new THREE.Box3().setFromObject(model);
            var center = box.getCenter(new THREE.Vector3());
            var size = box.getSize(new THREE.Vector3()).length();
            var s = m.size / size;
            model.scale.setScalar(s);
            model.position.sub(center.multiplyScalar(s));
            group.add(model);
            group.position.set(m.pos[0], m.pos[1], m.pos[2]);
            scene.add(group);
            canvas.style.opacity = '1'; // first model ready — fade canvas in
            products.push({
                obj: group, spin: m.spin, bob: 0.3, phase: m.phase,
                baseX: group.position.x, baseY: group.position.y, baseZ: group.position.z
            });
        }

        // Floating dust for depth
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

        function resize() {
            var w = canvas.clientWidth || 400;
            var h = canvas.clientHeight || 500;
            renderer.setSize(w, h, false);
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
        }
        resize();
        window.addEventListener('resize', resize);

        var mx = 0, my = 0;
        window.addEventListener('mousemove', function (e) {
            mx = (e.clientX / window.innerWidth - 0.5) * 2;
            my = (e.clientY / window.innerHeight - 0.5) * 2;
        });

        // Drag-to-move products
        var raycaster = new THREE.Raycaster();
        var ndc = new THREE.Vector2();
        var dragPlane = new THREE.Plane();
        var dragged = null;
        var dragOffset = new THREE.Vector3();
        var dragPoint = new THREE.Vector3();

        function setNdc(e) {
            var r = canvas.getBoundingClientRect();
            ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
            ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
        }

        function rootOf(obj) {
            for (var i = 0; i < products.length; i++) {
                var root = products[i].obj;
                var found = false;
                root.traverse(function (c) { if (c === obj) found = true; });
                if (found) return products[i];
            }
            return null;
        }

        canvas.addEventListener('pointerdown', function (e) {
            setNdc(e);
            raycaster.setFromCamera(ndc, camera);
            var hits = raycaster.intersectObjects(scene.children, true);
            for (var i = 0; i < hits.length; i++) {
                if (hits[i].object === dust) continue;
                var p = rootOf(hits[i].object);
                if (p) {
                    dragged = p;
                    dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, 1), hits[i].point);
                    dragOffset.copy(hits[i].point).sub(p.obj.position);
                    canvas.style.cursor = 'grabbing';
                    canvas.setPointerCapture(e.pointerId);
                    e.preventDefault();
                    return;
                }
            }
        });

        canvas.addEventListener('pointermove', function (e) {
            if (!dragged) {
                setNdc(e);
                raycaster.setFromCamera(ndc, camera);
                var hits = raycaster.intersectObjects(scene.children, true);
                canvas.style.cursor = hits.length ? 'grab' : 'default';
                return;
            }
            setNdc(e);
            raycaster.setFromCamera(ndc, camera);
            if (raycaster.ray.intersectPlane(dragPlane, dragPoint)) {
                dragged.baseX = dragPoint.x - dragOffset.x;
                dragged.baseY = dragPoint.y - dragOffset.y;
                dragged.obj.position.x = dragged.baseX;
                dragged.obj.position.y = dragged.baseY;
            }
        });

        function endDrag() {
            dragged = null;
            canvas.style.cursor = 'default';
        }
        canvas.addEventListener('pointerup', endDrag);
        canvas.addEventListener('pointercancel', endDrag);

        var t = 0;
        function animate() {
            requestAnimationFrame(animate);
            if (document.hidden) return;
            t += 0.016;
            for (var i = 0; i < products.length; i++) {
                var p = products[i];
                if (p === dragged) { continue; }
                p.obj.rotation.y += p.spin * 0.01;
                p.obj.rotation.x = Math.sin(t * 0.5 + p.phase) * 0.12;
                p.obj.position.x = p.baseX;
                p.obj.position.y = p.baseY + Math.sin(t * 1.2 + p.phase) * p.bob * 0.35;
            }
            dust.rotation.y += 0.0015;
            camera.position.x += (mx * 0.6 - camera.position.x) * 0.03;
            camera.position.y += (0.4 - my * 0.4 - camera.position.y) * 0.03;
            camera.lookAt(0, 0, 0);
            renderer.render(scene, camera);
        }
        animate();
    }

    function load(src, cb) {
        var s = document.createElement('script');
        s.src = src;
        s.onload = cb;
        s.onerror = function () { /* offline */ };
        document.head.appendChild(s);
    }

    function boot() {
        if (!window.THREE) return;
        if (window.THREE.GLTFLoader && THREE.RoomEnvironment) { init(); return; }
        load(GLTF_CDN, function () {
            load(ROOM_CDN, init);
        });
    }

    if (window.THREE) { window.addEventListener('load', boot); return; }
    load(THREE_CDN, function () { window.addEventListener('load', boot); });
})();
