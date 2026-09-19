// Global Cart Manager - Unified cart system with consistent data structure
const CartManager = {
    STORAGE_KEY: 'trendaryo_cart',
    PRODUCTS_KEY: 'trendaryo_cart_products',
    
    // Normalize cart to ensure all items are objects with {id, quantity}
    // Product ids are opaque strings (Firestore doc ids / slugs), so ids are
    // always coerced to strings to keep lookups consistent.
    normalizeCart(cart) {
        return cart.map(item => {
            if (typeof item === 'number') {
                return { id: String(item), quantity: 1 };
            }
            return { id: String(item.id), quantity: item.quantity || 1 };
        });
    },
    
    getCart() {
        const cart = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '[]');
        return this.normalizeCart(cart);
    },
    
    addItem(productId, quantity = 1, productData = null) {
        const pid = String(productId);
        const cart = this.getCart();
        const existingItem = cart.find(item => item.id === pid);
        
        if (existingItem) {
            existingItem.quantity += quantity;
        } else {
            cart.push({ id: pid, quantity });
        }
        
        // Store product metadata separately
        if (productData) {
            const products = JSON.parse(localStorage.getItem(this.PRODUCTS_KEY) || '{}');
            products[pid] = {
                id: productData.id != null ? String(productData.id) : pid,
                name: productData.name || 'Product',
                price: productData.price || 0,
                image: productData.image || productData.emoji || '',
                emoji: productData.emoji || '📦'
            };
            localStorage.setItem(this.PRODUCTS_KEY, JSON.stringify(products));
        }
        
        this.saveCart(cart);
        return cart;
    },
    
    removeItem(productId) {
        const pid = String(productId);
        const cart = this.getCart().filter(item => item.id !== pid);
        this.saveCart(cart);
        return cart;
    },
    
    updateQuantity(productId, quantity) {
        const pid = String(productId);
        const cart = this.getCart();
        const item = cart.find(item => item.id === pid);
        
        if (item) {
            if (quantity <= 0) {
                return this.removeItem(productId);
            }
            item.quantity = quantity;
            this.saveCart(cart);
        }
        return cart;
    },
    
    saveCart(cart) {
        const normalized = this.normalizeCart(cart);
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(normalized));
        this.notifyUpdate();
    },
    
    getCount() {
        return this.getCart().reduce((sum, item) => sum + item.quantity, 0);
    },
    
    getTotal() {
        const cart = this.getCart();
        const products = JSON.parse(localStorage.getItem(this.PRODUCTS_KEY) || '{}');
        return cart.reduce((sum, item) => {
            const product = products[item.id];
            const price = product ? product.price : 0;
            return sum + (price * item.quantity);
        }, 0);
    },
    
    notifyUpdate() {
        window.dispatchEvent(new CustomEvent('cartUpdated', { 
            detail: { 
                cart: this.getCart(),
                count: this.getCount(),
                total: this.getTotal()
            } 
        }));
    },
    
    clear() {
        this.saveCart([]);
        localStorage.removeItem(this.PRODUCTS_KEY);
    }
};

// Auto-update cart count badge on all pages
function updateCartCountBadge() {
    const badge = document.getElementById('cart-count');
    if (badge) {
        badge.textContent = CartManager.getCount();
    }
}

// Listen for cart updates
window.addEventListener('cartUpdated', updateCartCountBadge);
window.addEventListener('storage', updateCartCountBadge);

// Update on page load
document.addEventListener('DOMContentLoaded', updateCartCountBadge);
