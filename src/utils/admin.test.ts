import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVELOPER_ADMIN_PASSWORD,
  verifyDeveloperPassword,
  registerShopOwner,
  updateShopOwner,
  toggleShopOwnerStatus,
  deleteShopOwner,
  loginWithShopIdAndPin,
  ShopOwnerRecord,
} from './admin';

test('verifyDeveloperPassword strictly enforces adminshiv.developer9142', () => {
  assert.equal(DEVELOPER_ADMIN_PASSWORD, 'adminshiv.developer9142');
  assert.equal(verifyDeveloperPassword('adminshiv.developer9142'), true);
  assert.equal(verifyDeveloperPassword(' adminshiv.developer9142 '), true); // trims whitespace
  assert.equal(verifyDeveloperPassword('wrongpass'), false);
  assert.equal(verifyDeveloperPassword('admin'), false);
  assert.equal(verifyDeveloperPassword(''), false);
});

test('registerShopOwner adds a new shop owner with active status and proper credentials', () => {
  const initial: ShopOwnerRecord[] = [
    {
      id: 'so_1',
      shopId: 'SB-1001',
      ownerName: 'Rajesh Sharma',
      email: 'rajesh@quickmart.in',
      phone: '9876543210',
      pin: '1234',
      shopName: 'QuickMart Store',
      address: 'Main Market',
      registeredAt: '2026-10-01T10:00:00Z',
      isActive: true,
      totalBillsCount: 10,
      totalRevenue: 5000,
    },
  ];

  const result = registerShopOwner(initial, {
    ownerName: 'Vikram Mehta',
    email: 'vikram@mehtagrocery.in',
    phone: '9811122233',
    pin: '9090',
    shopName: 'Mehta Super Grocery',
    address: 'Sector 15, Galleria',
    gstin: '07AAAAA1234A1Z5',
  });

  assert.equal(result.owners.length, 2);
  assert.equal(result.newOwner.ownerName, 'Vikram Mehta');
  assert.equal(result.newOwner.shopName, 'Mehta Super Grocery');
  assert.equal(result.newOwner.pin, '9090');
  assert.ok(result.newOwner.shopId.startsWith('SB-'));
  assert.equal(result.newOwner.isActive, true);
  assert.equal(result.newOwner.totalBillsCount, 0);
  assert.equal(result.newOwner.totalRevenue, 0);
  assert.equal(result.owners[0].id, result.newOwner.id);
});

test('loginWithShopIdAndPin authenticates active shops and blocks inactive shops', () => {
  const shops: ShopOwnerRecord[] = [
    {
      id: 'so_1',
      shopId: 'SB-1001',
      ownerName: 'Rajesh Sharma',
      email: 'rajesh@quickmart.in',
      phone: '9876543210',
      pin: '1234',
      shopName: 'QuickMart Store',
      address: 'Main Market',
      registeredAt: '2026-10-01T10:00:00Z',
      isActive: true,
      totalBillsCount: 10,
      totalRevenue: 5000,
    },
    {
      id: 'so_2',
      shopId: 'SB-1002',
      ownerName: 'Sunita Rao',
      email: 'sunita@freshdaily.in',
      phone: '9845012345',
      pin: '4321',
      shopName: 'FreshDaily Mart',
      address: 'MG Road, Bangalore',
      registeredAt: '2026-10-05T10:00:00Z',
      isActive: false, // suspended
      totalBillsCount: 2,
      totalRevenue: 850,
    },
  ];

  // Success
  const res1 = loginWithShopIdAndPin(shops, 'SB-1001', '1234');
  assert.equal(res1.success, true);
  assert.equal(res1.shop?.shopName, 'QuickMart Store');

  // Case insensitive shop id with whitespace
  const resCase = loginWithShopIdAndPin(shops, '  sb-1001  ', '1234');
  assert.equal(resCase.success, true);

  // Wrong PIN
  const resWrongPin = loginWithShopIdAndPin(shops, 'SB-1001', '9999');
  assert.equal(resWrongPin.success, false);
  assert.ok(resWrongPin.error?.includes('PIN'));

  // Suspended shop
  const resSuspended = loginWithShopIdAndPin(shops, 'SB-1002', '4321');
  assert.equal(resSuspended.success, false);
  assert.ok(resSuspended.error?.includes('suspended'));

  // Non-existent shop
  const resNotFound = loginWithShopIdAndPin(shops, 'SB-9999', '1234');
  assert.equal(resNotFound.success, false);
  assert.ok(resNotFound.error?.includes('not found'));
});

test('updateShopOwner and toggleShopOwnerStatus correctly modify shop owner records', () => {
  const initial: ShopOwnerRecord[] = [
    {
      id: 'so_1',
      shopId: 'SB-1001',
      ownerName: 'Rajesh Sharma',
      email: 'rajesh@quickmart.in',
      phone: '9876543210',
      pin: '1234',
      shopName: 'QuickMart Store',
      address: 'Main Market',
      registeredAt: '2026-10-01T10:00:00Z',
      isActive: true,
      totalBillsCount: 10,
      totalRevenue: 5000,
    },
  ];

  // Toggle active -> suspended
  const toggled = toggleShopOwnerStatus(initial, 'so_1');
  assert.equal(toggled[0].isActive, false);

  // Toggle suspended -> active
  const reactivated = toggleShopOwnerStatus(toggled, 'so_1');
  assert.equal(reactivated[0].isActive, true);

  // Update PIN & Phone
  const updated = updateShopOwner(reactivated, {
    id: 'so_1',
    pin: '9999',
    phone: '9999988888',
  });
  assert.equal(updated[0].pin, '9999');
  assert.equal(updated[0].phone, '9999988888');
  assert.equal(updated[0].ownerName, 'Rajesh Sharma'); // unchanged
});

test('deleteShopOwner removes the shop owner record', () => {
  const initial: ShopOwnerRecord[] = [
    {
      id: 'so_1',
      shopId: 'SB-1001',
      ownerName: 'Rajesh Sharma',
      email: 'rajesh@quickmart.in',
      phone: '9876543210',
      pin: '1234',
      shopName: 'QuickMart Store',
      address: 'Main Market',
      registeredAt: '2026-10-01T10:00:00Z',
      isActive: true,
      totalBillsCount: 10,
      totalRevenue: 5000,
    },
  ];

  const remaining = deleteShopOwner(initial, 'so_1');
  assert.equal(remaining.length, 0);
});

