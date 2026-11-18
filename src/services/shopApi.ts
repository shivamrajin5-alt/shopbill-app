import type { ShopOwnerRecord } from '../utils/admin';
import type { ShopBackupBundle } from '../utils/backupRestore';

export interface ApiShopRecord extends ShopOwnerRecord {
  emailKey: string;
  ownerUid?: string;
  tagline: string;
  taxRatePercent: number;
  currencySymbol: string;
  status: 'active' | 'inactive';
  lastSyncedAt?: string | null;
}

export interface ApiUserRecord {
  uid: string;
  firebaseUid?: string;
  email: string;
  emailKey?: string;
  displayName: string;
  role: 'owner' | 'employee' | 'admin';
  shopId: string;
  ownerEmail?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ApiAuditLogRecord {
  id: string;
  shopId: string;
  actorUid: string;
  actorEmail: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  beforeData: unknown;
  afterData: unknown;
  createdAt: string;
}

export interface ApiBackupHistoryRecord {
  id: string;
  shopId: string;
  actorEmail: string;
  source: string;
  itemsCount: number;
  billsCount: number;
  employeesCount: number;
  checksum: string;
  createdAt: string;
}

export type RecordSyncStatus = 'pending' | 'synced';

export interface ApiItemRecord {
  id: string;
  shopId?: string;
  name: string;
  code: string;
  price: number;
  stock: number;
  category: string;
  unit: 'pcs' | 'kg';
  updatedAt?: string;
  syncStatus?: RecordSyncStatus;
  syncedAt?: string | null;
  syncError?: string | null;
}

export interface ApiBillRecord {
  id: string;
  shopId?: string;
  billNumber: string;
  createdAt: string;
  items: {
    itemId: string;
    name: string;
    code: string;
    unitPrice: number;
    quantity: number;
    unit: 'pcs' | 'kg';
  }[];
  customerName?: string;
  customerPhone?: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  grandTotal: number;
  paymentMethod: 'Cash' | 'UPI' | 'Card' | 'Other';
  cashierName: string;
  actorUid?: string;
  syncStatus?: RecordSyncStatus;
  syncedAt?: string | null;
  syncError?: string | null;
}

export interface ApiOwnerWorkspace {
  shop: ApiShopRecord;
  items: ApiItemRecord[];
  bills: ApiBillRecord[];
  employees?: ApiUserRecord[];
}

const OWNER_TOKEN_STORAGE_KEY = 'shopbill_owner_session_token_v1';
const ADMIN_TOKEN_STORAGE_KEY = 'shopbill_admin_session_token_v1';
let memoryOwnerToken = '';
let memoryAdminToken = '';

export function setOwnerSessionToken(token: string | null): void {
  memoryOwnerToken = (token || '').trim();
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      if (memoryOwnerToken) {
        window.sessionStorage.setItem(OWNER_TOKEN_STORAGE_KEY, memoryOwnerToken);
      } else {
        window.sessionStorage.removeItem(OWNER_TOKEN_STORAGE_KEY);
      }
    }
  } catch (_) {}
}

export function getOwnerSessionToken(): string {
  if (memoryOwnerToken) return memoryOwnerToken;
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const saved = window.sessionStorage.getItem(OWNER_TOKEN_STORAGE_KEY) || '';
      if (saved) {
        memoryOwnerToken = saved;
        return saved;
      }
    }
  } catch (_) {}
  return '';
}

export function setAdminSessionToken(token: string | null): void {
  memoryAdminToken = (token || '').trim();
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      if (memoryAdminToken) {
        window.sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, memoryAdminToken);
      } else {
        window.sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
      }
    }
  } catch (_) {}
}

export function getAdminSessionToken(): string {
  if (memoryAdminToken) return memoryAdminToken;
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const saved = window.sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) || '';
      if (saved) {
        memoryAdminToken = saved;
        return saved;
      }
    }
  } catch (_) {}
  return '';
}

