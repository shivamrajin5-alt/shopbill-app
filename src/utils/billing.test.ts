import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBill,
  filterBillsByDateRange,
  generateReport,
  CartItem,
  StoredBill,
} from './billing';

test('calculateBill computes subtotal, fixed discount, and NO tax when GST is disabled', () => {
  const items: CartItem[] = [
    { id: '1', name: 'Basmati Rice', unitPrice: 120, quantity: 2 }, // 240
    { id: '2', name: 'Refined Oil 1L', unitPrice: 160, quantity: 1 }, // 160
  ]; // subtotal = 400

  // 50 fixed discount, GST disabled (default)
  const res = calculateBill(items, { type: 'fixed', value: 50 }, 5, false);
  assert.equal(res.subtotal, 400);
  assert.equal(res.discountAmount, 50);
  assert.equal(res.taxableAmount, 350);
  assert.equal(res.taxAmount, 0);
  assert.equal(res.grandTotal, 350); // No GST added!
});

test('calculateBill computes GST only when applyTax is true', () => {
  const items: CartItem[] = [
    { id: '1', name: 'Tea 500g', unitPrice: 200, quantity: 1 },
  ];

  // 10% discount, 18% tax, applyTax = true
  const res = calculateBill(items, { type: 'percentage', value: 10 }, 18, true);
  assert.equal(res.subtotal, 200);
  assert.equal(res.discountAmount, 20);
  assert.equal(res.taxableAmount, 180);
  assert.equal(res.taxAmount, 32.4);
  assert.equal(res.grandTotal, 212.4);
});

test('calculateBill handles weight based items (kg/g) accurately', () => {
  const items: CartItem[] = [
    { id: '1', name: 'Basmati Rice', unitPrice: 120, quantity: 1.5, unit: 'kg' }, // 180
    { id: '2', name: 'Sugar', unitPrice: 48, quantity: 0.5, unit: 'kg' },          // 24 (500g)
    { id: '3', name: 'Detergent', unitPrice: 140, quantity: 0.25, unit: 'kg' },    // 35 (250g)
  ]; // subtotal = 239

  // Default: no GST
  const resNoGst = calculateBill(items, { type: 'fixed', value: 0 }, 5, false);
  assert.equal(resNoGst.subtotal, 239);
  assert.equal(resNoGst.taxAmount, 0);
  assert.equal(resNoGst.grandTotal, 239);

  // When user enables GST:
  const resWithGst = calculateBill(items, { type: 'fixed', value: 0 }, 5, true);
  assert.equal(resWithGst.subtotal, 239);
  assert.equal(resWithGst.taxAmount, 11.95);
  assert.equal(resWithGst.grandTotal, 250.95);
});

test('generateReport summarizes totals and payment breakdown correctly', () => {
  const bills: StoredBill[] = [
    {
      id: 'b1',
      billNumber: 'BILL-001',
      createdAt: '2026-11-10T10:00:00Z',
      items: [
        { id: '1', name: 'Tea 500g', unitPrice: 200, quantity: 2 },
      ],
      subtotal: 400,
      discountAmount: 20,
      taxAmount: 19,
      grandTotal: 399,
      paymentMethod: 'UPI',
      cashierName: 'Owner',
    },
    {
      id: 'b2',
      billNumber: 'BILL-002',
      createdAt: '2026-11-10T11:00:00Z',
      items: [
        { id: '1', name: 'Tea 500g', unitPrice: 200, quantity: 1 },
        { id: '2', name: 'Sugar 1kg', unitPrice: 45, quantity: 3 },
      ],
      subtotal: 335,
      discountAmount: 0,
      taxAmount: 16.75,
      grandTotal: 351.75,
      paymentMethod: 'Cash',
      cashierName: 'Employee',
    },
  ];

  const report = generateReport(bills);
  assert.equal(report.totalBills, 2);
  assert.equal(report.totalSales, 750.75);
  assert.equal(report.totalItemsSold, 6);
  assert.equal(report.totalDiscount, 20);
  assert.equal(report.paymentBreakdown.UPI, 399);
  assert.equal(report.paymentBreakdown.Cash, 351.75);
  assert.equal(report.topSellingItems[0].name, 'Tea 500g'); // 3 quantity, $600 revenue
  assert.equal(report.topSellingItems[0].quantity, 3);
  assert.equal(report.topSellingItems[1].name, 'Sugar 1kg'); // 3 quantity, $135 revenue
});

test('filterBillsByDateRange filters daily bills correctly', () => {
  const refDate = new Date('2026-11-10T12:00:00Z');
  const bills: StoredBill[] = [
    {
      id: 'b1',
      billNumber: 'BILL-001',
      createdAt: '2026-11-10T09:00:00Z',
      items: [],
      subtotal: 100,
      discountAmount: 0,
      taxAmount: 5,
      grandTotal: 105,
      paymentMethod: 'Cash',
      cashierName: 'Cashier',
    },
    {
      id: 'b2',
      billNumber: 'BILL-002',
      createdAt: '2026-11-05T09:00:00Z',
      items: [],
      subtotal: 100,
      discountAmount: 0,
      taxAmount: 5,
      grandTotal: 105,
      paymentMethod: 'Cash',
      cashierName: 'Cashier',
    },
  ];

  const filtered = filterBillsByDateRange(bills, 'daily', undefined, undefined, refDate);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, 'b1');
});
