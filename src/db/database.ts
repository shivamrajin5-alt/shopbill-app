import { createHash, randomBytes, randomInt } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  hashPinBcrypt,
  isBcryptHash,
  isValidPinFormat,
  verifyPinHash,
} from '../utils/pinSecurity.ts';
import {
  computeBackupSummarySignature,
  validateBackupBundle,
  type ShopBackupBundle,
} from '../utils/backupRestore.ts';

export type ItemUnit = 'pcs' | 'kg';
export type PaymentMode = 'Cash' | 'UPI' | 'Card' | 'Other';
export type ShopStatus = 'active' | 'inactive';
export type SyncStatus = 'pending' | 'synced';
export type UserRole = 'owner' | 'employee' | 'admin';

export interface DbShopRecord {
  id: string;
  shopId: string;
  shopName: string;
  ownerName: string;
  email: string;
  emailKey: string;
  ownerUid: string;
  phone: string;
  address: string;
  gstin: string;
  tagline: string;
  taxRatePercent: number;
  currencySymbol: string;
  pin: string; // Never returns plaintext PIN (always masked/empty)
  pinHash: string;
  status: ShopStatus;
  isActive: boolean;
  registeredAt: string;
  createdAt: string;
  updatedAt: string;
  lastSyncedAt: string | null;
  totalBillsCount: number;
  totalRevenue: number;
}

export interface DbUserRecord {
  uid: string;
  firebaseUid: string;
  email: string;
  emailKey: string;
  displayName: string;
  role: UserRole;
  shopId: string;
  ownerEmail: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DbSessionContext {
  token: string;
  ownerEmail: string;
  actorUid: string;
  actorEmail: string;
  actorName: string;
  role: 'owner' | 'employee';
  shopId: string;
  expiresAt: string;
}

export interface DbAdminRecord {
  uid: string;
  email: string;
  role: 'super_admin';
  isActive: boolean;
  createdAt: string;
}

export interface DbAuditLogRecord {
  id: string;
  shopId: string;
  actorUid: string;
  actorEmail: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  beforeData: unknown;
  afterData: unknown;
  createdAt: string;
}

export interface DbBackupHistoryRecord {
  id: string;
  shopId: string;
  actorEmail: string;
  source: string;
  itemsCount: number;
  billsCount: number;
  employeesCount: number;
  checksum: string;
  createdAt: string;
}

export interface DbItemRecord {
  id: string;
  ownerEmail: string;
  shopId: string;
  name: string;
  code: string;
  price: number;
  stock: number;
  category: string;
  unit: ItemUnit;
  updatedAt: string;
  syncStatus: SyncStatus;
  syncedAt: string | null;
  syncError: string | null;
}

export interface DbBillItemRecord {
  itemId: string;
  name: string;
  code: string;
  unitPrice: number;
  quantity: number;
  unit: ItemUnit;
}

export interface DbBillRecord {
  id: string;
  ownerEmail: string;
  shopId: string;
  billNumber: string;
  createdAt: string;
  items: DbBillItemRecord[];
  customerName: string;
  customerPhone: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  grandTotal: number;
  paymentMethod: PaymentMode;
  cashierName: string;
  actorUid?: string;
  syncStatus: SyncStatus;
  syncedAt: string | null;
  syncError: string | null;
}

export interface DbOwnerWorkspace {
  shop: DbShopRecord;
  items: DbItemRecord[];
  bills: DbBillRecord[];
  employees: DbUserRecord[];
}

export interface DbPendingSyncResult {
  shop: DbShopRecord;
  items: DbItemRecord[];
  bills: DbBillRecord[];
}

export interface RegisterShopDbInput {
  shopId?: string;
  shopName: string;
  ownerName: string;
  email: string;
  ownerUid?: string;
  phone: string;
  address: string;
  gstin?: string;
  pin: string;
  status?: ShopStatus;
}

export class DbConflictError extends Error {
  statusCode: number;
  constructor(message: string) {
    super(message);
    this.name = 'DbConflictError';
    this.statusCode = 409;
  }
}

export class DbValidationError extends Error {
  statusCode: number;
  constructor(message: string) {
    super(message);
    this.name = 'DbValidationError';
    this.statusCode = 400;
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmailFormat(email: string): boolean {
  const norm = normalizeEmail(email);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(norm) && norm.length <= 120;
}

export function emailToDocKey(email: string): string {
  const norm = normalizeEmail(email);
  const slug = norm
    .replace(/@/g, '_at_')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 96);
  const suffix = createHash('sha256').update(norm).digest('hex').slice(0, 8);
  return `${slug || 'owner'}_${suffix}`;
}

export function hashPinSha256(pin: string): string {
  return createHash('sha256').update(pin.trim()).digest('hex');
}

function generateUniqueShopId(db: DatabaseSync): string {
  for (let i = 0; i < 25; i++) {
    const candidate = `SB-${randomInt(1000, 9999)}`;
    const existing = db
      .prepare('SELECT shop_id FROM shop_owners WHERE shop_id = ?')
      .get(candidate) as { shop_id: string } | undefined;
    if (!existing) return candidate;
  }
  return `SB-${Date.now().toString().slice(-6)}`;
}

export interface ShopBillDatabase {
  close: () => void;
  listShops: () => DbShopRecord[];
  getShopByIdOrEmail: (idOrEmail: string) => DbShopRecord | null;
  registerShop: (input: RegisterShopDbInput, actorEmail?: string) => DbShopRecord;
  updateShop: (
    idOrEmail: string,
    patch: Partial<{
      shopName: string;
      ownerName: string;
      email: string;
      ownerUid: string;
      phone: string;
      address: string;
      gstin: string;
      tagline: string;
      taxRatePercent: number;
      currencySymbol: string;
      status: ShopStatus;
      isActive: boolean;
      pin: string;
    }>,
    actor?: { uid?: string; email?: string; role?: string }
  ) => DbShopRecord | null;
  toggleShopStatus: (idOrEmail: string, actorEmail?: string) => DbShopRecord | null;
  resetShopPin: (idOrEmail: string, newPin: string, actorEmail?: string) => DbShopRecord | null;
  deleteShop: (idOrEmail: string, actorEmail?: string) => boolean;
  verifyOwnerEmail: (email: string) => {
    validFormat: boolean;
    registered: boolean;
    isActive: boolean;
    email: string;
    role?: UserRole;
    displayName?: string;
    shopId?: string;
    shopName?: string;
    ownerName?: string;
    message: string;
  };
  verifyShopLogin: (
    shopId: string,
    pin: string,
    email?: string,
    firebaseUid?: string
  ) => {
    success: boolean;
    shop?: DbShopRecord;
    user?: DbUserRecord;
    error?: string;
  };
  createOwnerSession: (
    email: string,
    actor?: { uid?: string; email?: string; name?: string; role?: 'owner' | 'employee'; shopId?: string }
  ) => string;
  validateOwnerSessionToken: (token: string, expectedEmail: string) => boolean;
  getOwnerSessionContext: (token: string, expectedOwnerEmailOrShopId?: string) => DbSessionContext | null;
  revokeOwnerSession: (token: string) => void;
  createAdminSession: (email: string, uid?: string) => string;
  validateAdminSessionToken: (token: string) => { email: string; uid: string } | null;
  revokeAdminSession: (token: string) => void;
  listAdmins: () => DbAdminRecord[];
  upsertAdmin: (input: { uid: string; email: string; isActive?: boolean }, actorEmail?: string) => DbAdminRecord;
  listShopEmployees: (shopIdOrEmail: string) => DbUserRecord[];
  addShopEmployee: (
    shopIdOrEmail: string,
    input: { email: string; displayName: string; pin: string; isActive?: boolean },
    actor?: { uid?: string; email?: string }
  ) => DbUserRecord;
  updateShopEmployee: (
    shopIdOrEmail: string,
    empUid: string,
    patch: Partial<{ displayName: string; email: string; isActive: boolean }>,
    actor?: { uid?: string; email?: string }
  ) => DbUserRecord | null;
  toggleEmployeeStatus: (
    shopIdOrEmail: string,
    empUid: string,
    actor?: { uid?: string; email?: string }
  ) => DbUserRecord | null;
  resetEmployeePin: (
    shopIdOrEmail: string,
    empUid: string,
    newPin: string,
    actor?: { uid?: string; email?: string }
  ) => DbUserRecord | null;
  deleteShopEmployee: (
    shopIdOrEmail: string,
    empUid: string,
    actor?: { uid?: string; email?: string }
  ) => boolean;
  getOwnerWorkspace: (idOrEmail: string) => DbOwnerWorkspace | null;
  saveOwnerItem: (
    idOrEmail: string,
    item: Omit<DbItemRecord, 'ownerEmail' | 'shopId' | 'updatedAt' | 'syncStatus' | 'syncedAt' | 'syncError'> &
      Partial<Pick<DbItemRecord, 'updatedAt'>>,
    actor?: { uid?: string; email?: string; role?: string }
  ) => DbItemRecord;
  deleteOwnerItem: (
    idOrEmail: string,
    itemId: string,
    actor?: { uid?: string; email?: string; role?: string }
  ) => boolean;
  createOwnerBill: (
    idOrEmail: string,
    bill: Omit<DbBillRecord, 'ownerEmail' | 'shopId' | 'syncStatus' | 'syncedAt' | 'syncError'> &
      Partial<Pick<DbBillRecord, 'syncStatus' | 'syncedAt' | 'syncError'>>,
    actor?: { uid?: string; email?: string; role?: string }
  ) => DbBillRecord;
  getPendingSyncForOwner: (idOrEmail: string) => DbPendingSyncResult | null;
  markOwnerRecordsSynced: (
    idOrEmail: string,
    payload: {
      itemIds?: string[];
      billIds?: string[];
      errors?: Array<{ id: string; type: 'item' | 'bill'; error: string }>;
    }
  ) => { syncedItems: number; syncedBills: number; lastSyncedAt: string };
  upsertShopFromVerifiedCloud: (cloudShop: {
    shopId: string;
    email: string;
    emailKey?: string;
    ownerUid?: string;
    shopName: string;
    ownerName: string;
    phone?: string;
    address?: string;
    gstin?: string;
    tagline?: string;
    taxRatePercent?: number;
    currencySymbol?: string;
    pinHash?: string;
    status?: ShopStatus;
    isActive?: boolean;
    createdAt?: string;
    updatedAt?: string;
  }) => DbShopRecord | null;
  mergeCloudDataForOwner: (
    idOrEmail: string,
    cloudData: {
      shop?: {
        shopName?: string;
        ownerName?: string;
        phone?: string;
        address?: string;
        gstin?: string;
        tagline?: string;
        taxRatePercent?: number;
        currencySymbol?: string;
        pinHash?: string;
        status?: ShopStatus;
        isActive?: boolean;
        updatedAt?: string;
      } | null;
      items?: Array<{
        id: string;
        name: string;
        code?: string;
        price: number;
        stock: number;
        category?: string;
        unit?: string;
        updatedAt?: string;
      }>;
      bills?: Array<{
        id: string;
        billNumber: string;
        createdAt?: string;
        customerName?: string;
        customerPhone?: string;
        subtotal: number;
        discountAmount?: number;
        taxAmount?: number;
        grandTotal: number;
        paymentMethod?: string;
        cashierName?: string;
        actorUid?: string;
        items?: Array<{
          itemId?: string;
          id?: string;
          name: string;
          code?: string;
          unitPrice?: number;
          price?: number;
          quantity?: number;
          qty?: number;
          unit?: string;
        }>;
      }>;
    }
  ) => {
    addedItems: number;
    updatedItems: number;
    addedBills: number;
    shopUpdated: boolean;
    workspace: DbOwnerWorkspace;
  };
  recordAuditLog: (entry: {
    shopId: string;
    actorUid?: string;
    actorEmail: string;
    actorRole: string;
    action: string;
    targetType: string;
    targetId: string;
    beforeData?: unknown;
    afterData?: unknown;
  }) => DbAuditLogRecord;
  listAuditLogsForShop: (shopIdOrEmail: string, limit?: number) => DbAuditLogRecord[];
  listAllAuditLogs: (limit?: number) => DbAuditLogRecord[];
  exportShopBackup: (
    shopIdOrEmail: string,
    actorEmail: string,
    source?: 'sqlite' | 'firestore' | 'hybrid'
  ) => ShopBackupBundle;
  restoreShopBackup: (
    shopIdOrEmail: string,
    bundle: unknown,
    actorEmail: string
  ) => { workspace: DbOwnerWorkspace; restoredItems: number; restoredBills: number };
  listBackupHistory: (shopIdOrEmail: string) => DbBackupHistoryRecord[];
  resetOwnerWorkspace: (idOrEmail: string) => DbOwnerWorkspace | null;
}

export function openShopBillDatabase(
  dbFilePath: string = path.resolve(process.cwd(), 'data', 'shopbill.db')
): ShopBillDatabase {
  if (dbFilePath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbFilePath), { recursive: true });
  }

