# Abar Khabo: Multi-Tenant Aggregator Platform — Project Progress Tracker

## Status Overview
* **Current Stage:** STAGE 2 PART B (Step 10 Complete — Awaiting User Approval to Begin Step 11)
* **Target Platforms:** Swiggy, Zomato, Abar Khabo Direct Ordering
* **Target Architecture:** Multi-Tenant SaaS, Outlet Hierarchy, Node.js + TypeScript Backend, Firestore Database, React + Vite Frontend.

---

## Stage Tracking

| Stage | Description | Status | Completion Date |
| :--- | :--- | :--- | :--- |
| **STAGE 0** | Repository Inspection, Architecture Audit & Risk Analysis | **COMPLETE** | 2026-11-15 |
| **STAGE 1** | Security & Strict Tenant Isolation | **COMPLETE** | 2026-11-15 |
| **STAGE 2** | Database Schema & Outlets Model | **PART B IN PROGRESS** (Step 10 Complete; Awaiting Step 11 Approval) | 2026-11-15 |
| **STAGE 3** | Backend Integration Infrastructure (`server/`) | QUEUED | - |
| **STAGE 4** | Common Aggregator Adapter Framework | QUEUED | - |
| **STAGE 5** | Mock Swiggy & Zomato Integration & Test Sandbox | QUEUED | - |
| **STAGE 6** | Unified Order Management Engine (POS, KDS & Aggregators) | QUEUED | - |
| **STAGE 7** | Menu & Centralized Inventory Synchronization | QUEUED | - |
| **STAGE 8** | Aggregator Management Frontend (Dashboard, Sync, Logs) | QUEUED | - |
| **STAGE 9** | Middleware Integration (UrbanPiper) Pipeline | QUEUED | - |
| **STAGE 10** | Direct Aggregator Production Configuration & Handover | QUEUED | - |
| **STAGE 11** | End-to-End Verification, Documentation & Cloud Deployment | QUEUED | - |

---

## Stage 1 Summary (Security & Strict Tenant Isolation)

* **What was implemented:**
  * Replaced wide-open rules in `firestore.rules` with strict multi-tenant boundaries and role-based access controls across all collections (`onlineOrders`, `deliveryTracking`, `deliveryPartners`, `restaurants`, `users`, `customers`).
  * Enforced cross-tenant barrier: users of Restaurant A can never read or write Restaurant B's orders, invoices, tables, KOTs, settings, or staff.
  * Enforced role privilege limits: waiters and kitchen staff cannot delete records, modify menus, or escalate their roles.
  * Aadhaar & KYC compliance overhaul: eliminated raw 12-digit Aadhaar storage; now only storing masked Aadhaar (`•••• •••• 1234`) and last 4 digits; disclaimed simulated OTP as format verification rather than official UIDAI e-KYC.
  * Created unit test suite (`tests/test_rules_isolation.js`) testing 30 security scenarios across cross-tenant attacks, unauthenticated reads, role privilege violations, and customer privacy.
* **Files Created:**
  * `firestore.rules.backup` (Safe backup of original rules)
  * `tests/test_rules_isolation.js` (Automated 30-scenario security test suite)
* **Files Modified:**
  * `firestore.rules` (Strict tenant isolation & RBAC)
  * `package.json` (Added `test:security` script and ES module type)
  * `client/src/context/DeliveryPartnerAuthContext.jsx` (Masked Aadhaar compliance)
  * `client/src/pages/RestaurantDeliveryManagementPage.jsx` (Masked Aadhaar storage)
  * `client/src/pages/DeliveryPartnerAuthPage.jsx` (KYC compliance UI notices)
  * `client/src/pages/CustomerOrderTrackingPage.jsx` (KYC Verified badge label)
  * `client/src/pages/CustomerPortalPage.jsx` (KYC Verified badge label)
* **Test Verification:**
  * 30 out of 30 security test cases passed.
  * Vite production build verified cleanly with 0 errors.

---

## Stage 2 Summary (Database Schema & Outlets Model — Part A: Revised Design)

* **What was implemented & revised:**
  * **Composite Outlet Identity:** Clarified that `${restaurantId}_main` is scoped locally, with global uniqueness defined by the composite key `(restaurantId, outletId)` and full document path.
  * **Secret Management:** Designed backend-only credential access via Google Cloud Secret Manager; Firestore holds only versioned secret references (`secretResourceName`), never plaintext tokens.
  * **Dual-Mirroring & Deduplication:** Redesigned `aggregatorOrders/{orderId}` as the authoritative record, with background idempotent mirroring to legacy `onlineOrders`, deduplicating KOTs and stock deductions via `aggregatorOrderId`.
  * **Staff UID & Explicit Authorization:** Shifted primary identity to `users/{uid}`, requiring explicit `allOutlets: true` for brand-wide access and preventing implicit universal access on empty `assignedOutletIds`.
  * **Independent Channel Pricing & Inventory:** Added explicit rupee overrides per channel (`Dine-in`, `Direct`, `Swiggy`, `Zomato`), transactional stock deductions, cancellation reversals, waste tracking, and overselling prevention.
  * **Comprehensive Financial Model:** Specified gross sales, packaging, commissions, TCS/TDS GST, discounts, and net payouts in `settlementRecords`.
  * **Query Constraint Alignment:** Defined mandatory query constraints (`where('restaurantId', '==', ...)` and `where('outletId', '==', ...)`) required by security rules.
