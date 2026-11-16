import type { ApiBillRecord, ApiItemRecord, ApiOwnerWorkspace } from '../services/shopApi';
import {
  createOwnerBillInDb,
  fetchPendingSync,
  markSyncedInDb,
  mergeCloudWorkspaceInDb,
} from '../services/shopApi';
import {
  ensureOwnerWorkspaceInFirestore,
  pullFirestoreWorkspace,
  syncBillToFirestore,
  syncItemToFirestore,
} from '../firebase';

export const SUPER_ADMIN_EMAIL = 'shivamraj.in5@gmail.com';

export type OfflineQueueMap = Record<string, ApiBillRecord[]>;

const STORAGE_KEY = 'shopbill_offline_bill_queue_v1';
const LAST_SYNCED_STORAGE_KEY = 'shopbill_last_synced_at_v1';

export function normalizeOwnerKey(email: string): string {
  return email.trim().toLowerCase();
}

export function isMatchingCloudEmail(
  cloudEmail: string | null | undefined,
  ownerEmail: string | null | undefined
): boolean {
  const a = normalizeOwnerKey(cloudEmail || '');
  const b = normalizeOwnerKey(ownerEmail || '');
  return Boolean(a && b && a === b);
}

export function isCloudSyncAuthorizedForEmail(
  cloudEmail: string | null | undefined,
  ownerEmail: string | null | undefined
): boolean {
  const normCloud = normalizeOwnerKey(cloudEmail || '');
  if (!normCloud) return false;
  if (normCloud === SUPER_ADMIN_EMAIL) return true;
  return isMatchingCloudEmail(normCloud, ownerEmail);
}

export function computeExponentialBackoffMs(attempt: number, baseMs: number = 1500, maxMs: number = 60_000): number {
  const exp = Math.max(0, Math.min(8, attempt));
  return Math.min(maxMs, baseMs * Math.pow(2, exp));
}

export function resolveItemSyncConflict(
  localItem: ApiItemRecord & { updatedAt?: string },
  cloudItem: (ApiItemRecord & { updatedAt?: string }) | null
): { winner: 'local' | 'cloud'; item: ApiItemRecord } {
  if (!cloudItem) {
    return { winner: 'local', item: localItem };
  }
  const localTs = localItem.updatedAt ? new Date(localItem.updatedAt).getTime() : 0;
  const cloudTs = cloudItem.updatedAt ? new Date(cloudItem.updatedAt).getTime() : 0;
  if (cloudTs > localTs) {
    return { winner: 'cloud', item: cloudItem };
  }
  return { winner: 'local', item: localItem };
}

export async function runWithExponentialRetry<T>(
  task: () => Promise<T>,
  options: { maxAttempts?: number; baseDelayMs?: number } = {}
): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const baseDelayMs = options.baseDelayMs ?? 400;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await task();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts - 1) {
        const waitMs = computeExponentialBackoffMs(attempt, baseDelayMs, 8000);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Operation failed after retries.');
}

export function enqueueOfflineBill(
  queue: OfflineQueueMap,
  ownerEmail: string,
  bill: ApiBillRecord
): OfflineQueueMap {
  const key = normalizeOwnerKey(ownerEmail);
  if (!key) return queue;
  const existing = queue[key] || [];
  const pendingBill: ApiBillRecord = {
    ...bill,
    syncStatus: 'pending',
    syncedAt: null,
  };
  // Duplicate bill prevention by ID or billNumber
  const filtered = existing.filter(
    (b) => b.id !== pendingBill.id && b.billNumber !== pendingBill.billNumber
  );
  return {
    ...queue,
    [key]: [pendingBill, ...filtered],
  };
}

export function dequeueOfflineBill(
  queue: OfflineQueueMap,
  ownerEmail: string,
  billId: string
): OfflineQueueMap {
  const key = normalizeOwnerKey(ownerEmail);
  if (!key || !queue[key]) return queue;
  const nextList = queue[key].filter((b) => b.id !== billId);
  const nextQueue = { ...queue };
  if (nextList.length === 0) {
    delete nextQueue[key];
  } else {
    nextQueue[key] = nextList;
  }
  return nextQueue;
}

export function getOfflineBillsForOwner(
  queue: OfflineQueueMap,
  ownerEmail: string
): ApiBillRecord[] {
  const key = normalizeOwnerKey(ownerEmail);
  return key ? queue[key] || [] : [];
}

