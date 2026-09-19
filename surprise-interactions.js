/**
 * surprise-interactions.js — Easter Eggs & Hidden Rewards
 * Creates hidden interactive zones, easter eggs, and reward animations
 * Encourages exploration and creates delightful surprises
 */

(function () {
    'use strict';

    // Easter egg state tracking
    const easterEggs = {
        discovered: [],
        totalFound: 0,
        achievements: [],
        secrets: {
            konami: { code: [], target: ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'], found: false },
            tripleClick: { count: 0, found: false },
            orbClick: { count: 0, target: 3, found: false },
            mouseCircle: { found: false },
            taglineHover: { found: false },
            podSequence: { sequence: [], target: [1, 2, 3, 4], found: false }
        }
    };

    // Wait for GSAP
    function waitForGSAP(callback, maxAttempts = 50) {
        let attempts = 0;
        const check = setInterval(() => {
            if (window.gsap) {
                clearInterval(check);
                callback();
            } else if (attempts++ > maxAttempts) {
                clearInterval(check);
                console.warn('surprise-interactions.js: GSAP not ready');
                callback();
            }
        }, 100);
    }

    // Show notification for discovered easter egg
    function showEasterEggNotification(title, message, icon = '🎉') {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 120px;
            right: 20px;
            background: rgba(0,240,255,0.15);
            border: 2px solid rgba(0,240,255,0.4);
            border-radius: 16px;
            padding: 1.5rem;
            max-width: 300px;
            z-index: 10000;
            font-family: 'Orbitron', sans-serif;
            color: rgba(0,240,255,0.95);
            box-shadow: 0 0 30px rgba(0,240,255,0.2);
            animation: slideInRight 0.4s ease-out;
        `;

        notification.innerHTML = `
            <div style="font-size: 2rem; margin-bottom: 0.5rem;">${icon}</div>
            <div style="font-weight: 700; font-size: 1.1rem; margin-bottom: 0.5rem;">${title}</div>
            <div style="font-size: 0.9rem; color: rgba(255,255,255,0.7);">${message}</div>
        `;

        document.body.appendChild(notification);

        // Animate in
        if (window.gsap) {
            window.gsap.from(notification, {
                opacity: 0,
                y: -20,
                duration: 0.4,
                ease: 'back.out(1.2)'
            });

            // Animate out
            window.gsap.to(notification, {
                opacity: 0,
                y: -20,
                duration: 0.4,
                ease: 'power2.in',
                delay: 3.5
            });
        }

        setTimeout(() => notification.remove(), 4000);
    }

    // Easter Egg 1: Konami Code
    function initKonamiCode() {
        document.addEventListener('keydown', (e) => {
            const secret = easterEggs.secrets.konami;
            secret.code.push(e.key);
            secret.code = secret.code.slice(-secret.target.length);

            if (secret.code.join(',') === secret.target.join(',')) {
                if (!secret.found) {
                    secret.found = true;
                    triggerKonamiCodeEffect();
                    easterEggs.discovered.push('konami');
                    easterEggs.totalFound++;
                    showEasterEggNotification(
                        'KONAMI CODE ACTIVATED!',
                        'You found the legendary cheat code! 🎮',
                        '🕹️'
                    );
                }
            }
        });
    }

    // Konami code effect: Rainbow particles everywhere
    function triggerKonamiCodeEffect() {
        if (!window.gsap) return;

        const colors = ['#00f0ff', '#ff00aa', '#00ff88', '#ffaa00', '#ff3366'];
        const particleCount = 50;

        for (let i = 0; i < particleCount; i++) {
            const particle = document.createElement('div');
            const color = colors[Math.floor(Math.random() * colors.length)];
            const size = 4 + Math.random() * 8;

            particle.style.cssText = `
                position: fixed;
                left: ${Math.random() * window.innerWidth}px;
                top: ${Math.random() * window.innerHeight}px;
                width: ${size}px;
                height: ${size}px;
                border-radius: 50%;
                background: ${color};
                pointer-events: none;
                z-index: 9999;
                box-shadow: 0 0 ${size * 2}px ${color};
            `;

            document.body.appendChild(particle);

            // Animate particle
            window.gsap.to(particle, {
                y: -300 - Math.random() * 200,
                x: (Math.random() - 0.5) * 200,
                opacity: 0,
                duration: 2 + Math.random() * 1,
                ease: 'power2.out',
                onComplete: () => particle.remove()
            });
        }

        // Screen shake effect
        window.gsap.to(document.body, {
            x: 5,
            duration: 0.1,
            yoyo: true,
            repeat: 5,
            ease: 'power2.inOut'
        });
    }

    // Easter Egg 2: Triple Click on Tagline
    function initTripleClickEgg() {
        const tagline = document.getElementById('hero-tagline');
        if (!tagline) return;

        let clickCount = 0;
        let clickTimeout;

        tagline.addEventListener('click', () => {
            clickCount++;

            clearTimeout(clickTimeout);
            clickTimeout = setTimeout(() => {
                clickCount = 0;
            }, 500);

            if (clickCount === 3) {
                if (!easterEggs.secrets.tripleClick.found) {
                    easterEggs.secrets.tripleClick.found = true;
                    triggerTripleClickEffect(tagline);
                    easterEggs.discovered.push('tripleClick');
                    easterEggs.totalFound++;
                    showEasterEggNotification(
                        'TRIPLE CLICK MASTER!',
                        'You discovered the hidden rhythm! 🎵',
                        '🎶'
                    );
                }
                clickCount = 0;
            }
        });
    }

    // Triple click effect: Tagline glows and spins
    function triggerTripleClickEffect(element) {
        if (!window.gsap) return;

        window.gsap.to(element, {
            rotation: 360,
            duration: 0.8,
            ease: 'back.out(1.2)'
        });

        window.gsap.to(element, {
            filter: 'drop-shadow(0 0 30px rgba(0,240,255,0.8))',
            duration: 0.4,
            yoyo: true,
            repeat: 2,
            ease: 'power2.inOut'
        });
    }

    // Easter Egg 3: Click Orbit Ring Multiple Times
    function initOrbitClickEgg() {
        const orbitRing = document.querySelector('#hero .hero-orbit-ring');
        if (!orbitRing) return;

        orbitRing.style.cursor = 'pointer';
        orbitRing.addEventListener('click', () => {
            easterEggs.secrets.orbClick.count++;

            if (easterEggs.secrets.orbClick.count === easterEggs.secrets.orbClick.target) {
                if (!easterEggs.secrets.orbClick.found) {
                    easterEggs.secrets.orbClick.found = true;
                    triggerOrbitClickEffect(orbitRing);
                    easterEggs.discovered.push('orbClick');
                    easterEggs.totalFound++;
                    showEasterEggNotification(
                        'ORBIT MASTER!',
                        `You clicked the orbit ring ${easterEggs.secrets.orbClick.target} times! 🌌`,
                        '⭕'
                    );
                }
                easterEggs.secrets.orbClick.count = 0;
            }
        });
    }

    // Orbit click effect: Ring spins rapidly
    function triggerOrbitClickEffect(element) {
        if (!window.gsap) return;

        window.gsap.to(element, {
            rotation: 720,
            duration: 1,
            ease: 'back.out(1.4)'
        });

        window.gsap.to(element, {
            boxShadow: '0 0 60px rgba(0,240,255,0.6), inset 0 0 60px rgba(0,240,255,0.3)',
            duration: 0.5,
            yoyo: true,
            repeat: 2,
            ease: 'power2.inOut'
        });
    }

    // Easter Egg 4: Draw Circle with Mouse
    function initMouseCircleEgg() {
        let isDrawing = false;
        let startX, startY;
        let points = [];
        const threshold = 100; // pixels to complete circle

        document.addEventListener('mousedown', (e) => {
            const heroSection = document.getElementById('hero');
            if (!heroSection) return;

            const rect = heroSection.getBoundingClientRect();
            const isInHero = e.clientY >= rect.top && e.clientY <= rect.bottom;

            if (isInHero && e.button === 2) { // Right click
                isDrawing = true;
                startX = e.clientX;
                startY = e.clientY;
                points = [];
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDrawing) return;

            points.push({ x: e.clientX, y: e.clientY });

            // Check if circle is complete
            if (points.length > 20) {
                const firstPoint = points[0];
                const lastPoint = points[points.length - 1];
                const distance = Math.hypot(lastPoint.x - firstPoint.x, lastPoint.y - firstPoint.y);

                if (distance < threshold) {
                    if (!easterEggs.secrets.mouseCircle.found) {
                        easterEggs.secrets.mouseCircle.found = true;
                        triggerMouseCircleEffect(firstPoint);
                        easterEggs.discovered.push('mouseCircle');
                        easterEggs.totalFound++;
                        showEasterEggNotification(
                            'CIRCLE MASTER!',
                            'You drew a perfect circle! 🎨',
                            '⭕'
                        );
                    }
                    isDrawing = false;
                    points = [];
                }
            }
        });

        document.addEventListener('mouseup', () => {
            isDrawing = false;
            points = [];
        });

        // Prevent context menu for right-click
        document.addEventListener('contextmenu', (e) => {
            const heroSection = document.getElementById('hero');
            if (heroSection && heroSection.contains(e.target)) {
                e.preventDefault();
            }
        });
    }

    // Mouse circle effect: Particles burst from center
    function triggerMouseCircleEffect(center) {
        if (!window.gsap) return;

        const particleCount = 30;
        const colors = ['#00f0ff', '#ff00aa', '#00ff88'];

        for (let i = 0; i < particleCount; i++) {
            const angle = (i / particleCount) * Math.PI * 2;
            const distance = 150;
            const vx = Math.cos(angle) * distance;
            const vy = Math.sin(angle) * distance;

            const particle = document.createElement('div');
            const color = colors[Math.floor(Math.random() * colors.length)];

            particle.style.cssText = `
                position: fixed;
                left: ${center.x}px;
                top: ${center.y}px;
                width: 6px;
                height: 6px;
                border-radius: 50%;
                background: ${color};
                pointer-events: none;
                z-index: 9999;
                box-shadow: 0 0 12px ${color};
            `;

            document.body.appendChild(particle);

            window.gsap.to(particle, {
                x: vx,
                y: vy,
                opacity: 0,
                duration: 1,
                ease: 'power2.out',
                onComplete: () => particle.remove()
            });
        }
    }

    // Easter Egg 5: Hover Tagline to Reveal Secret Message — DISABLED
    function initTaglineHoverEgg() {
        // This easter egg has been disabled to prevent the "You Found Me!" text from appearing on hover
        return;
    }

    // Easter Egg 6: Click Pods in Sequence
    function initPodSequenceEgg() {
        const pods = Array.from(document.querySelectorAll('#hero .product-pod'));
        if (pods.length === 0) return;

        pods.forEach((pod, idx) => {
            pod.addEventListener('click', () => {
                const secret = easterEggs.secrets.podSequence;
                secret.sequence.push(idx + 1);

                // Keep only last 4 clicks
                if (secret.sequence.length > secret.target.length) {
                    secret.sequence.shift();
                }

                // Check if sequence matches
                if (secret.sequence.join(',') === secret.target.join(',')) {
                    if (!secret.found) {
                        secret.found = true;
                        triggerPodSequenceEffect(pods);
                        easterEggs.discovered.push('podSequence');
                        easterEggs.totalFound++;
                        showEasterEggNotification(
                            'SEQUENCE MASTER!',
                            'You clicked the pods in the right order! 🎯',
                            '🎪'
                        );
                    }
                    secret.sequence = [];
                }
            });
        });
    }

    // Pod sequence effect: All pods glow and spin
    function triggerPodSequenceEffect(pods) {
        if (!window.gsap) return;

        pods.forEach((pod, idx) => {
            window.gsap.to(pod, {
                rotation: 360,
                duration: 0.8,
                ease: 'back.out(1.2)',
                delay: idx * 0.1
            });

            window.gsap.to(pod, {
                boxShadow: '0 0 40px rgba(0,240,255,0.6), inset 0 0 30px rgba(0,240,255,0.2)',
                duration: 0.5,
                yoyo: true,
                repeat: 2,
                ease: 'power2.inOut'
            });
        });
    }

    // Hidden Zone: Hover over specific area to reveal bonus content
    function initHiddenZones() {
        const heroSection = document.getElementById('hero');
        if (!heroSection) return;

        // Create invisible hover zone in top-right corner
        const hiddenZone = document.createElement('div');
        hiddenZone.style.cssText = `
            position: fixed;
            top: 140px;
            right: 20px;
            width: 60px;
            height: 60px;
            cursor: pointer;
            z-index: 9998;
        `;

        document.body.appendChild(hiddenZone);

        let hoverCount = 0;
        hiddenZone.addEventListener('mouseenter', () => {
            hoverCount++;

            if (hoverCount === 1) {
                showEasterEggNotification(
                    'HIDDEN ZONE FOUND!',
                    'Keep hovering to unlock the secret... 👀',
                    '🔍'
                );
            }

            if (hoverCount === 5) {
                triggerHiddenZoneEffect();
                showEasterEggNotification(
                    'ULTIMATE SECRET UNLOCKED!',
                    'You found the hidden zone! 🌟',
                    '⭐'
                );
                easterEggs.discovered.push('hiddenZone');
                easterEggs.totalFound++;
                hoverCount = 0;
            }
        });

        hiddenZone.addEventListener('mouseleave', () => {
            hoverCount = 0;
        });
    }

    // Hidden zone effect: Cosmic burst
    function triggerHiddenZoneEffect() {
        if (!window.gsap) return;

        const particleCount = 40;
        const colors = ['#00f0ff', '#ff00aa', '#00ff88', '#ffaa00'];

        for (let i = 0; i < particleCount; i++) {
            const angle = (i / particleCount) * Math.PI * 2;
            const distance = 200 + Math.random() * 100;
            const vx = Math.cos(angle) * distance;
            const vy = Math.sin(angle) * distance;

            const particle = document.createElement('div');
            const color = colors[Math.floor(Math.random() * colors.length)];
            const size = 3 + Math.random() * 6;

            particle.style.cssText = `
                position: fixed;
                left: window.innerWidth - 50px;
                top: 170px;
                width: ${size}px;
                height: ${size}px;
                border-radius: 50%;
                background: ${color};
                pointer-events: none;
                z-index: 9999;
                box-shadow: 0 0 ${size * 2}px ${color};
            `;

            document.body.appendChild(particle);

            window.gsap.to(particle, {
                x: vx,
                y: vy,
                opacity: 0,
                duration: 1.5 + Math.random() * 0.5,
                ease: 'power2.out',
                onComplete: () => particle.remove()
            });
        }
    }

    // Micro-interaction: Pod click ripple
    function initPodClickRipple() {
        const pods = document.querySelectorAll('#hero .product-pod');
        pods.forEach(pod => {
            pod.addEventListener('click', (e) => {
                const ripple = document.createElement('div');
                const rect = pod.getBoundingClientRect();

                ripple.style.cssText = `
                    position: fixed;
                    left: ${rect.left + rect.width / 2}px;
                    top: ${rect.top + rect.height / 2}px;
                    width: 0;
                    height: 0;
                    border-radius: 50%;
                    background: radial-gradient(circle, rgba(0,240,255,0.6), transparent);
                    pointer-events: none;
                    z-index: 9997;
                    transform: translate(-50%, -50%);
                `;

                document.body.appendChild(ripple);

                if (window.gsap) {
                    window.gsap.to(ripple, {
                        width: 200,
                        height: 200,
                        opacity: 0,
                        duration: 0.8,
                        ease: 'power2.out',
                        onComplete: () => ripple.remove()
                    });
                }
            });
        });
    }

    // Achievement system: Show total discoveries
    function initAchievementSystem() {
        // Create achievement counter (hidden by default)
        const counter = document.createElement('div');
        counter.id = 'easter-egg-counter';
        counter.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: rgba(0,240,255,0.1);
            border: 1px solid rgba(0,240,255,0.3);
            border-radius: 12px;
            padding: 1rem;
            font-family: 'Orbitron', sans-serif;
            color: rgba(0,240,255,0.8);
            font-size: 0.9rem;
            z-index: 9998;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.3s ease;
        `;

        counter.innerHTML = `
            <div style="font-weight: 700; margin-bottom: 0.5rem;">🎉 DISCOVERIES</div>
            <div id="egg-count">Found: 0/6</div>
        `;

        document.body.appendChild(counter);

        // Show counter when first egg is found
        window.addEventListener('easterEggFound', () => {
            counter.style.opacity = '1';
            counter.style.pointerEvents = 'auto';
            document.getElementById('egg-count').textContent = `Found: ${easterEggs.totalFound}/6`;
        });
    }

    // Dispatch custom event when egg is found
    function dispatchEggFoundEvent() {
        window.dispatchEvent(new CustomEvent('easterEggFound', {
            detail: { totalFound: easterEggs.totalFound }
        }));
    }

    // Initialize all surprise interactions
    function init() {
        const heroSection = document.getElementById('hero');
        if (!heroSection) {
            console.log('surprise-interactions.js: No hero section found');
            return;
        }

        waitForGSAP(() => {
            console.log('🎉 Initializing surprise interactions...');

            // Initialize all easter eggs
            initKonamiCode();
            initTripleClickEgg();
            initOrbitClickEgg();
            initMouseCircleEgg();
            // initTaglineHoverEgg(); — DISABLED: Prevents "You Found Me!" text from appearing on hover
            initPodSequenceEgg();
            initHiddenZones();
            initPodClickRipple();
            initAchievementSystem();

            console.log('🎉 Surprise interactions initialized');
        });
    }

    // Wait for DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose API for external control
    window.SurpriseInteractions = {
        getDiscovered: () => easterEggs.discovered,
        getTotalFound: () => easterEggs.totalFound,
        getSecrets: () => easterEggs.secrets,
        resetAll: () => {
            easterEggs.discovered = [];
            easterEggs.totalFound = 0;
            Object.keys(easterEggs.secrets).forEach(key => {
                easterEggs.secrets[key].found = false;
                if (easterEggs.secrets[key].count !== undefined) {
                    easterEggs.secrets[key].count = 0;
                }
                if (easterEggs.secrets[key].sequence !== undefined) {
                    easterEggs.secrets[key].sequence = [];
                }
            });
        }
    };

    // Override dispatchEvent to track egg discoveries
    const originalDispatch = window.dispatchEvent;
    window.dispatchEvent = function(event) {
        if (event.type === 'easterEggFound') {
            dispatchEggFoundEvent();
        }
        return originalDispatch.call(this, event);
    };
})();