* **Files Created / Modified:**
  * `STAGE2_DATABASE_SCHEMA.md` (Revised to v2.0.0-PROPOSED)
  * `PROJECT_PROGRESS.md` (Updated)

---

## Stage 2 Part B Summary (Step 1: Restaurant and Outlet Data Model)

* **What was implemented:**
  * **Enterprise Outlet Service (`client/src/services/outletService.js`):**
    * Canonical document paths: `restaurants/{restaurantId}/outlets/{outletId}`.
    * Deterministic default outlet strategy: `${restaurantId}_main`.
    * Composite business key support: `(restaurantId, outletId)` / `restaurantId#outletId`.
    * Enterprise outlet validation (`restaurantId`, `outletName`, `status` enforcement).
    * Comprehensive payload normalization (defaults for operating hours, delivery radius, contact, coordinates, status).
    * **Zero-Downtime Backward Compatibility Synthesis (`synthesizeDefaultOutlet`):** Converts single-restaurant documents to virtual default outlet objects on-the-fly, allowing unmigrated databases to operate without forced data migration or downtime.
    * Complete Firestore CRUD suite: `createOutlet`, `getOutlet`, `getOutletsByRestaurant`, `updateOutlet`, `deleteOutlet`, `ensureDefaultOutlet`, and `subscribeOutlets`.
  * **Frontend Multi-Tenant React Context (`client/src/context/RestaurantContext.jsx`):**
    * Enhanced with outlet awareness: `outlets`, `activeOutletId`, `activeOutlet`, `setActiveOutletId`, `updateActiveOutlet`, and `refreshOutlets`.
    * Preserves 100% backward compatibility for all existing consumers accessing `restaurant`, `loading`, `currencySymbol`, `taxRate`, `taxName`, and `updateRestaurant`.
  * **Composite Indexes Configuration (`firestore.indexes.json` & `firebase.json`):**
    * Configured collection-group indexes for `outlets` covering `(restaurantId, status)` and `(restaurantId, isDefaultOutlet)`.
  * **Automated Unit & Isolation Test Harness (`tests/test_outlet_model.js`):**
    * 45 comprehensive test assertions verifying canonical paths, deterministic IDs, composite keys, schema validation, payload normalization, synthetic backward compatibility, and multi-branch discrimination.
* **Files Created:**
  * `client/src/services/outletService.js`
  * `firestore.indexes.json`
  * `tests/test_outlet_model.js`
* **Files Modified:**
  * `client/src/context/RestaurantContext.jsx`
  * `client/src/services/firestoreService.js` (re-exports outlet functions)
  * `client/src/firebase/config.js` (environment-agnostic import.meta / Node runtime guard)
  * `firebase.json` (indexed firestore.indexes.json)
  * `package.json` (added `npm test` and `npm run test:outlet`)
  * `.gitignore` (safeguarded `*.zip` artifacts)
  * `PROJECT_PROGRESS.md` (updated status)
* **Test Verification Results:**
  * `npm test`: 82 / 82 tests passed (45 outlet model unit tests + 37 security isolation tests).
  * Vite Production Build (`npm --prefix client run build`): 1673 modules bundled cleanly with 0 errors.
* **Remaining Risks & Mitigations:**
  * *Risk:* Staff accounts currently query `users/{email}` rather than `users/{uid}`.
  * *Mitigation:* Scheduled for Step 2 (Staff identity transition to `users/{uid}` with `allOutlets: true` flag and dual-lookup backward compatibility).
* **Next Authorized Step:**
  * Step 2 completed.

---

## Stage 2 Part B Summary (Step 2: UID-Based Staff Identity & Outlet Authorization)

* **What was implemented:**
  * **Staff Identity & Outlet Authorization Service (`client/src/services/staffIdentityService.js`):**
    * Canonical UID profile identity: `users/{uid}`.
    * Dual-lookup with non-destructive lazy migration from legacy `users/{email}`.
    * Explicit outlet permission evaluation (`canAccessOutlet`, `validateOutletSelection`).
    * Enforced tenant isolation and strict defaults (empty/missing `assignedOutletIds` with `allOutlets: false` strictly denies access).
    * Recognition of all 8 core platform roles (`super_admin`, `owner`, `restaurant_admin`, `outlet_manager`, `cashier`, `kitchen`, `waiter`, `delivery_partner`).
  * **Hardened Security Rules (`firestore.rules`):**
    * Profile lookup functions check `users/$(request.auth.uid)` with legacy email fallback.
    * Added `hasOutletAccess(restId, outletId)` helper enforcing tenant boundaries and assigned outlet membership.
    * Protected `role`, `restaurantId`, `allOutlets`, and `assignedOutletIds` against client-side self-tampering / privilege escalation.
    * Prohibited restaurant admins from creating `super_admin` or `owner` accounts, or provisioning staff outside their tenant.
  * **React Auth & Context Integration (`AuthContext.jsx` & `RestaurantContext.jsx`):**
    * Authenticated user session exposes `allOutlets`, `assignedOutletIds`, and `canAccessOutlet(outletId)`.
    * Active outlet switching validates permission with instant toast rejection and fallback to first authorized outlet on unauthorized attempts.
* **Files Created:**
  * `client/src/services/staffIdentityService.js`
  * `tests/test_staff_identity.js`
  * `STAGE2_STEP2_IMPLEMENTATION_REPORT.md`
* **Files Modified:**
  * `firestore.rules`
  * `client/src/context/AuthContext.jsx`
  * `client/src/context/RestaurantContext.jsx`
  * `client/src/services/firestoreService.js`
  * `package.json`
  * `tests/emulator_rules_unit.test.js`
  * `tests/test_rules_isolation.js`
  * `PROJECT_PROGRESS.md`
