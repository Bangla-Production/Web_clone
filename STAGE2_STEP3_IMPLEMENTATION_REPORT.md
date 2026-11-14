# Abar Khabo — Stage 2 Part B: Step 3 Implementation Report
## Master Menu Catalog, Outlet Overrides & Multi-Channel Pricing Model

**System:** Commercial Restaurant SaaS & Multi-Channel Aggregator Platform  
**Milestone:** Stage 2 Part B — Implementation  
**Step:** **Step 3 ONLY: Menu Catalog, Outlet Overrides & Multi-Channel Pricing Model**  
**Date:** 2026-11-15  
**Status:** COMPLETE & VERIFIED  

---

## 1. Mandatory Pre-Implementation Check Findings

Before writing Step 3 code, the Step 2 implementation was thoroughly inspected against the five mandatory security requirements:

1. **Client-Side Lazy Migration Security:**
   * *Finding:* `resolveStaffProfile` strictly uses `fbUser.uid` and `fbUser.email` issued by Firebase Authentication.
   * *Rule Enforcement:* Under `firestore.rules`, ordinary unprivileged users CANNOT call `setDoc` on `users/{userId}` to create elevated roles. `allow create` strictly requires `isSuperAdmin()` or `isRestaurantAdmin()`. Regular clients cannot fabricate privileged profiles.
2. **Authenticated & Verified Legacy Email Identity:**
   * *Finding:* Verified. `hasActiveProfile()` in `firestore.rules` requires `request.auth.token.email_verified == true || userProfile().authMethod == 'staffId'`. The email is cryptographically signed by Firebase Auth tokens and cannot be spoofed by client JSON.
3. **UID-Based Profile Immutability & Anti-Escalation:**
   * *Finding:* Verified. `firestore.rules` update logic strictly rejects self-updates where `role`, `restaurantId`, `allOutlets`, or `assignedOutletIds` differ from the existing resource. Verified with real gRPC `PERMISSION_DENIED` errors in emulator scenarios 18, 19, and 20.
4. **Backend-Enforced Outlet Authorization:**
   * *Finding:* Verified. `hasOutletAccess(restaurantId, outletId)` is compiled directly into `firestore.rules` and enforced on `menuOverrides`, `orders`, and tenant subcollections. Access is not merely client-side.
5. **Real Firebase Emulator Verification:**
   * *Finding:* Verified. `tests/emulator_rules_unit.test.js` reads `./firestore.rules` directly from disk and submits it to the real Cloud Firestore Emulator JAR on port 8080.

---

## 2. Files Created and Modified

