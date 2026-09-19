/**
 * FIREBASE AUTH HELPER
 * Unified authentication helper for Firebase
 * Uses Firebase Auth for authentication
 */

const FirebaseAuth = {
  isLoggedIn() {
    if (typeof firebase !== 'undefined' && firebase.auth) {
      return !!firebase.auth().currentUser;
    }
    return !!localStorage.getItem('user_id');
  },

  getCurrentUser() {
    const userId = localStorage.getItem('user_id');
    const userStr = localStorage.getItem('user');
    return userId && userStr ? JSON.parse(userStr) : null;
  },

  getUserId() {
    if (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) {
      return firebase.auth().currentUser.uid;
    }
    return localStorage.getItem('user_id');
  },

  getIdToken() {
    return new Promise(async (resolve) => {
      if (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) {
        try {
          const token = await firebase.auth().currentUser.getIdToken();
          resolve(token);
        } catch (e) {
          resolve(null);
        }
      } else {
        resolve(null);
      }
    });
  },

  async login(email, password) {
    if (typeof firebase === 'undefined' || !firebase.auth) {
      throw new Error('Firebase not initialized. Please refresh the page.');
    }

    const authResult = await firebase.auth().signInWithEmailAndPassword(email, password);
    const user = authResult.user;

    const db = firebase.firestore();
    const userDoc = await db.collection('users').doc(user.uid).get();
    const userData = userDoc.exists ? userDoc.data() : {};

    const userInfo = {
      id: user.uid,
      email: user.email,
      name: user.displayName || `${userData.firstName || ''} ${userData.lastName || ''}`.trim(),
      role: userData.role || 'user',
      firstName: userData.firstName || '',
      lastName: userData.lastName || '',
    };

    localStorage.setItem('user_id', user.uid);
    localStorage.setItem('user', JSON.stringify(userInfo));

    return { success: true, user: userInfo };
  },

  async register(email, password, firstName, lastName) {
    if (typeof firebase === 'undefined' || !firebase.auth) {
      throw new Error('Firebase not initialized. Please refresh the page.');
    }

    const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
    const user = userCredential.user;

    await user.updateProfile({
      displayName: `${firstName} ${lastName}`,
    });

    const db = firebase.firestore();
    await db.collection('users').doc(user.uid).set({
      firstName,
      lastName,
      email,
      role: 'user',
      status: 'active',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    const userInfo = {
      id: user.uid,
      email: user.email,
      name: `${firstName} ${lastName}`,
      role: 'user',
      firstName,
      lastName,
    };

    localStorage.setItem('user_id', user.uid);
    localStorage.setItem('user', JSON.stringify(userInfo));

    return { success: true, user: userInfo };
  },

  async logout() {
    if (typeof firebase !== 'undefined' && firebase.auth) {
      await firebase.auth().signOut();
    }
    localStorage.removeItem('user_id');
    localStorage.removeItem('user');
    localStorage.removeItem('auth_token');
  },

  requireAuth(redirectUrl = 'login.html') {
    if (!this.isLoggedIn()) {
      window.location.href = redirectUrl;
      return false;
    }
    return true;
  },

  async resetPassword(email) {
    if (typeof firebase === 'undefined' || !firebase.auth) {
      throw new Error('Firebase not initialized. Please refresh the page.');
    }
    await firebase.auth().sendPasswordResetEmail(email);
    return { success: true, message: 'Password reset email sent' };
  },
};

window.FirebaseAuth = FirebaseAuth;
