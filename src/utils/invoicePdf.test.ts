import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInvoiceDocumentModel,
  buildInvoiceQrPayload,
  createInvoicePdfBlob,
  formatInvoiceQty,
  type PrintableBill,
  type PrintableShopProfile,
} from './invoicePdf';

const sampleShop: PrintableShopProfile = {
  shopId: 'SB-1001',
  name: 'QuickMart Store',
  tagline: 'Fresh Daily',
  phone: '9876543210',
  address: 'Shop 12, Plaza',
  gstin: '27ABCDE1234F1Z5',
  taxRatePercent: 5,
  currencySymbol: '₹',
};

const sampleBill: PrintableBill = {
  id: 'bill_99',
  billNumber: 'SB-2055',
  createdAt: '2026-11-13T10:30:00.000Z',
  customerName: 'Anil',
  subtotal: 240,
  discountAmount: 20,
  taxAmount: 11,
  grandTotal: 231,
  paymentMethod: 'UPI',
  cashierName: 'Sunil',
  items: [
    { itemId: 'i1', name: 'Basmati Rice', unitPrice: 120, quantity: 0.5, unit: 'kg' },
    { itemId: 'i2', name: 'Milk', unitPrice: 60, quantity: 3, unit: 'pcs' },
  ],
};

test('builds A4 and Thermal invoice models and QR payload accurately', () => {
  assert.equal(formatInvoiceQty(0.5, 'kg'), '500 g');
  assert.equal(formatInvoiceQty(2, 'pcs'), '2 pcs');

  const model = buildInvoiceDocumentModel(sampleBill, sampleShop, 'thermal');
  assert.equal(model.fileName, 'Invoice_SB-2055_thermal.pdf');
  assert.equal(model.totals.grandTotal, '₹231.00');
  assert.equal(model.lines[0].qtyDisplay, '500 g');

  const qr = JSON.parse(buildInvoiceQrPayload(sampleBill, sampleShop));
  assert.equal(qr.shopId, 'SB-1001');
  assert.equal(qr.billNo, 'SB-2055');
  assert.equal(qr.total, 231);
});

test('generates real PDF blobs for both A4 and Thermal formats with QR code', async () => {
  const a4 = await createInvoicePdfBlob(sampleBill, sampleShop, { format: 'a4', includeQr: true });
  assert.equal(a4.fileName, 'Invoice_SB-2055_a4.pdf');
  assert.ok(a4.blob.size > 1000);

  const thermal = await createInvoicePdfBlob(sampleBill, sampleShop, { format: 'thermal', includeQr: true });
  assert.equal(thermal.fileName, 'Invoice_SB-2055_thermal.pdf');
  assert.ok(thermal.blob.size > 1000);
});
