import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DbConflictError,
  DbValidationError,
  emailToDocKey,
  hashPinSha256,
  normalizeEmail,
  openShopBillDatabase,
} from './database';
import { isBcryptHash, verifyPinHash } from '../utils/pinSecurity';

test('email normalization and deterministic Firestore emailKey generation', () => {
  assert.equal(normalizeEmail('  Owner@Example.COM '), 'owner@example.com');
  const k1 = emailToDocKey('Owner@Example.COM');
  const k2 = emailToDocKey('owner@example.com');
  assert.equal(k1, k2);
  assert.match(k1, /^[a-zA-Z0-9_\-]+$/);
});

test('registers a new shop owner with salted bcrypt PIN hash, masks plaintext PIN, and rejects duplicate email', () => {
  const db = openShopBillDatabase(':memory:');
  try {
    const created = db.registerShop({
      shopId: 'SB-7777',
      shopName: 'Sunrise Mart',
      ownerName: 'Kiran Rao',
      email: 'Kiran.Rao@SunriseMart.in ',
      phone: '+91 98111 22334',
      address: '12 Market Lane',
      gstin: '27SUNRS1234A1Z9',
      pin: '4821',
    });

    assert.equal(created.email, 'kiran.rao@sunrisemart.in');
    assert.equal(created.shopId, 'SB-7777');
    assert.equal(created.pin, '');
    assert.equal(isBcryptHash(created.pinHash), true);
    assert.equal(verifyPinHash('4821', created.pinHash).valid, true);
    assert.equal(verifyPinHash('0000', created.pinHash).valid, false);

    assert.throws(
      () =>
        db.registerShop({
          shopName: 'Duplicate Mart',
          ownerName: 'Someone Else',
          email: 'kiran.rao@sunrisemart.in',
          phone: '9999999999',
          address: '45 Other Street',
          pin: '1111',
        }),
      DbConflictError
    );

    assert.throws(
      () =>
        db.registerShop({
          shopName: 'Bad Email Mart',
          ownerName: 'Bad User',
          email: 'not-an-email',
          phone: '9999999999',
          address: '45 Other Street',
          pin: '1111',
        }),
      DbValidationError
    );
  } finally {
    db.close();
  }
});

test('isolates inventory items and bills per individual shop owner email', () => {
  const db = openShopBillDatabase(':memory:');
  try {
    const ownerA = db.registerShop({
      shopId: 'SB-8001',
      shopName: 'Alpha Grocers',
      ownerName: 'Alpha Owner',
      email: 'alpha@stores.in',
      phone: '9000000001',
      address: 'Block A',
      pin: '2468',
    });

    const ownerB = db.registerShop({
      shopId: 'SB-8002',
      shopName: 'Beta Hardware',
      ownerName: 'Beta Owner',
      email: 'beta@stores.in',
      phone: '9000000002',
      address: 'Block B',
      pin: '1357',
    });

    db.saveOwnerItem(ownerA.email, {
      id: 'item_a1',
      name: 'Alpha Olive Oil',
      code: 'AO01',
      price: 550,
      stock: 10,
      category: 'Groceries',
      unit: 'pcs',
    });

    db.createOwnerBill(ownerA.email, {
      id: 'bill_a1',
      billNumber: 'SB-A100',
      createdAt: new Date().toISOString(),
      customerName: 'Customer One',
      customerPhone: '9888877777',
      subtotal: 1100,
      discountAmount: 0,
      taxAmount: 0,
      grandTotal: 1100,
      paymentMethod: 'UPI',
      cashierName: 'Alpha Owner',
      items: [
        {
          itemId: 'item_a1',
          name: 'Alpha Olive Oil',
          code: 'AO01',
          unitPrice: 550,
          quantity: 2,
          unit: 'pcs',
        },
      ],
    });

    const workspaceA = db.getOwnerWorkspace(ownerA.email);
    const workspaceB = db.getOwnerWorkspace(ownerB.email);

    assert.ok(workspaceA);
    assert.ok(workspaceB);
    assert.equal(workspaceA.items.length, 1);
    assert.equal(workspaceA.items[0].stock, 8);
    assert.equal(workspaceA.bills.length, 1);
    assert.equal(workspaceA.shop.totalBillsCount, 1);
    assert.equal(workspaceA.shop.totalRevenue, 1100);

    // Owner B has zero items or bills leaked from Owner A
    assert.equal(workspaceB.items.length, 0);
    assert.equal(workspaceB.bills.length, 0);
    assert.equal(workspaceB.shop.totalBillsCount, 0);
  } finally {
    db.close();
  }
});