* **Test Verification Results:**
  * **Live Firestore Emulator:** 25 / 25 scenarios passed (gRPC `PERMISSION_DENIED` enforced for role escalation, tenant hopping, and unauthorized outlet access).
  * **Unit & AST Suites (`npm test`):** 132 / 132 tests passed (45 outlet model + 40 staff identity + 47 security rules).
  * **Vite Production Build:** 1674 modules bundled cleanly in 4.50s with 0 errors.
* **Next Authorized Step:**
  * Step 3 completed.

---

## Stage 2 Part B Summary (Step 3: Master Menu Catalog, Outlet Overrides & Channel Pricing)

* **What was implemented:**
  * **Master Menu Catalog & Pricing Engine (`client/src/services/menuService.js`):**
    * Master Catalog schema: `restaurants/{restaurantId}/menuCatalog/{itemId}`.
    * Outlet Overrides schema: `restaurants/{restaurantId}/outlets/{outletId}/menuOverrides/{itemId}`.
    * Multi-Channel Pricing Engine covering 5 channels (`DINE_IN`, `DIRECT_ONLINE`, `SWIGGY`, `ZOMATO`, `TAKEAWAY`) with five-level priority resolution hierarchy.
    * Currency rounding to integer rupees and precise tax breakdown calculation (tax inclusive vs exclusive).
    * Multi-level availability resolution (master status, outlet 86 toggle, temporary `outOfStockUntil` window, and channel availability toggles).
    * Historical order preservation principle (order snapshots retain checkout pricing regardless of future menu updates).
    * Zero-downtime backward compatibility mirror with legacy `menuItems` subcollection.
  * **Hardened Security Rules (`firestore.rules`):**
    * Restricted `menuCatalog` write access strictly to Brand Admins (`restaurant_admin`, `owner`, `super_admin`).
    * Restricted `menuOverrides` write access to Brand Admins and assigned Outlet Managers (`hasOutletAccess`).
    * Prohibited cashiers, waiters, and kitchen staff from modifying master menu catalog or outlet overrides.
    * Enforced cross-tenant and cross-outlet write prevention.
* **Files Created:**
  * `client/src/services/menuService.js`
  * `tests/test_menu_pricing.js`
  * `STAGE2_STEP3_IMPLEMENTATION_REPORT.md`
* **Files Modified:**
  * `firestore.rules`
  * `client/src/services/firestoreService.js`
  * `package.json`
  * `tests/emulator_rules_unit.test.js`
  * `tests/test_rules_isolation.js`
  * `PROJECT_PROGRESS.md`
* **Test Verification Results:**
  * **Live Firestore Emulator:** 32 / 32 scenarios passed (gRPC `PERMISSION_DENIED` enforced for unauthorized menu writes, cross-tenant menu writes, and unassigned outlet override writes).
  * **Unit & AST Suites (`npm test`):** 170 / 170 tests passed (45 outlet model + 40 staff identity + 30 menu pricing + 55 security rules).
  * **Vite Production Build:** 1675 modules bundled cleanly in 4.61s with 0 errors.
* **Next Authorized Step:**
  * Step 4 completed.

---

## Stage 2 Part B Summary (Step 4: Normalized Online Orders & Dual-Mirroring Engine)

* **What was implemented:**
  * **Authoritative Normalized Order Service (`client/src/services/normalizedOrderService.js`):**
    * Authoritative schema: `aggregatorOrders/{orderId}` conforming to Stage 2 v2.0.0-PROPOSED.
    * Deterministic idempotency keys: `${source}_${outletId}_${externalOrderId}` preventing duplicate webhook processing.
    * Comprehensive financial calculation engine: item total, item discounts, packaging, 5% GST tax calculation with CGST/SGST split, round-off, 18% aggregator commission calculation, and net merchant payout.
    * Item snapshot locking: complete freeze of variant, add-on, price, and instructions at order time.
    * Formal lifecycle state machine: `PLACED` -> `ACCEPTED` -> `PREPARING` -> `READY` -> `DISPATCHED` -> `COMPLETED`, with explicit transitions for `CANCELLED` and `REJECTED`, and prevention of step-skipping and terminal-state mutation.
    * Zero-downtime dual-mirroring engine: maps v2.0.0 normalized orders to legacy structure and writes atomically to `restaurants/{restaurantId}/onlineOrders/{orderId}` and root `onlineOrders/{orderId}`.
    * Sync retry safety with `mirrorStatus: 'SYNCED' | 'FAILED' | 'PENDING'`.
  * **Hardened Security Rules (`firestore.rules`):**
    * Added `match /aggregatorOrders/{orderId}` with strict access controls.
    * Closed to public reads; permitted only for Super Admin, verified restaurant staff with explicit outlet access (`hasOutletAccess`), owning customer, or assigned rider.
    * Enforced client-side immutability: staff can update order status and timestamps, but cannot tamper with `pricing`, `items`, `restaurantId`, or `outletId`.
    * Prohibited identity spoofing during customer direct order creation.
  * **Re-exported in `client/src/services/firestoreService.js`:**
    * Unified access to normalized order functions (`ingestNormalizedOrder`, `getNormalizedOrder`, `updateNormalizedOrderStatus`, `subscribeNormalizedOrdersByOutlet`, `mirrorOrderToLegacy`).
