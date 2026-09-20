/**
 * storytelling-animations.js — Dynamic Hero Storytelling
 * Creates progressive reveals, scroll-triggered animations, and emotional arc
 * Guides viewer through cosmic journey: void → discovery → exploration
 */

(function () {
    'use strict';

    // Animation timeline state
    const state = {
        heroVisible: false,
        scrollProgress: 0,
        mouseX: 0,
        mouseY: 0,
        animationsComplete: false
    };

    // Wait for GSAP and ScrollTrigger
    function waitForGSAP(callback, maxAttempts = 50) {
        let attempts = 0;
        const check = setInterval(() => {
            if (window.gsap && window.ScrollTrigger) {
                clearInterval(check);
                callback();
            } else if (attempts++ > maxAttempts) {
                clearInterval(check);
                console.warn('storytelling-animations.js: GSAP not ready, running in limited mode');
                callback();
            }
        }, 100);
    }

    // Phase 1: Void to Discovery (Initial Load)
    function initVoidToDiscovery() {
        if (!window.gsap) return;

        const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

        // Start with everything hidden
        gsap.set([
            '#hero .hero-eyebrow',
            '#hero-tagline',
            '#hero .hero-sub',
            '#hero .orbiting-products',
            '#hero .hero-cta-row',
            '#hero .hero-trust'
        ], { opacity: 0, y: 30 });

        // Nebulas fade in subtly
        gsap.set('#hero .hero-nebula', { opacity: 0 });
        tl.to('#hero .hero-nebula', {
            opacity: 0.08,
            duration: 2,
            stagger: 0.3,
            ease: 'power2.inOut'
        }, 0);

        // Orbit ring appears
        gsap.set('#hero .hero-orbit-ring', { opacity: 0, scale: 0.8 });
        tl.to('#hero .hero-orbit-ring', {
            opacity: 1,
            scale: 1,
            duration: 1.5,
            ease: 'back.out(1.2)'
        }, 0.3);

        // Eyebrow reveals
        tl.to('#hero .hero-eyebrow', {
            opacity: 1,
            y: 0,
            duration: 0.8,
            ease: 'power3.out'
        }, 0.8);

        // Tagline reveals with character-by-character effect
        tl.to('#hero-tagline', {
            opacity: 1,
            y: 0,
            duration: 1,
            ease: 'power3.out'
        }, 1);

        // Subtitle reveals
        tl.to('#hero .hero-sub', {
            opacity: 1,
            y: 0,
            duration: 0.8,
            ease: 'power3.out'
        }, 1.3);

        // Product pods float in with stagger
        tl.to('#hero .orbiting-products', {
            opacity: 1,
            y: 0,
            duration: 0.8,
            ease: 'power3.out'
        }, 1.5);

        // Individual pods scale in
        gsap.set('#hero .product-pod', { scale: 0, opacity: 0 });
        tl.to('#hero .product-pod', {
            scale: 1,
            opacity: 1,
            duration: 0.6,
            stagger: 0.15,
            ease: 'back.out(1.4)'
        }, 1.6);

        // CTA buttons reveal
        tl.to('#hero .hero-cta-row', {
            opacity: 1,
            y: 0,
            duration: 0.7,
            ease: 'power3.out'
        }, 2);

        // Trust strip reveals
        tl.to('#hero .hero-trust', {
            opacity: 1,
            y: 0,
            duration: 0.7,
            ease: 'power3.out'
        }, 2.2);

        state.animationsComplete = true;
    }

    // Phase 2: Interactive Parallax (Mouse Movement)
    function initInteractiveParallax() {
        if (!window.gsap) return;

        document.addEventListener('mousemove', (e) => {
            const heroSection = document.getElementById('hero');
            if (!heroSection) return;

            const rect = heroSection.getBoundingClientRect();
            const isInHero = e.clientY >= rect.top && e.clientY <= rect.bottom;

            if (!isInHero) return;

            // Normalize mouse position
            const x = (e.clientX - window.innerWidth / 2) / (window.innerWidth / 2);
            const y = (e.clientY - rect.top - rect.height / 2) / (rect.height / 2);

            state.mouseX = x;
            state.mouseY = y;

            // Parallax effect on nebulas
            gsap.to('#hero .hero-nebula--1', {
                x: x * 40,
                y: y * 30,
                duration: 0.5,
                ease: 'power2.out',
                overwrite: 'auto'
            });

            gsap.to('#hero .hero-nebula--2', {
                x: x * -35,
                y: y * -25,
                duration: 0.5,
                ease: 'power2.out',
                overwrite: 'auto'
            });

            gsap.to('#hero .hero-nebula--3', {
                x: x * 25,
                y: y * 20,
                duration: 0.5,
                ease: 'power2.out',
                overwrite: 'auto'
            });

            // Subtle orbit ring tilt
            gsap.to('#hero .hero-orbit-ring', {
                rotateX: y * 8,
                rotateY: x * 8,
                duration: 0.6,
                ease: 'power2.out',
                overwrite: 'auto',
                transformPerspective: 1000
            });

            // Pod magnetic effect — REMOVED (pods must stay fixed in position;
            // the gentle CSS bob on .pod-wrap is the only pod motion).
        });

        // Reset on mouse leave
        document.addEventListener('mouseleave', () => {
            gsap.to('#hero .hero-nebula', {
                x: 0,
                y: 0,
                duration: 0.8,
                ease: 'power2.out',
                overwrite: 'auto'
            });

            gsap.to('#hero .hero-orbit-ring', {
                rotateX: 0,
                rotateY: 0,
                duration: 0.8,
                ease: 'power2.out',
                overwrite: 'auto'
            });

            gsap.to('#hero .product-pod', {
                x: 0,
                y: 0,
                duration: 0.8,
                ease: 'power2.out',
                overwrite: 'auto'
            });
        });
    }
    // Phase 3: Scroll-Triggered Animations — scrub removed (scrub:1 makes
    // scroll feel "stuck" because content lags the wheel by ~1s). One-shot
    // reveals only; hero parallax killed (nebulas are display:none anyway).
    function initScrollAnimations() {
        if (!window.gsap || !window.ScrollTrigger) return;

        gsap.registerPlugin(ScrollTrigger);
        ScrollTrigger.config({ ignoreMobileResize: true });

        const heroSection = document.getElementById('hero');
        if (!heroSection) return;

        // Gentle single fade of category chips on exit — no scrub lag.
        gsap.to('#hero .orbiting-products', {
            scrollTrigger: {
                trigger: '#hero',
                start: 'top top',
                end: 'bottom 30%',
                toggleActions: 'play none none reverse',
                markers: false
            },
            opacity: 0.35,
            duration: 0.4,
            ease: 'power1.out',
            overwrite: 'auto'
        });
    }

    // Phase 4: Continuous Breathing Animation — OFF by default.
    // Infinite opacity/box-shadow tweens repaint every frame and keep the
    // main thread busy during scroll. Only run on fine-pointer desktops
    // that did not request reduced motion, and pause when hero is hidden.
    function initBreathingAnimation() {
        if (!window.gsap) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
        const hero = document.getElementById('hero');
        if (!hero) return;
        let breathing = null;
        new IntersectionObserver((entries) => {
            const visible = entries[0].isIntersecting;
            if (visible && !breathing) {
                breathing = gsap.to('#hero .hero-visual', {
                    y: -6,
                    duration: 3.2,
                    yoyo: true,
                    repeat: -1,
                    ease: 'sine.inOut'
                });
            } else if (!visible && breathing) {
                breathing.kill(); breathing = null;
            }
        }, { threshold: 0 }).observe(hero);
    }

    // Phase 5: Text Animation with Stagger (simplified - no DOM manipulation)
    function initTextAnimations() {
        // Text animations handled by main GSAP timeline in index.html
    }

    // Phase 6: Pod Hover Glow Animation
    function initPodHoverGlow() {
        if (!window.gsap) return;

        document.querySelectorAll('#hero .product-pod').forEach(pod => {
            pod.addEventListener('mouseenter', () => {
                gsap.to(pod, {
                    scale: 1.05,
                    duration: 0.3,
                    ease: 'power2.out',
                    overwrite: 'auto'
                });

                // Glow pulse
                gsap.to(pod.querySelector('.pod-glow'), {
                    opacity: 0.6,
                    duration: 0.3,
                    ease: 'power2.out'
                });
            });

            pod.addEventListener('mouseleave', () => {
                gsap.to(pod, {
                    scale: 1,
                    duration: 0.5,
                    ease: 'elastic.out(1,0.5)',
                    overwrite: 'auto'
                });

                gsap.to(pod.querySelector('.pod-glow'), {
                    opacity: 0,
                    duration: 0.4,
                    ease: 'power2.out'
                });
            });
        });
    }

    // Phase 7: Button Hover Animation
    function initButtonHoverAnimation() {
        if (!window.gsap) return;

        document.querySelectorAll('#hero .hero-cta').forEach(btn => {
            btn.addEventListener('mouseenter', () => {
                gsap.to(btn, {
                    scale: 1.08,
                    duration: 0.25,
                    ease: 'power2.out',
                    overwrite: 'auto'
                });
            });

            btn.addEventListener('mouseleave', () => {
                gsap.to(btn, {
                    scale: 1,
                    duration: 0.35,
                    ease: 'elastic.out(1,0.6)',
                    overwrite: 'auto'
                });
            });
        });
    }

    // Phase 8: Scroll Progress Indicator — rAF-throttled, passive, no per-frame gsap
    function initScrollProgress() {
        const heroSection = document.getElementById('hero');
        if (!heroSection) return;
        const content = heroSection.querySelector('.hero-content');
        let ticking = false;
        function update() {
            ticking = false;
            const rect = heroSection.getBoundingClientRect();
            // Skip work entirely once hero is off-screen (the common scroll case)
            if (rect.bottom < 0) return;
            const progress = Math.max(0, Math.min(1, 1 - (rect.bottom / window.innerHeight)));
            state.scrollProgress = progress;
            // Cheap compositor-only fade, written directly (no gsap tween per event)
            if (content && progress > 0.3) {
                content.style.opacity = String(1 - progress * 0.7);
            } else if (content && progress <= 0.01) {
                content.style.opacity = '';
            }
        }
        document.addEventListener('scroll', () => {
            if (!ticking) { ticking = true; requestAnimationFrame(update); }
        }, { passive: true });
    }

    // Phase 9: Emotional Arc — DISABLED. Animating box-shadow on infinite
    // timelines forces a repaint every frame and is the classic scroll-jank
    // source. The static luxury styling already carries the premium feel.
    function initEmotionalArc() { return; }

    // Phase 10: Reveal Hidden Elements on Scroll
    function initHiddenElementReveals() {
        if (!window.gsap || !window.ScrollTrigger) return;

        gsap.registerPlugin(ScrollTrigger);

        // Reveal constellations section
        gsap.from('#constellations .cs-eyebrow', {
            scrollTrigger: {
                trigger: '#constellations',
                start: 'top 80%',
                markers: false
            },
            opacity: 0,
            y: 20,
            duration: 0.6,
            ease: 'power3.out'
        });

        gsap.from('#constellations .cs-title', {
            scrollTrigger: {
                trigger: '#constellations',
                start: 'top 80%',
                markers: false
            },
            opacity: 0,
            y: 30,
            duration: 0.7,
            ease: 'power3.out',
            delay: 0.2
        });
    }

    // Initialize all animations
    function init() {
        const heroSection = document.getElementById('hero');
        if (!heroSection) {
            console.log('storytelling-animations.js: No hero section found');
            return;
        }

        waitForGSAP(() => {
            console.log('✨ Initializing storytelling animations...');

            // Initialize all phases
            initInteractiveParallax();
            initScrollAnimations();
            initBreathingAnimation();
            initTextAnimations();
            initPodHoverGlow();
            initButtonHoverAnimation();
            initScrollProgress();
            initEmotionalArc();
            initHiddenElementReveals();

            console.log('✨ Storytelling animations initialized');
        });
    }

    // Wait for DOM and GSAP
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose API for external control
    window.StorytellingAnimations = {
        getState: () => state,
        restart: init,
        updateScrollProgress: (progress) => { state.scrollProgress = progress; }
    };
})();
