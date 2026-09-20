/**
 * TRENDARYO — Shared Header & Footer Component
 * Include this script in every page for consistent header/footer.
 * It auto-injects both components and handles all nav interactions.
 */
(function () {
    'use strict';

    /* ── Detect current page for active nav link ── */
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';

    function isActive(href) {
        return currentPage === href ? 'aria-current="page"' : '';
    }

    /* ── Header HTML ── */
    const headerHTML = `
    <header class="store-header" id="store-header">
        <div class="announcement-bar">
            <span id="announce-msg">Free shipping over $50 · 30-day returns · WELCOME10 for 10% off</span>
            <span id="announce-countdown" class="announce-countdown" style="display:none;"></span>
        </div>
        <div class="store-header-inner">
            <div class="store-brand">
                <a href="index.html" class="store-logo">
                    <img src="assets/trendaryo-crown-star-logo.svg" alt="" class="store-logo-img" onerror="this.style.display='none'">
                    <span class="store-logo-text">TRENDARYO</span>
                </a>
            </div>

            <div class="store-search" role="search">
                <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
                <input type="search" id="header-search-input" placeholder="Search headphones, watches, sneakers…" autocomplete="off" />
            </div>

            <div class="store-actions">
                <a href="wishlist.html" class="store-icon-btn" aria-label="Wishlist" title="Wishlist">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                </a>
                <a href="cart.html" class="store-icon-btn" aria-label="Cart" title="Cart">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1.6"/><circle cx="19" cy="21" r="1.6"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>
                    <span class="badge" id="cart-badge" style="display:none;">0</span>
                </a>
                <div class="store-account-menu" id="account-menu">
                    <button class="store-icon-btn" id="account-btn" aria-label="Account" title="Account">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    </button>
                    <div class="account-dropdown" id="account-dropdown">
                        <!-- Content will be injected by JavaScript -->
                    </div>
                </div>
                <button class="store-icon-btn" id="header-theme-btn" data-theme-toggle aria-label="Toggle Theme" title="Toggle Theme">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2Z"/></svg>
                </button>
                <button class="store-mobile-toggle" id="store-mobile-toggle" aria-label="Toggle menu" aria-expanded="false">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
                </button>
            </div>
        </div>

        <nav class="store-nav" aria-label="Primary navigation">
            <ul class="store-nav-list">
                <li class="store-nav-item">
                    <a href="index.html" class="store-nav-link" ${isActive('index.html')}>Home</a>
                </li>

                <li class="store-nav-item" data-dropdown>
                    <a href="shop.html" class="store-nav-link" ${isActive('shop.html')}>
                        Shop <span class="store-caret" aria-hidden="true">▾</span>
                    </a>
                    <div class="store-dropdown" role="menu">
                        <a href="shop.html">Shop All <small>Browse everything</small></a>
                        <a href="shop.html#bands">Budget Bands <small>Filter by price</small></a>
                        <a href="gift-cards.html">Gift Cards <small>Perfect gift</small></a>
                    </div>
                </li>

                <li class="store-nav-item" data-dropdown>
                    <a href="blog.html" class="store-nav-link" ${isActive('blog.html')}>
                        Blog <span class="store-caret" aria-hidden="true">▾</span>
                    </a>
                    <div class="store-dropdown" role="menu">
                        <a href="blog.html">All Articles <small>Latest posts</small></a>
                        <a href="about.html">About Us <small>Our story</small></a>
                        <a href="affiliate.html">Affiliate Program <small>Earn rewards</small></a>
                    </div>
                </li>

                <li class="store-nav-item" data-dropdown>
                    <a href="faq.html" class="store-nav-link" ${isActive('faq.html')}>
                        Help <span class="store-caret" aria-hidden="true">▾</span>
                    </a>
                    <div class="store-dropdown" role="menu">
                        <a href="faq.html">FAQ <small>Common questions</small></a>
                        <a href="contact.html">Contact <small>Get in touch</small></a>
                        <a href="shipping.html">Shipping <small>Delivery info</small></a>
                        <a href="returns.html">Returns <small>Return policy</small></a>
                        <a href="size-guide.html">Size Guide <small>Find your fit</small></a>
                        <a href="track-order.html">Track Order <small>Shipping status</small></a>
                        <a href="help-center.html">Help Center <small>Full support hub</small></a>
                    </div>
                </li>
            </ul>
        </nav>
    </header>`;

    /* ── Footer HTML ── */
    const footerHTML = `
    <footer class="site-footer">
        <div class="footer-newsletter">
            <div class="footer-newsletter-inner">
                <div class="footer-newsletter-text">STAY IN THE LOOP — EXCLUSIVE DEALS &amp; NEW ARRIVALS</div>
                <form class="footer-newsletter-form" id="newsletter-form">
                    <input type="email" placeholder="Enter your email address" aria-label="Email for newsletter" required />
                    <button type="submit">SUBSCRIBE</button>
                </form>
            </div>
        </div>

        <div class="footer-top">
            <div class="footer-brand-col">
                <span class="footer-logo-text">TRENDARYO</span>
                <span class="footer-company-name">TRENDARYO LLC</span>
                <div class="footer-address">
                    Al Maabela, Wilayat Al Seeb<br>
                    Muscat Governorate, OMAN
                </div>
                <div class="footer-contact">
                    <strong>Email:</strong> <a href="mailto:admin@trendaryo.com">admin@trendaryo.com</a><br>
                    <strong>Phone:</strong> <a href="tel:+13075334512">+1 (307) 533-4512</a>
                </div>
                <p>Your premium destination for electronics, fashion, and accessories. Experience the future of shopping with our cutting-edge 3D platform.</p>
                <div class="footer-social">
                    <a href="https://www.facebook.com/trendaryo" target="_blank" rel="noopener noreferrer" aria-label="Facebook" title="Facebook">
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 21v-7h2.4l.4-3h-2.8V9.1c0-.9.3-1.5 1.6-1.5h1.3V4.9c-.3 0-1.1-.1-2.1-.1-2.1 0-3.6 1.3-3.6 3.7V11H8.2v3h2.5v7h2.8Z"/></svg>
                    </a>
                    <a href="https://twitter.com/trendaryo" target="_blank" rel="noopener noreferrer" aria-label="Twitter / X" title="Twitter / X">
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M17.7 3h3l-6.6 7.6L21.9 21h-6.1l-4.8-6.3L5.5 21h-3l7.1-8.1L2.3 3h6.2l4.3 5.7L17.7 3Zm-1.1 16.2h1.7L7.6 4.7H5.8l10.8 14.5Z"/></svg>
                    </a>
                    <a href="https://www.instagram.com/trendaryo" target="_blank" rel="noopener noreferrer" aria-label="Instagram" title="Instagram">
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="0.9" fill="currentColor" stroke="none"/></svg>
                    </a>
                    <a href="https://www.linkedin.com/company/trendaryo" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" title="LinkedIn">
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M6.9 8.6H3.6V21h3.3V8.6ZM5.2 3a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8ZM13 8.6H9.8V21H13v-6.5c0-1.7.9-2.6 2.2-2.6 1.2 0 1.9.8 1.9 2.6V21h3.3v-7.2c0-3.2-1.7-5.4-4.4-5.4-1.6 0-2.6.7-3 1.5V8.6Z"/></svg>
                    </a>
                    <a href="https://www.youtube.com/@trendaryo" target="_blank" rel="noopener noreferrer" aria-label="YouTube" title="YouTube">
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12c0 1.6.1 3.2.4 4.8a2.5 2.5 0 0 0 1.8 1.8c1.6.4 7.8.4 7.8.4s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8c.3-1.6.4-3.2.4-4.8 0-1.6-.1-3.2-.4-4.8ZM10 15.2V8.8l5.2 3.2L10 15.2Z"/></svg>
                    </a>
                </div>
            </div>

            <div class="footer-col">
                <h4>Shop</h4>
                <ul>
                    <li><a href="shop.html">All Products</a></li>
                    <li><a href="product.html">Featured Item</a></li>
                    <li><a href="wishlist.html">Wishlist</a></li>
                    <li><a href="compare.html">Compare</a></li>

                    <li><a href="gift-cards.html">Gift Cards</a></li>
                </ul>
            </div>

            <div class="footer-col">
                <h4>Account</h4>
                <ul>
                    <li><a href="account.html">My Account</a></li>
                    <li><a href="orders.html">My Orders</a></li>
                    <li><a href="track-order.html">Track Order</a></li>
                    <li><a href="rewards.html">Rewards</a></li>
                    <li><a href="login.html">Login</a></li>
                    <li><a href="register.html">Register</a></li>
                </ul>
            </div>

            <div class="footer-col">
                <h4>Support</h4>
                <ul>
                    <li><a href="faq.html">FAQ</a></li>
                    <li><a href="contact.html">Contact Us</a></li>
                    <li><a href="shipping.html">Shipping Info</a></li>
                    <li><a href="returns.html">Returns</a></li>
                    <li><a href="refund.html">Refund Policy</a></li>
                    <li><a href="help-center.html">Help Center</a></li>
                </ul>
            </div>

            <div class="footer-col">
                <h4>Company</h4>
                <ul>
                    <li><a href="about.html">About Us</a></li>
                    <li><a href="blog.html">Blog</a></li>
                    <li><a href="affiliate.html">Affiliate Program</a></li>
                    <li><a href="size-guide.html">Size Guide</a></li>
                    <li><a href="privacy.html">Privacy Policy</a></li>
                    <li><a href="terms.html">Terms of Service</a></li>
                </ul>
            </div>
        </div>

        <div class="footer-trust">
            <span class="footer-trust-item">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.7 9a.6.6 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1.2 1.2 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1v7Z"/><path d="m9 12 2 2 4-4"/></svg>
                SSL Secure Checkout
            </span>
            <span class="footer-trust-item">30-Day Returns</span>
            <span class="footer-trust-item">Worldwide Shipping</span>
            <span class="footer-trust-badges">
                <span class="pay-badge">VISA</span>
                <span class="pay-badge">Mastercard</span>
                <span class="pay-badge">PayPal</span>
                <span class="pay-badge">Apple&nbsp;Pay</span>
                <span class="pay-badge">G&nbsp;Pay</span>
            </span>
        </div>

        <div class="footer-bottom">
            <p>&copy; ${new Date().getFullYear()} TRENDARYO LLC. All rights reserved.</p>
            <div class="footer-bottom-links">
                <a href="privacy.html">Privacy</a>
                <a href="terms.html">Terms</a>
                <a href="cookie-policy.html">Cookies</a>
                <a href="sitemap.xml">Sitemap</a>
            </div>
        </div>
    </footer>`;

    /* ── Midnight Luxury 2.0: ensure override layer on every page ── */
    function ensureLuxuryTheme() {
        // Each asset injects independently — a page with the CSS already linked
        // (index.html, shop.html) must still get fonts + cursor trail.
        if (!document.querySelector('link[href*="luxury-final.css"]')) {
            var l = document.createElement('link');
            l.rel = 'stylesheet';
            l.href = 'luxury-final.css';
            document.head.appendChild(l);
        }
        // Premium fonts (Sora + Inter, Orbitron kept for logo only)
        if (!document.querySelector('link[href*="Sora"]')) {
            var f = document.createElement('link');
            f.rel = 'stylesheet';
            f.href = 'https://fonts.googleapis.com/css2?family=Orbitron:wght@700;800;900&family=Sora:wght@500;600;700;800&family=Inter:wght@400;500;600;700&display=swap';
            document.head.appendChild(f);
        }
        // Global glowing cursor trail (desktop only; script self-gates otherwise)
        if (!document.querySelector('script[src*="cursor-particles.js"]')) {
            var c = document.createElement('script');
            c.src = 'cursor-particles.js';
            c.defer = true;
            document.head.appendChild(c);
        }
    }

    /* ── Inject header before body content ── */
    function injectHeader() {
        // Don't inject if already exists (e.g. index.html has its own)
        if (document.getElementById('store-header')) return;
        const wrapper = document.createElement('div');
        wrapper.innerHTML = headerHTML;
        document.body.insertBefore(wrapper.firstElementChild, document.body.firstChild);
    }

    /* ── Inject footer at end of body ── */
    function injectFooter() {
        if (document.querySelector('.site-footer')) return;
        const wrapper = document.createElement('div');
        wrapper.innerHTML = footerHTML;
        document.body.appendChild(wrapper.firstElementChild);
    }

    /* ── Nav interactions ── */
    function initNav() {
        const header = document.getElementById('store-header');
        const mobileToggle = document.getElementById('store-mobile-toggle');
        const dropdownItems = Array.from(document.querySelectorAll('.store-nav-item[data-dropdown]'));

        if (!header) return;

        // Mobile menu toggle
        if (mobileToggle) {
            const iconOpen = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
            const iconClose = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';
            mobileToggle.innerHTML = iconOpen;
            mobileToggle.addEventListener('click', () => {
                const isOpen = header.classList.toggle('is-open');
                mobileToggle.setAttribute('aria-expanded', String(isOpen));
                mobileToggle.innerHTML = isOpen ? iconClose : iconOpen;
                if (!isOpen) dropdownItems.forEach(i => i.classList.remove('is-open'));
            });
        }

        // Mobile dropdown tap-to-open
        dropdownItems.forEach(item => {
            const link = item.querySelector('.store-nav-link');
            if (!link) return;
            link.addEventListener('click', (e) => {
                if (!window.matchMedia('(max-width: 900px)').matches) return;
                if (!item.classList.contains('is-open')) {
                    e.preventDefault();
                    dropdownItems.forEach(i => i.classList.remove('is-open'));
                    item.classList.add('is-open');
                }
            });
        });

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (header.contains(e.target)) return;
            dropdownItems.forEach(i => i.classList.remove('is-open'));
            header.classList.remove('is-open');
            if (mobileToggle) {
                mobileToggle.setAttribute('aria-expanded', 'false');
                const iconOpen = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
                mobileToggle.innerHTML = iconOpen;
            }
        });

        // Scroll: add .scrolled class for enhanced shadow
        window.addEventListener('scroll', () => {
            header.classList.toggle('scrolled', window.scrollY > 40);
        }, { passive: true });
    }

    /* ── Header search ── */
    function initSearch() {
        const input = document.getElementById('header-search-input');
        if (!input) return;
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && input.value.trim()) {
                window.location.href = `shop.html?q=${encodeURIComponent(input.value.trim())}`;
            }
        });
    }

    /* ── Centralized toast — styling lives in shared.css (.trendaryo-toast) ── */
    function showToast(msg) {
        const existing = document.getElementById('theme-toast');
        if (existing) existing.remove();
        const toast = document.createElement('div');
        toast.id = 'theme-toast';
        toast.className = 'trendaryo-toast';
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 2000);
    }

    /* ── Theme switcher (5 curated themes, lives inside account menu) ── */
    function initTheme() {
        const themes = [
            { name: 'Cyber Blue',    bg: 'linear-gradient(180deg,#0a0a2a,#1a1a40)',  accent: '#00f0ff', accent2: '#ff00aa', accent3: '#00ff88' },
            { name: 'Sunset Orange', bg: 'linear-gradient(180deg,#1a0a00,#331400)',  accent: '#ff6b35', accent2: '#ff9f1c', accent3: '#ffbf69' },
            { name: 'Royal Gold',    bg: 'linear-gradient(180deg,#1a1200,#332400)',  accent: '#ffd700', accent2: '#ffaa00', accent3: '#ff8c00' },
            { name: 'Crimson Red',   bg: 'linear-gradient(180deg,#1a0000,#330000)',  accent: '#ff0055', accent2: '#ff3366', accent3: '#ff6699' },
            { name: 'Arctic Ice',    bg: 'linear-gradient(180deg,#0a1a2a,#142840)',  accent: '#00d4ff', accent2: '#66e0ff', accent3: '#99ebff' },
        ];

        let idx = parseInt(localStorage.getItem('trendaryo_theme') || '0');
        if (isNaN(idx) || idx < 0 || idx >= themes.length) idx = 0;

        function paintTheme(t) {
            let bgDiv = document.getElementById('__theme-bg');
            if (!bgDiv) {
                bgDiv = document.createElement('div');
                bgDiv.id = '__theme-bg';
                bgDiv.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:-2;pointer-events:none;transition:background 0.6s ease;';
                document.body.insertBefore(bgDiv, document.body.firstChild);
            }
            window.__themeBgDiv = bgDiv;
            bgDiv.style.background = t.bg;
            document.documentElement.style.setProperty('--accent', t.accent);
            document.documentElement.style.setProperty('--accent-2', t.accent2);
            document.documentElement.style.setProperty('--accent-3', t.accent3);
            if (window.unifiedBackground?.updateThemeColors) window.unifiedBackground.updateThemeColors(t);
            if (typeof updateParticlesTheme === 'function') updateParticlesTheme(t);
        }

        function updateThemeLabel() {
            const label = document.getElementById('theme-label');
            if (label) label.textContent = themes[idx].name;
            const headerBtn = document.getElementById('header-theme-btn');
            if (headerBtn) headerBtn.title = 'Theme: ' + themes[idx].name;
        }

        // Delegated binding: the toggle lives inside the account dropdown,
        // whose content is re-rendered on login/logout.
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-theme-toggle]');
            if (!btn) return;
            idx = (idx + 1) % themes.length;
            localStorage.setItem('trendaryo_theme', idx);
            paintTheme(themes[idx]);
            updateThemeLabel();
            showToast(themes[idx].name);
        });

        // Apply saved theme silently on first load (no toast spam)
        paintTheme(themes[idx]);
        // Refresh the label once the account menu has rendered
        setTimeout(updateThemeLabel, 100);
        window.addEventListener('storage', updateThemeLabel);
    }

    /* ── Cart badge from localStorage ── */
    function initCartBadge() {
        const badge = document.getElementById('cart-badge');
        if (!badge) return;
        try {
            const cart = JSON.parse(localStorage.getItem('trendaryo_cart') || '[]');
            const count = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
            if (count > 0) {
                badge.textContent = count > 99 ? '99+' : count;
                badge.style.display = 'flex';
            }
        } catch (e) { /* ignore */ }
    }

    /* ── Account Menu with Login/Logout ── */
    function initAccountMenu() {
        const accountBtn = document.getElementById('account-btn');
        const accountDropdown = document.getElementById('account-dropdown');
        
        if (!accountBtn || !accountDropdown) return;

        // Check if user is logged in
        function updateAccountMenu() {
            const userId = localStorage.getItem('user_id');
            const userStr = localStorage.getItem('user');
            
            if (userId && userStr) {
                // User is logged in
                try {
                    const user = JSON.parse(userStr);
                    const userName = user.name || user.firstName || 'User';
                    
                    accountDropdown.innerHTML = `
                        <div style="padding: 15px; border-bottom: 1px solid rgba(255,255,255,0.1);">
                            <div style="font-weight: 700; color: var(--accent); margin-bottom: 5px;">Hello, ${userName}!</div>
                            <div style="font-size: 0.85em; color: rgba(255,255,255,0.75);">${user.email || ''}</div>
                        </div>
                        <a href="account.html" class="account-dropdown-item">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>
                            My Dashboard
                        </a>
                        <a href="profile.html" class="account-dropdown-item">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>
                            Profile Settings
                        </a>
                        <a href="orders.html" class="account-dropdown-item">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="M3.3 7 12 12l8.7-5"/><path d="M12 22V12"/></svg>
                            My Orders
                        </a>
                        <a href="wishlist.html" class="account-dropdown-item">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                            My Wishlist
                        </a>
                        <div class="account-dropdown-sep"></div>
                        <button onclick="handleLogout()" class="account-dropdown-item account-dropdown-logout">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>
                            Logout
                        </button>
                    `;
                } catch (e) {
                    console.error('Error parsing user data:', e);
                    showGuestMenu();
                }
            } else {
                // User is not logged in
                showGuestMenu();
            }
        }

        function showGuestMenu() {
            accountDropdown.innerHTML = `
                <div style="padding: 15px; border-bottom: 1px solid rgba(255,255,255,0.1);">
                    <div style="font-weight: 700; color: var(--accent); margin-bottom: 5px;">Welcome!</div>
                    <div style="font-size: 0.85em; color: rgba(255,255,255,0.75);">Sign in to access your account</div>
                </div>
                <a href="login.html" class="account-dropdown-item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
                    Login
                </a>
                <a href="register.html" class="account-dropdown-item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/></svg>
                    Create Account
                </a>
                <div class="account-dropdown-sep"></div>
                <a href="track-order.html" class="account-dropdown-item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                    Track Order
                </a>
                <a href="help-center.html" class="account-dropdown-item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
                    Help Center
                </a>
            `;
        }

        // Toggle dropdown
        accountBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = accountDropdown.classList.toggle('show');
            accountBtn.setAttribute('aria-expanded', String(isOpen));
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!accountDropdown.contains(e.target) && e.target !== accountBtn) {
                accountDropdown.classList.remove('show');
                accountBtn.setAttribute('aria-expanded', 'false');
            }
        });

        // Initial update
        updateAccountMenu();

        // Listen for storage changes (login/logout from other tabs)
        window.addEventListener('storage', (e) => {
            if (e.key === 'user_id' || e.key === 'user') {
                updateAccountMenu();
            }
        });

        // Make updateAccountMenu available globally for manual refresh
        window.updateAccountMenu = updateAccountMenu;
    }

    // Global logout function
    window.handleLogout = async function() {
        if (!confirm('👋 Are you sure you want to logout?')) {
            return;
        }

        try {
            // Clear Firebase auth if available
            if (window.FirebaseAuth && typeof window.FirebaseAuth.logout === 'function') {
                await window.FirebaseAuth.logout();
            }
        } catch (e) {
            console.error('Firebase logout error:', e);
        }

        // Clear all auth data
        localStorage.removeItem('user_id');
        localStorage.removeItem('user');
        localStorage.removeItem('auth_token');
        localStorage.removeItem('token');
        localStorage.removeItem('accessToken');

        // Show success message
        alert('✅ Logged out successfully!');

        // Redirect to home
        window.location.href = 'index.html';
    };

    /* ── Preloader hide ──
       Hide on first paint instead of waiting for `load`.
       `load` waits for Firebase, GSAP, fonts and the 3D engine —
       forcing a landing-page visitor to stare at a black screen.
       A short 320ms floor avoids a jarring flash, nothing more. */
    function initPreloader() {
        let hidden = false;
        function hide() {
            if (hidden) return;
            hidden = true;
            const p = document.getElementById('preloader');
            if (p) p.classList.add('hidden');
        }
        function scheduleHide() {
            requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(hide, 320)));
        }
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', scheduleHide);
        } else {
            scheduleHide();
        }
        setTimeout(hide, 2200); // failsafe only
    }

    /* ── Newsletter form — real wiring (stored locally + success state) ── */
    function initNewsletter() {
        const form = document.getElementById('newsletter-form');
        if (!form) return;
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const input = form.querySelector('input[type="email"]');
            const btn = form.querySelector('button');
            const email = input ? input.value.trim() : '';
            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                if (input) input.focus();
                return;
            }
            try {
                const list = JSON.parse(localStorage.getItem('trendaryo_newsletter') || '[]');
                if (!list.includes(email)) list.push(email);
                localStorage.setItem('trendaryo_newsletter', JSON.stringify(list));
            } catch (err) { /* storage unavailable — still show success */ }
            if (input) input.value = '';
            if (btn) {
                btn.textContent = 'SUBSCRIBED';
                btn.classList.add('is-success');
                setTimeout(() => { btn.textContent = 'SUBSCRIBE'; btn.classList.remove('is-success'); }, 3000);
            }
            showToast('You are on the list — welcome aboard!');
        });
    }

    /* ── Announcement bar — rotating messages + promo countdown ── */
    function initAnnouncement() {
        const msg = document.getElementById('announce-msg');
        const countdown = document.getElementById('announce-countdown');
        if (!msg) return;

        /* Admin override: a saved announcement replaces the rotation */
        let customMsg = null;
        try { customMsg = localStorage.getItem('trendaryo_announcement'); } catch (e) {}
        if (customMsg) {
            msg.textContent = customMsg;
            if (countdown) countdown.style.display = 'none';
            return;
        }        const messages = [
            'FREE SHIPPING ON ORDERS OVER $50',
            'USE CODE WELCOME10 FOR 10% OFF YOUR FIRST ORDER',
            'NEW ARRIVALS — FRESH DROPS EVERY WEEK',
        ];
        let mi = 0;

        function renderCountdown() {
            if (!countdown) return;
            const now = new Date();
            const end = new Date(now);
            end.setHours(23, 59, 59, 999);
            let diff = Math.max(0, Math.floor((end - now) / 1000));
            const h = String(Math.floor(diff / 3600)).padStart(2, '0');
            const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
            const s = String(diff % 60).padStart(2, '0');
            countdown.textContent = ` — ENDS IN ${h}:${m}:${s}`;
        }

        // Rotate messages with a soft fade every 6s; keep the countdown visible on the promo message
        setInterval(() => {
            mi = (mi + 1) % messages.length;
            msg.style.opacity = '0';
            setTimeout(() => {
                msg.textContent = messages[mi];
                const isPromo = mi === 1;
                if (countdown) countdown.style.display = isPromo ? 'inline' : 'none';
                msg.style.opacity = '1';
            }, 300);
        }, 6000);

        renderCountdown();
        setInterval(renderCountdown, 1000);
    }

    /* ── Favicon — PNG fallback for browsers without SVG favicon support ── */
    function initFavicon() {
        const hasPng = document.querySelector('link[rel="icon"][type="image/png"]');
        if (hasPng) return;
        const link = document.createElement('link');
        link.rel = 'icon';
        link.type = 'image/png';
        link.href = 'assets/favicon-64.png';
        document.head.appendChild(link);
    }

    /* ── In-page anchors: smooth only for the click, native (instant) for
       wheel/trackpad. This is what removes the "stuck" feeling while keeping
       #vortex / #pipeline jumps pleasant. ── */
    function initSmoothAnchors() {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        document.addEventListener('click', (e) => {
            const a = e.target.closest('a[href^="#"]');
            if (!a) return;
            const id = a.getAttribute('href');
            if (id.length < 2) return;
            const target = document.querySelector(id);
            if (!target) return;
            e.preventDefault();
            document.documentElement.classList.add('smooth-anchors');
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            setTimeout(() => document.documentElement.classList.remove('smooth-anchors'), 900);
            try { history.replaceState(null, '', id); } catch (err) {}
        });
    }

    /* ── Init everything ── */
    function init() {
        ensureLuxuryTheme();
        injectHeader();
        injectFooter();
        initSmoothAnchors();
        initNav();
        initSearch();
        initTheme();
        initCartBadge();
        initAccountMenu();
        initPreloader();
        initNewsletter();
        initAnnouncement();
        initBackButton();
        initFavicon();
    }

    /* ── Public API for page-level scripts (homepage add-to-cart feedback) ── */
    /* ─ Back button — anchored top-left, directly beneath the fixed header ──
       Standard, conventional placement — it used to float over the bottom-left
       corner of the page, which read as illogical. History-aware: on the home
       page it only appears after an internal navigation. */
    function initBackButton() {
        if (document.getElementById('tlBackBtn')) return;
        var path = location.pathname.split('/').pop().toLowerCase();
        var isHome = (!path || path === 'index.html');
        var sameOriginRef = false;
        try {
            if (document.referrer) {
                sameOriginRef = new URL(document.referrer).host === location.host;
            }
        } catch (e) { sameOriginRef = false; }
        if (isHome && !sameOriginRef) return;

        if (!document.getElementById('tlBackFabStyle')) {
            var styleEl = document.createElement('style');
            styleEl.id = 'tlBackFabStyle';
            styleEl.textContent = '.tl-back-fab{position:fixed;top:130px;left:18px;z-index:9000;display:inline-flex;align-items:center;gap:6px;padding:5px 13px 5px 9px;line-height:1;border-radius:999px;background:rgba(10,10,26,0.8);border:1px solid rgba(255,255,255,0.18);color:#fff;font-family:Orbitron,sans-serif;font-size:0.6rem;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;cursor:pointer;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 8px 26px rgba(0,0,0,0.42);transition:transform 0.2s ease,border-color 0.2s ease,background 0.2s ease,box-shadow 0.2s ease;text-decoration:none;}'
                + '.tl-back-fab:hover{transform:translateX(-2px);border-color:rgba(0,240,255,0.55);background:rgba(0,240,255,0.14);box-shadow:0 10px 30px rgba(0,240,255,0.22);}'
                + '.tl-back-fab:active{transform:translateX(-1px) scale(0.98);}'
                + '.tl-back-fab svg{width:14px;height:14px;color:#00f0ff;flex:0 0 14px;}'
                + '.tl-back-fab:focus-visible{outline:2px solid #00f0ff;outline-offset:2px;}'
                + '@media(max-width:640px){.tl-back-fab{padding:4px 11px 4px 8px;font-size:0.55rem;letter-spacing:1.2px;}.tl-back-fab svg{width:12px;height:12px;flex:0 0 12px;}}'
                + '@media print{.tl-back-fab{display:none;}}'
                + '@media(prefers-reduced-motion:reduce){.tl-back-fab{transition:none;}}';
            document.head.appendChild(styleEl);
        }

        var btn = document.createElement('button');
        btn.id = 'tlBackBtn';
        btn.type = 'button';
        btn.className = 'tl-back-fab';
        btn.setAttribute('aria-label', 'Go back to the previous page');
        btn.title = 'Back';
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg><span>Back</span>';

        btn.addEventListener('click', function () {
            if (sameOriginRef && window.history.length > 1) {
                window.history.back();
            } else {
                window.location.href = 'index.html';
            }
        });

        /* Keep the button tucked directly under the fixed header, aligned with
           the header's left content edge so it reads as the page's back control. */
        function anchorToHeader() {
            var header = document.getElementById('store-header');
            var top = 18, left = 18;
            if (header) {
                var hRect = header.getBoundingClientRect();
                if (hRect.height) {
                    top = Math.round(hRect.height + 5);
                    var menuOpen = window.innerWidth <= 900 && header.classList.contains('is-open');
                    btn.style.display = menuOpen ? 'none' : '';
                    var inner = header.querySelector('.store-header-inner');
                    if (inner) {
                        var iRect = inner.getBoundingClientRect();
                        var padLeft = parseFloat(window.getComputedStyle(inner).paddingLeft) || 0;
                        if (iRect.width) left = Math.round(iRect.left + padLeft);
                    }
                }
            }
            btn.style.top = top + 'px';
            btn.style.left = Math.max(12, left) + 'px';
        }

        document.body.appendChild(btn);
        anchorToHeader();
        window.addEventListener('resize', anchorToHeader);
        window.addEventListener('load', anchorToHeader);
        var backHeaderEl = document.getElementById('store-header');
        if (backHeaderEl && window.ResizeObserver) {
            try { new ResizeObserver(anchorToHeader).observe(backHeaderEl); } catch (err) { /* unsupported */ }
        }
    }
    window.trendaryoToast = showToast;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
