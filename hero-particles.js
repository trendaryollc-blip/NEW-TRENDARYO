/**
 * hero-particles.js — Interactive Hero Section with 3D Particle Integration
 * Creates particle attraction/repulsion zones around hero elements
 * Spawns particle bursts on interactions
 * Syncs with bg.js Three.js particle system
 */

(function () {
    'use strict';

    // Wait for Three.js and scene to be ready
    function waitForScene(callback, maxAttempts = 50) {
        let attempts = 0;
        const check = setInterval(() => {
            if (window.THREE && window.__bgScene) {
                clearInterval(check);
                callback();
            } else if (attempts++ > maxAttempts) {
                clearInterval(check);
                console.warn('hero-particles.js: Scene not ready, running in limited mode');
                callback();
            }
        }, 100);
    }

    // Hero element tracking
    const heroElements = {
        pods: [],
        buttons: [],
        tagline: null,
        subtitle: null
    };

    // Particle burst effect data
    const burstZones = [];

    // Initialize hero element tracking
    function initHeroElements() {
        heroElements.pods = Array.from(document.querySelectorAll('#hero .product-pod'));
        heroElements.buttons = Array.from(document.querySelectorAll('#hero .hero-cta'));
        heroElements.tagline = document.getElementById('hero-tagline');
        heroElements.subtitle = document.querySelector('#hero .hero-sub');

        // Create invisible zones around pods for particle interaction
        heroElements.pods.forEach((pod, idx) => {
            const zone = {
                id: `pod-${idx}`,
                element: pod,
                radius: 120,
                strength: 0.8,
                type: 'attraction',
                active: false,
                particles: []
            };
            burstZones.push(zone);

            // Add hover interaction
            pod.addEventListener('mouseenter', () => {
                zone.active = true;
                zone.type = 'attraction';
                triggerPodHoverEffect(pod, idx);
            });

            pod.addEventListener('mouseleave', () => {
                zone.active = false;
                setTimeout(() => { zone.type = 'repulsion'; }, 200);
            });

            pod.addEventListener('click', () => {
                triggerParticleBurst(pod);
            });
        });

        // Button click particle effects
        heroElements.buttons.forEach((btn, idx) => {
            btn.addEventListener('click', (e) => {
                triggerParticleBurst(btn);
            });

            btn.addEventListener('mouseenter', () => {
                triggerButtonGlow(btn);
            });
        });

        console.log('✨ Hero particle zones initialized:', burstZones.length);
    }

    // Trigger particle burst on interaction
    function triggerParticleBurst(element) {
        const rect = element.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;

        // Create burst effect
        const burst = {
            x: x,
            y: y,
            intensity: 1.5,
            duration: 800,
            startTime: Date.now(),
            particles: 12
        };

        // Dispatch custom event for particle system
        window.dispatchEvent(new CustomEvent('particleBurst', {
            detail: {
                x: x,
                y: y,
                intensity: burst.intensity,
                duration: burst.duration,
                particleCount: burst.particles
            }
        }));

        // Visual feedback
        createBurstVisual(element, burst);
    }

    // Create visual burst effect
    function createBurstVisual(element, burst) {
        const rect = element.getBoundingClientRect();
        const particles = burst.particles;

        for (let i = 0; i < particles; i++) {
            const angle = (i / particles) * Math.PI * 2;
            const distance = 80 + Math.random() * 40;
            const vx = Math.cos(angle) * distance;
            const vy = Math.sin(angle) * distance;

            const particle = document.createElement('div');
            particle.style.cssText = `
                position: fixed;
                left: ${rect.left + rect.width / 2}px;
                top: ${rect.top + rect.height / 2}px;
                width: 4px;
                height: 4px;
                border-radius: 50%;
                background: radial-gradient(circle, #00f0ff, #ff00aa);
                pointer-events: none;
                z-index: 9998;
                box-shadow: 0 0 10px rgba(0,240,255,0.8);
            `;

            document.body.appendChild(particle);

            // Animate particle
            let startTime = Date.now();
            const animate = () => {
                const elapsed = Date.now() - startTime;
                const progress = elapsed / burst.duration;

                if (progress >= 1) {
                    particle.remove();
                    return;
                }

                const easeOut = 1 - Math.pow(1 - progress, 3);
                const x = vx * easeOut;
                const y = vy * easeOut;
                const opacity = 1 - progress;

                particle.style.transform = `translate(${x}px, ${y}px)`;
                particle.style.opacity = opacity;

                requestAnimationFrame(animate);
            };

            animate();
        }
    }

    // Pod hover effect
    function triggerPodHoverEffect(pod, idx) {
        // Dispatch event for particle attraction
        window.dispatchEvent(new CustomEvent('podHover', {
            detail: {
                podIndex: idx,
                x: pod.getBoundingClientRect().left + pod.offsetWidth / 2,
                y: pod.getBoundingClientRect().top + pod.offsetHeight / 2,
                radius: 120
            }
        }));
    }

    // Button glow effect
    function triggerButtonGlow(btn) {
        const rect = btn.getBoundingClientRect();
        const glow = document.createElement('div');
        glow.style.cssText = `
            position: fixed;
            left: ${rect.left}px;
            top: ${rect.top}px;
            width: ${rect.width}px;
            height: ${rect.height}px;
            border-radius: ${btn.style.borderRadius || '999px'};
            background: radial-gradient(circle at center, rgba(0,240,255,0.3), transparent);
            pointer-events: none;
            z-index: 9997;
            animation: buttonGlowPulse 0.6s ease-out forwards;
        `;

        document.body.appendChild(glow);
        setTimeout(() => glow.remove(), 600);
    }

    // Add animation styles
    function addAnimationStyles() {
        const style = document.createElement('style');
        style.textContent = `
            @keyframes buttonGlowPulse {
                0% {
                    box-shadow: 0 0 0 0 rgba(0,240,255,0.6);
                    transform: scale(1);
                }
                50% {
                    box-shadow: 0 0 20px 10px rgba(0,240,255,0.3);
                }
                100% {
                    box-shadow: 0 0 40px 20px rgba(0,240,255,0);
                    transform: scale(1.1);
                }
            }

            @keyframes particleTrail {
                0% {
                    opacity: 1;
                    transform: translate(0, 0) scale(1);
                }
                100% {
                    opacity: 0;
                    transform: translate(var(--tx), var(--ty)) scale(0);
                }
            }

            @keyframes heroElementPulse {
                0%, 100% {
                    filter: drop-shadow(0 0 10px rgba(0,240,255,0.3));
                }
                50% {
                    filter: drop-shadow(0 0 20px rgba(0,240,255,0.6));
                }
            }
        `;
        document.head.appendChild(style);
    }

    // Create cosmic dust trail following mouse
    function initCosmicTrail() {
        let lastX = 0, lastY = 0;
        let trailTimeout;

        document.addEventListener('mousemove', (e) => {
            const heroSection = document.getElementById('hero');
            if (!heroSection) return;

            const heroRect = heroSection.getBoundingClientRect();
            const isInHero = e.clientY >= heroRect.top && e.clientY <= heroRect.bottom;

            if (!isInHero) return;

            clearTimeout(trailTimeout);

            // Create dust particle every 30px
            const distance = Math.hypot(e.clientX - lastX, e.clientY - lastY);
            if (distance > 30) {
                createDustParticle(e.clientX, e.clientY);
                lastX = e.clientX;
                lastY = e.clientY;
            }

            trailTimeout = setTimeout(() => {
                lastX = 0;
                lastY = 0;
            }, 100);
        });
    }

    // Create individual dust particle
    function createDustParticle(x, y) {
        const dust = document.createElement('div');
        const size = 2 + Math.random() * 3;
        const colors = ['#00f0ff', '#ff00aa', '#00ff88'];
        const color = colors[Math.floor(Math.random() * colors.length)];

        dust.style.cssText = `
            position: fixed;
            left: ${x}px;
            top: ${y}px;
            width: ${size}px;
            height: ${size}px;
            border-radius: 50%;
            background: ${color};
            pointer-events: none;
            z-index: 9996;
            box-shadow: 0 0 ${size * 2}px ${color};
            opacity: 0.8;
        `;

        document.body.appendChild(dust);

        // Animate dust
        let startTime = Date.now();
        const duration = 600 + Math.random() * 400;
        const vx = (Math.random() - 0.5) * 100;
        const vy = (Math.random() - 0.5) * 100 - 50;

        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = elapsed / duration;

            if (progress >= 1) {
                dust.remove();
                return;
            }

            const easeOut = 1 - Math.pow(1 - progress, 2);
            dust.style.transform = `translate(${vx * easeOut}px, ${vy * easeOut}px)`;
            dust.style.opacity = 1 - progress;

            requestAnimationFrame(animate);
        };

        animate();
    }

    // Particle attraction zone update (runs every frame)
    function updateParticleZones() {
        burstZones.forEach(zone => {
            if (!zone.active) return;

            const rect = zone.element.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;

            // Dispatch zone update for particle system
            window.dispatchEvent(new CustomEvent('particleZoneUpdate', {
                detail: {
                    zoneId: zone.id,
                    x: centerX,
                    y: centerY,
                    radius: zone.radius,
                    strength: zone.strength,
                    type: zone.type
                }
            }));
        });

        requestAnimationFrame(updateParticleZones);
    }

    // Initialize on DOM ready
    function init() {
        const heroSection = document.getElementById('hero');
        if (!heroSection) {
            console.log('hero-particles.js: No hero section found');
            return;
        }

        addAnimationStyles();
        initHeroElements();
        initCosmicTrail();
        updateParticleZones();

        console.log('✨ Hero particle system initialized');
    }

    // Wait for DOM and Three.js
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose API for external control
    window.HeroParticles = {
        triggerBurst: triggerParticleBurst,
        getZones: () => burstZones,
        updateZone: (id, config) => {
            const zone = burstZones.find(z => z.id === id);
            if (zone) Object.assign(zone, config);
        }
    };
})();
