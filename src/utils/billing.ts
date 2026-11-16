export type ItemUnit = 'pcs' | 'kg';

export interface CartItem {
  id: string;
  name: string;
  code?: string;
  unitPrice: number;
  quantity: number;
  unit?: ItemUnit;
  category?: string;
}

export function formatQuantity(quantity: number, unit: ItemUnit = 'pcs'): string {
  if (unit === 'kg') {
    if (quantity < 1 && quantity > 0) {
      const grams = Math.round(quantity * 1000);
      return `${grams} g`;
    }
    const cleanQty = Number(quantity.toFixed(3));
    return `${cleanQty} kg`;
  }
  return `${Number(quantity.toFixed(2))} pcs`;
}

export type DiscountType = 'percentage' | 'fixed';

export interface DiscountConfig {
  type: DiscountType;
  value: number;
}

export interface BillCalculation {
  subtotal: number;
  discountAmount: number;
  taxableAmount: number;
  taxAmount: number;
  grandTotal: number;
}

export function calculateBill(
  items: CartItem[],
  discount: DiscountConfig,
  taxRatePercent: number = 0,
  applyTax: boolean = false
): BillCalculation {
  const subtotal = items.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);

  let discountAmount = 0;
  if (discount.type === 'percentage') {
    discountAmount = (subtotal * Math.min(100, Math.max(0, discount.value))) / 100;
  } else {
    discountAmount = Math.min(subtotal, Math.max(0, discount.value));
  }

  const taxableAmount = Math.max(0, subtotal - discountAmount);
  const taxAmount = applyTax ? (taxableAmount * Math.max(0, taxRatePercent)) / 100 : 0;
  const grandTotal = Math.round((taxableAmount + taxAmount) * 100) / 100;

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    discountAmount: Math.round(discountAmount * 100) / 100,
    taxableAmount: Math.round(taxableAmount * 100) / 100,
    taxAmount: Math.round(taxAmount * 100) / 100,
    grandTotal,
  };
}

export interface StoredBill {
  id: string;
  billNumber: string;
  createdAt: string; // ISO string
  customerName?: string;
  customerPhone?: string;
  items: CartItem[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  grandTotal: number;
  paymentMethod: 'Cash' | 'UPI' | 'Card' | 'Other';
  cashierName: string;
}

export interface SalesReport {
  totalSales: number;
  totalBills: number;
  totalItemsSold: number;
  totalDiscount: number;
  paymentBreakdown: Record<'Cash' | 'UPI' | 'Card' | 'Other', number>;
  topSellingItems: Array<{
    name: string;
    quantity: number;
    revenue: number;
  }>;
}

export function filterBillsByDateRange(
  bills: StoredBill[],
  range: 'daily' | 'weekly' | 'monthly' | 'custom',
  customStart?: Date,
  customEnd?: Date,
  referenceDate: Date = new Date()
): StoredBill[] {
  const ref = new Date(referenceDate);

  let start: Date;
  let end: Date = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 23, 59, 59, 999);

  if (range === 'daily') {
    start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 0, 0, 0, 0);
  } else if (range === 'weekly') {
    const day = ref.getDay(); // 0 is Sunday
    const diff = ref.getDate() - day + (day === 0 ? -6 : 1); // Monday start
    start = new Date(ref.setDate(diff));
    start.setHours(0, 0, 0, 0);
  } else if (range === 'monthly') {
    start = new Date(ref.getFullYear(), ref.getMonth(), 1, 0, 0, 0, 0);
  } else {
    start = customStart ? new Date(customStart) : new Date(0);
    start.setHours(0, 0, 0, 0);
    if (customEnd) {
      end = new Date(customEnd);
      end.setHours(23, 59, 59, 999);
    }
  }

  return bills.filter((b) => {
    const d = new Date(b.createdAt);
    return d >= start && d <= end;
  });
}

export function generateReport(filteredBills: StoredBill[]): SalesReport {
  let totalSales = 0;
  let totalItemsSold = 0;
  let totalDiscount = 0;
  const paymentBreakdown: Record<'Cash' | 'UPI' | 'Card' | 'Other', number> = {
    Cash: 0,
    UPI: 0,
    Card: 0,
    Other: 0,
  };
  const itemMap = new Map<string, { name: string; quantity: number; revenue: number }>();

  for (const bill of filteredBills) {
    totalSales += bill.grandTotal;
    totalDiscount += bill.discountAmount;
    paymentBreakdown[bill.paymentMethod] = (paymentBreakdown[bill.paymentMethod] || 0) + bill.grandTotal;

    for (const item of bill.items) {
      totalItemsSold += item.quantity;
      const existing = itemMap.get(item.id) || { name: item.name, quantity: 0, revenue: 0 };
      existing.quantity += item.quantity;
      existing.revenue += item.unitPrice * item.quantity;
      itemMap.set(item.id, existing);
    }
  }

  const topSellingItems = Array.from(itemMap.values())
    .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
    .slice(0, 5);

  return {
    totalSales: Math.round(totalSales * 100) / 100,
    totalBills: filteredBills.length,
    totalItemsSold,
    totalDiscount: Math.round(totalDiscount * 100) / 100,
    paymentBreakdown: {
      Cash: Math.round(paymentBreakdown.Cash * 100) / 100,
      UPI: Math.round(paymentBreakdown.UPI * 100) / 100,
      Card: Math.round(paymentBreakdown.Card * 100) / 100,
      Other: Math.round(paymentBreakdown.Other * 100) / 100,
    },
    topSellingItems,
  };
}