* **Files Created:**
  * `client/src/services/normalizedOrderService.js`
  * `tests/test_normalized_orders.js`
  * `STAGE2_STEP4_IMPLEMENTATION_REPORT.md`
* **Files Modified:**
  * `firestore.rules`
  * `client/src/services/firestoreService.js`
  * `package.json`
  * `tests/emulator_rules_unit.test.js`
  * `tests/test_rules_isolation.js`
  * `PROJECT_PROGRESS.md`
* **Test Verification Results:**
  * **Live Firestore Emulator:** 42 / 42 scenarios passed (all 10 new order scenarios passed with gRPC `PERMISSION_DENIED` on price/item tampering, cross-tenant/cross-outlet reading, and customer isolation).
  * **Unit & AST Suites (`npm test`):** 226 / 226 tests passed (45 outlet + 40 identity + 30 menu + 46 order + 65 security AST).
  * **Vite Production Build:** 1676 modules bundled cleanly in 4.64s with 0 errors.
* **Next Authorized Step:**
  * Step 5 completed.

---

## Stage 2 Part B Summary (Step 5: Aggregator Connection State & Webhook Ingestion Pipeline)

* **What was implemented:**
  * **Mandatory Step 4 Architectural Corrections:**
    * Shifted authoritative order ingestion, idempotency hashing, and financial logic from React client into trusted Node.js backend using Firebase Admin SDK (`server/src/services/trustedOrderService.js`).
    * Replaced hardcoded 5% GST and 18% commission with dynamic financial configuration engine (`server/src/config/financialConfig.js`) resolving outlet and connection overrides while preserving historical snapshots.
    * Replaced string concatenation with canonical tuple encoding `(provider:restaurantId:outletId:externalOrderId)` and SHA-256 cryptographic hashing (`server/src/utils/cryptoUtils.js`).
    * Structured legacy mirroring into independent per-destination targets (`tenantSubcollection`, `rootCollection`) with independent attempt tracking and selective retry capabilities.
  * **Aggregator Connection Model (`server/src/services/connectionService.js`):**
    * Document path: `restaurants/{restaurantId}/outlets/{outletId}/aggregatorConnections/{connectionId}`.
    * Supported providers: `SWIGGY`, `ZOMATO`.
    * Six operational states: `NOT_CONNECTED`, `PENDING_AUTHORIZATION`, `CONNECTED`, `DISCONNECTED`, `ERROR`, `SUSPENDED`.
    * Strict Secret Security: Zero plaintext secrets stored in Firestore. All credentials resolved via Google Cloud Secret Manager resource strings (`secretReference`).
  * **Enterprise Secret Manager Service (`server/src/services/secretManagerService.js`):**
    * Production GCP Secret Manager client abstraction with in-memory sandbox mock vault for local offline test execution.
  * **Secure Webhook Ingestion Pipeline (`server/src/services/webhookIngestionService.js`):**
    * Processes Swiggy and Zomato payloads with HMAC-SHA256 signature verification using constant-time comparison (`crypto.timingSafeEqual`).
    * Mitigates replay attacks via timestamp drift validation (< 300 seconds).
    * Deduplicates events via deterministic event hashing into `integrationWebhooks/{webhookId}`.
    * Automatic PII redaction (phones, customer names, cards) before recording audit logs.
    * Exponential backoff and dead-letter queue (DLQ) after 3 consecutive failures.
  * **Security Rules Hardening (`firestore.rules`):**
    * Added `match /integrationWebhooks/{webhookId}`: Public & client writes blocked (Backend Admin SDK only); read restricted to Super Admin or Brand Admin of that restaurant.
    * `aggregatorConnections` read/write restricted strictly to Brand Admin (`isRestaurantAdmin`).
* **Files Created:**
  * `server/src/config/firebaseAdmin.js`
  * `server/src/config/financialConfig.js`
  * `server/src/utils/logger.js`
  * `server/src/utils/cryptoUtils.js`
  * `server/src/services/secretManagerService.js`
  * `server/src/services/connectionService.js`
  * `server/src/services/trustedOrderService.js`
  * `server/src/services/webhookIngestionService.js`
  * `client/src/services/aggregatorConnectionService.js`
  * `tests/test_aggregator_webhooks.js`
  * `STAGE2_STEP5_IMPLEMENTATION_REPORT.md`
* **Files Modified:**
  * `firestore.rules`
  * `client/src/services/firestoreService.js`
  * `package.json`
  * `tests/emulator_rules_unit.test.js`
  * `tests/test_rules_isolation.js`
  * `PROJECT_PROGRESS.md`
* **Test Verification Results:**
  * **Live Firestore Emulator:** 48 / 48 scenarios passed (including all 6 new aggregator connection & webhook audit security scenarios).
  * **Unit & AST Suites (`npm test`):** 289 / 289 tests passed (45 outlet + 40 identity + 30 menu + 46 order + 53 webhook + 75 security AST).
  * **Vite Production Build:** 1,677 modules bundled cleanly in 4.52s with 0 errors.
* **Next Authorized Step:**
  * Step 6 completed.

---

## Stage 2 Part B Summary (Step 6: Unified Order Management Engine — POS, KDS & Aggregators)

