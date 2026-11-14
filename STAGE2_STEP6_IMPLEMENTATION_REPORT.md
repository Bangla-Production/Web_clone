# Abar Khabo — Stage 2 Part B: Step 6 Implementation Report
## Unified Order Management Engine (POS, KDS & Aggregators)

**Date:** November 15, 2026  
**Status:** Completed & Fully Verified  
**Branch:** `main`  
**Standard:** Petpooja / UrbanPiper Enterprise SaaS Standard  

---

## 1. Executive Summary

In accordance with official authorization for **Stage 2 Part B, Step 6**, the **Unified Order Management Engine** has been implemented and verified. This engine unifies the operational lifecycle of all orders—regardless of origin (**POS Dine-In**, **Takeaway**, **Abar Khabo Direct Online**, **Swiggy Mock**, or **Zomato Mock**)—into a single, authoritative Firestore collection:

$$\text{Canonical Order Record: } \texttt{aggregatorOrders/\{orderId\}}$$

All existing restaurant operations—including Point of Sale (POS), Kitchen Display System (KDS), Cashier Billing, Invoicing, Table Management, Customer Portal, and Delivery Partner Tracking—now interface with this unified model while maintaining **100% backward compatibility** and **zero downtime**.

### Strict Scope Enforcement:
- **Inventory Deduction / Stock Restocking:** Strictly **EXCLUDED** from Step 6 as instructed. No inventory depletion or recipe reservation logic was altered.
- **Production Safety:** **Zero** production Firestore rules deployed; **zero** live Swiggy/Zomato credentials accessed; **zero** destructive changes to existing data.
- **Verification:** All 16 specified test requirements passed across 44 automated assertions; total regression suite of 333 tests passed; 48 live Firestore emulator tests passed; Vite production build bundled cleanly with 0 errors.

---

## 2. Pre-Implementation Architecture Audit Findings

Before modifying any application code, an exhaustive inspection was conducted across the codebase:

1. **POS Order Creation Path (`client/src/pages/POSPage.jsx` & `client/src/services/firestoreService.js`):**
   - POS orders previously wrote directly to `restaurants/{restaurantId}/orders` and generated KOTs in `restaurants/{restaurantId}/kots`.
   - Table states were tracked at `restaurants/{restaurantId}/tables/{tableId}` (`AVAILABLE`, `OCCUPIED`, `BILLED`).
   - Orders lacked explicit `outletId` tags, defaulting implicitly to the root tenant restaurant.
2. **Kitchen Display System (`client/src/pages/KitchenPage.jsx`):**
   - KDS subscribed directly to `restaurants/{restaurantId}/kots` (Whole Table & Kanban views) and `restaurants/{restaurantId}/onlineOrders` (Online view).
   - Tickets lacked visual channel differentiation and did not filter by `activeOutletId`.
   - Updating KOT status updated only the KOT document, leaving the underlying order record desynchronized until manual cashier intervention.
3. **Cashier Settlement & Invoices (`client/src/pages/CashierPage.jsx` & `client/src/pages/OrdersPage.jsx`):**
   - Table release and payment settlement (`settleAndReleaseTableAtomic`) generated invoices at `restaurants/{restaurantId}/invoices/{invoiceId}` without `outletId` tracking.
   - Payment methods were tracked as simple strings (`CASH`, `UPI`, `CARD`), conflicting with online aggregator orders pre-settled via `ONLINE`.
4. **KOT Generation Logic:**
   - KOT generation in `createOrderWithKOT` generated random document IDs (`addDoc`), making repeated webhook deliveries or network retries prone to duplicate KOT tickets, double printing, and repeated kitchen alerts.

---

## 3. Detailed Architectural & Technical Implementation

### A. Authoritative Order Lifecycle & Document Model

All orders are ingested and normalized into `aggregatorOrders/{orderId}` with the following authoritative schema:

