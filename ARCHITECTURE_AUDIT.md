# ARCHITECTURE AUDIT: ABAR KHABO
## Multi-Tenant Restaurant SaaS & Aggregator Integration Platform
**Document Version:** 1.0.0  
**Audit Date:** 2026-11-15  
**Auditor:** Senior Software Architect, Security Engineer & Integration Specialist  
**Target Platform:** Abar Khabo (Petpooja-grade Multi-Tenant POS, Kitchen Display & Swiggy/Zomato Aggregation Engine)

---

## 1. Executive Summary

Abar Khabo is an active, functional restaurant POS and online food ordering application. It currently handles dine-in table billing, kitchen order tickets (KOT), real-time kitchen displays, inventory stock management, customer online ordering (delivery/takeaway), live GPS delivery tracking, and delivery partner (rider) onboarding with Aadhaar verification.

However, the application currently operates as a **100% client-driven serverless architecture** directly talking to Cloud Firestore via the Firebase Client SDK. To scale Abar Khabo into a commercial, multi-tenant SaaS platform with centralized Swiggy and Zomato order aggregation, a **secure, production-grade backend integration layer** (Node.js + TypeScript + Express) must be established alongside an **Outlet-aware multi-tenant data model**.

This audit details the current technical footprint, identifies critical security and architectural gaps, and proposes a zero-breaking-change phased migration strategy.

---

## 2. Existing System Architecture

### 2.1 Technology Stack
* **Frontend:** React 18.3.1, Vite 6.0.11, React Router v6.28.2, Tailwind CSS 3.4.17, Lucide React 0.475.0, Axios 1.7.9.
* **Database:** Google Cloud Firestore (multi-tenant subcollection model per restaurant).
* **Authentication:** Firebase Authentication (v12.19.0 client SDK).
* **Hosting / Deployment:** Vercel SPA (`vercel.json` rewrites all routes to `/index.html`).
* **Storage / Assets:** Base64 canvas-compressed images for rider photos, Aadhaar cards, and ImgBB integration for menu items.
* **Backend:** **None currently exists.** All business logic, queries, and state transitions execute in the user's browser.

### 2.2 Directory Layout
```text
Web_clone/
├── .env.example
├── firestore.rules               # Firestore security rules
├── package.json                  # Root runner scripts (npm run dev/build)
├── vercel.json                   # Vercel deployment & SPA routing configuration
├── client/
│   ├── package.json              # React 18 + Vite dependencies
│   ├── vite.config.js
│   ├── src/
│   │   ├── App.jsx               # Router, context providers & protected routes
│   │   ├── firebase/
│   │   │   └── config.js         # Firebase client initialization
│   │   ├── context/
│   │   │   ├── AuthContext.jsx   # Staff, Restaurant Admin & Super Admin auth
│   │   │   ├── RestaurantContext.jsx # Active restaurant metadata & tax/currency
│   │   │   ├── CustomerAuthContext.jsx # Consumer ordering auth
│   │   │   ├── DeliveryPartnerAuthContext.jsx # Delivery boy / rider auth
│   │   │   ├── ThemeContext.jsx  # Dark/Light mood theme toggle
│   │   │   └── ToastContext.jsx  # Real-time toast notifications
│   │   ├── pages/                # 21 operational and customer-facing pages
│   │   ├── components/           # POS, Kitchen, Delivery, Common UI components
│   │   ├── services/             # Client-side Firestore and third-party wrappers
│   │   └── utils/                # Phone, Aadhaar, stock, image compression helpers
```

---

## 3. Current Frontend Modules Analysis

Every page in `client/src/pages/` was inspected for implementation status and dependencies:

