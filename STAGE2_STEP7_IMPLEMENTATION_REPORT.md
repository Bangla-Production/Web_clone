# Abar Khabo — Stage 2 Part B: Step 7 Implementation Report
## Inventory, Recipe & Menu Availability Engine

**Date:** November 15, 2026  
**Status:** Completed & Fully Verified  
**Branch:** `main`  
**Standard:** Enterprise Multi-Tenant Restaurant Inventory Standard (Petpooja / UrbanPiper Equivalent)  

---

## 1. Executive Summary

In accordance with official authorization for **Stage 2 Part B, Step 7**, the **Inventory, Recipe & Menu Availability Engine** has been designed, implemented, and rigorously verified. This engine introduces an auditable, multi-tenant inventory architecture that connects menu items to raw ingredients, tracks stock balances with strict outlet isolation, prevents overselling across all order channels (POS, Direct Online, Swiggy, and Zomato), and enforces an immutable double-entry style inventory ledger.

### Strict Scope Enforcement & Security Boundaries:
- **Zero Production Deployment:** No Firestore rules were deployed to production; no production databases were modified.
- **Zero Live Aggregator Connection:** No live Swiggy/Zomato credentials or undocumented APIs were accessed.
- **100% Backward Compatibility:** Preserved all existing Step 6 functionality, POS order creation, KOT generation, Cashier billing, Invoices, Customer tracking, and legacy inventory synthesis.
- **Non-Destructive Testing:** Tested comprehensively using in-memory mock Firestore for service logic and the live Firebase Emulator Suite for security rules enforcement.

---

## 2. Inventory Data Model & Document Architecture

### A. Collections Hierarchy & Document Paths

| Entity | Collection Path | Scope | Access Level |
| :--- | :--- | :--- | :--- |
| **Master Ingredient Catalog** | `restaurants/{restaurantId}/ingredients/{ingredientId}` | Tenant | Brand Admin write; Staff read |
| **Outlet Stock Balances** | `restaurants/{restaurantId}/outlets/{outletId}/inventoryStock/{ingredientId}` | Outlet | Admin/Manager write; Staff with outlet access read |
| **Master Item Recipes** | `restaurants/{restaurantId}/recipes/{itemId}` | Tenant | Brand Admin write; Staff read |
| **Outlet Recipe Overrides** | `restaurants/{restaurantId}/outlets/{outletId}/recipeOverrides/{itemId}` | Outlet | Admin/Manager write; Staff with outlet access read |
| **Raw Material Suppliers** | `restaurants/{restaurantId}/suppliers/{supplierId}` | Tenant | Admin/Manager read & write |
| **Purchase Records** | `restaurants/{restaurantId}/outlets/{outletId}/purchases/{purchaseId}` | Outlet | Admin/Manager write; Staff with outlet access read |
| **Stock Transfers** | `restaurants/{restaurantId}/stockTransfers/{transferId}` | Multi-Outlet | Admin/Manager write; Staff with outlet access read |
| **Immutable Inventory Ledger** | `restaurants/{restaurantId}/inventoryLedger/{ledgerId}` | Tenant/Outlet | **Backend Admin SDK write only**; Staff read |
| **Legacy Mirror** | `restaurants/{restaurantId}/inventory/{itemId}` | Tenant | Maintained for zero-downtime backward compatibility |

---

## 3. Detailed Architectural & Technical Implementation

### A. Unit Conversion Engine (`unitConverter.js`)
- Supports three measurement dimensions:
  1. **Mass:** `kg`, `g`, `mg` ($1\text{ kg} = 1,000\text{ g} = 1,000,000\text{ mg}$)
  2. **Volume:** `litre` (`l`), `ml` ($1\text{ litre} = 1,000\text{ ml}$)
  3. **Discrete Count:** `pcs`, `piece`, `pkt`, `packet`, `box`, `can`, `portion`, `slice`