```json
{
  "_schemaVersion": "2.0.0",
  "orderId": "SWIGGY_a1b2c3d4e5f60718",
  "externalOrderId": "SWG-89123",
  "canonicalKey": "SWIGGY:rest_kolkata:outlet_saltlake:SWG-89123",
  "idempotencyHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "orderSource": "SWIGGY",
  "orderType": "DELIVERY",
  "restaurantId": "rest_kolkata",
  "outletId": "outlet_saltlake",
  "compositeKey": "rest_kolkata#outlet_saltlake",
  "outletName": "Abar Khabo - Salt Lake Sector V",
  "tableId": null,
  "tableNumber": null,
  "waiterId": null,
  "waiterName": null,
  "customer": {
    "name": "Customer Name",
    "phone": "+919830000000",
    "deliveryAddress": { "street": "Park Street" }
  },
  "items": [
    {
      "id": "biryani_01",
      "name": "Kolkata Mutton Biryani",
      "variant": "Special Double Mutton",
      "addons": ["Extra Aloo", "Boiled Egg"],
      "unitPrice": 420,
      "quantity": 2,
      "subtotal": 840,
      "instructions": "Less spicy please"
    }
  ],
  "pricing": {
    "itemTotal": 840,
    "discountAmount": 40,
    "taxAmount": 40,
    "deliveryCharge": 0,
    "grandTotal": 840
  },
  "payment": {
    "status": "PAID",
    "method": "ONLINE",
    "provider": "SWIGGY",
    "transactionId": "TXN_789102"
  },
  "delivery": {
    "partnerType": "SWIGGY_FLEET",
    "pickupOtp": "4892",
    "estimatedPrepTimeMinutes": 25
  },
  "orderStatus": "PLACED",
  "statusHistory": [{ "status": "PLACED", "timestamp": "...", "actor": "SWIGGY" }],
  "mirrorStatus": {
    "tenantSubcollection": { "status": "SYNCED" },
    "rootCollection": { "status": "SYNCED" }
  }
}
```

### B. Visual Channel Differentiation (`ChannelBadge.jsx`)

To ensure immediate visual distinction across POS, KDS, and Cashier interfaces, a reusable channel badge component was created at `client/src/components/common/ChannelBadge.jsx`:

| Channel | Label Display | Tailwind Styling / Theme |
| :--- | :--- | :--- |
| **`ABAR_KHABO`** | Direct Online | Emerald: `bg-emerald-500/15 text-emerald-700 border-emerald-500/30` |
| **`SWIGGY`** | Swiggy | Orange: `bg-orange-500/15 text-orange-700 border-orange-500/30` |
| **`ZOMATO`** | Zomato | Red: `bg-red-500/15 text-red-700 border-red-500/30` |
| **`POS`** | Dine-In POS | Blue: `bg-blue-500/15 text-blue-700 border-blue-500/30` |
| **`TAKEAWAY`** | Takeaway | Slate: `bg-slate-500/15 text-slate-700 border-slate-500/30` |

### C. Idempotent KOT Generation (`KOT_${orderId}_1`)

To prevent duplicate KOT tickets, repeated chime alerts, and double food preparation caused by aggregator retries or client re-renders:
1. Every order generates a deterministic KOT document ID:
   $$\texttt{KOT ID} = \texttt{KOT\_\{orderId\}\_1}$$
2. The backend (`trustedOrderService.ensureOrderKOT`) and client (`createOrderWithKOT`) inspect whether `restaurants/{restaurantId}/kots/KOT_{orderId}_1` already exists within a transaction.
3. If the KOT exists, the operation returns `{ success: true, kotId, isNew: false }` without modifying the ticket or triggering audio alerts.
4. If new, the ticket is created with `status: 'NEW'` and tagged with the explicit `outletId` and `orderSource`.

### D. Kitchen Display System (KDS) Synchronization

When kitchen staff transition a ticket from `NEW` $\rightarrow$ `PREPARING` $\rightarrow$ `READY`:
- `trustedOrderService.updateKOTStatus` and `client/src/services/firestoreService.js:updateKOTStatus` atomically update the KOT document **and** propagate the status change to `aggregatorOrders/{orderId}` and mirrored legacy documents.
- The KDS views (`KitchenPage.jsx`) bind to `activeOutletId` from `RestaurantContext`. Kitchen staff at Branch 1 only see tickets for Branch 1; tickets from other outlets or tenants are strictly filtered.

### E. Cashier & Invoicing Workflow Integration