export function mergeOfflineAndDbBills(
  offlineBills: ApiBillRecord[],
  dbBills: ApiBillRecord[]
): ApiBillRecord[] {
  const byId = new Map<string, ApiBillRecord>();
  const seenNumbers = new Set<string>();
  for (const bill of dbBills) {
    byId.set(bill.id, bill);
    seenNumbers.add(bill.billNumber);
  }
  for (const bill of offlineBills) {
    if (!byId.has(bill.id) && !seenNumbers.has(bill.billNumber)) {
      byId.set(bill.id, { ...bill, syncStatus: 'pending' });
    }
  }
  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export interface SyncStateSummary {
  totalBills: number;
  pendingCount: number;
  syncedCount: number;
  status: 'offline' | 'syncing' | 'needs_auth' | 'pending' | 'synced';
}

export function summarizeSyncState(params: {
  bills: ApiBillRecord[];
  isOnline: boolean;
  isSyncing: boolean;
  hasCloudAuth: boolean;
}): SyncStateSummary {
  const totalBills = params.bills.length;
  const pendingCount = params.bills.filter((b) => b.syncStatus !== 'synced').length;
  const syncedCount = totalBills - pendingCount;

  if (!params.isOnline) {
    return { totalBills, pendingCount, syncedCount, status: 'offline' };
  }
  if (params.isSyncing) {
    return { totalBills, pendingCount, syncedCount, status: 'syncing' };
  }
  if (pendingCount > 0 && !params.hasCloudAuth) {
    return { totalBills, pendingCount, syncedCount, status: 'needs_auth' };
  }
  if (pendingCount > 0) {
    return { totalBills, pendingCount, syncedCount, status: 'pending' };
  }
  return { totalBills, pendingCount, syncedCount, status: 'synced' };
}

export function shouldAutoSync(params: {
  isOnline: boolean;
  isSyncing: boolean;
  hasCloudAuth: boolean;
  pendingCount: number;
  browserBufferedCount: number;
}): boolean {
  if (!params.isOnline || params.isSyncing) return false;
  if (params.browserBufferedCount > 0) return true;
  if (params.hasCloudAuth && params.pendingCount > 0) return true;
  return false;
}

export function loadLastSyncedAt(ownerEmail: string): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(LAST_SYNCED_STORAGE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, string>;
    return map[normalizeOwnerKey(ownerEmail)] || null;
  } catch (_) {
    return null;
  }
}

export function saveLastSyncedAt(ownerEmail: string, timestampIso: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const raw = window.localStorage.getItem(LAST_SYNCED_STORAGE_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    map[normalizeOwnerKey(ownerEmail)] = timestampIso;
    window.localStorage.setItem(LAST_SYNCED_STORAGE_KEY, JSON.stringify(map));
  } catch (_) {}
}

export function loadOfflineQueue(): OfflineQueueMap {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return {};
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as OfflineQueueMap) : {};
  } catch (_) {
    return {};
  }
}

export function saveOfflineQueue(queue: OfflineQueueMap): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    if (Object.keys(queue).length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    }
  } catch (_) {}
}

export function bufferOfflineBillInBrowser(ownerEmail: string, bill: ApiBillRecord): void {
  const current = loadOfflineQueue();
  const next = enqueueOfflineBill(current, ownerEmail, bill);
  saveOfflineQueue(next);
}

export function getBrowserBufferedCount(ownerEmail: string): number {
  return getOfflineBillsForOwner(loadOfflineQueue(), ownerEmail).length;
}

export async function flushBrowserOfflineBillsToSqlite(ownerEmail: string): Promise<number> {
  const queue = loadOfflineQueue();
  const pendingBills = getOfflineBillsForOwner(queue, ownerEmail);
  if (pendingBills.length === 0) return 0;

  let flushed = 0;
  let nextQueue = queue;
  for (const bill of pendingBills) {
    try {
      await createOwnerBillInDb(ownerEmail, bill);
      nextQueue = dequeueOfflineBill(nextQueue, ownerEmail, bill.id);
      flushed += 1;
    } catch (_) {
      break;
    }
  }
  if (flushed > 0) {
    saveOfflineQueue(nextQueue);
  }
  return flushed;
}

export interface SyncRunResult {
  status: 'offline' | 'needs_auth' | 'synced' | 'partial';
  flushedToSqlite: number;
  syncedItems: number;
  syncedBills: number;
  pulledItems?: number;
  pulledBills?: number;
  pendingRemaining: number;
  lastSyncedAt?: string | null;
  workspace?: ApiOwnerWorkspace;
  error?: string;
}