- Implements dimensional compatibility checks (`areUnitsCompatible`). Incompatible dimension conversions (e.g. converting `kg` to `ml` or `kg` to `piece`) throw explicit `Error` to prevent silent inventory corruption.
- Implemented symmetrically on both backend (`server/src/utils/unitConverter.js`) and frontend (`client/src/utils/unitConverter.js`).

### B. Recipe & Ingredient Mapping Engine (`recipeService.js`)
- Connects menu items to multiple raw ingredients with quantity per serving.
- **Dynamic Variant Modifiers:** Variant selections (e.g., *Special Double Mutton*) dynamically adjust ingredient consumption (e.g., adding $+0.20\text{ kg}$ mutton).
- **Dynamic Add-On Modifiers:** Add-ons (e.g., *Extra Aloo*, *Boiled Egg*) dynamically append required ingredients.
- **Outlet Recipe Overrides:** Outlets can override recipe proportions or ingredient substitutions without affecting other branches or the master catalog.
- **Non-Recipe Graceful Handling:** Menu items without configured recipes remain fully orderable; the engine skips recipe deduction without failing or blocking order creation.
- **Historical Recipe Snapshot:** Every order captures an immutable `inventorySnapshot` of resolved ingredients, recipe versions, and ledger references at placement time.

### C. Inventory Ledger & Transaction Safety (`inventoryLedgerService.js`)
- **10 Distinct Movement Types:**
  - `OPENING_STOCK`, `PURCHASE`, `STOCK_ADJUSTMENT`, `RESERVATION`, `RESERVATION_RELEASE`, `CONSUMPTION`, `RESTOCK`, `TRANSFER_OUT`, `TRANSFER_IN`, `WASTAGE`.
- **Deterministic Idempotency Key:**
  $$\text{Idempotency Key} = \text{SHA-256}\Big(\text{movementType} : \text{restaurantId} : \text{outletId} : \text{referenceId} : \text{ingredientId}\Big)$$
  Document ID: $\texttt{LEDGER\_}\{\text{hash}_{0..20}\}$.
  Duplicate order deliveries, retry webhooks, or repeated status updates detect existing ledger entries and skip duplicate deduction.
- **Atomic Operations:** All stock balance updates execute within Firestore transactions, ensuring:
  $$\text{availableStock} = \text{currentStock} - \text{reservedStock}$$
- **Configurable Inventory Policy:**
  ```javascript
  const DEFAULT_INVENTORY_POLICY = {
    allowNegativeStock: false,
    autoReleaseReservationOnCancel: true,
    postPrepCancellationAction: 'WASTAGE', // 'WASTAGE' | 'RESTOCK' | 'MANUAL'
    deductionTrigger: 'ON_PREPARATION',
    trackWastageOnCancel: true,
    lowStockThresholdPercent: 20
  };
  ```

### D. Order Lifecycle & Inventory State Machine
1. **Order Placed / Accepted:**
   - Evaluates required ingredients via `recipeService`.
   - Checks available stock ($\text{availableStock} \ge \text{requiredQty}$).
   - Atomically increments `reservedStock += requiredQty` and writes `RESERVATION` ledger entry.
   - If stock is insufficient and `allowNegativeStock === false`, returns `{ status: 'INSUFFICIENT_STOCK' }` and rejects order.
2. **Cooking Started (`PREPARING` / KOT Generation):**
   - Atomically converts reservation to physical consumption:
     $$\text{reservedStock} \mathrel{-}= \text{requiredQty}, \quad \text{currentStock} \mathrel{-}= \text{requiredQty}$$
   - Appends `CONSUMPTION` ledger entry; marks order `inventorySnapshot.status = 'CONSUMED'`.
3. **Pre-Cooking Cancellation (`PLACED` / `ACCEPTED`):**
   - Decrements `reservedStock \mathrel{-}= \text{requiredQty}` and restores available stock.
   - Appends `RESERVATION_RELEASE` ledger entry; marks order `inventorySnapshot.status = 'RELEASED'`.
