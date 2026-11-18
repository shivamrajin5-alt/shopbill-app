import test from 'node:test';
import assert from 'node:assert/strict';
import type { ApiBillRecord, ApiItemRecord } from '../services/shopApi';
import {
  computeExponentialBackoffMs,
  dequeueOfflineBill,
  enqueueOfflineBill,
  formatCloudSyncError,
  getOfflineBillsForOwner,
  isCloudSyncAuthorizedForEmail,
  isMatchingCloudEmail,
  mergeOfflineAndDbBills,
  resolveItemSyncConflict,
  runWithExponentialRetry,
  shouldAutoSync,
  summarizeSyncState,
  SUPER_ADMIN_EMAIL,
  type OfflineQueueMap,
} from './syncEngine';

function makeBill(overrides: Partial<ApiBillRecord> = {}): ApiBillRecord {
  return {
    id: 'b_test_1',
    billNumber: 'SB-5001',
    createdAt: '2026-11-12T10:00:00.000Z',
    items: [
      {
        itemId: 'i1',
        name: 'Basmati Rice',
        code: 'BR101',
        unitPrice: 120,
        quantity: 1,
        unit: 'kg',
      },
    ],
    subtotal: 120,
    discountAmount: 0,
    taxAmount: 0,
    grandTotal: 120,
    paymentMethod: 'Cash',
    cashierName: 'Rajesh Sharma',
    syncStatus: 'pending',
    ...overrides,
  };
}

function makeItem(overrides: Partial<ApiItemRecord> = {}): ApiItemRecord {
  return {
    id: 'item_1',
    name: 'Basmati Rice',
    code: 'BR101',
    price: 120,
    stock: 20,
    category: 'Groceries',
    unit: 'kg',
    updatedAt: '2026-11-12T10:00:00.000Z',
    ...overrides,
  };
}

test('enqueueOfflineBill buffers bills per owner without duplicate IDs or billNumbers and dequeues cleanly', () => {
  let queue: OfflineQueueMap = {};
  const bill1 = makeBill({ id: 'b_off_1', billNumber: 'SB-901' });
  const bill2 = makeBill({ id: 'b_off_2', billNumber: 'SB-902' });
  const duplicateNumberDifferentId = makeBill({ id: 'b_off_1_dup', billNumber: 'SB-901' });

  queue = enqueueOfflineBill(queue, 'Owner@QuickMart.in ', bill1);
  queue = enqueueOfflineBill(queue, 'owner@quickmart.in', bill2);
  queue = enqueueOfflineBill(queue, 'owner@quickmart.in', bill1);
  queue = enqueueOfflineBill(queue, 'owner@quickmart.in', duplicateNumberDifferentId);

  const list = getOfflineBillsForOwner(queue, 'owner@quickmart.in');
  assert.equal(list.length, 2);
  assert.equal(list[0].billNumber, 'SB-901');
  assert.equal(list[0].syncStatus, 'pending');

  queue = dequeueOfflineBill(queue, 'owner@quickmart.in', 'b_off_1_dup');
  assert.equal(getOfflineBillsForOwner(queue, 'owner@quickmart.in').length, 1);

  queue = dequeueOfflineBill(queue, 'owner@quickmart.in', 'b_off_2');
  assert.equal(getOfflineBillsForOwner(queue, 'owner@quickmart.in').length, 0);
  assert.equal(Object.keys(queue).length, 0);
});

test('mergeOfflineAndDbBills deduplicates by id and billNumber and sorts newest first', () => {
  const offline = [
    makeBill({ id: 'b_off_new', billNumber: 'SB-9003', createdAt: '2026-11-12T12:00:00.000Z', syncStatus: 'pending' }),
    makeBill({ id: 'b_already_in_db', billNumber: 'SB-9002', createdAt: '2026-11-12T09:00:00.000Z', syncStatus: 'pending' }),
    makeBill({ id: 'b_dup_num', billNumber: 'SB-9001', createdAt: '2026-11-12T08:05:00.000Z', syncStatus: 'pending' }),
  ];
  const dbBills = [
    makeBill({ id: 'b_already_in_db', billNumber: 'SB-9002', createdAt: '2026-11-12T09:00:00.000Z', syncStatus: 'synced' }),
    makeBill({ id: 'b_old', billNumber: 'SB-9001', createdAt: '2026-11-12T08:00:00.000Z', syncStatus: 'synced' }),
  ];

  const merged = mergeOfflineAndDbBills(offline, dbBills);
  assert.equal(merged.length, 3);
  assert.equal(merged[0].id, 'b_off_new');
  assert.equal(merged[0].syncStatus, 'pending');
  assert.equal(merged[1].id, 'b_already_in_db');
  assert.equal(merged[1].syncStatus, 'synced');
});

