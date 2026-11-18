import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import {
  DbConflictError,
  DbValidationError,
  openShopBillDatabase,
  type DbSessionContext,
} from './src/db/database.ts';
import { BruteForceProtector, SlidingWindowRateLimiter } from './src/utils/rateLimiter.ts';

declare global {
  namespace Express {
    interface Request {
      ownerSession?: DbSessionContext;
      adminSession?: { email: string; uid: string };
    }
  }
}

async function createServer() {
  const app = express();
  const db = openShopBillDatabase();
  const port = Number(process.env.PORT) || 3000;
  const rootDir = process.cwd();
  const adminPanelDir = path.resolve(rootDir, 'admin-panel');
  const firebaseConfigPath = path.resolve(rootDir, 'firebase-applet-config.json');
  const adminAccessKey = (process.env.SHOPBILL_ADMIN_KEY || 'adminshiv.developer9142').trim();

  app.use(express.json({ limit: '5mb' }));

  // Rate limiters & brute-force lockout protectors
  const apiRateLimiter = new SlidingWindowRateLimiter(180, 60 * 1000);
  const authRateLimiter = new SlidingWindowRateLimiter(25, 60 * 1000);
  const syncRateLimiter = new SlidingWindowRateLimiter(45, 60 * 1000);
  const pinBruteForce = new BruteForceProtector(5, 15 * 60 * 1000, 3 * 60 * 1000);
  const adminBruteForce = new BruteForceProtector(5, 15 * 60 * 1000, 5 * 60 * 1000);

  const clientIp = (req: express.Request): string => {
    const forwarded = req.header('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
    return req.ip || req.socket.remoteAddress || 'local';
  };

  app.use('/api', (req, res, next) => {
    const decision = apiRateLimiter.consume(`api:${clientIp(req)}`);
    if (!decision.allowed) {
      res.status(429).json({
        error: `Too many API requests. Please retry in ${decision.retryAfterSeconds}s.`,
        retryAfterSeconds: decision.retryAfterSeconds,
      });
      return;
    }
    next();
  });

  const handleRouteError = (res: express.Response, err: unknown) => {
    if (err instanceof DbConflictError) {
      res.status(409).json({ error: err.message });
      return;
    }
    if (err instanceof DbValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[ShopBill API Error]', err);
    res.status(500).json({ error: message });
  };

  const extractHeaderToken = (req: express.Request, customHeader: string): string => {
    const headerVal = req.header(customHeader);
    if (headerVal) return headerVal.trim();
    const authHeader = req.header('authorization') || '';
    if (authHeader.toLowerCase().startsWith('bearer ')) {
      return authHeader.slice(7).trim();
    }
    return '';
  };

  const requireAdminSession = (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    const token = extractHeaderToken(req, 'x-admin-token');
    const admin = db.validateAdminSessionToken(token);
    if (!admin) {
      res.status(401).json({
        error: 'Admin authorization required. Normal shop owners cannot access admin APIs.',
      });
      return;
    }
    req.adminSession = admin;
    next();
  };

  const requireShopMember = (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    const emailOrShop = decodeURIComponent(req.params.email || req.params.shopId || '');
    const token = extractHeaderToken(req, 'x-owner-token');
    const session = db.getOwnerSessionContext(token, emailOrShop);
    if (!session) {
      res.status(403).json({
        error: 'Access denied. Private store data can only be accessed by authenticated members of this shop.',
      });
      return;
    }
    req.ownerSession = session;
    next();
  };

  const requireShopOwner = (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    requireShopMember(req, res, () => {
      if (req.ownerSession?.role !== 'owner') {
        res.status(403).json({
          error: 'Owner permissions required. Employees cannot perform administrative store actions.',
        });
        return;
      }
      next();
    });
  };

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, database: 'sqlite', timestamp: new Date().toISOString() });
  });

  const resolveFirebaseServerConfig = (): Record<string, string> | null => {
    let base: Record<string, string> = {};
    if (fs.existsSync(firebaseConfigPath)) {
      base = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf-8')) as Record<string, string>;
    }
    const merged: Record<string, string> = {
      ...base,
      ...(process.env.VITE_FIREBASE_API_KEY?.trim()
        ? { apiKey: process.env.VITE_FIREBASE_API_KEY.trim() }
        : {}),
      ...(process.env.VITE_FIREBASE_AUTH_DOMAIN?.trim()
        ? { authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN.trim() }
        : {}),
      ...(process.env.VITE_FIREBASE_PROJECT_ID?.trim()
        ? { projectId: process.env.VITE_FIREBASE_PROJECT_ID.trim() }
        : {}),
      ...(process.env.VITE_FIREBASE_APP_ID?.trim()
        ? { appId: process.env.VITE_FIREBASE_APP_ID.trim() }
        : {}),
      ...(process.env.VITE_FIREBASE_STORAGE_BUCKET?.trim()
        ? { storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET.trim() }
        : {}),
      ...(process.env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim()
        ? { messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID.trim() }
        : {}),
      ...(process.env.VITE_FIREBASE_DATABASE_ID?.trim()
        ? { firestoreDatabaseId: process.env.VITE_FIREBASE_DATABASE_ID.trim() }
        : {}),
    };
    if (!merged.projectId) return null;
    if (!merged.firestoreDatabaseId) {
      merged.firestoreDatabaseId = '(default)';
    }
    return merged;
  };

  app.get('/api/firebase-config', (_req, res) => {
    try {
      const cfg = resolveFirebaseServerConfig();
      if (!cfg) {
        res.status(404).json({ error: 'Firebase configuration file not found.' });
        return;
      }
      res.json(cfg);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // --- Admin Auth & Protected Admin APIs ---
  app.post('/api/admin/login', (req, res) => {
    const ip = clientIp(req);
    const rate = authRateLimiter.consume(`admin:${ip}`);
    if (!rate.allowed) {
      res.status(429).json({
        error: `Too many admin login attempts. Retry in ${rate.retryAfterSeconds}s.`,
        retryAfterSeconds: rate.retryAfterSeconds,
      });
      return;
    }

    const bf = adminBruteForce.check(ip);
    if (bf.locked) {
      res.status(429).json({
        error: `Admin gateway temporarily locked after failed attempts. Retry in ${bf.retryAfterSeconds}s.`,
        retryAfterSeconds: bf.retryAfterSeconds,
      });
      return;
    }

    try {
      const password = String(req.body?.password || '').trim();
      const email = String(req.body?.email || 'shivamraj.in5@gmail.com').trim().toLowerCase();
      const uid = String(req.body?.uid || 'adm_primary').trim();

      const adminList = db.listAdmins();
      const activeAdminMatch = adminList.find(
        (a) => a.isActive && (a.email.toLowerCase() === email || a.uid === uid)
      );

      if (!password || password !== adminAccessKey) {
        const failState = adminBruteForce.recordFailure(ip);
        db.recordAuditLog({
          shopId: 'GLOBAL',
          actorUid: uid,
          actorEmail: email,
          actorRole: 'admin',
          action: 'admin_login_failed',
          targetType: 'admin',
          targetId: email,
          afterData: { locked: failState.locked, remainingAttempts: failState.remainingAttempts },
        });
        res.status(failState.locked ? 429 : 401).json({
          error: failState.locked
            ? `Admin gateway locked for ${failState.retryAfterSeconds}s due to repeated failures.`
            : `Invalid developer key. ${failState.remainingAttempts} attempt(s) remaining.`,
        });
        return;
      }

      adminBruteForce.recordSuccess(ip);
      const token = db.createAdminSession(activeAdminMatch?.email || email, activeAdminMatch?.uid || uid);
      db.recordAuditLog({
        shopId: 'GLOBAL',
        actorUid: activeAdminMatch?.uid || uid,
        actorEmail: activeAdminMatch?.email || email,
        actorRole: 'admin',
        action: 'admin_action',
        targetType: 'admin_session',
        targetId: uid,
        afterData: { event: 'admin_login_success' },
      });

      res.json({
        ok: true,
        token,
        admin: {
          uid: activeAdminMatch?.uid || uid,
          email: activeAdminMatch?.email || email,
          role: 'super_admin',
        },
      });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.post('/api/admin/logout', (req, res) => {
    try {
      const token = extractHeaderToken(req, 'x-admin-token');
      if (token) db.revokeAdminSession(token);
      res.json({ ok: true });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.get('/api/admin/admins', requireAdminSession, (_req, res) => {
    try {
      res.json({ admins: db.listAdmins() });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.post('/api/admin/admins', requireAdminSession, (req, res) => {
    try {
      const created = db.upsertAdmin(req.body || {}, req.adminSession?.email || 'admin');
      res.status(201).json({ admin: created });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.get('/api/admin/audit-logs', requireAdminSession, (req, res) => {
    try {
      const limit = Number(req.query.limit) || 200;
      res.json({ logs: db.listAllAuditLogs(limit) });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // Protected Shop Registry Management (Admin-only)
  app.get('/api/shops', requireAdminSession, (_req, res) => {
    try {
      const shops = db.listShops();
      res.json({ shops });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.get('/api/shops/:id', requireAdminSession, (req, res) => {
    try {
      const idOrEmail = decodeURIComponent(req.params.id);
      const shop = db.getShopByIdOrEmail(idOrEmail);
      if (!shop) {
        res.status(404).json({ error: `Shop "${idOrEmail}" not found.` });
        return;
      }
      res.json({ shop });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.post('/api/shops', requireAdminSession, (req, res) => {
    try {
      const shop = db.registerShop(req.body || {}, req.adminSession?.email || 'admin');
      res.status(201).json({ shop });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.patch('/api/shops/:id', requireAdminSession, (req, res) => {
    try {
      const idOrEmail = decodeURIComponent(req.params.id);
      const shop = db.updateShop(idOrEmail, req.body || {}, {
        email: req.adminSession?.email || 'admin',
        uid: req.adminSession?.uid || '',
        role: 'admin',
      });
      if (!shop) {
        res.status(404).json({ error: `Shop "${idOrEmail}" not found.` });
        return;
      }
      res.json({ shop });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.post('/api/shops/:id/toggle-status', requireAdminSession, (req, res) => {
    try {
      const idOrEmail = decodeURIComponent(req.params.id);
      const shop = db.toggleShopStatus(idOrEmail, req.adminSession?.email || 'admin');
      if (!shop) {
        res.status(404).json({ error: `Shop "${idOrEmail}" not found.` });
        return;
      }
      res.json({ shop });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.post('/api/shops/:id/reset-pin', requireAdminSession, (req, res) => {
    try {
      const idOrEmail = decodeURIComponent(req.params.id);
      const newPin = String(req.body?.pin || '');
      const shop = db.resetShopPin(idOrEmail, newPin, req.adminSession?.email || 'admin');
      if (!shop) {
        res.status(404).json({ error: `Shop "${idOrEmail}" not found.` });
        return;
      }
      res.json({ shop });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.delete('/api/shops/:id', requireAdminSession, (req, res) => {
    try {
      const idOrEmail = decodeURIComponent(req.params.id);
      const deleted = db.deleteShop(idOrEmail, req.adminSession?.email || 'admin');
      if (!deleted) {
        res.status(404).json({ error: `Shop "${idOrEmail}" not found.` });
        return;
      }
      res.json({ deleted: true });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  const readFirestoreFields = (fields: Record<string, Record<string, unknown>> | undefined) => {
    const out: Record<string, unknown> = {};
    if (!fields) return out;
    for (const [k, v] of Object.entries(fields)) {
      if (!v || typeof v !== 'object') continue;
      if ('stringValue' in v) out[k] = v.stringValue;
      else if ('booleanValue' in v) out[k] = v.booleanValue;
      else if ('timestampValue' in v) out[k] = v.timestampValue;
      else if ('doubleValue' in v) out[k] = Number(v.doubleValue);
      else if ('integerValue' in v) out[k] = Number(v.integerValue);
    }
    return out;
  };

  // Pull authoritative shop record (including latest pinHash) from Firestore REST API using caller's Firebase ID token
  app.post('/api/auth/sync-cloud-shop', async (req, res) => {
    const decision = authRateLimiter.consume(`cloudshop:${clientIp(req)}`);
    if (!decision.allowed) {
      res.status(429).json({
        error: `Too many sync checks. Retry in ${decision.retryAfterSeconds}s.`,
      });
      return;
    }
    try {
      const idToken =
        extractHeaderToken(req, 'authorization') || String(req.body?.idToken || '').trim();
      const requestedShopId = String(req.body?.shopId || '').trim().toUpperCase();
      const requestedEmail = String(req.body?.email || '').trim().toLowerCase();

      if (!idToken) {
        res.status(401).json({ error: 'Firebase ID token required.' });
        return;
      }
      const fbCfg = resolveFirebaseServerConfig();
      if (!fbCfg || !fbCfg.projectId || !fbCfg.firestoreDatabaseId) {
        res.status(500).json({ error: 'Incomplete Firebase configuration.' });
        return;
      }

      const baseUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
        fbCfg.projectId
      )}/databases/${encodeURIComponent(fbCfg.firestoreDatabaseId)}/documents`;
      const headers = { Authorization: `Bearer ${idToken}` };

      const candidateDocs: Array<Record<string, unknown>> = [];
      let cloudError: string | undefined;

      if (requestedShopId) {
        const shopRes = await fetch(`${baseUrl}/shops/${encodeURIComponent(requestedShopId)}`, {
          headers,
        });
        if (shopRes.ok) {
          const shopDoc = (await shopRes.json()) as {
            fields?: Record<string, Record<string, unknown>>;
          };
          if (shopDoc.fields) {
            candidateDocs.push(readFirestoreFields(shopDoc.fields));
          }
        } else if (shopRes.status !== 404) {
          cloudError = `Firestore shop lookup failed (${shopRes.status})`;
        }
      }

      if (requestedEmail && candidateDocs.length === 0) {
        const queryRes = await fetch(`${baseUrl}:runQuery`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            structuredQuery: {
              from: [{ collectionId: 'shops' }],
              where: {
                fieldFilter: {
                  field: { fieldPath: 'email' },
                  op: 'EQUAL',
                  value: { stringValue: requestedEmail },
                },
              },
              limit: 25,
            },
          }),
        });
        if (queryRes.ok) {
          const rows = (await queryRes.json()) as Array<{
            document?: { fields?: Record<string, Record<string, unknown>> };
          }>;
          for (const r of rows) {
            if (r.document?.fields) {
              candidateDocs.push(readFirestoreFields(r.document.fields));
            }
          }
        } else {
          cloudError = `Firestore email query failed (${queryRes.status})`;
        }
      }

      if (candidateDocs.length === 0) {
        res.json({ synced: false, syncedCount: 0, ...(cloudError ? { cloudError } : {}) });
        return;
      }

      candidateDocs.sort((a, b) => {
        const aTime = new Date(String(a.updatedAt || a.createdAt || 0)).getTime() || 0;
        const bTime = new Date(String(b.updatedAt || b.createdAt || 0)).getTime() || 0;
        return bTime - aTime;
      });

      const syncedShops = [];
      for (const shopFields of candidateDocs) {
        if (!shopFields.shopId || !shopFields.email) continue;
        let ownerFields: Record<string, unknown> = {};
        if (typeof shopFields.emailKey === 'string' && shopFields.emailKey) {
          try {
            const ownerRes = await fetch(
              `${baseUrl}/shop_owners/${encodeURIComponent(shopFields.emailKey)}`,
              { headers }
            );
            if (ownerRes.ok) {
              const ownerDoc = (await ownerRes.json()) as {
                fields?: Record<string, Record<string, unknown>>;
              };
              if (ownerDoc.fields) {
                ownerFields = readFirestoreFields(ownerDoc.fields);
              }
            }
          } catch (_) {}
        }

        const updatedShop = db.upsertShopFromVerifiedCloud({
          shopId: String(shopFields.shopId),
          email: String(shopFields.email),
          emailKey: typeof shopFields.emailKey === 'string' ? shopFields.emailKey : undefined,
          ownerUid: typeof shopFields.ownerUid === 'string' ? shopFields.ownerUid : undefined,
          shopName: String(ownerFields.shopName || shopFields.shopName || 'BillKart Store'),
          ownerName: String(ownerFields.ownerName || shopFields.ownerName || 'Owner'),
          phone: String(ownerFields.phone ?? shopFields.phone ?? ''),
          address: String(ownerFields.address ?? shopFields.address ?? ''),
          gstin: String(ownerFields.gstin ?? shopFields.gstin ?? ''),
          tagline: typeof ownerFields.tagline === 'string' ? ownerFields.tagline : undefined,
          taxRatePercent:
            typeof ownerFields.taxRatePercent === 'number' ? ownerFields.taxRatePercent : undefined,
          currencySymbol:
            typeof ownerFields.currencySymbol === 'string' ? ownerFields.currencySymbol : undefined,
          pinHash: typeof shopFields.pinHash === 'string' ? shopFields.pinHash : undefined,
          status: shopFields.status === 'inactive' ? 'inactive' : 'active',
          isActive: shopFields.isActive !== false && shopFields.status !== 'inactive',
          createdAt: typeof shopFields.createdAt === 'string' ? shopFields.createdAt : undefined,
          updatedAt:
            typeof shopFields.updatedAt === 'string'
              ? shopFields.updatedAt
              : typeof ownerFields.updatedAt === 'string'
                ? ownerFields.updatedAt
                : undefined,
        });
        if (updatedShop) {
          syncedShops.push(updatedShop);
        }
      }

      const primaryShop =
        (requestedShopId &&
          syncedShops.find((s) => s.shopId.toUpperCase() === requestedShopId)) ||
        syncedShops[0] ||
        null;

      res.json({
        synced: Boolean(primaryShop),
        syncedCount: syncedShops.length,
        shop: primaryShop,
      });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // --- Owner & Employee Login + Rate Limited Auth ---
  app.post('/api/auth/verify-email', (req, res) => {
    const decision = authRateLimiter.consume(`verify:${clientIp(req)}`);
    if (!decision.allowed) {
      res.status(429).json({
        error: `Too many verification checks. Please wait ${decision.retryAfterSeconds}s.`,
      });
      return;
    }
    try {
      const email = String(req.body?.email || '');
      const status = db.verifyOwnerEmail(email);
      res.json(status);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.post('/api/auth/shop-login', (req, res) => {
    const ip = clientIp(req);
    const rate = authRateLimiter.consume(`login:${ip}`);
    if (!rate.allowed) {
      res.status(429).json({
        success: false,
        error: `Too many login attempts from this device. Retry in ${rate.retryAfterSeconds}s.`,
      });
      return;
    }

    const email = String(req.body?.email || '').trim().toLowerCase();
    const shopId = String(req.body?.shopId || '').trim().toUpperCase();
    const pin = String(req.body?.pin || '');
    const firebaseUid = String(req.body?.firebaseUid || '').trim();
    const lockoutKey = `${ip}:${email || shopId}`;

    const bf = pinBruteForce.check(lockoutKey);
    if (bf.locked) {
      res.status(429).json({
        success: false,
        error: `Account temporarily locked due to too many wrong PIN attempts. Retry in ${bf.retryAfterSeconds}s.`,
        retryAfterSeconds: bf.retryAfterSeconds,
      });
      return;
    }

    try {
      const result = db.verifyShopLogin(shopId, pin, email, firebaseUid);
      if (!result.success || !result.shop) {
        const fail = pinBruteForce.recordFailure(lockoutKey);
        res.status(fail.locked ? 429 : 401).json({
          success: false,
          error: fail.locked
            ? `Too many failed PIN attempts. Locked for ${fail.retryAfterSeconds}s.`
            : `${result.error || 'Authentication failed.'} (${fail.remainingAttempts} attempt(s) left)`,
        });
        return;
      }

      pinBruteForce.recordSuccess(lockoutKey);
      const role: 'owner' | 'employee' = result.user?.role === 'employee' ? 'employee' : 'owner';
      const actorEmail = result.user?.email || result.shop.email;
      const actorName = result.user?.displayName || result.shop.ownerName;
      const actorUid = result.user?.firebaseUid || result.user?.uid || '';

      const token = db.createOwnerSession(result.shop.email, {
        uid: actorUid,
        email: actorEmail,
        name: actorName,
        role,
        shopId: result.shop.shopId,
      });
      const workspace = db.getOwnerWorkspace(result.shop.email);
      res.json({
        success: true,
        token,
        shop: result.shop,
        user: result.user || {
          uid: `usr_${result.shop.emailKey}`,
          email: result.shop.email,
          displayName: result.shop.ownerName,
          role: 'owner',
          shopId: result.shop.shopId,
          isActive: result.shop.isActive,
        },
        workspace,
      });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    try {
      const token = extractHeaderToken(req, 'x-owner-token');
      if (token) {
        db.revokeOwnerSession(token);
      }
      res.json({ ok: true });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // --- Protected Shop Workspace Routes (Role-Based: Owner vs Employee) ---
  app.get('/api/owners/:email/workspace', requireShopMember, (req, res) => {
    try {
      const email = decodeURIComponent(req.params.email);
      const workspace = db.getOwnerWorkspace(email);
      if (!workspace) {
        res.status(404).json({ error: `Owner workspace for "${email}" not found.` });
        return;
      }
      // Do not expose employee list or sensitive metadata to non-owners if needed, keep clean separation
      if (req.ownerSession?.role !== 'owner') {
        res.json({
          workspace: {
            ...workspace,
            employees: [],
          },
        });
        return;
      }
      res.json({ workspace });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.put('/api/owners/:email/settings', requireShopOwner, (req, res) => {
    try {
      const email = decodeURIComponent(req.params.email);
      const body = req.body || {};
      const updated = db.updateShop(
        email,
        {
          shopName: body.name ?? body.shopName,
          tagline: body.tagline,
          phone: body.phone,
          address: body.address,
          gstin: body.gstin,
          taxRatePercent: body.taxRatePercent,
          currencySymbol: body.currencySymbol,
        },
        {
          uid: req.ownerSession?.actorUid,
          email: req.ownerSession?.actorEmail,
          role: req.ownerSession?.role,
        }
      );
      if (!updated) {
        res.status(404).json({ error: `Owner account "${email}" not found.` });
        return;
      }
      res.json({ shop: updated });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.post('/api/owners/:email/reset-pin', requireShopOwner, (req, res) => {
    try {
      const email = decodeURIComponent(req.params.email);
      const currentPin = String(req.body?.currentPin || '').trim();
      const newPin = String(req.body?.newPin || '').trim();
      const sessionShop = db.getShopByIdOrEmail(email);
      if (!sessionShop) {
        res.status(404).json({ error: 'Shop not found.' });
        return;
      }
      const check = db.verifyShopLogin(sessionShop.shopId, currentPin, sessionShop.email);
      if (!check.success) {
        res.status(401).json({ error: 'Current PIN is incorrect.' });
        return;
      }
      const updated = db.resetShopPin(sessionShop.email, newPin, req.ownerSession?.actorEmail || sessionShop.email);
      res.json({ ok: true, shop: updated });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // Items: Owners can create/edit/delete; Employees can read workspace items (stock updates happen on bill creation)
  app.post('/api/owners/:email/items', requireShopOwner, (req, res) => {
    try {
      const email = decodeURIComponent(req.params.email);
      const item = db.saveOwnerItem(email, req.body || {}, {
        uid: req.ownerSession?.actorUid,
        email: req.ownerSession?.actorEmail,
        role: req.ownerSession?.role,
      });
      res.status(201).json({ item });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.delete('/api/owners/:email/items/:itemId', requireShopOwner, (req, res) => {
    try {
      const email = decodeURIComponent(req.params.email);
      const itemId = decodeURIComponent(req.params.itemId);
      const deleted = db.deleteOwnerItem(email, itemId, {
        uid: req.ownerSession?.actorUid,
        email: req.ownerSession?.actorEmail,
        role: req.ownerSession?.role,
      });
      res.json({ deleted });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // Bills: Both Owner & Employee of that shop can create bills
  app.post('/api/owners/:email/bills', requireShopMember, (req, res) => {
    try {
      const email = decodeURIComponent(req.params.email);
      const bill = db.createOwnerBill(email, req.body || {}, {
        uid: req.ownerSession?.actorUid,
        email: req.ownerSession?.actorEmail,
        role: req.ownerSession?.role,
      });
      res.status(201).json({ bill });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // --- Employee Management APIs (Strictly Owner-only) ---
  app.get('/api/owners/:email/employees', requireShopOwner, (req, res) => {
    try {
      const email = decodeURIComponent(req.params.email);
      res.json({ employees: db.listShopEmployees(email) });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.post('/api/owners/:email/employees', requireShopOwner, (req, res) => {
    try {
      const email = decodeURIComponent(req.params.email);
      const emp = db.addShopEmployee(email, req.body || {}, {
        uid: req.ownerSession?.actorUid,
        email: req.ownerSession?.actorEmail,
      });
      res.status(201).json({ employee: emp });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.patch('/api/owners/:email/employees/:empUid', requireShopOwner, (req, res) => {
    try {
      const email = decodeURIComponent(req.params.email);
      const empUid = decodeURIComponent(req.params.empUid);
      const updated = db.updateShopEmployee(email, empUid, req.body || {}, {
        uid: req.ownerSession?.actorUid,
        email: req.ownerSession?.actorEmail,
      });
      if (!updated) {
        res.status(404).json({ error: 'Employee not found.' });
        return;
      }
      res.json({ employee: updated });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.post('/api/owners/:email/employees/:empUid/toggle-status', requireShopOwner, (req, res) => {
    try {
      const email = decodeURIComponent(req.params.email);
      const empUid = decodeURIComponent(req.params.empUid);
      const updated = db.toggleEmployeeStatus(email, empUid, {
        uid: req.ownerSession?.actorUid,
        email: req.ownerSession?.actorEmail,
      });
      if (!updated) {
        res.status(404).json({ error: 'Employee not found.' });
        return;
      }
      res.json({ employee: updated });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.post('/api/owners/:email/employees/:empUid/reset-pin', requireShopOwner, (req, res) => {
    try {
      const email = decodeURIComponent(req.params.email);
      const empUid = decodeURIComponent(req.params.empUid);
      const newPin = String(req.body?.pin || '');
      const updated = db.resetEmployeePin(email, empUid, newPin, {
        uid: req.ownerSession?.actorUid,
        email: req.ownerSession?.actorEmail,
      });
      if (!updated) {
        res.status(404).json({ error: 'Employee not found.' });
        return;
      }
      res.json({ employee: updated });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.delete('/api/owners/:email/employees/:empUid', requireShopOwner, (req, res) => {
    try {
      const email = decodeURIComponent(req.params.email);
      const empUid = decodeURIComponent(req.params.empUid);
      const deleted = db.deleteShopEmployee(email, empUid, {
        uid: req.ownerSession?.actorUid,
        email: req.ownerSession?.actorEmail,
      });
      res.json({ deleted });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // --- Audit Logs (Owner sees own shop logs) ---
  app.get('/api/owners/:email/audit-logs', requireShopOwner, (req, res) => {
    try {
      const email = decodeURIComponent(req.params.email);
      const limit = Number(req.query.limit) || 100;
      res.json({ logs: db.listAuditLogsForShop(email, limit) });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // --- Backup & Restore (Owner-only) ---
  app.get('/api/owners/:email/backup/export', requireShopOwner, (req, res) => {
    try {
      const email = decodeURIComponent(req.params.email);
      const source = req.query.source === 'hybrid' ? 'hybrid' : 'sqlite';
      const bundle = db.exportShopBackup(email, req.ownerSession?.actorEmail || email, source);
      res.json({ bundle });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.get('/api/owners/:email/backup/history', requireShopOwner, (req, res) => {
    try {
      const email = decodeURIComponent(req.params.email);
      res.json({ history: db.listBackupHistory(email) });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.post('/api/owners/:email/backup/restore', requireShopOwner, (req, res) => {
    try {
      const email = decodeURIComponent(req.params.email);
      const result = db.restoreShopBackup(
        email,
        req.body?.bundle,
        req.ownerSession?.actorEmail || email
      );
      res.json(result);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // --- Rate-Limited Cloud Sync APIs (Members of Shop) ---
  app.get('/api/owners/:email/sync/pending', requireShopMember, (req, res) => {
    const rate = syncRateLimiter.consume(`sync:${req.ownerSession?.shopId || clientIp(req)}`);
    if (!rate.allowed) {
      res.status(429).json({ error: `Sync rate limit exceeded. Retry in ${rate.retryAfterSeconds}s.` });
      return;
    }
    try {
      const email = decodeURIComponent(req.params.email);
      const pending = db.getPendingSyncForOwner(email);
      if (!pending) {
        res.status(404).json({ error: `Owner account "${email}" not found.` });
        return;
      }
      res.json(pending);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.post('/api/owners/:email/sync/mark-synced', requireShopMember, (req, res) => {
    try {
      const email = decodeURIComponent(req.params.email);
      const result = db.markOwnerRecordsSynced(email, req.body || {});
      const workspace = db.getOwnerWorkspace(email);
      res.json({ ...result, workspace });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  app.post('/api/owners/:email/sync/merge-cloud', requireShopMember, (req, res) => {
    const rate = syncRateLimiter.consume(`merge:${req.ownerSession?.shopId || clientIp(req)}`);
    if (!rate.allowed) {
      res.status(429).json({ error: `Sync rate limit exceeded. Retry in ${rate.retryAfterSeconds}s.` });
      return;
    }
    try {
      const email = decodeURIComponent(req.params.email);
      const result = db.mergeCloudDataForOwner(email, req.body || {});
      res.json(result);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // Static serving for standalone HTML/CSS/JS Admin Panel
  app.use('/admin-panel', express.static(adminPanelDir, { index: 'index.html' }));

  app.get('/firebase-applet-config.json', (req, res, next) => {
    if ('import' in req.query) {
      next();
      return;
    }
    if (fs.existsSync(firebaseConfigPath)) {
      res.sendFile(firebaseConfigPath);
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(rootDir, 'dist');
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/admin-panel')) {
        next();
        return;
      }
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: 'spa',
    });

    app.get('/@vite/client', async (req, res, next) => {
      try {
        const result = await vite.transformRequest('/@vite/client');
        if (!result?.code) {
          next();
          return;
        }
        const safeClientCode = result.code.replace(
          /let wsTransport = createWebSocketModuleRunnerTransport\(\{[\s\S]*?pingInterval:\s*hmrTimeout\s*\}\);/,
          'let wsTransport = { async connect() {}, async disconnect() {}, send() {} };'
        );
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.send(safeClientCode);
      } catch (err) {
        next(err);
      }
    });

    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`[ShopBill Server] Listening on http://0.0.0.0:${port}`);
  });
}

createServer().catch((err) => {
  console.error('[ShopBill Server] Fatal startup error:', err);
  process.exit(1);
});