* **What was implemented:**
  * **Unified Order Document Model (`aggregatorOrders/{orderId}`):**
    * Authoritative single source of truth across all 5 order channels: `ABAR_KHABO`, `POS`, `SWIGGY`, `ZOMATO`, `TAKEAWAY`.
    * Extended schema to capture `tableId`, `tableNumber`, `waiterId`, and `waiterName` for complete POS Dine-In fidelity.
  * **Visual Channel Differentiation (`client/src/components/common/ChannelBadge.jsx`):**
    * Distinct Tailwind color styling for instant channel identification across POS, KDS, Cashier, and Order management views:
      * Emerald (`bg-emerald-500/15`, `text-emerald-700`) for `ABAR_KHABO` (Direct Online)
      * Orange (`bg-orange-500/15`, `text-orange-700`) for `SWIGGY`
      * Red (`bg-red-500/15`, `text-red-700`) for `ZOMATO`
      * Blue (`bg-blue-500/15`, `text-blue-700`) for `POS` (Dine-In)
      * Neutral Slate (`bg-slate-500/15`, `text-slate-700`) for `TAKEAWAY`
  * **Idempotent KOT Generation (`KOT_${orderId}_1`):**
    * Deterministic document ID strategy guarantees zero duplicate tickets, zero repeated audio alerts, and zero double cooking upon network retries or repeated webhook events.
    * Implemented in `server/src/services/trustedOrderService.js:ensureOrderKOT` and bridged into `client/src/services/firestoreService.js:createOrderWithKOT`.
  * **Kitchen Display System (KDS) Synchronization (`client/src/pages/KitchenPage.jsx`):**
    * Multi-channel queue filtered by `activeOutletId` from `RestaurantContext`.
    * Bidirectional status synchronization: KOT status changes (`NEW` -> `PREPARING` -> `READY`) automatically propagate back to authoritative `aggregatorOrders/{orderId}` and legacy mirrors.
  * **POS & Table Management Flow (`client/src/pages/POSPage.jsx`):**
    * Trusted POS order creation (`trustedOrderService.createPosOrder`) binds `outletId`, customer metadata, line items, and updates table occupancy atomically.
  * **Cashier Settlement & Invoices (`client/src/pages/CashierPage.jsx` & `client/src/services/firestoreService.js`):**
    * Table release and checkout (`settleAndReleaseTableAtomic`) binds `outletId` to generated invoices and transitions `aggregatorOrders/{orderId}` to `COMPLETED` with `payment.status: PAID`.
    * Preserves strict payment separation (`ONLINE` for aggregators vs `CASH`/`UPI`/`CARD` for POS).
  * **Customer & Delivery Compatibility:**
    * Direct consumer delivery addresses and customer identities protected from public scraping.
    * Aggregator delivery partner tracking, fleet metadata, and pickup OTP preserved.
* **Scope Exclusions Strictly Enforced:**
  * Inventory deduction, stock reservation, and cancellation restocking strictly excluded (deferred to Step 7).
  * No live Swiggy/Zomato APIs or credentials connected.
  * No production Firestore rules or cloud services deployed.
* **Files Created:**
  * `client/src/components/common/ChannelBadge.jsx`
  * `tests/test_unified_order_engine.js`
  * `STAGE2_STEP6_IMPLEMENTATION_REPORT.md`
* **Files Modified:**
  * `server/src/services/trustedOrderService.js`
  * `client/src/services/firestoreService.js`
  * `client/src/pages/KitchenPage.jsx`
  * `client/src/pages/POSPage.jsx`
  * `client/src/pages/CashierPage.jsx`
  * `client/src/pages/OrdersPage.jsx`
  * `client/src/pages/OnlineOrdersPage.jsx`
  * `package.json`
  * `PROJECT_PROGRESS.md`
* **Test Verification Results:**
  * **Step 6 Unit Suite (`tests/test_unified_order_engine.js`):** 44 / 44 tests passed covering all 16 specified requirements.
  * **Complete Regression Suite (`npm test`):** 333 / 333 assertions passed across all 7 test suites.
  * **Live Firestore Emulator (`tests/emulator_rules_unit.test.js`):** 48 / 48 scenarios passed.
  * **Vite Production Build:** 1,678 modules transformed cleanly in 4.56s with 0 errors.
* **Next Authorized Step:**
  * Step 7 completed.

---

## Stage 2 Part B Summary (Step 7: Inventory, Recipe & Menu Availability Engine)