test('verifies Shop ID + PIN login, links separate Firebase UID, and respects suspend/activate/PIN reset', () => {
  const db = openShopBillDatabase(':memory:');
  try {
    db.registerShop({
      shopId: 'SB-9001',
      shopName: 'Metro Mart',
      ownerName: 'Suresh Nair',
      email: 'suresh@metromart.in',
      phone: '9812345678',
      address: 'Metro Plaza',
      pin: '4321',
    });

    const okLogin = db.verifyShopLogin('sb-9001', '4321', 'suresh@metromart.in', 'fb_uid_suresh_1');
    assert.equal(okLogin.success, true);
    assert.equal(okLogin.shop?.email, 'suresh@metromart.in');
    assert.equal(okLogin.shop?.ownerUid, 'fb_uid_suresh_1');
    assert.equal(okLogin.user?.firebaseUid, 'fb_uid_suresh_1');

    db.toggleShopStatus('suresh@metromart.in');
    const suspendedLogin = db.verifyShopLogin('SB-9001', '4321');
    assert.equal(suspendedLogin.success, false);
    assert.match(suspendedLogin.error || '', /DEACTIVATED/);

    db.toggleShopStatus('SB-9001');
    db.resetShopPin('SB-9001', '8899');
    const oldPin = db.verifyShopLogin('SB-9001', '4321');
    assert.equal(oldPin.success, false);
    const newPin = db.verifyShopLogin('SB-9001', '8899');
    assert.equal(newPin.success, true);
  } finally {
    db.close();
  }
});

test('supports employee CRUD, employee login with separate UID, cross-shop blocking, and session revocation', () => {
  const db = openShopBillDatabase(':memory:');
  try {
    const shopA = db.registerShop({
      shopId: 'SB-9301',
      shopName: 'Shop Alpha',
      ownerName: 'Owner Alpha',
      email: 'owner.a@shopbill.in',
      phone: '9000011111',
      address: 'Lane 1',
      pin: '1111',
    });
    const shopB = db.registerShop({
      shopId: 'SB-9302',
      shopName: 'Shop Beta',
      ownerName: 'Owner Beta',
      email: 'owner.b@shopbill.in',
      phone: '9000022222',
      address: 'Lane 2',
      pin: '2222',
    });

    const emp = db.addShopEmployee(shopA.email, {
      email: 'cashier.a@gmail.com',
      displayName: 'Amit Cashier',
      pin: '5566',
    });
    assert.equal(emp.role, 'employee');
    assert.equal(emp.shopId, 'SB-9301');
    assert.equal(emp.isActive, true);

    // Email verification reports employee assignment
    const verifyEmp = db.verifyOwnerEmail('cashier.a@gmail.com');
    assert.equal(verifyEmp.registered, true);
    assert.equal(verifyEmp.role, 'employee');
    assert.equal(verifyEmp.shopId, 'SB-9301');

    // Cross-shop login blocked for employee
    const crossShop = db.verifyShopLogin('SB-9302', '5566', 'cashier.a@gmail.com');
    assert.equal(crossShop.success, false);
    assert.match(crossShop.error || '', /does not match Shop ID/);

    // Employee login in assigned shop succeeds with separate Firebase UID
    const empLogin = db.verifyShopLogin('SB-9301', '5566', 'cashier.a@gmail.com', 'fb_uid_emp_amit');
    assert.equal(empLogin.success, true);
    assert.equal(empLogin.user?.role, 'employee');
    assert.equal(empLogin.user?.firebaseUid, 'fb_uid_emp_amit');

    const empToken = db.createOwnerSession(shopA.email, {
      uid: 'fb_uid_emp_amit',
      email: 'cashier.a@gmail.com',
      name: 'Amit Cashier',
      role: 'employee',
      shopId: 'SB-9301',
    });
    const empCtx = db.getOwnerSessionContext(empToken, shopA.email);
    assert.ok(empCtx);
    assert.equal(empCtx.role, 'employee');
    assert.equal(db.getOwnerSessionContext(empToken, shopB.email), null);

    // Deactivating employee immediately invalidates session and blocks login
    const toggled = db.toggleEmployeeStatus(shopA.email, emp.uid);
    assert.equal(toggled?.isActive, false);
    assert.equal(db.getOwnerSessionContext(empToken, shopA.email), null);
    const deactivatedLogin = db.verifyShopLogin('SB-9301', '5566', 'cashier.a@gmail.com');
    assert.equal(deactivatedLogin.success, false);
    assert.match(deactivatedLogin.error || '', /deactivated/);

    // Reactivate, reset PIN, update displayName, and delete
    db.toggleEmployeeStatus(shopA.email, emp.uid);
    db.resetEmployeePin(shopA.email, emp.uid, '7788');
    assert.equal(db.verifyShopLogin('SB-9301', '5566', 'cashier.a@gmail.com').success, false);
    assert.equal(db.verifyShopLogin('SB-9301', '7788', 'cashier.a@gmail.com').success, true);

    const updated = db.updateShopEmployee(shopA.email, emp.uid, { displayName: 'Amit Senior Cashier' });
    assert.equal(updated?.displayName, 'Amit Senior Cashier');

    const deleted = db.deleteShopEmployee(shopA.email, emp.uid);
    assert.equal(deleted, true);
    assert.equal(db.listShopEmployees(shopA.email).length, 0);
  } finally {
    db.close();
  }
});