test('summarizeSyncState accurately reports offline, needs_auth, pending items/bills, syncing, and synced', () => {
  const pendingBills = [
    makeBill({ id: 'b1', syncStatus: 'pending' }),
    makeBill({ id: 'b2', syncStatus: 'synced' }),
  ];
  const items = [
    makeItem({ id: 'i1', syncStatus: 'pending' }),
    makeItem({ id: 'i2', syncStatus: 'synced' }),
  ];

  const offlineSummary = summarizeSyncState({
    bills: pendingBills,
    items,
    isOnline: false,
    isSyncing: false,
    hasCloudAuth: false,
  });
  assert.equal(offlineSummary.status, 'offline');
  assert.equal(offlineSummary.pendingBillsCount, 1);
  assert.equal(offlineSummary.pendingItemsCount, 1);
  assert.equal(offlineSummary.pendingCount, 2);
  assert.equal(offlineSummary.syncedCount, 1);

  const needsAuthEvenWhenBillsSynced = summarizeSyncState({
    bills: [makeBill({ id: 'b2', syncStatus: 'synced' })],
    items: [makeItem({ id: 'i2', syncStatus: 'synced' })],
    isOnline: true,
    isSyncing: false,
    hasCloudAuth: false,
  });
  assert.equal(needsAuthEvenWhenBillsSynced.status, 'needs_auth');

  const pendingItemsSummary = summarizeSyncState({
    bills: [makeBill({ id: 'b2', syncStatus: 'synced' })],
    items,
    isOnline: true,
    isSyncing: false,
    hasCloudAuth: true,
  });
  assert.equal(pendingItemsSummary.status, 'pending');
  assert.equal(pendingItemsSummary.pendingItemsCount, 1);
  assert.equal(pendingItemsSummary.pendingCount, 1);

  const syncedSummary = summarizeSyncState({
    bills: [makeBill({ id: 'b2', syncStatus: 'synced' })],
    items: [makeItem({ id: 'i2', syncStatus: 'synced' })],
    isOnline: true,
    isSyncing: false,
    hasCloudAuth: true,
  });
  assert.equal(syncedSummary.status, 'synced');
  assert.equal(syncedSummary.pendingCount, 0);
});

test('shouldAutoSync triggers automatically when internet is available and pending records exist', () => {
  assert.equal(
    shouldAutoSync({
      isOnline: false,
      isSyncing: false,
      hasCloudAuth: true,
      pendingCount: 2,
      browserBufferedCount: 1,
    }),
    false
  );
  assert.equal(
    shouldAutoSync({
      isOnline: true,
      isSyncing: false,
      hasCloudAuth: false,
      pendingCount: 0,
      browserBufferedCount: 1,
    }),
    true
  );
  assert.equal(
    shouldAutoSync({
      isOnline: true,
      isSyncing: false,
      hasCloudAuth: true,
      pendingCount: 2,
      browserBufferedCount: 0,
    }),
    true
  );
  assert.equal(
    shouldAutoSync({
      isOnline: true,
      isSyncing: true,
      hasCloudAuth: true,
      pendingCount: 2,
      browserBufferedCount: 1,
    }),
    false
  );
  assert.equal(
    shouldAutoSync({
      isOnline: true,
      isSyncing: false,
      hasCloudAuth: true,
      pendingCount: 0,
      browserBufferedCount: 0,
    }),
    false
  );
});