| Module | Route | Access Roles | Implementation Status | Integration Notes |
| :--- | :--- | :--- | :--- | :--- |
| **LoginPage.jsx** | `/login` | Public (Hidden) | Fully Functional | Staff ID / PIN login & Admin email/password login. |
| **CustomerPortalPage.jsx** | `/`, `/customer`, `/order` | Public | Fully Functional | Multi-restaurant consumer discovery, location selector, cart, Aadhaar partner banner. |
| **PublicMenuPage.jsx** | `/menu/:id`, `/order/:id` | Public | Fully Functional | Customer-facing restaurant menu, category filter, cart, checkout with address selection. |
| **CustomerOrderTrackingPage.jsx** | `/track/:orderId` | Public (by Order ID) | Fully Functional | Real-time Google Maps GPS tracking, ETA calculation, rider profile with Aadhaar verified badge. |
| **DeliveryPartnerAuthPage.jsx** | `/rider/login`, `/rider/register` | Public (Rider) | Fully Functional | Dedicated rider portal with UIDAI 12-digit Aadhaar verification, document upload, photo capture. |
| **DeliveryPartnerDashboardPage.jsx** | `/rider` | Delivery Partner | Fully Functional | Rider order acceptance, step advancement (Arrived, Picked Up, Delivered), GPS broadcast simulator. |
| **RestaurantDeliveryManagementPage.jsx** | `/delivery-management` | Admin, Staff, Cashier | Fully Functional | Proximity-based dynamic rider dispatch, GPS live map modal, instant rider onboarding. Manual food readiness is terminated. |
| **KitchenPage.jsx** | `/kitchen` | Kitchen, Admin | Fully Functional | Real-time KDS: Table KOTs and Online Consumer Orders with audible chimes, Accept & Cook, Decline, and "Food is Ready" controls. |
| **POSPage.jsx** | `/pos` | Waiter, Staff, Admin | Fully Functional | Dine-in table ordering, running KOT dispatch, seat count, item search, custom notes. Guarded against cashier. |
| **CashierPage.jsx** | `/cashier` | Cashier, Admin, Staff | Fully Functional | Table billing, UPI QR generation, cash change calculator, card entry, invoice generation, discount management. |
| **OnlineOrdersPage.jsx** | `/online-orders` | Operational Roles | Fully Functional | Read-only consumer order history list, timeline overview, link to Delivery Management. |
| **OrdersPage.jsx** | `/orders` | Operational Roles | Fully Functional | Active and past table order listing, status filter, order breakdown. |
| **TablesPage.jsx** | `/tables` | Operational Roles | Fully Functional | Table layout management, occupancy state, table transfer, waiter claiming. |
| **MenuAdminPage.jsx** | `/menu-admin` | Admin only | Fully Functional | Category creation, dish creation, pricing, veg/non-veg toggle, stock limits, ImgBB photo upload. |
| **InventoryPage.jsx** | `/inventory` | Admin only | Fully Functional | Raw material inventory, stock levels, minimum stock alerts, manual adjustments, transaction history. |
| **InvoicesPage.jsx** | `/invoices` | Cashier, Admin, Staff | Fully Functional | Historical tax invoices, reprint receipt, PDF export. |
| **ReportsPage.jsx** | `/reports` | Admin only | Fully Functional | Sales analytics, daily revenue, category distribution, settlement logs, Excel export. |
| **ReservationsPage.jsx** | `/reservations` | Operational Roles | Fully Functional | Table reservation booking, guest contact, time slot management. |
| **SettingsPage.jsx** | `/settings` | Admin only | Fully Functional | Restaurant info, tax rates, currency, thermal printer setup, delivery fees (Distance/Fixed/Free), data cleanup. |
| **SuperAdminPage.jsx** | `/super-admin` | Super Admin only | Fully Functional | Tenant provisioning, hotel creation, subscription monthly fees, staff account resets. |

---

## 4. Existing Database Architecture & Firestore Collections

The existing project utilizes a hybrid Firestore model:

### 4.1 Root Collections
* `restaurants/{restaurantId}`: Restaurant tenant document containing name, slug, phone, address, coordinates, status (`active`/`suspended`), taxRate, currency, deliverySettings.
* `users/{email}`: User profile storing role (`super_admin`, `restaurant_admin`, `staff`, `waiter`, `cashier`, `kitchen`), `restaurantId`, numeric `staffId`, status (`active`, `pending`, `suspended`).
* `staffLookup/{staffId}`: Maps 6-digit numeric staff IDs to internal email logins.
* `onlineOrders/{orderId}`: Direct root mirror of consumer delivery and takeaway orders for cross-restaurant indexing and customer phone lookup.
* `deliveryTracking/{orderId}`: Real-time GPS coordinates, route polyline, rider speed, and order progression timestamps.
* `deliveryPartners/{partnerId}`: Delivery partner profile with name, phone, photoUrl, vehicleType, vehicleNumber, `isAadhaarVerified`, `aadhaarNumber`, `aadhaarPhoto`, `isOnline`, `isAvailable`.
* `customerAddresses/{customerId}/addresses/{addressId}`: Saved customer delivery addresses with coordinates and door/landmark info.

