# Abar Khabo — Stage 2 Part B: Step 2 Implementation Report
## UID-Based Staff Identity & Explicit Outlet Authorization Model

**System:** Commercial Restaurant SaaS & Multi-Channel Aggregator Platform  
**Milestone:** Stage 2 Part B — Implementation  
**Step:** **Step 2 ONLY: UID-Based Staff Identity & Outlet Authorization Model**  
**Date:** 2026-11-15  
**Status:** COMPLETE & VERIFIED  

---

## 1. Executive Summary

In Step 2 of Stage 2 Part B, the staff identity and access control system of **Abar Khabo** was upgraded from legacy email-keyed profiles (`users/{email}`) to Firebase Authentication UID-keyed primary identity documents (`users/{uid}`), with strict, non-destructive backward compatibility.

Simultaneously, explicit outlet-level authorization was implemented:
1. Every staff member is bound strictly to their tenant (`restaurantId`).
2. Brand-level administrators with `allOutlets: true` can access all branches within their tenant.
3. Branch-level staff with `allOutlets: false` can access only their explicitly assigned outlet IDs in `assignedOutletIds`.
4. Empty or missing `assignedOutletIds` with `allOutlets != true` strictly denies outlet access (eliminating implicit universal access vulnerabilities).
5. All 8 required enterprise roles are recognized and enforced: `super_admin`, `owner`, `restaurant_admin`, `outlet_manager`, `cashier`, `kitchen`, `waiter`, and `delivery_partner`.
6. Client-side role escalation, tenant hopping (`restaurantId` alteration), `allOutlets` self-granting, and cross-tenant staff provisioning are prohibited by Firestore security rules.

Both the live Cloud Firestore Emulator Suite (using `@firebase/rules-unit-testing`) and automated unit test suites verified 100% pass rates across all permission boundaries.

---

## 2. Files Created and Modified

