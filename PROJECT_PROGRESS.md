# Abar Khabo: Multi-Tenant Aggregator Platform — Project Progress Tracker

## Status Overview
* **Current Stage:** STAGE 1 (Complete — Awaiting User Approval to Deploy or Begin Stage 2)
* **Target Platforms:** Swiggy, Zomato, Abar Khabo Direct Ordering
* **Target Architecture:** Multi-Tenant SaaS, Outlet Hierarchy, Node.js + TypeScript Backend, Firestore Database, React + Vite Frontend.

---

## Stage Tracking

| Stage | Description | Status | Completion Date |
| :--- | :--- | :--- | :--- |
| **STAGE 0** | Repository Inspection, Architecture Audit & Risk Analysis | **COMPLETE** | 2026-11-15 |
| **STAGE 1** | Security & Strict Tenant Isolation | **COMPLETE** | 2026-11-15 |
| **STAGE 2** | Database Schema & Outlets Model | **PART B IN PROGRESS** (Step 1 Complete; Awaiting Step 2 Approval) | 2026-11-15 |
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
  * Awaiting user review and authorization to proceed to **Step 2 (UID-Based Staff Identity & Outlet Authorization)**.