4. **Post-Cooking Cancellation (`PREPARING` / `READY`):**
   - Food was already prepared from raw inventory.
   - Based on configurable policy (`postPrepCancellationAction === 'WASTAGE'`), raw ingredients are **not** returned to stock.
   - Appends `WASTAGE` ledger entry; marks order `inventorySnapshot.status = 'WASTAGE'`.
5. **Physical Stock Counts & Adjustments:**
   - Outlet managers execute physical stock reconciliations via `adjustStock`.
   - Records absolute quantity change and appends `STOCK_ADJUSTMENT` ledger entry.
6. **Outlet-to-Outlet Stock Transfers:**
   - Multi-step traceable workflow: Source outlet `TRANSFER_OUT` $\rightarrow$ `DISPATCHED` $\rightarrow$ Destination outlet `TRANSFER_IN` $\rightarrow$ `RECEIVED`.

### E. Menu Availability Engine (`menuService.js`)
- Integrated `calculateItemStockAvailability(masterItem, outletStockMap, recipe)`:
  - Dynamically calculates item status: `AVAILABLE`, `LOW_STOCK`, `OUT_OF_STOCK`, `DISABLED`.
  - Computes $\text{maxPortions} = \min_{\text{ingredients}} \left\lfloor \frac{\text{availableStock}}{\text{recipeQuantity}} \right\rfloor$.
  - When $\text{maxPortions} \le \text{lowStockThreshold}$, status becomes `LOW_STOCK`.
  - When $\text{maxPortions} = 0$, status becomes `OUT_OF_STOCK`.
- **Outlet Independence:** A stock shortage at Outlet 2 (e.g., Salt Lake branch) marks the item `OUT_OF_STOCK` for Outlet 2, while Outlet 1 (Park Street) remains `AVAILABLE`.
- **Customer Data Privacy:** `sanitizeMenuForCustomer` preserves public availability status while strictly stripping recipe ingredient lists, internal stock numbers, and supplier details.

---

## 4. Verification Against All 21 Mandatory Test Requirements

The new test suite `tests/test_inventory_recipe_engine.js` verifies all 21 mandatory Step 7 requirements:

| # | Requirement | Verification Method | Result |
| :---: | :--- | :--- | :---: |
| **1** | Creating ingredients in master catalog | `test_inventory_recipe_engine.js` (Test 1) | **PASS** |
| **2** | Creating and updating outlet stock | `test_inventory_recipe_engine.js` (Test 2) | **PASS** |
| **3** | Unit conversion with validation & dimension protection | `test_inventory_recipe_engine.js` (Test 3) | **PASS** |
| **4** | Recipe creation and validation | `test_inventory_recipe_engine.js` (Test 4) | **PASS** |
| **5** | Recipe-based consumption calculation | `test_inventory_recipe_engine.js` (Test 5) | **PASS** |
| **6** | Variant and add-on ingredient requirements | `test_inventory_recipe_engine.js` (Test 6) | **PASS** |
| **7** | POS order inventory processing (reservation $\rightarrow$ consumption) | `test_inventory_recipe_engine.js` (Test 7) | **PASS** |
| **8** | Mock Swiggy order inventory processing | `test_inventory_recipe_engine.js` (Test 8) | **PASS** |
| **9** | Mock Zomato order inventory processing | `test_inventory_recipe_engine.js` (Test 9) | **PASS** |
| **10** | Duplicate order event idempotency (zero double-deduction) | `test_inventory_recipe_engine.js` (Test 10) | **PASS** |
| **11** | Concurrent orders competing for limited stock | `test_inventory_recipe_engine.js` (Test 11) | **PASS** |
| **12** | Insufficient-stock rejection vs configured negative stock policy | `test_inventory_recipe_engine.js` (Test 12) | **PASS** |
| **13** | Stock reservation and release lifecycle | `test_inventory_recipe_engine.js` (Test 13) | **PASS** |
| **14** | Cancellation before preparation (reservation released) | `test_inventory_recipe_engine.js` (Test 14) | **PASS** |
| **15** | Cancellation after preparation begins (recorded as wastage) | `test_inventory_recipe_engine.js` (Test 15) | **PASS** |
| **16** | Restocking and manual physical stock adjustment | `test_inventory_recipe_engine.js` (Test 16) | **PASS** |
| **17** | Outlet-to-outlet stock transfer (dispatch and receipt) | `test_inventory_recipe_engine.js` (Test 17) | **PASS** |
| **18** | Menu availability updates & outlet independence | `test_inventory_recipe_engine.js` (Test 18) | **PASS** |
| **19** | Cross-tenant access denial | `test_inventory_recipe_engine.js` (Test 19) | **PASS** |
| **20** | Legacy inventory synthesis & backward compatibility | `test_inventory_recipe_engine.js` (Test 20) | **PASS** |
| **21** | Regression of existing POS, KDS, Cashier, and order workflows | `test_inventory_recipe_engine.js` (Test 21) | **PASS** |

