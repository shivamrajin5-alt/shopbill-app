import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Receipt,
  Store,
  ShoppingCart,
  Plus,
  Minus,
  Search,
  Trash2,
  Edit,
  CheckCircle2,
  Printer,
  Share2,
  ArrowLeft,
  Settings,
  BarChart3,
  Users,
  LogOut,
  Copy,
  Check,
  FileCode,
  Folder,
  Smartphone,
  Maximize2,
  Minimize2,
  Calendar,
  CreditCard,
  Banknote,
  QrCode,
  Package,
  TrendingUp,
  Tag,
  ShieldCheck,
  ChevronRight,
  Eye,
  EyeOff,
  RefreshCw,
  X,
  Scale,
  ShieldAlert,
  Key,
  Lock,
  Building2,
  UserPlus,
  Mail,
  Cloud,
  CloudOff,
  WifiOff,
  Wifi,
} from 'lucide-react';
import {
  ShopOwnerRecord,
  updateShopOwner,
  toggleShopOwnerStatus,
  deleteShopOwner,
} from './utils/admin';
import {
  auth,
  signInWithGoogleFirebase,
  signOutFirebase,
  syncShopRecordToFirestore,
  ensureOwnerWorkspaceInFirestore,
  syncUserProfileToFirestore,
  exportFirestoreShopData,
  deleteItemFromFirestore,
} from './firebase';
import {
  loginAdminInDb,
  logoutAdminInDb,
  fetchAllShops,
  registerShopInDb,
  toggleShopStatusInDb,
  resetShopPinByAdminInDb,
  resetOwnShopPinInDb,
  deleteShopInDb,
  fetchAdminAuditLogsInDb,
  fetchOwnerAuditLogsInDb,
  fetchEmployeesInDb,
  addEmployeeInDb,
  updateEmployeeInDb,
  toggleEmployeeStatusInDb,
  resetEmployeePinInDb,
  deleteEmployeeInDb,
  exportShopBackupInDb,
  fetchBackupHistoryInDb,
  restoreShopBackupInDb,
  verifyOwnerEmailInDb,
  loginShopInDb,
  syncCloudShopBeforeLoginInDb,
  logoutOwnerInDb,
  fetchOwnerWorkspace,
  saveOwnerSettingsInDb,
  saveOwnerItemInDb,
  deleteOwnerItemInDb,
  createOwnerBillInDb,
  type ApiShopRecord,
  type ApiUserRecord,
  type ApiAuditLogRecord,
  type ApiBackupHistoryRecord,
  type EmailVerificationResult,
} from './services/shopApi';
import {
  bufferOfflineBillInBrowser,
  formatCloudSyncError,
  getBrowserBufferedCount,
  getOfflineBillsForOwner,
  isCloudSyncAuthorizedForEmail,
  isMatchingCloudEmail,
  loadLastSyncedAt,
  loadOfflineQueue,
  mergeOfflineAndDbBills,
  runOfflineToFirestoreSync,
  shouldAutoSync,
  summarizeSyncState,
  SUPER_ADMIN_EMAIL,
} from './utils/syncEngine';
import { EmployeesView } from './components/EmployeesView';
import { AuditLogsView } from './components/AuditLogsView';
import { BackupRestoreView } from './components/BackupRestoreView';
import { InvoicePdfControls } from './components/InvoicePdfControls';
import { BillKartLogo } from './components/BillKartLogo';
import { PWAInstallButton } from './components/PWAInstallButton';
import { usePWAInstall } from './hooks/usePWAInstall';
import {
  downloadInvoicePdf,
  generateInvoiceQrDataUrl,
  printInvoiceReceipt,
  type InvoicePrintFormat,
} from './utils/invoicePdf';
import { computeBackupSummarySignature, type ShopBackupBundle } from './utils/backupRestore';

export type ItemUnit = 'pcs' | 'kg';

// Data types
export interface ShopItem {
  id: string;
  name: string;
  code: string;
  price: number; // per piece or per kg
  stock: number;
  category: string;
  unit: ItemUnit;
  updatedAt?: string;
  syncStatus?: 'pending' | 'synced';
  syncedAt?: string | null;
  syncError?: string | null;
}

export interface BillItemEntry {
  itemId: string;
  name: string;
  code: string;
  unitPrice: number;
  quantity: number; // in pcs or kg (e.g. 0.5 for 500g)
  unit: ItemUnit;
}

export type PaymentMode = 'Cash' | 'UPI' | 'Card' | 'Other';

export interface BillRecord {
  id: string;
  billNumber: string;
  createdAt: string;
  items: BillItemEntry[];
  customerName?: string;
  customerPhone?: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  grandTotal: number;
  paymentMethod: PaymentMode;
  cashierName: string;
  syncStatus?: 'pending' | 'synced';
  syncedAt?: string | null;
  syncError?: string | null;
}

export interface UserProfile {
  id: string;
  name: string;
  role: 'owner' | 'employee';
  pin: string;
}

// Initial In-Memory Seed Data with Weight-based items (kg/g)
const INITIAL_ITEMS: ShopItem[] = [
  { id: 'i1', name: 'Basmati Rice', code: 'BR101', price: 120.0, stock: 45, category: 'Groceries', unit: 'kg' },
  { id: 'i2', name: 'Refined Sugar', code: 'RS105', price: 46.0, stock: 80, category: 'Groceries', unit: 'kg' },
  { id: 'i3', name: 'Detergent Powder', code: 'DP109', price: 140.0, stock: 50, category: 'Cleaning', unit: 'kg' },
  { id: 'i4', name: 'Whole Wheat Flour', code: 'WF104', price: 46.0, stock: 100, category: 'Groceries', unit: 'kg' },
  { id: 'i5', name: 'Sunflower Oil 1L', code: 'SO102', price: 165.0, stock: 30, category: 'Groceries', unit: 'pcs' },
  { id: 'i6', name: 'Tata Tea Gold 500g', code: 'TG103', price: 290.0, stock: 25, category: 'Beverages', unit: 'pcs' },
  { id: 'i7', name: 'Milk Bread 400g', code: 'MB106', price: 45.0, stock: 15, category: 'Bakery', unit: 'pcs' },
  { id: 'i8', name: 'Amul Butter 100g', code: 'AB107', price: 58.0, stock: 35, category: 'Dairy', unit: 'pcs' },
  { id: 'i9', name: 'Instant Coffee 100g', code: 'IC108', price: 195.0, stock: 20, category: 'Beverages', unit: 'pcs' },
  { id: 'i10', name: 'Dishwash Bar 250g', code: 'DB110', price: 30.0, stock: 65, category: 'Cleaning', unit: 'pcs' },
  { id: 'i11', name: 'Toothpaste 150g', code: 'TP111', price: 95.0, stock: 40, category: 'Personal Care', unit: 'pcs' },
  { id: 'i12', name: 'Bath Soap 125g Pack of 4', code: 'BS112', price: 175.0, stock: 28, category: 'Personal Care', unit: 'pcs' },
];

const INITIAL_USERS: UserProfile[] = [
  { id: 'u1', name: 'Rajesh Sharma', role: 'owner', pin: '1234' },
  { id: 'u2', name: 'Sunil Kumar', role: 'employee', pin: '0000' },
];

const INITIAL_BILLS: BillRecord[] = [
  {
    id: 'b1',
    billNumber: 'SB-1001',
    createdAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    items: [
      { itemId: 'i1', name: 'Basmati Rice', code: 'BR101', unitPrice: 120.0, quantity: 1.5, unit: 'kg' }, // 180
      { itemId: 'i5', name: 'Sunflower Oil 1L', code: 'SO102', unitPrice: 165.0, quantity: 1, unit: 'pcs' }, // 165
    ],
    customerName: 'Anil Verma',
    customerPhone: '9811223344',
    subtotal: 345.0,
    discountAmount: 20.0,
    taxAmount: 0.0,
    grandTotal: 325.0,
    paymentMethod: 'UPI',
    cashierName: 'Rajesh Sharma',
  },
  {
    id: 'b2',
    billNumber: 'SB-1002',
    createdAt: new Date(Date.now() - 1.5 * 3600 * 1000).toISOString(),
    items: [
      { itemId: 'i6', name: 'Tata Tea Gold 500g', code: 'TG103', unitPrice: 290.0, quantity: 1, unit: 'pcs' },
      { itemId: 'i2', name: 'Refined Sugar', code: 'RS105', unitPrice: 46.0, quantity: 0.5, unit: 'kg' }, // 500g = 23
      { itemId: 'i8', name: 'Amul Butter 100g', code: 'AB107', unitPrice: 58.0, quantity: 1, unit: 'pcs' },
    ],
    customerName: 'Priya Mehta',
    customerPhone: '9877001122',
    subtotal: 371.0,
    discountAmount: 0.0,
    taxAmount: 0.0,
    grandTotal: 371.0,
    paymentMethod: 'Cash',
    cashierName: 'Sunil Kumar',
  },
  {
    id: 'b3',
    billNumber: 'SB-1003',
    createdAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
    items: [
      { itemId: 'i4', name: 'Whole Wheat Flour', code: 'WF104', unitPrice: 46.0, quantity: 5.0, unit: 'kg' },
      { itemId: 'i3', name: 'Detergent Powder', code: 'DP109', unitPrice: 140.0, quantity: 2.0, unit: 'kg' },
    ],
    customerName: 'Kavita Singh',
    customerPhone: '9988776655',
    subtotal: 510.0,
    discountAmount: 30.0,
    taxAmount: 24.0,
    grandTotal: 504.0,
    paymentMethod: 'Card',
    cashierName: 'Rajesh Sharma',
  },
];

const INITIAL_SHOP_OWNERS: ShopOwnerRecord[] = [
  {
    id: 'SB-1001',
    shopId: 'SB-1001',
    ownerName: 'Rajesh Sharma',
    email: 'rajesh@quickmart.in',
    phone: '+91 98765 43210',
    pin: '1234',
    shopName: 'QuickMart Store',
    address: 'Shop No. 12, Main Market Road, Central Plaza',
    gstin: '27ABCDE1234F1Z5',
    registeredAt: new Date(Date.now() - 45 * 86400000).toISOString(),
    isActive: true,
    totalBillsCount: 3,
    totalRevenue: 1200.0,
  },
  {
    id: 'SB-1002',
    shopId: 'SB-1002',
    ownerName: 'Amit Patel',
    email: 'amit@pateldairy.in',
    phone: '+91 98220 11223',
    pin: '5566',
    shopName: 'Patel Provision & Dairy',
    address: 'B-14 Anand Complex, Station Road',
    gstin: '24AAACP1234A1Z1',
    registeredAt: new Date(Date.now() - 20 * 86400000).toISOString(),
    isActive: true,
    totalBillsCount: 18,
    totalRevenue: 8450.0,
  },
  {
    id: 'SB-1003',
    shopId: 'SB-1003',
    ownerName: 'Neha Verma',
    email: 'neha@dailyfresh.in',
    phone: '+91 99881 22334',
    pin: '7788',
    shopName: 'DailyFresh Supermarket',
    address: '45 Green Park, Ring Road',
    gstin: '07AAPCN9876Q1Z9',
    registeredAt: new Date(Date.now() - 8 * 86400000).toISOString(),
    isActive: true,
    totalBillsCount: 34,
    totalRevenue: 19680.0,
  },
  {
    id: 'SB-1004',
    shopId: 'SB-1004',
    ownerName: 'Vikram Sharma',
    email: 'vikram@sharmaelec.in',
    phone: '+91 91234 56789',
    pin: '9999',
    shopName: 'Sharma Electronics (Suspended)',
    address: 'Plot 22, Commercial Phase II',
    gstin: '06AAACS4567B1Z2',
    registeredAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    isActive: false, // Suspended shop to test deactivated login rejection
    totalBillsCount: 0,
    totalRevenue: 0,
  },
];

type AppScreen =
  | 'splash'
  | 'login'
  | 'home'
  | 'items'
  | 'add_edit_item'
  | 'new_bill'
  | 'bill_success'
  | 'invoice_preview'
  | 'bills'
  | 'bill_details'
  | 'reports'
  | 'settings'
  | 'employees'
  | 'audit_logs'
  | 'backup_restore'
  | 'admin_login'
  | 'admin_panel'
  | 'admin_audit_logs';

function isRunningInIframe(): boolean {
  try {
    return typeof window !== 'undefined' && window.self !== window.top;
  } catch (_) {
    return true;
  }
}

export function formatQtyDisplay(quantity: number, unit: ItemUnit = 'pcs'): string {
  if (unit === 'kg') {
    if (quantity < 1 && quantity > 0) {
      return `${Math.round(quantity * 1000)} g`;
    }
    const clean = Number(quantity.toFixed(3));
    return `${clean} kg`;
  }
  return `${Number(quantity.toFixed(2))} pcs`;
}

