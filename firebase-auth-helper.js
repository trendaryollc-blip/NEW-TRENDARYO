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

  /* Migrate data recorded under this browser's anonymous guest UID onto the
     currently signed-in (non-anonymous) account, then forget the marker.
     Uses a direct fetch rather than window.API — the register page does not
     load api-client.js, and the claim must work there. The marker is only
     cleared once the server accepts (or permanently rejects) the claim, so a
     failed merge retries automatically on the next sign-in. */
  async claimGuestData(uid) {
    try {
      const guestUid = localStorage.getItem('trendaryo_anon_uid');
      if (!guestUid || guestUid === uid) {
        if (guestUid && guestUid === uid) localStorage.removeItem('trendaryo_anon_uid');
        return;
      }
      const token = await FirebaseAuth.getIdToken();
      if (!token) return;
      const res = await fetch('/api/users/claim-guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ guestUid }),
      });
      if (res.ok || res.status === 400) {
        localStorage.removeItem('trendaryo_anon_uid');
      } else {
        console.warn('Guest claim pending (HTTP ' + res.status + ') - will retry on next sign-in');
      }
    } catch (error) {
      console.warn('Could not merge guest data after sign-in:', error && error.message);
    }
  },

  async login(email, password) {
    if (typeof firebase === 'undefined' || !firebase.auth) {
      throw new Error('Firebase not initialized. Please refresh the page.');
    }

    // Guest checkout signs shoppers in anonymously. If that anonymous session
    // is still live here, upgrading it with the email credential keeps the SAME
    // UID (guest orders stay attached). If the email already belongs to a real
    // account, sign out of the anonymous session first, then sign in normally.
    // A non-anonymous session is signed out too — "log in" is an explicit
    // request to switch accounts.
    const authRef = firebase.auth();
    if (authRef.currentUser && !authRef.currentUser.isAnonymous) {
      await authRef.signOut();
    }
    const anonBefore = authRef.currentUser && authRef.currentUser.isAnonymous
      ? authRef.currentUser
      : null;

    let authResult;
    if (anonBefore) {
      // Remember where the guest data lives before any sign-out.
      if (!localStorage.getItem('trendaryo_anon_uid')) {
        localStorage.setItem('trendaryo_anon_uid', anonBefore.uid);
      }
      try {
        authResult = await anonBefore.linkWithCredential(
          firebase.auth.EmailAuthProvider.credential(email, password)
        );
      } catch (linkError) {
        // Either the email already belongs to an account, or Google refused
        // the link entirely (auth/operation-not-allowed — the anonymous
        // upgrade path is blocked under email-enumeration protections).
        // Both resolve the same way: leave the guest session, sign in
        // normally — the claimGuestData call below migrates guest data.
        await authRef.signOut();
        authResult = await authRef.signInWithEmailAndPassword(email, password);
      }
    } else {
      authResult = await authRef.signInWithEmailAndPassword(email, password);
    }
    const user = authResult.user;

    // Migrate any guest data recorded under this browser into the account that
    // is now signed in (only when the UID actually changed).
    await FirebaseAuth.claimGuestData(user.uid);

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

    // Registering from a browser that already has an anonymous guest session
    // should UPGRADE that account (same UID, orders preserved) rather than
    // create a brand-new unrelated user.
    const authRef = firebase.auth();
    const currentUser = authRef.currentUser;

    let userCredential = null;
    let createdAccount = false;
    if (currentUser && !currentUser.isAnonymous) {
      // Already signed into a real account on this browser — nothing to create.
      createdAccount = false;
    } else if (currentUser && currentUser.isAnonymous) {
      // Remember the guest UID before any sign-out so the merge below still
      // knows where the guest orders live.
      if (!localStorage.getItem('trendaryo_anon_uid')) {
        localStorage.setItem('trendaryo_anon_uid', currentUser.uid);
      }
      try {
        userCredential = await currentUser.linkWithCredential(
          firebase.auth.EmailAuthProvider.credential(email, password)
        );
        createdAccount = true;
      } catch (linkError) {
        if (linkError && (linkError.code === 'auth/credential-already-in-use' || linkError.code === 'auth/email-already-in-use')) {
          // An account already uses this email — route the shopper straight in.
          await authRef.signOut();
          userCredential = await authRef.signInWithEmailAndPassword(email, password);
          createdAccount = false;
        } else {
          // Google blocked the guest→email link (auth/operation-not-allowed —
          // email-enumeration protections forbid the client SDK upgrade path).
          // Fall back to a normal sign-up in a fresh session; the account gets
          // a new UID and claimGuestData below migrates the guest orders onto
          // it server-side, so nothing is lost either way.
          await authRef.signOut();
          try {
            userCredential = await authRef.createUserWithEmailAndPassword(email, password);
            createdAccount = true;
          } catch (createError) {
            if (createError && createError.code === 'auth/email-already-in-use') {
              userCredential = await authRef.signInWithEmailAndPassword(email, password);
              createdAccount = false;
            } else {
              throw createError;
            }
          }
        }
      }
    } else {
      userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
      createdAccount = true;
    }
    const user = userCredential ? userCredential.user : currentUser;

    if (createdAccount) {
      await user.updateProfile({
        displayName: `${firstName} ${lastName}`,
      });
    }

    const db = firebase.firestore();
    if (createdAccount) {
      await db.collection('users').doc(user.uid).set({
        firstName,
        lastName,
        email,
        role: 'user',
        status: 'active',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    }

    // Merge any guest data this browser collected while it was anonymous.
    await FirebaseAuth.claimGuestData(user.uid);

    const userInfo = {
      id: user.uid,
      email: user.email,
      name: user.displayName || `${firstName} ${lastName}`,
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