- In `client/src/pages/CashierPage.jsx` and `client/src/services/firestoreService.js:settleAndReleaseTableAtomic`:
  - Invoices generated during checkout capture `outletId: activeOutletId || `${restaurantId}_main``.
  - Settling a table synchronizes `aggregatorOrders/{orderId}` with `orderStatus: 'COMPLETED'` and `payment.status: 'PAID'`.
  - Payment methods remain strictly separated: Dine-in and Takeaway orders record physical tender (`CASH`, `UPI`, `CARD`), while Aggregator orders retain their pre-paid status (`ONLINE`).

---

## 4. Verification Against All 16 Mandatory Test Requirements

The new test suite `tests/test_unified_order_engine.js` verifies all 16 mandatory Step 6 requirements:

| Req # | Requirement Description | Verification Method | Result |
| :---: | :--- | :--- | :---: |
| **1** | POS Dine-in order creation with table number, waiter, variants & add-ons | `test_unified_order_engine.js` (Suite 1) | **PASS** |
| **2** | Direct online consumer order creation (ABAR_KHABO) | `test_unified_order_engine.js` (Suite 2) | **PASS** |
| **3** | Mock Swiggy aggregator order arrival | `test_unified_order_engine.js` (Suite 3) | **PASS** |
| **4** | Mock Zomato aggregator order arrival | `test_unified_order_engine.js` (Suite 3) | **PASS** |
| **5** | Source channel visual tagging (POS, Takeaway, Abar Khabo, Swiggy, Zomato) | `ChannelBadge.jsx` + Unit assertions | **PASS** |
| **6** | Automatic KOT generation for kitchen display | `test_unified_order_engine.js` (Suite 4) | **PASS** |
| **7** | Duplicate order event prevention (idempotent hash & KOT check) | `test_unified_order_engine.js` (Suite 5) | **PASS** |
| **8** | Repeated status updates & state machine idempotency | `test_unified_order_engine.js` (Suite 6) | **PASS** |
| **9** | Kitchen preparation status synchronization (KOT $\leftrightarrow$ Order) | `test_unified_order_engine.js` (Suite 7) | **PASS** |
| **10** | Cross-outlet order isolation (Branch 1 vs Branch 2) | `test_unified_order_engine.js` (Suite 8) | **PASS** |
| **11** | Cross-tenant order isolation (Tenant A vs Tenant B) | `test_unified_order_engine.js` (Suite 8) | **PASS** |
| **12** | Cashier and invoice compatibility (outlet-scoped billing) | `test_unified_order_engine.js` (Suite 9) | **PASS** |
| **13** | Customer order tracking compatibility | `test_unified_order_engine.js` (Suite 10) | **PASS** |
| **14** | Delivery partner dispatch compatibility | `test_unified_order_engine.js` (Suite 10) | **PASS** |
| **15** | Order cancellation and rejection handling | `test_unified_order_engine.js` (Suite 6) | **PASS** |
| **16** | End-to-end POS dine-in flow through unified model | `test_unified_order_engine.js` (Suite 1 & 9) | **PASS** |

---

## 5. Test Suite Execution & Output Summary

### 1. Unified Order Engine Suite (`tests/test_unified_order_engine.js`)
```
================================================================================
  ABAR KHABO: STAGE 2 PART B — STEP 6 TEST SUITE
  Unified Order Management Engine (POS, KDS & Aggregators)
================================================================================
[SUITE 1] POS Dine-in Order Creation Through Unified Engine (Requirements 1, 5 & 16) — 8 PASSED
[SUITE 2] Direct Online Consumer Order Creation (Requirements 2 & 5) — 4 PASSED
[SUITE 3] Mock Swiggy & Zomato Aggregator Order Ingestion (Requirements 3 & 4) — 3 PASSED
[SUITE 4] Idempotent KOT Generation (Requirement 6) — 6 PASSED
[SUITE 5] Duplicate Order Event Prevention (Requirement 7) — 2 PASSED
[SUITE 6] Repeated Status Updates & State Machine Enforcement (Requirements 8 & 15) — 4 PASSED
[SUITE 7] Kitchen Status Synchronization (Requirement 9) — 3 PASSED
[SUITE 8] Cross-Outlet & Cross-Tenant Isolation (Requirements 10 & 11) — 5 PASSED
[SUITE 9] Cashier & Invoice Compatibility (Requirement 12) — 5 PASSED
[SUITE 10] Customer & Delivery Tracking Compatibility (Requirements 13 & 14) — 4 PASSED
================================================================================
STEP 6 TEST RESULTS: 44 PASSED, 0 FAILED
================================================================================
```