test('tracks pending offline sync status in SQLite and marks synced after Firestore upload', () => {
  const db = openShopBillDatabase(':memory:');
  try {
    const owner = db.registerShop({
      shopId: 'SB-9100',
      shopName: 'Offline Test Store',
      ownerName: 'Rohan Das',
      email: 'rohan@offlinestore.in',
      phone: '9800000001',
      address: 'Market Road',
      pin: '2222',
    });

    const item = db.saveOwnerItem(owner.email, {
      id: 'item_sync_1',
      name: 'Organic Honey',
      code: 'OH01',
      price: 250,
      stock: 10,
      category: 'Groceries',
      unit: 'pcs',
    });
    assert.equal(item.syncStatus, 'pending');

    const bill = db.createOwnerBill(owner.email, {
      id: 'bill_sync_1',
      billNumber: 'SB-9101',
      createdAt: new Date().toISOString(),
      customerName: 'Offline Customer',
      customerPhone: '',
      subtotal: 500,
      discountAmount: 0,
      taxAmount: 0,
      grandTotal: 500,
      paymentMethod: 'Cash',
      cashierName: 'Rohan Das',
      items: [
        {
          itemId: 'item_sync_1',
          name: 'Organic Honey',
          code: 'OH01',
          unitPrice: 250,
          quantity: 2,
          unit: 'pcs',
        },
      ],
    });
    assert.equal(bill.syncStatus, 'pending');

    // Re-submitting the same bill ID from an offline queue is idempotent (no duplicate stock deduction)
    db.createOwnerBill(owner.email, bill);
    const wsAfterRetry = db.getOwnerWorkspace(owner.email);
    assert.equal(wsAfterRetry?.items[0].stock, 8);

    const pendingBefore = db.getPendingSyncForOwner(owner.email);
    assert.ok(pendingBefore);
    assert.equal(pendingBefore.items.length, 1);
    assert.equal(pendingBefore.bills.length, 1);
    assert.equal(pendingBefore.bills[0].id, 'bill_sync_1');

    const marked = db.markOwnerRecordsSynced(owner.email, {
      itemIds: ['item_sync_1'],
      billIds: ['bill_sync_1'],
    });
    assert.equal(marked.syncedItems, 1);
    assert.equal(marked.syncedBills, 1);

    const pendingAfter = db.getPendingSyncForOwner(owner.email);
    assert.ok(pendingAfter);
    assert.equal(pendingAfter.items.length, 0);
    assert.equal(pendingAfter.bills.length, 0);

    const wsAfterSync = db.getOwnerWorkspace(owner.email);
    assert.equal(wsAfterSync?.bills[0].syncStatus, 'synced');
    assert.ok(wsAfterSync?.bills[0].syncedAt);
  } finally {
    db.close();
  }
});

