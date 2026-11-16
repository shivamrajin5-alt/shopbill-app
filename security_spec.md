# ShopBill Firestore Security Specification

## 1. Data Invariants
1. **Admin Authority**: Only verified developer super-admins (`shivamraj.in5@gmail.com` with `email_verified == true`, or UIDs listed in `/admins/{uid}`) may register, suspend, activate, or delete any `/shops/{shopId}` or `/shop_owners/{emailKey}` workspace globally.
2. **Email-Scoped Tenant Ownership**: Every shop profile and owner workspace is bound to a single normalized lowercase `email` and deterministic `emailKey`. Authenticated shop owners (`email_verified == true`) can only read or update records whose `email` / `ownerEmail` matches `request.auth.token.email`.
3. **Subcollection Master Gate**: Items (`/shop_owners/{emailKey}/items/{itemId}`) and bills (`/shop_owners/{emailKey}/bills/{billId}`) verify parent `/shop_owners/{emailKey}` existence and owner membership via `get()`.
4. **Immutable Identifiers & Timestamps**: `shopId`, `emailKey`, and `createdAt` are immutable after creation; `createdAt` and `updatedAt` must equal `request.time`.
5. **PIN Hashing**: Only `pinHash` (SHA-256 hex digest) is persisted in Firestore; plaintext PINs are never stored in Firestore.

## 2. Adversarial "Dirty Dozen" Payloads (All Must Fail with PERMISSION_DENIED)
1. **Unauthenticated read/write** to `/shops/SB-1001`.
2. **Unverified email token** (`email_verified: false`) pretending to be `shivamraj.in5@gmail.com` creating `/shops/SB-9999`.
3. **Ghost / Shadow field injection** (`{ ..., isSuperAdmin: true }`) on `/shops/SB-9999` create or update.
4. **Shop ID mutation** changing `shopId` during `/shops/SB-1001` update.
5. **Client timestamp forgery** (`createdAt: "2020-01-01T00:00:00Z"`) instead of `request.time`.
6. **ID poisoning** creating `/shops/bad..id` or a 1.5KB document ID.
7. **Resource exhaustion** writing a 20KB `shopName` or `address` string exceeding `maxLength`.
8. **Cross-tenant PII snooping** reading `/shop_owners/other_owner` as a different verified user.
9. **Unsanitized status enum** setting `status: "hacked"` instead of `'active' | 'inactive'`.
10. **Orphaned subcollection write** creating `/shop_owners/nonexistent/items/i1` when parent workspace does not exist.
11. **Owner email spoofing** creating an item under `/shop_owners/{myEmailKey}/items/i1` with `ownerEmail` belonging to someone else.
12. **Self-privilege escalation** creating `/admins/{myUid}` by a non-admin user.