export default function App() {
  // App State - Start at login screen with Shop ID & PIN authentication
  const [currentScreen, setCurrentScreen] = useState<AppScreen>('login');
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [users, setUsers] = useState<UserProfile[]>(INITIAL_USERS);
  const [items, setItems] = useState<ShopItem[]>(INITIAL_ITEMS);
  const [bills, setBills] = useState<BillRecord[]>(INITIAL_BILLS);
  const [activeBill, setActiveBill] = useState<BillRecord | null>(INITIAL_BILLS[0]);
  const [editingItem, setEditingItem] = useState<ShopItem | null>(null);

  // Developer & Multi-Tenant DBMS State
  const [shopOwners, setShopOwners] = useState<ShopOwnerRecord[]>([]);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(false);
  const [activeOwnerEmail, setActiveOwnerEmail] = useState<string>('');
  const [activeOwnerEmailKey, setActiveOwnerEmailKey] = useState<string>('');
  const [activeUserEmail, setActiveUserEmail] = useState<string>('');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [employees, setEmployees] = useState<ApiUserRecord[]>([]);
  const [shopAuditLogs, setShopAuditLogs] = useState<ApiAuditLogRecord[]>([]);
  const [adminAuditLogs, setAdminAuditLogs] = useState<ApiAuditLogRecord[]>([]);
  const [backupHistory, setBackupHistory] = useState<ApiBackupHistoryRecord[]>([]);
  const [cloudUserEmail, setCloudUserEmail] = useState<string | null>(auth.currentUser?.email ?? null);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [autoSyncNotice, setAutoSyncNotice] = useState<string | null>(null);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const activeOwnerEmailRef = useRef(activeOwnerEmail);
  activeOwnerEmailRef.current = activeOwnerEmail;
  const activeUserEmailRef = useRef(activeUserEmail);
  activeUserEmailRef.current = activeUserEmail;
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;
  const isSyncingRef = useRef(isSyncing);
  isSyncingRef.current = isSyncing;
  const billsRef = useRef(bills);
  billsRef.current = bills;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const isAdminAuthRef = useRef(isAdminAuthenticated);
  isAdminAuthRef.current = isAdminAuthenticated;

  // Shop Settings
  const [shopProfile, setShopProfile] = useState({
    shopId: 'SB-1001',
    name: 'QuickMart Store',
    tagline: 'Fast & Reliable In-Store Billing',
    phone: '+91 98765 43210',
    address: 'Shop No. 12, Main Market Road, Central Plaza',
    gstin: '27ABCDE1234F1Z5',
    taxRatePercent: 5.0,
    currencySymbol: '₹',
  });

  const refreshShopsFromDb = async () => {
    try {
      const dbShops = await fetchAllShops();
      setShopOwners(dbShops);
    } catch (_) {
      // Keep current list if offline or unauthorized
    }
  };

  const applyWorkspace = (
    shop: ApiShopRecord,
    workspaceItems: ShopItem[],
    workspaceBills: BillRecord[],
    loggedUser?: ApiUserRecord,
    workspaceEmployees?: ApiUserRecord[]
  ) => {
    const browserOffline = getOfflineBillsForOwner(loadOfflineQueue(), shop.email);
    const mergedBills = mergeOfflineAndDbBills(browserOffline, workspaceBills);
    setActiveOwnerEmail(shop.email);
    setActiveOwnerEmailKey(shop.emailKey);
    setActiveUserEmail(loggedUser?.email || shop.email);
    setLastSyncedAt(shop.lastSyncedAt || loadLastSyncedAt(shop.email));
    setEmployees(workspaceEmployees || []);
    setShopProfile({
      shopId: shop.shopId,
      name: shop.shopName,
      tagline: shop.tagline || 'Fast & Reliable In-Store Billing',
      phone: shop.phone,
      address: shop.address,
      gstin: shop.gstin || '',
      taxRatePercent: Number(shop.taxRatePercent ?? 5.0),
      currencySymbol: shop.currencySymbol || '₹',
    });
    setItems(workspaceItems);
    setBills(mergedBills);
    setActiveBill(mergedBills[0] || null);
    setCurrentUser({
      id: loggedUser?.uid || `u_${shop.shopId}`,
      name: loggedUser?.displayName || shop.ownerName,
      role: loggedUser?.role === 'employee' ? 'employee' : 'owner',
      pin: '',
    });
  };

  const handleLogoutUser = () => {
    logoutOwnerInDb();
    setCurrentUser(null);
    setActiveOwnerEmail('');
    setActiveOwnerEmailKey('');
    setActiveUserEmail('');
    setLastSyncedAt(null);
    setAutoSyncNotice(null);
    setLastSyncError(null);
    setEmployees([]);
    setShopAuditLogs([]);
    setBackupHistory([]);
    setItems([]);
    setBills([]);
    setActiveBill(null);
    navigateTo('login');
  };

  const triggerCloudSync = async (
    targetEmail: string = activeOwnerEmailRef.current,
    onlineOverride?: boolean,
    authOverride?: boolean,
    forceManual: boolean = false
  ) => {
    const onlineFlag = onlineOverride ?? (typeof navigator !== 'undefined' ? navigator.onLine : isOnline);
    const matchingGoogleAuth = Boolean(
      auth.currentUser &&
        auth.currentUser.emailVerified !== false &&
        isCloudSyncAuthorizedForEmail(
          auth.currentUser.email,
          targetEmail,
          activeUserEmailRef.current
        )
    );
    const hasAuthFlag = authOverride !== undefined ? authOverride && matchingGoogleAuth : matchingGoogleAuth;
    if (!targetEmail || !onlineFlag || !currentUserRef.current) return;

    setIsSyncing(true);
    try {
      const res = await runOfflineToFirestoreSync(targetEmail, {
        isOnline: onlineFlag,
        hasCloudAuth: hasAuthFlag,
        forceManual,
      });
      if (res.lastSyncedAt) {
        setLastSyncedAt(res.lastSyncedAt);
      }
      if (res.workspace) {
        const browserOffline = getOfflineBillsForOwner(loadOfflineQueue(), targetEmail);
        const merged = mergeOfflineAndDbBills(browserOffline, res.workspace.bills);
        setItems(res.workspace.items);
        setBills(merged);
        setShopProfile((prev) => ({
          ...prev,
          shopId: res.workspace!.shop.shopId,
          name: res.workspace!.shop.shopName,
          tagline: res.workspace!.shop.tagline,
          phone: res.workspace!.shop.phone,
          address: res.workspace!.shop.address,
          gstin: res.workspace!.shop.gstin || '',
          taxRatePercent: res.workspace!.shop.taxRatePercent,
          currencySymbol: res.workspace!.shop.currencySymbol,
        }));
        setActiveBill((prev) =>
          prev ? merged.find((b) => b.id === prev.id) || prev : merged[0] || null
        );
      } else if (res.flushedToSqlite > 0) {
        const ws = await fetchOwnerWorkspace(targetEmail);
        const browserOffline = getOfflineBillsForOwner(loadOfflineQueue(), targetEmail);
        const merged = mergeOfflineAndDbBills(browserOffline, ws.bills);
        setBills(merged);
      }

      if (res.status === 'synced') {
        setLastSyncError(null);
      } else if (res.status === 'needs_auth') {
        if (forceManual) {
          const expectedEmail = activeUserEmailRef.current || targetEmail;
          const msg = `Cloud sync needs Google sign-in with ${expectedEmail}.`;
          setLastSyncError(msg);
          setAutoSyncNotice(msg);
          setTimeout(() => setAutoSyncNotice(null), 5000);
        }
      } else if (res.error) {
        setLastSyncError(res.error);
      }

      const pulledTotal = (res.pulledBills || 0) + (res.pulledItems || 0);
      if (res.syncedBills > 0 || res.syncedItems > 0 || pulledTotal > 0) {
        const parts: string[] = [];
        if (res.syncedBills > 0 || res.syncedItems > 0) {
          parts.push(`pushed ${res.syncedBills} bill(s) & ${res.syncedItems} item(s)`);
        }
        if ((res.pulledBills || 0) > 0 || (res.pulledItems || 0) > 0) {
          parts.push(`pulled ${res.pulledBills || 0} bill(s) & ${res.pulledItems || 0} item(s)`);
        }
        setAutoSyncNotice(`Cloud Sync: ${parts.join(', ')}`);
        setTimeout(() => setAutoSyncNotice(null), 4500);
        if (isAdminAuthRef.current) refreshShopsFromDb();
      } else if (res.flushedToSqlite > 0) {
        setAutoSyncNotice(`Saved ${res.flushedToSqlite} offline bill(s) to SQLite`);
        setTimeout(() => setAutoSyncNotice(null), 4500);
        if (isAdminAuthRef.current) refreshShopsFromDb();
      } else if (res.error && forceManual) {
        setAutoSyncNotice(`Sync notice: ${res.error}`);
        setTimeout(() => setAutoSyncNotice(null), 6000);
      } else if (forceManual && hasAuthFlag && res.status === 'synced') {
        setAutoSyncNotice('All bills, items & PIN are up to date with Cloud');
        setTimeout(() => setAutoSyncNotice(null), 3500);
      }
    } catch (err) {
      const host = typeof window !== 'undefined' ? window.location.hostname : undefined;
      const msg = formatCloudSyncError(err, host);
      setLastSyncError(msg);
      if (forceManual) {
        setAutoSyncNotice(msg);
        setTimeout(() => setAutoSyncNotice(null), 6000);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleGoogleConnectAndSync = async (forceSwitchAccount: boolean = false) => {
    if (!activeOwnerEmail) return;
    setLastSyncError(null);
    if (!isOnline) {
      setAutoSyncNotice('You are offline. Records stay saved in SQLite until online.');
      setTimeout(() => setAutoSyncNotice(null), 4000);
      return;
    }
    if (hasMatchingCloudAuth && !forceSwitchAccount) {
      await triggerCloudSync(activeOwnerEmail, isOnline, true, true);
      return;
    }

    const targetHint = activeUserEmail || activeOwnerEmail;
    try {
      const res = await signInWithGoogleFirebase(targetHint);
      const googleEmail = (res.user?.email || '').trim().toLowerCase();
      if (!isCloudSyncAuthorizedForEmail(googleEmail, activeOwnerEmail, activeUserEmail)) {
        await signOutFirebase();
        const isEmployeeLogin =
          Boolean(activeUserEmail) &&
          activeUserEmail.toLowerCase() !== activeOwnerEmail.toLowerCase();
        const msg = `Wrong Gmail (${googleEmail}). Tap Sign In & Sync and pick ${targetHint}${
          isEmployeeLogin ? '' : ` (or add ${googleEmail} in Employees)`
        }.`;
        setLastSyncError(msg);
        setAutoSyncNotice(msg);
        setTimeout(() => setAutoSyncNotice(null), 7000);
        return;
      }

      if (res.user) {
        await syncUserProfileToFirestore({
          uid: res.user.uid,
          email: googleEmail,
          emailKey: activeOwnerEmailKey,
          displayName: currentUser?.name || shopProfile.name,
          role:
            googleEmail === SUPER_ADMIN_EMAIL &&
            !isMatchingCloudEmail(googleEmail, activeOwnerEmail)
              ? 'admin'
              : currentUser?.role === 'employee'
                ? 'employee'
                : 'owner',
          shopId: shopProfile.shopId,
          isActive: true,
        }).catch(() => {});
      }

      await triggerCloudSync(activeOwnerEmail, isOnline, true, true);
    } catch (err) {
      const host = typeof window !== 'undefined' ? window.location.hostname : undefined;
      const msg = formatCloudSyncError(err, host);
      setLastSyncError(msg);
      setAutoSyncNotice(msg);
      setTimeout(() => setAutoSyncNotice(null), 7000);
    }
  };

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      setCloudUserEmail(u?.email ?? null);
      const email = activeOwnerEmailRef.current;
      if (
        u &&
        u.emailVerified !== false &&
        currentUserRef.current &&
        isCloudSyncAuthorizedForEmail(u.email, email, activeUserEmailRef.current) &&
        (typeof navigator === 'undefined' || navigator.onLine)
      ) {
        setLastSyncError(null);
        triggerCloudSync(email, true, true);
      }
    });

    const handleOnline = () => {
      setIsOnline(true);
      if (isAdminAuthRef.current) refreshShopsFromDb();
      const email = activeOwnerEmailRef.current;
      if (currentUserRef.current && email) {
        const hasMatch = Boolean(
          auth.currentUser &&
            auth.currentUser.emailVerified !== false &&
            isCloudSyncAuthorizedForEmail(
              auth.currentUser.email,
              email,
              activeUserEmailRef.current
            )
        );
        triggerCloudSync(email, true, hasMatch);
      }
    };
    const handleOffline = () => {
      setIsOnline(false);
    };
    const handleFocusOrVisible = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (typeof navigator === 'undefined' || navigator.onLine) {
        setIsOnline(true);
        const email = activeOwnerEmailRef.current;
        if (currentUserRef.current && email) {
          const hasMatch = Boolean(
            auth.currentUser &&
              auth.currentUser.emailVerified !== false &&
              isCloudSyncAuthorizedForEmail(
                auth.currentUser.email,
                email,
                activeUserEmailRef.current
              )
          );
          triggerCloudSync(email, true, hasMatch);
        }
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('focus', handleFocusOrVisible);
    document.addEventListener('visibilitychange', handleFocusOrVisible);

    const intervalId = window.setInterval(() => {
      const email = activeOwnerEmailRef.current;
      const navOnline = typeof navigator === 'undefined' ? true : navigator.onLine;
      if (navOnline) {
        setIsOnline(true);
      }
      if (!currentUserRef.current || !email) return;
      const bufferedCount = getBrowserBufferedCount(email);
      const pendingBillsInList = billsRef.current.filter((b) => b.syncStatus !== 'synced').length;
      const pendingItemsInList = itemsRef.current.filter((i) => i.syncStatus !== 'synced').length;
      const hasMatch = Boolean(
        auth.currentUser &&
          auth.currentUser.emailVerified !== false &&
          isCloudSyncAuthorizedForEmail(
            auth.currentUser.email,
            email,
            activeUserEmailRef.current
          )
      );
      if (
        shouldAutoSync({
          isOnline: navOnline,
          isSyncing: isSyncingRef.current,
          hasCloudAuth: hasMatch,
          pendingCount: pendingBillsInList + pendingItemsInList,
          browserBufferedCount: bufferedCount,
        })
      ) {
        triggerCloudSync(email, navOnline, hasMatch);
      }
    }, 10000);

    return () => {
      unsub();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('focus', handleFocusOrVisible);
      document.removeEventListener('visibilitychange', handleFocusOrVisible);
      window.clearInterval(intervalId);
    };
  }, []);

  const hasMatchingCloudAuth = useMemo(
    () =>
      Boolean(
        cloudUserEmail &&
          auth.currentUser?.emailVerified !== false &&
          isCloudSyncAuthorizedForEmail(cloudUserEmail, activeOwnerEmail, activeUserEmail)
      ),
    [cloudUserEmail, activeOwnerEmail, activeUserEmail]
  );

  const syncSummary = useMemo(
    () =>
      summarizeSyncState({
        bills,
        items,
        isOnline,
        isSyncing,
        hasCloudAuth: hasMatchingCloudAuth,
      }),
    [bills, items, isOnline, isSyncing, hasMatchingCloudAuth]
  );

  // UI Presentation Mode & Responsive PWA Standalone Edge-to-Edge Shell
  const [viewMode, setViewMode] = useState<'app' | 'code'>('app');
  const [isPhoneFrame, setIsPhoneFrame] = useState(true);
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  );
  const { isInstalled: isStandalonePwa } = usePWAInstall();
  const [copiedFile, setCopiedFile] = useState<string | null>(null);
  const [selectedCodeFile, setSelectedCodeFile] = useState<string>('lib/screens/admin_panel_screen.dart');

  useEffect(() => {
    const handleResize = () => {
      setIsMobileViewport(window.innerWidth < 640);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isEdgeToEdgeMobile = isStandalonePwa || isMobileViewport;

  // Format currency helper
  const fmt = (val: number) =>
    `${shopProfile.currencySymbol}${val.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  // Date format helper
  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const navigateTo = (screen: AppScreen) => {
    setCurrentScreen(screen);
  };

  // Flutter Code Files
  const flutterFiles: Record<string, { desc: string; code: string }> = {
    'lib/screens/admin_panel_screen.dart': {
      desc: 'Developer Admin Panel: register shop owners, toggle active/suspended, view PINs, switch store',
      code: `// Developer Admin Screen for managing all shop owners in the multi-store system.
// Features: Register new shop owners with 4-digit PIN, toggle active/suspended status,
// view credentials/PIN, delete owner, and switch/login to any registered store.`,
    },
    'lib/screens/admin_login_screen.dart': {
      desc: 'Developer Admin Login: password authentication requiring adminshiv.developer9142',
      code: `// Developer Admin Authentication Screen
// Password required: adminshiv.developer9142
// Only authorized developer can access the shop owner registration & management console.`,
    },
    'lib/models/shop_owner.dart': {
      desc: 'ShopOwner model: id, ownerName, email, phone, pin, shopName, address, gstin, isActive',
      code: `class ShopOwner {
  final String id;
  String ownerName;
  String email;
  String phone;
  String pin;
  String shopName;
  String address;
  String gstin;
  final DateTime registeredAt;
  bool isActive;
  int totalBillsCount;
  double totalRevenue;

  ShopOwner({
    required this.id,
    required this.ownerName,
    required this.email,
    required this.phone,
    required this.pin,
    required this.shopName,
    required this.address,
    this.gstin = '',
    required this.registeredAt,
    this.isActive = true,
    this.totalBillsCount = 0,
    this.totalRevenue = 0.0,
  });
}`,
    },
    'lib/screens/new_bill_screen.dart': {
      desc: 'Interactive New Bill screen with Weight (kg/g) and Quantity prompt dialog',
      code: `// Key feature: When tapping an item, prompts user with a dialog to enter
// quantity or weight (toggle between kg and grams with quick chips e.g. 250g, 500g, 1kg, 2kg).
// Automatically converts grams to decimal kg and calculates line total in real time.`,
    },
    'lib/models/item.dart': {
      desc: 'Item model supporting ItemUnit enum (pcs and weight in kg/g)',
      code: `enum ItemUnit { pcs, kg }

class Item {
  final String id;
  String name;
  String code;
  double price; // Price per unit (per piece or per kg)
  double stock; // Stock in kg or pieces
  String category;
  ItemUnit unit;

  Item({
    required this.id,
    required this.name,
    required this.code,
    required this.price,
    required this.stock,
    required this.category,
    this.unit = ItemUnit.pcs,
  });

  bool get isWeighted => unit == ItemUnit.kg;
  String get priceLabel => isWeighted ? '₹\${price.toStringAsFixed(2)} / kg' : '₹\${price.toStringAsFixed(2)} / pc';
}`,
    },
    'lib/models/bill_item.dart': {
      desc: 'BillItem line model supporting double quantity (e.g. 0.5 kg for 500g)',
      code: `class BillItem {
  final String itemId;
  final String name;
  final String code;
  double unitPrice;
  double quantity; // supports decimals like 0.25 (250g), 0.5 (500g)
  ItemUnit unit;

  String get formattedQuantity {
    if (unit == ItemUnit.kg) {
      if (quantity < 1.0 && quantity > 0) {
        return '\${(quantity * 1000).round()} g';
      }
      return '\${quantity.toStringAsFixed(quantity.truncateToDouble() == quantity ? 0 : 3)} kg';
    }
    return '\${quantity.toInt()} pcs';
  }
}`,
    },
    'lib/widgets/bill_item_tile.dart': {
      desc: 'Bill line tile showing formatted weight/qty and quick weight edit prompt',
      code: `// Displays formatted weight e.g. "500 g", "1.5 kg", "2 pcs".
// Tapping on the quantity badge opens the weight/quantity prompt modal to adjust.`,
    },
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedFile(id);
    setTimeout(() => setCopiedFile(null), 2000);
  };

  return (
    <div className="flex h-screen w-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">
      {/* Desktop Studio Top Header (Hidden in mobile/standalone PWA mode) */}
      {!isEdgeToEdgeMobile && (
        <div className="absolute top-0 left-0 right-0 h-14 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 z-50">
          <div className="flex items-center gap-3">
            <BillKartLogo size="sm" variant="topbar" />
            <div>
              <h1 className="font-bold text-base tracking-wide flex items-center gap-2 text-white">
                BillKart <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-medium">Scan • Bill • Grow</span>
              </h1>
              <p className="text-xs text-slate-400">Smart Billing with Quantity &amp; Weight Prompt Dialog</p>
            </div>
          </div>

          {/* Actions & View Mode Toggle */}
          <div className="flex items-center gap-2.5">
            <PWAInstallButton variant="topbar" />

            {isAdminAuthenticated && (
              <button
                onClick={() => navigateTo('admin_panel')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition border ${
                  currentScreen === 'admin_panel'
                    ? 'bg-sky-600 text-white border-sky-400 shadow'
                    : 'bg-slate-800 hover:bg-slate-700 text-sky-300 border-sky-900/50'
                }`}
                title="Open Developer Admin Panel"
              >
                <Key className="w-3.5 h-3.5 text-sky-400" />
                <span className="hidden sm:inline">Admin Console</span>
              </button>
            )}

            <div className="bg-slate-800 p-1 rounded-xl flex items-center gap-1 border border-slate-700">
              <button
                onClick={() => setViewMode('app')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                  viewMode === 'app' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                Live Android App
              </button>
              <button
                onClick={() => setViewMode('code')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                  viewMode === 'code' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                <FileCode className="w-3.5 h-3.5" />
                Flutter Files
              </button>
            </div>

            {viewMode === 'app' && (
              <button
                onClick={() => setIsPhoneFrame(!isPhoneFrame)}
                title={isPhoneFrame ? 'Expand Full Screen' : 'Show Phone Frame'}
                className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition"
              >
                {isPhoneFrame ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Container */}
      <div className={`${isEdgeToEdgeMobile ? 'pt-0' : 'pt-14'} w-full h-full flex overflow-hidden`}>
        {viewMode === 'app' || isEdgeToEdgeMobile ? (
          <div
            className={`flex-1 h-full flex items-center justify-center overflow-auto ${
              isEdgeToEdgeMobile
                ? 'bg-slate-50 p-0'
                : 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-2 sm:p-6'
            }`}
          >
            <div
              className={`transition-all duration-300 flex flex-col overflow-hidden ${
                isEdgeToEdgeMobile
                  ? 'w-full h-full bg-slate-50'
                  : isPhoneFrame
                    ? 'w-[400px] h-[820px] max-h-[95vh] rounded-[44px] shadow-2xl border-[10px] border-slate-800 bg-slate-900 ring-1 ring-slate-700/50 relative'
                    : 'w-full h-full max-w-4xl bg-slate-900 rounded-2xl border border-slate-800 shadow-2xl'
              }`}
            >
              {!isEdgeToEdgeMobile && isPhoneFrame && (
                <div className="h-7 bg-emerald-950/60 px-6 flex items-center justify-between text-[11px] font-semibold text-emerald-200 select-none shrink-0 border-b border-emerald-900/30">
                  <span>9:41</span>
                  <div className="w-3.5 h-3.5 rounded-full bg-slate-950 ring-1 ring-slate-700"></div>
                  <div className="flex items-center gap-1.5">
                    <span>5G</span>
                    <span>100%</span>
                  </div>
                </div>
              )}

              {/* Screen Body */}
              <div className="flex-1 bg-slate-50 text-slate-900 flex flex-col overflow-hidden relative">
                {currentScreen === 'splash' && (
                  <SplashScreenView onStart={() => navigateTo('home')} />
                )}
                {currentScreen === 'login' && (
                  <LoginScreenView
                    cloudUserEmail={cloudUserEmail}
                    onLoginSuccess={async (user, shop, workspace, loggedUser) => {
                      setLastSyncError(null);
                      setAutoSyncNotice(null);
                      if (workspace) {
                        applyWorkspace(
                          workspace.shop,
                          workspace.items,
                          workspace.bills,
                          loggedUser,
                          workspace.employees || []
                        );
                        const actorEmail = loggedUser?.email || workspace.shop.email;
                        if (
                          loggedUser &&
                          auth.currentUser &&
                          auth.currentUser.emailVerified !== false &&
                          isMatchingCloudEmail(auth.currentUser.email, loggedUser.email)
                        ) {
                          await syncUserProfileToFirestore({
                            uid: auth.currentUser.uid,
                            email: loggedUser.email,
                            emailKey: workspace.shop.emailKey,
                            displayName: loggedUser.displayName,
                            role: loggedUser.role,
                            shopId: workspace.shop.shopId,
                            isActive: loggedUser.isActive,
                          }).catch(() => {});
                        }
                        const hasMatch = Boolean(
                          auth.currentUser &&
                            auth.currentUser.emailVerified !== false &&
                            isCloudSyncAuthorizedForEmail(
                              auth.currentUser.email,
                              workspace.shop.email,
                              actorEmail
                            )
                        );
                        navigateTo('home');
                        if (isOnline && hasMatch) {
                          triggerCloudSync(workspace.shop.email, isOnline, true);
                        }
                        return;
                      } else {
                        setCurrentUser(user);
                        if (shop) {
                          const browserOffline = getOfflineBillsForOwner(loadOfflineQueue(), shop.email);
                          setActiveOwnerEmail(shop.email);
                          if (browserOffline.length > 0) {
                            setBills((prev) => mergeOfflineAndDbBills(browserOffline, prev));
                          }
                          setShopProfile((prev) => ({
                            ...prev,
                            shopId: shop.shopId,
                            name: shop.shopName,
                            phone: shop.phone,
                            address: shop.address,
                            gstin: shop.gstin || '',
                          }));
                        }
                      }
                      navigateTo('home');
                    }}
                    onOpenAdmin={() => {
                      setIsAdminAuthenticated(true);
                      refreshShopsFromDb();
                      navigateTo('admin_panel');
                    }}
                  />
                )}
                {currentScreen === 'admin_login' && (
                  <AdminLoginScreenView
                    onLoginSuccess={() => {
                      setIsAdminAuthenticated(true);
                      refreshShopsFromDb();
                      navigateTo('admin_panel');
                    }}
                    onBack={() => navigateTo('login')}
                  />
                )}
                {currentScreen === 'admin_panel' && (
                  <AdminPanelScreenView
                    shopOwners={shopOwners}
                    cloudUserEmail={cloudUserEmail}
                    fmt={fmt}
                    onConnectGoogle={async () => {
                      if (cloudUserEmail) {
                        await signOutFirebase();
                        return { connected: false, synced: 0, error: undefined };
                      }
                      await signInWithGoogleFirebase(SUPER_ADMIN_EMAIL);
                      const freshShops = await fetchAllShops().catch(() => shopOwners);
                      if (freshShops.length > 0) setShopOwners(freshShops);
                      let synced = 0;
                      let firstError: string | undefined;
                      const results = await Promise.allSettled(
                        freshShops.map((shop) => ensureOwnerWorkspaceInFirestore(shop))
                      );
                      for (const r of results) {
                        if (r.status === 'fulfilled' && r.value) {
                          synced += 1;
                        } else if (r.status === 'rejected' && !firstError) {
                          firstError = formatCloudSyncError(r.reason);
                        }
                      }
                      return { connected: true, synced, error: firstError };
                    }}
                    onSyncAllToCloud={async () => {
                      const freshShops = await fetchAllShops().catch(() => shopOwners);
                      if (freshShops.length > 0) setShopOwners(freshShops);
                      let synced = 0;
                      let failed = 0;
                      const results = await Promise.allSettled(
                        freshShops.map((shop) => ensureOwnerWorkspaceInFirestore(shop))
                      );
                      for (const r of results) {
                        if (r.status === 'fulfilled' && r.value) synced += 1;
                        else failed += 1;
                      }
                      return { synced, failed };
                    }}
                    onRefresh={refreshShopsFromDb}
                    onOpenAuditLogs={async () => {
                      try {
                        const logs = await fetchAdminAuditLogsInDb(200);
                        setAdminAuditLogs(logs);
                      } catch (_) {}
                      navigateTo('admin_audit_logs');
                    }}
                    onRegisterOwner={async (input: {
                      ownerName: string;
                      shopName: string;
                      email: string;
                      phone: string;
                      pin: string;
                      address: string;
                      gstin?: string;
                    }) => {
                      const saved = await registerShopInDb(input);
                      let cloudSynced = false;
                      let syncError = '';
                      if (auth.currentUser) {
                        try {
                          cloudSynced = Boolean(await syncShopRecordToFirestore(saved, true));
                        } catch (err) {
                          syncError = err instanceof Error ? err.message : 'Cloud sync failed';
                        }
                      }
                      setShopOwners((prev) => [saved, ...prev.filter((o) => o.shopId !== saved.shopId)]);
                      setUsers((prev) => [
                        ...prev,
                        {
                          id: `u_${saved.id}`,
                          name: saved.ownerName,
                          role: 'owner',
                          pin: '',
                        },
                      ]);
                      return { shop: saved, cloudSynced, syncError };
                    }}
                    onUpdateOwner={(updated: any) => {
                      setShopOwners(updateShopOwner(shopOwners, updated));
                    }}
                    onResetOwnerPin={async (id: string, newPin: string) => {
                      const updated = await resetShopPinByAdminInDb(id, newPin);
                      syncShopRecordToFirestore(updated, false).catch(() => {});
                      setShopOwners((prev) =>
                        prev.map((o) => (o.shopId === updated.shopId ? updated : o))
                      );
                    }}
                    onToggleStatus={async (id: string) => {
                      try {
                        const updated = await toggleShopStatusInDb(id);
                        syncShopRecordToFirestore(updated, false).catch(() => {});
                        setShopOwners((prev) =>
                          prev.map((o) => (o.shopId === updated.shopId ? updated : o))
                        );
                      } catch (_) {
                        setShopOwners(toggleShopOwnerStatus(shopOwners, id));
                      }
                    }}
                    onDeleteOwner={async (id: string) => {
                      try {
                        await deleteShopInDb(id);
                        setShopOwners((prev) => prev.filter((o) => o.id !== id && o.shopId !== id));
                      } catch (_) {
                        setShopOwners(deleteShopOwner(shopOwners, id));
                      }
                    }}
                    onSwitchShop={async (_owner: ShopOwnerRecord) => {
                      await logoutAdminInDb();
                      setIsAdminAuthenticated(false);
                      navigateTo('login');
                    }}
                    onExit={async () => {
                      await logoutAdminInDb();
                      setIsAdminAuthenticated(false);
                      navigateTo('login');
                    }}
                  />
                )}
                {currentScreen === 'admin_audit_logs' && (
                  <AuditLogsView
                    logs={adminAuditLogs}
                    title="Platform Audit Logs"
                    onBack={() => navigateTo('admin_panel')}
                    onRefresh={async () => {
                      const logs = await fetchAdminAuditLogsInDb(200);
                      setAdminAuditLogs(logs);
                    }}
                    fmtDate={fmtDate}
                  />
                )}
                {currentScreen === 'home' && (
                  <HomeScreenView
                    shopProfile={shopProfile}
                    currentUser={currentUser}
                    activeUserEmail={activeUserEmail}
                    activeOwnerEmail={activeOwnerEmail}
                    cloudUserEmail={cloudUserEmail}
                    employeesCount={employees.length}
                    bills={bills}
                    items={items}
                    isOnline={isOnline}
                    isSyncing={isSyncing}
                    lastSyncedAt={lastSyncedAt}
                    autoSyncNotice={autoSyncNotice}
                    lastSyncError={lastSyncError}
                    pendingSyncCount={syncSummary.pendingCount}
                    hasCloudAuth={hasMatchingCloudAuth}
                    onSyncNow={() => handleGoogleConnectAndSync(false)}
                    onSwitchGoogleAccount={() => handleGoogleConnectAndSync(true)}
                    onOpenEmployees={async () => {
                      if (currentUser?.role !== 'owner' || !activeOwnerEmail) return;
                      try {
                        const list = await fetchEmployeesInDb(activeOwnerEmail);
                        setEmployees(list);
                      } catch (_) {}
                      navigateTo('employees');
                    }}
                    onOpenAuditLogs={async () => {
                      if (currentUser?.role !== 'owner' || !activeOwnerEmail) return;
                      try {
                        const logs = await fetchOwnerAuditLogsInDb(activeOwnerEmail, 100);
                        setShopAuditLogs(logs);
                      } catch (_) {}
                      navigateTo('audit_logs');
                    }}
                    onOpenBackup={async () => {
                      if (currentUser?.role !== 'owner' || !activeOwnerEmail) return;
                      try {
                        const history = await fetchBackupHistoryInDb(activeOwnerEmail);
                        setBackupHistory(history);
                      } catch (_) {}
                      navigateTo('backup_restore');
                    }}
                    onLogout={handleLogoutUser}
                    fmt={fmt}
                    fmtDate={fmtDate}
                    onNavigate={navigateTo}
                    onSelectBill={(b) => {
                      setActiveBill(b);
                      navigateTo('bill_details');
                    }}
                  />
                )}
                {currentScreen === 'items' && (
                  <ItemsScreenView
                    items={items}
                    canManage={currentUser?.role !== 'employee'}
                    isOnline={isOnline}
                    isSyncing={isSyncing}
                    hasCloudAuth={hasMatchingCloudAuth}
                    pendingItemsCount={syncSummary.pendingItemsCount}
                    lastSyncError={lastSyncError}
                    onSyncNow={() => handleGoogleConnectAndSync(false)}
                    fmt={fmt}
                    onBack={() => navigateTo('home')}
                    onAddItem={() => {
                      if (currentUser?.role === 'employee') return;
                      setEditingItem(null);
                      navigateTo('add_edit_item');
                    }}
                    onEditItem={(item) => {
                      if (currentUser?.role === 'employee') return;
                      setEditingItem(item);
                      navigateTo('add_edit_item');
                    }}
                  />
                )}
                {currentScreen === 'add_edit_item' && currentUser?.role !== 'employee' && (
                  <AddEditItemScreenView
                    item={editingItem}
                    fmt={fmt}
                    currencySymbol={shopProfile.currencySymbol}
                    onBack={() => navigateTo('items')}
                    onSave={async (savedItem) => {
                      const localPendingItem: ShopItem = {
                        ...savedItem,
                        updatedAt: new Date().toISOString(),
                        syncStatus: 'pending',
                      };
                      if (editingItem) {
                        setItems((prev) => prev.map((i) => (i.id === localPendingItem.id ? localPendingItem : i)));
                      } else {
                        setItems((prev) => [localPendingItem, ...prev]);
                      }
                      navigateTo('items');
                      if (activeOwnerEmail) {
                        try {
                          const savedInDb = await saveOwnerItemInDb(activeOwnerEmail, localPendingItem);
                          setItems((prev) =>
                            prev.map((i) => (i.id === savedInDb.id ? savedInDb : i))
                          );
                          if (isOnline) {
                            triggerCloudSync(activeOwnerEmail, true);
                          }
                        } catch (err) {
                          setLastSyncError(formatCloudSyncError(err));
                        }
                      }
                    }}
                    onDelete={async (id) => {
                      setItems((prev) => prev.filter((i) => i.id !== id));
                      navigateTo('items');
                      if (activeOwnerEmail) {
                        try {
                          await deleteOwnerItemInDb(activeOwnerEmail, id);
                          if (isOnline && hasMatchingCloudAuth && activeOwnerEmailKey) {
                            await deleteItemFromFirestore(activeOwnerEmailKey, id);
                          }
                        } catch (err) {
                          setLastSyncError(formatCloudSyncError(err));
                        }
                      }
                    }}
                  />
                )}
                {currentScreen === 'new_bill' && (
                  <NewBillScreenView
                    items={items}
                    taxRate={shopProfile.taxRatePercent}
                    currencySymbol={shopProfile.currencySymbol}
                    cashierName={currentUser?.name || 'Staff Cashier'}
                    fmt={fmt}
                    onBack={() => navigateTo('home')}
                    onBillSaved={async (newBill) => {
                      const localPendingBill: BillRecord = { ...newBill, syncStatus: 'pending' };
                      setBills((prev) => [localPendingBill, ...prev]);
                      setActiveBill(localPendingBill);
                      // Deduct stock immediately in UI and mark deducted items as pending sync
                      setItems((prev) =>
                        prev.map((it) => {
                          const billed = newBill.items.find((bi) => bi.itemId === it.id);
                          return billed
                            ? {
                                ...it,
                                stock: Math.max(0, it.stock - billed.quantity),
                                updatedAt: new Date().toISOString(),
                                syncStatus: 'pending',
                              }
                            : it;
                        })
                      );
                      navigateTo('bill_success');

                      if (activeOwnerEmail) {
                        try {
                          // Always save immediately into local SQLite database first
                          const savedInSqlite = await createOwnerBillInDb(activeOwnerEmail, localPendingBill);
                          setBills((prev) =>
                            prev.map((b) => (b.id === savedInSqlite.id ? savedInSqlite : b))
                          );
                          setActiveBill((prev) =>
                            prev && prev.id === savedInSqlite.id ? savedInSqlite : prev
                          );
                          refreshShopsFromDb();
                          // Trigger Cloud sync if online & authorized; surfaces error if auth missing/denied
                          if (isOnline) {
                            triggerCloudSync(activeOwnerEmail, true);
                          }
                        } catch (_) {
                          // If browser is completely offline from local server, buffer in localStorage queue until online
                          bufferOfflineBillInBrowser(activeOwnerEmail, localPendingBill);
                        }
                      }
                    }}
                  />
                )}
                {currentScreen === 'bill_success' && activeBill && (
                  <BillSuccessScreenView
                    bill={activeBill}
                    isOnline={isOnline}
                    fmt={fmt}
                    onViewInvoice={() => navigateTo('invoice_preview')}
                    onNewBill={() => navigateTo('new_bill')}
                    onHome={() => navigateTo('home')}
                  />
                )}
                {currentScreen === 'invoice_preview' && activeBill && (
                  <InvoicePreviewScreenView
                    bill={activeBill}
                    shopProfile={shopProfile}
                    fmt={fmt}
                    fmtDate={fmtDate}
                    onBack={() => navigateTo('bill_details')}
                  />
                )}
                {currentScreen === 'bills' && (
                  <BillsScreenView
                    bills={bills}
                    isOnline={isOnline}
                    isSyncing={isSyncing}
                    pendingSyncCount={syncSummary.pendingCount}
                    hasCloudAuth={hasMatchingCloudAuth}
                    lastSyncError={lastSyncError}
                    onSyncNow={() => handleGoogleConnectAndSync(false)}
                    onSwitchGoogleAccount={() => handleGoogleConnectAndSync(true)}
                    fmt={fmt}
                    fmtDate={fmtDate}
                    onBack={() => navigateTo('home')}
                    onSelectBill={(b) => {
                      setActiveBill(b);
                      navigateTo('bill_details');
                    }}
                  />
                )}
                {currentScreen === 'bill_details' && activeBill && (
                  <BillDetailsScreenView
                    bill={activeBill}
                    fmt={fmt}
                    fmtDate={fmtDate}
                    onBack={() => navigateTo('bills')}
                    onViewInvoice={() => navigateTo('invoice_preview')}
                  />
                )}
                {currentScreen === 'reports' && (
                  <ReportsScreenView
                    bills={bills}
                    fmt={fmt}
                    onBack={() => navigateTo('home')}
                  />
                )}
                {currentScreen === 'employees' && currentUser?.role === 'owner' && (
                  <EmployeesView
                    employees={employees}
                    shopId={shopProfile.shopId}
                    shopName={shopProfile.name}
                    onBack={() => navigateTo('home')}
                    onAddEmployee={async (input) => {
                      const created = await addEmployeeInDb(activeOwnerEmail, input);
                      setEmployees((prev) => [created, ...prev]);
                    }}
                    onUpdateEmployee={async (empUid, patch) => {
                      const updated = await updateEmployeeInDb(activeOwnerEmail, empUid, patch);
                      setEmployees((prev) => prev.map((e) => (e.uid === empUid ? updated : e)));
                    }}
                    onToggleStatus={async (empUid) => {
                      const updated = await toggleEmployeeStatusInDb(activeOwnerEmail, empUid);
                      setEmployees((prev) => prev.map((e) => (e.uid === empUid ? updated : e)));
                    }}
                    onResetPin={async (empUid, newPin) => {
                      const updated = await resetEmployeePinInDb(activeOwnerEmail, empUid, newPin);
                      setEmployees((prev) => prev.map((e) => (e.uid === empUid ? updated : e)));
                    }}
                    onDeleteEmployee={async (empUid) => {
                      await deleteEmployeeInDb(activeOwnerEmail, empUid);
                      setEmployees((prev) => prev.filter((e) => e.uid !== empUid));
                    }}
                  />
                )}
                {currentScreen === 'audit_logs' && currentUser?.role === 'owner' && (
                  <AuditLogsView
                    logs={shopAuditLogs}
                    title="Shop Audit Logs"
                    onBack={() => navigateTo('home')}
                    onRefresh={async () => {
                      const logs = await fetchOwnerAuditLogsInDb(activeOwnerEmail, 100);
                      setShopAuditLogs(logs);
                    }}
                    fmtDate={fmtDate}
                  />
                )}
                {currentScreen === 'backup_restore' && currentUser?.role === 'owner' && (
                  <BackupRestoreView
                    shopId={shopProfile.shopId}
                    shopName={shopProfile.name}
                    history={backupHistory}
                    hasCloudAuth={hasMatchingCloudAuth}
                    onBack={() => navigateTo('home')}
                    onExportSqlite={async () => {
                      const bundle = await exportShopBackupInDb(activeOwnerEmail, 'sqlite');
                      const hist = await fetchBackupHistoryInDb(activeOwnerEmail).catch(() => backupHistory);
                      setBackupHistory(hist);
                      return bundle;
                    }}
                    onExportFirestore={async () => {
                      const fsData = await exportFirestoreShopData(activeOwnerEmailKey);
                      const bundleItems = (fsData.items || []).map((it: any) => ({
                        id: String(it.id || ''),
                        name: String(it.name || ''),
                        code: String(it.code || ''),
                        price: Number(it.price || 0),
                        stock: Number(it.stock || 0),
                        category: String(it.category || 'General'),
                        unit: it.unit === 'kg' ? ('kg' as const) : ('pcs' as const),
                      }));
                      const bundleBills = (fsData.bills || []).map((b: any) => ({
                        id: String(b.id || ''),
                        billNumber: String(b.billNumber || ''),
                        createdAt: String(b.createdAt?.toDate ? b.createdAt.toDate().toISOString() : b.createdAt || new Date().toISOString()),
                        items: Array.isArray(b.items) ? b.items : [],
                        customerName: String(b.customerName || ''),
                        customerPhone: String(b.customerPhone || ''),
                        subtotal: Number(b.subtotal || 0),
                        discountAmount: Number(b.discountAmount || 0),
                        taxAmount: Number(b.taxAmount || 0),
                        grandTotal: Number(b.grandTotal || 0),
                        paymentMethod: b.paymentMethod || 'Cash',
                        cashierName: String(b.cashierName || 'Cashier'),
                      }));
                      const exportedAt = new Date().toISOString();
                      const baseBundle: Omit<ShopBackupBundle, 'checksum'> = {
                        backupVersion: 1,
                        exportedAt,
                        source: 'firestore',
                        shop: {
                          shopId: shopProfile.shopId,
                          shopName: shopProfile.name,
                          ownerName: currentUser?.name || '',
                          ownerEmail: activeOwnerEmail,
                          phone: shopProfile.phone,
                          address: shopProfile.address,
                          gstin: shopProfile.gstin,
                          tagline: shopProfile.tagline,
                          taxRatePercent: shopProfile.taxRatePercent,
                          currencySymbol: shopProfile.currencySymbol,
                        },
                        items: bundleItems,
                        bills: bundleBills,
                        employees: employees.map((e) => ({
                          uid: e.uid,
                          email: e.email,
                          displayName: e.displayName,
                          role: 'employee',
                          isActive: e.isActive,
                        })),
                      };
                      const bundle: ShopBackupBundle = {
                        ...baseBundle,
                        checksum: computeBackupSummarySignature(baseBundle),
                      };
                      return bundle;
                    }}
                    onRestoreBackup={async (bundle) => {
                      const res = await restoreShopBackupInDb(activeOwnerEmail, bundle);
                      setItems(res.workspace.items);
                      setBills(res.workspace.bills);
                      setActiveBill(res.workspace.bills[0] || null);
                      const hist = await fetchBackupHistoryInDb(activeOwnerEmail).catch(() => backupHistory);
                      setBackupHistory(hist);
                      return {
                        restoredItems: res.restoredItems,
                        restoredBills: res.restoredBills,
                      };
                    }}
                    fmtDate={fmtDate}
                  />
                )}
                {currentScreen === 'settings' && (
                  <SettingsScreenView
                    shopProfile={shopProfile}
                    currentUser={currentUser}
                    ownerEmail={activeOwnerEmail}
                    activeUserEmail={activeUserEmail}
                    onBack={() => navigateTo('home')}
                    onSaveProfile={(updated) => {
                      if (currentUser?.role !== 'owner') return;
                      const next = { ...shopProfile, ...updated };
                      setShopProfile(next);
                      if (activeOwnerEmail) {
                        saveOwnerSettingsInDb(activeOwnerEmail, next)
                          .then((savedShop) => {
                            if (
                              auth.currentUser &&
                              auth.currentUser.emailVerified !== false &&
                              isCloudSyncAuthorizedForEmail(
                                auth.currentUser.email,
                                activeOwnerEmail,
                                activeUserEmail
                              )
                            ) {
                              syncShopRecordToFirestore(savedShop, false).catch((err) => {
                                setLastSyncError(formatCloudSyncError(err));
                              });
                            }
                            if (isAdminAuthRef.current) refreshShopsFromDb();
                          })
                          .catch((err) => {
                            setLastSyncError(formatCloudSyncError(err));
                          });
                      }
                    }}
                    onResetPin={async (currentPin, newPin) => {
                      const saved = await resetOwnShopPinInDb(activeOwnerEmail, currentPin, newPin);
                      if (
                        auth.currentUser &&
                        auth.currentUser.emailVerified !== false &&
                        isCloudSyncAuthorizedForEmail(
                          auth.currentUser.email,
                          activeOwnerEmail,
                          activeUserEmail
                        )
                      ) {
                        syncShopRecordToFirestore(saved, false).catch((err) => {
                          setLastSyncError(formatCloudSyncError(err));
                        });
                      }
                    }}
                    onLogout={handleLogoutUser}
                  />
                )}
              </div>

              {isPhoneFrame && (
                <div className="h-4 bg-slate-950 flex items-center justify-center shrink-0">
                  <div className="w-28 h-1 rounded-full bg-slate-600"></div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 h-full bg-slate-900 flex overflow-hidden">
            <div className="w-80 bg-slate-950 border-r border-slate-800 flex flex-col">
              <div className="p-4 border-b border-slate-800">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <Folder className="w-4 h-4 text-emerald-400" />
                  Flutter Files (Weights & Quantities)
                </h3>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {Object.entries(flutterFiles).map(([filename, file]) => {
                  const isSelected = selectedCodeFile === filename;
                  return (
                    <button
                      key={filename}
                      onClick={() => setSelectedCodeFile(filename)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg text-xs transition flex flex-col gap-0.5 ${
                        isSelected
                          ? 'bg-emerald-600 text-white font-medium shadow-sm'
                          : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-mono text-[11px]">
                        <FileCode className="w-3.5 h-3.5 opacity-70" />
                        <span>{filename}</span>
                      </div>
                      <span className={`text-[10px] line-clamp-1 ${isSelected ? 'text-emerald-100' : 'text-slate-500'}`}>
                        {file.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex-1 h-full flex flex-col bg-slate-900">
              <div className="h-14 bg-slate-950/80 border-b border-slate-800 px-6 flex items-center justify-between">
                <div>
                  <span className="font-mono text-sm font-semibold text-emerald-400">
                    {selectedCodeFile}
                  </span>
                  <p className="text-xs text-slate-400">
                    {flutterFiles[selectedCodeFile]?.desc}
                  </p>
                </div>
                <button
                  onClick={() =>
                    copyToClipboard(
                      flutterFiles[selectedCodeFile]?.code || '',
                      selectedCodeFile
                    )
                  }
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow"
                >
                  {copiedFile === selectedCodeFile ? (
                    <>
                      <Check className="w-4 h-4 text-white" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copy Code
                    </>
                  )}
                </button>
              </div>
              <div className="flex-1 overflow-auto p-6 bg-slate-950 font-mono text-xs leading-relaxed text-slate-200">
                <pre>{flutterFiles[selectedCodeFile]?.code}</pre>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// SCREEN 1: SPLASH
function SplashScreenView({ onStart }: { onStart: () => void }) {
  return (
    <div className="h-full w-full bg-emerald-800 text-white flex flex-col items-center justify-center p-8 text-center animate-fade-in">
      <BillKartLogo size="xl" variant="emerald" className="mb-5 ring-white/40 shadow-2xl" />
      <h1 className="text-3xl font-extrabold tracking-wide mb-1">BillKart</h1>
      <p className="text-emerald-200 text-xs font-semibold uppercase tracking-widest mb-3">Scan &bull; Bill &bull; Grow</p>
      <p className="text-emerald-100 text-sm max-w-xs mb-8">
        Fast, Offline &amp; Simple Billing with Weight (kg/g) Support
      </p>
      <button
        onClick={onStart}
        className="px-6 py-3 bg-white text-emerald-900 font-bold rounded-2xl shadow-lg hover:bg-emerald-50 active:scale-95 transition"
      >
        Enter BillKart
      </button>
    </div>
  );
}

// SCREEN 2: LOGIN (GMAIL VERIFICATION + SHOP ID + PIN WITH RESTRICTED DEVELOPER GATEWAY)
function LoginScreenView({
  cloudUserEmail,
  onLoginSuccess,
  onOpenAdmin,
}: {
  cloudUserEmail: string | null;
  onLoginSuccess: (
    u: UserProfile,
    shop?: ShopOwnerRecord,
    workspace?: { shop: ApiShopRecord; items: ShopItem[]; bills: BillRecord[]; employees?: ApiUserRecord[] },
    loggedUser?: ApiUserRecord
  ) => void;
  onOpenAdmin: () => void;
}) {
  const [ownerEmail, setOwnerEmail] = useState('');
  const [shopId, setShopId] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState('');
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const [isGoogleVerifying, setIsGoogleVerifying] = useState(false);
  const [emailCheckResult, setEmailCheckResult] = useState<EmailVerificationResult | null>(null);
  const [googleVerifiedEmail, setGoogleVerifiedEmail] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Developer Modal State (Opened via subtle footer key trigger)
  const [showDevModal, setShowDevModal] = useState(false);
  const [devPasswordInput, setDevPasswordInput] = useState('');
  const [devModalError, setDevModalError] = useState('');
  const [devBusy, setDevBusy] = useState(false);

  const handleDevLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setDevModalError('');
    setDevBusy(true);
    try {
      await loginAdminInDb(
        devPasswordInput,
        auth.currentUser?.email || undefined,
        auth.currentUser?.uid || undefined
      );
      setShowDevModal(false);
      onOpenAdmin();
    } catch (err) {
      setDevModalError(err instanceof Error ? err.message : 'Invalid developer key. Access denied.');
    } finally {
      setDevBusy(false);
    }
  };

  const handleCheckEmail = async () => {
    const clean = ownerEmail.trim().toLowerCase();
    setError('');
    if (!clean) {
      setEmailCheckResult(null);
      setError('Please enter your registered Gmail / email address.');
      return;
    }
    setIsCheckingEmail(true);
    try {
      if (
        auth.currentUser?.emailVerified &&
        isCloudSyncAuthorizedForEmail(auth.currentUser.email, clean)
      ) {
        const idToken = await auth.currentUser.getIdToken();
        await syncCloudShopBeforeLoginInDb({
          idToken,
          shopId: shopId.trim() || undefined,
          email: clean,
        }).catch(() => {});
      }

      const res = await verifyOwnerEmailInDb(clean);
      setEmailCheckResult(res);
      if (!res.validFormat || !res.registered) {
        setError(res.message);
      } else if (!res.isActive) {
        setError(res.message);
      } else if (res.shopId && !shopId.trim()) {
        setShopId(res.shopId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to verify email registration.');
    } finally {
      setIsCheckingEmail(false);
    }
  };

  const handleGoogleVerify = async () => {
    setError('');
    setIsGoogleVerifying(true);
    try {
      const cred = await signInWithGoogleFirebase(ownerEmail.trim() || undefined);
      const verifiedEmail = (cred.user?.email || '').trim().toLowerCase();
      if (!verifiedEmail) {
        await signOutFirebase();
        setError('Could not read Google account email. Please try again.');
        return;
      }

      const targetLookupEmail =
        verifiedEmail === SUPER_ADMIN_EMAIL && ownerEmail.trim()
          ? ownerEmail.trim().toLowerCase()
          : verifiedEmail;

      // Pull latest shop record & PIN from Firestore using verified Google account
      const idToken = await cred.user.getIdToken();
      const primaryPull = await syncCloudShopBeforeLoginInDb({
        idToken,
        shopId: shopId.trim() || undefined,
        email: verifiedEmail,
      }).catch(() => ({ synced: false as const, cloudError: undefined }));

      if (targetLookupEmail !== verifiedEmail) {
        await syncCloudShopBeforeLoginInDb({
          idToken,
          shopId: shopId.trim() || undefined,
          email: targetLookupEmail,
        }).catch(() => {});
      }

      const res = await verifyOwnerEmailInDb(targetLookupEmail);
      if (res.registered && res.isActive) {
        setOwnerEmail(targetLookupEmail);
        setEmailCheckResult(res);
        setGoogleVerifiedEmail(verifiedEmail);
        if (res.shopId) {
          setShopId(res.shopId);
        }
        return;
      }

      if (verifiedEmail === SUPER_ADMIN_EMAIL) {
        // Keep super-admin signed in, keep typed/verified email, and explain clearly if shop isn't in Cloud yet
        setOwnerEmail(targetLookupEmail);
        setEmailCheckResult(res);
        setGoogleVerifiedEmail(verifiedEmail);
        const extra = 'cloudError' in primaryPull && primaryPull.cloudError ? ` (${primaryPull.cloudError})` : '';
        setError(
          `Google verified (${verifiedEmail}), but no shop for "${targetLookupEmail}" was found in Cloud Firestore yet${extra}. On the laptop/device where you registered it, open Admin or Login with Google & click Sync Now so it uploads to Cloud.`
        );
        return;
      }

      setOwnerEmail(verifiedEmail);
      setEmailCheckResult(res);
      setGoogleVerifiedEmail(null);
      await signOutFirebase();
      setError(res.message);
    } catch (err) {
      const host = typeof window !== 'undefined' ? window.location.hostname : undefined;
      setError(formatCloudSyncError(err, host));
    } finally {
      setIsGoogleVerifying(false);
    }
  };

  const submitLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError('');

    const cleanEmail = ownerEmail.trim().toLowerCase();
    if (!cleanEmail) {
      setError('Please enter and verify your registered Gmail / email address.');
      return;
    }
    if (!shopId.trim()) {
      setError('Please enter your Shop ID (e.g. SB-1001).');
      return;
    }
    if (!pin.trim()) {
      setError('Please enter your 4-6 digit staff PIN.');
      return;
    }

    setIsLoggingIn(true);
    try {
      // If signed in with an authorized Google account, pull latest PIN & shop profile from Firestore first
      if (
        auth.currentUser?.emailVerified &&
        isCloudSyncAuthorizedForEmail(auth.currentUser.email, cleanEmail)
      ) {
        try {
          const idToken = await auth.currentUser.getIdToken();
          await syncCloudShopBeforeLoginInDb({
            idToken,
            shopId: shopId.trim().toUpperCase(),
            email: cleanEmail,
          });
        } catch (_) {}
      }

      const emailCheck = await verifyOwnerEmailInDb(cleanEmail);
      setEmailCheckResult(emailCheck);
      if (!emailCheck.validFormat || !emailCheck.registered || !emailCheck.isActive) {
        setError(emailCheck.message);
        return;
      }

      if (
        cloudUserEmail &&
        googleVerifiedEmail &&
        !isCloudSyncAuthorizedForEmail(cloudUserEmail, cleanEmail)
      ) {
        await signOutFirebase();
        setGoogleVerifiedEmail(null);
      }

      const matchingUid =
        auth.currentUser?.emailVerified &&
        isMatchingCloudEmail(auth.currentUser?.email, cleanEmail)
          ? auth.currentUser.uid
          : undefined;

      const { shop, user: loggedUser, workspace } = await loginShopInDb(
        shopId,
        pin,
        cleanEmail,
        matchingUid
      );
      const user: UserProfile = {
        id: loggedUser?.uid || `u_${shop.id}`,
        name: loggedUser?.displayName || shop.ownerName,
        role: loggedUser?.role === 'employee' ? 'employee' : 'owner',
        pin: '',
      };
      onLoginSuccess(user, shop, workspace, loggedUser);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      const needsCloudHint =
        !auth.currentUser && /incorrect|not found|not registered/i.test(msg);
      setError(
        needsCloudHint
          ? `${msg} (If you registered or updated PIN on another device, tap "Verify with Google" below to sync from Cloud.)`
          : msg || 'Login failed.'
      );
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="h-full flex flex-col justify-between px-6 py-5 bg-slate-50 overflow-y-auto">
      {/* Top Header - Standard clean shop logo without hidden tap gesture */}
      <div className="text-center pt-1">
        <BillKartLogo size="lg" variant="emerald" className="mx-auto mb-2.5" />
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">BillKart</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Scan &bull; Bill &bull; Grow &mdash; Verify Gmail, Shop ID &amp; PIN
        </p>
      </div>

      {/* Main Login Form */}
      <div className="max-w-xs mx-auto w-full my-auto space-y-3 py-2">
        {error && (
          <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-[11px] text-red-700 font-medium space-y-2 shadow-sm animate-shake">
            <div className="flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div>{error}</div>
            </div>
            {(!googleVerifiedEmail || /not registered|not found|cloud firestore/i.test(error)) && (
              <div className="flex flex-wrap gap-1.5 pl-6">
                {!googleVerifiedEmail && (
                  <button
                    type="button"
                    onClick={handleGoogleVerify}
                    disabled={isGoogleVerifying}
                    className="px-2.5 py-1 bg-sky-700 hover:bg-sky-800 text-white rounded-lg text-[10px] font-bold flex items-center gap-1"
                  >
                    <ShieldCheck className="w-3 h-3" />
                    {isGoogleVerifying ? 'Syncing...' : 'Verify with Google & Sync'}
                  </button>
                )}
                {googleVerifiedEmail === SUPER_ADMIN_EMAIL && (
                  <button
                    type="button"
                    onClick={() => {
                      setOwnerEmail('rajesh@quickmart.in');
                      setShopId('SB-1001');
                      setError('');
                    }}
                    className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-[10px] font-bold"
                  >
                    Use Demo Store (SB-1001)
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {emailCheckResult && emailCheckResult.registered && emailCheckResult.isActive && !error && (
          <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-[11px] text-emerald-800 font-medium flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold flex items-center gap-1.5 flex-wrap">
                <span>
                  {googleVerifiedEmail && isMatchingCloudEmail(googleVerifiedEmail, emailCheckResult.email)
                    ? 'Google Account Verified'
                    : 'Email Registered & Active'}
                </span>
                <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-emerald-700 text-white">
                  {emailCheckResult.role === 'employee' ? 'Employee' : 'Owner'}
                </span>
              </div>
              <div className="text-[10px] text-emerald-700">
                {emailCheckResult.shopName} ({emailCheckResult.shopId}) &bull;{' '}
                {emailCheckResult.displayName || emailCheckResult.ownerName}
              </div>
            </div>
          </div>
        )}

        <form onSubmit={submitLogin} className="space-y-3">
          {/* Registered Gmail / Email Verification */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="login-owner-email" className="text-xs font-semibold text-slate-700">
                Registered Gmail / Email
              </label>
              <button
                type="button"
                onClick={handleGoogleVerify}
                disabled={isGoogleVerifying}
                className="text-[10px] font-bold text-sky-700 hover:text-sky-800 flex items-center gap-1 disabled:opacity-50"
              >
                <ShieldCheck className="w-3 h-3" />
                {isGoogleVerifying ? 'Verifying...' : 'Verify with Google'}
              </button>
            </div>
            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="login-owner-email"
                  type="email"
                  value={ownerEmail}
                  onChange={(e) => {
                    setOwnerEmail(e.target.value);
                    setEmailCheckResult(null);
                    setGoogleVerifiedEmail(null);
                    setError('');
                  }}
                  placeholder="owner@gmail.com"
                  className="w-full pl-9 pr-2.5 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-white shadow-sm"
                  required
                />
              </div>
              <button
                type="button"
                onClick={handleCheckEmail}
                disabled={isCheckingEmail}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white text-[11px] font-bold rounded-xl shadow-sm transition shrink-0"
              >
                {isCheckingEmail ? '...' : 'Verify'}
              </button>
            </div>
          </div>

          {/* Shop ID Input */}
          <div>
            <label htmlFor="login-shop-id" className="text-xs font-semibold text-slate-700 block mb-1">
              Shop ID
            </label>
            <div className="relative">
              <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="login-shop-id"
                type="text"
                value={shopId}
                onChange={(e) => {
                  setShopId(e.target.value.toUpperCase());
                  setError('');
                }}
                placeholder="e.g. SB-1001"
                className="w-full pl-9 pr-3 py-2 text-sm font-mono font-bold tracking-wider uppercase border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-white shadow-sm"
                required
              />
            </div>
          </div>

          {/* PIN Input */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="login-staff-pin" className="text-xs font-semibold text-slate-700">Staff PIN</label>
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="text-[11px] text-slate-500 hover:text-emerald-700 font-medium"
              >
                {showPin ? 'Hide' : 'Show'}
              </button>
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="login-staff-pin"
                type={showPin ? 'text' : 'password'}
                maxLength={6}
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  setError('');
                }}
                placeholder="••••"
                className="w-full pl-9 pr-3 py-2 text-center text-base tracking-widest font-mono border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-white shadow-sm"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoggingIn}
            className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white font-bold rounded-xl shadow-md transition active:scale-98 text-sm"
          >
            {isLoggingIn ? 'Signing In...' : 'Sign In to Shop'}
          </button>
        </form>
      </div>

      {/* Subtle App Footer & Mobile Install Prompt */}
      <div className="text-center pt-3 border-t border-slate-200 text-slate-400 space-y-2.5">
        <PWAInstallButton variant="compact" />
        <div className="flex items-center justify-center gap-1.5 text-[11px]">
          <span>BillKart v2.4</span>
          <span>&bull;</span>
          <span>Offline-Ready</span>
          <span>&bull;</span>
          <button
            type="button"
            onClick={() => {
              setShowDevModal(true);
              setDevModalError('');
              setDevPasswordInput('');
            }}
            className="hover:text-slate-600 transition p-0.5 rounded"
            title="Restricted Developer Admin Gateway"
          >
            <Key className="w-3 h-3 text-slate-300 hover:text-sky-500" />
          </button>
        </div>
        <p className="text-[10px] text-slate-400 mt-0.5">
          For shop owners &amp; store cashiers only
        </p>
      </div>

      {/* Hidden Developer Access Password Modal */}
      {showDevModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
          <div className="bg-slate-900 text-white rounded-2xl p-5 max-w-xs w-full shadow-2xl border border-slate-800 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <div className="flex items-center gap-2 text-sky-400 font-bold text-sm">
                <ShieldCheck className="w-4 h-4 text-sky-400" />
                <span>Developer Admin Gateway</span>
              </div>
              <button
                type="button"
                onClick={() => setShowDevModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 mb-3">
              This area is restricted to developers &amp; system administrators. Enter developer master password to proceed:
            </p>

            {devModalError && (
              <div className="p-2 mb-3 bg-red-950/50 border border-red-800 rounded-lg text-xs text-red-300">
                {devModalError}
              </div>
            )}

            <form onSubmit={handleDevLogin} className="space-y-3">
              <input
                type="password"
                value={devPasswordInput}
                onChange={(e) => {
                  setDevPasswordInput(e.target.value);
                  setDevModalError('');
                }}
                placeholder="Enter developer key..."
                autoFocus
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
              />

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowDevModal(false)}
                  className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={devBusy}
                  className="flex-1 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-white rounded-xl text-xs font-bold shadow"
                >
                  {devBusy ? 'Verifying...' : 'Unlock Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// SCREEN 3: HOME
function HomeScreenView({
  shopProfile,
  currentUser,
  activeUserEmail,
  activeOwnerEmail,
  cloudUserEmail,
  employeesCount,
  bills,
  items,
  isOnline,
  isSyncing,
  lastSyncedAt,
  autoSyncNotice,
  lastSyncError,
  pendingSyncCount,
  hasCloudAuth,
  onSyncNow,
  onSwitchGoogleAccount,
  onOpenEmployees,
  onOpenAuditLogs,
  onOpenBackup,
  onLogout,
  fmt,
  fmtDate,
  onNavigate,
  onSelectBill,
}: {
  shopProfile: { shopId?: string; name: string; currencySymbol: string };
  currentUser: UserProfile | null;
  activeUserEmail: string;
  activeOwnerEmail: string;
  cloudUserEmail: string | null;
  employeesCount: number;
  bills: BillRecord[];
  items: ShopItem[];
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncedAt: string | null;
  autoSyncNotice?: string | null;
  lastSyncError?: string | null;
  pendingSyncCount: number;
  hasCloudAuth: boolean;
  onSyncNow: () => void;
  onSwitchGoogleAccount: () => void;
  onOpenEmployees: () => void;
  onOpenAuditLogs: () => void;
  onOpenBackup: () => void;
  onLogout: () => void;
  fmt: (v: number) => string;
  fmtDate: (s: string) => string;
  onNavigate: (s: AppScreen) => void;
  onSelectBill: (b: BillRecord) => void;
}) {
  const isOwner = currentUser?.role !== 'employee';
  const expectedSyncEmail = activeUserEmail || activeOwnerEmail;
  const isWrongGoogleEmail = Boolean(cloudUserEmail && !hasCloudAuth);
  const todaySales = useMemo(() => {
    return bills.reduce((acc, b) => acc + b.grandTotal, 0);
  }, [bills]);

  return (
    <div className="h-full flex flex-col bg-slate-100 overflow-y-auto">
      <div className="bg-emerald-800 text-white p-4 shadow-sm shrink-0 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-bold leading-tight">{shopProfile.name}</h2>
            {shopProfile.shopId && (
              <span className="text-[10px] font-mono font-bold bg-emerald-950/60 text-emerald-200 px-1.5 py-0.5 rounded border border-emerald-700/50">
                {shopProfile.shopId}
              </span>
            )}
          </div>
          <p className="text-xs text-emerald-200">
            {currentUser?.name || 'Store Cashier'} • {isOwner ? 'Shop Owner' : 'Employee (Staff)'}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {isOwner ? (
            <button
              onClick={() => onNavigate('settings')}
              aria-label="Shop Settings"
              className="p-2 hover:bg-emerald-700 rounded-full transition"
            >
              <Settings className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={onLogout}
              aria-label="Logout"
              className="px-2.5 py-1.5 bg-emerald-900/70 hover:bg-emerald-700 rounded-xl text-[11px] font-bold flex items-center gap-1 transition"
            >
              <LogOut className="w-3.5 h-3.5" /> Logout
            </button>
          )}
        </div>
      </div>

      {/* Offline SQLite & Cloud Sync Bar */}
      <div
        data-testid="cloud-sync-bar"
        className={`px-4 py-2 border-b text-[11px] flex items-center justify-between gap-2 ${
          !isOnline
            ? 'bg-amber-50 border-amber-200 text-amber-900'
            : lastSyncError
              ? 'bg-red-50 border-red-200 text-red-900'
              : !hasCloudAuth
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : pendingSyncCount > 0
                  ? 'bg-sky-50 border-sky-200 text-sky-900'
                  : 'bg-emerald-50 border-emerald-100 text-emerald-900'
        }`}
      >
        <div className="flex items-center gap-1.5 font-medium min-w-0">
          {!isOnline ? (
            <>
              <WifiOff className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span className="truncate">
                Offline Mode • Saving in SQLite
                {pendingSyncCount > 0 ? ` (${pendingSyncCount} pending)` : ''}
              </span>
            </>
          ) : isSyncing ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 text-sky-600 animate-spin shrink-0" />
              <span className="truncate">Syncing SQLite records to Firestore...</span>
            </>
          ) : lastSyncError ? (
            <>
              <ShieldAlert className="w-3.5 h-3.5 text-red-600 shrink-0" />
              <span className="line-clamp-2">{lastSyncError}</span>
            </>
          ) : !hasCloudAuth ? (
            <>
              <CloudOff className="w-3.5 h-3.5 text-amber-700 shrink-0" />
              <span className="line-clamp-2">
                {isWrongGoogleEmail
                  ? `Wrong Gmail (${cloudUserEmail}) • Switch to ${expectedSyncEmail}`
                  : pendingSyncCount > 0
                    ? `${pendingSyncCount} SQLite change(s) pending • Sign in to Cloud`
                    : `Local SQLite only • Sign in with Google (${expectedSyncEmail}) for Cloud Sync`}
              </span>
            </>
          ) : autoSyncNotice ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
              <span className="truncate">{autoSyncNotice}</span>
            </>
          ) : pendingSyncCount > 0 ? (
            <>
              <CloudOff className="w-3.5 h-3.5 text-sky-700 shrink-0" />
              <span className="truncate">Auto-sync queued ({pendingSyncCount} pending)</span>
            </>
          ) : (
            <>
              <Wifi className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
              <span className="truncate">
                Online • Synced{lastSyncedAt ? ` (${fmtDate(lastSyncedAt)})` : ''}
              </span>
            </>
          )}
        </div>
        {isOnline && !isSyncing && (
          <div className="flex items-center gap-1 shrink-0">
            {!hasCloudAuth && isRunningInIframe() && typeof window !== 'undefined' && (
              <a
                href={window.location.href}
                target="_blank"
                rel="noopener noreferrer"
                title="Open in a standalone browser tab for reliable Google Sign-In"
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-900 text-white font-bold text-[10px]"
              >
                New Tab ↗
              </a>
            )}
            <button
              type="button"
              onClick={isWrongGoogleEmail ? onSwitchGoogleAccount : onSyncNow}
              className={`px-2 py-0.5 rounded text-white font-bold text-[10px] ${
                lastSyncError
                  ? 'bg-red-700 hover:bg-red-800'
                  : !hasCloudAuth
                    ? 'bg-amber-700 hover:bg-amber-800'
                    : 'bg-sky-700 hover:bg-sky-800'
              }`}
            >
              {isWrongGoogleEmail
                ? 'Switch Gmail'
                : hasCloudAuth
                  ? 'Sync Now'
                  : 'Sign In & Sync'}
            </button>
          </div>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* Create New Bill Hero Card */}
        <div
          onClick={() => onNavigate('new_bill')}
          className="bg-emerald-700 hover:bg-emerald-600 text-white p-5 rounded-2xl shadow-md cursor-pointer transition flex items-center justify-between active:scale-98"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white text-emerald-800 rounded-full flex items-center justify-center shadow">
              <ShoppingCart className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-base">Create New Bill</h3>
              <p className="text-xs text-emerald-100">Add items with quantity / weight (kg & g)</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-emerald-200" />
        </div>

        {/* Today's KPI row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs text-slate-500 font-medium">Total Sales</span>
            <div className="text-lg font-bold text-slate-900 mt-1">{fmt(todaySales)}</div>
            <span className="text-[10px] text-emerald-600 font-semibold">{bills.length} bills issued</span>
          </div>
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs text-slate-500 font-medium">Catalog Items</span>
            <div className="text-lg font-bold text-slate-900 mt-1">{items.length} Products</div>
            <span className="text-[10px] text-amber-600 font-semibold">Includes kg & pcs</span>
          </div>
        </div>

        {/* Quick Actions Grid */}
        <div>
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Management</h4>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => onNavigate('items')}
              className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm text-left hover:border-emerald-500 transition flex items-center gap-3"
            >
              <div className="w-9 h-9 bg-purple-100 text-purple-700 rounded-lg flex items-center justify-center">
                <Package className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-800">Items &amp; Stock</div>
                <div className="text-[10px] text-slate-400">
                  {isOwner ? `${items.length} products` : `${items.length} items (view)`}
                </div>
              </div>
            </button>

            <button
              onClick={() => onNavigate('bills')}
              className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm text-left hover:border-emerald-500 transition flex items-center gap-3"
            >
              <div className="w-9 h-9 bg-blue-100 text-blue-700 rounded-lg flex items-center justify-center">
                <Receipt className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-800">All Bills</div>
                <div className="text-[10px] text-slate-400">History &amp; PDF receipts</div>
              </div>
            </button>

            <button
              onClick={() => onNavigate('reports')}
              className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm text-left hover:border-emerald-500 transition flex items-center gap-3"
            >
              <div className="w-9 h-9 bg-amber-100 text-amber-700 rounded-lg flex items-center justify-center">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-800">Sales Reports</div>
                <div className="text-[10px] text-slate-400">Daily, weekly, custom</div>
              </div>
            </button>

            {isOwner ? (
              <button
                onClick={onOpenEmployees}
                className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm text-left hover:border-emerald-500 transition flex items-center gap-3"
              >
                <div className="w-9 h-9 bg-sky-100 text-sky-700 rounded-lg flex items-center justify-center">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-800">Employees</div>
                  <div className="text-[10px] text-slate-400">{employeesCount} staff member(s)</div>
                </div>
              </button>
            ) : (
              <button
                onClick={onLogout}
                className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm text-left hover:border-red-400 transition flex items-center gap-3"
              >
                <div className="w-9 h-9 bg-red-100 text-red-700 rounded-lg flex items-center justify-center">
                  <LogOut className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-800">Switch User</div>
                  <div className="text-[10px] text-slate-400 truncate max-w-[100px]">{activeUserEmail}</div>
                </div>
              </button>
            )}

            {isOwner && (
              <>
                <button
                  onClick={onOpenAuditLogs}
                  className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm text-left hover:border-emerald-500 transition flex items-center gap-3"
                >
                  <div className="w-9 h-9 bg-indigo-100 text-indigo-700 rounded-lg flex items-center justify-center">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800">Audit Logs</div>
                    <div className="text-[10px] text-slate-400">Security &amp; stock trail</div>
                  </div>
                </button>

                <button
                  onClick={onOpenBackup}
                  className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm text-left hover:border-emerald-500 transition flex items-center gap-3"
                >
                  <div className="w-9 h-9 bg-emerald-100 text-emerald-700 rounded-lg flex items-center justify-center">
                    <Cloud className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800">Backup &amp; Restore</div>
                    <div className="text-[10px] text-slate-400">SQLite &amp; Cloud JSON</div>
                  </div>
                </button>

                <button
                  onClick={() => onNavigate('settings')}
                  className="col-span-2 bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm text-left hover:border-emerald-500 transition flex items-center gap-3"
                >
                  <div className="w-9 h-9 bg-teal-100 text-teal-700 rounded-lg flex items-center justify-center">
                    <Settings className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800">Store Settings &amp; PIN</div>
                    <div className="text-[10px] text-slate-400">Receipt header, GST rate &amp; owner PIN reset</div>
                  </div>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Recent Bills List */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Recent Bills</h4>
            <button
              onClick={() => onNavigate('bills')}
              className="text-xs text-emerald-700 font-semibold hover:underline"
            >
              View All
            </button>
          </div>
          <div className="space-y-2">
            {bills.slice(0, 3).map((b) => (
              <div
                key={b.id}
                onClick={() => onSelectBill(b)}
                className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between cursor-pointer hover:border-emerald-400 transition"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-slate-900">{b.billNumber}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">
                      {b.paymentMethod}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {b.customerName || 'Walk-in'} • {fmtDate(b.createdAt)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-sm text-emerald-800">{fmt(b.grandTotal)}</div>
                  <div className="text-[10px] text-slate-400">{b.items.length} items</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// SCREEN 4: ITEMS
function ItemsScreenView({
  items,
  canManage,
  isOnline,
  isSyncing,
  hasCloudAuth,
  pendingItemsCount,
  lastSyncError,
  onSyncNow,
  fmt,
  onBack,
  onAddItem,
  onEditItem,
}: {
  items: ShopItem[];
  canManage: boolean;
  isOnline: boolean;
  isSyncing: boolean;
  hasCloudAuth: boolean;
  pendingItemsCount: number;
  lastSyncError?: string | null;
  onSyncNow: () => void;
  fmt: (v: number) => string;
  onBack: () => void;
  onAddItem: () => void;
  onEditItem: (i: ShopItem) => void;
}) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');

  const categories = ['All', ...Array.from(new Set(items.map((i) => i.category)))];

  const filtered = items.filter((i) => {
    const matchQuery =
      search === '' ||
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.code.toLowerCase().includes(search.toLowerCase());
    const matchCat = category === 'All' || i.category === category;
    return matchQuery && matchCat;
  });

  return (
    <div className="h-full flex flex-col bg-slate-100">
      <div className="bg-emerald-800 text-white p-4 shadow-sm shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="p-1 hover:bg-emerald-700 rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-base font-bold">
            {canManage ? 'Items & Inventory' : 'Store Catalog (View Only)'}
          </h2>
        </div>
        <div className="flex items-center gap-1.5">
          {pendingItemsCount > 0 && isOnline && (
            <button
              type="button"
              onClick={onSyncNow}
              disabled={isSyncing}
              className="px-2 py-1 bg-sky-700 hover:bg-sky-600 rounded-lg text-[10px] font-bold flex items-center gap-1"
            >
              <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Syncing' : hasCloudAuth ? `Sync (${pendingItemsCount})` : 'Connect & Sync'}
            </button>
          )}
          {canManage && (
            <button
              onClick={onAddItem}
              className="p-1.5 bg-emerald-700 hover:bg-emerald-600 rounded-lg flex items-center gap-1 text-xs font-semibold"
            >
              <Plus className="w-4 h-4" /> Add
            </button>
          )}
        </div>
      </div>

      {lastSyncError && (
        <div className="px-3 py-2 bg-red-50 border-b border-red-200 text-[11px] text-red-800 font-medium flex items-center gap-1.5">
          <ShieldAlert className="w-3.5 h-3.5 text-red-600 shrink-0" />
          <span className="line-clamp-2">{lastSyncError}</span>
        </div>
      )}

      <div className="p-3 bg-white border-b border-slate-200 space-y-2 shrink-0">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items by name or SKU code..."
            className="w-full pl-9 pr-3 py-2 bg-slate-100 rounded-lg text-xs border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-600"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition ${
                category === c
                  ? 'bg-emerald-700 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filtered.map((item) => (
          <div
            key={item.id}
            onClick={() => {
              if (canManage) onEditItem(item);
            }}
            className={`bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between transition ${
              canManage ? 'hover:border-emerald-500 cursor-pointer' : ''
            }`}
          >
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-bold text-xs text-slate-900">{item.name}</span>
                {item.unit === 'kg' && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 flex items-center gap-0.5">
                    <Scale className="w-2.5 h-2.5" /> kg/g
                  </span>
                )}
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                    item.syncStatus === 'synced'
                      ? 'bg-sky-50 text-sky-700'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {item.syncStatus === 'synced' ? 'Synced' : 'Pending Sync'}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                  {item.code}
                </span>
                <span className="text-[10px] text-slate-400">{item.category}</span>
              </div>
            </div>
            <div className="text-right">
              <div className="font-bold text-sm text-emerald-800">
                {fmt(item.price)}
                <span className="text-[10px] font-normal text-slate-500 ml-0.5">
                  {item.unit === 'kg' ? '/kg' : '/pc'}
                </span>
              </div>
              <div
                className={`text-[10px] font-semibold ${
                  item.stock <= 15 ? 'text-red-600' : 'text-slate-500'
                }`}
              >
                Stock: {item.stock} {item.unit}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// SCREEN 5: ADD / EDIT ITEM
function AddEditItemScreenView({
  item,
  fmt,
  currencySymbol,
  onBack,
  onSave,
  onDelete,
}: {
  item: ShopItem | null;
  fmt: (v: number) => string;
  currencySymbol: string;
  onBack: () => void;
  onSave: (i: ShopItem) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState(item?.name || '');
  const [code, setCode] = useState(item?.code || `SKU-${Math.floor(100 + Math.random() * 900)}`);
  const [price, setPrice] = useState(item ? item.price.toString() : '');
  const [stock, setStock] = useState(item ? item.stock.toString() : '50');
  const [category, setCategory] = useState(item?.category || 'Groceries');
  const [unit, setUnit] = useState<ItemUnit>(item?.unit || 'pcs');

  const categories = ['Groceries', 'Beverages', 'Dairy', 'Bakery', 'Cleaning', 'Personal Care', 'Snacks'];

  const handleSave = () => {
    if (!name.trim()) return;
    const parsedPrice = parseFloat(price) || 0;
    const parsedStock = parseFloat(stock) || 0;
    onSave({
      id: item?.id || `i_${Date.now()}`,
      name: name.trim(),
      code: code.trim(),
      price: parsedPrice,
      stock: parsedStock,
      category,
      unit,
    });
  };

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-emerald-800 text-white p-4 shadow-sm shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="p-1 hover:bg-emerald-700 rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-base font-bold">{item ? 'Edit Item' : 'Add New Item'}</h2>
        </div>
        {item && (
          <button
            onClick={() => onDelete(item.id)}
            className="p-1.5 text-red-200 hover:text-red-100 hover:bg-red-800/40 rounded-lg"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <div>
          <label className="text-xs font-semibold text-slate-700 block mb-1">Item Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={unit === 'kg' ? 'e.g. Basmati Rice, Sugar' : 'e.g. Milk Bread 400g'}
            className="w-full px-3 py-2 bg-white rounded-xl text-xs border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-700 block mb-1">Item Code / SKU *</label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full px-3 py-2 bg-white rounded-xl text-xs border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600 font-mono"
          />
        </div>

        {/* Unit Selector */}
        <div>
          <label className="text-xs font-semibold text-slate-700 block mb-1">Unit of Measurement *</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setUnit('pcs')}
              className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                unit === 'pcs'
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                  : 'border-slate-300 bg-white text-slate-600'
              }`}
            >
              <Package className="w-4 h-4" /> Pieces (pcs)
            </button>
            <button
              type="button"
              onClick={() => setUnit('kg')}
              className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                unit === 'kg'
                  ? 'border-amber-600 bg-amber-50 text-amber-900'
                  : 'border-slate-300 bg-white text-slate-600'
              }`}
            >
              <Scale className="w-4 h-4" /> Weight (kg / g)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              {unit === 'kg' ? `Price per kg (${currencySymbol}) *` : `Price per pc (${currencySymbol}) *`}
            </label>
            <input
              type="number"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 bg-white rounded-xl text-xs border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              {unit === 'kg' ? 'Stock (kg) *' : 'Stock (pcs) *'}
            </label>
            <input
              type="number"
              step="0.1"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              placeholder="0"
              className="w-full px-3 py-2 bg-white rounded-xl text-xs border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-700 block mb-1">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3 py-2 bg-white rounded-xl text-xs border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="p-4 bg-white border-t border-slate-200">
        <button
          onClick={handleSave}
          className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl shadow transition"
        >
          {item ? 'Save Item Changes' : 'Create Item'}
        </button>
      </div>
    </div>
  );
}

// SCREEN 6: NEW BILL (WITH QUANTITY & WEIGHT PROMPT DIALOG)
function NewBillScreenView({
  items,
  taxRate,
  currencySymbol,
  cashierName,
  fmt,
  onBack,
  onBillSaved,
}: {
  items: ShopItem[];
  taxRate: number;
  currencySymbol: string;
  cashierName: string;
  fmt: (v: number) => string;
  onBack: () => void;
  onBillSaved: (b: BillRecord) => void;
}) {
  const [billItems, setBillItems] = useState<BillItemEntry[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [discountType, setDiscountType] = useState<'pct' | 'flat'>('pct');
  const [discountValue, setDiscountValue] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMode>('Cash');
  const [applyGst, setApplyGst] = useState<boolean>(false);
  const [billGstRate, setBillGstRate] = useState<number>(taxRate || 5);

  // Search catalog modal
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Prompt Quantity / Weight Modal state
  const [promptItem, setPromptItem] = useState<ShopItem | null>(null);
  const [promptWeightMode, setPromptWeightMode] = useState<'kg' | 'g'>('kg');
  const [promptQtyInput, setPromptQtyInput] = useState('1');
  const [promptPriceInput, setPromptPriceInput] = useState('0');

  // Open prompt for an item
  const openItemPrompt = (item: ShopItem, existing?: BillItemEntry) => {
    const isWeight = item.unit === 'kg';
    setPromptItem(item);
    setPromptPriceInput(existing ? existing.unitPrice.toString() : item.price.toString());

    if (existing) {
      if (isWeight && existing.quantity < 1.0) {
        setPromptWeightMode('g');
        setPromptQtyInput(Math.round(existing.quantity * 1000).toString());
      } else {
        setPromptWeightMode('kg');
        setPromptQtyInput(existing.quantity.toString());
      }
    } else {
      if (isWeight) {
        setPromptWeightMode('kg');
        setPromptQtyInput('1');
      } else {
        setPromptQtyInput('1');
      }
    }
  };

  const handleConfirmPrompt = () => {
    if (!promptItem) return;
    const isWeight = promptItem.unit === 'kg';
    const rawVal = parseFloat(promptQtyInput) || 0;
    if (rawVal <= 0) return;

    // Convert grams to kg if needed
    const finalQuantity = isWeight && promptWeightMode === 'g' ? rawVal / 1000 : rawVal;
    const finalPrice = parseFloat(promptPriceInput) || promptItem.price;

    setBillItems((prev) => {
      const idx = prev.findIndex((i) => i.itemId === promptItem.id);
      if (idx !== -1) {
        const copy = [...prev];
        copy[idx].quantity = finalQuantity;
        copy[idx].unitPrice = finalPrice;
        return copy;
      }
      return [
        ...prev,
        {
          itemId: promptItem.id,
          name: promptItem.name,
          code: promptItem.code,
          unitPrice: finalPrice,
          quantity: finalQuantity,
          unit: promptItem.unit,
        },
      ];
    });

    setPromptItem(null);
  };

  // Calculations
  const subtotal = billItems.reduce((acc, i) => acc + i.unitPrice * i.quantity, 0);

  const discountAmount = useMemo(() => {
    const val = parseFloat(discountValue) || 0;
    if (val <= 0) return 0;
    if (discountType === 'pct') {
      return (subtotal * Math.min(100, val)) / 100;
    }
    return Math.min(subtotal, val);
  }, [subtotal, discountType, discountValue]);

  const taxableAmount = Math.max(0, subtotal - discountAmount);
  const taxAmount = applyGst ? Math.round(((taxableAmount * billGstRate) / 100) * 100) / 100 : 0;
  const grandTotal = Math.round((taxableAmount + taxAmount) * 100) / 100;

  const updateQty = (index: number, delta: number) => {
    setBillItems((prev) => {
      const copy = [...prev];
      const item = copy[index];
      const step = item.unit === 'kg' ? 0.25 : 1.0;
      const newQty = item.quantity + (delta > 0 ? step : -step);
      if (newQty <= 0) {
        copy.splice(index, 1);
      } else {
        copy[index].quantity = Number(newQty.toFixed(3));
      }
      return copy;
    });
  };

  const handleSave = () => {
    if (billItems.length === 0) return;
    const newBill: BillRecord = {
      id: `b_${Date.now()}`,
      billNumber: `SB-${Math.floor(1000 + Math.random() * 9000)}`,
      createdAt: new Date().toISOString(),
      items: billItems,
      customerName: customerName.trim() || undefined,
      customerPhone: customerPhone.trim() || undefined,
      subtotal,
      discountAmount,
      taxAmount,
      grandTotal,
      paymentMethod,
      cashierName: cashierName || 'Staff Cashier',
    };
    onBillSaved(newBill);
  };

  return (
    <div className="h-full flex flex-col bg-slate-100 relative">
      {/* App Bar */}
      <div className="bg-emerald-800 text-white p-4 shadow-sm shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="p-1 hover:bg-emerald-700 rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-base font-bold">New Bill</h2>
        </div>
        <button
          onClick={() => setIsPickerOpen(true)}
          className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 rounded-lg text-xs font-semibold flex items-center gap-1 shadow-sm"
        >
          <Plus className="w-4 h-4" /> Add Item
        </button>
      </div>

      {/* Item Quick Search / Add Bar */}
      <div className="p-3 bg-white border-b border-slate-200">
        <button
          onClick={() => setIsPickerOpen(true)}
          className="w-full py-2.5 px-3 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs text-slate-500 flex items-center gap-2 transition"
        >
          <Search className="w-4 h-4 text-slate-400" />
          <span>Tap to search & enter quantity / weight...</span>
        </button>
      </div>

      {/* Line Items List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {billItems.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-30 text-slate-500" />
            <p className="text-xs font-medium">Bill is currently empty</p>
            <p className="text-[11px] text-slate-400 mt-1">Tap below to add items with quantity or weight</p>
            <button
              onClick={() => setIsPickerOpen(true)}
              className="mt-3 px-4 py-2 bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-sm"
            >
              Browse Catalog
            </button>
          </div>
        ) : (
          billItems.map((bi, idx) => (
            <div
              key={bi.itemId}
              className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between"
            >
              <div className="flex-1 min-w-0 pr-2">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-xs text-slate-900 truncate">{bi.name}</span>
                  {bi.unit === 'kg' && (
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-900">
                      kg/g
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-slate-400 font-mono">{bi.code}</span>
                  <span className="text-[11px] font-semibold text-emerald-700">
                    @{fmt(bi.unitPrice)} {bi.unit === 'kg' ? '/kg' : '/pc'}
                  </span>
                </div>
              </div>

              {/* Quantity / Weight Badge & Controls */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                <button
                  onClick={() => updateQty(idx, -1)}
                  className="w-6 h-6 rounded bg-white text-slate-700 shadow-sm flex items-center justify-center hover:bg-slate-50"
                >
                  <Minus className="w-3 h-3" />
                </button>

                {/* Tapping opens the edit weight/quantity modal */}
                <button
                  onClick={() => {
                    const orig = items.find((i) => i.id === bi.itemId) || {
                      id: bi.itemId,
                      name: bi.name,
                      code: bi.code,
                      price: bi.unitPrice,
                      stock: 999,
                      category: 'General',
                      unit: bi.unit,
                    };
                    openItemPrompt(orig, bi);
                  }}
                  className="px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 rounded text-xs font-bold text-emerald-800 text-center min-w-[50px] transition"
                  title="Click to edit quantity or weight"
                >
                  {formatQtyDisplay(bi.quantity, bi.unit)}
                </button>

                <button
                  onClick={() => updateQty(idx, 1)}
                  className="w-6 h-6 rounded bg-white text-slate-700 shadow-sm flex items-center justify-center hover:bg-slate-50"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>

              {/* Line Total */}
              <div className="text-right w-18 pl-2">
                <div className="font-bold text-xs text-slate-900">{fmt(bi.unitPrice * bi.quantity)}</div>
                <button
                  onClick={() => {
                    setBillItems(billItems.filter((_, i) => i !== idx));
                  }}
                  className="text-[10px] text-red-500 hover:underline"
                >
                  Remove
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Bottom Summary Tray */}
      <div className="bg-white border-t border-slate-200 p-3 shadow-lg shrink-0 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            placeholder="Customer Name (optional)"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 rounded-lg text-xs border border-slate-200 focus:outline-none"
          />
          <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5">
            <span className="text-[10px] font-semibold text-slate-500">Disc:</span>
            <input
              type="number"
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              className="w-12 bg-transparent text-xs font-mono focus:outline-none text-right"
            />
            <button
              onClick={() => setDiscountType(discountType === 'pct' ? 'flat' : 'pct')}
              className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800"
            >
              {discountType === 'pct' ? '%' : currencySymbol}
            </button>
          </div>
        </div>

        {/* Payment selector */}
        <div className="flex items-center gap-1.5 pt-1">
          <span className="text-[10px] font-bold text-slate-500 uppercase">Payment:</span>
          {(['Cash', 'UPI', 'Card', 'Other'] as PaymentMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setPaymentMethod(mode)}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition ${
                paymentMethod === mode
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        {/* Optional GST Switch */}
        <div className={`p-1.5 rounded-lg border flex items-center justify-between text-xs transition ${
          applyGst ? 'bg-emerald-50/80 border-emerald-300' : 'bg-slate-50 border-slate-200'
        }`}>
          <div className="flex items-center gap-1.5">
            <span className={`w-5 h-5 rounded flex items-center justify-center font-bold text-[10px] ${
              applyGst ? 'bg-emerald-700 text-white' : 'bg-slate-200 text-slate-500'
            }`}>
              %
            </span>
            <div>
              <p className="font-semibold text-slate-800 text-[11px] leading-tight">Add GST (Tax)</p>
              <p className="text-[9px] text-slate-500">
                {applyGst ? `Applying ${billGstRate}% (${fmt(taxAmount)})` : 'No GST added (0%)'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {applyGst && (
              <select
                value={billGstRate}
                onChange={(e) => setBillGstRate(Number(e.target.value))}
                className="text-[10px] bg-white border border-emerald-300 rounded px-1 py-0.5 font-bold text-emerald-800 focus:outline-none"
              >
                <option value={5}>5%</option>
                <option value={12}>12%</option>
                <option value={18}>18%</option>
                <option value={28}>28%</option>
              </select>
            )}
            <button
              type="button"
              onClick={() => setApplyGst(!applyGst)}
              className={`w-8 h-4 flex items-center rounded-full p-0.5 cursor-pointer transition ${
                applyGst ? 'bg-emerald-600 justify-end' : 'bg-slate-300 justify-start'
              }`}
            >
              <span className="w-3 h-3 bg-white rounded-full shadow-xs" />
            </button>
          </div>
        </div>

        {/* Breakdown */}
        <div className="border-t border-slate-100 pt-1.5 space-y-0.5 text-[11px]">
          <div className="flex justify-between text-slate-500">
            <span>Subtotal ({billItems.length} items)</span>
            <span>{fmt(subtotal)}</span>
          </div>
          {discountAmount > 0 && (
            <div className="flex justify-between text-red-600">
              <span>Discount</span>
              <span>- {fmt(discountAmount)}</span>
            </div>
          )}
          <div className="flex justify-between text-slate-500">
            <span>GST {applyGst ? `(${billGstRate}%)` : ''}</span>
            <span className={applyGst ? 'font-semibold text-slate-700' : 'text-slate-400'}>
              {applyGst ? fmt(taxAmount) : 'None (0%)'}
            </span>
          </div>
          <div className="flex justify-between font-bold text-sm text-slate-900 pt-1 border-t border-slate-100">
            <span>Grand Total</span>
            <span className="text-emerald-700">{fmt(grandTotal)}</span>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={billItems.length === 0}
          className={`w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition ${
            billItems.length > 0
              ? 'bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer active:scale-98'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          Save & Generate Bill
        </button>
      </div>

      {/* Catalog Search Bottom Sheet */}
      {isPickerOpen && (
        <div className="absolute inset-0 bg-black/50 z-40 flex flex-col justify-end">
          <div className="bg-white rounded-t-3xl max-h-[80%] flex flex-col shadow-2xl animate-in slide-in-from-bottom">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-900">Select Item to Add</h3>
              <button
                onClick={() => setIsPickerOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 border-b border-slate-100">
              <input
                type="text"
                placeholder="Search items by name or SKU..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 bg-slate-100 rounded-xl text-xs border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-600"
              />
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {items
                .filter(
                  (i) =>
                    searchQuery === '' ||
                    i.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    i.code.toLowerCase().includes(searchQuery.toLowerCase())
                )
                .map((itm) => {
                  const existing = billItems.find((bi) => bi.itemId === itm.id);
                  return (
                    <div
                      key={itm.id}
                      onClick={() => {
                        setIsPickerOpen(false);
                        openItemPrompt(itm, existing);
                      }}
                      className="p-2.5 rounded-xl border border-slate-200 hover:border-emerald-500 flex items-center justify-between cursor-pointer hover:bg-emerald-50/50 transition"
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-xs text-slate-800">{itm.name}</span>
                          {itm.unit === 'kg' && (
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-900">
                              kg / g
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Code: {itm.code} • Stock: {itm.stock} {itm.unit}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-emerald-800">
                          {fmt(itm.price)}
                          <span className="text-[10px] text-slate-400 font-normal">
                            {itm.unit === 'kg' ? '/kg' : '/pc'}
                          </span>
                        </span>
                        <button className="px-2 py-1 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-bold hover:bg-emerald-200">
                          {existing ? formatQtyDisplay(existing.quantity, existing.unit) : '+ Select'}
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="p-3 border-t border-slate-200">
              <button
                onClick={() => setIsPickerOpen(false)}
                className="w-full py-2 bg-slate-900 text-white rounded-xl text-xs font-bold"
              >
                Close Catalog
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DEDICATED QUANTITY & WEIGHT PROMPT DIALOG */}
      {promptItem && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-sm rounded-t-3xl sm:rounded-2xl p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    promptItem.unit === 'kg' ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {promptItem.unit === 'kg' ? <Scale className="w-5 h-5" /> : <Package className="w-5 h-5" />}
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900">{promptItem.name}</h4>
                  <p className="text-[11px] text-slate-500">
                    Rate: {fmt(promptItem.price)} {promptItem.unit === 'kg' ? '/kg' : '/pc'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPromptItem(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* If item is weighted (kg), offer kg vs g selection */}
            {promptItem.unit === 'kg' ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                  <span>Enter Weight In:</span>
                  <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                    <button
                      type="button"
                      onClick={() => {
                        const cur = parseFloat(promptQtyInput) || 0;
                        if (promptWeightMode === 'g') {
                          setPromptQtyInput((cur / 1000).toString());
                        }
                        setPromptWeightMode('kg');
                      }}
                      className={`px-3 py-1 rounded-md text-xs font-bold transition ${
                        promptWeightMode === 'kg' ? 'bg-amber-600 text-white shadow' : 'text-slate-600'
                      }`}
                    >
                      Kilograms (kg)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const cur = parseFloat(promptQtyInput) || 0;
                        if (promptWeightMode === 'kg') {
                          setPromptQtyInput(Math.round(cur * 1000).toString());
                        }
                        setPromptWeightMode('g');
                      }}
                      className={`px-3 py-1 rounded-md text-xs font-bold transition ${
                        promptWeightMode === 'g' ? 'bg-amber-600 text-white shadow' : 'text-slate-600'
                      }`}
                    >
                      Grams (g)
                    </button>
                  </div>
                </div>

                {/* Quick Weight Chips */}
                <div className="flex flex-wrap gap-1.5">
                  {(promptWeightMode === 'g'
                    ? [
                        { label: '100 g', val: '100' },
                        { label: '250 g', val: '250' },
                        { label: '500 g', val: '500' },
                        { label: '750 g', val: '750' },
                      ]
                    : [
                        { label: '0.5 kg (500g)', val: '0.5' },
                        { label: '1 kg', val: '1' },
                        { label: '1.5 kg', val: '1.5' },
                        { label: '2 kg', val: '2' },
                        { label: '5 kg', val: '5' },
                      ]
                  ).map((preset) => (
                    <button
                      key={preset.val}
                      type="button"
                      onClick={() => setPromptQtyInput(preset.val)}
                      className={`px-2.5 py-1 text-xs rounded-lg border font-semibold transition ${
                        promptQtyInput === preset.val
                          ? 'border-amber-600 bg-amber-50 text-amber-900'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* Pieces Quick Presets */
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-slate-700">Quick Quantity:</span>
                <div className="flex gap-1.5">
                  {['1', '2', '3', '5', '10'].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setPromptQtyInput(val)}
                      className={`flex-1 py-1 text-xs rounded-lg border font-semibold transition ${
                        promptQtyInput === val
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {val} pc
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Inputs: Quantity & Custom Rate */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                  {promptItem.unit === 'kg'
                    ? promptWeightMode === 'g'
                      ? 'Weight in Grams (g)'
                      : 'Weight in kg'
                    : 'Quantity (pcs)'}
                </label>
                <input
                  type="number"
                  step={promptItem.unit === 'kg' && promptWeightMode === 'kg' ? '0.1' : '1'}
                  value={promptQtyInput}
                  onChange={(e) => setPromptQtyInput(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                  Rate ({currencySymbol} {promptItem.unit === 'kg' ? '/kg' : '/pc'})
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={promptPriceInput}
                  onChange={(e) => setPromptPriceInput(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
            </div>

            {/* Live Calculation Preview Banner */}
            <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex items-center justify-between text-xs">
              <span className="text-slate-600 font-medium">
                {promptItem.unit === 'kg' ? (
                  promptWeightMode === 'g' ? (
                    `${promptQtyInput || 0} g (${((parseFloat(promptQtyInput) || 0) / 1000).toFixed(3)} kg)`
                  ) : (
                    `${promptQtyInput || 0} kg`
                  )
                ) : (
                  `${promptQtyInput || 0} pcs`
                )}
              </span>
              <div className="text-right">
                <span className="text-slate-400 text-[10px] block">Calculated Total</span>
                <span className="font-bold text-base text-emerald-800">
                  {fmt(
                    ((promptItem.unit === 'kg' && promptWeightMode === 'g'
                      ? (parseFloat(promptQtyInput) || 0) / 1000
                      : parseFloat(promptQtyInput) || 0) *
                      (parseFloat(promptPriceInput) || 0))
                  )}
                </span>
              </div>
            </div>

            <button
              onClick={handleConfirmPrompt}
              disabled={parseFloat(promptQtyInput) <= 0}
              className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-200 text-white font-bold rounded-xl shadow transition text-xs flex items-center justify-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              Add Item to Bill
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// SCREEN 7: BILL SUCCESS
function BillSuccessScreenView({
  bill,
  isOnline,
  fmt,
  onViewInvoice,
  onNewBill,
  onHome,
}: {
  bill: BillRecord;
  isOnline: boolean;
  fmt: (v: number) => string;
  onViewInvoice: () => void;
  onNewBill: () => void;
  onHome: () => void;
}) {
  const isSynced = bill.syncStatus === 'synced';
  return (
    <div className="h-full flex flex-col justify-center items-center px-6 py-8 bg-white text-center">
      <div className="w-20 h-20 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
        <CheckCircle2 className="w-12 h-12" />
      </div>

      <h2 className="text-xl font-bold text-slate-900">Bill Created!</h2>
      <p className="text-sm font-semibold text-emerald-700 mt-1">Invoice #{bill.billNumber}</p>

      <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700">
        {isSynced ? (
          <>
            <Cloud className="w-3.5 h-3.5 text-emerald-600" />
            <span className="text-emerald-700">Saved in SQLite &amp; Synced to Firestore</span>
          </>
        ) : (
          <>
            <CloudOff className="w-3.5 h-3.5 text-amber-600" />
            <span className="text-amber-800">
              {isOnline
                ? 'Saved Locally in SQLite (Pending Cloud Sync)'
                : 'Saved Offline in SQLite (Will Sync When Online)'}
            </span>
          </>
        )}
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 my-5 w-full max-w-xs text-left space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-slate-500">Grand Total:</span>
          <span className="font-bold text-emerald-800 text-base">{fmt(bill.grandTotal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Payment Mode:</span>
          <span className="font-semibold text-slate-800">{bill.paymentMethod}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Items Count:</span>
          <span>{bill.items.length} products</span>
        </div>
        {bill.customerName && (
          <div className="flex justify-between">
            <span className="text-slate-500">Customer:</span>
            <span>{bill.customerName}</span>
          </div>
        )}
      </div>

      <div className="space-y-2.5 w-full max-w-xs">
        <button
          onClick={onViewInvoice}
          className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl shadow transition flex items-center justify-center gap-2 text-xs"
        >
          <Receipt className="w-4 h-4" />
          View / Print Invoice
        </button>

        <button
          onClick={onNewBill}
          className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl transition flex items-center justify-center gap-2 text-xs"
        >
          <Plus className="w-4 h-4" />
          Create Another Bill
        </button>

        <button
          onClick={onHome}
          className="w-full py-2 text-slate-500 hover:text-slate-800 text-xs font-semibold"
        >
          Back to Home
        </button>
      </div>
    </div>
  );
}

// SCREEN 8: INVOICE PREVIEW
function InvoicePreviewScreenView({
  bill,
  shopProfile,
  fmt,
  fmtDate,
  onBack,
}: {
  bill: BillRecord;
  shopProfile: any;
  fmt: (v: number) => string;
  fmtDate: (s: string) => string;
  onBack: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [format, setFormat] = useState<InvoicePrintFormat>('thermal');
  const [includeQr, setIncludeQr] = useState(true);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    let active = true;
    if (!includeQr) {
      setQrDataUrl('');
      return;
    }
    generateInvoiceQrDataUrl(bill, shopProfile)
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [bill, shopProfile, includeQr]);

  const handleDownloadPdf = async () => {
    setIsBusy(true);
    try {
      await downloadInvoicePdf(bill, shopProfile, { format, includeQr });
    } finally {
      setIsBusy(false);
    }
  };

  const handlePrint = async () => {
    setIsBusy(true);
    try {
      await printInvoiceReceipt(bill, shopProfile, { format, includeQr });
    } finally {
      setIsBusy(false);
    }
  };

  const copyReceiptText = () => {
    const text = `
-----------------------------------------
         ${shopProfile.name.toUpperCase()}
       ${shopProfile.tagline}
     ${shopProfile.address}
          Phone: ${shopProfile.phone}
          GSTIN: ${shopProfile.gstin}
-----------------------------------------
Bill No: ${bill.billNumber}
Date: ${fmtDate(bill.createdAt)}
Cashier: ${bill.cashierName}
Payment: ${bill.paymentMethod}
Customer: ${bill.customerName || 'Walk-in'}
-----------------------------------------
ITEM              QTY      PRICE    TOTAL
-----------------------------------------
${bill.items
  .map(
    (i) =>
      `${i.name.padEnd(16).slice(0, 16)} ${formatQtyDisplay(i.quantity, i.unit).padStart(8)}  ${i.unitPrice
        .toFixed(2)
        .padStart(7)}  ${(i.unitPrice * i.quantity).toFixed(2).padStart(8)}`
  )
  .join('\n')}
-----------------------------------------
Subtotal:                       ${fmt(bill.subtotal)}
Discount:                     - ${fmt(bill.discountAmount)}
${bill.taxAmount > 0 ? `GST (${shopProfile.taxRatePercent}%):                       ${fmt(bill.taxAmount)}\n` : ''}-----------------------------------------
GRAND TOTAL:                    ${fmt(bill.grandTotal)}
-----------------------------------------
    Thank you for shopping with us!
`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="h-full flex flex-col bg-slate-200">
      <div className="bg-emerald-800 text-white p-4 shadow-sm shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="p-1 hover:bg-emerald-700 rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-base font-bold">Tax Invoice</h2>
        </div>
        <button
          onClick={copyReceiptText}
          title="Copy Receipt Text"
          className="p-1.5 hover:bg-emerald-700 rounded-lg text-xs flex items-center gap-1"
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex justify-center">
        <div
          className={`w-full bg-white p-5 rounded-xl shadow-md border border-slate-300 text-slate-800 self-start ${
            format === 'thermal' ? 'max-w-xs font-mono text-[11px] leading-tight' : 'max-w-md font-sans text-xs leading-normal'
          }`}
        >
          <div className="text-center pb-3 border-b border-dashed border-slate-400">
            <h3 className="font-bold text-sm tracking-wider uppercase text-slate-900">
              {shopProfile.name}
            </h3>
            <p className="text-[10px] text-slate-500 italic mt-0.5">{shopProfile.tagline}</p>
            <p className="text-[10px] text-slate-500">{shopProfile.address}</p>
            <p className="text-[10px] text-slate-500">Ph: {shopProfile.phone}</p>
            {shopProfile.gstin && (
              <p className="text-[10px] font-bold text-slate-700">GSTIN: {shopProfile.gstin}</p>
            )}
          </div>

          <div className="py-2 border-b border-dashed border-slate-400 space-y-0.5 text-[10px]">
            <div className="flex justify-between">
              <span className="font-bold">Bill No: {bill.billNumber}</span>
              <span className="font-bold text-emerald-800">[{bill.paymentMethod}]</span>
            </div>
            <div className="text-slate-500">Bill ID: {bill.id}</div>
            <div>Date: {fmtDate(bill.createdAt)}</div>
            <div>Cashier: {bill.cashierName}</div>
            {bill.customerName && <div>Customer: {bill.customerName}</div>}
          </div>

          <div className="py-2 border-b border-dashed border-slate-400">
            <div className="grid grid-cols-12 font-bold pb-1 text-[10px] border-b border-slate-200">
              <span className="col-span-5">ITEM</span>
              <span className="col-span-3 text-center">QTY/WT</span>
              <span className="col-span-4 text-right">TOTAL</span>
            </div>
            <div className="pt-1.5 space-y-1">
              {bill.items.map((it) => (
                <div key={it.itemId} className="grid grid-cols-12 text-[10px]">
                  <span className="col-span-5 truncate font-medium">{it.name}</span>
                  <span className="col-span-3 text-center font-bold text-emerald-800">
                    {formatQtyDisplay(it.quantity, it.unit)}
                  </span>
                  <span className="col-span-4 text-right font-medium">
                    {fmt(it.unitPrice * it.quantity)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="py-2 border-b border-dashed border-slate-400 space-y-1 text-[10px]">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>{fmt(bill.subtotal)}</span>
            </div>
            {bill.discountAmount > 0 && (
              <div className="flex justify-between text-red-600">
                <span>Discount:</span>
                <span>- {fmt(bill.discountAmount)}</span>
              </div>
            )}
            {bill.taxAmount > 0 && (
              <div className="flex justify-between">
                <span>GST:</span>
                <span>{fmt(bill.taxAmount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-xs pt-1 border-t border-slate-300">
              <span>GRAND TOTAL:</span>
              <span className="text-emerald-800">{fmt(bill.grandTotal)}</span>
            </div>
          </div>

          {includeQr && qrDataUrl && (
            <div className="pt-3 flex flex-col items-center">
              <img src={qrDataUrl} alt="Invoice verification QR" className="w-20 h-20 border border-slate-200 rounded p-0.5" />
              <span className="text-[9px] text-slate-400 mt-1">Scan QR to verify invoice</span>
            </div>
          )}

          <div className="text-center pt-3 text-[10px] text-slate-500 space-y-1">
            <p className="font-semibold text-slate-700">Thank you for your visit!</p>
            <p>Goods once sold will not be taken back.</p>
          </div>
        </div>
      </div>

      <InvoicePdfControls
        format={format}
        includeQr={includeQr}
        isBusy={isBusy}
        onChangeFormat={setFormat}
        onToggleQr={() => setIncludeQr((v) => !v)}
        onDownloadPdf={handleDownloadPdf}
        onPrint={handlePrint}
      />
    </div>
  );
}

// SCREEN 9: BILLS HISTORY
function BillsScreenView({
  bills,
  isOnline,
  isSyncing,
  pendingSyncCount,
  hasCloudAuth,
  lastSyncError,
  onSyncNow,
  onSwitchGoogleAccount,
  fmt,
  fmtDate,
  onBack,
  onSelectBill,
}: {
  bills: BillRecord[];
  isOnline: boolean;
  isSyncing: boolean;
  pendingSyncCount: number;
  hasCloudAuth: boolean;
  lastSyncError?: string | null;
  onSyncNow: () => void;
  onSwitchGoogleAccount: () => void;
  fmt: (v: number) => string;
  fmtDate: (s: string) => string;
  onBack: () => void;
  onSelectBill: (b: BillRecord) => void;
}) {
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<string>('All');

  const filtered = bills.filter((b) => {
    const matchSearch =
      search === '' ||
      b.billNumber.toLowerCase().includes(search.toLowerCase()) ||
      (b.customerName && b.customerName.toLowerCase().includes(search.toLowerCase()));
    const matchMode = filterMode === 'All' || b.paymentMethod === filterMode;
    return matchSearch && matchMode;
  });

  const totalSum = filtered.reduce((acc, b) => acc + b.grandTotal, 0);

  return (
    <div className="h-full flex flex-col bg-slate-100">
      <div className="bg-emerald-800 text-white p-4 shadow-sm shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="p-1 hover:bg-emerald-700 rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-base font-bold">Bills History</h2>
        </div>
        {(pendingSyncCount > 0 || !hasCloudAuth) && isOnline && (
          <button
            type="button"
            onClick={onSyncNow}
            disabled={isSyncing}
            className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 rounded-lg text-[11px] font-bold flex items-center gap-1"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing
              ? 'Syncing...'
              : hasCloudAuth
                ? `Sync (${pendingSyncCount})`
                : 'Connect & Sync'}
          </button>
        )}
      </div>

      {lastSyncError && (
        <div className="px-3 py-2 bg-red-50 border-b border-red-200 text-[11px] text-red-800 font-medium flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <ShieldAlert className="w-3.5 h-3.5 text-red-600 shrink-0" />
            <span className="line-clamp-2">{lastSyncError}</span>
          </div>
          {isOnline && (
            <button
              type="button"
              onClick={onSwitchGoogleAccount}
              className="px-2 py-0.5 bg-red-700 text-white rounded text-[10px] font-bold shrink-0"
            >
              Switch Gmail
            </button>
          )}
        </div>
      )}

      <div className="p-3 bg-white border-b border-slate-200 space-y-2">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by Bill # or customer..."
            className="w-full pl-9 pr-3 py-2 bg-slate-100 rounded-lg text-xs border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-600"
          />
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {['All', 'Cash', 'UPI', 'Card', 'Other'].map((mode) => (
            <button
              key={mode}
              onClick={() => setFilterMode(mode)}
              className={`px-3 py-1 rounded-full text-[11px] font-semibold transition ${
                filterMode === mode
                  ? 'bg-emerald-700 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-2 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between text-xs">
        <span className="text-emerald-900 font-semibold">
          {filtered.length} Bills {pendingSyncCount > 0 ? `• ${pendingSyncCount} Pending Sync` : ''}
        </span>
        <span className="font-bold text-emerald-800">Total: {fmt(totalSum)}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filtered.map((b) => (
          <div
            key={b.id}
            onClick={() => onSelectBill(b)}
            className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between hover:border-emerald-500 cursor-pointer transition"
          >
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-bold text-xs text-slate-900">{b.billNumber}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">
                  {b.paymentMethod}
                </span>
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                    b.syncStatus === 'synced'
                      ? 'bg-sky-50 text-sky-700'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {b.syncStatus === 'synced' ? 'Synced' : 'Pending Sync'}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {b.customerName || 'Walk-in'} • {fmtDate(b.createdAt)}
              </div>
            </div>
            <div className="text-right">
              <div className="font-bold text-sm text-emerald-800">{fmt(b.grandTotal)}</div>
              <div className="text-[10px] text-slate-400">{b.items.length} items</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// SCREEN 10: BILL DETAILS
function BillDetailsScreenView({
  bill,
  fmt,
  fmtDate,
  onBack,
  onViewInvoice,
}: {
  bill: BillRecord;
  fmt: (v: number) => string;
  fmtDate: (s: string) => string;
  onBack: () => void;
  onViewInvoice: () => void;
}) {
  return (
    <div className="h-full flex flex-col bg-slate-100">
      <div className="bg-emerald-800 text-white p-4 shadow-sm shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="p-1 hover:bg-emerald-700 rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-base font-bold">Bill: {bill.billNumber}</h2>
        </div>
        <button
          onClick={onViewInvoice}
          className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 rounded-lg text-xs font-semibold flex items-center gap-1 shadow-sm"
        >
          <Receipt className="w-4 h-4" /> Invoice
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-1.5 text-xs">
          <div className="flex justify-between items-center">
            <span className="font-bold text-slate-900 text-sm">{bill.billNumber}</span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
              Paid via {bill.paymentMethod}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                bill.syncStatus === 'synced'
                  ? 'bg-sky-50 text-sky-700'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {bill.syncStatus === 'synced' ? 'Synced to Firestore' : 'Saved Locally in SQLite (Pending Sync)'}
            </span>
          </div>
          <div className="text-slate-500">Date: {fmtDate(bill.createdAt)}</div>
          <div className="text-slate-500">Cashier: {bill.cashierName}</div>
          {bill.customerName && (
            <div className="text-slate-700 font-medium">Customer: {bill.customerName}</div>
          )}
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            Items ({bill.items.length})
          </h4>
          <div className="space-y-2 divide-y divide-slate-100 text-xs">
            {bill.items.map((it) => (
              <div key={it.itemId} className="pt-2 flex justify-between items-center">
                <div>
                  <div className="font-bold text-slate-900">{it.name}</div>
                  <div className="text-[10px] text-slate-400">
                    {formatQtyDisplay(it.quantity, it.unit)} × {fmt(it.unitPrice)}
                  </div>
                </div>
                <div className="font-bold text-slate-800">{fmt(it.unitPrice * it.quantity)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-1.5 text-xs">
          <div className="flex justify-between text-slate-500">
            <span>Subtotal</span>
            <span>{fmt(bill.subtotal)}</span>
          </div>
          {bill.discountAmount > 0 && (
            <div className="flex justify-between text-red-600">
              <span>Discount</span>
              <span>- {fmt(bill.discountAmount)}</span>
            </div>
          )}
          <div className="flex justify-between text-slate-500">
            <span>Tax (GST)</span>
            <span>{bill.taxAmount > 0 ? fmt(bill.taxAmount) : 'None (0%)'}</span>
          </div>
          <div className="flex justify-between font-bold text-base text-slate-900 pt-2 border-t border-slate-100">
            <span>Grand Total</span>
            <span className="text-emerald-700">{fmt(bill.grandTotal)}</span>
          </div>
        </div>
      </div>

      <div className="p-4 bg-white border-t border-slate-200">
        <button
          onClick={onViewInvoice}
          className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl shadow transition text-xs flex items-center justify-center gap-2"
        >
          <Receipt className="w-4 h-4" />
          View / Print Tax Receipt
        </button>
      </div>
    </div>
  );
}

// SCREEN 11: REPORTS
function ReportsScreenView({
  bills,
  fmt,
  onBack,
}: {
  bills: BillRecord[];
  fmt: (v: number) => string;
  onBack: () => void;
}) {
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly' | 'custom'>('daily');

  const filteredBills = useMemo(() => {
    const now = new Date();
    return bills.filter((b) => {
      const d = new Date(b.createdAt);
      if (period === 'daily') {
        return (
          d.getDate() === now.getDate() &&
          d.getMonth() === now.getMonth() &&
          d.getFullYear() === now.getFullYear()
        );
      }
      if (period === 'weekly') {
        const diffDays = (now.getTime() - d.getTime()) / (1000 * 3600 * 24);
        return diffDays <= 7;
      }
      if (period === 'monthly') {
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      }
      return true;
    });
  }, [bills, period]);

  const totalSales = filteredBills.reduce((acc, b) => acc + b.grandTotal, 0);
  const totalDiscount = filteredBills.reduce((acc, b) => acc + b.discountAmount, 0);
  const totalQtySold = filteredBills.reduce(
    (acc, b) => acc + b.items.reduce((sum, i) => sum + i.quantity, 0),
    0
  );

  const paymentBreakdown = useMemo(() => {
    const res: Record<PaymentMode, number> = { Cash: 0, UPI: 0, Card: 0, Other: 0 };
    filteredBills.forEach((b) => {
      res[b.paymentMethod] = (res[b.paymentMethod] || 0) + b.grandTotal;
    });
    return res;
  }, [filteredBills]);

  const topItems = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number; unit: ItemUnit }>();
    filteredBills.forEach((b) => {
      b.items.forEach((i) => {
        const cur = map.get(i.itemId) || { name: i.name, qty: 0, revenue: 0, unit: i.unit };
        cur.qty += i.quantity;
        cur.revenue += i.unitPrice * i.quantity;
        map.set(i.itemId, cur);
      });
    });
    return Array.from(map.values())
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
  }, [filteredBills]);

  return (
    <div className="h-full flex flex-col bg-slate-100">
      <div className="bg-emerald-800 text-white p-4 shadow-sm shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="p-1 hover:bg-emerald-700 rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-base font-bold">Sales Reports</h2>
        </div>
      </div>

      <div className="p-3 bg-white border-b border-slate-200">
        <div className="grid grid-cols-4 gap-1 bg-slate-100 p-1 rounded-xl">
          {[
            { id: 'daily', label: 'Today' },
            { id: 'weekly', label: 'Week' },
            { id: 'monthly', label: 'Month' },
            { id: 'custom', label: 'All/Custom' },
          ].map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id as any)}
              className={`py-1.5 rounded-lg text-xs font-bold transition ${
                period === p.id
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs text-slate-500 font-medium">Total Sales</span>
            <div className="text-lg font-bold text-emerald-800 mt-1">{fmt(totalSales)}</div>
            <span className="text-[10px] text-slate-400">{filteredBills.length} invoices</span>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs text-slate-500 font-medium">Quantity Sold</span>
            <div className="text-lg font-bold text-slate-800 mt-1">{totalQtySold.toFixed(1)} units/kg</div>
            <span className="text-[10px] text-slate-400">Total volume</span>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs text-slate-500 font-medium">Total Discount</span>
            <div className="text-lg font-bold text-red-600 mt-1">{fmt(totalDiscount)}</div>
            <span className="text-[10px] text-slate-400">Customer savings</span>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs text-slate-500 font-medium">Avg Bill Size</span>
            <div className="text-lg font-bold text-blue-800 mt-1">
              {filteredBills.length > 0 ? fmt(totalSales / filteredBills.length) : fmt(0)}
            </div>
            <span className="text-[10px] text-slate-400">Per bill avg</span>
          </div>
        </div>

        {/* Payment Method Breakdown */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
            Payment Method Breakdown
          </h4>
          <div className="space-y-2.5">
            {(['Cash', 'UPI', 'Card', 'Other'] as PaymentMode[]).map((mode) => {
              const amt = paymentBreakdown[mode] || 0;
              const pct = totalSales > 0 ? (amt / totalSales) * 100 : 0;
              return (
                <div key={mode} className="text-xs space-y-1">
                  <div className="flex justify-between font-semibold">
                    <span>{mode}</span>
                    <span className="text-slate-800">
                      {fmt(amt)} ({pct.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-emerald-600 h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top Selling Items */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            Top-Selling Items
          </h4>
          {topItems.length === 0 ? (
            <p className="text-xs text-slate-400 py-3 text-center">No sales in this period.</p>
          ) : (
            <div className="divide-y divide-slate-100 text-xs">
              {topItems.map((item, idx) => (
                <div key={item.name} className="py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px] flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <span className="font-semibold text-slate-800">{item.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-emerald-800">
                      {formatQtyDisplay(item.qty, item.unit)} sold
                    </span>
                    <div className="text-[10px] text-slate-400">{fmt(item.revenue)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// SCREEN 12: SETTINGS
function SettingsScreenView({
  shopProfile,
  currentUser,
  ownerEmail,
  activeUserEmail,
  onBack,
  onSaveProfile,
  onResetPin,
  onLogout,
}: {
  shopProfile: any;
  currentUser: UserProfile | null;
  ownerEmail: string;
  activeUserEmail: string;
  onBack: () => void;
  onSaveProfile: (p: any) => void;
  onResetPin: (currentPin: string, newPin: string) => Promise<void>;
  onLogout: () => void;
}) {
  const isOwner = currentUser?.role !== 'employee';
  const [name, setName] = useState(shopProfile.name);
  const [tagline, setTagline] = useState(shopProfile.tagline);
  const [phone, setPhone] = useState(shopProfile.phone);
  const [address, setAddress] = useState(shopProfile.address);
  const [gstin, setGstin] = useState(shopProfile.gstin);
  const [taxRate, setTaxRate] = useState(shopProfile.taxRatePercent.toString());
  const [currency, setCurrency] = useState(shopProfile.currencySymbol);
  const [savedMsg, setSavedMsg] = useState(false);

  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [pinMsg, setPinMsg] = useState('');
  const [pinErr, setPinErr] = useState('');
  const [pinBusy, setPinBusy] = useState(false);

  const handleSave = () => {
    if (!isOwner) return;
    onSaveProfile({
      name,
      tagline,
      phone,
      address,
      gstin,
      taxRatePercent: parseFloat(taxRate) || 5.0,
      currencySymbol: currency,
    });
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2000);
  };

  const handlePinReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinErr('');
    setPinMsg('');
    setPinBusy(true);
    try {
      await onResetPin(currentPin, newPin);
      setCurrentPin('');
      setNewPin('');
      setPinMsg('Owner PIN updated securely (bcrypt salted hash).');
    } catch (err) {
      setPinErr(err instanceof Error ? err.message : 'Unable to update PIN.');
    } finally {
      setPinBusy(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-100">
      <div className="bg-emerald-800 text-white p-4 shadow-sm shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="p-1 hover:bg-emerald-700 rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-base font-bold">Shop Settings</h2>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="font-bold text-xs text-slate-900">{currentUser?.name}</div>
            <div className="text-[10px] text-emerald-700 font-semibold">
              {isOwner ? 'Shop Owner' : 'Employee'} &bull; {activeUserEmail || ownerEmail}
            </div>
          </div>
          <button
            onClick={onLogout}
            className="px-2.5 py-1 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg text-xs font-semibold flex items-center gap-1"
          >
            <LogOut className="w-3.5 h-3.5" /> Logout
          </button>
        </div>

        {!isOwner ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900">
            Shop settings, PIN reset, and store administration are restricted to the Shop Owner account.
          </div>
        ) : (
          <>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Shop Details (Receipt Header)
              </h4>

              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Shop Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl text-xs border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Tagline</label>
                <input
                  type="text"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl text-xs border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Phone</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl text-xs border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Currency Symbol</label>
                  <input
                    type="text"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl text-xs border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Address</label>
                <textarea
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl text-xs border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                ></textarea>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">GSTIN / Tax ID</label>
                  <input
                    type="text"
                    value={gstin}
                    onChange={(e) => setGstin(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl text-xs border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-600 font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Default Tax (%)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={taxRate}
                    onChange={(e) => setTaxRate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl text-xs border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                  />
                </div>
              </div>

              <button
                onClick={handleSave}
                className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl text-xs shadow transition flex items-center justify-center gap-1.5"
              >
                {savedMsg ? <Check className="w-4 h-4 text-emerald-200" /> : <Settings className="w-4 h-4" />}
                {savedMsg ? 'Settings Saved!' : 'Save Shop Settings'}
              </button>
            </div>

            {/* Owner PIN Reset Card */}
            <form
              onSubmit={handlePinReset}
              className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-2.5"
            >
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-emerald-700" /> Change Owner PIN (Bcrypt)
              </h4>
              {pinErr && (
                <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-[11px] text-red-700">
                  {pinErr}
                </div>
              )}
              {pinMsg && (
                <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-[11px] text-emerald-800">
                  {pinMsg}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="password"
                  maxLength={6}
                  required
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value)}
                  placeholder="Current PIN"
                  className="px-3 py-2 bg-slate-50 rounded-xl text-xs border border-slate-200 font-mono"
                />
                <input
                  type="password"
                  maxLength={6}
                  required
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  placeholder="New 4-6 digit PIN"
                  className="px-3 py-2 bg-slate-50 rounded-xl text-xs border border-slate-200 font-mono"
                />
              </div>
              <button
                type="submit"
                disabled={pinBusy}
                className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs"
              >
                {pinBusy ? 'Updating PIN...' : 'Update Shop PIN'}
              </button>
            </form>
          </>
        )}

        <PWAInstallButton variant="card" />

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-1.5">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Owner Database Workspace
          </h4>
          <p className="text-[11px] text-slate-500">
            Items, bills, employees, audit logs, and store settings are isolated under {ownerEmail}.
          </p>
        </div>

        {/* Standard Version Footer */}
        <div className="pt-4 pb-2 text-center border-t border-slate-200">
          <p className="text-[11px] text-slate-400 font-mono tracking-tight">
            BillKart v2.5.0 &bull; Production Multi-Tenant Edition
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            Store Owner &amp; Employee Billing Terminal
          </p>
        </div>
      </div>
    </div>
  );
}

// SCREEN: DEVELOPER ADMIN LOGIN
function AdminLoginScreenView({
  onLoginSuccess,
  onBack,
}: {
  onLoginSuccess: () => void;
  onBack: () => void;
}) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleVerify = async () => {
    setError('');
    setBusy(true);
    try {
      await loginAdminInDb(
        password,
        auth.currentUser?.email || undefined,
        auth.currentUser?.uid || undefined
      );
      onLoginSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Access Denied: Invalid Developer Admin Password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full flex flex-col justify-center px-6 py-8 bg-slate-950 text-white overflow-y-auto">
      <div className="text-center mb-6">
        <BillKartLogo size="lg" variant="admin" className="mx-auto mb-3" />
        <h2 className="text-2xl font-bold text-white">BillKart Admin</h2>
        <p className="text-xs text-slate-400 mt-1">Multi-tenant shop owner registration &amp; control</p>
      </div>

      <div className="space-y-4 max-w-xs mx-auto w-full">
        <div>
          <label className="text-xs font-semibold text-slate-300 block mb-1.5">Developer Password</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError('');
              }}
              placeholder="Enter developer password"
              className="w-full px-3.5 py-3 pr-10 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 bg-slate-900 text-white font-mono text-sm"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-3 text-slate-400 hover:text-white"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {error && <p className="text-xs text-red-400 mt-1.5 font-medium">{error}</p>}
        </div>

        <button
          onClick={handleVerify}
          disabled={busy}
          className="w-full py-3.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-white font-bold rounded-xl shadow transition active:scale-98 text-xs flex items-center justify-center gap-1.5"
        >
          <Key className="w-4 h-4" /> {busy ? 'Verifying...' : 'Authorize & Open Admin Panel'}
        </button>
      </div>

      <div className="mt-8 pt-4 border-t border-slate-900 text-center space-y-2 max-w-xs mx-auto w-full">
        <a
          href="/admin-panel/login.html"
          target="_blank"
          rel="noopener noreferrer"
          className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition"
        >
          <span>Launch HTML/CSS/JS Admin Web App</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </a>

        <button
          onClick={onBack}
          className="text-xs text-slate-400 hover:text-white transition"
        >
          &larr; Back to BillKart
        </button>
      </div>
    </div>
  );
}

// SCREEN: DEVELOPER ADMIN PANEL
function AdminPanelScreenView({
  shopOwners,
  cloudUserEmail,
  fmt,
  onConnectGoogle,
  onSyncAllToCloud,
  onRefresh,
  onOpenAuditLogs,
  onRegisterOwner,
  onUpdateOwner: _onUpdateOwner,
  onResetOwnerPin,
  onToggleStatus,
  onDeleteOwner,
  onSwitchShop,
  onExit,
}: {
  shopOwners: ShopOwnerRecord[];
  cloudUserEmail: string | null;
  fmt: (v: number) => string;
  onConnectGoogle: () => Promise<{ connected: boolean; synced: number; error?: string }>;
  onSyncAllToCloud: () => Promise<{ synced: number; failed: number }>;
  onRefresh: () => Promise<void>;
  onOpenAuditLogs: () => Promise<void>;
  onRegisterOwner: (input: {
    ownerName: string;
    shopName: string;
    email: string;
    phone: string;
    pin: string;
    address: string;
    gstin?: string;
  }) => Promise<{ shop: ApiShopRecord; cloudSynced: boolean; syncError?: string }>;
  onUpdateOwner: (updated: any) => void;
  onResetOwnerPin: (id: string, newPin: string) => Promise<void>;
  onToggleStatus: (id: string) => Promise<void> | void;
  onDeleteOwner: (id: string) => Promise<void> | void;
  onSwitchShop: (owner: ShopOwnerRecord) => Promise<void> | void;
  onExit: () => Promise<void> | void;
}) {
  const [search, setSearch] = useState('');
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [resetPinTarget, setResetPinTarget] = useState<ShopOwnerRecord | null>(null);
  const [resetPinValue, setResetPinValue] = useState('');
  const [resetPinError, setResetPinError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [registerError, setRegisterError] = useState('');
  const [adminNotice, setAdminNotice] = useState<string | null>(null);

  // Registration Form State
  const [newOwnerName, setNewOwnerName] = useState('');
  const [newShopName, setNewShopName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newPin, setNewPin] = useState('1234');
  const [newEmail, setNewEmail] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newGstin, setNewGstin] = useState('');

  const filtered = shopOwners.filter((o) => {
    const q = search.toLowerCase();
    return (
      o.shopId.toLowerCase().includes(q) ||
      o.ownerName.toLowerCase().includes(q) ||
      o.shopName.toLowerCase().includes(q) ||
      o.email.toLowerCase().includes(q) ||
      o.phone.includes(q)
    );
  });

  const activeCount = shopOwners.filter((o) => o.isActive).length;
  const totalBills = shopOwners.reduce((sum, o) => sum + o.totalBillsCount, 0);
  const totalRev = shopOwners.reduce((sum, o) => sum + o.totalRevenue, 0);

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError('');

    if (!newOwnerName.trim() || !newShopName.trim() || !newEmail.trim() || !newPhone.trim() || !newPin.trim()) {
      setRegisterError('Please fill out Owner Name, Shop Name, Email ID, Phone, and PIN.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await onRegisterOwner({
        ownerName: newOwnerName.trim(),
        shopName: newShopName.trim(),
        phone: newPhone.trim(),
        pin: newPin.trim(),
        email: newEmail.trim().toLowerCase(),
        address: newAddress.trim() || 'Main Market',
        gstin: newGstin.trim(),
      });

      setAdminNotice(
        result.cloudSynced
          ? `Registered ${result.shop.shopId} (${result.shop.email}) & synced to Cloud Firestore!`
          : result.syncError
            ? `Registered ${result.shop.shopId} locally, but Cloud sync failed: ${result.syncError}`
            : `Registered ${result.shop.shopId} locally. Click "Connect Google & Sync" above so Phone & other devices can log in!`
      );
      setTimeout(() => setAdminNotice(null), 7000);

      setShowRegisterModal(false);
      setNewOwnerName('');
      setNewShopName('');
      setNewPhone('');
      setNewPin('1234');
      setNewEmail('');
      setNewAddress('');
      setNewGstin('');
    } catch (err) {
      setRegisterError(err instanceof Error ? err.message : 'Failed to register shop owner.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdminResetPinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPinTarget) return;
    setResetPinError('');
    setIsSubmitting(true);
    try {
      await onResetOwnerPin(resetPinTarget.shopId || resetPinTarget.id, resetPinValue.trim());
      setResetPinTarget(null);
      setResetPinValue('');
    } catch (err) {
      setResetPinError(err instanceof Error ? err.message : 'Failed to reset shop PIN.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-100 overflow-y-auto">
      {/* Header */}
      <div className="bg-slate-900 text-white p-4 shadow-sm shrink-0 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <BillKartLogo size="sm" variant="admin" />
          <div>
            <h2 className="text-base font-bold flex items-center gap-1.5">
              BillKart Admin Console
            </h2>
            <p className="text-[11px] text-slate-400">SQLite DBMS &amp; Email/UID Store Registry</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onOpenAuditLogs()}
            className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-sky-300 rounded-lg text-[11px] font-semibold flex items-center gap-1"
            title="View Platform Audit Logs"
          >
            <ShieldCheck className="w-3.5 h-3.5" /> Logs
          </button>
          <button
            onClick={() => onRefresh()}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
            title="Refresh shops"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onExit}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1"
          >
            <LogOut className="w-3.5 h-3.5" /> Exit
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* KPI Row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs text-slate-500 font-medium">Registered Shops</span>
            <div className="text-lg font-bold text-slate-900 mt-1">{shopOwners.length} Stores</div>
            <span className="text-[10px] text-emerald-600 font-semibold">{activeCount} Operational</span>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs text-slate-500 font-medium">Network Revenue</span>
            <div className="text-lg font-bold text-sky-800 mt-1">{fmt(totalRev)}</div>
            <span className="text-[10px] text-slate-400">{totalBills} bills across stores</span>
          </div>
        </div>

        {/* Cloud Firestore & Web Console Card */}
        <div className="bg-gradient-to-r from-sky-900 to-slate-900 text-white p-3.5 rounded-xl border border-sky-800/50 shadow space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-xs font-bold text-sky-200">Standalone HTML Admin Web App</div>
              <div className="text-[10px] text-slate-300">Full CRUD connected to the same email/UID DBMS</div>
            </div>
            <a
              href="/admin-panel/index.html"
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-lg text-xs transition shrink-0"
            >
              Open Web App &rarr;
            </a>
          </div>
          <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2 flex-wrap">
            <div className="text-[10px] text-slate-300 flex items-center gap-1.5 truncate">
              <Cloud className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span className="truncate">
                {cloudUserEmail ? `Firestore Sync: ${cloudUserEmail}` : 'Firestore Sync: Not connected (needed for Phone login)'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {cloudUserEmail && (
                <button
                  type="button"
                  disabled={isSyncingAll}
                  onClick={async () => {
                    setIsSyncingAll(true);
                    try {
                      const res = await onSyncAllToCloud();
                      setAdminNotice(`Synced ${res.synced} shop(s) to Cloud Firestore${res.failed > 0 ? ` (${res.failed} failed)` : ''}.`);
                      setTimeout(() => setAdminNotice(null), 5000);
                    } finally {
                      setIsSyncingAll(false);
                    }
                  }}
                  className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white rounded-lg text-[10px] font-bold"
                >
                  {isSyncingAll ? 'Syncing...' : 'Sync All to Cloud'}
                </button>
              )}
              <button
                type="button"
                disabled={isSyncingAll}
                onClick={async () => {
                  setIsSyncingAll(true);
                  try {
                    const res = await onConnectGoogle();
                    if (res.connected) {
                      setAdminNotice(
                        res.error
                          ? `Google connected, synced ${res.synced} shop(s), with warning: ${res.error}`
                          : `Google connected & ${res.synced} shop(s) synced to Cloud Firestore!`
                      );
                      setTimeout(() => setAdminNotice(null), 6000);
                    }
                  } catch (err) {
                    const host = typeof window !== 'undefined' ? window.location.hostname : undefined;
                    setAdminNotice(formatCloudSyncError(err, host));
                    setTimeout(() => setAdminNotice(null), 7000);
                  } finally {
                    setIsSyncingAll(false);
                  }
                }}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 rounded-lg text-[10px] font-semibold"
              >
                {cloudUserEmail ? 'Disconnect Google' : 'Connect Google & Sync'}
              </button>
            </div>
          </div>
        </div>

        {adminNotice && (
          <div
            className={`p-2.5 border rounded-xl text-[11px] font-medium flex items-center gap-2 ${
              /error|failed|denied|authorized|popup|blocked|warning/i.test(adminNotice)
                ? 'bg-red-50 border-red-200 text-red-900'
                : 'bg-emerald-50 border-emerald-200 text-emerald-900'
            }`}
          >
            {/error|failed|denied|authorized|popup|blocked|warning/i.test(adminNotice) ? (
              <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            )}
            <span>{adminNotice}</span>
          </div>
        )}

        {!cloudUserEmail && (
          <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 font-medium flex items-center justify-between gap-2 flex-wrap">
            <span className="flex-1 min-w-[180px]">
              {isRunningInIframe()
                ? 'Running inside Preview frame: open BillKart in a new tab before clicking Connect Google & Sync so Edge/Chrome does not freeze the popup.'
                : 'Connect Google above so newly registered shops upload to Cloud Firestore and work on Phone & other devices.'}
            </span>
            {isRunningInIframe() && typeof window !== 'undefined' && (
              <a
                href={window.location.href}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[10px] font-bold shrink-0"
              >
                Open in New Tab ↗
              </a>
            )}
          </div>
        )}

        {/* Actions & Search */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Shop ID, owner, email, phone..."
              className="w-full pl-9 pr-3 py-2 bg-white rounded-xl text-xs border border-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
          <button
            onClick={() => {
              setRegisterError('');
              setShowRegisterModal(true);
            }}
            className="px-3 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs shadow flex items-center gap-1 shrink-0"
          >
            <UserPlus className="w-4 h-4" /> Register Shop
          </button>
        </div>

        {/* Shop Owners List */}
        <div className="space-y-3">
          {filtered.map((owner) => (
            <div
              key={owner.id}
              className={`bg-white p-3.5 rounded-xl border shadow-sm transition space-y-2.5 ${
                owner.isActive ? 'border-slate-200' : 'border-red-200 bg-red-50/20'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-800 flex items-center justify-center font-bold text-xs">
                    <Store className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-xs text-slate-900 flex items-center gap-1.5 flex-wrap">
                      <span>{owner.shopName}</span>
                      <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 font-bold">
                        {owner.shopId}
                      </span>
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                          owner.isActive
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {owner.isActive ? 'Active' : 'Suspended'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Owner: {owner.ownerName} &bull; {owner.phone}
                    </div>
                    <div className="text-[10px] text-sky-700 font-medium flex items-center gap-1 mt-0.5">
                      <Mail className="w-3 h-3" />
                      <span>{owner.email}</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => onSwitchShop(owner)}
                  className="px-2.5 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-bold border border-emerald-200 transition shrink-0"
                >
                  Store Login &rarr;
                </button>
              </div>

              <div className="bg-slate-50 p-2 rounded-lg border border-slate-200 text-[11px] flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-emerald-700" />
                  <span className="text-slate-600 font-medium">PIN:</span>
                  <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded">
                    Bcrypt Hashed
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      setResetPinError('');
                      setResetPinValue('');
                      setResetPinTarget(owner);
                    }}
                    className="text-[10px] font-bold px-2 py-0.5 rounded text-sky-700 hover:bg-sky-100 transition"
                  >
                    Reset PIN
                  </button>
                  <button
                    onClick={() => onToggleStatus(owner.id)}
                    className={`text-[10px] font-bold px-2 py-0.5 rounded transition ${
                      owner.isActive
                        ? 'text-amber-700 hover:bg-amber-100'
                        : 'text-emerald-700 hover:bg-emerald-100'
                    }`}
                  >
                    {owner.isActive ? 'Suspend' : 'Activate'}
                  </button>
                  <button
                    onClick={() => onDeleteOwner(owner.id)}
                    className="text-[10px] text-red-600 hover:bg-red-100 px-1.5 py-0.5 rounded transition"
                    title="Delete shop"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal: Reset Shop Owner PIN */}
      {resetPinTarget && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-xs shadow-xl p-5 space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-sm font-bold text-slate-900">Reset Shop Owner PIN</h3>
              <button
                onClick={() => setResetPinTarget(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              Reset PIN for <span className="font-bold text-slate-800">{resetPinTarget.shopName}</span> ({resetPinTarget.shopId}). Active owner sessions will be revoked.
            </p>
            {resetPinError && (
              <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-[11px] text-red-700">
                {resetPinError}
              </div>
            )}
            <form onSubmit={handleAdminResetPinSubmit} className="space-y-2.5 text-xs">
              <input
                type="password"
                maxLength={6}
                required
                value={resetPinValue}
                onChange={(e) => setResetPinValue(e.target.value)}
                placeholder="New 4-6 digit PIN"
                className="w-full px-3 py-2 border rounded-xl bg-slate-50 font-mono text-center tracking-widest"
              />
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold"
              >
                {isSubmitting ? 'Updating...' : 'Reset PIN'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Register Shop Owner */}
      {showRegisterModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl p-5 space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-sm font-bold text-slate-900">Register Shop Owner</h3>
              <button
                onClick={() => setShowRegisterModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {registerError && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-[11px] text-red-700 font-medium">
                {registerError}
              </div>
            )}

            <form onSubmit={handleRegisterSubmit} className="space-y-2 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-0.5">Owner Name *</label>
                <input
                  type="text"
                  required
                  value={newOwnerName}
                  onChange={(e) => setNewOwnerName(e.target.value)}
                  placeholder="e.g. Ramesh Gupta"
                  className="w-full px-2.5 py-1.5 border rounded-lg bg-slate-50"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-0.5">Owner Email ID *</label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="e.g. ramesh@guptastore.in"
                  className="w-full px-2.5 py-1.5 border rounded-lg bg-slate-50"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-0.5">Shop Name *</label>
                <input
                  type="text"
                  required
                  value={newShopName}
                  onChange={(e) => setNewShopName(e.target.value)}
                  placeholder="e.g. Gupta General Store"
                  className="w-full px-2.5 py-1.5 border rounded-lg bg-slate-50"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-slate-700 block mb-0.5">Phone *</label>
                  <input
                    type="tel"
                    required
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="9811223344"
                    className="w-full px-2.5 py-1.5 border rounded-lg bg-slate-50"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-0.5">Staff PIN (4-6 digit) *</label>
                  <input
                    type="text"
                    maxLength={6}
                    required
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value)}
                    className="w-full px-2.5 py-1.5 border rounded-lg bg-slate-50 font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-0.5">Store Address</label>
                <input
                  type="text"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  placeholder="e.g. Shop 4, Main Bazaar"
                  className="w-full px-2.5 py-1.5 border rounded-lg bg-slate-50"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(false)}
                  className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-white rounded-xl font-bold"
                >
                  {isSubmitting ? 'Saving...' : 'Register Shop'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