### 2. Complete Regression Suite (`npm test`)
```
> node tests/test_outlet_model.js && node tests/test_staff_identity.js && node tests/test_menu_pricing.js && node tests/test_normalized_orders.js && node tests/test_aggregator_webhooks.js && node tests/test_unified_order_engine.js && node tests/test_rules_isolation.js

Step 1 (Outlet Data Model):                       45 PASSED
Step 2 (UID Staff Identity & Outlets):            40 PASSED
Step 3 (Master Menu Catalog & Channel Pricing):   30 PASSED
Step 4 (Normalized Orders & Dual-Mirroring):      46 PASSED
Step 5 (Aggregator Webhooks & Cryptography):      53 PASSED
Step 6 (Unified Order Engine POS/KDS/Aggregators): 44 PASSED
Security Rules AST Isolation Tests:               75 PASSED
------------------------------------------------------------
TOTAL UNIT & SECURITY ASSERTIONS:                333 PASSED, 0 FAILED
```

### 3. Live Firestore Emulator Test Suite (`tests/emulator_rules_unit.test.js`)
```
firebase emulators:exec --project=demo-abar-khabo --only firestore "node tests/emulator_rules_unit.test.js"
================================================================================
LIVE EMULATOR TEST SUMMARY: 48 PASSED, 0 FAILED
================================================================================
```

### 4. Client Production Build (`npm --prefix client run build`)
```
vite v6.4.3 building for production...
✓ 1678 modules transformed.
dist/index.html                     1.23 kB │ gzip:   0.68 kB
dist/assets/index-DKJB7b7d.css    117.07 kB │ gzip:  16.39 kB
dist/assets/index-Cd_YuK30.js   1,480.84 kB │ gzip: 357.74 kB
✓ built in 4.56s
```

---

## 6. Files Created and Modified

### Files Created:
1. `client/src/components/common/ChannelBadge.jsx`: Multi-channel visual badge component with distinct colors.
2. `tests/test_unified_order_engine.js`: Comprehensive 44-assertion test suite validating all 16 Step 6 requirements.
3. `STAGE2_STEP6_IMPLEMENTATION_REPORT.md`: This comprehensive implementation report.

### Files Modified:
1. `server/src/services/trustedOrderService.js`: Added `createPosOrder`, `ensureOrderKOT`, and `updateKOTStatus`; added table and waiter metadata to normalized documents and legacy mirror payloads.
2. `client/src/services/firestoreService.js`: Bound `outletId` to order creation, KOT generation, and table settlement; synchronized KOT and cashier status transitions to authoritative orders.
3. `client/src/pages/KitchenPage.jsx`: Integrated `activeOutletId` from `useRestaurant()`; rendered `ChannelBadge` across Whole Table, Kanban, and Online order views.
4. `client/src/pages/POSPage.jsx`: Bound `activeOutletId` to POS order creation and checkout payloads.
5. `client/src/pages/CashierPage.jsx`: Passed `outletId` in invoice creation and payment settlement.
6. `client/src/pages/OrdersPage.jsx`: Rendered `ChannelBadge` on order management cards; passed `outletId` in payment completion.
7. `client/src/pages/OnlineOrdersPage.jsx`: Rendered `ChannelBadge` on incoming online orders.
8. `package.json`: Added `test:engine` script and linked it to the global `npm test` command.
9. `PROJECT_PROGRESS.md`: Updated with Step 6 implementation summary, architectural decisions, and test outputs.

---

## 7. Status & Readiness for Next Step

**Stage 2 Part B, Step 6 is 100% complete and verified.**  
In accordance with non-negotiable development rules, all execution has paused pending user review. We are ready to proceed to:
$$\textbf{Step 7: Inventory, Recipe & Menu Availability Engine}$$
*(subject to explicit authorization)*.
