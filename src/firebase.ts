import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  getDocFromServer,
  query,
  where,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

const viteEnv =
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env || {};

const resolvedFirebaseConfig = {
  ...firebaseConfig,
  ...(viteEnv.VITE_FIREBASE_API_KEY?.trim()
    ? { apiKey: viteEnv.VITE_FIREBASE_API_KEY.trim() }
    : {}),
  ...(viteEnv.VITE_FIREBASE_AUTH_DOMAIN?.trim()
    ? { authDomain: viteEnv.VITE_FIREBASE_AUTH_DOMAIN.trim() }
    : {}),
  ...(viteEnv.VITE_FIREBASE_PROJECT_ID?.trim()
    ? { projectId: viteEnv.VITE_FIREBASE_PROJECT_ID.trim() }
    : {}),
  ...(viteEnv.VITE_FIREBASE_APP_ID?.trim()
    ? { appId: viteEnv.VITE_FIREBASE_APP_ID.trim() }
    : {}),
  ...(viteEnv.VITE_FIREBASE_STORAGE_BUCKET?.trim()
    ? { storageBucket: viteEnv.VITE_FIREBASE_STORAGE_BUCKET.trim() }
    : {}),
  ...(viteEnv.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim()
    ? { messagingSenderId: viteEnv.VITE_FIREBASE_MESSAGING_SENDER_ID.trim() }
    : {}),
  ...(viteEnv.VITE_FIREBASE_DATABASE_ID?.trim()
    ? { firestoreDatabaseId: viteEnv.VITE_FIREBASE_DATABASE_ID.trim() }
    : {}),
};

const targetDatabaseId =
  resolvedFirebaseConfig.firestoreDatabaseId &&
  resolvedFirebaseConfig.firestoreDatabaseId !== '(default)'
    ? resolvedFirebaseConfig.firestoreDatabaseId
    : undefined;

const app = getApps().length === 0 ? initializeApp(resolvedFirebaseConfig) : getApp();

export const db: Firestore = targetDatabaseId
  ? getFirestore(app, targetDatabaseId)
  : getFirestore(app);
export const auth = getAuth(app);

