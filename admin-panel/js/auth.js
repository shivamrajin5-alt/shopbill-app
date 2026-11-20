/**
 * ShopBill Admin Panel - Authentication Module
 * Handles Admin Login via Express /api/admin/login (token-protected), Google Sign-In,
 * Session verification, and Logout.
 */

import {
  auth,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  isLiveFirebase
} from './firebase-config.js';

const ADMIN_SESSION_KEY = 'shopbill_admin_session';
const ADMIN_TOKEN_KEY = 'shopbill_admin_token';

export function getAdminToken() {
  try {
    return sessionStorage.getItem(ADMIN_TOKEN_KEY) || localStorage.getItem(ADMIN_TOKEN_KEY) || '';
  } catch (_) {
    return '';
  }
}

function storeAdminToken(token) {
  try {
    if (token) {
      sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
      localStorage.setItem(ADMIN_TOKEN_KEY, token);
    } else {
      sessionStorage.removeItem(ADMIN_TOKEN_KEY);
      localStorage.removeItem(ADMIN_TOKEN_KEY);
    }
  } catch (_) {}
}

/**
 * Sign in admin using email and developer access key via Express /api/admin/login.
 */
export async function loginAdmin(email, password) {
  const trimmedEmail = String(email || '').trim().toLowerCase() || 'shivamraj.in5@gmail.com';
  const trimmedPass = String(password || '').trim();

  const response = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: trimmedEmail,
      password: trimmedPass,
      uid: 'adm_primary'
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok || !data.token) {
    throw new Error(data.error || 'Invalid admin credentials. Access denied.');
  }

  storeAdminToken(data.token);

  const session = {
    uid: data.admin?.uid || 'adm_primary',
    email: data.admin?.email || trimmedEmail,
    displayName: 'Super Admin',
    role: data.admin?.role || 'super_admin',
    loginAt: new Date().toISOString()
  };
  localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
  return session;
}

/**
 * Sign in with Google provider via popup.
 * Requires developer admin key if SQLite admin session token is not yet active.
 */
export async function loginWithGoogle() {
  if (isLiveFirebase && auth) {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      try {
        localStorage.removeItem('shopbill_firebase_domain_error_v1');
      } catch (_) {}
      const session = {
        uid: result.user.uid,
        email: result.user.email,
        displayName: result.user.displayName || 'Admin',
        role: 'super_admin',
        loginAt: new Date().toISOString()
      };
      localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
      return session;
    } catch (err) {
      const msg = String(err?.code || err?.message || '').toLowerCase();
      if (msg.includes('unauthorized-domain') && typeof window !== 'undefined') {
        try {
          localStorage.setItem('shopbill_firebase_domain_error_v1', window.location.hostname.toLowerCase());
        } catch (_) {}
      }
      throw err;
    }
  }
  throw new Error('Firebase Auth is not active. Please sign in with your Admin Email and Developer Key.');
}

/**
 * Sign out admin session and revoke backend token.
 */
export async function logoutAdmin() {
  const token = getAdminToken();
  if (token) {
    try {
      await fetch('/api/admin/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': token
        },
        body: JSON.stringify({})
      });
    } catch (_) {}
  }

  storeAdminToken('');
  localStorage.removeItem(ADMIN_SESSION_KEY);
  if (isLiveFirebase && auth) {
    try {
      await signOut(auth);
    } catch (e) {
      console.warn('Firebase signOut note:', e);
    }
  }
}

/**
 * Get current authenticated admin user object (requires active backend token), or null.
 */
export function getCurrentUser() {
  const token = getAdminToken();
  const sessionStr = localStorage.getItem(ADMIN_SESSION_KEY);
  if (sessionStr && token) {
    try {
      return JSON.parse(sessionStr);
    } catch (_) {}
  }
  return null;
}

/**
 * Check authentication status asynchronously.
 * @param {Function} callback - Invoked with user object or null
 */
export function checkAuthStatus(callback) {
  const sessionUser = getCurrentUser();
  callback(sessionUser || null);
}

/**
 * Route protection guard for dashboard and admin pages.
 * If unauthenticated, immediately redirects to login.html.
 * @param {Function} onAuthenticated - Callback executed when user is verified
 */
export function requireAuth(onAuthenticated) {
  checkAuthStatus((user) => {
    if (!user) {
      window.location.replace('login.html');
    } else if (typeof onAuthenticated === 'function') {
      onAuthenticated(user);
    }
  });
}
