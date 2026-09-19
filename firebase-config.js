/**
 * FIREBASE CONFIGURATION
 * Trendaryo - Client-side Firebase SDK initialization
 * Uses Firebase Auth for authentication and Firestore for data
 */

const firebaseConfig = {
  apiKey: "AIzaSyAlD25bcSUIUnJEAcIuzGn9PtBgBFX_hss",
  authDomain: "new-trendaryo.firebaseapp.com",
  databaseURL: "https://new-trendaryo-default-rtdb.firebaseio.com",
  projectId: "new-trendaryo",
  storageBucket: "new-trendaryo.firebasestorage.app",
  messagingSenderId: "331608325601",
  appId: "1:331608325601:web:e1f8c5b6ca764e505166a0",
  measurementId: "G-HWD420D9YD"
};

let app, db, auth;
let firebaseInitialized = false;

async function initFirebase() {
  if (firebaseInitialized) {
    return { app, db, auth };
  }

  if (typeof firebase === 'undefined') {
    console.warn('Firebase SDK not loaded');
    return { app: null, db: null, auth: null };
  }

  try {
    app = (firebase.apps && firebase.apps.length) ? firebase.app() : firebase.initializeApp(firebaseConfig);
  } catch (error) {
    console.error('Firebase init error:', error);
    return { app: null, db: null, auth: null };
  }

  try {
    if (typeof firebase.firestore === 'function') db = firebase.firestore();
  } catch (error) {
    console.warn('Firestore unavailable:', error && error.message);
  }

  try {
    if (typeof firebase.auth === 'function') auth = firebase.auth();
  } catch (error) {
    console.warn('Firebase Auth unavailable:', error && error.message);
  }

  firebaseInitialized = true;
  console.log('Firebase initialized successfully');
  return { app, db, auth };
}

/* Auto-initialize as soon as the SDK is available so that pages which talk to
   the API (checkout, cart, profile, orders, ...) always have a live session
   without each page having to remember to call initFirebase(). Idempotent. */
(function autoInitFirebase() {
  function go() {
    if (typeof firebase !== 'undefined') {
      initFirebase().catch(function (e) { console.warn('Firebase auto-init failed:', e); });
    }
  }
  if (typeof document === 'undefined') { go(); return; }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
  else go();
})();

const FirebaseDB = {
  async getProducts(filters = {}) {
    let query = db.collection('products');
    if (filters.category) query = query.where('category', '==', filters.category);
    if (filters.limit) query = query.limit(filters.limit);
    const snapshot = await query.get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  async getProduct(id) {
    const doc = await db.collection('products').doc(id).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  },

  async addProduct(data) {
    const docRef = await db.collection('products').add({
      ...data,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return docRef.id;
  },

  async updateProduct(id, data) {
    await db.collection('products').doc(id).update({
      ...data,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  },

  async deleteProduct(id) {
    await db.collection('products').doc(id).delete();
  },

  async getCart(userId) {
    const doc = await db.collection('carts').doc(userId).get();
    return doc.exists ? doc.data().items || [] : [];
  },

  async addToCart(userId, productId, quantity = 1) {
    const cartRef = db.collection('carts').doc(userId);
    const doc = await cartRef.get();
    let items = doc.exists ? doc.data().items || [] : [];
    const existingItem = items.find(item => item.productId === productId);
    if (existingItem) {
      existingItem.quantity += quantity;
    } else {
      items.push({ productId, quantity });
    }
    await cartRef.set({ items, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
  },

  async removeFromCart(userId, productId) {
    const cartRef = db.collection('carts').doc(userId);
    const doc = await cartRef.get();
    if (doc.exists) {
      let items = doc.data().items || [];
      items = items.filter(item => item.productId !== productId);
      await cartRef.set({ items, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    }
  },

  async clearCart(userId) {
    await db.collection('carts').doc(userId).set({ items: [], updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
  },

  onCartChange(userId, callback) {
    return db.collection('carts').doc(userId).onSnapshot(doc => {
      callback(doc.exists ? doc.data().items || [] : []);
    });
  },

  async getWishlist(userId) {
    const doc = await db.collection('wishlists').doc(userId).get();
    return doc.exists ? doc.data().items || [] : [];
  },

  async addToWishlist(userId, productId) {
    const wishlistRef = db.collection('wishlists').doc(userId);
    await wishlistRef.set({
      items: firebase.firestore.FieldValue.arrayUnion(productId),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  },

  async removeFromWishlist(userId, productId) {
    const wishlistRef = db.collection('wishlists').doc(userId);
    await wishlistRef.update({
      items: firebase.firestore.FieldValue.arrayRemove(productId),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  },

  async createOrder(userId, orderData) {
    const docRef = await db.collection('orders').add({
      userId,
      ...orderData,
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return docRef.id;
  },

  async getOrders(userId) {
    const snapshot = await db.collection('orders')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  async getOrder(orderId) {
    const doc = await db.collection('orders').doc(orderId).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  },

  async updateOrderStatus(orderId, status) {
    await db.collection('orders').doc(orderId).update({
      status,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  },

  onOrderChange(orderId, callback) {
    return db.collection('orders').doc(orderId).onSnapshot(doc => {
      callback(doc.exists ? { id: doc.id, ...doc.data() } : null);
    });
  },

  async addReview(userId, productId, reviewData) {
    const docRef = await db.collection('reviews').add({
      userId,
      productId,
      ...reviewData,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return docRef.id;
  },

  async getProductReviews(productId) {
    const snapshot = await db.collection('reviews')
      .where('productId', '==', productId)
      .orderBy('createdAt', 'desc')
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }
};