const activeSyncEmails = new Set<string>();
const queuedFollowUpEmails = new Set<string>();
const backoffStateByEmail = new Map<string, { failures: number; retryAfterMs: number }>();

async function executeOfflineToFirestoreSync(
  ownerEmail: string,
  options: { isOnline: boolean; hasCloudAuth: boolean; forceManual?: boolean }
): Promise<SyncRunResult> {
  const key = normalizeOwnerKey(ownerEmail);
  if (!key) {
    return {
      status: 'synced',
      flushedToSqlite: 0,
      syncedItems: 0,
      syncedBills: 0,
      pendingRemaining: 0,
    };
  }

  if (!options.isOnline) {
    const offlineBills = getOfflineBillsForOwner(loadOfflineQueue(), ownerEmail);
    return {
      status: 'offline',
      flushedToSqlite: 0,
      syncedItems: 0,
      syncedBills: 0,
      pendingRemaining: offlineBills.length,
    };
  }

  // Respect exponential backoff cooldown unless user clicked Sync Now manually
  const backoff = backoffStateByEmail.get(key);
  if (!options.forceManual && backoff && Date.now() < backoff.retryAfterMs) {
    return {
      status: 'partial',
      flushedToSqlite: 0,
      syncedItems: 0,
      syncedBills: 0,
      pendingRemaining: getOfflineBillsForOwner(loadOfflineQueue(), ownerEmail).length,
      error: `Cooling down before retry (${Math.ceil((backoff.retryAfterMs - Date.now()) / 1000)}s).`,
    };
  }

  const flushedToSqlite = await flushBrowserOfflineBillsToSqlite(ownerEmail);

  let pending: ApiOwnerWorkspace;
  try {
    pending = await fetchPendingSync(ownerEmail);
  } catch (err) {
    return {
      status: 'offline',
      flushedToSqlite,
      syncedItems: 0,
      syncedBills: 0,
      pendingRemaining: getOfflineBillsForOwner(loadOfflineQueue(), ownerEmail).length,
      error: err instanceof Error ? err.message : 'Unable to reach local SQLite database.',
    };
  }

  const totalPending = pending.items.length + pending.bills.length;
  if (!options.hasCloudAuth) {
    if (totalPending === 0) {
      backoffStateByEmail.delete(key);
      return {
        status: 'synced',
        flushedToSqlite,
        syncedItems: 0,
        syncedBills: 0,
        pulledItems: 0,
        pulledBills: 0,
        pendingRemaining: 0,
        lastSyncedAt: pending.shop.lastSyncedAt || loadLastSyncedAt(ownerEmail),
      };
    }
    return {
      status: 'needs_auth',
      flushedToSqlite,
      syncedItems: 0,
      syncedBills: 0,
      pulledItems: 0,
      pulledBills: 0,
      pendingRemaining: pending.bills.length,
    };
  }

  const syncedItemIds: string[] = [];
  const syncedBillIds: string[] = [];
  const errors: Array<{ id: string; type: 'item' | 'bill'; error: string }> = [];

  if (totalPending > 0) {
    try {
      await runWithExponentialRetry(() => ensureOwnerWorkspaceInFirestore(pending.shop), {
        maxAttempts: 2,
        baseDelayMs: 300,
      });
    } catch (err) {
      const prevFails = (backoffStateByEmail.get(key)?.failures || 0) + 1;
      backoffStateByEmail.set(key, {
        failures: prevFails,
        retryAfterMs: Date.now() + computeExponentialBackoffMs(prevFails),
      });
      const msg = err instanceof Error ? err.message : 'Failed to initialize owner cloud record.';
      return {
        status: 'partial',
        flushedToSqlite,
        syncedItems: 0,
        syncedBills: 0,
        pulledItems: 0,
        pulledBills: 0,
        pendingRemaining: pending.bills.length,
        error: msg,
      };
    }

    for (const item of pending.items) {
      try {
        const ok = await runWithExponentialRetry(
          () =>
            syncItemToFirestore(pending.shop.emailKey, pending.shop.email, {
              ...item,
              shopId: pending.shop.shopId,
            }),
          { maxAttempts: 2, baseDelayMs: 250 }
        );
        if (ok) syncedItemIds.push(item.id);
      } catch (err) {
        errors.push({
          id: item.id,
          type: 'item',
          error: err instanceof Error ? err.message : 'Item sync failed',
        });
      }
    }

    for (const bill of pending.bills) {
      try {
        const ok = await runWithExponentialRetry(
          () =>
            syncBillToFirestore(pending.shop.emailKey, pending.shop.email, {
              ...bill,
              shopId: pending.shop.shopId,
            }),
          { maxAttempts: 2, baseDelayMs: 250 }
        );
        if (ok) syncedBillIds.push(bill.id);
      } catch (err) {
        errors.push({
          id: bill.id,
          type: 'bill',
          error: err instanceof Error ? err.message : 'Bill sync failed',
        });
      }
    }
  }

  let marked: {
    syncedItems: number;
    syncedBills: number;
    lastSyncedAt: string;
    workspace: ApiOwnerWorkspace;
  } | null = null;
  if (totalPending > 0) {
    marked = await markSyncedInDb(ownerEmail, {
      itemIds: syncedItemIds,
      billIds: syncedBillIds,
      errors,
    });
  }

  // Pull latest bills, items, and PIN/settings from Firestore into SQLite (bidirectional sync)
  let pulledItems = 0;
  let pulledBills = 0;
  let mergedWorkspace: ApiOwnerWorkspace | undefined = marked?.workspace;
  try {
    const cloudWorkspace = await runWithExponentialRetry(
      () =>
        pullFirestoreWorkspace(
          pending.shop.emailKey,
          pending.shop.shopId,
          pending.shop.email
        ),
      { maxAttempts: 2, baseDelayMs: 250 }
    );
    const merged = await mergeCloudWorkspaceInDb(ownerEmail, cloudWorkspace);
    pulledItems = merged.addedItems + merged.updatedItems;
    pulledBills = merged.addedBills;
    mergedWorkspace = merged.workspace;
  } catch (pullErr) {
    if (errors.length === 0 && options.forceManual) {
      errors.push({
        id: 'cloud_pull',
        type: 'bill',
        error: pullErr instanceof Error ? pullErr.message : 'Cloud pull failed',
      });
    }
  }

  const finalLastSyncedAt =
    marked?.lastSyncedAt || mergedWorkspace?.shop.lastSyncedAt || new Date().toISOString();

  if (errors.length > 0) {
    const prevFails = (backoffStateByEmail.get(key)?.failures || 0) + 1;
    backoffStateByEmail.set(key, {
      failures: prevFails,
      retryAfterMs: Date.now() + computeExponentialBackoffMs(prevFails),
    });
  } else {
    backoffStateByEmail.delete(key);
    saveLastSyncedAt(ownerEmail, finalLastSyncedAt);
  }

  const pendingRemaining = Math.max(0, pending.bills.length - syncedBillIds.length);
  return {
    status: pendingRemaining === 0 && errors.length === 0 ? 'synced' : 'partial',
    flushedToSqlite,
    syncedItems: marked?.syncedItems ?? 0,
    syncedBills: marked?.syncedBills ?? 0,
    pulledItems,
    pulledBills,
    pendingRemaining,
    lastSyncedAt: finalLastSyncedAt,
    workspace: mergedWorkspace,
    error: errors.length > 0 ? errors[0].error : undefined,
  };
}