test('verifies registered vs unregistered Gmail, isolates session tokens, and manages admin sessions', () => {
  const db = openShopBillDatabase(':memory:');
  try {
    db.registerShop({
      shopId: 'SB-9201',
      shopName: 'Owner One Store',
      ownerName: 'One Owner',
      email: 'owner.one@gmail.com',
      phone: '9800001111',
      address: 'Street 1',
      pin: '1122',
    });
    db.registerShop({
      shopId: 'SB-9202',
      shopName: 'Owner Two Store',
      ownerName: 'Two Owner',
      email: 'owner.two@gmail.com',
      phone: '9800002222',
      address: 'Street 2',
      pin: '3344',
    });

    const badFormat = db.verifyOwnerEmail('not-an-email');
    assert.equal(badFormat.validFormat, false);
    assert.equal(badFormat.registered, false);

    const unregistered = db.verifyOwnerEmail('stranger@gmail.com');
    assert.equal(unregistered.validFormat, true);
    assert.equal(unregistered.registered, false);

    const registered = db.verifyOwnerEmail('OWNER.ONE@gmail.com ');
    assert.equal(registered.registered, true);
    assert.equal(registered.isActive, true);
    assert.equal(registered.shopId, 'SB-9201');

    const crossEmailAttempt = db.verifyShopLogin('SB-9202', '3344', 'owner.one@gmail.com');
    assert.equal(crossEmailAttempt.success, false);
    assert.match(crossEmailAttempt.error || '', /does not match Shop ID/);

    const ok = db.verifyShopLogin('SB-9201', '1122', 'owner.one@gmail.com');
    assert.equal(ok.success, true);

    const tokenOne = db.createOwnerSession('owner.one@gmail.com');
    assert.equal(db.validateOwnerSessionToken(tokenOne, 'owner.one@gmail.com'), true);
    assert.equal(db.validateOwnerSessionToken(tokenOne, 'owner.two@gmail.com'), false);

    db.revokeOwnerSession(tokenOne);
    assert.equal(db.validateOwnerSessionToken(tokenOne, 'owner.one@gmail.com'), false);

    const adminToken = db.createAdminSession('shivamraj.in5@gmail.com', 'adm_1');
    const adminCtx = db.validateAdminSessionToken(adminToken);
    assert.equal(adminCtx?.email, 'shivamraj.in5@gmail.com');
    db.revokeAdminSession(adminToken);
    assert.equal(db.validateAdminSessionToken(adminToken), null);
  } finally {
    db.close();
  }
});

test('records audit logs and supports validated backup export & restore', () => {
  const db = openShopBillDatabase(':memory:');
  try {
    const owner = db.registerShop({
      shopId: 'SB-9401',
      shopName: 'Backup Mart',
      ownerName: 'Backup Owner',
      email: 'backup@mart.in',
      phone: '9876500001',
      address: 'Market Ave',
      pin: '1212',
    });

    db.saveOwnerItem(owner.email, {
      id: 'item_b1',
      name: 'Coffee Beans',
      code: 'CB1',
      price: 400,
      stock: 15,
      category: 'Beverages',
      unit: 'kg',
    });

    const bundle = db.exportShopBackup(owner.email, owner.email, 'sqlite');
    assert.equal(bundle.shop.shopId, 'SB-9401');
    assert.equal(bundle.items.length, 1);

    // Mutate workspace: add extra item & delete old item
    db.deleteOwnerItem(owner.email, 'item_b1');
    db.saveOwnerItem(owner.email, {
      id: 'item_extra',
      name: 'Temp Item',
      code: 'TMP',
      price: 10,
      stock: 1,
      category: 'General',
      unit: 'pcs',
    });
    assert.equal(db.getOwnerWorkspace(owner.email)?.items[0].id, 'item_extra');

    // Tampered checksum rejected
    assert.throws(
      () => db.restoreShopBackup(owner.email, { ...bundle, checksum: 'deadbeef' }, owner.email),
      DbValidationError
    );

    // Valid restore reverts workspace cleanly
    const restored = db.restoreShopBackup(owner.email, bundle, owner.email);
    assert.equal(restored.restoredItems, 1);
    assert.equal(restored.workspace.items.length, 1);
    assert.equal(restored.workspace.items[0].id, 'item_b1');

    const history = db.listBackupHistory(owner.email);
    assert.ok(history.length >= 1);

    const logs = db.listAuditLogsForShop(owner.email, 50);
    assert.ok(logs.some((l) => l.action === 'backup_created'));
    assert.ok(logs.some((l) => l.action === 'backup_restored'));

    // Keep unused import sanity check
    assert.equal(hashPinSha256('1234').length, 64);
  } finally {
    db.close();
  }
});