### 4.2 Subcollections (under `restaurants/{restaurantId}/`)
* `categories/{categoryId}`: Menu categories (e.g. Starters, Main Course, Beverages).
* `menuItems/{itemId}`: Dish definitions with name, price, categoryId, isAvailable, stockQty, dietary tags.
* `tables/{tableId}`: Physical dining tables, capacity, status (`AVAILABLE`, `OCCUPIED`, `BILL_REQUESTED`), activeOrderId.
* `orders/{orderId}`: Dine-in table orders containing bill amounts, items array, orderStatus, waiter details.
* `kots/{kotId}`: Kitchen Order Tickets sent to chefs with status (`NEW`, `PREPARING`, `READY`, `SERVED`).
* `invoices/{invoiceId}`: Settled bills with tax breakdown (CGST/SGST), payment method (CASH, UPI, CARD), invoiceNumber.
* `inventory/{itemId}`: Raw material stock records with unit (kg, ltr, pcs), currentStock, minStockLevel.
* `inventory/{itemId}/transactions/{txnId}`: Stock ledger entries (IN, OUT, ADJUSTMENT).
* `reservations/{resId}`: Advance table booking records.
* `auditLogs/{logId}`: Security audit log entries of staff actions.
* `settings/{settingId}`: Printer and hardware station configs.
* `onlineOrders/{orderId}`: Restaurant-scoped copy of online consumer orders.

---

## 5. Authentication Architecture

The application has three distinct authentication scopes:
1. **Restaurant Staff & Administration (`AuthContext.jsx`)**:
   * Uses Firebase Authentication (email/password).
   * Supports numeric Staff ID + PIN login via `staffLookup` mapping to a virtual internal email (`staff_123456@restopulse.local`).
   * Role-based permissions stored in `users/{email}`: `super_admin`, `restaurant_admin`, `staff`, `waiter`, `cashier`, `kitchen`.
   * Cross-tenant barrier: `isRestaurantStaff(restaurantId)` rule in Firestore validates user's `profile().restaurantId == restId`.
2. **Customer Authentication (`CustomerAuthContext.jsx`)**:
   * Consumer ordering credentials with phone number and saved addresses.
3. **Delivery Partner Authentication (`DeliveryPartnerAuthContext.jsx`)**:
   * Rider credentials stored in `deliveryPartners/{uid}` with verified Aadhaar metadata.

---

## 6. Existing Order & Delivery Lifecycles

### 6.1 Dine-In POS Lifecycle
$$\text{Table Claimed} \rightarrow \text{KOT Dispatched} \rightarrow \text{Kitchen Cooking} \rightarrow \text{Food Ready} \rightarrow \text{Served to Table} \rightarrow \text{Bill Requested} \rightarrow \text{Cashier Payment Settle} \rightarrow \text{Table Released}$$

### 6.2 Online Consumer Delivery Lifecycle
$$\text{Customer Orders (PLACED)} \rightarrow \text{Kitchen Accepts (PREPARING)} \rightarrow \text{Food is Ready (READY)} \rightarrow \text{Cashier Assigns Rider (RIDER\_ASSIGNED)} \rightarrow \text{Rider Pickup} \rightarrow \text{Out for Delivery} \rightarrow \text{Delivered}$$

---

## 7. Security Vulnerabilities & Missing Backend Infrastructure

### 7.1 Critical Security Vulnerabilities
1. **Unprotected Root Collections in Firestore Rules**:
   In `firestore.rules`:
   ```javascript
   match /onlineOrders/{orderId} { allow read, create, update: if true; }
   match /deliveryTracking/{orderId} { allow read, create, update: if true; }
   match /deliveryPartners/{partnerId} { allow read, create, update: if true; }
   ```
   *Risk:* Any internet user can inspect or alter competitor online orders, change rider locations, or modify delivery partner records using the public Firebase configuration.
2. **Client-Side Secret Exposure Risk**:
   Currently, because there is no backend server, integrating third-party APIs (Swiggy, Zomato, UrbanPiper) directly from the client would require embedding API tokens, secret keys, and webhook signing secrets in frontend JavaScript bundles. This would be a catastrophic credential leak.