async function requestJson<T>(
  url: string,
  options?: RequestInit & { useAdminToken?: boolean }
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  const ownerToken = getOwnerSessionToken();
  const adminToken = getAdminSessionToken();
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(ownerToken ? { 'x-owner-token': ownerToken } : {}),
        ...(options?.useAdminToken && adminToken ? { 'x-admin-token': adminToken } : {}),
        ...(options?.headers || {}),
      },
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
    }
    return data as T;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Server request timed out. Please try again.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function loginAdminInDb(
  password: string,
  email?: string,
  uid?: string
): Promise<{ token: string; admin: { uid: string; email: string; role: 'super_admin' } }> {
  const data = await requestJson<{
    ok: boolean;
    token: string;
    admin: { uid: string; email: string; role: 'super_admin' };
  }>('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ password, email, uid }),
  });
  if (data.token) setAdminSessionToken(data.token);
  return { token: data.token, admin: data.admin };
}

export async function logoutAdminInDb(): Promise<void> {
  try {
    if (getAdminSessionToken()) {
      await requestJson<{ ok: boolean }>('/api/admin/logout', {
        method: 'POST',
        body: JSON.stringify({}),
        useAdminToken: true,
      });
    }
  } catch (_) {
  } finally {
    setAdminSessionToken(null);
  }
}

export async function fetchAllShops(): Promise<ApiShopRecord[]> {
  const data = await requestJson<{ shops: ApiShopRecord[] }>('/api/shops', {
    useAdminToken: true,
  });
  return data.shops || [];
}

export async function registerShopInDb(input: {
  shopId?: string;
  ownerName: string;
  shopName: string;
  email: string;
  phone: string;
  address: string;
  gstin?: string;
  pin: string;
}): Promise<ApiShopRecord> {
  const data = await requestJson<{ shop: ApiShopRecord }>('/api/shops', {
    method: 'POST',
    body: JSON.stringify(input),
    useAdminToken: true,
  });
  return data.shop;
}