test('upsertShopFromVerifiedCloud syncs updated PIN hash and mergeCloudDataForOwner pulls bills without wiping offline bills', () => {
  const db = openShopBillDatabase(':memory:');
  try {
    // 1. Simulate fresh device B with default SB-1001 PIN '1234'
    const beforeLogin = db.verifyShopLogin('SB-1001', '5678', 'rajesh@quickmart.in');
    assert.equal(beforeLogin.success, false);

    // 2. Simulate cloud shop having a newer updatedAt and bcrypt hash for PIN '5678'
    const newHash = hashPinSha256('5678');
    const syncedShop = db.upsertShopFromVerifiedCloud({
      shopId: 'SB-1001',
      email: 'rajesh@quickmart.in',
      shopName: 'QuickMart Store',
      ownerName: 'Rajesh Sharma',
      pinHash: newHash,
      updatedAt: new Date(Date.now() + 60_000).toISOString(),
    });
    assert.ok(syncedShop);

    // Device B can now log in with updated PIN '5678'
    const afterLogin = db.verifyShopLogin('SB-1001', '5678', 'rajesh@quickmart.in');
    assert.equal(afterLogin.success, true);

    // 3. Device B has an offline pending bill; cloud has a new bill created on Phone
    db.createOwnerBill('rajesh@quickmart.in', {
      id: 'b_local_pending',
      billNumber: 'SB-2001',
      createdAt: new Date().toISOString(),
      customerName: '',
      customerPhone: '',
      subtotal: 50,
      discountAmount: 0,
      taxAmount: 0,
      grandTotal: 50,
      paymentMethod: 'Cash',
      cashierName: 'Laptop',
      items: [{ itemId: 'i1', name: 'Basmati Rice', code: 'BR101', unitPrice: 50, quantity: 1, unit: 'kg' }],
    });

    const merged = db.mergeCloudDataForOwner('rajesh@quickmart.in', {
      bills: [
        {
          id: 'b_from_phone',
          billNumber: 'SB-2002',
          createdAt: new Date().toISOString(),
          subtotal: 120,
          discountAmount: 0,
          taxAmount: 0,
          grandTotal: 120,
          paymentMethod: 'UPI',
          cashierName: 'Phone',
          items: [{ itemId: 'i1', name: 'Basmati Rice', code: 'BR101', unitPrice: 120, quantity: 1, unit: 'kg' }],
        },
      ],
      items: [
        {
          id: 'i_cloud_new',
          name: 'Cloud Masala',
          code: 'CM1',
          price: 85,
          stock: 10,
          category: 'Spices',
          unit: 'pcs',
          updatedAt: new Date().toISOString(),
        },
      ],
    });

    assert.equal(merged.addedBills, 1);
    assert.equal(merged.addedItems, 1);
    assert.ok(merged.workspace.bills.some((b) => b.id === 'b_from_phone' && b.syncStatus === 'synced'));
    assert.ok(merged.workspace.bills.some((b) => b.id === 'b_local_pending' && b.syncStatus === 'pending'));
    assert.ok(merged.workspace.items.some((i) => i.id === 'i_cloud_new'));
  } finally {
    db.close();
  }
});

test('newly registered shop on Laptop syncs to fresh Phone SQLite DB via upsertShopFromVerifiedCloud and logs in immediately', () => {
  const laptopDb = openShopBillDatabase(':memory:');
  const phoneDb = openShopBillDatabase(':memory:');
  try {
    // Register brand new shop on Laptop using shivamraj.in5@gmail.com
    const laptopShop = laptopDb.registerShop({
      shopId: 'SB-1009',
      shopName: 'Shivam Super Mart',
      ownerName: 'Shivam Raj',
      email: 'shivamraj.in5@gmail.com',
      phone: '9876500001',
      address: 'Patna Main Road',
      pin: '4321',
    });
    assert.equal(laptopDb.verifyShopLogin('SB-1009', '4321', 'shivamraj.in5@gmail.com').success, true);

    // Phone DB initially does not have shivamraj.in5@gmail.com
    assert.equal(phoneDb.verifyOwnerEmail('shivamraj.in5@gmail.com').registered, false);

    // Phone pulls shop from Cloud Firestore
    const syncedToPhone = phoneDb.upsertShopFromVerifiedCloud({
      shopId: laptopShop.shopId,
      email: laptopShop.email,
      emailKey: laptopShop.emailKey,
      shopName: laptopShop.shopName,
      ownerName: laptopShop.ownerName,
      phone: laptopShop.phone,
      address: laptopShop.address,
      pinHash: laptopShop.pinHash,
      status: laptopShop.status,
      isActive: laptopShop.isActive,
      createdAt: laptopShop.createdAt,
      updatedAt: laptopShop.updatedAt,
    });
    assert.ok(syncedToPhone);

    const emailCheckOnPhone = phoneDb.verifyOwnerEmail('shivamraj.in5@gmail.com');
    assert.equal(emailCheckOnPhone.registered, true);
    assert.equal(emailCheckOnPhone.shopId, 'SB-1009');

    const loginOnPhone = phoneDb.verifyShopLogin('SB-1009', '4321', 'shivamraj.in5@gmail.com');
    assert.equal(loginOnPhone.success, true);
    assert.equal(loginOnPhone.shop?.shopName, 'Shivam Super Mart');
  } finally {
    laptopDb.close();
    phoneDb.close();
  }
});