* **What was implemented:**
  * **Unit Conversion Engine (`unitConverter.js`):**
    * Multi-dimensional conversion covering Mass (`kg`, `g`, `mg`), Volume (`litre`, `ml`), and Discrete Count (`pcs`, `pkt`, `box`, `can`, etc.).
    * Strict dimension validation: prevents conversion between incompatible dimensions (e.g. `kg` to `ml` or `kg` to `pcs`).
  * **Master Ingredient Catalog & Outlet Stock Balances:**
    * Catalog: `restaurants/{restaurantId}/ingredients/{ingredientId}` (SKU, category, baseUnit, minThreshold, reorderQuantity, supplier reference).
    * Outlet stock: `restaurants/{restaurantId}/outlets/{outletId}/inventoryStock/{ingredientId}` tracking `currentStock`, `reservedStock`, and `availableStock`.
  * **Recipe & Menu Item Mapping Engine (`recipeService.js`):**
    * Master recipes: `restaurants/{restaurantId}/recipes/{itemId}`.
    * Outlet recipe overrides: `restaurants/{restaurantId}/outlets/{outletId}/recipeOverrides/{itemId}`.
    * Dynamic variant modifiers (e.g., Special Double Mutton) and add-on modifiers (e.g., Extra Aloo).
    * Order-time historical recipe snapshots attached to `aggregatorOrders/{orderId}.inventorySnapshot`.
    * Items without configured recipes remain fully orderable without blocking.
  * **Inventory Ledger & Transaction Safety (`inventoryLedgerService.js`):**
    * 10 distinct movement types: `OPENING_STOCK`, `PURCHASE`, `STOCK_ADJUSTMENT`, `RESERVATION`, `RESERVATION_RELEASE`, `CONSUMPTION`, `RESTOCK`, `TRANSFER_OUT`, `TRANSFER_IN`, `WASTAGE`.
    * Deterministic SHA-256 idempotency key: `(movementType:restaurantId:outletId:referenceId:ingredientId)`.
    * Atomic Firestore transactions guarantee concurrent stock integrity and prevent overselling.
    * Configurable inventory policy supporting negative stock prevention, automatic reservation release, and post-cooking cancellation wastage.
  * **Order Lifecycle Integration (`trustedOrderService.js`):**
    * Order Placed/Accepted $\rightarrow$ stock atomically reserved (`RESERVATION`).
    * Cooking Started (`PREPARING`) $\rightarrow$ reservation converted to physical consumption (`CONSUMPTION`).
    * Pre-cooking Cancellation $\rightarrow$ reservation released (`RESERVATION_RELEASE`).
    * Post-cooking Cancellation $\rightarrow$ recorded as wastage (`WASTAGE`).
    * Works identically across POS, Takeaway, Abar Khabo Direct, Swiggy, and Zomato.
  * **Menu Availability Engine (`menuService.js`):**
    * Calculates status: `AVAILABLE`, `LOW_STOCK`, `OUT_OF_STOCK`, `DISABLED`.
    * Strict outlet independence: stock depletion at Branch 2 does not disable the item at Branch 1.
    * Public customer menu sanitization: strips internal recipes, raw stock numbers, and supplier details.
  * **Security Hardening (`firestore.rules`):**
    * `inventoryLedger`: write strictly forbidden to clients (Super Admin / Admin SDK backend only).
    * `ingredients`, `recipes`, `suppliers`: Admin manage, staff read.
    * `inventoryStock`, `recipeOverrides`, `purchases`: Admin / Outlet Manager manage.
    * Customers and public users strictly denied access to raw inventory data.
* **Files Created:**
  * `server/src/utils/unitConverter.js`
  * `client/src/utils/unitConverter.js`
  * `server/src/services/recipeService.js`
  * `server/src/services/inventoryLedgerService.js`
  * `client/src/services/inventoryService.js`
  * `tests/test_inventory_recipe_engine.js`
  * `STAGE2_STEP7_IMPLEMENTATION_REPORT.md`
* **Files Modified:**
  * `server/src/services/trustedOrderService.js`
  * `server/src/utils/cryptoUtils.js`
  * `client/src/services/menuService.js`
  * `client/src/services/firestoreService.js`
  * `firestore.rules`
  * `tests/test_rules_isolation.js`
  * `tests/emulator_rules_unit.test.js`
  * `package.json`
  * `PROJECT_PROGRESS.md`
* **Test Verification Results:**
  * **Step 7 Unit Suite (`tests/test_inventory_recipe_engine.js`):** 69 / 69 tests passed covering all 21 categories.
  * **Complete Regression Suite (`npm test`):** 412 / 412 assertions passed across all 8 test suites.
  * **Live Firestore Emulator (`tests/emulator_rules_unit.test.js`):** 55 / 55 scenarios passed.
  * **Vite Production Build:** 1,680 modules transformed cleanly in 4.51s with 0 errors.
* **Next Authorized Step:**
  * Step 8 completed.

---

## Stage 2 Part B Summary (Step 8: Delivery Management, Rider Dispatch & Fleet Logistics)

* **What was implemented:**
  * **UID-Based Delivery Partner Identity & Profile Model:**
    * Rider accounts use Firebase Auth UID as primary key: `users/{uid}` with `role: 'delivery_partner'` and `deliveryPartners/{uid}` fleet profile.
    * Explicit tenant and outlet binding: `restaurantId`, `assignedOutletIds`, `allOutlets`.
    * Aadhaar & KYC compliance: masked Aadhaar (`•••• •••• 1234`), status `SIMULATION_TEST_VERIFIED`, explicit disclaimers preventing claims of official UIDAI database validation.
  * **Multi-Tenant Fleet Isolation & Outlet Visibility:**
    * In-house riders filtered strictly by tenant brand and assigned outlet ID.
    * Branch 1 riders cannot be assigned to Branch 2 orders unless explicitly assigned.
  * **Aggregator Fleet Protection:**
    * Aggregator orders handled by external fleets (`SWIGGY_FLEET`, `ZOMATO_FLEET`) are isolated from internal fleet dispatch. Attempting to assign in-house riders throws an error unless `allowSelfDeliveryOverride` is enabled.
  * **Rider Dispatch & Assignment Engine (`deliveryDispatchService.js`):**
    * Manual assignment (`assignRiderToOrder`) with audit trails and capacity checks (`maxActiveDeliveries`).
    * Reassignment (`reassignRider`) releasing previous riders and logging reassignment events.
    * Automatic dispatch (`autoAssignRider`) selecting the closest available online rider within outlet pool.
    * Rider acceptance (`acceptAssignment`) and rejection (`rejectAssignment`) workflows.
  * **11-State Delivery Lifecycle Machine:**
    * Strict transitions: `DELIVERY_PENDING` $\rightarrow$ `RIDER_ASSIGNED` $\rightarrow$ `RIDER_ACCEPTED` $\rightarrow$ `ARRIVED_AT_RESTAURANT` $\rightarrow$ `PICKED_UP` $\rightarrow$ `OUT_FOR_DELIVERY` $\rightarrow$ `ARRIVED_AT_CUSTOMER` $\rightarrow$ `DELIVERED`.
    * Failure and return flows: `DELIVERY_FAILED` and `RETURNED` with failure reasons (`CUSTOMER_UNAVAILABLE`, `WRONG_ADDRESS`, etc.).
    * Dual OTP verification: pickup OTP from kitchen (`pickupOtp`) and delivery OTP from customer (`deliveryOtp`).
  * **Geofencing & Dynamic Delivery Pricing Engine (`deliveryZoneService.js`):**
    * Haversine formula distance calculation (`calculateDistanceKm`).
    * Outlet serviceability checks (`checkServiceability` checking coordinates, max radius, and min order values).
    * Dynamic fee calculation (`calculateDeliveryFee` supporting `DISTANCE_BASED`, `FIXED`, `FREE`, and threshold overrides).
  * **Separation of Food Prep vs Delivery Status:**
    * Kitchen cooking stages (`NEW` $\rightarrow$ `PREPARING` $\rightarrow$ `READY`) remain orthogonal to rider status. Rider actions never mutate inventory stock or invoice totals.
  * **Deterministic Operational Delivery Events (`deliveryEvents`):**
    * Idempotent audit logs at `restaurants/{restaurantId}/deliveryEvents/{eventId}` with SHA-256 deduplication.
    * Firestore rules: Staff read allowed, client writes strictly blocked (Super Admin / Admin SDK backend only).