  const db = new DatabaseSync(dbFilePath);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS shop_owners (
      email TEXT PRIMARY KEY,
      email_key TEXT NOT NULL UNIQUE,
      shop_id TEXT NOT NULL UNIQUE,
      owner_uid TEXT NOT NULL DEFAULT '',
      shop_name TEXT NOT NULL,
      owner_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      address TEXT NOT NULL,
      gstin TEXT NOT NULL DEFAULT '',
      tagline TEXT NOT NULL DEFAULT 'Fast & Reliable In-Store Billing',
      tax_rate_percent REAL NOT NULL DEFAULT 5.0,
      currency_symbol TEXT NOT NULL DEFAULT '₹',
      pin_plain TEXT NOT NULL DEFAULT '',
      pin_hash TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'inactive')) DEFAULT 'active',
      is_active INTEGER NOT NULL DEFAULT 1,
      last_synced_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      uid TEXT PRIMARY KEY,
      firebase_uid TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL UNIQUE,
      email_key TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('owner', 'employee', 'admin')),
      shop_id TEXT NOT NULL,
      pin_hash TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admins (
      uid TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL CHECK (role IN ('super_admin')) DEFAULT 'super_admin',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS items (
      id TEXT NOT NULL,
      owner_email TEXT NOT NULL REFERENCES shop_owners(email) ON DELETE CASCADE ON UPDATE CASCADE,
      name TEXT NOT NULL,
      code TEXT NOT NULL DEFAULT '',
      price REAL NOT NULL,
      stock REAL NOT NULL,
      category TEXT NOT NULL DEFAULT 'General',
      unit TEXT NOT NULL CHECK (unit IN ('pcs', 'kg')) DEFAULT 'pcs',
      updated_at TEXT NOT NULL,
      sync_status TEXT NOT NULL CHECK (sync_status IN ('pending', 'synced')) DEFAULT 'pending',
      synced_at TEXT,
      sync_error TEXT,
      PRIMARY KEY (owner_email, id)
    );

    CREATE TABLE IF NOT EXISTS bills (
      id TEXT NOT NULL,
      owner_email TEXT NOT NULL REFERENCES shop_owners(email) ON DELETE CASCADE ON UPDATE CASCADE,
      bill_number TEXT NOT NULL,
      customer_name TEXT NOT NULL DEFAULT '',
      customer_phone TEXT NOT NULL DEFAULT '',
      subtotal REAL NOT NULL,
      discount_amount REAL NOT NULL DEFAULT 0,
      tax_amount REAL NOT NULL DEFAULT 0,
      grand_total REAL NOT NULL,
      payment_method TEXT NOT NULL CHECK (payment_method IN ('Cash', 'UPI', 'Card', 'Other')) DEFAULT 'Cash',
      cashier_name TEXT NOT NULL,
      actor_uid TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      sync_status TEXT NOT NULL CHECK (sync_status IN ('pending', 'synced')) DEFAULT 'pending',
      synced_at TEXT,
      sync_error TEXT,
      PRIMARY KEY (owner_email, id)
    );

    CREATE TABLE IF NOT EXISTS bill_items (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_email TEXT NOT NULL,
      bill_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      name TEXT NOT NULL,
      code TEXT NOT NULL DEFAULT '',
      unit_price REAL NOT NULL,
      quantity REAL NOT NULL,
      unit TEXT NOT NULL CHECK (unit IN ('pcs', 'kg')) DEFAULT 'pcs',
      FOREIGN KEY (owner_email, bill_id) REFERENCES bills(owner_email, id) ON DELETE CASCADE ON UPDATE CASCADE
    );

    CREATE TABLE IF NOT EXISTS owner_sessions (
      token TEXT PRIMARY KEY,
      owner_email TEXT NOT NULL REFERENCES shop_owners(email) ON DELETE CASCADE ON UPDATE CASCADE,
      actor_uid TEXT NOT NULL DEFAULT '',
      actor_email TEXT NOT NULL DEFAULT '',
      actor_name TEXT NOT NULL DEFAULT '',
      actor_role TEXT NOT NULL DEFAULT 'owner',
      shop_id TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_sessions (
      token TEXT PRIMARY KEY,
      admin_uid TEXT NOT NULL,
      admin_email TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      shop_id TEXT NOT NULL,
      actor_uid TEXT NOT NULL DEFAULT '',
      actor_email TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      before_data TEXT,
      after_data TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS backup_history (
      id TEXT PRIMARY KEY,
      shop_id TEXT NOT NULL,
      actor_email TEXT NOT NULL,
      source TEXT NOT NULL,
      items_count INTEGER NOT NULL,
      bills_count INTEGER NOT NULL,
      employees_count INTEGER NOT NULL,
      checksum TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_items_owner_email ON items(owner_email);
    CREATE INDEX IF NOT EXISTS idx_bills_owner_email ON bills(owner_email);
    CREATE INDEX IF NOT EXISTS idx_users_shop_id ON users(shop_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_shop_id ON audit_logs(shop_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_backup_history_shop_id ON backup_history(shop_id, created_at DESC);
  `);

  function ensureColumn(table: string, column: string, definition: string) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  ensureColumn('shop_owners', 'owner_uid', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('shop_owners', 'last_synced_at', 'TEXT');
  ensureColumn('bills', 'actor_uid', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('owner_sessions', 'actor_uid', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('owner_sessions', 'actor_email', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('owner_sessions', 'actor_name', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('owner_sessions', 'actor_role', "TEXT NOT NULL DEFAULT 'owner'");
  ensureColumn('owner_sessions', 'shop_id', "TEXT NOT NULL DEFAULT ''");

  // Upgrade any existing plaintext/SHA-256 PINs on existing databases to salted bcrypt and wipe pin_plain
  function migrateExistingPinsAndUsers() {
    const existingShops = db
      .prepare('SELECT email, email_key, shop_id, owner_uid, owner_name, pin_plain, pin_hash, is_active, created_at, updated_at FROM shop_owners')
      .all() as Record<string, unknown>[];

    for (const s of existingShops) {
      const email = normalizeEmail(String(s.email));
      const emailKey = String(s.email_key);
      const shopId = String(s.shop_id);
      const ownerName = String(s.owner_name);
      const pinPlain = String(s.pin_plain || '');
      let pinHash = String(s.pin_hash || '');
      const isActive = Number(s.is_active) === 1 ? 1 : 0;

      if (!isBcryptHash(pinHash) && isValidPinFormat(pinPlain)) {
        pinHash = hashPinBcrypt(pinPlain);
        db.prepare('UPDATE shop_owners SET pin_hash = ?, pin_plain = ? WHERE email = ?').run(
          pinHash,
          '',
          email
        );
      } else if (pinPlain !== '') {
        db.prepare('UPDATE shop_owners SET pin_plain = ? WHERE email = ?').run('', email);
      }

      const existingUser = db.prepare('SELECT uid FROM users WHERE email = ?').get(email) as
        | { uid: string }
        | undefined;
      if (!existingUser) {
        const uid = String(s.owner_uid || '').trim() || `usr_${emailKey}`;
        db.prepare(`
          INSERT OR IGNORE INTO users (
            uid, firebase_uid, email, email_key, display_name, role, shop_id,
            pin_hash, is_active, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 'owner', ?, ?, ?, ?, ?)
        `).run(
          uid,
          String(s.owner_uid || ''),
          email,
          emailKey,
          ownerName,
          shopId,
          pinHash,
          isActive,
          String(s.created_at),
          String(s.updated_at)
        );
      }
    }

    // Ensure at least one default super_admin row exists in admins table
    const adminCount = db.prepare('SELECT COUNT(*) AS cnt FROM admins').get() as { cnt: number };
    if (Number(adminCount.cnt) === 0) {
      db.prepare(`
        INSERT OR IGNORE INTO admins (uid, email, role, is_active, created_at)
        VALUES (?, ?, 'super_admin', 1, ?)
      `).run('adm_shivamraj_primary', 'shivamraj.in5@gmail.com', new Date().toISOString());
    }

    // Backfill starter cashier employee for existing upgraded QuickMart DBs if no employee records exist yet
    const quickMartRow = db.prepare("SELECT shop_id FROM shop_owners WHERE shop_id = 'SB-1001' LIMIT 1").get();
    if (quickMartRow) {
      const empCount = db
        .prepare("SELECT COUNT(*) AS cnt FROM users WHERE shop_id = 'SB-1001' AND role = 'employee'")
        .get() as { cnt: number };
      const empDeleted = db
        .prepare("SELECT COUNT(*) AS cnt FROM audit_logs WHERE shop_id = 'SB-1001' AND action = 'employee_deleted'")
        .get() as { cnt: number };
      if (Number(empCount.cnt) === 0 && Number(empDeleted.cnt) === 0) {
        const empEmail = 'sunil@quickmart.in';
        const empEmailKey = emailToDocKey(empEmail);
        const empNow = new Date().toISOString();
        db.prepare(`
          INSERT OR IGNORE INTO users (
            uid, firebase_uid, email, email_key, display_name, role, shop_id,
            pin_hash, is_active, created_at, updated_at
          ) VALUES (?, '', ?, ?, 'Sunil Kumar', 'employee', 'SB-1001', ?, 1, ?, ?)
        `).run(`emp_${empEmailKey}`, empEmail, empEmailKey, hashPinBcrypt('0000'), empNow, empNow);
      }
    }
  }

  function seedIfEmpty() {
    const countRow = db.prepare('SELECT COUNT(*) AS cnt FROM shop_owners').get() as { cnt: number };
    if (Number(countRow.cnt) > 0) return;

    const now = Date.now();
    const initialShops = [
      {
        shopId: 'SB-1001',
        shopName: 'QuickMart Store',
        ownerName: 'Rajesh Sharma',
        email: 'rajesh@quickmart.in',
        phone: '+91 98765 43210',
        address: 'Shop No. 12, Main Market Road, Central Plaza',
        gstin: '27ABCDE1234F1Z5',
        pin: '1234',
        isActive: true,
        createdAt: new Date(now - 45 * 86400000).toISOString(),
      },
      {
        shopId: 'SB-1002',
        shopName: 'Patel Provision & Dairy',
        ownerName: 'Amit Patel',
        email: 'amit@pateldairy.in',
        phone: '+91 98220 11223',
        address: 'B-14 Anand Complex, Station Road',
        gstin: '24AAACP1234A1Z1',
        pin: '5566',
        isActive: true,
        createdAt: new Date(now - 20 * 86400000).toISOString(),
      },
      {
        shopId: 'SB-1003',
        shopName: 'DailyFresh Supermarket',
        ownerName: 'Neha Verma',
        email: 'neha@dailyfresh.in',
        phone: '+91 99881 22334',
        address: '45 Green Park, Ring Road',
        gstin: '07AAPCN9876Q1Z9',
        pin: '7788',
        isActive: true,
        createdAt: new Date(now - 8 * 86400000).toISOString(),
      },
      {
        shopId: 'SB-1004',
        shopName: 'Sharma Electronics (Suspended)',
        ownerName: 'Vikram Sharma',
        email: 'vikram@sharmaelec.in',
        phone: '+91 91234 56789',
        address: 'Plot 22, Commercial Phase II',
        gstin: '06AAACS4567B1Z2',
        pin: '9999',
        isActive: false,
        createdAt: new Date(now - 2 * 86400000).toISOString(),
      },
    ];

    const insertShop = db.prepare(`
      INSERT INTO shop_owners (
        email, email_key, shop_id, owner_uid, shop_name, owner_name, phone, address, gstin,
        tagline, tax_rate_percent, currency_symbol, pin_plain, pin_hash,
        status, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?)
    `);

    const insertUser = db.prepare(`
      INSERT INTO users (
        uid, firebase_uid, email, email_key, display_name, role, shop_id,
        pin_hash, is_active, created_at, updated_at
      ) VALUES (?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const s of initialShops) {
      const normEmail = normalizeEmail(s.email);
      const emailKey = emailToDocKey(normEmail);
      const status: ShopStatus = s.isActive ? 'active' : 'inactive';
      const pinHash = hashPinBcrypt(s.pin);
      insertShop.run(
        normEmail,
        emailKey,
        s.shopId,
        s.shopName,
        s.ownerName,
        s.phone,
        s.address,
        s.gstin,
        'Fast & Reliable In-Store Billing',
        5.0,
        '₹',
        pinHash,
        status,
        s.isActive ? 1 : 0,
        s.createdAt,
        s.createdAt
      );
      insertUser.run(
        `usr_${emailKey}`,
        normEmail,
        emailKey,
        s.ownerName,
        'owner',
        s.shopId,
        pinHash,
        s.isActive ? 1 : 0,
        s.createdAt,
        s.createdAt
      );
    }

    // Seed starter cashier employee for SB-1001
    const empEmail = 'sunil@quickmart.in';
    const empEmailKey = emailToDocKey(empEmail);
    const empNow = new Date(now - 10 * 86400000).toISOString();
    insertUser.run(
      `emp_${empEmailKey}`,
      empEmail,
      empEmailKey,
      'Sunil Kumar',
      'employee',
      'SB-1001',
      hashPinBcrypt('0000'),
      1,
      empNow,
      empNow
    );

    seedDefaultCatalogForEmail('rajesh@quickmart.in');
    seedDefaultBillsForQuickMart();
    seedDefaultCatalogForEmail('amit@pateldairy.in');
    seedDefaultCatalogForEmail('neha@dailyfresh.in');
  }

  function seedDefaultCatalogForEmail(ownerEmail: string) {
    const nowIso = new Date().toISOString();
    const starterItems = [
      { id: 'i1', name: 'Basmati Rice', code: 'BR101', price: 120.0, stock: 45, category: 'Groceries', unit: 'kg' },
      { id: 'i2', name: 'Refined Sugar', code: 'RS105', price: 46.0, stock: 80, category: 'Groceries', unit: 'kg' },
      { id: 'i3', name: 'Detergent Powder', code: 'DP109', price: 140.0, stock: 50, category: 'Cleaning', unit: 'kg' },
      { id: 'i4', name: 'Whole Wheat Flour', code: 'WF104', price: 46.0, stock: 100, category: 'Groceries', unit: 'kg' },
      { id: 'i5', name: 'Sunflower Oil 1L', code: 'SO102', price: 165.0, stock: 30, category: 'Groceries', unit: 'pcs' },
      { id: 'i6', name: 'Tata Tea Gold 500g', code: 'TG103', price: 290.0, stock: 25, category: 'Beverages', unit: 'pcs' },
      { id: 'i7', name: 'Milk Bread 400g', code: 'MB106', price: 45.0, stock: 15, category: 'Bakery', unit: 'pcs' },
      { id: 'i8', name: 'Amul Butter 100g', code: 'AB107', price: 58.0, stock: 35, category: 'Dairy', unit: 'pcs' },
      { id: 'i9', name: 'Instant Coffee 100g', code: 'IC108', price: 195.0, stock: 20, category: 'Beverages', unit: 'pcs' },
      { id: 'i10', name: 'Dishwash Bar 250g', code: 'DB110', price: 30.0, stock: 65, category: 'Cleaning', unit: 'pcs' },
      { id: 'i11', name: 'Toothpaste 150g', code: 'TP111', price: 95.0, stock: 40, category: 'Personal Care', unit: 'pcs' },
      { id: 'i12', name: 'Bath Soap 125g Pack of 4', code: 'BS112', price: 175.0, stock: 28, category: 'Personal Care', unit: 'pcs' },
    ];

    const insertItem = db.prepare(`
      INSERT OR REPLACE INTO items (
        id, owner_email, name, code, price, stock, category, unit, updated_at, sync_status, synced_at, sync_error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?, NULL)
    `);
    for (const item of starterItems) {
      insertItem.run(
        item.id,
        ownerEmail,
        item.name,
        item.code,
        item.price,
        item.stock,
        item.category,
        item.unit,
        nowIso,
        nowIso
      );
    }
  }

  function seedDefaultBillsForQuickMart() {
    const ownerEmail = 'rajesh@quickmart.in';
    const insertBill = db.prepare(`
      INSERT OR IGNORE INTO bills (
        id, owner_email, bill_number, customer_name, customer_phone,
        subtotal, discount_amount, tax_amount, grand_total,
        payment_method, cashier_name, actor_uid, created_at, sync_status, synced_at, sync_error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, 'synced', ?, NULL)
    `);
    const insertBillItem = db.prepare(`
      INSERT INTO bill_items (owner_email, bill_id, item_id, name, code, unit_price, quantity, unit)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const seedBills = [
      {
        id: 'b1',
        billNumber: 'SB-1001',
        createdAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
        customerName: 'Anil Verma',
        customerPhone: '9811223344',
        subtotal: 345.0,
        discountAmount: 20.0,
        taxAmount: 0.0,
        grandTotal: 325.0,
        paymentMethod: 'UPI',
        cashierName: 'Rajesh Sharma',
        items: [
          { itemId: 'i1', name: 'Basmati Rice', code: 'BR101', unitPrice: 120.0, quantity: 1.5, unit: 'kg' },
          { itemId: 'i5', name: 'Sunflower Oil 1L', code: 'SO102', unitPrice: 165.0, quantity: 1, unit: 'pcs' },
        ],
      },
      {
        id: 'b2',
        billNumber: 'SB-1002',
        createdAt: new Date(Date.now() - 1.5 * 3600 * 1000).toISOString(),
        customerName: 'Priya Mehta',
        customerPhone: '9877001122',
        subtotal: 371.0,
        discountAmount: 0.0,
        taxAmount: 0.0,
        grandTotal: 371.0,
        paymentMethod: 'Cash',
        cashierName: 'Sunil Kumar',
        items: [
          { itemId: 'i6', name: 'Tata Tea Gold 500g', code: 'TG103', unitPrice: 290.0, quantity: 1, unit: 'pcs' },
          { itemId: 'i2', name: 'Refined Sugar', code: 'RS105', unitPrice: 46.0, quantity: 0.5, unit: 'kg' },
          { itemId: 'i8', name: 'Amul Butter 100g', code: 'AB107', unitPrice: 58.0, quantity: 1, unit: 'pcs' },
        ],
      },
      {
        id: 'b3',
        billNumber: 'SB-1003',
        createdAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
        customerName: 'Kavita Singh',
        customerPhone: '9988776655',
        subtotal: 510.0,
        discountAmount: 30.0,
        taxAmount: 24.0,
        grandTotal: 504.0,
        paymentMethod: 'Card',
        cashierName: 'Rajesh Sharma',
        items: [
          { itemId: 'i4', name: 'Whole Wheat Flour', code: 'WF104', unitPrice: 46.0, quantity: 5.0, unit: 'kg' },
          { itemId: 'i3', name: 'Detergent Powder', code: 'DP109', unitPrice: 140.0, quantity: 2.0, unit: 'kg' },
        ],
      },
    ];

    db.prepare('DELETE FROM bill_items WHERE owner_email = ?').run(ownerEmail);
    for (const b of seedBills) {
      insertBill.run(
        b.id,
        ownerEmail,
        b.billNumber,
        b.customerName,
        b.customerPhone,
        b.subtotal,
        b.discountAmount,
        b.taxAmount,
        b.grandTotal,
        b.paymentMethod,
        b.cashierName,
        b.createdAt,
        b.createdAt
      );
      for (const line of b.items) {
        insertBillItem.run(
          ownerEmail,
          b.id,
          line.itemId,
          line.name,
          line.code,
          line.unitPrice,
          line.quantity,
          line.unit
        );
      }
    }
  }

  seedIfEmpty();
  migrateExistingPinsAndUsers();

  function mapRowToShop(row: Record<string, unknown>): DbShopRecord {
    const shopId = String(row.shop_id);
    const status = (row.status === 'inactive' ? 'inactive' : 'active') as ShopStatus;
    const isActive = Number(row.is_active) === 1 && status === 'active';
    const createdAt = String(row.created_at);
    return {
      id: shopId,
      shopId,
      shopName: String(row.shop_name),
      ownerName: String(row.owner_name),
      email: String(row.email),
      emailKey: String(row.email_key),
      ownerUid: String(row.owner_uid || ''),
      phone: String(row.phone),
      address: String(row.address),
      gstin: String(row.gstin || ''),
      tagline: String(row.tagline || 'Fast & Reliable In-Store Billing'),
      taxRatePercent: Number(row.tax_rate_percent ?? 5.0),
      currencySymbol: String(row.currency_symbol || '₹'),
      pin: '',
      pinHash: String(row.pin_hash),
      status,
      isActive,
      registeredAt: createdAt,
      createdAt,
      updatedAt: String(row.updated_at),
      lastSyncedAt: row.last_synced_at ? String(row.last_synced_at) : null,
      totalBillsCount: Number(row.bill_count ?? 0),
      totalRevenue: Number(row.revenue_total ?? 0),
    };
  }

  function mapRowToUser(row: Record<string, unknown>, ownerEmail: string = ''): DbUserRecord {
    return {
      uid: String(row.uid),
      firebaseUid: String(row.firebase_uid || ''),
      email: String(row.email),
      emailKey: String(row.email_key),
      displayName: String(row.display_name),
      role: (row.role as UserRole) || 'employee',
      shopId: String(row.shop_id),
      ownerEmail,
      isActive: Number(row.is_active) === 1,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  function mapRowToAuditLog(row: Record<string, unknown>): DbAuditLogRecord {
    const parseJson = (val: unknown) => {
      if (typeof val !== 'string' || !val) return null;
      try {
        return JSON.parse(val);
      } catch {
        return val;
      }
    };
    return {
      id: String(row.id),
      shopId: String(row.shop_id),
      actorUid: String(row.actor_uid || ''),
      actorEmail: String(row.actor_email),
      actorRole: String(row.actor_role),
      action: String(row.action),
      targetType: String(row.target_type),
      targetId: String(row.target_id),
      beforeData: parseJson(row.before_data),
      afterData: parseJson(row.after_data),
      createdAt: String(row.created_at),
    };
  }

  function recordAuditLog(entry: {
    shopId: string;
    actorUid?: string;
    actorEmail: string;
    actorRole: string;
    action: string;
    targetType: string;
    targetId: string;
    beforeData?: unknown;
    afterData?: unknown;
  }): DbAuditLogRecord {
    const id = `log_${Date.now()}_${randomBytes(4).toString('hex')}`;
    const createdAt = new Date().toISOString();
    const beforeJson = entry.beforeData !== undefined && entry.beforeData !== null ? JSON.stringify(entry.beforeData) : null;
    const afterJson = entry.afterData !== undefined && entry.afterData !== null ? JSON.stringify(entry.afterData) : null;

    db.prepare(`
      INSERT INTO audit_logs (
        id, shop_id, actor_uid, actor_email, actor_role, action,
        target_type, target_id, before_data, after_data, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      entry.shopId || 'GLOBAL',
      entry.actorUid || '',
      normalizeEmail(entry.actorEmail || 'system'),
      entry.actorRole || 'system',
      entry.action,
      entry.targetType,
      entry.targetId,
      beforeJson,
      afterJson,
      createdAt
    );

    return {
      id,
      shopId: entry.shopId || 'GLOBAL',
      actorUid: entry.actorUid || '',
      actorEmail: normalizeEmail(entry.actorEmail || 'system'),
      actorRole: entry.actorRole || 'system',
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      beforeData: entry.beforeData ?? null,
      afterData: entry.afterData ?? null,
      createdAt,
    };
  }

  function listAuditLogsForShop(shopIdOrEmail: string, limit: number = 100): DbAuditLogRecord[] {
    const shop = getShopByIdOrEmail(shopIdOrEmail);
    const targetShopId = shop ? shop.shopId : shopIdOrEmail.trim().toUpperCase();
    const safeLimit = Math.min(500, Math.max(1, Math.floor(limit)));
    const rows = db
      .prepare('SELECT * FROM audit_logs WHERE shop_id = ? ORDER BY created_at DESC LIMIT ?')
      .all(targetShopId, safeLimit) as Record<string, unknown>[];
    return rows.map(mapRowToAuditLog);
  }

  function listAllAuditLogs(limit: number = 200): DbAuditLogRecord[] {
    const safeLimit = Math.min(1000, Math.max(1, Math.floor(limit)));
    const rows = db
      .prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?')
      .all(safeLimit) as Record<string, unknown>[];
    return rows.map(mapRowToAuditLog);
  }

  function findShopRow(idOrEmail: string): Record<string, unknown> | undefined {
    const trimmed = idOrEmail.trim();
    const normEmail = normalizeEmail(trimmed);
    const upperShopId = trimmed.toUpperCase();
    return db
      .prepare(`
        SELECT s.*,
          COALESCE((SELECT COUNT(*) FROM bills b WHERE b.owner_email = s.email), 0) AS bill_count,
          COALESCE((SELECT SUM(grand_total) FROM bills b WHERE b.owner_email = s.email), 0) AS revenue_total
        FROM shop_owners s
        WHERE s.email = ? OR UPPER(s.shop_id) = ? OR s.email_key = ?
        LIMIT 1
      `)
      .get(normEmail, upperShopId, trimmed) as Record<string, unknown> | undefined;
  }

  function listShops(): DbShopRecord[] {
    const rows = db
      .prepare(`
        SELECT s.*,
          COALESCE((SELECT COUNT(*) FROM bills b WHERE b.owner_email = s.email), 0) AS bill_count,
          COALESCE((SELECT SUM(grand_total) FROM bills b WHERE b.owner_email = s.email), 0) AS revenue_total
        FROM shop_owners s
        ORDER BY s.created_at DESC
      `)
      .all() as Record<string, unknown>[];
    return rows.map(mapRowToShop);
  }

  function getShopByIdOrEmail(idOrEmail: string): DbShopRecord | null {
    if (!idOrEmail || !idOrEmail.trim()) return null;
    const row = findShopRow(idOrEmail);
    if (row) return mapRowToShop(row);

    // Also resolve via employee email if caller passed an employee email
    const norm = normalizeEmail(idOrEmail);
    const empRow = db
      .prepare('SELECT shop_id FROM users WHERE email = ? LIMIT 1')
      .get(norm) as { shop_id: string } | undefined;
    if (empRow) {
      const shopRow = findShopRow(empRow.shop_id);
      return shopRow ? mapRowToShop(shopRow) : null;
    }
    return null;
  }

  function registerShop(input: RegisterShopDbInput, actorEmail: string = 'admin'): DbShopRecord {
    const email = normalizeEmail(input.email || '');
    if (!isValidEmailFormat(email)) {
      throw new DbValidationError('A valid individual owner email address is required.');
    }

    const shopName = (input.shopName || '').trim();
    const ownerName = (input.ownerName || '').trim();
    const phone = (input.phone || '').trim();
    const address = (input.address || '').trim();
    const gstin = (input.gstin || '').trim();
    const pin = (input.pin || '').trim();
    const ownerUid = (input.ownerUid || '').trim();
    const status: ShopStatus = input.status === 'inactive' ? 'inactive' : 'active';

    if (!shopName) throw new DbValidationError('Shop name is required.');
    if (!ownerName) throw new DbValidationError('Owner name is required.');
    if (!phone) throw new DbValidationError('Phone number is required.');
    if (!address) throw new DbValidationError('Shop address is required.');
    if (!isValidPinFormat(pin)) {
      throw new DbValidationError('Staff PIN must be 4 to 6 numeric digits.');
    }

    const existingEmail = db
      .prepare('SELECT shop_id, email FROM shop_owners WHERE email = ?')
      .get(email) as { shop_id: string; email: string } | undefined;
    if (existingEmail) {
      throw new DbConflictError(
        `Email "${email}" is already registered to Shop ID ${existingEmail.shop_id}. Each user must have a unique email.`
      );
    }

    const existingUser = db
      .prepare('SELECT shop_id FROM users WHERE email = ?')
      .get(email) as { shop_id: string } | undefined;
    if (existingUser) {
      throw new DbConflictError(
        `Email "${email}" is already registered under Shop ID ${existingUser.shop_id}.`
      );
    }

    const requestedShopId = (input.shopId || '').trim().toUpperCase();
    let shopId = requestedShopId || generateUniqueShopId(db);
    const existingShopId = db
      .prepare('SELECT email FROM shop_owners WHERE UPPER(shop_id) = ?')
      .get(shopId) as { email: string } | undefined;
    if (existingShopId) {
      if (requestedShopId) {
        throw new DbConflictError(`Shop ID "${shopId}" is already assigned to ${existingShopId.email}.`);
      }
      shopId = generateUniqueShopId(db);
    }

    const emailKey = emailToDocKey(email);
    const pinHash = hashPinBcrypt(pin);
    const nowIso = new Date().toISOString();
    const userUid = ownerUid || `usr_${emailKey}`;

    db.exec('BEGIN');
    try {
      db.prepare(`
        INSERT INTO shop_owners (
          email, email_key, shop_id, owner_uid, shop_name, owner_name, phone, address, gstin,
          tagline, tax_rate_percent, currency_symbol, pin_plain, pin_hash,
          status, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?)
      `).run(
        email,
        emailKey,
        shopId,
        ownerUid,
        shopName,
        ownerName,
        phone,
        address,
        gstin,
        'Fast & Reliable In-Store Billing',
        5.0,
        '₹',
        pinHash,
        status,
        status === 'active' ? 1 : 0,
        nowIso,
        nowIso
      );

      db.prepare(`
        INSERT INTO users (
          uid, firebase_uid, email, email_key, display_name, role, shop_id,
          pin_hash, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'owner', ?, ?, ?, ?, ?)
      `).run(
        userUid,
        ownerUid,
        email,
        emailKey,
        ownerName,
        shopId,
        pinHash,
        status === 'active' ? 1 : 0,
        nowIso,
        nowIso
      );

      recordAuditLog({
        shopId,
        actorEmail,
        actorRole: 'admin',
        action: 'admin_action',
        targetType: 'shop',
        targetId: shopId,
        afterData: { shopId, shopName, ownerName, email, status },
      });

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    return getShopByIdOrEmail(email)!;
  }

  function updateShop(
    idOrEmail: string,
    patch: Partial<{
      shopName: string;
      ownerName: string;
      email: string;
      ownerUid: string;
      phone: string;
      address: string;
      gstin: string;
      tagline: string;
      taxRatePercent: number;
      currencySymbol: string;
      status: ShopStatus;
      isActive: boolean;
      pin: string;
    }>,
    actor?: { uid?: string; email?: string; role?: string }
  ): DbShopRecord | null {
    const existing = getShopByIdOrEmail(idOrEmail);
    if (!existing) return null;

    let nextEmail = existing.email;
    let nextEmailKey = existing.emailKey;

    if (patch.email !== undefined) {
      const candidateEmail = normalizeEmail(patch.email);
      if (!isValidEmailFormat(candidateEmail)) {
        throw new DbValidationError('Please provide a valid owner email address.');
      }
      if (candidateEmail !== existing.email) {
        const collision = db
          .prepare('SELECT shop_id FROM shop_owners WHERE email = ?')
          .get(candidateEmail) as { shop_id: string } | undefined;
        if (collision) {
          throw new DbConflictError(
            `Email "${candidateEmail}" is already assigned to ${collision.shop_id}.`
          );
        }
        nextEmail = candidateEmail;
        nextEmailKey = emailToDocKey(candidateEmail);
      }
    }

    const nextShopName = patch.shopName !== undefined ? patch.shopName.trim() : existing.shopName;
    const nextOwnerName = patch.ownerName !== undefined ? patch.ownerName.trim() : existing.ownerName;
    const nextOwnerUid = patch.ownerUid !== undefined ? patch.ownerUid.trim() : existing.ownerUid;
    const nextPhone = patch.phone !== undefined ? patch.phone.trim() : existing.phone;
    const nextAddress = patch.address !== undefined ? patch.address.trim() : existing.address;
    const nextGstin = patch.gstin !== undefined ? patch.gstin.trim() : existing.gstin;
    const nextTagline = patch.tagline !== undefined ? patch.tagline.trim() : existing.tagline;
    const nextTaxRate =
      patch.taxRatePercent !== undefined && Number.isFinite(Number(patch.taxRatePercent))
        ? Number(patch.taxRatePercent)
        : existing.taxRatePercent;
    const nextCurrency =
      patch.currencySymbol !== undefined && patch.currencySymbol.trim()
        ? patch.currencySymbol.trim()
        : existing.currencySymbol;

    let nextStatus = existing.status;
    let nextIsActive = existing.isActive;
    if (patch.status !== undefined) {
      nextStatus = patch.status === 'inactive' ? 'inactive' : 'active';
      nextIsActive = nextStatus === 'active';
    } else if (patch.isActive !== undefined) {
      nextIsActive = Boolean(patch.isActive);
      nextStatus = nextIsActive ? 'active' : 'inactive';
    }

    let nextPinHash = existing.pinHash;
    const pinChanged = patch.pin !== undefined && patch.pin.trim() !== '';
    if (pinChanged) {
      const trimmedPin = patch.pin!.trim();
      if (!isValidPinFormat(trimmedPin)) {
        throw new DbValidationError('PIN must be 4 to 6 numeric digits.');
      }
      nextPinHash = hashPinBcrypt(trimmedPin);
    }

    const nowIso = new Date().toISOString();

    db.exec('BEGIN');
    try {
      db.prepare(`
        UPDATE shop_owners
        SET email = ?, email_key = ?, owner_uid = ?, shop_name = ?, owner_name = ?, phone = ?,
            address = ?, gstin = ?, tagline = ?, tax_rate_percent = ?, currency_symbol = ?,
            pin_plain = '', pin_hash = ?, status = ?, is_active = ?, updated_at = ?
        WHERE email = ?
      `).run(
        nextEmail,
        nextEmailKey,
        nextOwnerUid,
        nextShopName,
        nextOwnerName,
        nextPhone,
        nextAddress,
        nextGstin,
        nextTagline,
        nextTaxRate,
        nextCurrency,
        nextPinHash,
        nextStatus,
        nextIsActive ? 1 : 0,
        nowIso,
        existing.email
      );

      db.prepare(`
        UPDATE users
        SET email = ?, email_key = ?, display_name = ?, pin_hash = ?, is_active = ?, updated_at = ?
        WHERE email = ? AND role = 'owner'
      `).run(
        nextEmail,
        nextEmailKey,
        nextOwnerName,
        nextPinHash,
        nextIsActive ? 1 : 0,
        nowIso,
        existing.email
      );

      const actionName = pinChanged
        ? 'pin_reset'
        : nextIsActive !== existing.isActive
          ? nextIsActive
            ? 'shop_activated'
            : 'shop_suspended'
          : 'shop_settings_updated';

      recordAuditLog({
        shopId: existing.shopId,
        actorUid: actor?.uid || '',
        actorEmail: actor?.email || nextEmail,
        actorRole: actor?.role || 'owner',
        action: actionName,
        targetType: 'shop',
        targetId: existing.shopId,
        beforeData: {
          shopName: existing.shopName,
          status: existing.status,
          taxRatePercent: existing.taxRatePercent,
        },
        afterData: {
          shopName: nextShopName,
          status: nextStatus,
          taxRatePercent: nextTaxRate,
          pinUpdated: pinChanged,
        },
      });

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    return getShopByIdOrEmail(nextEmail);
  }

  function toggleShopStatus(idOrEmail: string, actorEmail: string = 'admin'): DbShopRecord | null {
    const existing = getShopByIdOrEmail(idOrEmail);
    if (!existing) return null;
    const nextStatus: ShopStatus = existing.isActive ? 'inactive' : 'active';
    const updated = updateShop(
      existing.email,
      { status: nextStatus, isActive: nextStatus === 'active' },
      { email: actorEmail, role: 'admin' }
    );
    if (!nextStatus || nextStatus === 'inactive') {
      db.prepare('DELETE FROM owner_sessions WHERE shop_id = ?').run(existing.shopId);
    }
    return updated;
  }

  function resetShopPin(
    idOrEmail: string,
    newPin: string,
    actorEmail: string = 'admin'
  ): DbShopRecord | null {
    const updated = updateShop(idOrEmail, { pin: newPin }, { email: actorEmail, role: 'admin' });
    if (updated) {
      db.prepare('DELETE FROM owner_sessions WHERE owner_email = ?').run(updated.email);
    }
    return updated;
  }

  function deleteShop(idOrEmail: string, actorEmail: string = 'admin'): boolean {
    const existing = getShopByIdOrEmail(idOrEmail);
    if (!existing) return false;

    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM users WHERE shop_id = ?').run(existing.shopId);
      const res = db.prepare('DELETE FROM shop_owners WHERE email = ?').run(existing.email);
      recordAuditLog({
        shopId: existing.shopId,
        actorEmail,
        actorRole: 'admin',
        action: 'shop_deleted',
        targetType: 'shop',
        targetId: existing.shopId,
        beforeData: { shopId: existing.shopId, shopName: existing.shopName, email: existing.email },
      });
      db.exec('COMMIT');
      return Number(res.changes) > 0;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  function verifyOwnerEmail(emailInput: string) {
    const cleanEmail = normalizeEmail(emailInput || '');
    if (!cleanEmail || !isValidEmailFormat(cleanEmail)) {
      return {
        validFormat: false,
        registered: false,
        isActive: false,
        email: cleanEmail,
        message: 'Please enter a valid Gmail or email address.',
      };
    }

    const userRow = db
      .prepare('SELECT * FROM users WHERE email = ? LIMIT 1')
      .get(cleanEmail) as Record<string, unknown> | undefined;

    const shop = getShopByIdOrEmail(userRow ? String(userRow.shop_id) : cleanEmail);

    if (!shop && !userRow) {
      return {
        validFormat: true,
        registered: false,
        isActive: false,
        email: cleanEmail,
        message: `Email "${cleanEmail}" is not registered with any shop. Contact your admin or shop owner to register it.`,
      };
    }

    const role: UserRole = userRow ? (userRow.role as UserRole) : 'owner';
    const userActive = userRow ? Number(userRow.is_active) === 1 : true;
    const isActive = Boolean(shop?.isActive && userActive);

    if (!shop?.isActive) {
      return {
        validFormat: true,
        registered: true,
        isActive: false,
        email: cleanEmail,
        role,
        displayName: userRow ? String(userRow.display_name) : shop?.ownerName,
        shopId: shop?.shopId,
        shopName: shop?.shopName,
        ownerName: shop?.ownerName,
        message: `Account "${cleanEmail}" belongs to ${shop?.shopName} (${shop?.shopId}), which is currently suspended.`,
      };
    }

    if (!userActive) {
      return {
        validFormat: true,
        registered: true,
        isActive: false,
        email: cleanEmail,
        role,
        displayName: userRow ? String(userRow.display_name) : shop.ownerName,
        shopId: shop.shopId,
        shopName: shop.shopName,
        ownerName: shop.ownerName,
        message: `Employee account "${cleanEmail}" is deactivated. Contact your shop owner.`,
      };
    }

    return {
      validFormat: true,
      registered: true,
      isActive: true,
      email: cleanEmail,
      role,
      displayName: userRow ? String(userRow.display_name) : shop.ownerName,
      shopId: shop.shopId,
      shopName: shop.shopName,
      ownerName: shop.ownerName,
      message: `${role === 'employee' ? 'Employee' : 'Owner'} Gmail verified! Assigned to ${shop.shopName} (${shop.shopId}).`,
    };
  }

  function verifyShopLogin(
    shopId: string,
    pin: string,
    email?: string,
    firebaseUid?: string
  ): {
    success: boolean;
    shop?: DbShopRecord;
    user?: DbUserRecord;
    error?: string;
  } {
    const cleanId = (shopId || '').trim().toUpperCase();
    const cleanPin = (pin || '').trim();
    const cleanEmail = email !== undefined ? normalizeEmail(email) : undefined;

    if (!cleanId) return { success: false, error: 'Please enter your Shop ID.' };
    if (!cleanPin) return { success: false, error: 'Please enter your staff PIN.' };

    const shop = getShopByIdOrEmail(cleanId);
    if (!shop) {
      return {
        success: false,
        error: `Shop ID "${cleanId}" not found. Please check with your administrator.`,
      };
    }

    let userRow: Record<string, unknown> | undefined;
    if (cleanEmail !== undefined) {
      if (!cleanEmail || !isValidEmailFormat(cleanEmail)) {
        return { success: false, error: 'Please enter a valid registered Gmail / email address.' };
      }
      userRow = db
        .prepare('SELECT * FROM users WHERE email = ? LIMIT 1')
        .get(cleanEmail) as Record<string, unknown> | undefined;

      if (!userRow) {
        return {
          success: false,
          error: `Gmail "${cleanEmail}" is not registered with any store.`,
        };
      }
      if (String(userRow.shop_id).toUpperCase() !== cleanId) {
        return {
          success: false,
          error: `Gmail "${cleanEmail}" does not match Shop ID ${cleanId}. Each email can only access its own assigned store.`,
        };
      }
    } else {
      userRow = db
        .prepare("SELECT * FROM users WHERE shop_id = ? AND role = 'owner' LIMIT 1")
        .get(shop.shopId) as Record<string, unknown> | undefined;
    }

    if (!shop.isActive) {
      return {
        success: false,
        error: `Shop "${shop.shopName}" (${shop.shopId}) has been DEACTIVATED by admin. Access is currently suspended.`,
      };
    }

    if (userRow && Number(userRow.is_active) !== 1) {
      return {
        success: false,
        error: `User account "${cleanEmail}" is deactivated. Contact your shop owner.`,
      };
    }

    const storedHash = userRow ? String(userRow.pin_hash) : shop.pinHash;
    const verification = verifyPinHash(cleanPin, storedHash);

    if (!verification.valid) {
      recordAuditLog({
        shopId: shop.shopId,
        actorUid: firebaseUid || (userRow ? String(userRow.uid) : ''),
        actorEmail: cleanEmail || shop.email,
        actorRole: userRow ? String(userRow.role) : 'owner',
        action: 'login_failed',
        targetType: 'auth',
        targetId: shop.shopId,
        afterData: { reason: 'incorrect_pin' },
      });
      return {
        success: false,
        error: `Incorrect staff PIN for Shop ID ${shop.shopId}. Please try again.`,
      };
    }

    const nowIso = new Date().toISOString();
    // Auto-upgrade legacy SHA-256 hash to salted bcrypt on successful login
    if (verification.needsRehash) {
      const bcryptHash = hashPinBcrypt(cleanPin);
      if (userRow) {
        db.prepare('UPDATE users SET pin_hash = ?, updated_at = ? WHERE email = ?').run(
          bcryptHash,
          nowIso,
          String(userRow.email)
        );
      }
      if (!userRow || userRow.role === 'owner') {
        db.prepare('UPDATE shop_owners SET pin_hash = ?, pin_plain = ?, updated_at = ? WHERE email = ?').run(
          bcryptHash,
          '',
          nowIso,
          shop.email
        );
      }
    }

    // Bind real Firebase Auth UID per Google account when provided
    const cleanFbUid = (firebaseUid || '').trim();
    if (cleanFbUid && userRow) {
      db.prepare('UPDATE users SET firebase_uid = ?, updated_at = ? WHERE email = ?').run(
        cleanFbUid,
        nowIso,
        String(userRow.email)
      );
      if (userRow.role === 'owner') {
        db.prepare('UPDATE shop_owners SET owner_uid = ?, updated_at = ? WHERE email = ?').run(
          cleanFbUid,
          nowIso,
          shop.email
        );
      }
    }

    const refreshedShop = getShopByIdOrEmail(shop.email)!;
    const refreshedUserRow = userRow
      ? (db.prepare('SELECT * FROM users WHERE email = ? LIMIT 1').get(String(userRow.email)) as Record<string, unknown>)
      : undefined;
    const mappedUser = refreshedUserRow ? mapRowToUser(refreshedUserRow, refreshedShop.email) : undefined;

    recordAuditLog({
      shopId: refreshedShop.shopId,
      actorUid: cleanFbUid || mappedUser?.uid || '',
      actorEmail: mappedUser?.email || refreshedShop.email,
      actorRole: mappedUser?.role || 'owner',
      action: mappedUser?.role === 'employee' ? 'employee_login' : 'owner_login',
      targetType: 'shop',
      targetId: refreshedShop.shopId,
      afterData: { firebaseUidLinked: Boolean(cleanFbUid) },
    });

    return { success: true, shop: refreshedShop, user: mappedUser };
  }

  function createOwnerSession(
    email: string,
    actor?: { uid?: string; email?: string; name?: string; role?: 'owner' | 'employee'; shopId?: string }
  ): string {
    const cleanActorEmail = normalizeEmail(actor?.email || email);
    const shop = getShopByIdOrEmail(actor?.shopId || email) || getShopByIdOrEmail(cleanActorEmail);
    const ownerEmail = shop ? shop.email : normalizeEmail(email);
    const role: 'owner' | 'employee' = actor?.role === 'employee' ? 'employee' : 'owner';

    const token = randomBytes(32).toString('hex');
    const now = Date.now();
    const createdAt = new Date(now).toISOString();
    const expiresAt = new Date(now + 24 * 60 * 60 * 1000).toISOString();

    db.prepare('DELETE FROM owner_sessions WHERE expires_at <= ?').run(createdAt);
    db.prepare(`
      INSERT INTO owner_sessions (
        token, owner_email, actor_uid, actor_email, actor_name, actor_role, shop_id, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      token,
      ownerEmail,
      actor?.uid || '',
      cleanActorEmail,
      actor?.name || shop?.ownerName || cleanActorEmail,
      role,
      actor?.shopId || shop?.shopId || '',
      createdAt,
      expiresAt
    );

    return token;
  }

  function getOwnerSessionContext(
    token: string,
    expectedOwnerEmailOrShopId?: string
  ): DbSessionContext | null {
    const cleanToken = (token || '').trim();
    if (!cleanToken) return null;

    const nowIso = new Date().toISOString();
    const row = db
      .prepare('SELECT * FROM owner_sessions WHERE token = ?')
      .get(cleanToken) as Record<string, unknown> | undefined;
    if (!row) return null;

    if (String(row.expires_at) <= nowIso) {
      db.prepare('DELETE FROM owner_sessions WHERE token = ?').run(cleanToken);
      return null;
    }

    const session: DbSessionContext = {
      token: cleanToken,
      ownerEmail: normalizeEmail(String(row.owner_email)),
      actorUid: String(row.actor_uid || ''),
      actorEmail: normalizeEmail(String(row.actor_email || row.owner_email)),
      actorName: String(row.actor_name || ''),
      role: row.actor_role === 'employee' ? 'employee' : 'owner',
      shopId: String(row.shop_id || ''),
      expiresAt: String(row.expires_at),
    };

    // Ensure actor & shop are still active
    const shop = getShopByIdOrEmail(session.ownerEmail);
    if (!shop || !shop.isActive) return null;
    if (session.actorEmail) {
      const userRow = db
        .prepare('SELECT is_active FROM users WHERE email = ? LIMIT 1')
        .get(session.actorEmail) as { is_active: number } | undefined;
      if (userRow && Number(userRow.is_active) !== 1) return null;
    }

    if (expectedOwnerEmailOrShopId) {
      const targetShop = getShopByIdOrEmail(expectedOwnerEmailOrShopId);
      if (!targetShop) return null;
      if (
        normalizeEmail(targetShop.email) !== session.ownerEmail &&
        targetShop.shopId.toUpperCase() !== session.shopId.toUpperCase()
      ) {
        return null;
      }
    }

    return session;
  }

  function validateOwnerSessionToken(token: string, expectedEmail: string): boolean {
    const cleanEmail = normalizeEmail(expectedEmail || '');
    if (!cleanEmail) return false;
    const ctx = getOwnerSessionContext(token, cleanEmail);
    if (!ctx) return false;
    return ctx.ownerEmail === cleanEmail || ctx.actorEmail === cleanEmail;
  }

  function revokeOwnerSession(token: string): void {
    const cleanToken = (token || '').trim();
    if (!cleanToken) return;
    db.prepare('DELETE FROM owner_sessions WHERE token = ?').run(cleanToken);
  }

  function createAdminSession(email: string, uid: string = 'adm_primary'): string {
    const token = randomBytes(32).toString('hex');
    const now = Date.now();
    const createdAt = new Date(now).toISOString();
    const expiresAt = new Date(now + 12 * 60 * 60 * 1000).toISOString();
    db.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').run(createdAt);
    db.prepare(`
      INSERT INTO admin_sessions (token, admin_uid, admin_email, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(token, uid, normalizeEmail(email), createdAt, expiresAt);
    return token;
  }

  function validateAdminSessionToken(token: string): { email: string; uid: string } | null {
    const cleanToken = (token || '').trim();
    if (!cleanToken) return null;
    const nowIso = new Date().toISOString();
    const row = db
      .prepare('SELECT admin_uid, admin_email, expires_at FROM admin_sessions WHERE token = ?')
      .get(cleanToken) as { admin_uid: string; admin_email: string; expires_at: string } | undefined;
    if (!row) return null;
    if (row.expires_at <= nowIso) {
      db.prepare('DELETE FROM admin_sessions WHERE token = ?').run(cleanToken);
      return null;
    }
    return { email: row.admin_email, uid: row.admin_uid };
  }

  function revokeAdminSession(token: string): void {
    const cleanToken = (token || '').trim();
    if (!cleanToken) return;
    db.prepare('DELETE FROM admin_sessions WHERE token = ?').run(cleanToken);
  }

  function listAdmins(): DbAdminRecord[] {
    const rows = db
      .prepare('SELECT * FROM admins ORDER BY created_at ASC')
      .all() as Record<string, unknown>[];
    return rows.map((r) => ({
      uid: String(r.uid),
      email: String(r.email),
      role: 'super_admin',
      isActive: Number(r.is_active) === 1,
      createdAt: String(r.created_at),
    }));
  }

  function upsertAdmin(
    input: { uid: string; email: string; isActive?: boolean },
    actorEmail: string = 'admin'
  ): DbAdminRecord {
    const cleanEmail = normalizeEmail(input.email);
    const cleanUid = (input.uid || '').trim();
    if (!isValidEmailFormat(cleanEmail)) {
      throw new DbValidationError('Valid admin email is required.');
    }
    if (!cleanUid) {
      throw new DbValidationError('Firebase UID is required for admin registration.');
    }
    const nowIso = new Date().toISOString();
    const isActive = input.isActive !== false ? 1 : 0;

    db.prepare(`
      INSERT OR REPLACE INTO admins (uid, email, role, is_active, created_at)
      VALUES (?, ?, 'super_admin', ?, COALESCE((SELECT created_at FROM admins WHERE uid = ?), ?))
    `).run(cleanUid, cleanEmail, isActive, cleanUid, nowIso);

    recordAuditLog({
      shopId: 'GLOBAL',
      actorEmail,
      actorRole: 'admin',
      action: 'admin_action',
      targetType: 'admin',
      targetId: cleanUid,
      afterData: { email: cleanEmail, isActive: isActive === 1 },
    });

    return {
      uid: cleanUid,
      email: cleanEmail,
      role: 'super_admin',
      isActive: isActive === 1,
      createdAt: nowIso,
    };
  }

  function listShopEmployees(shopIdOrEmail: string): DbUserRecord[] {
    const shop = getShopByIdOrEmail(shopIdOrEmail);
    if (!shop) return [];
    const rows = db
      .prepare("SELECT * FROM users WHERE shop_id = ? AND role = 'employee' ORDER BY created_at DESC")
      .all(shop.shopId) as Record<string, unknown>[];
    return rows.map((r) => mapRowToUser(r, shop.email));
  }

  function addShopEmployee(
    shopIdOrEmail: string,
    input: { email: string; displayName: string; pin: string; isActive?: boolean },
    actor?: { uid?: string; email?: string }
  ): DbUserRecord {
    const shop = getShopByIdOrEmail(shopIdOrEmail);
    if (!shop) {
      throw new DbValidationError(`Shop "${shopIdOrEmail}" not found.`);
    }

    const email = normalizeEmail(input.email || '');
    const displayName = (input.displayName || '').trim();
    const pin = (input.pin || '').trim();

    if (!isValidEmailFormat(email)) {
      throw new DbValidationError('Please enter a valid employee email address.');
    }
    if (!displayName) {
      throw new DbValidationError('Employee name is required.');
    }
    if (!isValidPinFormat(pin)) {
      throw new DbValidationError('Employee PIN must be 4 to 6 numeric digits.');
    }

    const collision = db
      .prepare('SELECT shop_id, role FROM users WHERE email = ?')
      .get(email) as { shop_id: string; role: string } | undefined;
    if (collision) {
      throw new DbConflictError(
        `Email "${email}" is already assigned (${collision.role} in ${collision.shop_id}).`
      );
    }

    const emailKey = emailToDocKey(email);
    const uid = `emp_${emailKey}_${randomBytes(3).toString('hex')}`;
    const pinHash = hashPinBcrypt(pin);
    const nowIso = new Date().toISOString();
    const isActive = input.isActive !== false ? 1 : 0;

    db.prepare(`
      INSERT INTO users (
        uid, firebase_uid, email, email_key, display_name, role, shop_id,
        pin_hash, is_active, created_at, updated_at
      ) VALUES (?, '', ?, ?, ?, 'employee', ?, ?, ?, ?, ?)
    `).run(uid, email, emailKey, displayName, shop.shopId, pinHash, isActive, nowIso, nowIso);

    recordAuditLog({
      shopId: shop.shopId,
      actorUid: actor?.uid || '',
      actorEmail: actor?.email || shop.email,
      actorRole: 'owner',
      action: 'employee_created',
      targetType: 'employee',
      targetId: uid,
      afterData: { email, displayName, shopId: shop.shopId, isActive: isActive === 1 },
    });

    const row = db.prepare('SELECT * FROM users WHERE uid = ?').get(uid) as Record<string, unknown>;
    return mapRowToUser(row, shop.email);
  }

  function updateShopEmployee(
    shopIdOrEmail: string,
    empUid: string,
    patch: Partial<{ displayName: string; email: string; isActive: boolean }>,
    actor?: { uid?: string; email?: string }
  ): DbUserRecord | null {
    const shop = getShopByIdOrEmail(shopIdOrEmail);
    if (!shop) return null;

    const existing = db
      .prepare("SELECT * FROM users WHERE uid = ? AND shop_id = ? AND role = 'employee'")
      .get(empUid, shop.shopId) as Record<string, unknown> | undefined;
    if (!existing) return null;

    const prevEmail = String(existing.email);
    let nextEmail = prevEmail;
    let nextEmailKey = String(existing.email_key);
    if (patch.email !== undefined) {
      const candidate = normalizeEmail(patch.email);
      if (!isValidEmailFormat(candidate)) {
        throw new DbValidationError('Please enter a valid employee email address.');
      }
      if (candidate !== prevEmail) {
        const collision = db.prepare('SELECT uid FROM users WHERE email = ?').get(candidate);
        if (collision) {
          throw new DbConflictError(`Email "${candidate}" is already in use.`);
        }
        nextEmail = candidate;
        nextEmailKey = emailToDocKey(candidate);
      }
    }

    const nextName =
      patch.displayName !== undefined ? patch.displayName.trim() : String(existing.display_name);
    if (!nextName) {
      throw new DbValidationError('Employee name cannot be empty.');
    }
    const nextIsActive =
      patch.isActive !== undefined ? (patch.isActive ? 1 : 0) : Number(existing.is_active);
    const nowIso = new Date().toISOString();

    db.prepare(`
      UPDATE users
      SET email = ?, email_key = ?, display_name = ?, is_active = ?, updated_at = ?
      WHERE uid = ? AND shop_id = ?
    `).run(nextEmail, nextEmailKey, nextName, nextIsActive, nowIso, empUid, shop.shopId);

    if (nextIsActive === 0) {
      db.prepare('DELETE FROM owner_sessions WHERE actor_email = ?').run(nextEmail);
    }

    recordAuditLog({
      shopId: shop.shopId,
      actorUid: actor?.uid || '',
      actorEmail: actor?.email || shop.email,
      actorRole: 'owner',
      action: 'employee_updated',
      targetType: 'employee',
      targetId: empUid,
      beforeData: {
        email: prevEmail,
        displayName: String(existing.display_name),
        isActive: Number(existing.is_active) === 1,
      },
      afterData: {
        email: nextEmail,
        displayName: nextName,
        isActive: nextIsActive === 1,
      },
    });

    const row = db.prepare('SELECT * FROM users WHERE uid = ?').get(empUid) as Record<string, unknown>;
    return mapRowToUser(row, shop.email);
  }

  function toggleEmployeeStatus(
    shopIdOrEmail: string,
    empUid: string,
    actor?: { uid?: string; email?: string }
  ): DbUserRecord | null {
    const shop = getShopByIdOrEmail(shopIdOrEmail);
    if (!shop) return null;
    const existing = db
      .prepare("SELECT is_active FROM users WHERE uid = ? AND shop_id = ? AND role = 'employee'")
      .get(empUid, shop.shopId) as { is_active: number } | undefined;
    if (!existing) return null;
    return updateShopEmployee(shop.shopId, empUid, { isActive: Number(existing.is_active) !== 1 }, actor);
  }

  function resetEmployeePin(
    shopIdOrEmail: string,
    empUid: string,
    newPin: string,
    actor?: { uid?: string; email?: string }
  ): DbUserRecord | null {
    const shop = getShopByIdOrEmail(shopIdOrEmail);
    if (!shop) return null;
    if (!isValidPinFormat(newPin)) {
      throw new DbValidationError('Employee PIN must be 4 to 6 numeric digits.');
    }
    const existing = db
      .prepare("SELECT * FROM users WHERE uid = ? AND shop_id = ? AND role = 'employee'")
      .get(empUid, shop.shopId) as Record<string, unknown> | undefined;
    if (!existing) return null;

    const pinHash = hashPinBcrypt(newPin);
    const nowIso = new Date().toISOString();
    db.prepare('UPDATE users SET pin_hash = ?, updated_at = ? WHERE uid = ?').run(
      pinHash,
      nowIso,
      empUid
    );
    db.prepare('DELETE FROM owner_sessions WHERE actor_email = ?').run(String(existing.email));

    recordAuditLog({
      shopId: shop.shopId,
      actorUid: actor?.uid || '',
      actorEmail: actor?.email || shop.email,
      actorRole: 'owner',
      action: 'pin_reset',
      targetType: 'employee',
      targetId: empUid,
      afterData: { employeeEmail: String(existing.email) },
    });

    const row = db.prepare('SELECT * FROM users WHERE uid = ?').get(empUid) as Record<string, unknown>;
    return mapRowToUser(row, shop.email);
  }

  function deleteShopEmployee(
    shopIdOrEmail: string,
    empUid: string,
    actor?: { uid?: string; email?: string }
  ): boolean {
    const shop = getShopByIdOrEmail(shopIdOrEmail);
    if (!shop) return false;
    const existing = db
      .prepare("SELECT * FROM users WHERE uid = ? AND shop_id = ? AND role = 'employee'")
      .get(empUid, shop.shopId) as Record<string, unknown> | undefined;
    if (!existing) return false;

    db.prepare('DELETE FROM owner_sessions WHERE actor_email = ?').run(String(existing.email));
    const res = db
      .prepare("DELETE FROM users WHERE uid = ? AND shop_id = ? AND role = 'employee'")
      .run(empUid, shop.shopId);

    if (Number(res.changes) > 0) {
      recordAuditLog({
        shopId: shop.shopId,
        actorUid: actor?.uid || '',
        actorEmail: actor?.email || shop.email,
        actorRole: 'owner',
        action: 'employee_deleted',
        targetType: 'employee',
        targetId: empUid,
        beforeData: { email: String(existing.email), displayName: String(existing.display_name) },
      });
      return true;
    }
    return false;
  }

  function mapRowToItem(r: Record<string, unknown>, shopId: string): DbItemRecord {
    return {
      id: String(r.id),
      ownerEmail: String(r.owner_email),
      shopId,
      name: String(r.name),
      code: String(r.code || ''),
      price: Number(r.price),
      stock: Number(r.stock),
      category: String(r.category || 'General'),
      unit: (r.unit === 'kg' ? 'kg' : 'pcs') as ItemUnit,
      updatedAt: String(r.updated_at),
      syncStatus: r.sync_status === 'synced' ? 'synced' : 'pending',
      syncedAt: r.synced_at ? String(r.synced_at) : null,
      syncError: r.sync_error ? String(r.sync_error) : null,
    };
  }

  function mapRowsToBills(
    ownerEmail: string,
    shopId: string,
    billRows: Record<string, unknown>[]
  ): DbBillRecord[] {
    const billItemStmt = db.prepare(
      'SELECT * FROM bill_items WHERE owner_email = ? AND bill_id = ? ORDER BY seq ASC'
    );
    return billRows.map((b) => {
      const billId = String(b.id);
      const lineRows = billItemStmt.all(ownerEmail, billId) as Record<string, unknown>[];
      return {
        id: billId,
        ownerEmail: String(b.owner_email),
        shopId,
        billNumber: String(b.bill_number),
        createdAt: String(b.created_at),
        customerName: String(b.customer_name || ''),
        customerPhone: String(b.customer_phone || ''),
        subtotal: Number(b.subtotal),
        discountAmount: Number(b.discount_amount),
        taxAmount: Number(b.tax_amount),
        grandTotal: Number(b.grand_total),
        paymentMethod: (b.payment_method as PaymentMode) || 'Cash',
        cashierName: String(b.cashier_name),
        actorUid: String(b.actor_uid || ''),
        syncStatus: b.sync_status === 'synced' ? 'synced' : 'pending',
        syncedAt: b.synced_at ? String(b.synced_at) : null,
        syncError: b.sync_error ? String(b.sync_error) : null,
        items: lineRows.map((line) => ({
          itemId: String(line.item_id),
          name: String(line.name),
          code: String(line.code || ''),
          unitPrice: Number(line.unit_price),
          quantity: Number(line.quantity),
          unit: (line.unit === 'kg' ? 'kg' : 'pcs') as ItemUnit,
        })),
      };
    });
  }

  function getOwnerWorkspace(idOrEmail: string): DbOwnerWorkspace | null {
    const shop = getShopByIdOrEmail(idOrEmail);
    if (!shop) return null;

    const itemRows = db
      .prepare('SELECT * FROM items WHERE owner_email = ? ORDER BY updated_at DESC, name ASC')
      .all(shop.email) as Record<string, unknown>[];
    const items = itemRows.map((r) => mapRowToItem(r, shop.shopId));

    const billRows = db
      .prepare('SELECT * FROM bills WHERE owner_email = ? ORDER BY created_at DESC')
      .all(shop.email) as Record<string, unknown>[];
    const bills = mapRowsToBills(shop.email, shop.shopId, billRows);
    const employees = listShopEmployees(shop.shopId);

    return { shop, items, bills, employees };
  }

  function saveOwnerItem(
    idOrEmail: string,
    item: Omit<DbItemRecord, 'ownerEmail' | 'shopId' | 'updatedAt' | 'syncStatus' | 'syncedAt' | 'syncError'> &
      Partial<Pick<DbItemRecord, 'updatedAt'>>,
    actor?: { uid?: string; email?: string; role?: string }
  ): DbItemRecord {
    const shop = getShopByIdOrEmail(idOrEmail);
    if (!shop) {
      throw new DbValidationError(`Shop owner account "${idOrEmail}" not found.`);
    }
    const cleanId = (item.id || `i_${Date.now()}`).trim();
    const unit: ItemUnit = item.unit === 'kg' ? 'kg' : 'pcs';

    const existingRow = db
      .prepare('SELECT * FROM items WHERE owner_email = ? AND id = ?')
      .get(shop.email, cleanId) as Record<string, unknown> | undefined;

    // Conflict protection: if caller sends an older timestamp than existing synced state, keep newest
    const nowIso = new Date().toISOString();
    if (
      existingRow &&
      item.updatedAt &&
      String(existingRow.updated_at) > item.updatedAt
    ) {
      return mapRowToItem(existingRow, shop.shopId);
    }

    const nextPrice = Math.max(0, Number(item.price) || 0);
    const nextStock = Math.max(0, Number(item.stock) || 0);

    db.prepare(`
      INSERT OR REPLACE INTO items (
        id, owner_email, name, code, price, stock, category, unit,
        updated_at, sync_status, synced_at, sync_error
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL)
    `).run(
      cleanId,
      shop.email,
      item.name.trim(),
      (item.code || '').trim(),
      nextPrice,
      nextStock,
      (item.category || 'General').trim(),
      unit,
      nowIso
    );

    const stockChanged = existingRow && Number(existingRow.stock) !== nextStock;
    recordAuditLog({
      shopId: shop.shopId,
      actorUid: actor?.uid || '',
      actorEmail: actor?.email || shop.email,
      actorRole: actor?.role || 'owner',
      action: existingRow ? (stockChanged ? 'stock_adjusted' : 'item_updated') : 'item_created',
      targetType: 'item',
      targetId: cleanId,
      beforeData: existingRow
        ? { name: String(existingRow.name), price: Number(existingRow.price), stock: Number(existingRow.stock) }
        : null,
      afterData: { name: item.name.trim(), price: nextPrice, stock: nextStock, unit },
    });

    return {
      id: cleanId,
      ownerEmail: shop.email,
      shopId: shop.shopId,
      name: item.name.trim(),
      code: (item.code || '').trim(),
      price: nextPrice,
      stock: nextStock,
      category: (item.category || 'General').trim(),
      unit,
      updatedAt: nowIso,
      syncStatus: 'pending',
      syncedAt: null,
      syncError: null,
    };
  }

  function deleteOwnerItem(
    idOrEmail: string,
    itemId: string,
    actor?: { uid?: string; email?: string; role?: string }
  ): boolean {
    const shop = getShopByIdOrEmail(idOrEmail);
    if (!shop) return false;
    const existingRow = db
      .prepare('SELECT * FROM items WHERE owner_email = ? AND id = ?')
      .get(shop.email, itemId) as Record<string, unknown> | undefined;
    const res = db
      .prepare('DELETE FROM items WHERE owner_email = ? AND id = ?')
      .run(shop.email, itemId);
    if (Number(res.changes) > 0) {
      recordAuditLog({
        shopId: shop.shopId,
        actorUid: actor?.uid || '',
        actorEmail: actor?.email || shop.email,
        actorRole: actor?.role || 'owner',
        action: 'item_deleted',
        targetType: 'item',
        targetId: itemId,
        beforeData: existingRow ? { name: String(existingRow.name), price: Number(existingRow.price) } : null,
      });
      return true;
    }
    return false;
  }

  function createOwnerBill(
    idOrEmail: string,
    bill: Omit<DbBillRecord, 'ownerEmail' | 'shopId' | 'syncStatus' | 'syncedAt' | 'syncError'> &
      Partial<Pick<DbBillRecord, 'syncStatus' | 'syncedAt' | 'syncError'>>,
    actor?: { uid?: string; email?: string; role?: string }
  ): DbBillRecord {
    const shop = getShopByIdOrEmail(idOrEmail);
    if (!shop) {
      throw new DbValidationError(`Shop owner account "${idOrEmail}" not found.`);
    }
    const cleanId = (bill.id || `b_${Date.now()}`).trim();
    const createdAt = bill.createdAt || new Date().toISOString();

    // Duplicate bill prevention by ID or billNumber
    const existingBill = db
      .prepare('SELECT id FROM bills WHERE owner_email = ? AND (id = ? OR bill_number = ?)')
      .get(shop.email, cleanId, bill.billNumber) as { id: string } | undefined;

    if (existingBill) {
      const rows = db
        .prepare('SELECT * FROM bills WHERE owner_email = ? AND id = ?')
        .all(shop.email, existingBill.id) as Record<string, unknown>[];
      return mapRowsToBills(shop.email, shop.shopId, rows)[0];
    }

    const syncStatus: SyncStatus = bill.syncStatus === 'synced' ? 'synced' : 'pending';
    const syncedAt = syncStatus === 'synced' ? bill.syncedAt || new Date().toISOString() : null;
    const actorUid = actor?.uid || bill.actorUid || '';

    db.exec('BEGIN');
    try {
      db.prepare(`
        INSERT INTO bills (
          id, owner_email, bill_number, customer_name, customer_phone,
          subtotal, discount_amount, tax_amount, grand_total,
          payment_method, cashier_name, actor_uid, created_at, sync_status, synced_at, sync_error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `).run(
        cleanId,
        shop.email,
        bill.billNumber,
        bill.customerName || '',
        bill.customerPhone || '',
        Number(bill.subtotal) || 0,
        Number(bill.discountAmount) || 0,
        Number(bill.taxAmount) || 0,
        Number(bill.grandTotal) || 0,
        bill.paymentMethod || 'Cash',
        bill.cashierName || shop.ownerName,
        actorUid,
        createdAt,
        syncStatus,
        syncedAt
      );

      const insertLine = db.prepare(`
        INSERT INTO bill_items (owner_email, bill_id, item_id, name, code, unit_price, quantity, unit)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const deductStock = db.prepare(`
        UPDATE items
        SET stock = MAX(0, stock - ?), updated_at = ?, sync_status = 'pending', synced_at = NULL
        WHERE owner_email = ? AND id = ?
      `);

      for (const line of bill.items || []) {
        insertLine.run(
          shop.email,
          cleanId,
          line.itemId,
          line.name,
          line.code || '',
          Number(line.unitPrice) || 0,
          Number(line.quantity) || 0,
          line.unit === 'kg' ? 'kg' : 'pcs'
        );
        deductStock.run(Number(line.quantity) || 0, createdAt, shop.email, line.itemId);
      }

      recordAuditLog({
        shopId: shop.shopId,
        actorUid,
        actorEmail: actor?.email || shop.email,
        actorRole: actor?.role || 'owner',
        action: 'bill_created',
        targetType: 'bill',
        targetId: cleanId,
        afterData: {
          billNumber: bill.billNumber,
          grandTotal: Number(bill.grandTotal) || 0,
          paymentMethod: bill.paymentMethod || 'Cash',
          itemsCount: (bill.items || []).length,
        },
      });

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    return {
      ...bill,
      id: cleanId,
      ownerEmail: shop.email,
      shopId: shop.shopId,
      createdAt,
      customerName: bill.customerName || '',
      customerPhone: bill.customerPhone || '',
      actorUid,
      syncStatus,
      syncedAt,
      syncError: null,
    };
  }

  function getPendingSyncForOwner(idOrEmail: string): DbPendingSyncResult | null {
    const shop = getShopByIdOrEmail(idOrEmail);
    if (!shop) return null;

    const itemRows = db
      .prepare(
        "SELECT * FROM items WHERE owner_email = ? AND sync_status = 'pending' ORDER BY updated_at ASC"
      )
      .all(shop.email) as Record<string, unknown>[];
    const billRows = db
      .prepare(
        "SELECT * FROM bills WHERE owner_email = ? AND sync_status = 'pending' ORDER BY created_at ASC"
      )
      .all(shop.email) as Record<string, unknown>[];

    return {
      shop,
      items: itemRows.map((r) => mapRowToItem(r, shop.shopId)),
      bills: mapRowsToBills(shop.email, shop.shopId, billRows),
    };
  }

  function markOwnerRecordsSynced(
    idOrEmail: string,
    payload: {
      itemIds?: string[];
      billIds?: string[];
      errors?: Array<{ id: string; type: 'item' | 'bill'; error: string }>;
    }
  ): { syncedItems: number; syncedBills: number; lastSyncedAt: string } {
    const shop = getShopByIdOrEmail(idOrEmail);
    if (!shop) {
      throw new DbValidationError(`Shop owner account "${idOrEmail}" not found.`);
    }
    const nowIso = new Date().toISOString();
    let syncedItems = 0;
    let syncedBills = 0;

    db.exec('BEGIN');
    try {
      const markItemStmt = db.prepare(`
        UPDATE items
        SET sync_status = 'synced', synced_at = ?, sync_error = NULL
        WHERE owner_email = ? AND id = ?
      `);
      for (const itemId of payload.itemIds || []) {
        const res = markItemStmt.run(nowIso, shop.email, itemId);
        syncedItems += Number(res.changes);
      }

      const markBillStmt = db.prepare(`
        UPDATE bills
        SET sync_status = 'synced', synced_at = ?, sync_error = NULL
        WHERE owner_email = ? AND id = ?
      `);
      for (const billId of payload.billIds || []) {
        const res = markBillStmt.run(nowIso, shop.email, billId);
        syncedBills += Number(res.changes);
      }

      const markItemErrStmt = db.prepare(`
        UPDATE items SET sync_error = ? WHERE owner_email = ? AND id = ?
      `);
      const markBillErrStmt = db.prepare(`
        UPDATE bills SET sync_error = ? WHERE owner_email = ? AND id = ?
      `);
      for (const entry of payload.errors || []) {
        if (entry.type === 'item') {
          markItemErrStmt.run(entry.error.slice(0, 300), shop.email, entry.id);
        } else {
          markBillErrStmt.run(entry.error.slice(0, 300), shop.email, entry.id);
        }
      }

      if (syncedItems > 0 || syncedBills > 0) {
        db.prepare('UPDATE shop_owners SET last_synced_at = ? WHERE email = ?').run(nowIso, shop.email);
      }

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    return { syncedItems, syncedBills, lastSyncedAt: nowIso };
  }

  function exportShopBackup(
    shopIdOrEmail: string,
    actorEmail: string,
    source: 'sqlite' | 'firestore' | 'hybrid' = 'sqlite'
  ): ShopBackupBundle {
    const ws = getOwnerWorkspace(shopIdOrEmail);
    if (!ws) {
      throw new DbValidationError(`Shop "${shopIdOrEmail}" not found.`);
    }

    const base: Omit<ShopBackupBundle, 'checksum'> = {
      backupVersion: 1,
      exportedAt: new Date().toISOString(),
      source,
      shop: {
        shopId: ws.shop.shopId,
        shopName: ws.shop.shopName,
        ownerName: ws.shop.ownerName,
        ownerEmail: ws.shop.email,
        phone: ws.shop.phone,
        address: ws.shop.address,
        gstin: ws.shop.gstin,
        tagline: ws.shop.tagline,
        taxRatePercent: ws.shop.taxRatePercent,
        currencySymbol: ws.shop.currencySymbol,
      },
      items: ws.items.map((i) => ({
        id: i.id,
        name: i.name,
        code: i.code,
        price: i.price,
        stock: i.stock,
        category: i.category,
        unit: i.unit,
        updatedAt: i.updatedAt,
      })),
      bills: ws.bills.map((b) => ({
        id: b.id,
        billNumber: b.billNumber,
        createdAt: b.createdAt,
        customerName: b.customerName,
        customerPhone: b.customerPhone,
        subtotal: b.subtotal,
        discountAmount: b.discountAmount,
        taxAmount: b.taxAmount,
        grandTotal: b.grandTotal,
        paymentMethod: b.paymentMethod,
        cashierName: b.cashierName,
        items: b.items,
      })),
      employees: ws.employees.map((e) => ({
        uid: e.uid,
        email: e.email,
        displayName: e.displayName,
        role: 'employee',
        isActive: e.isActive,
        createdAt: e.createdAt,
      })),
    };

    const checksum = computeBackupSummarySignature(base);
    const bundle: ShopBackupBundle = { ...base, checksum };

    const historyId = `bak_${Date.now()}_${randomBytes(3).toString('hex')}`;
    db.prepare(`
      INSERT INTO backup_history (
        id, shop_id, actor_email, source, items_count, bills_count, employees_count, checksum, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      historyId,
      ws.shop.shopId,
      normalizeEmail(actorEmail),
      source,
      bundle.items.length,
      bundle.bills.length,
      (bundle.employees || []).length,
      checksum,
      bundle.exportedAt
    );

    recordAuditLog({
      shopId: ws.shop.shopId,
      actorEmail,
      actorRole: 'owner',
      action: 'backup_created',
      targetType: 'backup',
      targetId: historyId,
      afterData: {
        source,
        itemsCount: bundle.items.length,
        billsCount: bundle.bills.length,
        checksum,
      },
    });

    return bundle;
  }

  function restoreShopBackup(
    shopIdOrEmail: string,
    rawBundle: unknown,
    actorEmail: string
  ): { workspace: DbOwnerWorkspace; restoredItems: number; restoredBills: number } {
    const shop = getShopByIdOrEmail(shopIdOrEmail);
    if (!shop) {
      throw new DbValidationError(`Shop "${shopIdOrEmail}" not found.`);
    }

    const validation = validateBackupBundle(rawBundle, shop.shopId);
    if (!validation.valid || !validation.bundle) {
      throw new DbValidationError(validation.errors[0] || 'Invalid backup file.');
    }
    const bundle = validation.bundle;
    const nowIso = new Date().toISOString();

    db.exec('BEGIN');
    try {
      db.prepare(`
        UPDATE shop_owners
        SET shop_name = ?, phone = ?, address = ?, gstin = ?, tagline = ?,
            tax_rate_percent = ?, currency_symbol = ?, updated_at = ?
        WHERE email = ?
      `).run(
        bundle.shop.shopName.trim(),
        (bundle.shop.phone || shop.phone).trim(),
        (bundle.shop.address || shop.address).trim(),
        (bundle.shop.gstin || '').trim(),
        (bundle.shop.tagline || shop.tagline).trim(),
        Number(bundle.shop.taxRatePercent ?? shop.taxRatePercent),
        (bundle.shop.currencySymbol || shop.currencySymbol).trim(),
        nowIso,
        shop.email
      );

      db.prepare('DELETE FROM bill_items WHERE owner_email = ?').run(shop.email);
      db.prepare('DELETE FROM bills WHERE owner_email = ?').run(shop.email);
      db.prepare('DELETE FROM items WHERE owner_email = ?').run(shop.email);

      const insertItem = db.prepare(`
        INSERT INTO items (
          id, owner_email, name, code, price, stock, category, unit,
          updated_at, sync_status, synced_at, sync_error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL)
      `);
      for (const item of bundle.items) {
        insertItem.run(
          item.id.trim(),
          shop.email,
          item.name.trim(),
          (item.code || '').trim(),
          Number(item.price) || 0,
          Number(item.stock) || 0,
          (item.category || 'General').trim(),
          item.unit === 'kg' ? 'kg' : 'pcs',
          item.updatedAt || nowIso
        );
      }

      const insertBill = db.prepare(`
        INSERT INTO bills (
          id, owner_email, bill_number, customer_name, customer_phone,
          subtotal, discount_amount, tax_amount, grand_total,
          payment_method, cashier_name, actor_uid, created_at, sync_status, synced_at, sync_error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, 'pending', NULL, NULL)
      `);
      const insertLine = db.prepare(`
        INSERT INTO bill_items (owner_email, bill_id, item_id, name, code, unit_price, quantity, unit)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const bill of bundle.bills) {
        insertBill.run(
          bill.id.trim(),
          shop.email,
          bill.billNumber.trim(),
          bill.customerName || '',
          bill.customerPhone || '',
          Number(bill.subtotal) || 0,
          Number(bill.discountAmount) || 0,
          Number(bill.taxAmount) || 0,
          Number(bill.grandTotal) || 0,
          bill.paymentMethod || 'Cash',
          bill.cashierName || shop.ownerName,
          bill.createdAt || nowIso
        );
        for (const line of bill.items || []) {
          insertLine.run(
            shop.email,
            bill.id.trim(),
            line.itemId,
            line.name,
            line.code || '',
            Number(line.unitPrice) || 0,
            Number(line.quantity) || 0,
            line.unit === 'kg' ? 'kg' : 'pcs'
          );
        }
      }

      recordAuditLog({
        shopId: shop.shopId,
        actorEmail,
        actorRole: 'owner',
        action: 'backup_restored',
        targetType: 'backup',
        targetId: bundle.checksum || bundle.exportedAt,
        afterData: {
          restoredItems: bundle.items.length,
          restoredBills: bundle.bills.length,
          source: bundle.source,
        },
      });

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    return {
      workspace: getOwnerWorkspace(shop.email)!,
      restoredItems: bundle.items.length,
      restoredBills: bundle.bills.length,
    };
  }

  function listBackupHistory(shopIdOrEmail: string): DbBackupHistoryRecord[] {
    const shop = getShopByIdOrEmail(shopIdOrEmail);
    if (!shop) return [];
    const rows = db
      .prepare('SELECT * FROM backup_history WHERE shop_id = ? ORDER BY created_at DESC LIMIT 50')
      .all(shop.shopId) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: String(r.id),
      shopId: String(r.shop_id),
      actorEmail: String(r.actor_email),
      source: String(r.source),
      itemsCount: Number(r.items_count),
      billsCount: Number(r.bills_count),
      employeesCount: Number(r.employees_count),
      checksum: String(r.checksum),
      createdAt: String(r.created_at),
    }));
  }

  function resetOwnerWorkspace(idOrEmail: string): DbOwnerWorkspace | null {
    const shop = getShopByIdOrEmail(idOrEmail);
    if (!shop) return null;

    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM bill_items WHERE owner_email = ?').run(shop.email);
      db.prepare('DELETE FROM bills WHERE owner_email = ?').run(shop.email);
      db.prepare('DELETE FROM items WHERE owner_email = ?').run(shop.email);
      seedDefaultCatalogForEmail(shop.email);
      if (shop.email === 'rajesh@quickmart.in') {
        seedDefaultBillsForQuickMart();
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    return getOwnerWorkspace(shop.email);
  }

  function upsertShopFromVerifiedCloud(cloudShop: {
    shopId: string;
    email: string;
    emailKey?: string;
    ownerUid?: string;
    shopName: string;
    ownerName: string;
    phone?: string;
    address?: string;
    gstin?: string;
    tagline?: string;
    taxRatePercent?: number;
    currencySymbol?: string;
    pinHash?: string;
    status?: ShopStatus;
    isActive?: boolean;
    createdAt?: string;
    updatedAt?: string;
  }): DbShopRecord | null {
    const cleanEmail = normalizeEmail(cloudShop.email || '');
    const cleanShopId = (cloudShop.shopId || '').trim().toUpperCase();
    if (!cleanEmail || !isValidEmailFormat(cleanEmail) || !cleanShopId) {
      return null;
    }
    const existing = getShopByIdOrEmail(cleanShopId) || getShopByIdOrEmail(cleanEmail);
    const nowIso = new Date().toISOString();
    const cloudUpdatedMs = cloudShop.updatedAt ? new Date(cloudShop.updatedAt).getTime() : 0;

    if (!existing) {
      const emailKey = (cloudShop.emailKey || emailToDocKey(cleanEmail)).trim();
      const status: ShopStatus = cloudShop.status === 'inactive' || cloudShop.isActive === false ? 'inactive' : 'active';
      const isActive = status === 'active' ? 1 : 0;
      const pinHash =
        cloudShop.pinHash && cloudShop.pinHash.length >= 16
          ? cloudShop.pinHash
          : hashPinBcrypt('1234');
      const createdAt = cloudShop.createdAt || nowIso;
      const updatedAt = cloudShop.updatedAt || nowIso;

      db.exec('BEGIN');
      try {
        db.prepare(`
          INSERT INTO shop_owners (
            email, email_key, shop_id, owner_uid, shop_name, owner_name, phone, address, gstin,
            tagline, tax_rate_percent, currency_symbol, pin_plain, pin_hash,
            status, is_active, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?)
        `).run(
          cleanEmail,
          emailKey,
          cleanShopId,
          (cloudShop.ownerUid || '').trim(),
          (cloudShop.shopName || 'BillKart Store').trim(),
          (cloudShop.ownerName || 'Owner').trim(),
          (cloudShop.phone || '').trim(),
          (cloudShop.address || '').trim(),
          (cloudShop.gstin || '').trim(),
          (cloudShop.tagline || 'Fast & Reliable In-Store Billing').trim(),
          Number.isFinite(Number(cloudShop.taxRatePercent)) ? Number(cloudShop.taxRatePercent) : 5.0,
          (cloudShop.currencySymbol || '₹').trim(),
          pinHash,
          status,
          isActive,
          createdAt,
          updatedAt
        );
        db.prepare(`
          INSERT OR REPLACE INTO users (
            uid, firebase_uid, email, email_key, display_name, role, shop_id,
            pin_hash, is_active, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 'owner', ?, ?, ?, ?, ?)
        `).run(
          `usr_${emailKey}`,
          (cloudShop.ownerUid || '').trim(),
          cleanEmail,
          emailKey,
          (cloudShop.ownerName || 'Owner').trim(),
          cleanShopId,
          pinHash,
          isActive,
          createdAt,
          updatedAt
        );
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
      return getShopByIdOrEmail(cleanEmail);
    }

    const localUpdatedMs = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
    const hasNewerTimestamp = cloudUpdatedMs > localUpdatedMs;
    const hasDifferentPin =
      Boolean(cloudShop.pinHash && cloudShop.pinHash.length >= 16) &&
      cloudShop.pinHash !== existing.pinHash &&
      cloudUpdatedMs >= localUpdatedMs;

    if (!hasNewerTimestamp && !hasDifferentPin) {
      return existing;
    }

    const nextPinHash =
      cloudShop.pinHash && cloudShop.pinHash.length >= 16 ? cloudShop.pinHash : existing.pinHash;
    const nextStatus: ShopStatus =
      cloudShop.status === 'inactive' || cloudShop.isActive === false
        ? 'inactive'
        : cloudShop.status === 'active' || cloudShop.isActive === true
          ? 'active'
          : existing.status;
    const nextIsActive = nextStatus === 'active' ? 1 : 0;
    const nextUpdatedAt = cloudShop.updatedAt || nowIso;

    db.exec('BEGIN');
    try {
      db.prepare(`
        UPDATE shop_owners
        SET shop_name = ?, owner_name = ?, phone = ?, address = ?, gstin = ?,
            tagline = ?, tax_rate_percent = ?, currency_symbol = ?,
            owner_uid = COALESCE(NULLIF(?, ''), owner_uid),
            pin_hash = ?, status = ?, is_active = ?, updated_at = ?
        WHERE email = ?
      `).run(
        (cloudShop.shopName || existing.shopName).trim(),
        (cloudShop.ownerName || existing.ownerName).trim(),
        cloudShop.phone !== undefined ? cloudShop.phone.trim() : existing.phone,
        cloudShop.address !== undefined ? cloudShop.address.trim() : existing.address,
        cloudShop.gstin !== undefined ? cloudShop.gstin.trim() : existing.gstin,
        cloudShop.tagline !== undefined ? cloudShop.tagline.trim() : existing.tagline,
        cloudShop.taxRatePercent !== undefined && Number.isFinite(Number(cloudShop.taxRatePercent))
          ? Number(cloudShop.taxRatePercent)
          : existing.taxRatePercent,
        cloudShop.currencySymbol ? cloudShop.currencySymbol.trim() : existing.currencySymbol,
        (cloudShop.ownerUid || '').trim(),
        nextPinHash,
        nextStatus,
        nextIsActive,
        nextUpdatedAt,
        existing.email
      );
      db.prepare(`
        UPDATE users
        SET pin_hash = ?, is_active = ?, updated_at = ?
        WHERE email = ? AND role = 'owner'
      `).run(nextPinHash, nextIsActive, nextUpdatedAt, existing.email);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    return getShopByIdOrEmail(existing.email);
  }

  function mergeCloudDataForOwner(
    idOrEmail: string,
    cloudData: {
      shop?: {
        shopName?: string;
        ownerName?: string;
        phone?: string;
        address?: string;
        gstin?: string;
        tagline?: string;
        taxRatePercent?: number;
        currencySymbol?: string;
        pinHash?: string;
        status?: ShopStatus;
        isActive?: boolean;
        updatedAt?: string;
      } | null;
      items?: Array<{
        id: string;
        name: string;
        code?: string;
        price: number;
        stock: number;
        category?: string;
        unit?: string;
        updatedAt?: string;
      }>;
      bills?: Array<{
        id: string;
        billNumber: string;
        createdAt?: string;
        customerName?: string;
        customerPhone?: string;
        subtotal: number;
        discountAmount?: number;
        taxAmount?: number;
        grandTotal: number;
        paymentMethod?: string;
        cashierName?: string;
        actorUid?: string;
        items?: Array<{
          itemId?: string;
          id?: string;
          name: string;
          code?: string;
          unitPrice?: number;
          price?: number;
          quantity?: number;
          qty?: number;
          unit?: string;
        }>;
      }>;
    }
  ): {
    addedItems: number;
    updatedItems: number;
    addedBills: number;
    shopUpdated: boolean;
    workspace: DbOwnerWorkspace;
  } {
    const shop = getShopByIdOrEmail(idOrEmail);
    if (!shop) {
      throw new DbValidationError(`Shop owner account "${idOrEmail}" not found.`);
    }

    const nowIso = new Date().toISOString();
    let addedItems = 0;
    let updatedItems = 0;
    let addedBills = 0;
    let shopUpdated = false;

    db.exec('BEGIN');
    try {
      if (cloudData.shop) {
        const localUpdatedMs = shop.updatedAt ? new Date(shop.updatedAt).getTime() : 0;
        const cloudUpdatedMs = cloudData.shop.updatedAt
          ? new Date(cloudData.shop.updatedAt).getTime()
          : 0;
        if (cloudUpdatedMs > localUpdatedMs) {
          const nextPinHash =
            cloudData.shop.pinHash && cloudData.shop.pinHash.length >= 16
              ? cloudData.shop.pinHash
              : shop.pinHash;
          const nextStatus: ShopStatus =
            cloudData.shop.status === 'inactive' || cloudData.shop.isActive === false
              ? 'inactive'
              : shop.status;
          const nextIsActive = nextStatus === 'active' ? 1 : 0;
          const nextUpdatedAt = cloudData.shop.updatedAt || nowIso;

          db.prepare(`
            UPDATE shop_owners
            SET shop_name = ?, owner_name = ?, phone = ?, address = ?, gstin = ?,
                tagline = ?, tax_rate_percent = ?, currency_symbol = ?,
                pin_hash = ?, status = ?, is_active = ?, updated_at = ?
            WHERE email = ?
          `).run(
            (cloudData.shop.shopName || shop.shopName).trim(),
            (cloudData.shop.ownerName || shop.ownerName).trim(),
            cloudData.shop.phone !== undefined ? cloudData.shop.phone.trim() : shop.phone,
            cloudData.shop.address !== undefined ? cloudData.shop.address.trim() : shop.address,
            cloudData.shop.gstin !== undefined ? cloudData.shop.gstin.trim() : shop.gstin,
            cloudData.shop.tagline !== undefined ? cloudData.shop.tagline.trim() : shop.tagline,
            cloudData.shop.taxRatePercent !== undefined &&
              Number.isFinite(Number(cloudData.shop.taxRatePercent))
              ? Number(cloudData.shop.taxRatePercent)
              : shop.taxRatePercent,
            cloudData.shop.currencySymbol
              ? cloudData.shop.currencySymbol.trim()
              : shop.currencySymbol,
            nextPinHash,
            nextStatus,
            nextIsActive,
            nextUpdatedAt,
            shop.email
          );
          db.prepare(`
            UPDATE users
            SET pin_hash = ?, is_active = ?, updated_at = ?
            WHERE email = ? AND role = 'owner'
          `).run(nextPinHash, nextIsActive, nextUpdatedAt, shop.email);
          shopUpdated = true;
        }
      }

      const insertItem = db.prepare(`
        INSERT OR REPLACE INTO items (
          id, owner_email, name, code, price, stock, category, unit,
          updated_at, sync_status, synced_at, sync_error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?, NULL)
      `);

      for (const item of cloudData.items || []) {
        const cleanId = String(item.id || '').trim();
        if (!cleanId || !item.name) continue;
        const existingItem = db
          .prepare('SELECT updated_at, sync_status FROM items WHERE owner_email = ? AND id = ?')
          .get(shop.email, cleanId) as { updated_at: string; sync_status: string } | undefined;
        const cloudItemUpdated = item.updatedAt || nowIso;
        const cloudItemMs = new Date(cloudItemUpdated).getTime();

        if (!existingItem) {
          insertItem.run(
            cleanId,
            shop.email,
            String(item.name).trim(),
            String(item.code || '').trim(),
            Math.max(0, Number(item.price) || 0),
            Math.max(0, Number(item.stock) || 0),
            String(item.category || 'General').trim(),
            item.unit === 'kg' ? 'kg' : 'pcs',
            cloudItemUpdated,
            nowIso
          );
          addedItems += 1;
        } else {
          const localItemMs = existingItem.updated_at ? new Date(existingItem.updated_at).getTime() : 0;
          if (cloudItemMs > localItemMs) {
            insertItem.run(
              cleanId,
              shop.email,
              String(item.name).trim(),
              String(item.code || '').trim(),
              Math.max(0, Number(item.price) || 0),
              Math.max(0, Number(item.stock) || 0),
              String(item.category || 'General').trim(),
              item.unit === 'kg' ? 'kg' : 'pcs',
              cloudItemUpdated,
              nowIso
            );
            updatedItems += 1;
          }
        }
      }

      const insertBill = db.prepare(`
        INSERT INTO bills (
          id, owner_email, bill_number, customer_name, customer_phone,
          subtotal, discount_amount, tax_amount, grand_total,
          payment_method, cashier_name, actor_uid, created_at, sync_status, synced_at, sync_error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?, NULL)
      `);
      const insertLine = db.prepare(`
        INSERT INTO bill_items (owner_email, bill_id, item_id, name, code, unit_price, quantity, unit)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const bill of cloudData.bills || []) {
        const cleanId = String(bill.id || '').trim();
        const billNumber = String(bill.billNumber || '').trim();
        if (!cleanId || !billNumber) continue;

        const existingBill = db
          .prepare('SELECT id, sync_status FROM bills WHERE owner_email = ? AND (id = ? OR bill_number = ?)')
          .get(shop.email, cleanId, billNumber) as { id: string; sync_status: string } | undefined;

        if (existingBill) {
          if (existingBill.sync_status !== 'synced') {
            db.prepare(
              "UPDATE bills SET sync_status = 'synced', synced_at = ?, sync_error = NULL WHERE owner_email = ? AND id = ?"
            ).run(nowIso, shop.email, existingBill.id);
          }
          continue;
        }

        const method: PaymentMode = ['Cash', 'UPI', 'Card', 'Other'].includes(
          String(bill.paymentMethod || '')
        )
          ? (bill.paymentMethod as PaymentMode)
          : 'Cash';

        insertBill.run(
          cleanId,
          shop.email,
          billNumber,
          String(bill.customerName || ''),
          String(bill.customerPhone || ''),
          Math.max(0, Number(bill.subtotal) || 0),
          Math.max(0, Number(bill.discountAmount) || 0),
          Math.max(0, Number(bill.taxAmount) || 0),
          Math.max(0, Number(bill.grandTotal) || 0),
          method,
          String(bill.cashierName || shop.ownerName),
          String(bill.actorUid || ''),
          bill.createdAt || nowIso,
          nowIso
        );

        for (const line of bill.items || []) {
          insertLine.run(
            shop.email,
            cleanId,
            String(line.itemId || line.id || 'item'),
            String(line.name || 'Item'),
            String(line.code || ''),
            Math.max(0, Number(line.unitPrice ?? line.price) || 0),
            Math.max(0, Number(line.quantity ?? line.qty) || 0),
            line.unit === 'kg' ? 'kg' : 'pcs'
          );
        }
        addedBills += 1;
      }

      db.prepare('UPDATE shop_owners SET last_synced_at = ? WHERE email = ?').run(nowIso, shop.email);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    return {
      addedItems,
      updatedItems,
      addedBills,
      shopUpdated,
      workspace: getOwnerWorkspace(shop.email)!,
    };
  }

  return {
    close: () => db.close(),
    listShops,
    getShopByIdOrEmail,
    registerShop,
    updateShop,
    toggleShopStatus,
    resetShopPin,
    deleteShop,
    verifyOwnerEmail,
    verifyShopLogin,
    createOwnerSession,
    validateOwnerSessionToken,
    getOwnerSessionContext,
    revokeOwnerSession,
    createAdminSession,
    validateAdminSessionToken,
    revokeAdminSession,
    listAdmins,
    upsertAdmin,
    listShopEmployees,
    addShopEmployee,
    updateShopEmployee,
    toggleEmployeeStatus,
    resetEmployeePin,
    deleteShopEmployee,
    getOwnerWorkspace,
    saveOwnerItem,
    deleteOwnerItem,
    createOwnerBill,
    getPendingSyncForOwner,
    markOwnerRecordsSynced,
    upsertShopFromVerifiedCloud,
    mergeCloudDataForOwner,
    recordAuditLog,
    listAuditLogsForShop,
    listAllAuditLogs,
    exportShopBackup,
    restoreShopBackup,
    listBackupHistory,
    resetOwnerWorkspace,
  };
}
