import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
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

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

function createPersistentFirestore(): Firestore {
  try {
    if (typeof window !== 'undefined') {
      return initializeFirestore(
        app,
        {
          localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager(),
          }),
        },
        firebaseConfig.firestoreDatabaseId
      );
    }
  } catch (_) {
    // Fallback when Firestore is already initialized or IndexedDB unavailable
  }
  return getFirestore(app, firebaseConfig.firestoreDatabaseId);
}

export const db = createPersistentFirestore();
export const auth = getAuth(app);

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
  testConnection();
}

export async function signInWithGoogleFirebase() {
  const provider = new GoogleAuthProvider();
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
    const snap = await getDoc(ref);
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
  },
  _isNew: boolean = false,
  skipUpdateIfExists: boolean = false
) {
  if (!auth.currentUser) return false;
  const emailKey = (shop.emailKey || shop.email.toLowerCase().replace(/[^a-z0-9]/g, '_')).slice(0, 128);
  const status = shop.isActive ? 'active' : 'inactive';
  const ownerUid = (
    shop.ownerUid ||
    (auth.currentUser.email?.toLowerCase() === shop.email.toLowerCase() ? auth.currentUser.uid : '')
  ).slice(0, 128);

  const shopRef = doc(db, 'shops', shop.shopId);
  const ownerRef = doc(db, 'shop_owners', emailKey);

  let shopExists = false;
  let ownerExists = false;
  try {
    const [shopSnap, ownerSnap] = await Promise.all([getDoc(shopRef), getDoc(ownerRef)]);
    shopExists = shopSnap.exists();
    ownerExists = ownerSnap.exists();
  } catch (_) {}

  if (!shopExists) {
    try {
      await setDoc(shopRef, {
        shopId: shop.shopId.slice(0, 64),
        shopName: shop.shopName.slice(0, 150),
        ownerName: shop.ownerName.slice(0, 100),
        ownerEmail: shop.email.slice(0, 120),
        email: shop.email.slice(0, 120),
        ownerUid,
        emailKey,
        phone: shop.phone.slice(0, 25),
        address: shop.address.slice(0, 300),
        gstin: (shop.gstin || '').slice(0, 30),
        pinHash: (shop.pinHash || '0000000000000000').slice(0, 128),
        status,
        isActive: shop.isActive,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      throw handleFirestoreError(error, OperationType.CREATE, `shops/${shop.shopId}`);
    }
  } else if (!skipUpdateIfExists) {
    try {
      await updateDoc(shopRef, {
        shopName: shop.shopName.slice(0, 150),
        phone: shop.phone.slice(0, 25),
        address: shop.address.slice(0, 300),
        gstin: (shop.gstin || '').slice(0, 30),
        ...(shop.pinHash && shop.pinHash.length >= 16
          ? { pinHash: shop.pinHash.slice(0, 128) }
          : {}),
        ...(ownerUid ? { ownerUid } : {}),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      throw handleFirestoreError(error, OperationType.UPDATE, `shops/${shop.shopId}`);
    }
  }

  if (!ownerExists) {
    try {
      await setDoc(ownerRef, {
        email: shop.email.slice(0, 120),
        emailKey,
        shopId: shop.shopId.slice(0, 64),
        ownerUid,
        ownerName: shop.ownerName.slice(0, 100),
        shopName: shop.shopName.slice(0, 150),
        phone: shop.phone.slice(0, 25),
        address: shop.address.slice(0, 300),
        gstin: (shop.gstin || '').slice(0, 30),
        tagline: (shop.tagline || 'Fast & Reliable In-Store Billing').slice(0, 150),
        taxRatePercent: Number(shop.taxRatePercent ?? 5.0),
        currencySymbol: (shop.currencySymbol || '₹').slice(0, 10),
        status,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      throw handleFirestoreError(error, OperationType.CREATE, `shop_owners/${emailKey}`);
    }
  } else if (!skipUpdateIfExists) {
    try {
      await updateDoc(ownerRef, {
        shopName: shop.shopName.slice(0, 150),
        phone: shop.phone.slice(0, 25),
        address: shop.address.slice(0, 300),
        gstin: (shop.gstin || '').slice(0, 30),
        tagline: (shop.tagline || 'Fast & Reliable In-Store Billing').slice(0, 150),
        taxRatePercent: Number(shop.taxRatePercent ?? 5.0),
        currencySymbol: (shop.currencySymbol || '₹').slice(0, 10),
        ...(ownerUid ? { ownerUid } : {}),
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
}): Promise<boolean> {
  if (!auth.currentUser) return false;
  return await syncShopRecordToFirestore(shop, false, true);
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
  try {
    await setDoc(doc(db, 'shop_owners', ownerEmailKey, 'items', item.id), {
      id: item.id.slice(0, 64),
      ...(item.shopId ? { shopId: item.shopId.slice(0, 64) } : {}),
      ownerEmail: ownerEmail.slice(0, 120),
      ownerUid: auth.currentUser.uid,
      name: item.name.slice(0, 150),
      code: (item.code || '').slice(0, 40),
      price: Math.max(0, Number(item.price) || 0),
      stock: Math.max(0, Number(item.stock) || 0),
      category: (item.category || 'General').slice(0, 60),
      unit: item.unit === 'kg' ? 'kg' : 'pcs',
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    throw handleFirestoreError(error, OperationType.WRITE, path);
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
  try {
    try {
      const existingSnap = await getDoc(billRef);
      if (existingSnap.exists()) {
        return true;
      }
    } catch (_) {}
    const validMethod = ['Cash', 'UPI', 'Card', 'Other'].includes(bill.paymentMethod)
      ? bill.paymentMethod
      : 'Cash';
    await setDoc(billRef, {
      id: bill.id.slice(0, 64),
      ...(bill.shopId ? { shopId: bill.shopId.slice(0, 64) } : {}),
      ownerEmail: ownerEmail.slice(0, 120),
      actorUid: auth.currentUser.uid,
      billNumber: bill.billNumber.slice(0, 40),
      items: (bill.items || []).slice(0, 100),
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
  const isBootstrappedAdmin = auth.currentUser.email?.toLowerCase() === 'shivamraj.in5@gmail.com';
  const ownerEmailNorm = (ownerEmailHint || auth.currentUser.email || '').trim().toLowerCase();

  try {
    const itemsRef = collection(db, 'shop_owners', emailKey, 'items');
    const billsRef = collection(db, 'shop_owners', emailKey, 'bills');
    const [ownerSnap, shopSnap, itemsSnap, billsSnap] = await Promise.all([
      getDoc(doc(db, 'shop_owners', emailKey)),
      shopId ? getDoc(doc(db, 'shops', shopId)) : Promise.resolve(null),
      getDocs(isBootstrappedAdmin ? itemsRef : query(itemsRef, where('ownerEmail', '==', ownerEmailNorm))),
      getDocs(isBootstrappedAdmin ? billsRef : query(billsRef, where('ownerEmail', '==', ownerEmailNorm))),
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

    const items = itemsSnap.docs.map((d) => {
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
    });

    const bills = billsSnap.docs.map((d) => {
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
    });

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