export async function updateShopInDb(
  idOrEmail: string,
  patch: Partial<ApiShopRecord>
): Promise<ApiShopRecord> {
  const data = await requestJson<{ shop: ApiShopRecord }>(
    `/api/shops/${encodeURIComponent(idOrEmail)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(patch),
      useAdminToken: true,
    }
  );
  return data.shop;
}

export async function toggleShopStatusInDb(idOrEmail: string): Promise<ApiShopRecord> {
  const data = await requestJson<{ shop: ApiShopRecord }>(
    `/api/shops/${encodeURIComponent(idOrEmail)}/toggle-status`,
    {
      method: 'POST',
      body: JSON.stringify({}),
      useAdminToken: true,
    }
  );
  return data.shop;
}

export async function resetShopPinByAdminInDb(idOrEmail: string, pin: string): Promise<ApiShopRecord> {
  const data = await requestJson<{ shop: ApiShopRecord }>(
    `/api/shops/${encodeURIComponent(idOrEmail)}/reset-pin`,
    {
      method: 'POST',
      body: JSON.stringify({ pin }),
      useAdminToken: true,
    }
  );
  return data.shop;
}

export async function deleteShopInDb(idOrEmail: string): Promise<void> {
  await requestJson<{ deleted: boolean }>(`/api/shops/${encodeURIComponent(idOrEmail)}`, {
    method: 'DELETE',
    useAdminToken: true,
  });
}

export async function fetchAdminAuditLogsInDb(limit: number = 200): Promise<ApiAuditLogRecord[]> {
  const data = await requestJson<{ logs: ApiAuditLogRecord[] }>(
    `/api/admin/audit-logs?limit=${limit}`,
    { useAdminToken: true }
  );
  return data.logs || [];
}

export interface EmailVerificationResult {
  validFormat: boolean;
  registered: boolean;
  isActive: boolean;
  email: string;
  role?: 'owner' | 'employee' | 'admin';
  displayName?: string;
  shopId?: string;
  shopName?: string;
  ownerName?: string;
  message: string;
}

export async function verifyOwnerEmailInDb(email: string): Promise<EmailVerificationResult> {
  return await requestJson<EmailVerificationResult>('/api/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function loginShopInDb(
  shopId: string,
  pin: string,
  email: string,
  firebaseUid?: string
): Promise<{ shop: ApiShopRecord; user: ApiUserRecord; workspace: ApiOwnerWorkspace; token: string }> {
  const data = await requestJson<{
    success: boolean;
    token: string;
    shop: ApiShopRecord;
    user: ApiUserRecord;
    workspace: ApiOwnerWorkspace;
  }>('/api/auth/shop-login', {
    method: 'POST',
    body: JSON.stringify({ email, shopId, pin, firebaseUid }),
  });
  if (data.token) {
    setOwnerSessionToken(data.token);
  }
  return { shop: data.shop, user: data.user, workspace: data.workspace, token: data.token };
}

export async function logoutOwnerInDb(): Promise<void> {
  const token = getOwnerSessionToken();
  try {
    if (token) {
      await requestJson<{ ok: boolean }>('/api/auth/logout', {
        method: 'POST',
        body: JSON.stringify({}),
      });
    }
  } catch (_) {
  } finally {
    setOwnerSessionToken(null);
  }
}

export async function fetchOwnerWorkspace(email: string): Promise<ApiOwnerWorkspace> {
  const data = await requestJson<{ workspace: ApiOwnerWorkspace }>(
    `/api/owners/${encodeURIComponent(email)}/workspace`
  );
  return data.workspace;
}

export async function saveOwnerSettingsInDb(
  email: string,
  settings: {
    name: string;
    tagline: string;
    phone: string;
    address: string;
    gstin: string;
    taxRatePercent: number;
    currencySymbol: string;
  }
): Promise<ApiShopRecord> {
  const data = await requestJson<{ shop: ApiShopRecord }>(
    `/api/owners/${encodeURIComponent(email)}/settings`,
    {
      method: 'PUT',
      body: JSON.stringify(settings),
    }
  );
  return data.shop;
}

export async function resetOwnShopPinInDb(
  email: string,
  currentPin: string,
  newPin: string
): Promise<ApiShopRecord> {
  const data = await requestJson<{ ok: boolean; shop: ApiShopRecord }>(
    `/api/owners/${encodeURIComponent(email)}/reset-pin`,
    {
      method: 'POST',
      body: JSON.stringify({ currentPin, newPin }),
    }
  );
  return data.shop;
}

export async function saveOwnerItemInDb(
  email: string,
  item: ApiItemRecord
): Promise<ApiItemRecord> {
  const data = await requestJson<{ item: ApiItemRecord }>(
    `/api/owners/${encodeURIComponent(email)}/items`,
    {
      method: 'POST',
      body: JSON.stringify(item),
    }
  );
  return data.item;
}

export async function deleteOwnerItemInDb(email: string, itemId: string): Promise<void> {
  await requestJson<{ deleted: boolean }>(
    `/api/owners/${encodeURIComponent(email)}/items/${encodeURIComponent(itemId)}`,
    {
      method: 'DELETE',
    }
  );
}

export async function createOwnerBillInDb(
  email: string,
  bill: ApiBillRecord
): Promise<ApiBillRecord> {
  const data = await requestJson<{ bill: ApiBillRecord }>(
    `/api/owners/${encodeURIComponent(email)}/bills`,
    {
      method: 'POST',
      body: JSON.stringify(bill),
    }
  );
  return data.bill;
}

export async function fetchEmployeesInDb(email: string): Promise<ApiUserRecord[]> {
  const data = await requestJson<{ employees: ApiUserRecord[] }>(
    `/api/owners/${encodeURIComponent(email)}/employees`
  );
  return data.employees || [];
}

export async function addEmployeeInDb(
  email: string,
  input: { email: string; displayName: string; pin: string }
): Promise<ApiUserRecord> {
  const data = await requestJson<{ employee: ApiUserRecord }>(
    `/api/owners/${encodeURIComponent(email)}/employees`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    }
  );
  return data.employee;
}

export async function updateEmployeeInDb(
  email: string,
  empUid: string,
  patch: Partial<{ displayName: string; email: string; isActive: boolean }>
): Promise<ApiUserRecord> {
  const data = await requestJson<{ employee: ApiUserRecord }>(
    `/api/owners/${encodeURIComponent(email)}/employees/${encodeURIComponent(empUid)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }
  );
  return data.employee;
}

export async function toggleEmployeeStatusInDb(
  email: string,
  empUid: string
): Promise<ApiUserRecord> {
  const data = await requestJson<{ employee: ApiUserRecord }>(
    `/api/owners/${encodeURIComponent(email)}/employees/${encodeURIComponent(empUid)}/toggle-status`,
    {
      method: 'POST',
      body: JSON.stringify({}),
    }
  );
  return data.employee;
}