test('isMatchingCloudEmail permits cloud sync only when verified Google email matches active owner', () => {
  assert.equal(isMatchingCloudEmail('Rajesh@QuickMart.in ', 'rajesh@quickmart.in'), true);
  assert.equal(isMatchingCloudEmail('other@gmail.com', 'rajesh@quickmart.in'), false);
  assert.equal(isMatchingCloudEmail(null, 'rajesh@quickmart.in'), false);
  assert.equal(isMatchingCloudEmail('rajesh@quickmart.in', ''), false);
});

test('isCloudSyncAuthorizedForEmail permits owner, matching employee actorEmail, and super_admin email', () => {
  assert.equal(isCloudSyncAuthorizedForEmail(SUPER_ADMIN_EMAIL, 'rajesh@quickmart.in'), true);
  assert.equal(isCloudSyncAuthorizedForEmail('other@gmail.com', 'rajesh@quickmart.in'), false);
  assert.equal(isCloudSyncAuthorizedForEmail('rajesh@quickmart.in', 'rajesh@quickmart.in'), true);
  assert.equal(
    isCloudSyncAuthorizedForEmail('staff@gmail.com', 'rajesh@quickmart.in', 'Staff@Gmail.com'),
    true
  );
  assert.equal(
    isCloudSyncAuthorizedForEmail('wrong@gmail.com', 'rajesh@quickmart.in', 'staff@gmail.com'),
    false
  );
  assert.equal(isCloudSyncAuthorizedForEmail(null, 'rajesh@quickmart.in'), false);
});

test('formatCloudSyncError produces clear messages for unauthorized domains, popups, and Firestore rules errors', () => {
  const domainErr = formatCloudSyncError(
    new Error('Firebase: Error (auth/unauthorized-domain).'),
    'billkart-app.onrender.com'
  );
  assert.match(domainErr, /billkart-app\.onrender\.com/);
  assert.match(domainErr, /Authorized domains/);

  const popupBlocked = formatCloudSyncError(new Error('Firebase: Error (auth/popup-blocked).'));
  assert.match(popupBlocked, /popup was blocked/i);

  const popupClosed = formatCloudSyncError(new Error('Firebase: Error (auth/popup-closed-by-user).'));
  assert.match(popupClosed, /closed before completing/i);

  const firestoreJsonErr = formatCloudSyncError(
    new Error(
      JSON.stringify({
        error: 'Missing or insufficient permissions.',
        path: 'shop_owners/rajesh_quickmart_in/bills/b1',
        operationType: 'create',
      })
    )
  );
  assert.match(firestoreJsonErr, /permission denied/i);
  assert.match(firestoreJsonErr, /shop_owners\/rajesh_quickmart_in\/bills\/b1/);
});

test('computeExponentialBackoffMs grows exponentially and caps at maxMs', () => {
  assert.equal(computeExponentialBackoffMs(0, 1000, 10_000), 1000);
  assert.equal(computeExponentialBackoffMs(1, 1000, 10_000), 2000);
  assert.equal(computeExponentialBackoffMs(2, 1000, 10_000), 4000);
  assert.equal(computeExponentialBackoffMs(6, 1000, 10_000), 10_000);
});

test('resolveItemSyncConflict selects newer timestamp between local SQLite and cloud Firestore', () => {
  const localOlder = makeItem({ price: 110, updatedAt: '2026-11-12T10:00:00.000Z' });
  const cloudNewer = makeItem({ price: 125, updatedAt: '2026-11-12T10:05:00.000Z' });
  const cloudWins = resolveItemSyncConflict(localOlder, cloudNewer);
  assert.equal(cloudWins.winner, 'cloud');
  assert.equal(cloudWins.item.price, 125);

  const localNewer = makeItem({ price: 130, updatedAt: '2026-11-12T10:10:00.000Z' });
  const localWins = resolveItemSyncConflict(localNewer, cloudNewer);
  assert.equal(localWins.winner, 'local');
  assert.equal(localWins.item.price, 130);
});

test('runWithExponentialRetry retries transient failures and succeeds', async () => {
  let attempts = 0;
  const result = await runWithExponentialRetry(
    async () => {
      attempts += 1;
      if (attempts < 3) throw new Error('Transient network failure');
      return 'ok';
    },
    { maxAttempts: 3, baseDelayMs: 5 }
  );
  assert.equal(result, 'ok');
  assert.equal(attempts, 3);
});