---

## 5. Test Suite Execution & Output Summary

### 1. Step 7 Inventory & Recipe Suite (`tests/test_inventory_recipe_engine.js`)
```
================================================================================
  ABAR KHABO: STAGE 2 PART B — STEP 7 TEST SUITE
  Inventory, Recipe & Menu Availability Engine
================================================================================
[1] Creating Ingredients in Master Catalog — 3 PASSED
[2] Creating and Updating Outlet Stock — 2 PASSED
[3] Unit Conversion Engine — 8 PASSED
[4] Recipe Creation and Validation — 4 PASSED
[5] Recipe-Based Consumption Calculation — 4 PASSED
[6] Variant and Add-On Modifiers Calculation — 2 PASSED
[7] POS Order Inventory Processing — 7 PASSED
[8] Mock Swiggy Order Inventory Processing — 3 PASSED
[9] Mock Zomato Order Inventory Processing — 3 PASSED
[10] Duplicate Order Event Idempotency — 2 PASSED
[11] Concurrent Orders Competing for Limited Stock — 2 PASSED
[12] Insufficient-Stock Rejection vs Negative Stock Policy — 2 PASSED
[13] Reservation and Release — 2 PASSED
[14] Order Cancellation Before Preparation (Pre-Cooking) — 1 PASSED
[15] Order Cancellation After Preparation Begins (Post-Cooking) — 2 PASSED
[16] Manual Restocking & Physical Stock Adjustment — 2 PASSED
[17] Outlet-to-Outlet Stock Transfer — 4 PASSED
[18] Menu Availability Updates & Outlet Independence — 6 PASSED
[19] Cross-Tenant Access Denial — 1 PASSED
[20] Legacy Inventory Synthesis & Backward Compatibility — 4 PASSED
[21] Regression of Existing POS, KDS, Cashier and Invoicing Workflows — 5 PASSED
================================================================================
STEP 7 TEST RESULTS: 69 PASSED, 0 FAILED
================================================================================
```

### 2. Complete Regression Suite (`npm test`)
```
> restopulse-restaurant-pos@1.0.0 test
> node tests/test_outlet_model.js && node tests/test_staff_identity.js && node tests/test_menu_pricing.js && node tests/test_normalized_orders.js && node tests/test_aggregator_webhooks.js && node tests/test_unified_order_engine.js && node tests/test_inventory_recipe_engine.js && node tests/test_rules_isolation.js

Step 1 (Outlet Data Model):                       45 PASSED
Step 2 (UID Staff Identity & Outlets):            40 PASSED
Step 3 (Master Menu Catalog & Channel Pricing):   30 PASSED
Step 4 (Normalized Orders & Dual-Mirroring):      46 PASSED
Step 5 (Aggregator Webhooks & Cryptography):      53 PASSED
Step 6 (Unified Order Engine POS/KDS/Aggregators): 44 PASSED
Step 7 (Inventory, Recipe & Availability Engine):  69 PASSED
Security Rules AST Isolation Tests:               85 PASSED
------------------------------------------------------------
TOTAL REGRESSION ASSERTIONS:                     412 PASSED, 0 FAILED
```

