(function() {
    'use strict';

    var currentStep = 1;
    var cart = [];
    var stripe = null;
    var cardElement = null;
    var stripeState = 'loading';
    var cardComplete = false;
    var stripeInitStarted = false;
    var checkoutSessionError = null;
    var checkoutSessionReady;
    var currentQuote = null;
    var currentQuoteKey = '';
    var quoteSequence = 0;
    var quotePending = false;
    var appliedCoupon = null;
    var completedPayment = null;
    var pendingCardAttempt = false;
    var isSubmitting = false;
    var checkoutInitialized = false;

    function setCheckoutFeedback(message, type) {
        var feedback = document.getElementById('checkout-feedback');
        if (!feedback) return;
        feedback.textContent = message || '';
        feedback.className = 'checkout-feedback' + (type ? ' ' + type : '');
        // The feedback element sits at the TOP of the checkout card while the
        // Place Order button is at the bottom — scroll it into view so the user
        // actually sees why their click did (or did not) go through.
        if (message && typeof feedback.scrollIntoView === 'function') {
            try { feedback.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
            catch (e) { feedback.scrollIntoView(); }
        }
    }

    function ensureCheckoutSession() {
        if (typeof initFirebase !== 'function') {
            return Promise.reject(new Error('Secure checkout is unavailable.'));
        }
        return Promise.resolve(initFirebase()).then(function(firebaseResult) {
            var auth = firebaseResult && firebaseResult.auth;
            if (!auth) throw new Error('Checkout could not connect to the authentication service.');
            if (typeof auth.signInAnonymously !== 'function') {
                throw new Error('Guest checkout is unavailable. Please sign in and try again.');
            }
            if (typeof auth.onAuthStateChanged !== 'function') {
                if (auth.currentUser) return auth.currentUser;
                return auth.signInAnonymously().then(function(result) { return result.user; });
            }
            return new Promise(function(resolve, reject) {
                var unsubscribe = auth.onAuthStateChanged(function(user) {
                    unsubscribe();
                    if (user) {
                        resolve(user);
                        return;
                    }
                    auth.signInAnonymously().then(function(result) {
                        resolve(result.user);
                    }).catch(reject);
                }, reject);
            });
        });
    }

    function rememberGuestUid(user) {
        if (!user) return;
        try {
            if (user.isAnonymous) {
                var existingUid = localStorage.getItem('trendaryo_anon_uid');
                if (existingUid !== user.uid) localStorage.setItem('trendaryo_anon_uid', user.uid);
            } else {
                localStorage.removeItem('trendaryo_anon_uid');
            }
        } catch (e) { /* storage may be blocked */ }
    }

    checkoutSessionReady = ensureCheckoutSession().then(function(user) {
        rememberGuestUid(user);
        return user;
    }).catch(function(error) {
        checkoutSessionError = error;
        console.error('[Checkout] Secure session failed:', error);
    });

    function initializeCheckout() {
        if (checkoutInitialized) return;
        checkoutInitialized = true;
        loadCart();
        var hasPendingPayment = restorePendingCheckout();
        initStripe();
        togglePayment();

        var country = document.getElementById('country');
        if (country) country.addEventListener('change', function() {
            updatePostalLabel();
            refreshQuote(appliedCoupon && appliedCoupon.code).catch(function() {});
        });
        var region = document.getElementById('state');
        if (region) region.addEventListener('change', function() {
            refreshQuote(appliedCoupon && appliedCoupon.code).catch(function() {});
        });

        var couponInput = document.getElementById('coupon-code');
        if (couponInput) couponInput.addEventListener('keydown', function(event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                applyCoupon();
            }
        });

        attachFormHandler();
        if (cart.length && !hasPendingPayment) refreshQuote().catch(function() {});
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeCheckout, { once: true });
    } else {
        initializeCheckout();
    }

    function initStripe() {
        if (stripeInitStarted) return;
        var start = function() {
            if (stripeInitStarted) return;
            stripeInitStarted = true;
            try {
                var key = window.TrendaryoConfig && window.TrendaryoConfig.stripe &&
                    window.TrendaryoConfig.stripe.publishableKey;
                if (!key || typeof Stripe === 'undefined') {
                    if (!key) {
                        console.warn('[Checkout] Stripe publishable key is empty. Set STRIPE_PUBLISHABLE_KEY in the API environment (local: .env via `vercel dev`; live: Vercel dashboard env vars) and redeploy.');
                    } else {
                        console.warn('[Checkout] Stripe.js (https://js.stripe.com/v3/) did not load — check network/ad-blocker/CSP.');
                    }
                    stripeUnavailable('Card payments are not configured. Choose another available payment method.');
                    return;
                }

                stripe = Stripe(key);
                var elements = stripe.elements({
                    appearance: {
                        theme: 'night',
                        variables: {
                            colorPrimary: '#00f0ff',
                            colorBackground: '#0a0a2a',
                            colorText: '#ffffff',
                            colorDanger: '#ff4444',
                            borderRadius: '12px',
                            fontFamily: "'Rajdhani', sans-serif"
                        }
                    }
                });
                cardElement = elements.create('card', {
                    style: {
                        base: {
                            fontSize: '16px',
                            color: '#ffffff',
                            '::placeholder': { color: 'rgba(255,255,255,0.4)' }
                        },
                        invalid: { color: '#ff4444' }
                    }
                });
                cardElement.on('change', function(event) {
                    cardComplete = event.complete;
                    var errors = document.getElementById('stripe-card-errors');
                    if (!errors) return;
                    errors.textContent = event.error ? event.error.message : '';
                    errors.style.display = event.error ? 'block' : 'none';
                });
                cardElement.mount('#stripe-card-element');
                stripeState = 'ready';
                updatePaymentAvailability();
            } catch (error) {
                console.error('[Checkout] Stripe initialization failed:', error);
                stripeUnavailable('Card payments could not be initialized. Choose another available payment method.');
            }
        };

        function scheduleRetry(attempts) {
            if (stripeInitStarted) return;
            if (attempts >= 25) {
                stripeUnavailable('Card payments could not be loaded. Choose another available payment method.');
                return;
            }
            var delay = Math.min(1000 * Math.pow(1.5, attempts), 10000);
            setTimeout(function() {
                if (stripeInitStarted) return;
                // The config promise never silently fails: config.js always sets
                // _ready (true even without a key) once the fetch settles, so we
                // poll until it does instead of falling over after a fixed 3s.
                if (window.TrendaryoConfig && window.TrendaryoConfig._ready) {
                    start();
                    return;
                }
                scheduleRetry(attempts + 1);
            }, delay);
        }

        if (window.TrendaryoConfig && !window.TrendaryoConfig._ready) {
            window.addEventListener('trendaryo:config', start, { once: true });
            scheduleRetry(0);
            return;
        }
        start();
    }

    function stripeUnavailable(message) {
        stripeState = 'unavailable';
        updatePaymentAvailability();
        var select = document.getElementById('payment-method');
        var help = document.getElementById('payment-method-help');
        if (help) {
            var noMethodsAvailable = select &&
                select.querySelector('option[value="cod"]').disabled;
            help.textContent = noMethodsAvailable
                ? 'No payment methods are currently available. Please contact support.'
                : message;
            help.className = 'checkout-feedback error';
        }
    }

    function validateShipping() {
        var requiredIds = ['firstName', 'lastName', 'email', 'phone', 'address', 'city', 'state', 'zip', 'country'];
        var firstInvalid = null;
        var errors = [];

        requiredIds.forEach(function(id) {
            var field = document.getElementById(id);
            var value = field ? field.value.trim() : '';
            if (!field || !value) {
                errors.push('Complete all required shipping fields.');
                if (field) {
                    field.classList.add('error');
                    firstInvalid = firstInvalid || field;
                }
            } else {
                field.classList.remove('error');
            }
        });

        var email = document.getElementById('email');
        if (email && email.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
            errors.push('Enter a valid email address.');
            email.classList.add('error');
            firstInvalid = firstInvalid || email;
        }

        var phone = document.getElementById('phone');
        if (phone && phone.value.trim()) {
            var digits = phone.value.replace(/\D/g, '');
            if (!/^[\d\s()+.-]+$/.test(phone.value) || digits.length < 7 || digits.length > 15) {
                errors.push('Enter a valid phone number.');
                phone.classList.add('error');
                firstInvalid = firstInvalid || phone;
            }
        }

        var postal = document.getElementById('zip');
        var country = document.getElementById('country');
        if (postal && postal.value.trim() && country) {
            var postalPatterns = {
                US: /^\d{5}(?:-\d{4})?$/,
                CA: /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/,
                GB: /^[A-Za-z]{1,2}\d[A-Za-z\d]?\s?\d[A-Za-z]{2}$/
            };
            var pattern = postalPatterns[country.value];
            if (pattern && !pattern.test(postal.value.trim())) {
                errors.push('Enter a valid postal code for the selected country.');
                postal.classList.add('error');
                firstInvalid = firstInvalid || postal;
            }
        }

        if (errors.length) {
            setCheckoutFeedback(errors[0], 'error');
            if (firstInvalid) firstInvalid.focus();
            return false;
        }
        setCheckoutFeedback('', '');
        return true;
    }

    function handleContinueToPayment() {
        if (currentStep === 1 && !validateShipping()) return;
        moveToNextStep();
    }

    function validatePayment() {
        if (completedPayment || pendingCardAttempt) return true;
        var method = document.getElementById('payment-method').value;
        if (method === 'card' && stripeState !== 'ready') {
            setCheckoutFeedback('Card payments are unavailable. Select another payment method or try again later.', 'error');
            return false;
        }
        if (method === 'card' && !cardComplete) {
            var errors = document.getElementById('stripe-card-errors');
            if (errors) {
                errors.textContent = 'Enter valid card details to continue.';
                errors.style.display = 'block';
            }
            return false;
        }
        return true;
    }

    function moveToNextStep() {
        if (currentStep >= 3) return;
        if (currentStep === 2 && !validatePayment()) return;

        var currentSection = document.querySelector('.checkout-form-section[data-section="' + currentStep + '"]');
        var currentIndicator = document.querySelector('.checkout-step[data-step="' + currentStep + '"]');
        if (currentSection) currentSection.classList.remove('active');
        if (currentIndicator) {
            currentIndicator.classList.remove('active');
            currentIndicator.classList.add('completed');
            currentIndicator.removeAttribute('aria-current');
        }

        currentStep++;
        var nextSection = document.querySelector('.checkout-form-section[data-section="' + currentStep + '"]');
        var nextIndicator = document.querySelector('.checkout-step[data-step="' + currentStep + '"]');
        if (nextSection) nextSection.classList.add('active');
        if (nextIndicator) {
            nextIndicator.classList.add('active');
            nextIndicator.setAttribute('aria-current', 'step');
        }
        if (currentStep === 3) showReview();
    }

    function loadCart() {
        var rawCart;
        var products;
        try {
            rawCart = JSON.parse(localStorage.getItem('trendaryo_cart') || '[]');
            products = JSON.parse(localStorage.getItem('trendaryo_cart_products') || '{}');
        } catch (error) {
            console.error('[Checkout] Could not read saved cart:', error);
            setCheckoutFeedback('Your saved cart could not be read. Return to your cart and try again.', 'error');
            rawCart = [];
            products = {};
        }

        if (!Array.isArray(rawCart)) rawCart = [];
        rawCart = rawCart.filter(function(item) {
            return item != null && (typeof item === 'number' || item.id != null);
        });
        if (typeof CartManager !== 'undefined') rawCart = CartManager.normalizeCart(rawCart);
        cart = rawCart.map(function(item) {
            var id = item && item.id != null ? String(item.id) : '';
            var quantity = Number(item && item.quantity);
            if (!id || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) return null;
            var product = products[id] || {};
            return {
                id: id,
                quantity: quantity,
                name: String(product.name || 'Product'),
                price: Number(product.price) || 0,
                image: String(product.image || product.emoji || 'assets/placeholder.jpg')
            };
        }).filter(Boolean);

        renderCart();
        updateOrderSummary();
        updateSubmitButton();
        pruneUnavailableItems();
        return cart;
    }

    /* Drop cart lines whose product id does not exist in the current catalogue
       (e.g. saved before the Firestore reseed, or numeric demo ids) so the
       checkout quote and order pricing cannot fail with a 'product missing'
       error. Surfaces a single, clear notice for what was removed. */
    function pruneUnavailableItems() {
        if (!cart.length || !window.TrendaryoProducts || !window.TrendaryoProducts.all) return;
        // Only prune against the authoritative backend catalogue. During the
        // window where products-data.js still serves the built-in demo list
        // (before backend-bridge.js has hydrated the server copy), pruning here
        // would delete real, server-side cart entries for no reason.
        if (!window.__CATALOG_IS_BACKEND__) return;
        var knownIds = {};
        window.TrendaryoProducts.all().forEach(function(p) {
            knownIds[String(p.id)] = true;
        });
        var valid = cart.filter(function(item) { return knownIds[String(item.id)]; });
        var removed = cart.filter(function(item) { return !knownIds[String(item.id)]; });
        if (!removed.length) return;
        cart = valid;
        removed.forEach(function(item) {
            if (typeof CartManager !== 'undefined') {
                try { CartManager.removeItem(item.id); } catch (e) { /* ignore */ }
            }
        });
        try {
            var productsMeta = JSON.parse(localStorage.getItem('trendaryo_cart_products') || '{}');
            removed.forEach(function(item) { delete productsMeta[item.id]; });
            localStorage.setItem('trendaryo_cart_products', JSON.stringify(productsMeta));
        } catch (e) { /* ignore */ }
        renderCart();
        updateOrderSummary();
        updateSubmitButton();
        setCheckoutFeedback(
            removed.length + ' item(s) in your cart are no longer available and were removed. Please review your order.',
            'error'
        );
        if (!cart.length) setCheckoutFeedback('Your cart is empty. Add items before checkout.', 'error');
    }

    function renderCart() {
        var container = document.getElementById('cart-items');
        if (!container) return;
        container.replaceChildren();
        if (!cart.length) {
            var emptyMessage = document.createElement('p');
            emptyMessage.style.cssText = 'color:rgba(255,255,255,0.5);text-align:center;padding:2rem;';
            emptyMessage.append('Your cart is empty. ');
            var shopLink = document.createElement('a');
            shopLink.href = 'shop.html';
            shopLink.style.color = 'var(--accent)';
            shopLink.textContent = 'Continue shopping';
            emptyMessage.appendChild(shopLink);
            container.appendChild(emptyMessage);
            return;
        }

        cart.forEach(function(item) {
            var row = document.createElement('div');
            row.className = 'checkout-cart-item';
            var image = document.createElement('img');
            image.src = item.image;
            image.alt = item.name;
            image.onerror = function() { image.src = 'assets/placeholder.jpg'; };

            var info = document.createElement('div');
            info.className = 'checkout-cart-item-info';
            var name = document.createElement('div');
            name.className = 'checkout-cart-item-name';
            name.textContent = item.name;
            var quantity = document.createElement('div');
            quantity.className = 'checkout-cart-item-qty';
            quantity.textContent = 'Qty: ' + item.quantity;
            var price = document.createElement('div');
            price.className = 'checkout-cart-item-price';
            price.textContent = formatMoney(item.price * item.quantity);
            info.append(name, quantity, price);
            row.append(image, info);
            container.appendChild(row);
        });
    }

    function getOrderItems() {
        return cart.map(function(item) {
            return { productId: String(item.id), quantity: item.quantity };
        });
    }

    function quoteKey(items, couponCode) {
        return JSON.stringify({ items: items, couponCode: couponCode || null });
    }

    function quoteRequestKey(items, couponCode) {
        return JSON.stringify({
            items: items,
            couponCode: couponCode || null,
            country: document.getElementById('country') && document.getElementById('country').value || 'US',
            region: document.getElementById('state') && document.getElementById('state').value.trim().toUpperCase() || ''
        });
    }

    function checkoutAttemptFingerprint(items, couponCode) {
        return quoteKey(items, couponCode) + '|' + JSON.stringify(currentQuote && currentQuote.breakdown || {});
    }

    function getShippingFormValues() {
        var values = {};
        ['firstName', 'lastName', 'email', 'phone', 'address', 'city', 'state', 'zip', 'country'].forEach(function(id) {
            var field = document.getElementById(id);
            values[id] = field ? field.value : '';
        });
        return values;
    }

    function getCheckoutRequestId(fingerprint, items, couponCode) {
        var key = 'trendaryo_checkout_attempt';
        try {
            var saved = JSON.parse(localStorage.getItem(key) || 'null');
            if (saved && saved.fingerprint === fingerprint && saved.id) {
                persistCheckoutAttempt({ items: items, couponCode: couponCode || null, shippingAddress: getShippingAddress(), formValues: getShippingFormValues(), quote: currentQuote });
                return saved.id;
            }
            var id;
            if (window.crypto && typeof window.crypto.randomUUID === 'function') {
                id = window.crypto.randomUUID();
            } else if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
                var randomBytes = new Uint8Array(16);
                window.crypto.getRandomValues(randomBytes);
                id = 'checkout_' + Array.from(randomBytes).map(function(byte) { return byte.toString(16).padStart(2, '0'); }).join('');
            } else {
                throw new Error('A secure random generator is unavailable.');
            }
            localStorage.setItem(key, JSON.stringify({ fingerprint: fingerprint, id: id, items: items, couponCode: couponCode || null, shippingAddress: getShippingAddress(), formValues: getShippingFormValues(), quote: currentQuote }));
            return id;
        } catch (error) {
            throw new Error('Secure checkout retry protection is unavailable. Enable browser storage and try again.');
        }
    }

    function clearCheckoutAttempt() {
        try { localStorage.removeItem('trendaryo_checkout_attempt'); } catch (error) { /* storage may be blocked */ }
    }

    /* Best-effort void of a Stripe PaymentIntent whose checkout was abandoned
       (price change / card failure). Silently ignored when the API or auth is
       unavailable; the server also never charges an unconfirmed intent. */
    function cancelStaleIntent(paymentIntentId) {
        if (!paymentIntentId || typeof API === 'undefined' || typeof API.cancelPaymentIntent !== 'function') return;
        API.cancelPaymentIntent(paymentIntentId).catch(function(error) {
            console.warn('[Checkout] Could not cancel stale payment intent:', error && error.message);
        });
    }

    function persistCheckoutAttempt(patch) {
        try {
            var saved = JSON.parse(localStorage.getItem('trendaryo_checkout_attempt') || 'null') || {};
            localStorage.setItem('trendaryo_checkout_attempt', JSON.stringify(Object.assign(saved, patch)));
        } catch (error) { /* retry still uses the in-memory payment state */ }
    }

    function restorePendingCheckout() {
        var saved;
        try { saved = JSON.parse(localStorage.getItem('trendaryo_checkout_attempt') || 'null'); } catch (error) { return false; }
        if (!saved || !saved.intentRequested || !saved.id || !saved.shippingAddress || !saved.quote) return false;
        var address = saved.shippingAddress;
        var values = saved.formValues || {
            firstName: address.fullName ? address.fullName.split(' ')[0] : '',
            lastName: address.fullName ? address.fullName.split(' ').slice(1).join(' ') : '',
            email: address.email,
            phone: address.phone,
            address: address.street,
            city: address.city,
            state: address.state,
            zip: address.zipCode,
            country: address.country
        };
        Object.keys(values).forEach(function(id) {
            var field = document.getElementById(id);
            if (field && values[id] != null) field.value = values[id];
        });
        var couponInput = document.getElementById('coupon-code');
        if (couponInput) couponInput.value = saved.couponCode || '';
        appliedCoupon = saved.couponCode && saved.quote.coupon ? saved.quote.coupon : null;
        currentQuote = saved.quote;
        if (Array.isArray(saved.quote.lineItems)) {
            cart = saved.quote.lineItems.map(function(line) {
                return { id: String(line.productId), quantity: Number(line.quantity), name: String(line.name || 'Product'), price: Number(line.price), image: String(line.image || 'assets/placeholder.jpg') };
            });
        }
        // Derive the freshness key from the restored authoritative quote lines
        // AFTER the cart is restored, so the restored order is not treated as
        // stale/dead on arrival (the old key was computed from the pre-restore
        // cart, which could permanently lock the Place Order button).
        currentQuoteKey = quoteRequestKey(getOrderItems(), appliedCoupon && appliedCoupon.code);
        if (saved.paid && saved.paymentIntentId) {
            completedPayment = { id: saved.paymentIntentId, fingerprint: saved.fingerprint, checkoutRequestId: saved.id };
        }
        pendingCardAttempt = true;
        renderCart();
        updateOrderSummary();
        updatePaymentAvailability();
        updateCouponControls();
        lockShippingFields(true);
        updateSubmitButton();
        setCheckoutFeedback('Restored your pending payment. Continue checkout to safely finish the same order.', 'success');
        return true;
    }

    function lockShippingFields(locked) {
        ['firstName', 'lastName', 'email', 'phone', 'address', 'city', 'state', 'zip', 'country']
            .forEach(function(id) {
                var field = document.getElementById(id);
                if (field) field.disabled = Boolean(locked);
            });
    }

    async function refreshQuote(couponCode) {
        var items = getOrderItems();
        if (!items.length) throw new Error('Your cart is empty.');
        var key = quoteRequestKey(items, couponCode);
        var sequence = ++quoteSequence;
        quotePending = true;
        updateSubmitButton();

        try {
            await checkoutSessionReady;
            if (checkoutSessionError) throw checkoutSessionError;
            if (typeof API === 'undefined' || typeof API.getCheckoutQuote !== 'function') {
                throw new Error('Checkout pricing is unavailable. Please try again later.');
            }

            var response = await API.getCheckoutQuote(items, couponCode || null, getShippingAddress());
            if (sequence !== quoteSequence) return null;
            if (!response || !response.data || !response.data.breakdown || !Array.isArray(response.data.lineItems)) {
                throw new Error('The store could not calculate your order total.');
            }
            currentQuote = response.data;
            currentQuoteKey = key;
            cart = currentQuote.lineItems.map(function(line) {
                return {
                    id: String(line.productId),
                    quantity: Number(line.quantity),
                    name: String(line.name || 'Product'),
                    price: Number(line.price),
                    image: String(line.image || 'assets/placeholder.jpg')
                };
            });
            updatePaymentAvailability(currentQuote.codEnabled);
            renderCart();
            updateOrderSummary();
            setCheckoutFeedback('', '');
            return currentQuote;
        } catch (error) {
            if (sequence === quoteSequence) {
                console.error('[Checkout] Could not get an authoritative quote:', error);
                setCheckoutFeedback(error.message || 'Could not calculate your order total.', 'error');
            }
            throw error;
        } finally {
            if (sequence === quoteSequence) {
                quotePending = false;
                updateSubmitButton();
            }
        }
    }

    function formatMoney(amount) {
        var currency = (currentQuote && currentQuote.breakdown.currency) ||
            (window.TrendaryoConfig && window.TrendaryoConfig.currency) || 'USD';
        currency = String(currency).toUpperCase();
        try {
            return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency }).format(Number(amount) || 0);
        } catch (error) {
            return currency + ' ' + (Number(amount) || 0).toFixed(2);
        }
    }

    function updateOrderSummary() {
        if (!currentQuote || !currentQuote.breakdown) {
            ['subtotal', 'discount', 'shipping', 'tax', 'total'].forEach(function(id) {
                var field = document.getElementById(id);
                if (field) field.textContent = 'Calculating…';
            });
            var emptyDiscountRow = document.getElementById('discount-row');
            if (emptyDiscountRow) emptyDiscountRow.style.display = 'none';
            return;
        }

        var breakdown = currentQuote.breakdown;
        var write = function(id, text) {
            var field = document.getElementById(id);
            if (field) field.textContent = text;
        };
        write('subtotal', formatMoney(breakdown.subtotal));
        write('discount', '-' + formatMoney(breakdown.discount));
        write('shipping', breakdown.shipping === 0 ? 'FREE' : formatMoney(breakdown.shipping));
        write('tax', formatMoney(breakdown.tax));
        write('total', formatMoney(breakdown.total));
        var discountRow = document.getElementById('discount-row');
        if (discountRow) discountRow.style.display = breakdown.discount > 0 ? 'flex' : 'none';
    }

    async function applyCoupon() {
        if (completedPayment) {
            setCheckoutFeedback('Payment is already complete. Do not change the order while it is being confirmed.', 'error');
            return;
        }
        var input = document.getElementById('coupon-code');
        var code = input ? input.value.trim().toUpperCase() : '';
        var message = document.getElementById('coupon-msg');
        if (!code) {
            if (message) message.textContent = 'Enter a promo code.';
            return;
        }
        var button = document.getElementById('coupon-apply');
        if (button) button.disabled = true;
        if (message) message.textContent = 'Checking promo code…';

        try {
            var quote = await refreshQuote(code);
            if (!quote || !quote.coupon) throw new Error('That promo code is not valid.');
            appliedCoupon = quote.coupon;
            if (input) input.value = quote.coupon.code;
            if (message) message.textContent = 'Applied: ' + quote.coupon.code;
            setCheckoutFeedback('Promo code applied. Your updated total is shown in the order summary.', 'success');
            updateCouponControls();
            updateSubmitButton();
        } catch (error) {
            if (message) message.textContent = error.message || 'Could not apply that promo code.';
        } finally {
            if (button) button.disabled = false;
        }
    }

    async function removeCoupon() {
        if (completedPayment) {
            setCheckoutFeedback('Payment is already complete. Do not change the order while it is being confirmed.', 'error');
            return;
        }
        var input = document.getElementById('coupon-code');
        var message = document.getElementById('coupon-msg');
        appliedCoupon = null;
        if (input) input.value = '';
        updateCouponControls();
        try {
            await refreshQuote(null);
            if (message) message.textContent = 'Promo code removed.';
        } catch (error) {
            if (message) message.textContent = error.message || 'Could not update your total.';
        }
    }

    function updateCouponControls() {
        var removeButton = document.getElementById('coupon-remove');
        var applyButton = document.getElementById('coupon-apply');
        var input = document.getElementById('coupon-code');
        var savedAttempt = null;
        try { savedAttempt = JSON.parse(localStorage.getItem('trendaryo_checkout_attempt') || 'null'); } catch (error) {}
        var locked = Boolean(completedPayment || isSubmitting || (savedAttempt && savedAttempt.intentRequested));
        if (removeButton) removeButton.disabled = locked;
        if (applyButton) applyButton.disabled = locked;
        if (input) input.disabled = locked;
        if (removeButton) removeButton.hidden = !appliedCoupon;
    }

    function appendReviewLine(container, label, value) {
        var line = document.createElement('p');
        var heading = document.createElement('strong');
        heading.textContent = label + ': ';
        line.append(heading, document.createTextNode(value));
        container.appendChild(line);
    }

    function showReview() {
        var review = document.getElementById('review-info');
        if (!review) return;
        review.replaceChildren();
        appendReviewLine(review, 'Shipping To',
            document.getElementById('firstName').value.trim() + ' ' +
            document.getElementById('lastName').value.trim());
        appendReviewLine(review, 'Address', document.getElementById('address').value.trim());
        appendReviewLine(review, 'City / Region / Postal Code', [
            document.getElementById('city').value.trim(),
            document.getElementById('state').value.trim(),
            document.getElementById('zip').value.trim()
        ].filter(Boolean).join(', '));
        appendReviewLine(review, 'Country', document.getElementById('country').selectedOptions[0].text);
        appendReviewLine(review, 'Email', document.getElementById('email').value.trim());
        appendReviewLine(review, 'Phone', document.getElementById('phone').value.trim());
        appendReviewLine(review, 'Payment', document.getElementById('payment-method').selectedOptions[0].text);
        if (appliedCoupon) appendReviewLine(review, 'Promo code', appliedCoupon.code);
    }

    function updatePaymentAvailability(codEnabled) {
        var select = document.getElementById('payment-method');
        if (!select) return;
        var cardOption = select.querySelector('option[value="card"]');
        var codOption = select.querySelector('option[value="cod"]');
        if (cardOption) cardOption.disabled = stripeState === 'unavailable';
        if (codOption && codEnabled !== undefined) codOption.disabled = codEnabled === false;

        if (completedPayment || pendingCardAttempt) {
            select.value = 'card';
            select.disabled = true;
        } else {
            select.disabled = Boolean(cardOption && cardOption.disabled && codOption && codOption.disabled);
            if (select.selectedOptions[0] && select.selectedOptions[0].disabled) {
                if (cardOption && !cardOption.disabled) select.value = 'card';
                else if (codOption && !codOption.disabled) select.value = 'cod';
            }
        }
        var help = document.getElementById('payment-method-help');
        if (help && cardOption && cardOption.disabled && codOption && codOption.disabled) {
            help.textContent = 'No payment methods are currently available. Please contact support.';
            help.className = 'checkout-feedback error';
        } else if (help && help.textContent.indexOf('No payment methods') === 0) {
            help.textContent = '';
            help.className = 'checkout-feedback';
        }
        togglePayment();
    }

    function togglePayment() {
        var select = document.getElementById('payment-method');
        if (!select) return;
        if (completedPayment || pendingCardAttempt) {
            select.value = 'card';
            select.disabled = true;
        }
        var isCard = select.value === 'card';
        var stripeSection = document.getElementById('stripe-card-section');
        var codSection = document.getElementById('cod-section');
        if (stripeSection) stripeSection.style.display = isCard ? 'block' : 'none';
        if (codSection) codSection.style.display = isCard ? 'none' : 'block';
    }

    function updatePostalLabel() {
        var country = document.getElementById('country');
        var label = document.getElementById('postal-label');
        if (label && country) label.textContent = country.value === 'US' ? 'ZIP Code' : 'Postal Code';
    }

    function prevStep() {
        if (currentStep <= 1) return;
        var currentSection = document.querySelector('.checkout-form-section[data-section="' + currentStep + '"]');
        var currentIndicator = document.querySelector('.checkout-step[data-step="' + currentStep + '"]');
        if (currentSection) currentSection.classList.remove('active');
        if (currentIndicator) {
            currentIndicator.classList.remove('active');
            currentIndicator.removeAttribute('aria-current');
        }
        currentStep--;
        var previousSection = document.querySelector('.checkout-form-section[data-section="' + currentStep + '"]');
        var previousIndicator = document.querySelector('.checkout-step[data-step="' + currentStep + '"]');
        if (previousSection) previousSection.classList.add('active');
        if (previousIndicator) {
            previousIndicator.classList.remove('completed');
            previousIndicator.classList.add('active');
            previousIndicator.setAttribute('aria-current', 'step');
        }
    }

    function nextStep() {
        if (currentStep === 2 && validatePayment()) moveToNextStep();
    }

    function updateSubmitButton() {
        var button = document.getElementById('place-order-btn');
        var continueButton = document.getElementById('continue-to-payment-btn');
        var reviewButton = document.getElementById('review-order-btn');
        if (continueButton) continueButton.disabled = cart.length === 0;
        if (reviewButton) reviewButton.disabled = cart.length === 0;
        if (!button) return;
        // A stale quote must NOT disable the button. It stays enabled so the
        // submit handler can re-verify the quote right before charging; if the
        // total actually changed it surfaces an inline message instead of
        // starting (or re-using) a payment for the wrong amount.
        button.disabled = isSubmitting || quotePending || !cart.length;
        if (!cart.length) button.textContent = 'Cart is Empty';
        else if (isSubmitting) button.textContent = 'Processing Order…';
        else button.textContent = 'Place Order';
    }

    function quoteChanged(previous, next) {
        if (!previous || !next || !previous.breakdown || !next.breakdown) return true;
        var keys = ['subtotal', 'discount', 'shipping', 'tax', 'total'];
        for (var i = 0; i < keys.length; i++) {
            if (Number(previous.breakdown[keys[i]]) !== Number(next.breakdown[keys[i]])) return true;
        }
        if (String(previous.breakdown.currency).toLowerCase() !== String(next.breakdown.currency).toLowerCase()) return true;
        var oldItems = previous.lineItems || [];
        var newItems = next.lineItems || [];
        if (oldItems.length !== newItems.length) return true;
        for (var j = 0; j < oldItems.length; j++) {
            if (oldItems[j].productId !== newItems[j].productId ||
                Number(oldItems[j].price) !== Number(newItems[j].price) ||
                Number(oldItems[j].quantity) !== Number(newItems[j].quantity)) return true;
        }
        return false;
    }

    function setSubmitting(submitting) {
        isSubmitting = submitting;
        var button = document.getElementById('place-order-btn');
        if (button) button.classList.toggle('loading', submitting);
        updateCouponControls();
        updateSubmitButton();
    }

    function getShippingAddress() {
        return {
            fullName: document.getElementById('firstName').value.trim() + ' ' +
                document.getElementById('lastName').value.trim(),
            email: document.getElementById('email').value.trim(),
            phone: document.getElementById('phone').value.trim(),
            street: document.getElementById('address').value.trim(),
            city: document.getElementById('city').value.trim(),
            state: document.getElementById('state').value.trim(),
            zipCode: document.getElementById('zip').value.trim(),
            country: document.getElementById('country').value
        };
    }

    function showStep(stepNumber) {
        currentStep = stepNumber;
        document.querySelectorAll('.checkout-form-section').forEach(function(section) {
            section.classList.toggle('active', Number(section.dataset.section) === stepNumber);
        });
        document.querySelectorAll('.checkout-step').forEach(function(step) {
            var stepNumberValue = Number(step.dataset.step);
            step.classList.toggle('active', stepNumberValue === stepNumber);
            step.classList.toggle('completed', stepNumberValue < stepNumber);
            if (stepNumberValue === stepNumber) step.setAttribute('aria-current', 'step');
            else step.removeAttribute('aria-current');
        });
    }

    function attachFormHandler() {
        var form = document.getElementById('checkout-form');
        if (!form) return;
        form.addEventListener('submit', async function(event) {
            event.preventDefault();
            if (isSubmitting || quotePending) return;
            if (!validateShipping()) {
                showStep(1);
                return;
            }
            if (currentStep !== 3) {
                setCheckoutFeedback('Complete the payment and review steps before placing your order.', 'error');
                return;
            }
            if (!cart.length) {
                setCheckoutFeedback('Your cart is empty. Add items before placing an order.', 'error');
                return;
            }

            var methodSelect = document.getElementById('payment-method');
            var paymentMethod = methodSelect.value;
            if (methodSelect.selectedOptions[0].disabled && !completedPayment && !pendingCardAttempt) {
                setCheckoutFeedback('The selected payment method is unavailable. Choose another method.', 'error');
                return;
            }
            if (paymentMethod === 'card' && !completedPayment && !pendingCardAttempt && (stripeState !== 'ready' || !cardElement)) {
                setCheckoutFeedback('Card payments are unavailable. Please try again later.', 'error');
                showStep(2);
                return;
            }

            var items = getOrderItems();
            var couponCode = appliedCoupon ? appliedCoupon.code : null;

            // (A) Guarantee an authoritative, current quote BEFORE any charge
            // attempt (card or COD). The persistent checkout attempt is only
            // written AFTER this step, so a restored or stale quote can never
            // be charged against outdated totals, and COD checks the freshness
            // of its own quote through exactly the same gate.
            if (!completedPayment && !pendingCardAttempt) {
                var desiredQuoteKey = quoteRequestKey(items, couponCode);
                if (!currentQuote || currentQuoteKey !== desiredQuoteKey) {
                    var beforeQuote = currentQuote;
                    var freshQuote;
                    try {
                        freshQuote = await refreshQuote(couponCode);
                    } catch (quoteError) {
                        setCheckoutFeedback(quoteError.message || 'Your order total could not be confirmed. Try again.', 'error');
                        return;
                    }
                    if (!freshQuote) {
                        setCheckoutFeedback('Your order total could not be confirmed. Try again.', 'error');
                        return;
                    }
                    if (beforeQuote && quoteChanged(beforeQuote, freshQuote)) {
                        setCheckoutFeedback('Your prices or availability changed. Review the updated order summary, then place your order again.', 'error');
                        return;
                    }
                    if (!beforeQuote) {
                        setCheckoutFeedback('Your order total is confirmed. Review the summary, then press Place Order again to complete your order.', 'success');
                        return;
                    }
                }
            }

            // Re-derive the order lines from the authoritative quote in case
            // prices, names or quantities were corrected during the refresh.
            items = getOrderItems();

            setSubmitting(true);
            var fingerprint = checkoutAttemptFingerprint(items, couponCode);
            var checkoutRequestId;
            var paidIntent;

            try {
                checkoutRequestId = getCheckoutRequestId(fingerprint, items, couponCode);
                paidIntent = completedPayment && completedPayment.fingerprint === fingerprint
                    ? completedPayment
                    : null;

                var paymentIntentId = paidIntent ? paidIntent.id : null;
                if (paymentMethod === 'card' && !paidIntent) {
                    if (!pendingCardAttempt && (stripeState !== 'ready' || !stripe || !cardElement)) {
                        throw new Error('Card payments are unavailable. Select another payment method.');
                    }
                    var shippingAddress = getShippingAddress();
                    persistCheckoutAttempt({ intentRequested: true, items: items, couponCode: couponCode, shippingAddress: shippingAddress, formValues: getShippingFormValues(), quote: currentQuote });
                    pendingCardAttempt = true;
                    lockShippingFields(true);
                    updatePaymentAvailability();
                    updateCouponControls();
                    var intentResponse = await API.createPaymentIntent(items, couponCode, checkoutRequestId, shippingAddress);
                    var intent = intentResponse && intentResponse.data;
                    if (!intent || !intent.clientSecret || !intent.paymentIntentId || !intent.breakdown || !Array.isArray(intent.lineItems)) {
                        throw new Error('The payment service returned an incomplete response.');
                    }
                    persistCheckoutAttempt({ paymentIntentId: intent.paymentIntentId });
                    if (quoteChanged(currentQuote, {
                        breakdown: intent.breakdown,
                        lineItems: intent.lineItems
                    })) {
                        // Void the just-created intent; the prices it charged are stale.
                        cancelStaleIntent(intent.paymentIntentId);
                        currentQuote.lineItems = intent.lineItems;
                        currentQuote.breakdown = intent.breakdown;
                        cart = intent.lineItems.map(function(line) {
                            return { id: String(line.productId), quantity: Number(line.quantity), name: String(line.name || 'Product'), price: Number(line.price), image: String(line.image || 'assets/placeholder.jpg') };
                        });
                        renderCart();
                        updateOrderSummary();
                        clearCheckoutAttempt();
                        pendingCardAttempt = false;
                        lockShippingFields(false);
                        updatePaymentAvailability();
                        updateCouponControls();
                        setCheckoutFeedback('Your total changed while checkout was open. Review the updated total and place your order again.', 'error');
                        setSubmitting(false);
                        return;
                    }

                    if (intent.status === 'succeeded') {
                        paymentIntentId = intent.paymentIntentId;
                        paidIntent = { id: paymentIntentId, fingerprint: fingerprint, checkoutRequestId: checkoutRequestId };
                        completedPayment = paidIntent;
                        persistCheckoutAttempt({ paid: true, paymentIntentId: paymentIntentId });
                        lockShippingFields(true);
                    } else {
                        if (stripeState !== 'ready' || !stripe || !cardElement) {
                            throw new Error('Card payments are unavailable. Retry this checkout when card payments are available.');
                        }
                        if (!cardComplete) {
                            setCheckoutFeedback('Enter valid card details to finish this payment.', 'error');
                            setSubmitting(false);
                            showStep(2);
                            return;
                        }
                        var address = getShippingAddress();
                        var result = await stripe.confirmCardPayment(intent.clientSecret, {
                            payment_method: {
                                card: cardElement,
                                billing_details: {
                                    name: address.fullName,
                                    email: address.email,
                                    phone: address.phone,
                                    address: {
                                        line1: address.street,
                                        city: address.city,
                                        state: address.state,
                                        postal_code: address.zipCode,
                                        country: address.country
                                    }
                                }
                            }
                        });
                        if (result.error) {
                            var cardErrors = document.getElementById('stripe-card-errors');
                            if (cardErrors) {
                                cardErrors.textContent = result.error.message || 'Card payment failed.';
                                cardErrors.style.display = 'block';
                            }
                            // The card element lives in the payment step, which is
                            // hidden while the review step is active — mirror the
                            // decline message to the shared feedback area so the
                            // click is never silently swallowed on the review screen.
                            setCheckoutFeedback(result.error.message || 'Card payment failed. Check your card details and try again.', 'error');
                            // The bank may have actually charged the card even though
                            // the SDK surfaced an error (e.g. a dropped connection
                            // after capture). Verify the real intent status before
                            // treating this as a decline and freeing the form.
                            try {
                                var verified = await stripe.retrievePaymentIntent(intent.clientSecret);
                                var verifiedIntent = verified && verified.paymentIntent;
                                if (verifiedIntent && verifiedIntent.status === 'succeeded') {
                                    paymentIntentId = verifiedIntent.id;
                                    paidIntent = { id: paymentIntentId, fingerprint: fingerprint, checkoutRequestId: checkoutRequestId };
                                    completedPayment = paidIntent;
                                    persistCheckoutAttempt({ paid: true, paymentIntentId: paymentIntentId });
                                    lockShippingFields(true);
                                    updatePaymentAvailability();
                                    updateCouponControls();
                                }
                            } catch (verifyError) {
                                console.error('[Checkout] Could not verify card status after decline:', verifyError);
                            }
                            if (!completedPayment) {
                                // Genuine decline: void the orphaned intent, reset the
                                // attempt and unlock the form so the shopper can retry
                                // (including switching to cash on delivery).
                                cancelStaleIntent(intent.paymentIntentId);
                                pendingCardAttempt = false;
                                clearCheckoutAttempt();
                                lockShippingFields(false);
                                updatePaymentAvailability();
                                updateCouponControls();
                                setSubmitting(false);
                                return;
                            }
                        }
                        // If recovery already confirmed payment, result may still
                        // carry the original error; only bail out when we know
                        // for certain the payment did not go through.
                        if (!paidIntent && (!result.paymentIntent || result.paymentIntent.status !== 'succeeded')) {
                            throw new Error('Payment was not completed. Please try again.');
                        }
                        if (!paidIntent) {
                            paymentIntentId = result.paymentIntent.id;
                            paidIntent = { id: paymentIntentId, fingerprint: fingerprint, checkoutRequestId: checkoutRequestId };
                            completedPayment = paidIntent;
                        }
                        persistCheckoutAttempt({ paid: true, paymentIntentId: paymentIntentId });
                        lockShippingFields(true);
                    }
                    updatePaymentAvailability();
                    updateCouponControls();
                }

                var orderResult = await API.createOrder({
                    items: items,
                    shippingAddress: getShippingAddress(),
                    paymentMethod: paymentMethod,
                    couponCode: couponCode,
                    paymentIntentId: paymentIntentId,
                    checkoutRequestId: checkoutRequestId,
                    notes: ''
                });
                if (!orderResult || !orderResult.data || !orderResult.data.id) {
                    throw new Error('The order service did not confirm your order. Keep this page open and contact support before retrying payment.');
                }
                try {
                    localStorage.setItem('trendaryo_last_order', JSON.stringify(orderResult.data));
                } catch (e) { /* storage full or blocked */ }
                clearCheckoutAttempt();
                window.trendaryoToast && window.trendaryoToast('Order placed successfully!');
                if (typeof CartManager !== 'undefined') {
                    CartManager.clear();
                } else {
                    localStorage.removeItem('trendaryo_cart');
                    localStorage.removeItem('trendaryo_cart_products');
                }
                try {
                    if (window.API && typeof window.API.clearCart === 'function') {
                        window.API.clearCart().catch(function () {});
                    }
                } catch (e) { /* ignore */ }
                window.location.href = 'order-success.html?id=' + encodeURIComponent(orderResult.data.id);
            } catch (error) {
                console.error('[Checkout] Order submission failed:', error);
                setCheckoutFeedback(error.message || 'Your order could not be completed. Please try again.', 'error');
                setSubmitting(false);
                var errorData = error && error.response && error.response.data && error.response.data.error;
                if (errorData && errorData.refunded) {
                    completedPayment = null;
                    pendingCardAttempt = false;
                    lockShippingFields(false);
                    clearCheckoutAttempt();
                    updatePaymentAvailability();
                    updateCouponControls();
                    return;
                }
                if (errorData && errorData.code === 'payment_intent_canceled') {
                    completedPayment = null;
                    pendingCardAttempt = false;
                    clearCheckoutAttempt();
                    lockShippingFields(false);
                    updatePaymentAvailability();
                    updateCouponControls();
                    refreshQuote(couponCode).catch(function() {});
                    return;
                }
                if (pendingCardAttempt && error.response && error.response.status >= 400 && error.response.status < 500 &&
                    (!errorData || errorData.code !== 'checkout_request_mismatch')) {
                    pendingCardAttempt = false;
                    clearCheckoutAttempt();
                    lockShippingFields(false);
                    updatePaymentAvailability();
                    updateCouponControls();
                }
                if (completedPayment) {
                    setCheckoutFeedback('Payment succeeded but the order could not be confirmed. Keep this page open and retry; do not submit another payment.', 'error');
                }
            }
        });
    }

    window.handleContinueToPayment = handleContinueToPayment;
    window.prevStep = prevStep;
    window.nextStep = nextStep;
    window.showReview = showReview;
    window.togglePayment = togglePayment;
    window.applyCoupon = applyCoupon;
    window.removeCoupon = removeCoupon;
})();