3. **No Webhook Ingestion Point**:
   Aggregators like Swiggy and Zomato push orders via HTTP `POST` webhooks. A static Vercel client cannot receive asynchronous webhooks or verify HMAC-SHA256 signatures.
4. **Client-Side Stock Deduction Race Conditions**:
   `deductMenuStock` executes via client SDK. Concurrent orders across POS, website, and aggregators could oversell stock without atomic server-side inventory reservation.

### 7.2 Missing Backend Infrastructure
* No Node.js/TypeScript microservice or API gateway.
* No Google Cloud Run container service.
* No Google Cloud Tasks / PubSub queue for background webhook deduplication and retries.
* No Secret Manager integration for aggregator API keys.
* No structured logging or error reporting for third-party sync failures.

---

## 8. Third-Party Aggregator Integration Readiness

| Provider | Direct API Availability | Middleware Option (e.g. UrbanPiper) | Prerequisites | Readiness Score |
| :--- | :--- | :--- | :--- | :--- |
| **Swiggy** | Private / Partner Gated API | Supported via UrbanPiper "Hub" | Official Swiggy Merchant API Partner Contract & Static IP Whitelisting | **Adapter Ready (Needs Backend)** |
| **Zomato** | Private / Partner Gated API | Supported via UrbanPiper "Hub" | Official Zomato Developer Agreement & Merchant Outlet Mapping | **Adapter Ready (Needs Backend)** |
| **UrbanPiper**| Publicly Documented Developer API | Direct Middleware Aggregator | Sandbox account credentials & Webhook endpoint | **Adapter Ready (Needs Backend)** |
| **Mock Engine**| In-house simulated sandbox | Direct Local Development | None (Built-in) | **100% Ready for Implementation** |

---

## 9. Potential Breaking Changes & Safeguards

| Potential Risk | Impact | Architectural Safeguard |
| :--- | :--- | :--- |
| **Adding Outlet Layer** | Existing single-restaurant queries break if `outletId` is suddenly required everywhere. | **Backward-Compatible Default Outlet:** Auto-map existing `restaurantId` to a primary default outlet `outlets/{restaurantId}_main`. Existing POS and kitchen flows continue without disruption. |
| **Unified Order Ingestion** | Incoming Swiggy/Zomato orders could conflict with dine-in or direct online order formats. | **Normalized Order Model:** Keep `onlineOrders` schema intact; store aggregator metadata in an additive `aggregatorMetadata` field and maintain separate `source: 'swiggy' \| 'zomato' \| 'abar_khabo'`. |
| **Duplicate Webhook Delivery** | Swiggy/Zomato retrying webhooks could cause duplicate kitchen tickets and double stock deductions. | **Idempotency Ledger:** `integrationWebhooks` and `aggregatorOrders` indexed by `hash(provider, externalOrderId)`. Duplicate events are acknowledged with HTTP 200 and ignored. |
| **Aggregator Outages** | Swiggy or Zomato API downtime freezes the restaurant POS. | **Asynchronous Decoupling:** POS operates completely offline/client-first with Firestore. Aggregator sync runs in background workers without blocking cashier or kitchen operations. |

---

## 10. Proposed Multi-Tenant Architecture & Modular Backend Design

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        ABAR KHABO CLIENT (React)                       │
│  [POS Terminal]  [Kitchen KDS]  [Delivery Mgr]  [Aggregator Dashboard] │
└───────────────────────────────┬────────────────────────────────────────┘
                                │ Authenticated ID Token / Firestore Real-time
                                ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   CLOUD FIRESTORE (Database & Real-time)               │
│  restaurants/ | outlets/ | onlineOrders/ | aggregatorOrders/ | menu    │
└───────────────────────────────▲────────────────────────────────────────┘
                                │ Admin SDK / Service Account
                                ▼
┌────────────────────────────────────────────────────────────────────────┐
│              ABAR KHABO INTEGRATION ENGINE (Node.js/TS Backend)        │
│  ┌──────────────────┐  ┌────────────────────┐  ┌────────────────────┐  │
│  │ Webhook Ingestion│  │ Aggregator Adapters│  │ Order Normalizer   │  │
│  │ - Signature Auth │  │ - Swiggy Adapter   │  │ - Idempotency      │  │
│  │ - Deduplication  │  │ - Zomato Adapter   │  │ - Stock Ledger     │  │
│  │ - Replay Shield  │  │ - UrbanPiper/Mock  │  │ - KDS Dispatch     │  │
│  └────────▲─────────┘  └────────▲───────────┘  └────────────────────┘  │
└───────────┼─────────────────────┼──────────────────────────────────────┘
            │                     │
            ▼                     ▼