export function getFirebaseClientMeta(): { projectId: string; authDomain: string } {
  return {
    projectId: String(resolvedFirebaseConfig.projectId || '').trim(),
    authDomain: String(resolvedFirebaseConfig.authDomain || '').trim(),
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): Error {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  return new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
if (typeof window !== 'undefined') {
  window.setTimeout(() => {
    void testConnection();
  }, 800);
}

async function getDocPreferServer(ref: ReturnType<typeof doc>) {
  try {
    return await Promise.race([
      getDocFromServer(ref),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Firestore server check timed out')), 4500)
      ),
    ]);
  } catch (_) {
    return await getDoc(ref);
  }
}

export async function signInWithGoogleFirebase(loginHintEmail?: string) {
  const provider = new GoogleAuthProvider();
  const customParams: Record<string, string> = {
    prompt: 'select_account',
  };
  const cleanHint = (loginHintEmail || '').trim().toLowerCase();
  if (cleanHint) {
    customParams.login_hint = cleanHint;
  }
  provider.setCustomParameters(customParams);
  return await signInWithPopup(auth, provider);
}

export async function signOutFirebase() {
  return await signOut(auth);
}

export async function syncUserProfileToFirestore(profile: {
  uid?: string;
  email: string;
  emailKey: string;
  displayName: string;
  role: 'owner' | 'employee' | 'admin';
  shopId: string;
  isActive: boolean;
}): Promise<boolean> {
  if (!auth.currentUser) return false;
  const uid = profile.uid || auth.currentUser.uid;
  const path = `users/${uid}`;
  const ref = doc(db, 'users', uid);

  let exists = false;
  try {
    const snap = await getDocPreferServer(ref);
    exists = snap.exists();
  } catch (_) {}

  try {
    if (!exists) {
      await setDoc(ref, {
        uid,
        email: profile.email.slice(0, 120),
        emailKey: profile.emailKey.slice(0, 128),
        displayName: profile.displayName.slice(0, 100),
        role: profile.role,
        shopId: profile.shopId.slice(0, 64),
        isActive: Boolean(profile.isActive),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        displayName: profile.displayName.slice(0, 100),
        updatedAt: serverTimestamp(),
      });
    }
    return true;
  } catch (error) {
    throw handleFirestoreError(error, exists ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function syncShopRecordToFirestore(
  shop: {
    shopId: string;
    shopName: string;
    ownerName: string;
    email: string;
    emailKey?: string;
    ownerUid?: string;
    phone: string;
    address: string;
    gstin?: string;
    pinHash?: string;
    isActive: boolean;
    tagline?: string;
    taxRatePercent?: number;
    currencySymbol?: string;
    updatedAt?: string;
  },
  _isNew: boolean = false,
  skipUpdateIfExists: boolean = false,
  syncIfNewerTimestamp: boolean = false
) {
  if (!auth.currentUser) return false;
  const normEmail = shop.email.trim().toLowerCase().slice(0, 120);
  const emailKey = (shop.emailKey || normEmail.replace(/[^a-z0-9]/g, '_')).slice(0, 128);
  const status = shop.isActive ? 'active' : 'inactive';
  const isSuperAdmin =
    auth.currentUser.email?.trim().toLowerCase() === 'shivamraj.in5@gmail.com';
  const ownerUid = (
    shop.ownerUid ||
    (auth.currentUser.email?.trim().toLowerCase() === normEmail ? auth.currentUser.uid : '')
  ).slice(0, 128);

  const shopRef = doc(db, 'shops', shop.shopId);
  const ownerRef = doc(db, 'shop_owners', emailKey);

  let shopExists = false;
  let ownerExists = false;
  let shopCloudUpdatedMs = 0;
  let ownerCloudUpdatedMs = 0;
  try {
    const [shopSnap, ownerSnap] = await Promise.all([
      getDocPreferServer(shopRef),
      getDocPreferServer(ownerRef),
    ]);
    shopExists = shopSnap.exists();
    ownerExists = ownerSnap.exists();
    if (shopExists) {
      const iso = firestoreTimestampToIso(shopSnap.data()?.updatedAt);
      shopCloudUpdatedMs = iso ? new Date(iso).getTime() : 0;
    }
    if (ownerExists) {
      const iso = firestoreTimestampToIso(ownerSnap.data()?.updatedAt);
      ownerCloudUpdatedMs = iso ? new Date(iso).getTime() : 0;
    }
  } catch (_) {}

  const localUpdatedMs = shop.updatedAt ? new Date(shop.updatedAt).getTime() : 0;
  const shouldUpdateShop =
    !skipUpdateIfExists || (syncIfNewerTimestamp && localUpdatedMs > shopCloudUpdatedMs + 2000);
  const shouldUpdateOwner =
    !skipUpdateIfExists || (syncIfNewerTimestamp && localUpdatedMs > ownerCloudUpdatedMs + 2000);

  if (!shopExists) {
    try {
      await setDoc(shopRef, {
        shopId: shop.shopId.slice(0, 64),
        shopName: shop.shopName.slice(0, 150),
        ownerName: shop.ownerName.slice(0, 100),
        ownerEmail: normEmail,
        email: normEmail,
        ownerUid,
        emailKey,
        phone: String(shop.phone ?? '').slice(0, 25),
        address: String(shop.address ?? '').slice(0, 300),
        gstin: String(shop.gstin || '').slice(0, 30),
        pinHash: (shop.pinHash || '0000000000000000').slice(0, 128),
        status,
        isActive: shop.isActive,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      throw handleFirestoreError(error, OperationType.CREATE, `shops/${shop.shopId}`);
    }
  } else if (shouldUpdateShop) {
    try {
      await updateDoc(shopRef, {
        shopName: shop.shopName.slice(0, 150),
        phone: String(shop.phone ?? '').slice(0, 25),
        address: String(shop.address ?? '').slice(0, 300),
        gstin: String(shop.gstin || '').slice(0, 30),
        ...(shop.pinHash && shop.pinHash.length >= 16
          ? { pinHash: shop.pinHash.slice(0, 128) }
          : {}),
        ...(ownerUid ? { ownerUid } : {}),
        ...(isSuperAdmin ? { status, isActive: shop.isActive } : {}),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      throw handleFirestoreError(error, OperationType.UPDATE, `shops/${shop.shopId}`);
    }
  }

  if (!ownerExists) {
    try {
      await setDoc(ownerRef, {
        email: normEmail,
        emailKey,
        shopId: shop.shopId.slice(0, 64),
        ownerUid,
        ownerName: shop.ownerName.slice(0, 100),
        shopName: shop.shopName.slice(0, 150),
        phone: String(shop.phone ?? '').slice(0, 25),
        address: String(shop.address ?? '').slice(0, 300),
        gstin: String(shop.gstin || '').slice(0, 30),
        tagline: (shop.tagline || 'Fast & Reliable In-Store Billing').slice(0, 150),
        taxRatePercent: Math.min(100, Math.max(0, Number(shop.taxRatePercent ?? 5.0) || 0)),
        currencySymbol: (shop.currencySymbol || '₹').slice(0, 10),
        status,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      throw handleFirestoreError(error, OperationType.CREATE, `shop_owners/${emailKey}`);
    }
  } else if (shouldUpdateOwner) {
    try {
      await updateDoc(ownerRef, {
        shopName: shop.shopName.slice(0, 150),
        phone: String(shop.phone ?? '').slice(0, 25),
        address: String(shop.address ?? '').slice(0, 300),
        gstin: String(shop.gstin || '').slice(0, 30),
        tagline: (shop.tagline || 'Fast & Reliable In-Store Billing').slice(0, 150),
        taxRatePercent: Math.min(100, Math.max(0, Number(shop.taxRatePercent ?? 5.0) || 0)),
        currencySymbol: (shop.currencySymbol || '₹').slice(0, 10),
        ...(ownerUid ? { ownerUid } : {}),
        ...(isSuperAdmin ? { status } : {}),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      throw handleFirestoreError(error, OperationType.UPDATE, `shop_owners/${emailKey}`);
    }
  }

  return true;
}

export async function ensureOwnerWorkspaceInFirestore(shop: {
  shopId: string;
  shopName: string;
  ownerName: string;
  email: string;
  emailKey?: string;
  ownerUid?: string;
  phone: string;
  address: string;
  gstin?: string;
  pinHash?: string;
  isActive: boolean;
  tagline?: string;
  taxRatePercent?: number;
  currencySymbol?: string;
  updatedAt?: string;
}): Promise<boolean> {
  if (!auth.currentUser) return false;
  return await syncShopRecordToFirestore(shop, false, true, true);
}

export async function syncItemToFirestore(
  ownerEmailKey: string,
  ownerEmail: string,
  item: {
    id: string;
    shopId?: string;
    name: string;
    code: string;
    price: number;
    stock: number;
    category: string;
    unit: 'pcs' | 'kg';
  }
) {
  if (!auth.currentUser) return false;
  const path = `shop_owners/${ownerEmailKey}/items/${item.id}`;
  const itemRef = doc(db, 'shop_owners', ownerEmailKey, 'items', item.id);
  const normOwnerEmail = ownerEmail.trim().toLowerCase().slice(0, 120);
  const callerEmail = (auth.currentUser.email || '').trim().toLowerCase();
  const isOwnerOrAdmin =
    callerEmail === normOwnerEmail || callerEmail === 'shivamraj.in5@gmail.com';

  let existingData: Record<string, unknown> | null = null;
  try {
    const snap = await getDocPreferServer(itemRef);
    if (snap.exists()) {
      existingData = snap.data() as Record<string, unknown>;
    }
  } catch (_) {}

  try {
    if (!existingData) {
      await setDoc(itemRef, {
        id: item.id.slice(0, 64),
        ...(item.shopId && item.shopId.trim().length >= 2 ? { shopId: item.shopId.trim().slice(0, 64) } : {}),
        ownerEmail: normOwnerEmail,
        ownerUid: auth.currentUser.uid,
        name: (item.name || 'Item').slice(0, 150),
        code: (item.code || '').slice(0, 40),
        price: Math.max(0, Number(item.price) || 0),
        stock: Math.max(0, Number(item.stock) || 0),
        category: (item.category || 'General').slice(0, 60),
        unit: item.unit === 'kg' ? 'kg' : 'pcs',
        updatedAt: serverTimestamp(),
      });
    } else if (!isOwnerOrAdmin && existingData.ownerUid !== auth.currentUser.uid) {
      // Employee stock deduction update satisfies affectedKeys().hasOnly(['stock', 'updatedAt'])
      await updateDoc(itemRef, {
        stock: Math.max(0, Number(item.stock) || 0),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(itemRef, {
        ...(item.shopId && item.shopId.trim().length >= 2 ? { shopId: item.shopId.trim().slice(0, 64) } : {}),
        ownerUid:
          typeof existingData.ownerUid === 'string' && existingData.ownerUid
            ? existingData.ownerUid
            : auth.currentUser.uid,
        name: (item.name || 'Item').slice(0, 150),
        code: (item.code || '').slice(0, 40),
        price: Math.max(0, Number(item.price) || 0),
        stock: Math.max(0, Number(item.stock) || 0),
        category: (item.category || 'General').slice(0, 60),
        unit: item.unit === 'kg' ? 'kg' : 'pcs',
        updatedAt: serverTimestamp(),
      });
    }
    return true;
  } catch (error) {
    throw handleFirestoreError(error, existingData ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function deleteItemFromFirestore(ownerEmailKey: string, itemId: string) {
  if (!auth.currentUser) return false;
  const path = `shop_owners/${ownerEmailKey}/items/${itemId}`;
  try {
    await deleteDoc(doc(db, 'shop_owners', ownerEmailKey, 'items', itemId));
    return true;
  } catch (error) {
    throw handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function syncBillToFirestore(
  ownerEmailKey: string,
  ownerEmail: string,
  bill: {
    id: string;
    shopId?: string;
    billNumber: string;
    items: unknown[];
    subtotal: number;
    discountAmount: number;
    taxAmount: number;
    grandTotal: number;
    paymentMethod: string;
    cashierName: string;
    customerName?: string;
    customerPhone?: string;
  }
) {
  if (!auth.currentUser) return false;
  const path = `shop_owners/${ownerEmailKey}/bills/${bill.id}`;
  const billRef = doc(db, 'shop_owners', ownerEmailKey, 'bills', bill.id);
  const normOwnerEmail = ownerEmail.trim().toLowerCase().slice(0, 120);
  try {
    try {
      const existingSnap = await getDocPreferServer(billRef);
      if (existingSnap.exists()) {
        return true;
      }
    } catch (_) {}
    const validMethod = ['Cash', 'UPI', 'Card', 'Other'].includes(bill.paymentMethod)
      ? bill.paymentMethod
      : 'Cash';
    const cleanItems = (Array.isArray(bill.items) ? bill.items : [])
      .slice(0, 100)
      .map((raw) => {
        const line = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
        return {
          itemId: String(line.itemId || line.id || 'item').slice(0, 64),
          name: String(line.name || 'Item').slice(0, 150),
          code: String(line.code || '').slice(0, 40),
          unitPrice: Math.max(0, Number(line.unitPrice ?? line.price) || 0),
          quantity: Math.max(0, Number(line.quantity ?? line.qty) || 0),
          unit: line.unit === 'kg' ? 'kg' : 'pcs',
        };
      });
    await setDoc(billRef, {
      id: bill.id.slice(0, 64),
      ...(bill.shopId && bill.shopId.trim().length >= 2 ? { shopId: bill.shopId.trim().slice(0, 64) } : {}),
      ownerEmail: normOwnerEmail,
      actorUid: auth.currentUser.uid,
      billNumber: bill.billNumber.slice(0, 40),
      items: cleanItems,
      subtotal: Math.max(0, Number(bill.subtotal) || 0),
      discountAmount: Math.max(0, Number(bill.discountAmount) || 0),
      taxAmount: Math.max(0, Number(bill.taxAmount) || 0),
      grandTotal: Math.max(0, Number(bill.grandTotal) || 0),
      paymentMethod: validMethod,
      cashierName: (bill.cashierName || 'Staff Cashier').slice(0, 100),
      customerName: (bill.customerName || '').slice(0, 100),
      customerPhone: (bill.customerPhone || '').slice(0, 25),
      createdAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    throw handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function syncAuditLogToFirestore(log: {
  id: string;
  shopId: string;
  actorRole: 'owner' | 'employee' | 'admin' | 'system';
  action: string;
  targetType: string;
  targetId: string;
  beforeData?: unknown;
  afterData?: unknown;
}): Promise<boolean> {
  if (!auth.currentUser) return false;
  const path = `audit_logs/${log.id}`;
  try {
    await setDoc(doc(db, 'audit_logs', log.id), {
      id: log.id.slice(0, 80),
      shopId: log.shopId.slice(0, 64),
      actorUid: auth.currentUser.uid,
      actorEmail: (auth.currentUser.email || 'unknown').slice(0, 120),
      actorRole: log.actorRole,
      action: log.action.slice(0, 64),
      targetType: log.targetType.slice(0, 40),
      targetId: log.targetId.slice(0, 128),
      ...(log.beforeData !== undefined && log.beforeData !== null
        ? { beforeData: JSON.stringify(log.beforeData).slice(0, 2000) }
        : {}),
      ...(log.afterData !== undefined && log.afterData !== null
        ? { afterData: JSON.stringify(log.afterData).slice(0, 2000) }
        : {}),
      createdAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    throw handleFirestoreError(error, OperationType.CREATE, path);
  }
}

function firestoreTimestampToIso(val: unknown): string | undefined {
  if (!val) return undefined;
  if (typeof val === 'string') return val;
  if (typeof val === 'object' && val !== null) {
    const maybe = val as { toDate?: () => Date; seconds?: number };
    if (typeof maybe.toDate === 'function') {
      return maybe.toDate().toISOString();
    }
    if (typeof maybe.seconds === 'number') {
      return new Date(maybe.seconds * 1000).toISOString();
    }
  }
  return undefined;
}

export async function pullFirestoreWorkspace(
  emailKey: string,
  shopId?: string,
  ownerEmailHint?: string
) {
  if (!auth.currentUser) {
    throw new Error('Sign in with Google first to sync from Cloud Firestore.');
  }
  const ownerPath = `shop_owners/${emailKey}`;
  const callerEmailNorm = (auth.currentUser.email || '').trim().toLowerCase();
  const isBootstrappedAdmin = callerEmailNorm === 'shivamraj.in5@gmail.com';
  const ownerEmailNorm = (ownerEmailHint || callerEmailNorm).trim().toLowerCase();
  const canQueryOwnerSubcollections = isBootstrappedAdmin || callerEmailNorm === ownerEmailNorm;

  try {
    const itemsRef = collection(db, 'shop_owners', emailKey, 'items');
    const billsRef = collection(db, 'shop_owners', emailKey, 'bills');
    const [ownerSnap, shopSnap, itemsSnap, billsSnap] = await Promise.all([
      getDocPreferServer(doc(db, 'shop_owners', emailKey)),
      shopId ? getDocPreferServer(doc(db, 'shops', shopId)) : Promise.resolve(null),
      canQueryOwnerSubcollections
        ? getDocs(isBootstrappedAdmin ? itemsRef : query(itemsRef, where('ownerEmail', '==', ownerEmailNorm)))
        : Promise.resolve(null),
      canQueryOwnerSubcollections
        ? getDocs(isBootstrappedAdmin ? billsRef : query(billsRef, where('ownerEmail', '==', ownerEmailNorm)))
        : Promise.resolve(null),
    ]);

    const ownerData = ownerSnap.exists() ? (ownerSnap.data() as Record<string, unknown>) : null;
    const shopData = shopSnap && shopSnap.exists() ? (shopSnap.data() as Record<string, unknown>) : null;

    const mergedUpdatedAt =
      firestoreTimestampToIso(shopData?.updatedAt) ||
      firestoreTimestampToIso(ownerData?.updatedAt);

    const shop =
      ownerData || shopData
        ? {
            shopName: String(ownerData?.shopName || shopData?.shopName || ''),
            ownerName: String(ownerData?.ownerName || shopData?.ownerName || ''),
            phone: String(ownerData?.phone ?? shopData?.phone ?? ''),
            address: String(ownerData?.address ?? shopData?.address ?? ''),
            gstin: String(ownerData?.gstin ?? shopData?.gstin ?? ''),
            tagline: typeof ownerData?.tagline === 'string' ? ownerData.tagline : undefined,
            taxRatePercent:
              typeof ownerData?.taxRatePercent === 'number' ? ownerData.taxRatePercent : undefined,
            currencySymbol:
              typeof ownerData?.currencySymbol === 'string' ? ownerData.currencySymbol : undefined,
            pinHash: typeof shopData?.pinHash === 'string' ? shopData.pinHash : undefined,
            status: (shopData?.status || ownerData?.status) === 'inactive' ? ('inactive' as const) : ('active' as const),
            isActive: shopData?.isActive !== false && ownerData?.status !== 'inactive',
            updatedAt: mergedUpdatedAt,
          }
        : null;

    const items = itemsSnap
      ? itemsSnap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          return {
            id: String(data.id || d.id),
            name: String(data.name || ''),
            code: String(data.code || ''),
            price: Number(data.price) || 0,
            stock: Number(data.stock) || 0,
            category: String(data.category || 'General'),
            unit: data.unit === 'kg' ? ('kg' as const) : ('pcs' as const),
            updatedAt: firestoreTimestampToIso(data.updatedAt),
          };
        })
      : [];

    const bills = billsSnap
      ? billsSnap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          return {
            id: String(data.id || d.id),
            billNumber: String(data.billNumber || ''),
            createdAt: firestoreTimestampToIso(data.createdAt),
            customerName: String(data.customerName || ''),
            customerPhone: String(data.customerPhone || ''),
            subtotal: Number(data.subtotal) || 0,
            discountAmount: Number(data.discountAmount) || 0,
            taxAmount: Number(data.taxAmount) || 0,
            grandTotal: Number(data.grandTotal) || 0,
            paymentMethod: String(data.paymentMethod || 'Cash'),
            cashierName: String(data.cashierName || ''),
            actorUid: String(data.actorUid || ''),
            items: Array.isArray(data.items) ? data.items : [],
          };
        })
      : [];

    return { shop, items, bills };
  } catch (error) {
    throw handleFirestoreError(error, OperationType.GET, ownerPath);
  }
}

export async function exportFirestoreShopData(emailKey: string) {
  if (!auth.currentUser) {
    throw new Error('Sign in with Google first to export directly from Cloud Firestore.');
  }
  return await pullFirestoreWorkspace(emailKey);
}