* **Files Created:**
  * `server/src/services/deliveryZoneService.js`
  * `server/src/services/deliveryDispatchService.js`
  * `client/src/services/deliveryDispatchClientService.js`
  * `tests/test_delivery_fleet_engine.js`
  * `STAGE2_STEP8_IMPLEMENTATION_REPORT.md`
* **Files Modified:**
  * `client/src/services/firestoreService.js`
  * `firestore.rules`
  * `tests/test_rules_isolation.js`
  * `tests/emulator_rules_unit.test.js`
  * `package.json`
  * `PROJECT_PROGRESS.md`
* **Test Verification Results:**
  * **Step 8 Unit Suite (`tests/test_delivery_fleet_engine.js`):** 63 / 63 tests passed covering all 23 categories.
  * **Complete Regression Suite (`npm test`):** 564 / 564 assertions passed across all 9 test suites.
  * **Live Firestore Emulator (`tests/emulator_rules_unit.test.js`):** 59 / 59 scenarios passed.
  * **Vite Production Build:** 1,681 modules transformed cleanly in 4.62s with 0 errors.
* **Next Authorized Step:**
  * Step 9 completed.

---

## Stage 2 Part B Summary (Step 9: Payment, Settlement & Financial Reconciliation Engine)

* **What was implemented:**
  * **Unified Payment Transaction Model (`paymentTransactions`):**
    * Authoritative backend payment records stored at `restaurants/{restaurantId}/paymentTransactions/{transactionId}`.
    * 7-state payment lifecycle machine: `PENDING`, `AUTHORIZED`, `CAPTURED`, `FAILED`, `CANCELLED`, `PARTIALLY_REFUNDED`, `REFUNDED`.
    * Enforces strict payment collection separation: `RESTAURANT_COLLECTED` (POS Cash, UPI, Card, Direct Online) vs `AGGREGATOR_COLLECTED` (Swiggy Online, Zomato Online).
    * Never misclassifies aggregator orders as POS cash or card tenders.
  * **Deterministic SHA-256 Idempotency:**
    * Eliminates double-charging and duplicate refund processing on retry requests.
  * **Precision Monetary Arithmetic (`monetaryUtils.js`):**
    * Conducts calculations in integer minor units (paise: ₹1 = 100 paise) to eliminate IEEE-754 floating-point inaccuracies.
    * Exact CGST / SGST component splits and largest-remainder pro-rata allocation.
  * **Aggregator Settlement & Bank Reconciliation Engine (`settlementReconciliationService.js`):**
    * Ingests settlement batches via standardized JSON payloads and CSV statement files.
    * Evaluates orders across 6 reconciliation outcomes: `MATCHED`, `PARTIALLY_MATCHED`, `MISMATCHED`, `MISSING_ORDER`, `DUPLICATE_ENTRY`, `PENDING_REVIEW`.
    * Configurable tolerance thresholds (default ₹2.00 or 0.5%).
  * **Refund & Cancellation Engine:**
    * Supports full, partial, item-level, and cancellation refunds without altering historical order snapshots.
    * Seamlessly integrates with Step 7 inventory cancellation policies without duplicate deductions.
  * **Restaurant Financial Dashboard (`FinancialDashboardPage.jsx`):**
    * Multi-tenant, outlet-aware UI displaying Gross Sales, POS Collections, Direct Online Collections, Swiggy/Zomato Gross & Net Payouts, Commissions, Refunds, and Outstanding Settlements.
    * Registered `/financials` and `/settlements` routes in React router.
  * **Security Hardening (`firestore.rules`):**
    * `paymentTransactions` and `settlementRecords`: read allowed for authenticated restaurant staff / admins; writes strictly restricted to trusted backend Admin SDK (`isSuperAdmin()`).
* **Files Created:**
  * `server/src/utils/monetaryUtils.js`
  * `server/src/services/paymentTransactionService.js`
  * `server/src/services/settlementReconciliationService.js`
  * `client/src/services/paymentClientService.js`
  * `client/src/pages/FinancialDashboardPage.jsx`
  * `tests/test_payment_settlement_engine.js`
  * `STAGE2_STEP9_IMPLEMENTATION_REPORT.md`