export async function resetEmployeePinInDb(
  email: string,
  empUid: string,
  pin: string
): Promise<ApiUserRecord> {
  const data = await requestJson<{ employee: ApiUserRecord }>(
    `/api/owners/${encodeURIComponent(email)}/employees/${encodeURIComponent(empUid)}/reset-pin`,
    {
      method: 'POST',
      body: JSON.stringify({ pin }),
    }
  );
  return data.employee;
}

export async function deleteEmployeeInDb(email: string, empUid: string): Promise<void> {
  await requestJson<{ deleted: boolean }>(
    `/api/owners/${encodeURIComponent(email)}/employees/${encodeURIComponent(empUid)}`,
    {
      method: 'DELETE',
    }
  );
}

export async function fetchOwnerAuditLogsInDb(
  email: string,
  limit: number = 100
): Promise<ApiAuditLogRecord[]> {
  const data = await requestJson<{ logs: ApiAuditLogRecord[] }>(
    `/api/owners/${encodeURIComponent(email)}/audit-logs?limit=${limit}`
  );
  return data.logs || [];
}

export async function exportShopBackupInDb(
  email: string,
  source: 'sqlite' | 'hybrid' = 'sqlite'
): Promise<ShopBackupBundle> {
  const data = await requestJson<{ bundle: ShopBackupBundle }>(
    `/api/owners/${encodeURIComponent(email)}/backup/export?source=${source}`
  );
  return data.bundle;
}

export async function fetchBackupHistoryInDb(email: string): Promise<ApiBackupHistoryRecord[]> {
  const data = await requestJson<{ history: ApiBackupHistoryRecord[] }>(
    `/api/owners/${encodeURIComponent(email)}/backup/history`
  );
  return data.history || [];
}

export async function restoreShopBackupInDb(
  email: string,
  bundle: ShopBackupBundle
): Promise<{ workspace: ApiOwnerWorkspace; restoredItems: number; restoredBills: number }> {
  return await requestJson<{ workspace: ApiOwnerWorkspace; restoredItems: number; restoredBills: number }>(
    `/api/owners/${encodeURIComponent(email)}/backup/restore`,
    {
      method: 'POST',
      body: JSON.stringify({ bundle }),
    }
  );
}

export async function fetchPendingSync(email: string): Promise<ApiOwnerWorkspace> {
  return await requestJson<ApiOwnerWorkspace>(
    `/api/owners/${encodeURIComponent(email)}/sync/pending`
  );
}

export async function markSyncedInDb(
  email: string,
  payload: {
    itemIds?: string[];
    billIds?: string[];
    errors?: Array<{ id: string; type: 'item' | 'bill'; error: string }>;
  }
): Promise<{
  syncedItems: number;
  syncedBills: number;
  lastSyncedAt: string;
  workspace: ApiOwnerWorkspace;
}> {
  return await requestJson<{
    syncedItems: number;
    syncedBills: number;
    lastSyncedAt: string;
    workspace: ApiOwnerWorkspace;
  }>(`/api/owners/${encodeURIComponent(email)}/sync/mark-synced`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function syncCloudShopBeforeLoginInDb(payload: {
  idToken: string;
  shopId?: string;
  email?: string;
}): Promise<{ synced: boolean; shop?: ApiShopRecord; syncedCount?: number; cloudError?: string }> {
  return await requestJson<{
    synced: boolean;
    shop?: ApiShopRecord;
    syncedCount?: number;
    cloudError?: string;
  }>('/api/auth/sync-cloud-shop', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${payload.idToken}`,
    },
    body: JSON.stringify({
      shopId: payload.shopId || '',
      email: payload.email || '',
    }),
  });
}

export async function mergeCloudWorkspaceInDb(
  email: string,
  cloudData: {
    shop?: unknown;
    items?: unknown[];
    bills?: unknown[];
  }
): Promise<{
  addedItems: number;
  updatedItems: number;
  addedBills: number;
  shopUpdated: boolean;
  workspace: ApiOwnerWorkspace;
}> {
  return await requestJson<{
    addedItems: number;
    updatedItems: number;
    addedBills: number;
    shopUpdated: boolean;
    workspace: ApiOwnerWorkspace;
  }>(`/api/owners/${encodeURIComponent(email)}/sync/merge-cloud`, {
    method: 'POST',
    body: JSON.stringify(cloudData),
  });
}