### 3. Live Firestore Emulator Test Suite (`tests/emulator_rules_unit.test.js`)
```
firebase emulators:exec --project=demo-abar-khabo --only firestore "node tests/emulator_rules_unit.test.js"
================================================================================
LIVE EMULATOR TEST SUMMARY: 55 PASSED, 0 FAILED
================================================================================
```

### 4. Client Production Build (`npm --prefix client run build`)
```
vite v6.4.3 building for production...
✓ 1680 modules transformed.
dist/index.html                     1.23 kB │ gzip:   0.68 kB
dist/assets/index-DKJB7b7d.css    117.07 kB │ gzip:  16.39 kB
dist/assets/index-Cd_YuK30.js   1,480.84 kB │ gzip: 357.74 kB
✓ built in 4.51s
```

---

## 6. Files Created and Modified

### Files Created:
1. `server/src/utils/unitConverter.js`: Backend unit conversion and dimension validation engine.
2. `client/src/utils/unitConverter.js`: Frontend unit conversion helper.
3. `server/src/services/recipeService.js`: Master recipes, outlet recipe overrides, variant and add-on modifier resolution, and order recipe snapshots.
4. `server/src/services/inventoryLedgerService.js`: Atomic Firestore stock reservations, consumptions, restocks, physical adjustments, transfers, and immutable audit ledger.
5. `client/src/services/inventoryService.js`: Client-side service for ingredient catalog, stock balances, ledger viewing, and legacy inventory synthesis.
6. `tests/test_inventory_recipe_engine.js`: Comprehensive 69-assertion automated test suite covering all 21 Step 7 requirements.
7. `STAGE2_STEP7_IMPLEMENTATION_REPORT.md`: This comprehensive implementation report.

### Files Modified:
1. `server/src/services/trustedOrderService.js`: Integrated order placement reservation, cooking start consumption, cancellation release/wastage, and inventory snapshots.
2. `server/src/utils/cryptoUtils.js`: Added `generateSha256` utility for deterministic ledger hashing.
3. `client/src/services/menuService.js`: Added `calculateItemStockAvailability` and `sanitizeMenuForCustomer`.
4. `client/src/services/firestoreService.js`: Re-exported modern inventory methods for client UI components.
5. `firestore.rules`: Hardened rules for `ingredients`, `recipes`, `recipeOverrides`, `inventoryStock`, `suppliers`, `purchases`, `stockTransfers`, and `inventoryLedger` (write forbidden to clients).
6. `tests/test_rules_isolation.js`: Added Step 7 security tests (85 total assertions).
7. `tests/emulator_rules_unit.test.js`: Added live emulator scenarios 49–55 (55 total scenarios).
8. `package.json`: Added `test:inventory` script and linked it to global `npm test`.
9. `PROJECT_PROGRESS.md`: Updated with Step 7 summary and test outputs.

---

## 7. Known Limitations & Policy Decisions Documented

1. **Ingredient Yield / Moisture Loss Factor:**
   - Raw meats or vegetables often lose 10–25% weight during cooking. The current version models gross raw recipe consumption. A future enhancement in Stage 3 can add a `yieldFactor` per ingredient.
2. **Batch & Expiry Prioritization (FIFO vs FEFO):**
   - The current engine tracks batches and expiry on purchases. Automatic First-Expired-First-Out (FEFO) bin selection during order consumption can be added when warehouse barcode scanners are connected.
3. **Negative Stock Policy:**
   - Defaults to `allowNegativeStock: false`. Restaurants wishing to allow negative stock during peak rushes can toggle this via `restaurants/{restaurantId}/settings/inventoryPolicy`.

---

## 8. Status & Readiness

**Stage 2 Part B, Step 7 is 100% complete, fully verified, and stopped.**  
Execution is paused pending your explicit review and authorization before proceeding to **Step 8**.