┌───────────────────────┐   ┌────────────────────────┐
│   Swiggy Merchant API │   │   Zomato Merchant API  │
└───────────────────────┘   └────────────────────────┘
```

### 10.1 New Backend Server Directory (`server/`)
```text
server/
├── src/
│   ├── app.ts                    # Express application setup & middleware
│   ├── server.ts                 # Server entry point (Port / Cloud Run listener)
│   ├── config/
│   │   ├── env.ts                # Validated environment variables
│   │   └── firebaseAdmin.ts      # Firebase Admin SDK initialization
│   ├── middleware/
│   │   ├── authMiddleware.ts     # Firebase ID token verification
│   │   ├── tenantMiddleware.ts   # Multi-tenant restaurant & outlet isolation
│   │   ├── rateLimiter.ts        # DoS prevention
│   │   └── errorMiddleware.ts    # Centralized error handler
│   ├── modules/
│   │   ├── outlets/              # Outlet provisioning & external ID mapping
│   │   ├── aggregators/          # Swiggy/Zomato connection health & state
│   │   ├── orders/               # Unified order normalization & Firestore sync
│   │   ├── menus/                # Central menu sync & item ID mappings
│   │   ├── inventory/            # Atomic inventory deduction ledger
│   │   ├── webhooks/             # Inbound webhook receivers & signature verification
│   │   ├── settlements/          # Marketplace commissions & payout reports
│   │   └── reports/              # Aggregator metrics & analytics
│   ├── adapters/
│   │   ├── base/
│   │   │   ├── AggregatorAdapter.ts # Common TypeScript interface
│   │   │   └── AggregatorRegistry.ts# Capability & active route manager
│   │   ├── swiggy/
│   │   │   └── SwiggyAdapter.ts  # Swiggy Direct API adapter
│   │   ├── zomato/
│   │   │   └── ZomatoAdapter.ts  # Zomato Direct API adapter
│   │   ├── urbanpiper/
│   │   │   └── UrbanPiperAdapter.ts # Middleware aggregator adapter
│   │   └── mock/
│   │       └── MockAggregatorAdapter.ts # Local development sandbox simulator
│   └── utils/
│       ├── logger.ts             # Structured JSON logger
│       └── crypto.ts             # Webhook signature & HMAC verification
├── tests/
│   ├── unit/                     # Adapters, normalizers & idempotency tests
│   └── integration/              # Webhook & tenant isolation tests
├── Dockerfile                    # Container definition for Cloud Run
├── package.json
└── tsconfig.json
```

---

## 11. Phased Implementation Roadmap

* **STAGE 0: Repository Inspection and Architecture Audit** *(Current Stage)*
* **STAGE 1: Security & Strict Tenant Isolation** (Update Firestore rules, secure open collections, tenant verification guards).
* **STAGE 2: Database Schema & Outlets Model** (Design `outlets`, `aggregatorConnections`, `aggregatorOrders`, backward-compatible outlet migration).
* **STAGE 3: Backend Integration Infrastructure** (`server/` Node.js + TypeScript + Express setup with Firebase Admin SDK).
* **STAGE 4: Common Aggregator Adapter Framework** (`AggregatorAdapter` interface, capabilities registry, error handling).
* **STAGE 5: Mock Swiggy & Zomato Sandbox Integration** (Realistic mock payloads, simulated order injection, test suites).
* **STAGE 6: Unified Order Management Engine** (Order normalization, idempotency, KDS sync, POS sync).
* **STAGE 7: Menu & Centralized Inventory Synchronization** (Item ID mapping, out-of-stock toggles, atomic ledger).
* **STAGE 8: Aggregator Management Frontend** (React sidebar section: Integration status, unified aggregator orders, menu sync, settlement reports).
* **STAGE 9: Middleware Integration (UrbanPiper) Pipeline** (Middleware adapter, webhook receiver, environment configuration).
* **STAGE 10: Direct Aggregator Production Configuration** (Direct authorized endpoints, credential onboarding documentation).
* **STAGE 11: End-to-End Verification, Documentation & Deployment** (Docker, Cloud Run guide, test suites, handover).

---
*End of Architecture Audit (Stage 0).*