export async function runOfflineToFirestoreSync(
  ownerEmail: string,
  options: { isOnline: boolean; hasCloudAuth: boolean; forceManual?: boolean }
): Promise<SyncRunResult> {
  const key = normalizeOwnerKey(ownerEmail);
  if (!key) {
    return {
      status: 'synced',
      flushedToSqlite: 0,
      syncedItems: 0,
      syncedBills: 0,
      pendingRemaining: 0,
    };
  }

  if (activeSyncEmails.has(key)) {
    queuedFollowUpEmails.add(key);
    return {
      status: options.isOnline ? 'synced' : 'offline',
      flushedToSqlite: 0,
      syncedItems: 0,
      syncedBills: 0,
      pendingRemaining: getOfflineBillsForOwner(loadOfflineQueue(), ownerEmail).length,
    };
  }

  activeSyncEmails.add(key);
  try {
    let result = await executeOfflineToFirestoreSync(ownerEmail, options);
    if (queuedFollowUpEmails.has(key)) {
      queuedFollowUpEmails.delete(key);
      if (options.isOnline) {
        const followUp = await executeOfflineToFirestoreSync(ownerEmail, options);
        result = {
          ...followUp,
          flushedToSqlite: result.flushedToSqlite + followUp.flushedToSqlite,
          syncedItems: result.syncedItems + followUp.syncedItems,
          syncedBills: result.syncedBills + followUp.syncedBills,
        };
      }
    }
    return result;
  } finally {
    activeSyncEmails.delete(key);
    queuedFollowUpEmails.delete(key);
  }
}