| File | Status | Description |
| :--- | :---: | :--- |
| [`client/src/services/staffIdentityService.js`](file:///c:/Users/ARGHA/Downloads/Web_clone/client/src/services/staffIdentityService.js) | **Created** | Core service for UID profile resolution, lazy migration, explicit outlet permission evaluation, and profile normalization |
| [`tests/test_staff_identity.js`](file:///c:/Users/ARGHA/Downloads/Web_clone/tests/test_staff_identity.js) | **Created** | Unit test suite (40 assertions) verifying outlet authorization, role scopes, strict defaults, and selection validation |
| [`STAGE2_STEP2_IMPLEMENTATION_REPORT.md`](file:///c:/Users/ARGHA/Downloads/Web_clone/STAGE2_STEP2_IMPLEMENTATION_REPORT.md) | **Created** | Official engineering report for Step 2 deliverables |
| [`firestore.rules`](file:///c:/Users/ARGHA/Downloads/Web_clone/firestore.rules) | **Modified** | Hardened security rules with UID-first profile lookup, `hasOutletAccess()` helper, and immutability checks on `role`, `restaurantId`, and `allOutlets` |
| [`client/src/context/AuthContext.jsx`](file:///c:/Users/ARGHA/Downloads/Web_clone/client/src/context/AuthContext.jsx) | **Modified** | Integrated `resolveStaffProfile` dual-lookup, exposing `allOutlets`, `assignedOutletIds`, and `canAccessOutlet()` on auth context |
| [`client/src/context/RestaurantContext.jsx`](file:///c:/Users/ARGHA/Downloads/Web_clone/client/src/context/RestaurantContext.jsx) | **Modified** | Added active outlet authorization enforcement on switch and initial selection with automatic fallback |
| [`client/src/services/firestoreService.js`](file:///c:/Users/ARGHA/Downloads/Web_clone/client/src/services/firestoreService.js) | **Modified** | Re-exported staff identity utilities and hardened `getUserProfile` |
| [`package.json`](file:///c:/Users/ARGHA/Downloads/Web_clone/package.json) | **Modified** | Added `npm run test:identity` and `npm run test:emulator` scripts |
| [`tests/emulator_rules_unit.test.js`](file:///c:/Users/ARGHA/Downloads/Web_clone/tests/emulator_rules_unit.test.js) | **Modified** | Expanded live emulator test suite from 15 to 25 scenarios covering UID reads, escalation prevention, and tenant boundaries |
| [`tests/test_rules_isolation.js`](file:///c:/Users/ARGHA/Downloads/Web_clone/tests/test_rules_isolation.js) | **Modified** | Expanded AST test suite from 37 to 47 scenarios |
| [`PROJECT_PROGRESS.md`](file:///c:/Users/ARGHA/Downloads/Web_clone/PROJECT_PROGRESS.md) | **Modified** | Updated progress tracker with Step 2 completion status |

---

## 3. UID Identity Architecture (`users/{uid}`)

### 3.1 Primary Document Schema
Document Path: `users/{uid}`
```json
{
  "uid": "fb_auth_uid_staff_78912",
  "email": "cashier@spicehaven.com",
  "displayName": "Sunil Karmakar",
  "name": "Sunil Karmakar",
  "phone": "+919876501234",
  "staffIdCode": "482913",
  "authMethod": "email",
  "restaurantId": "spice-haven",
  "role": "cashier",
  "assignedOutletIds": ["spice-haven_main"],
  "allOutlets": false,
  "status": "active",
  "emailVerified": true,
  "migrationStatus": "MIGRATED_FROM_EMAIL",
  "migratedFrom": "cashier@spicehaven.com",
  "createdAt": "2026-11-15T01:00:00Z",
  "updatedAt": "2026-11-15T02:15:00Z"
}
```

### 3.2 Key Architectural Benefits
1. **Immutable Key Identity:** Firebase Authentication UIDs are globally unique, non-recyclable, and do not change even if a user updates their email.
2. **Synthetic Staff-ID Accounts:** Enables high-speed waiter/kitchen accounts provisioned by staff ID numbers without email collisions.
3. **No Client-Supplied Trust:** Firestore security rules and backend services derive permissions strictly from the authenticated UID profile rather than client request bodies.

---

## 4. Role and Outlet Authorization Matrix

| Role | Role Scope | `allOutlets` Allowed? | Permitted Outlets | Primary Capabilities |
| :--- | :---: | :---: | :--- | :--- |
| `super_admin` | PLATFORM | Yes (Global) | All platform tenants & outlets | System-wide management, tenant creation, global billing |
| `owner` | TENANT | Yes (Tenant) | All outlets under their `restaurantId` | Full tenant brand ownership, multi-outlet analytics, bank payouts |
| `restaurant_admin` | TENANT | Yes (Tenant) | All outlets under their `restaurantId` | Brand management, menu catalog, staff provisioning, outlet config |
| `outlet_manager` | OUTLET | **No** | Specific `assignedOutletIds` only | Outlet inventory, staff scheduling, local operational toggles |
| `cashier` | OUTLET | **No** | Specific `assignedOutletIds` only | POS counter orders, bill printing, delivery assignment |
| `kitchen` | OUTLET | **No** | Specific `assignedOutletIds` only | KDS order acceptance, cooking status, food ready alerts |
| `waiter` | OUTLET | **No** | Specific `assignedOutletIds` only | Floor table ordering, dine-in KOT generation |
| `delivery_partner` | LOGISTICS | **No** | Assigned delivery orders only | Order pickup, live GPS coordinate transmission, delivery completion |

---

## 5. Legacy Compatibility Strategy (`users/{email}`)

To avoid breaking existing live accounts or requiring a risky bulk migration of production data:
1. **Dual-Lookup Sequence in `resolveStaffProfile`:**
   ```mermaid
   graph TD
       Auth[Firebase User Authenticated] --> CheckUID{Document users/uid exists?}
       CheckUID -- Yes --> LoadUID[Load UID Profile & Return]
       CheckUID -- No --> CheckEmail{Document users/email exists?}
       CheckEmail -- Yes --> LazyMigrate[Lazy Migrate to users/uid]
       LazyMigrate --> WriteUID[Write users/uid Document]
       WriteUID --> UpdateEmail[Update users/email with pointer]
       UpdateEmail --> ReturnNorm[Return Normalized Profile]
       CheckEmail -- No --> Reject[Reject Authentication: Account Not Provisioned]
   ```
2. **Non-Destructive Pointer:**
   The legacy `users/{email}` document is preserved and updated with `{ uid: fbUser.uid, migratedToUid: true, updatedAt: serverTimestamp() }`.
3. **Dual Rule Resolution:**
   Firestore security rules check `hasUidProfile()` first, falling back to `hasEmailProfile()` if unmigrated.

---

## 6. Security-Rule Changes

In [`firestore.rules`](file:///c:/Users/ARGHA/Downloads/Web_clone/firestore.rules):
```javascript
// 1. UID-First User Profile Resolution
function hasUidProfile() {
  return isAuthenticated() && exists(/databases/$(database)/documents/users/$(request.auth.uid));
}

function hasEmailProfile() {
  return isAuthenticated() && request.auth.token.email != null &&
    exists(/databases/$(database)/documents/users/$(request.auth.token.email));
}

function userProfile() {
  return hasUidProfile()
    ? get(/databases/$(database)/documents/users/$(request.auth.uid)).data
    : get(/databases/$(database)/documents/users/$(request.auth.token.email)).data;
}

// 2. Explicit Outlet Access Authorization
function hasOutletAccess(restId, outletId) {
  return isSuperAdmin() || (
    isRestaurantStaff(restId) && (
      userProfile().get('allOutlets', false) == true ||
      (userProfile().get('assignedOutletIds', []) is list &&
       outletId in userProfile().get('assignedOutletIds', []))
    )
  );
}

// 3. User Immutability & Anti-Escalation Checks
allow update: if isSuperAdmin() || (
  hasActiveProfile() &&
  userProfile().role in ['restaurant_admin', 'owner'] &&
  resource.data.restaurantId == userProfile().restaurantId &&
  request.resource.data.restaurantId == userProfile().restaurantId &&
  request.resource.data.role != 'super_admin' &&
  request.resource.data.role != 'owner'
) || (
  isAuthenticated() &&
  (request.auth.uid == userId || request.auth.token.email == userId) &&
  request.resource.data.get('role', resource.data.get('role', 'waiter')) == resource.data.get('role', 'waiter') &&
  request.resource.data.get('restaurantId', '') == resource.data.get('restaurantId', '') &&
  request.resource.data.get('allOutlets', false) == resource.data.get('allOutlets', false) &&
  request.resource.data.get('assignedOutletIds', []) == resource.data.get('assignedOutletIds', [])
);
```

---

## 7. Verification & Test Results

### A. Live Cloud Firestore Emulator Verification (`@firebase/rules-unit-testing`)
Executed using:
```bash
npx firebase emulators:exec --project=demo-abar-khabo --only firestore "node tests/emulator_rules_unit.test.js"
```
**Results: 25 / 25 Scenarios Passed (0 Failed)**
```text
  ✓ PASS: Admin A reading Tenant A orders (Allowed)
  ✓ PASS: Admin A reading Tenant B orders (Cross-tenant blocked)
  ✓ PASS: Admin A updating Tenant B orders (Cross-tenant blocked)
  ✓ PASS: Admin A reading Tenant B Aggregator credentials (Cross-tenant blocked)
  ✓ PASS: Unauthenticated user reading private orders (Forbidden)
  ✓ PASS: Customer A reading own address (Allowed)
  ✓ PASS: Customer B reading Customer A address (Forbidden)
  ✓ PASS: Unauthenticated user reading Customer A address (Forbidden)
  ✓ PASS: Unauthenticated user reading GPS deliveryTracking (Forbidden - Requirement 5)
  ✓ PASS: Customer A reading own deliveryTracking (Allowed)
  ✓ PASS: Assigned Rider reading deliveryTracking (Allowed)
  ✓ PASS: Assigned Rider updating GPS coordinates on deliveryTracking (Allowed)
  ✓ PASS: Assigned Rider altering order totalAmount (Forbidden - Requirement 7 & 8)
  ✓ PASS: Rider self-verifying KYC / isAadhaarVerified (Forbidden - Requirement 8)
  ✓ PASS: Rider updating their own online availability (Allowed)
  ✓ PASS: Staff reading own profile via UID document users/{uid} (Allowed)
  ✓ PASS: Staff reading own profile via legacy email document users/{email} (Allowed)
  ✓ PASS: Staff attempting to escalate role to super_admin or restaurant_admin (Forbidden)
  ✓ PASS: Staff attempting to change restaurantId to another tenant (Forbidden)
  ✓ PASS: Staff attempting to self-grant allOutlets: true (Forbidden)
  ✓ PASS: Restaurant Admin attempting to create super_admin account (Forbidden)
  ✓ PASS: Restaurant Admin A creating staff for Restaurant B (Cross-tenant forbidden)
  ✓ PASS: Restaurant Admin A creating valid staff for own Restaurant A (Allowed)
  ✓ PASS: Staff A attempting to read Tenant B Admin profile (Cross-tenant forbidden)
  ✓ PASS: Super Admin reading user profiles across any tenant (Allowed)

================================================================================
LIVE EMULATOR TEST SUMMARY: 25 PASSED, 0 FAILED
================================================================================
```

### B. Unit & AST Test Suites (`npm test`)
- **Suite 1: Outlet Model Unit Tests (`tests/test_outlet_model.js`):** 45 / 45 Passed
- **Suite 2: Staff Identity Unit Tests (`tests/test_staff_identity.js`):** 40 / 40 Passed
- **Suite 3: AST Security Rules Isolation Tests (`tests/test_rules_isolation.js`):** 47 / 47 Passed
- **Total Combined Tests:** **132 / 132 Passed (0 Failed)**

### C. Client Production Build (`npm --prefix client run build`)
- Transformed 1674 modules in 4.50s with **0 compilation errors**.

---

## 8. Existing Functionality Regression Results

- **POS Counter & Floor Tables:** Tested with `waiter` and `cashier` profiles; all dine-in order and table flows remain functional.
- **Kitchen KDS:** Tested with `kitchen` role; KOT display and cooking status updates remain intact.
- **Rider & Delivery Portal:** Tested with `delivery_partner` role; live GPS transmission and status changes remain intact.
- **Customer Portal:** Tested with `customer` role; order tracking and address management remain intact.
- **Super Admin Dashboard:** Tested with `super_admin` role (`altcafe2026@gmail.com`); platform-wide tenant and staff inspection remains intact.

---

## 9. Remaining Architectural Risks & Next Step

1. **Risk:** Menu items and pricing are currently brand-level only without independent outlet-specific pricing overrides.
   * *Mitigation:* Addressed in **Step 3 (Menu Catalog, Outlet Overrides & Channel Pricing Model)**.
2. **Risk:** Aggregator credentials must remain strictly backend-only.
   * *Mitigation:* Aggregator connection schemas in Step 4+ store Google Secret Manager resource pointers rather than plaintext tokens.

**Execution Status:** Step 2 is fully implemented and verified. Execution is paused. Awaiting explicit user approval before proceeding to Step 3.
