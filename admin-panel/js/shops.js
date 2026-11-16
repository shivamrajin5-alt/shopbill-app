/**
 * ShopBill Admin Panel - Shops Management Module
 * Primary Persistence: SQLite Relational DBMS (/api/shops) keyed by normalized individual owner email ID.
 * Cloud Sync: Cloud Firestore (/shops/{shopId} and /shop_owners/{emailKey}) when authenticated via Firebase Auth.
 */

import {
  db,
  auth,
  isLiveFirebase,
  OperationType,
  handleFirestoreError,
  withTimeout,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  serverTimestamp
} from './firebase-config.js';
import { hashPin } from './utils.js';
import { getAdminToken, logoutAdmin } from './auth.js';

const SHOPS_COLLECTION = 'shops';
const OWNERS_COLLECTION = 'shop_owners';
const LOCAL_STORAGE_SHOPS_KEY = 'shopbill_firestore_shops_store';

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export async function emailToDocKey(email) {
  const norm = normalizeEmail(email);
  const slug = norm
    .replace(/@/g, '_at_')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 96);
  const hash = await hashPin(norm);
  return `${slug || 'owner'}_${hash.slice(0, 8)}`;
}

async function apiRequest(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  const token = getAdminToken();

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'x-admin-token': token } : {}),
        ...(options.headers || {})
      },
      signal: controller.signal
    });

    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      await logoutAdmin();
      setTimeout(() => {
        if (!window.location.pathname.endsWith('login.html')) {
          window.location.replace('login.html');
        }
      }, 300);
      throw new Error(data.error || 'Admin session expired. Please sign in again.');
    }
    if (!response.ok) {
      throw new Error(data.error || `Request failed with status ${response.status}`);
    }
    return data;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Server request timed out. Please try again.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function saveLocalMirror(shops) {
  try {
    localStorage.setItem(LOCAL_STORAGE_SHOPS_KEY, JSON.stringify(shops));
  } catch (_) {}
}

