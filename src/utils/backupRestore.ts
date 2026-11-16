export interface BackupItemPayload {
  id: string;
  name: string;
  code: string;
  price: number;
  stock: number;
  category: string;
  unit: 'pcs' | 'kg';
  updatedAt?: string;
}

export interface BackupBillLinePayload {
  itemId: string;
  name: string;
  code: string;
  unitPrice: number;
  quantity: number;
  unit: 'pcs' | 'kg';
}

export interface BackupBillPayload {
  id: string;
  billNumber: string;
  createdAt: string;
  customerName?: string;
  customerPhone?: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  grandTotal: number;
  paymentMethod: 'Cash' | 'UPI' | 'Card' | 'Other';
  cashierName: string;
  items: BackupBillLinePayload[];
}

export interface BackupEmployeePayload {
  uid?: string;
  email: string;
  displayName: string;
  role: 'employee';
  isActive: boolean;
  createdAt?: string;
}

export interface ShopBackupBundle {
  backupVersion: number;
  exportedAt: string;
  source: 'sqlite' | 'firestore' | 'hybrid';
  shop: {
    shopId: string;
    shopName: string;
    ownerName: string;
    ownerEmail: string;
    phone: string;
    address: string;
    gstin?: string;
    tagline?: string;
    taxRatePercent?: number;
    currencySymbol?: string;
  };
  items: BackupItemPayload[];
  bills: BackupBillPayload[];
  employees?: BackupEmployeePayload[];
  checksum?: string;
}

export function computeBackupSummarySignature(bundle: Omit<ShopBackupBundle, 'checksum'>): string {
  const itemPart = bundle.items.map((i) => `${i.id}:${i.price}:${i.stock}`).join('|');
  const billPart = bundle.bills.map((b) => `${b.id}:${b.grandTotal}`).join('|');
  const empPart = (bundle.employees || []).map((e) => `${e.email}:${e.isActive}`).join('|');
  const raw = `${bundle.backupVersion}#${bundle.shop.shopId}#${bundle.shop.ownerEmail}#${itemPart}#${billPart}#${empPart}`;
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `sbk_${(hash >>> 0).toString(16).padStart(8, '0')}_${bundle.items.length}_${bundle.bills.length}`;
}

export function validateBackupBundle(
  raw: unknown,
  expectedShopId?: string
): { valid: boolean; errors: string[]; bundle?: ShopBackupBundle } {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object') {
    return { valid: false, errors: ['Backup payload must be a valid JSON object.'] };
  }

  const obj = raw as Record<string, unknown>;
  if (typeof obj.backupVersion !== 'number' || obj.backupVersion < 1) {
    errors.push('Missing or invalid backupVersion.');
  }
  if (!obj.shop || typeof obj.shop !== 'object') {
    errors.push('Missing shop metadata.');
  } else {
    const shop = obj.shop as Record<string, unknown>;
    if (typeof shop.shopId !== 'string' || !shop.shopId.trim()) {
      errors.push('Backup shop.shopId is required.');
    } else if (expectedShopId && shop.shopId.trim().toUpperCase() !== expectedShopId.trim().toUpperCase()) {
      errors.push(
        `Backup belongs to Shop ID ${shop.shopId}, which does not match your active shop (${expectedShopId}).`
      );
    }
    if (typeof shop.shopName !== 'string' || !shop.shopName.trim()) {
      errors.push('Backup shop.shopName is required.');
    }
    if (typeof shop.ownerEmail !== 'string' || !shop.ownerEmail.includes('@')) {
      errors.push('Backup shop.ownerEmail is invalid.');
    }
  }

  if (!Array.isArray(obj.items)) {
    errors.push('Backup items must be an array.');
  } else {
    obj.items.forEach((item, idx) => {
      if (!item || typeof item !== 'object') {
        errors.push(`Item at index ${idx} is invalid.`);
        return;
      }
      const it = item as Record<string, unknown>;
      if (typeof it.id !== 'string' || !it.id.trim()) errors.push(`Item[${idx}].id is required.`);
      if (typeof it.name !== 'string' || !it.name.trim()) errors.push(`Item[${idx}].name is required.`);
      if (typeof it.price !== 'number' || !Number.isFinite(it.price) || it.price < 0) {
        errors.push(`Item[${idx}].price must be a non-negative number.`);
      }
      if (typeof it.stock !== 'number' || !Number.isFinite(it.stock) || it.stock < 0) {
        errors.push(`Item[${idx}].stock must be a non-negative number.`);
      }
      if (it.unit !== 'pcs' && it.unit !== 'kg') {
        errors.push(`Item[${idx}].unit must be 'pcs' or 'kg'.`);
      }
    });
  }

  if (!Array.isArray(obj.bills)) {
    errors.push('Backup bills must be an array.');
  } else {
    obj.bills.forEach((bill, idx) => {
      if (!bill || typeof bill !== 'object') {
        errors.push(`Bill at index ${idx} is invalid.`);
        return;
      }
      const b = bill as Record<string, unknown>;
      if (typeof b.id !== 'string' || !b.id.trim()) errors.push(`Bill[${idx}].id is required.`);
      if (typeof b.billNumber !== 'string' || !b.billNumber.trim()) {
        errors.push(`Bill[${idx}].billNumber is required.`);
      }
      if (typeof b.grandTotal !== 'number' || !Number.isFinite(b.grandTotal) || b.grandTotal < 0) {
        errors.push(`Bill[${idx}].grandTotal must be a non-negative number.`);
      }
      if (!Array.isArray(b.items)) {
        errors.push(`Bill[${idx}].items must be an array.`);
      }
    });
  }

  if (obj.employees !== undefined && !Array.isArray(obj.employees)) {
    errors.push('Backup employees field must be an array when present.');
  }

  if (errors.length === 0 && typeof obj.checksum === 'string' && obj.checksum.trim()) {
    const candidate = obj as unknown as ShopBackupBundle;
    const expectedSig = computeBackupSummarySignature({
      backupVersion: candidate.backupVersion,
      exportedAt: candidate.exportedAt,
      source: candidate.source,
      shop: candidate.shop,
      items: candidate.items,
      bills: candidate.bills,
      employees: candidate.employees,
    });
    if (obj.checksum !== expectedSig) {
      errors.push('Backup integrity checksum mismatch. File may be modified or corrupted.');
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    bundle: obj as unknown as ShopBackupBundle,
  };
}
