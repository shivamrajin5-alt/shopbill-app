import test from 'node:test';
import assert from 'node:assert/strict';
import { computeBackupSummarySignature, validateBackupBundle, type ShopBackupBundle } from './backupRestore';

test('validateBackupBundle validates checksum, shop match, and rejects tampered backups', () => {
  const base: Omit<ShopBackupBundle, 'checksum'> = {
    backupVersion: 1,
    exportedAt: '2026-11-13T12:00:00.000Z',
    source: 'sqlite',
    shop: {
      shopId: 'SB-1001',
      shopName: 'QuickMart Store',
      ownerName: 'Rajesh Sharma',
      ownerEmail: 'rajesh@quickmart.in',
      phone: '9876543210',
      address: 'Market Road',
    },
    items: [
      {
        id: 'i1',
        name: 'Rice',
        code: 'R1',
        price: 100,
        stock: 20,
        category: 'Groceries',
        unit: 'kg',
      },
    ],
    bills: [
      {
        id: 'b1',
        billNumber: 'SB-1001',
        createdAt: '2026-11-13T11:00:00.000Z',
        subtotal: 200,
        discountAmount: 0,
        taxAmount: 0,
        grandTotal: 200,
        paymentMethod: 'Cash',
        cashierName: 'Rajesh Sharma',
        items: [
          {
            itemId: 'i1',
            name: 'Rice',
            code: 'R1',
            unitPrice: 100,
            quantity: 2,
            unit: 'kg',
          },
        ],
      },
    ],
    employees: [],
  };

  const signed: ShopBackupBundle = {
    ...base,
    checksum: computeBackupSummarySignature(base),
  };

  const ok = validateBackupBundle(signed, 'SB-1001');
  assert.equal(ok.valid, true);
  assert.equal(ok.errors.length, 0);

  // Wrong shop rejected
  const wrongShop = validateBackupBundle(signed, 'SB-9999');
  assert.equal(wrongShop.valid, false);
  assert.match(wrongShop.errors[0], /does not match/);

  // Tampered grand total fails checksum
  const tampered = JSON.parse(JSON.stringify(signed)) as ShopBackupBundle;
  tampered.bills[0].grandTotal = 999999;
  const tamperedCheck = validateBackupBundle(tampered, 'SB-1001');
  assert.equal(tamperedCheck.valid, false);
  assert.match(tamperedCheck.errors[0], /checksum mismatch/i);
});
