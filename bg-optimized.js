/**
 * bg.js — Universal 3D Background with Device Optimization
 * Automatically adapts to: Mobile, Tablet, Laptop, Desktop, Ultra-wide
 * Performance: Smooth on all devices with intelligent quality scaling
 */

(function () {
    'use strict';

    var THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    var CANVAS_ID = 'three-canvas';
    var scene, camera, renderer, particles, mx = 0, my = 0, running = false;
    
    // Device detection
    var deviceInfo = {
        isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
        isTablet: /iPad|Android(?!.*Mobile)/i.test(navigator.userAgent),
        isLandscape: window.innerHeight < window.innerWidth,
        dpr: Math.min(window.devicePixelRatio || 1, 2),
        width: window.innerWidth,
        height: window.innerHeight,
        isTouchDevice: () => {
            return (('ontouchstart' in window) ||
                    (navigator.maxTouchPoints > 0) ||
                    (navigator.msMaxTouchPoints > 0));
        }
    };

    // Performance settings based on device
    var performanceSettings = {
        particleCount: 1500,
        pixelRatio: 1,
        antialias: true,
        renderScale: 1,
        updateFrequency: 60
    };

    function detectPerformanceLevel() {
        var width = window.innerWidth;
        var height = window.innerHeight;
        var area = width * height;

        // Ultra-small phones (< 200k pixels)
        if (area < 200000) {
            performanceSettings.particleCount = 400;
            performanceSettings.pixelRatio = 1;
            performanceSettings.antialias = false;
            performanceSettings.renderScale = 0.8;
            console.log('📱 Ultra-small phone detected - Low performance mode');
        }
        // Small phones (200k - 400k pixels)
        else if (area < 400000) {
            performanceSettings.particleCount = 600;
            performanceSettings.pixelRatio = 1;
            performanceSettings.antialias = false;
            performanceSettings.renderScale = 0.9;
            console.log('📱 Small phone detected - Low-medium performance mode');
        }
        // Medium phones (400k - 600k pixels)
        else if (area < 600000) {
            performanceSettings.particleCount = 900;
            performanceSettings.pixelRatio = Math.min(deviceInfo.dpr, 1.5);
            performanceSettings.antialias = false;
            performanceSettings.renderScale = 1;
            console.log('📱 Medium phone detected - Medium performance mode');
        }
        // Large phones / Tablets (600k - 1.5M pixels)
        else if (area < 1500000) {
            performanceSettings.particleCount = 1200;
            performanceSettings.pixelRatio = Math.min(deviceInfo.dpr, 1.5);
            performanceSettings.antialias = true;
            performanceSettings.renderScale = 1;
            console.log('📱 Large phone/Tablet detected - Medium-high performance mode');
        }
        // Laptops (1.5M - 3M pixels)
        else if (area < 3000000) {
            performanceSettings.particleCount = 1500;
            performanceSettings.pixelRatio = Math.min(deviceInfo.dpr, 2);
            performanceSettings.antialias = true;
            performanceSettings.renderScale = 1;
            console.log('💻 Laptop detected - High performance mode');
        }
        // Desktops (3M+ pixels)
        else {
            performanceSettings.particleCount = 2000;
            performanceSettings.pixelRatio = Math.min(deviceInfo.dpr, 2);
            performanceSettings.antialias = true;
            performanceSettings.renderScale = 1;
            console.log('🖥️ Desktop detected - Ultra-high performance mode');
        }
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

            // Load responsive universal CSS
            var hasResponsiveCss = !!document.querySelector('link[rel="stylesheet"][href$="responsive-universal.css"], link[rel="stylesheet"][href*="/responsive-universal.css"]');
            if (!hasResponsiveCss) {
                var rl = document.createElement('link');
                rl.rel = 'stylesheet';
                rl.href = 'responsive-universal.css';
                document.head.appendChild(rl);
            }
        } catch (e) {
            console.warn('bg.js: Error loading components', e);
        }
    }

    /* ── Ensure canvas exists with correct CSS ── */
    function ensureCanvas() {
        var c = document.getElementById(CANVAS_ID);
        if (!c) {
            c = document.createElement('canvas');
            c.id = CANVAS_ID;
            document.body.insertBefore(c, document.body.firstChild);
        }
        c.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:-1;pointer-events:none;';
        return c;
    }

    /* ── Create theme background div ── */
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

    /* ── Build Three.js scene ── */
    function init() {
        if (running) return;

        detectPerformanceLevel();
        
        var canvas = ensureCanvas();
        ensureThemeBg();

        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.z = 100;

        renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            alpha: true,
            antialias: performanceSettings.antialias,
            powerPreference: deviceInfo.isMobile ? 'low-power' : 'high-performance'
        });

        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(performanceSettings.pixelRatio);

        // Create particles
        var count = performanceSettings.particleCount;
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
            col[i] = cc.r;
            col[i + 1] = cc.g;
            col[i + 2] = cc.b;
        }

        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

        particles = new THREE.Points(geo, new THREE.PointsMaterial({
            size: deviceInfo.isMobile ? 1.5 : 2,
            vertexColors: true,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending
        }));
        scene.add(particles);

        // Handle resize
        window.addEventListener('resize', handleResize);
        window.addEventListener('orientationchange', handleOrientationChange);

        running = true;
        animate();
    }

    function handleResize() {
        if (!renderer || !camera) return;

        var newWidth = window.innerWidth;
        var newHeight = window.innerHeight;

        // Only update if size actually changed
        if (newWidth !== deviceInfo.width || newHeight !== deviceInfo.height) {
            deviceInfo.width = newWidth;
            deviceInfo.height = newHeight;
            deviceInfo.isLandscape = newHeight < newWidth;

            camera.aspect = newWidth / newHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(newWidth, newHeight);
        }
    }

    function handleOrientationChange() {
        setTimeout(function() {
            handleResize();
            detectPerformanceLevel();
        }, 100);
    }

    function forceResize() {
        if (!renderer || !camera) return;
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }

    var lastFrameTime = 0;
    var frameCount = 0;

    function animate() {
        requestAnimationFrame(animate);

        var now = Date.now();
        var deltaTime = now - lastFrameTime;
        lastFrameTime = now;

        // Smooth camera movement
        camera.position.x += (mx - camera.position.x) * 0.05;
        camera.position.y += (-my - camera.position.y) * 0.05;
        camera.lookAt(scene.position);

        // Particle rotation
        if (particles) {
            particles.rotation.y += 0.001;
            particles.rotation.x += 0.0005;
        }

        renderer.render(scene, camera);
        frameCount++;
    }

    function restartIfNeeded() {
        if (!running) {
            if (typeof THREE !== 'undefined') {
                init();
            }
            return;
        }
        forceResize();
        if (renderer) {
            try {
                renderer.render(scene, camera);
            } catch (e) {
                console.warn('bg.js: Render error', e);
            }
        }
    }

    /* ── Mouse / Touch tracking ── */
    document.addEventListener('mousemove', function (e) {
        mx = (e.clientX - window.innerWidth / 2) * 0.5;
        my = (e.clientY - window.innerHeight / 2) * 0.5;
        window.__bgMouse = {
            nx: (e.clientX - window.innerWidth / 2) / (window.innerWidth / 2),
            ny: (e.clientY - window.innerHeight / 2) / (window.innerHeight / 2)
        };
    });

    document.addEventListener('touchmove', function (e) {
        if (e.touches[0]) {
            mx = (e.touches[0].clientX - window.innerWidth / 2) * 0.5;
            my = (e.touches[0].clientY - window.innerHeight / 2) * 0.5;
            window.__bgMouse = {
                nx: (e.touches[0].clientX - window.innerWidth / 2) / (window.innerWidth / 2),
                ny: (e.touches[0].clientY - window.innerHeight / 2) / (window.innerHeight / 2)
            };
        }
    }, { passive: true });

    /* ── Theme update support ── */
    window.updateParticlesTheme = function(theme) {
        if (!particles || !particles.geometry) return;

        var colors = particles.geometry.attributes.color.array;
        var c1 = new THREE.Color(theme.accent || 0x00f0ff);
        var c2 = new THREE.Color(theme.accent2 || 0xff00aa);
        var c3 = new THREE.Color(theme.accent3 || 0x00ff88);

        for (var i = 0; i < colors.length; i += 3) {
            var cc = Math.random() < 0.33 ? c1 : Math.random() < 0.66 ? c2 : c3;
            colors[i] = cc.r;
            colors[i + 1] = cc.g;
            colors[i + 2] = cc.b;
        }
        particles.geometry.attributes.color.needsUpdate = true;

        console.log('🎨 bg.js particles updated with theme colors');
    };

    /* ── Bootstrap ── */
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
            document.querySelectorAll('script[src*="three"]').forEach(function(s) {
                s.remove();
            });
            var s = document.createElement('script');
            s.src = THREE_CDN;
            s.onload = init;
            s.onerror = function() {
                console.warn('bg.js: Three.js CDN failed — no 3D background.');
            };
            document.head.appendChild(s);
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

    // Expose device info for debugging
    window.__bgDeviceInfo = deviceInfo;
    window.__bgPerformanceSettings = performanceSettings;
})();