| File | Status | Description |
| :--- | :---: | :--- |
| [`client/src/services/menuService.js`](file:///c:/Users/ARGHA/Downloads/Web_clone/client/src/services/menuService.js) | **Created** | Comprehensive service for Master Catalog, Outlet Overrides, Multi-Channel Pricing, and Multi-Level Availability evaluation |
| [`tests/test_menu_pricing.js`](file:///c:/Users/ARGHA/Downloads/Web_clone/tests/test_menu_pricing.js) | **Created** | Automated test suite (30 assertions) verifying pricing hierarchy, currency rounding, tax treatment, outOfStockUntil windows, and historical order immutability |
| [`STAGE2_STEP3_IMPLEMENTATION_REPORT.md`](file:///c:/Users/ARGHA/Downloads/Web_clone/STAGE2_STEP3_IMPLEMENTATION_REPORT.md) | **Created** | Engineering report documenting Step 3 implementation, JSON schemas, and test outputs |
| [`firestore.rules`](file:///c:/Users/ARGHA/Downloads/Web_clone/firestore.rules) | **Modified** | Added security rules for `menuCatalog` and `outlets/{outletId}/menuOverrides`, enforcing admin/manager permissions and cross-outlet isolation |
| [`client/src/services/firestoreService.js`](file:///c:/Users/ARGHA/Downloads/Web_clone/client/src/services/firestoreService.js) | **Modified** | Re-exported `menuService` utilities and added backward compatibility mirror hooks |
| [`package.json`](file:///c:/Users/ARGHA/Downloads/Web_clone/package.json) | **Modified** | Added `npm run test:menu` script and integrated it into the primary `npm test` pipeline |
| [`tests/emulator_rules_unit.test.js`](file:///c:/Users/ARGHA/Downloads/Web_clone/tests/emulator_rules_unit.test.js) | **Modified** | Expanded live emulator suite from 25 to 32 test scenarios covering master menu and outlet override security |
| [`tests/test_rules_isolation.js`](file:///c:/Users/ARGHA/Downloads/Web_clone/tests/test_rules_isolation.js) | **Modified** | Expanded AST test suite from 47 to 55 test scenarios |
| [`PROJECT_PROGRESS.md`](file:///c:/Users/ARGHA/Downloads/Web_clone/PROJECT_PROGRESS.md) | **Modified** | Updated progress tracker with Step 3 completion details |

---

## 3. Final Collection Architecture & Schema

```text
restaurants/{restaurantId}
  ├── menuCatalog/{itemId}                       <-- Master Menu Catalog (Brand Master)
  ├── menuItems/{itemId}                         <-- Legacy Read/Write Mirror (Zero downtime)
  └── outlets/{outletId}
        └── menuOverrides/{itemId}               <-- Outlet-Specific Overrides & Channel Pricing
```

### 3.1 Master Menu Catalog Example Document
Path: `restaurants/spice-haven/menuCatalog/dish_biryani_awadhi`
```json
{
  "id": "dish_biryani_awadhi",
  "itemId": "dish_biryani_awadhi",
  "restaurantId": "spice-haven",
  "name": "Awadhi Mutton Biryani Special",
  "description": "Slow-cooked fragrant long-grain basmati rice with tender mutton shank",
  "category": "Biryani & Rice",
  "subCategory": "Awadhi Specials",
  "sku": "SPH-BIR-001",
  "internalCode": "BIRYANI_AWADHI_01",
  "basePrice": 550,
  "taxRate": 5.0,
  "taxInclusive": true,
  "foodType": "NON_VEG",
  "variants": [
    { "id": "half", "name": "Regular Portion", "price": 350, "isDefault": false },
    { "id": "full", "name": "Special Feast Portion", "price": 550, "isDefault": true }
  ],
  "addonGroups": [
    {
      "id": "gravy_addon",
      "name": "Extra Gravy & Raita",
      "minSelect": 0,
      "maxSelect": 2,
      "options": [
        { "id": "raita_burani", "name": "Burani Garlic Raita", "price": 60 },
        { "id": "extra_salan", "name": "Mirchi Ka Salan", "price": 80 }
      ]
    }
  ],
  "preparationTimeMinutes": 25,
  "channelPricing": {
    "DINE_IN": 550,
    "DIRECT_ONLINE": 550,
    "SWIGGY": 630,
    "ZOMATO": 630,
    "TAKEAWAY": 530
  },
  "status": "ACTIVE",
  "isAvailable": true,
  "createdAt": "2026-11-15T01:00:00Z",
  "updatedAt": "2026-11-15T02:20:00Z"
}
```

### 3.2 Outlet-Specific Menu Override Example Document
Path: `restaurants/spice-haven/outlets/spice-haven_airport/menuOverrides/dish_biryani_awadhi`
```json
{
  "id": "dish_biryani_awadhi",
  "itemId": "dish_biryani_awadhi",
  "restaurantId": "spice-haven",
  "outletId": "spice-haven_airport",
  "basePrice": 620,
  "priceOverrides": {
    "DINE_IN": 620,
    "DIRECT_ONLINE": 620,
    "SWIGGY": 710,
    "ZOMATO": 710,
    "TAKEAWAY": 600
  },
  "channelAvailability": {
    "DINE_IN": true,
    "DIRECT_ONLINE": true,
    "SWIGGY": true,
    "ZOMATO": false
  },
  "preparationTimeMinutes": 15,
  "isAvailable": true,
  "outOfStockUntil": null,
  "status": "ACTIVE",
  "updatedAt": "2026-11-15T02:22:00Z"
}
```

---

## 4. Multi-Channel Pricing Resolution Hierarchy

When an order is created or a menu is viewed, effective prices are resolved through five deterministic priority tiers:

```mermaid
graph TD
    Start[Calculate Channel Price] --> L1{1. Outlet Explicit Channel Override?<br/>override.priceOverrides[channel]}
    L1 -- Yes --> Res1[Apply Outlet Channel Price]
    L1 -- No --> L2{2. Outlet Base Price Override?<br/>override.basePrice}
    L2 -- Yes --> Res2[Apply Outlet Base Price]
    L2 -- No --> L3{3. Master Explicit Channel Price?<br/>masterItem.channelPricing[channel]}
    L3 -- Yes --> Res3[Apply Master Channel Price]
    L3 -- No --> L4{4. Channel is Swiggy/Zomato &<br/>Multiplier > 1.0?}
    L4 -- Yes --> Res4[Apply Master Base * Multiplier]
    L4 -- No --> L5[5. Apply Master Base Price]

    Res1 --> Round[Round to Integer Currency INR]
    Res2 --> Round
    Res3 --> Round
    Res4 --> Round
    Res5 --> Round
    Round --> Tax[Compute Tax Split: Net + Tax = Gross]
```

### Tax & Rounding Rules
- **Rounding:** Standard currency rounding to nearest integer INR (`Math.round(val)`).
- **Tax Inclusive (Standard Indian Menu Display):**
  $$\text{netPrice} = \frac{\text{grossPrice}}{1 + \frac{\text{taxRate}}{100}}$$
  $$\text{taxAmount} = \text{grossPrice} - \text{netPrice}$$
- **Historical Order Immutability:** Historical orders snapshot prices at checkout time (`{ itemId, name, price, qty, taxRate, subtotal }`). Subsequent price updates in the Master Menu or Outlet Overrides never alter past orders.

---

## 5. Multi-Level Availability Resolution Logic

1. **Master Item Status:** If `masterItem.status !== 'ACTIVE'` or `masterItem.isAvailable === false`, the dish is blocked platform-wide.
2. **Outlet Availability:** If `override.isAvailable === false` or `override.status === 'INACTIVE'`, the dish is 86'd at that branch.
3. **Scheduled Out-of-Stock Window:** If `override.outOfStockUntil` is set and in the future (`now < outOfStockUntil`), the dish is temporarily 86'd until expiration.
4. **Channel-Specific Toggle:** If `override.channelAvailability[channel] === false` (e.g. rain surge disabling delivery), the dish is blocked on that channel while remaining active on others.

---

## 6. Security Implementation in `firestore.rules`

```javascript
// Master Menu Catalog: Publicly readable; Brand Admin write only
match /restaurants/{restaurantId}/menuCatalog/{itemId} {
  allow read: if true;
  allow write: if isRestaurantAdmin(restaurantId);
}

// Outlet-Specific Menu Overrides
match /outlets/{outletId} {
  allow read: if true;
  allow write: if isRestaurantAdmin(restaurantId);

  match /menuOverrides/{itemId} {
    allow read: if true;
    allow write: if isRestaurantAdmin(restaurantId) || (
      hasOutletAccess(restaurantId, outletId) &&
      userProfile().role in ['outlet_manager', 'owner', 'restaurant_admin']
    );
  }
}
```

---

## 7. Verification & Test Results

### A. Live Cloud Firestore Emulator Verification (`@firebase/rules-unit-testing`)
Executed using:
```bash
npx firebase emulators:exec --project=demo-abar-khabo --only firestore "node tests/emulator_rules_unit.test.js"
```
**Results: 32 / 32 Scenarios Passed (0 Failed)**
- Real gRPC `PERMISSION_DENIED` enforced for:
  - Restaurant Admin A attempting to write to Restaurant B's `menuCatalog`
  - Waiter attempting to modify `menuCatalog`
  - Outlet Manager attempting to modify an unassigned outlet's `menuOverrides`
  - Waiter attempting to write `menuOverrides`

### B. Unit & Security Test Suites (`npm test`)
- **Suite 1: Outlet Model Unit Tests (`tests/test_outlet_model.js`):** 45 / 45 Passed
- **Suite 2: Staff Identity Unit Tests (`tests/test_staff_identity.js`):** 40 / 40 Passed
- **Suite 3: Menu & Pricing Unit Tests (`tests/test_menu_pricing.js`):** 30 / 30 Passed
- **Suite 4: AST Security Rules Tests (`tests/test_rules_isolation.js`):** 55 / 55 Passed
- **Total Combined Tests:** **170 / 170 Passed (0 Failed)**

### C. Client Production Build (`npm --prefix client run build`)
- Transformed 1675 modules in 4.61s with **0 compilation errors**.

---

## 8. Regression & Backward Compatibility

- **Existing POS & Table Ordering:** Unaffected. `menuItems` collection continues functioning as a legacy mirror.
- **Customer Portal & Online Orders:** Real-time listeners on `menuItems` and `categories` continue operating.
- **KDS Kitchen Tickets:** Historical order item names, quantities, and cooking notes remain unchanged.

---

## 9. Next Step Status

> [!IMPORTANT]
> **Step 3 is complete, tested, committed, and synced.** In accordance with execution control, execution is paused.
>
> **Next Step:** Stage 2 Part B, **Step 4 (Normalized Online Orders Schema & Dual-Mirroring Engine)**.
>
> Awaiting explicit user approval before proceeding to Step 4.