* **Files Modified:**
  * `server/src/services/trustedOrderService.js`
  * `client/src/services/firestoreService.js`
  * `client/src/App.jsx`
  * `firestore.rules`
  * `tests/test_rules_isolation.js`
  * `tests/emulator_rules_unit.test.js`
  * `package.json`
  * `PROJECT_PROGRESS.md`
* **Test Verification Results:**
  * **Step 9 Unit Suite (`tests/test_payment_settlement_engine.js`):** 63 / 63 tests passed covering all 27 categories.
  * **Complete Regression Suite (`npm test`):** 633 / 633 assertions passed across all 10 test suites.
  * **Live Firestore Emulator (`tests/emulator_rules_unit.test.js`):** 64 / 64 scenarios passed.
  * **Vite Production Build:** 1,683 modules transformed cleanly in 4.52s with 0 errors.
* **Next Authorized Step:**
  * Step 9 completed.

---

## Stage 2 Part B Summary (Step 10: Platform Analytics, Super Admin Control Center & SaaS Subscription Management)

* **What was implemented:**
  * **SaaS Subscription Lifecycle & Plan Management (`subscriptionService.js`):**
    * Standardized platform tiers: `TRIAL` (Free 14 days), `STARTER` (₹999/mo), `PROFESSIONAL` (₹2,499/mo), `ENTERPRISE` (₹5,999/mo).
    * Comprehensive state machine: `TRIAL`, `ACTIVE`, `PAST_DUE`, `EXPIRED`, `SUSPENDED`, `CANCELLED`.
    * Lifecycle operations: automated trial creation, renewals, upgrades, downgrades, cancellations, and 7-day grace period enforcement.
    * Minor-unit SaaS subscription invoices (`subscriptionInvoices/{invoiceId}`) with itemized 18% GST calculation in integer paise.
    * Idempotent scheduled expiry processing.
  * **Central SaaS Entitlement & Grandfathering Engine (`entitlementService.js`):**
    * Authoritative enforcement of maximum outlet quotas, staff limits, and monthly order volumes per tier.
    * Modular feature gate checks for POS, KDS, Cashier, Inventory, Dedicated Delivery Fleet, Aggregator Integrations, and Advanced Analytics.
    * **Strict Grandfathering Invariant:** Plan downgrades block provisioning of additional outlets or staff beyond lower plan caps, but **NEVER** delete existing outlets, staff accounts, or historical order data.
    * Super Admin entitlement overrides support.
  * **Controlled Restaurant Tenant Lifecycle (`tenantLifecycleService.js`):**
    * Authoritative onboarding pipeline: `registerRestaurant` (`PENDING_APPROVAL`), `approveRestaurant` (`ACTIVE` + auto default outlet `${restaurantId}_main` + initial evaluation subscription), `rejectRestaurant`, `suspendRestaurant`, and `reactivateRestaurant`.
    * Immutable audit trail writing all tenant operations to `platformAuditLogs/{logId}`.
  * **Platform-Wide Analytics Engine (`platformAnalyticsService.js`):**
    * Computes real MRR (Monthly Recurring Revenue) and ARR (Annual Recurring Revenue) strictly from stored documents using integer minor-unit arithmetic.
    * Zero fabricated revenue or order numbers; resilient sparse/empty data handling.
    * Scoped single-tenant metrics preventing cross-tenant analytics data leakage.
  * **Multi-Tab Super Admin Control Center UI (`SuperAdminPage.jsx`):**
    * Upgraded with comprehensive 7-tab platform portal: Overview, Tenants & Admins, Outlets Directory, Tenant Subscriptions, Plans Catalog, SaaS Billing Invoices, and System Health.
    * Interactive plan adjustment modal with grandfathering protection notices.
  * **Security Hardening (`firestore.rules`):**
    * Added explicit access control rules for `restaurants/{restaurantId}/subscription/{subDoc}`, `subscriptionPlans/{planId}`, `subscriptionInvoices/{invoiceId}`, and `platformAuditLogs/{logId}`.
* **Files Created:**
  * `server/src/services/subscriptionService.js`
  * `server/src/services/entitlementService.js`
  * `server/src/services/tenantLifecycleService.js`
  * `server/src/services/platformAnalyticsService.js`
  * `client/src/services/superAdminClientService.js`
  * `tests/test_super_admin_saas_engine.js`
  * `STAGE2_STEP10_IMPLEMENTATION_REPORT.md`
* **Files Modified:**
  * `client/src/pages/SuperAdminPage.jsx`
  * `firestore.rules`
  * `tests/test_rules_isolation.js`
  * `tests/emulator_rules_unit.test.js`
  * `package.json`
  * `PROJECT_PROGRESS.md`
* **Test Verification Results:**
  * **Step 10 Automated Suite (`tests/test_super_admin_saas_engine.js`):** 58 / 58 assertions passed across all 30 categories.
  * **Complete Regression Suite (`npm test`):** 694 / 694 assertions passed across all 11 test suites with 0 failures.
  * **Live Firestore Emulator Suite (`tests/emulator_rules_unit.test.js`):** 72 / 72 scenarios passed with 0 failures.
  * **Vite Production Build:** 1,684 modules transformed cleanly in 4.89s with 0 errors.
* **Next Authorized Step:**
  * Awaiting user review and explicit authorization to proceed to **Step 11**.