async function syncShopToFirestore(shopRecord, _isNew = false) {
  if (!isLiveFirebase || !db || !auth?.currentUser) {
    return false;
  }

  const emailKey = shopRecord.emailKey || (await emailToDocKey(shopRecord.email));
  const shopDocRef = doc(db, SHOPS_COLLECTION, shopRecord.shopId);
  const ownerDocRef = doc(db, OWNERS_COLLECTION, emailKey);

  const shopCreatePayload = {
    shopId: shopRecord.shopId,
    shopName: shopRecord.shopName,
    ownerName: shopRecord.ownerName,
    email: shopRecord.email,
    emailKey,
    phone: shopRecord.phone,
    address: shopRecord.address,
    gstin: shopRecord.gstin || '',
    pinHash: shopRecord.pinHash,
    status: shopRecord.status,
    isActive: Boolean(shopRecord.isActive),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const shopUpdatePayload = {
    shopName: shopRecord.shopName,
    ownerName: shopRecord.ownerName,
    email: shopRecord.email,
    phone: shopRecord.phone,
    address: shopRecord.address,
    gstin: shopRecord.gstin || '',
    pinHash: shopRecord.pinHash,
    status: shopRecord.status,
    isActive: Boolean(shopRecord.isActive),
    updatedAt: serverTimestamp()
  };

  const ownerCreatePayload = {
    email: shopRecord.email,
    emailKey,
    shopId: shopRecord.shopId,
    ownerName: shopRecord.ownerName,
    shopName: shopRecord.shopName,
    phone: shopRecord.phone,
    address: shopRecord.address,
    gstin: shopRecord.gstin || '',
    tagline: shopRecord.tagline || 'Fast & Reliable In-Store Billing',
    taxRatePercent: Number(shopRecord.taxRatePercent ?? 5.0),
    currencySymbol: shopRecord.currencySymbol || '₹',
    status: shopRecord.status,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const ownerUpdatePayload = {
    ownerName: shopRecord.ownerName,
    shopName: shopRecord.shopName,
    phone: shopRecord.phone,
    address: shopRecord.address,
    gstin: shopRecord.gstin || '',
    tagline: shopRecord.tagline || 'Fast & Reliable In-Store Billing',
    taxRatePercent: Number(shopRecord.taxRatePercent ?? 5.0),
    currencySymbol: shopRecord.currencySymbol || '₹',
    status: shopRecord.status,
    updatedAt: serverTimestamp()
  };

  let shopExists = false;
  let ownerExists = false;
  try {
    const [shopSnap, ownerSnap] = await withTimeout(
      Promise.all([getDoc(shopDocRef), getDoc(ownerDocRef)]),
      3500,
      'Firestore existence check'
    );
    shopExists = shopSnap.exists();
    ownerExists = ownerSnap.exists();
  } catch (_) {}

  try {
    await withTimeout(
      Promise.all([
        shopExists ? updateDoc(shopDocRef, shopUpdatePayload) : setDoc(shopDocRef, shopCreatePayload),
        ownerExists ? updateDoc(ownerDocRef, ownerUpdatePayload) : setDoc(ownerDocRef, ownerCreatePayload)
      ]),
      4500,
      'Firestore sync'
    );
    return true;
  } catch (err) {
    handleFirestoreError(err, shopExists ? OperationType.UPDATE : OperationType.CREATE, `${SHOPS_COLLECTION}/${shopRecord.shopId}`);
    return false;
  }
}

/**
 * Register a new shop owner keyed by their individual email ID.
 * Validates inputs, stores relationally in SQLite DBMS (guaranteed fast completion),
 * and syncs to Cloud Firestore when authenticated with Google.
 */
export async function registerShop(shopData) {
  const email = normalizeEmail(shopData.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Please enter a valid individual owner email address.');
  }

  const payload = {
    shopId: (shopData.shopId || '').trim().toUpperCase(),
    shopName: (shopData.shopName || '').trim(),
    ownerName: (shopData.ownerName || '').trim(),
    phone: (shopData.phone || '').trim(),
    email,
    address: (shopData.address || '').trim(),
    gstin: (shopData.gstin || '').trim(),
    pin: (shopData.pin || '').trim(),
    status: shopData.status === 'inactive' ? 'inactive' : 'active'
  };

  const data = await apiRequest('/api/shops', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  const savedShop = data.shop;

  // Non-blocking / bounded Cloud Firestore sync when Google Auth is active
  await syncShopToFirestore(savedShop, true);

  return savedShop;
}

/**
 * Fetch all registered shops from DBMS (and sync with Firestore if signed in).
 */
export async function getAllShops() {
  try {
    const data = await apiRequest('/api/shops');
    const shops = data.shops || [];
    saveLocalMirror(shops);
    return shops;
  } catch (dbErr) {
    // Fallback read from Firestore if API unavailable
    if (isLiveFirebase && db && auth?.currentUser) {
      try {
        const q = query(collection(db, SHOPS_COLLECTION));
        const querySnapshot = await withTimeout(getDocs(q), 4500, 'Firestore list shops');
        const shops = [];
        querySnapshot.forEach((docSnap) => {
          shops.push({ id: docSnap.id, ...docSnap.data() });
        });
        saveLocalMirror(shops);
        return shops;
      } catch (err) {
        throw handleFirestoreError(err, OperationType.LIST, SHOPS_COLLECTION);
      }
    }
    throw dbErr;
  }
}

/**
 * Fetch a single shop profile by Shop ID or owner email ID.
 */
export async function getShopById(idOrEmail) {
  if (!idOrEmail) return null;
  try {
    const data = await apiRequest(`/api/shops/${encodeURIComponent(idOrEmail)}`);
    return data.shop || null;
  } catch (err) {
    if (err.message.includes('not found')) {
      return null;
    }
    if (isLiveFirebase && db && auth?.currentUser) {
      try {
        const docSnap = await withTimeout(getDoc(doc(db, SHOPS_COLLECTION, idOrEmail)), 4500, 'Firestore get shop');
        if (docSnap.exists()) {
          return { id: docSnap.id, ...docSnap.data() };
        }
      } catch (fsErr) {
        handleFirestoreError(fsErr, OperationType.GET, `${SHOPS_COLLECTION}/${idOrEmail}`);
      }
    }
    throw err;
  }
}

/**
 * Update an existing shop's profile in DBMS and sync to Firestore.
 */
export async function updateShop(idOrEmail, updateData) {
  const data = await apiRequest(`/api/shops/${encodeURIComponent(idOrEmail)}`, {
    method: 'PATCH',
    body: JSON.stringify(updateData)
  });

  const updatedShop = data.shop;
  if (updatedShop) {
    await syncShopToFirestore(updatedShop, false);
  }
  return updatedShop;
}

/**
 * Toggle a shop's operational status between 'active' and 'inactive'.
 */
export async function toggleShopStatus(idOrEmail) {
  const data = await apiRequest(`/api/shops/${encodeURIComponent(idOrEmail)}/toggle-status`, {
    method: 'POST',
    body: JSON.stringify({})
  });

  const updatedShop = data.shop;
  if (updatedShop) {
    await syncShopToFirestore(updatedShop, false);
  }
  return updatedShop;
}

/**
 * Reset staff PIN for a shop and update SHA-256 hash.
 */
export async function resetShopPin(idOrEmail, newPin) {
  const data = await apiRequest(`/api/shops/${encodeURIComponent(idOrEmail)}/reset-pin`, {
    method: 'POST',
    body: JSON.stringify({ pin: newPin })
  });

  const updatedShop = data.shop;
  if (updatedShop) {
    await syncShopToFirestore(updatedShop, false);
    return updatedShop.pinHash;
  }
  return await hashPin(newPin);
}

/**
 * Delete a shop record (and cascading owner data) from DBMS & Firestore.
 */
export async function deleteShop(idOrEmail) {
  const existing = await getShopById(idOrEmail);
  await apiRequest(`/api/shops/${encodeURIComponent(idOrEmail)}`, {
    method: 'DELETE'
  });

  if (isLiveFirebase && db && auth?.currentUser && existing) {
    try {
      const emailKey = existing.emailKey || (await emailToDocKey(existing.email));
      await withTimeout(
        Promise.all([
          deleteDoc(doc(db, SHOPS_COLLECTION, existing.shopId)),
          deleteDoc(doc(db, OWNERS_COLLECTION, emailKey))
        ]),
        4000,
        'Firestore delete sync'
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `${SHOPS_COLLECTION}/${idOrEmail}`);
    }
  }

  return true;
}
