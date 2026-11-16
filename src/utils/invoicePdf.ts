import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';

export type InvoicePrintFormat = 'a4' | 'thermal';

export interface PrintableBillLine {
  itemId: string;
  name: string;
  code?: string;
  unitPrice: number;
  quantity: number;
  unit: 'pcs' | 'kg';
}

export interface PrintableBill {
  id: string;
  billNumber: string;
  createdAt: string;
  items: PrintableBillLine[];
  customerName?: string;
  customerPhone?: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  grandTotal: number;
  paymentMethod: 'Cash' | 'UPI' | 'Card' | 'Other';
  cashierName: string;
}

export interface PrintableShopProfile {
  shopId?: string;
  name: string;
  tagline?: string;
  phone: string;
  address: string;
  gstin?: string;
  taxRatePercent: number;
  currencySymbol: string;
}

export function formatInvoiceQty(quantity: number, unit: 'pcs' | 'kg' = 'pcs'): string {
  if (unit === 'kg') {
    if (quantity < 1 && quantity > 0) {
      return `${Math.round(quantity * 1000)} g`;
    }
    return `${Number(quantity.toFixed(3))} kg`;
  }
  return `${Number(quantity.toFixed(2))} pcs`;
}

export function buildInvoiceQrPayload(
  bill: PrintableBill,
  shop: PrintableShopProfile
): string {
  const payload = {
    app: 'BillKart',
    shopId: shop.shopId || 'SB',
    shop: shop.name,
    gstin: shop.gstin || '',
    billId: bill.id,
    billNo: bill.billNumber,
    date: bill.createdAt,
    total: Number(bill.grandTotal.toFixed(2)),
    method: bill.paymentMethod,
  };
  return JSON.stringify(payload);
}

export function buildInvoiceDocumentModel(
  bill: PrintableBill,
  shop: PrintableShopProfile,
  format: InvoicePrintFormat
) {
  const curr = shop.currencySymbol || '₹';
  const formatAmt = (val: number) => `${curr}${Number(val || 0).toFixed(2)}`;

  return {
    format,
    fileName: `Invoice_${bill.billNumber.replace(/[^a-zA-Z0-9_-]/g, '_')}_${format}.pdf`,
    header: {
      shopName: shop.name.toUpperCase(),
      tagline: shop.tagline || '',
      address: shop.address,
      phone: shop.phone,
      gstin: shop.gstin || '',
    },
    meta: {
      billId: bill.id,
      billNumber: bill.billNumber,
      dateFormatted: new Date(bill.createdAt).toLocaleString(),
      cashierName: bill.cashierName,
      paymentMethod: bill.paymentMethod,
      customerName: bill.customerName || 'Walk-in Customer',
      customerPhone: bill.customerPhone || '',
    },
    lines: bill.items.map((item) => ({
      name: item.name,
      qtyDisplay: formatInvoiceQty(item.quantity, item.unit),
      rateDisplay: formatAmt(item.unitPrice),
      totalDisplay: formatAmt(item.unitPrice * item.quantity),
    })),
    totals: {
      subtotal: formatAmt(bill.subtotal),
      discount: bill.discountAmount > 0 ? formatAmt(bill.discountAmount) : null,
      taxLabel: `GST (${shop.taxRatePercent}%)`,
      tax: bill.taxAmount > 0 ? formatAmt(bill.taxAmount) : formatAmt(0),
      grandTotal: formatAmt(bill.grandTotal),
    },
  };
}

export async function generateInvoiceQrDataUrl(
  bill: PrintableBill,
  shop: PrintableShopProfile
): Promise<string> {
  const qrText = buildInvoiceQrPayload(bill, shop);
  return await QRCode.toDataURL(qrText, { width: 160, margin: 1 });
}

export async function createInvoicePdfBlob(
  bill: PrintableBill,
  shop: PrintableShopProfile,
  options: { format: InvoicePrintFormat; includeQr?: boolean }
): Promise<{ blob: Blob; fileName: string }> {
  const model = buildInvoiceDocumentModel(bill, shop, options.format);
  const qrDataUrl = options.includeQr ? await generateInvoiceQrDataUrl(bill, shop) : null;

  if (options.format === 'thermal') {
    const estHeight = Math.max(150, 95 + model.lines.length * 8 + (qrDataUrl ? 34 : 0));
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [80, estHeight],
    });

    let y = 8;
    const centerX = 40;
    doc.setFont('courier', 'bold');
    doc.setFontSize(11);
    doc.text(model.header.shopName.slice(0, 28), centerX, y, { align: 'center' });
    y += 4.5;

    doc.setFont('courier', 'normal');
    doc.setFontSize(7.5);
    if (model.header.tagline) {
      doc.text(model.header.tagline.slice(0, 38), centerX, y, { align: 'center' });
      y += 3.8;
    }
    const addrLines = doc.splitTextToSize(model.header.address, 70);
    doc.text(addrLines, centerX, y, { align: 'center' });
    y += addrLines.length * 3.5;
    doc.text(`Ph: ${model.header.phone}`, centerX, y, { align: 'center' });
    y += 3.8;
    if (model.header.gstin) {
      doc.setFont('courier', 'bold');
      doc.text(`GSTIN: ${model.header.gstin}`, centerX, y, { align: 'center' });
      y += 4;
    }

    doc.setFont('courier', 'normal');
    doc.text('------------------------------------------', 4, y);
    y += 4;
    doc.text(`Bill#: ${model.meta.billNumber} (${model.meta.paymentMethod})`, 4, y);
    y += 3.8;
    doc.text(`ID: ${model.meta.billId}`, 4, y);
    y += 3.8;
    doc.text(`Date: ${model.meta.dateFormatted}`, 4, y);
    y += 3.8;
    doc.text(`Cashier: ${model.meta.cashierName}`, 4, y);
    y += 3.8;
    doc.text(`Customer: ${model.meta.customerName}`, 4, y);
    y += 4;
    doc.text('------------------------------------------', 4, y);
    y += 4;

    doc.setFont('courier', 'bold');
    doc.text('ITEM               QTY      TOTAL', 4, y);
    y += 3.8;
    doc.setFont('courier', 'normal');
    for (const line of model.lines) {
      const name = line.name.slice(0, 18).padEnd(18, ' ');
      const qty = line.qtyDisplay.padStart(7, ' ');
      const tot = line.totalDisplay.padStart(10, ' ');
      doc.text(`${name} ${qty} ${tot}`, 4, y);
      y += 4.2;
    }

    doc.text('------------------------------------------', 4, y);
    y += 4;
    doc.text(`Subtotal: ${model.totals.subtotal}`, 76, y, { align: 'right' });
    y += 3.8;
    if (model.totals.discount) {
      doc.text(`Discount: -${model.totals.discount}`, 76, y, { align: 'right' });
      y += 3.8;
    }
    doc.text(`${model.totals.taxLabel}: ${model.totals.tax}`, 76, y, { align: 'right' });
    y += 4.5;

    doc.setFont('courier', 'bold');
    doc.setFontSize(9.5);
    doc.text(`GRAND TOTAL: ${model.totals.grandTotal}`, 76, y, { align: 'right' });
    y += 6;

    if (qrDataUrl) {
      doc.addImage(qrDataUrl, 'PNG', 28, y, 24, 24);
      y += 27;
    }

    doc.setFont('courier', 'normal');
    doc.setFontSize(7.5);
    doc.text('Thank you for shopping with us!', centerX, y, { align: 'center' });

    return { blob: doc.output('blob'), fileName: model.fileName };
  }

  // Standard A4 Tax Invoice
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  let y = 18;
  doc.setFillColor(6, 95, 70);
  doc.rect(14, 12, 182, 26, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(model.header.shopName, 20, y + 2);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  if (model.header.tagline) {
    doc.text(model.header.tagline, 20, y + 8);
  }
  doc.text(`TAX INVOICE`, 190, y + 2, { align: 'right' });
  doc.text(`Bill No: ${model.meta.billNumber}`, 190, y + 8, { align: 'right' });
  doc.text(`Bill ID: ${model.meta.billId}`, 190, y + 13, { align: 'right' });

  doc.setTextColor(30, 41, 59);
  y = 46;
  doc.setFontSize(9.5);
  doc.text(`Address: ${model.header.address}`, 14, y);
  doc.text(`Date: ${model.meta.dateFormatted}`, 196, y, { align: 'right' });
  y += 5.5;
  doc.text(`Phone: ${model.header.phone}${model.header.gstin ? `  |  GSTIN: ${model.header.gstin}` : ''}`, 14, y);
  doc.text(`Payment Mode: ${model.meta.paymentMethod}`, 196, y, { align: 'right' });
  y += 5.5;
  doc.text(`Customer: ${model.meta.customerName}${model.meta.customerPhone ? ` (${model.meta.customerPhone})` : ''}`, 14, y);
  doc.text(`Cashier: ${model.meta.cashierName}`, 196, y, { align: 'right' });

  y += 10;
  doc.setFillColor(241, 245, 249);
  doc.rect(14, y - 5, 182, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('#', 17, y);
  doc.text('ITEM DESCRIPTION', 26, y);
  doc.text('QTY / WT', 118, y, { align: 'right' });
  doc.text('RATE', 152, y, { align: 'right' });
  doc.text('AMOUNT', 192, y, { align: 'right' });

  y += 7;
  doc.setFont('helvetica', 'normal');
  model.lines.forEach((line, idx) => {
    if (y > 255) {
      doc.addPage();
      y = 20;
    }
    doc.text(String(idx + 1), 17, y);
    doc.text(line.name.slice(0, 48), 26, y);
    doc.text(line.qtyDisplay, 118, y, { align: 'right' });
    doc.text(line.rateDisplay, 152, y, { align: 'right' });
    doc.text(line.totalDisplay, 192, y, { align: 'right' });
    doc.setDrawColor(226, 232, 240);
    doc.line(14, y + 2.2, 196, y + 2.2);
    y += 7;
  });

  y += 5;
  doc.setFontSize(10);
  doc.text('Subtotal:', 152, y, { align: 'right' });
  doc.text(model.totals.subtotal, 192, y, { align: 'right' });
  y += 6;
  if (model.totals.discount) {
    doc.setTextColor(220, 38, 38);
    doc.text('Discount:', 152, y, { align: 'right' });
    doc.text(`- ${model.totals.discount}`, 192, y, { align: 'right' });
    doc.setTextColor(30, 41, 59);
    y += 6;
  }
  doc.text(`${model.totals.taxLabel}:`, 152, y, { align: 'right' });
  doc.text(model.totals.tax, 192, y, { align: 'right' });
  y += 7;
  doc.setDrawColor(15, 23, 42);
  doc.line(125, y - 3, 196, y - 3);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(6, 95, 70);
  doc.text('GRAND TOTAL:', 152, y + 2, { align: 'right' });
  doc.text(model.totals.grandTotal, 192, y + 2, { align: 'right' });

  if (qrDataUrl) {
    doc.addImage(qrDataUrl, 'PNG', 16, Math.max(y - 10, 120), 28, 28);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('Scan QR to verify invoice', 16, Math.max(y + 22, 152));
  }

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text('Thank you for your business! Generated by BillKart.', 105, 282, { align: 'center' });

  return { blob: doc.output('blob'), fileName: model.fileName };
}

export async function downloadInvoicePdf(
  bill: PrintableBill,
  shop: PrintableShopProfile,
  options: { format: InvoicePrintFormat; includeQr?: boolean }
): Promise<string> {
  const { blob, fileName } = await createInvoicePdfBlob(bill, shop, options);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return fileName;
}

export async function printInvoiceReceipt(
  bill: PrintableBill,
  shop: PrintableShopProfile,
  options: { format: InvoicePrintFormat; includeQr?: boolean }
): Promise<void> {
  const model = buildInvoiceDocumentModel(bill, shop, options.format);
  const qrDataUrl = options.includeQr ? await generateInvoiceQrDataUrl(bill, shop) : null;
  const pageRule =
    options.format === 'thermal'
      ? '@page { size: 80mm auto; margin: 4mm; }'
      : '@page { size: A4; margin: 14mm; }';

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${model.fileName}</title>
  <style>
    ${pageRule}
    body { font-family: ${options.format === 'thermal' ? "'Courier New', monospace" : 'system-ui, -apple-system, sans-serif'}; color: #0f172a; margin: 0; padding: ${options.format === 'thermal' ? '4px' : '16px'}; font-size: ${options.format === 'thermal' ? '11px' : '13px'}; }
    .hdr { text-align: center; border-bottom: 1px dashed #64748b; padding-bottom: 8px; margin-bottom: 8px; }
    .hdr h1 { margin: 0; font-size: ${options.format === 'thermal' ? '14px' : '20px'}; }
    .meta { font-size: ${options.format === 'thermal' ? '10px' : '12px'}; margin-bottom: 10px; line-height: 1.5; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
    th, td { padding: 4px 2px; border-bottom: 1px solid #e2e8f0; text-align: left; }
    th.num, td.num { text-align: right; }
    .totals { margin-left: auto; width: ${options.format === 'thermal' ? '100%' : '260px'}; line-height: 1.6; }
    .totals .row { display: flex; justify-content: space-between; }
    .totals .grand { font-weight: bold; font-size: ${options.format === 'thermal' ? '13px' : '16px'}; border-top: 2px solid #0f172a; padding-top: 4px; margin-top: 4px; }
    .qr { text-align: center; margin-top: 12px; }
    .footer { text-align: center; margin-top: 14px; font-size: 10px; color: #475569; }
  </style>
</head>
<body>
  <div class="hdr">
    <h1>${model.header.shopName}</h1>
    ${model.header.tagline ? `<div>${model.header.tagline}</div>` : ''}
    <div>${model.header.address}</div>
    <div>Ph: ${model.header.phone}${model.header.gstin ? ` | GSTIN: ${model.header.gstin}` : ''}</div>
  </div>
  <div class="meta">
    <div><strong>Bill No:</strong> ${model.meta.billNumber} (${model.meta.paymentMethod})</div>
    <div><strong>Bill ID:</strong> ${model.meta.billId}</div>
    <div><strong>Date:</strong> ${model.meta.dateFormatted}</div>
    <div><strong>Cashier:</strong> ${model.meta.cashierName} | <strong>Customer:</strong> ${model.meta.customerName}</div>
  </div>
  <table>
    <thead>
      <tr><th>Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Total</th></tr>
    </thead>
    <tbody>
      ${model.lines
        .map(
          (l) =>
            `<tr><td>${l.name}</td><td class="num">${l.qtyDisplay}</td><td class="num">${l.rateDisplay}</td><td class="num">${l.totalDisplay}</td></tr>`
        )
        .join('')}
    </tbody>
  </table>
  <div class="totals">
    <div class="row"><span>Subtotal</span><span>${model.totals.subtotal}</span></div>
    ${model.totals.discount ? `<div class="row"><span>Discount</span><span>-${model.totals.discount}</span></div>` : ''}
    <div class="row"><span>${model.totals.taxLabel}</span><span>${model.totals.tax}</span></div>
    <div class="row grand"><span>GRAND TOTAL</span><span>${model.totals.grandTotal}</span></div>
  </div>
  ${qrDataUrl ? `<div class="qr"><img src="${qrDataUrl}" width="96" height="96" alt="Invoice QR" /><div>Scan QR to verify</div></div>` : ''}
  <div class="footer">Thank you for shopping with us!</div>
</body>
</html>`;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const frameDoc = iframe.contentWindow?.document;
  if (frameDoc) {
    frameDoc.open();
    frameDoc.write(html);
    frameDoc.close();
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 1500);
    }, 200);
  }
}
