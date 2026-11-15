# 🍽️ Abar Khabo (আবার খাবো) — Multi-Tenant Restaurant POS & Food Aggregator SaaS

**Abar Khabo** is an enterprise-grade **Multi-Tenant Restaurant Cloud POS, Kitchen Display System (KDS) & Multi-Channel Food Aggregator SaaS Platform** built with **React 18**, **Vite**, **Tailwind CSS**, **Node.js (Express)**, and **Google Cloud Firestore / Firebase**.

The platform is designed from the ground up for independent restaurants and multi-outlet franchises, providing strict tenant isolation, role-based access control, live kitchen workflow management, real-time inventory tracking, multi-channel pricing, rider fleet dispatch, financial reconciliation, and webhook-driven food aggregator integration (Swiggy, Zomato, Direct Ordering).

---

## 📑 Table of Contents

- [System Architecture](#-system-architecture)
- [Key Features](#-key-features)
- [Prerequisites](#-prerequisites)
- [Quick Start Guide](#-quick-start-guide)
  - [1. Clone the Repository](#1-clone-the-repository)
  - [2. Install Root & Backend Dependencies](#2-install-root--backend-dependencies)
  - [3. Install Frontend Dependencies](#3-install-frontend-dependencies)
- [Environment Variables Configuration](#-environment-variables-configuration)
  - [Frontend Configuration (`client/.env`)](#frontend-configuration-clientenv)
  - [Backend Configuration (`server/.env`)](#backend-configuration-serverenv)
- [Starting the Application](#-starting-the-application)
  - [Option A: Starting Frontend & Backend Separately](#option-a-starting-frontend--backend-separately)
  - [Option B: Starting with Docker](#option-b-starting-with-docker)
- [Running Automated Tests](#-running-automated-tests)
  - [Master Regression Test Suite (778+ Tests)](#master-regression-test-suite-778-tests)
  - [Individual Modular Suites](#individual-modular-suites)
  - [Live Firestore Emulator Security Rules Suite](#live-firestore-emulator-security-rules-suite)
- [Firebase & Security Boundary for Developers](#-firebase--security-boundary-for-developers)
- [Directory Structure](#-directory-structure)
- [User Roles & Access Control](#-user-roles--access-control)
- [Deployment Standards](#-deployment-standards)

---

## 🏗️ System Architecture

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                             CLIENT LAYER (Vite + React 18)                  │
│                                                                             │
│  [POS Terminal]  [Kitchen Display]  [Cashier / Invoicing]  [Inventory Hub]  │
│  [Rider Portal]  [Super Admin SaaS] [Channel Overrides]   [Public Menu]     │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ HTTPS / WSS / REST
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│               TRUSTED NODE.JS BACKEND (Google Cloud Run Compliant)          │
│                                                                             │
│  - Defensive Security Headers (HSTS, CSP, nosniff, frame-ancestors DENY)   │
│  - In-Memory Token Bucket Rate Limiting (60 req/min API, 300 req/min Webhook)│
│  - Firebase ID Token Verification & App Check Attestation                   │
│  - Authoritative Multi-Tenant Isolation (`requireTenant`, `requireOutlet`)   │
│  - HMAC-SHA256 Webhook Ingestion Engine (Swiggy / Zomato / Direct)          │
│  - Authoritative Order State Machine & Stock Ledger Deduction Engine        │
│  - Platform Analytics, SaaS Entitlements & Subscription Enforcement         │
│  - Google Cloud Secret Manager & PITR Disaster Recovery Engine              │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Firebase Admin SDK (Privileged)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          PERSISTENCE & SECURITY                             │
│                                                                             │
│  - Google Cloud Firestore (Multi-tenant structured collections & indexes)   │
│  - Strict Firestore Security Rules (Cross-tenant barrier & RBAC validation) │
│  - Firebase Authentication (Email/Password, Custom Claims)                  │
│  - Local Firebase Emulator Suite (Offline unit testing & verification)      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## ✨ Key Features

- ⚡ **Point of Sale (POS):** Fast order placement, dynamic table selection, composite items, add-ons, split billing, discounts, and real-time KOT generation.
- 👨‍🍳 **Kitchen Display System (KDS):** Real-time order queue with status transitions (`PLACED` ➔ `PREPARING` ➔ `READY` ➔ `COMPLETED`), station filtering, and sound/visual alerts.
- 🌐 **Unified Multi-Channel Aggregator Engine:** Normalizes orders across POS, Dine-in, Takeaway, Swiggy, and Zomato into an authoritative `aggregatorOrders/{orderId}` schema.
- 📦 **Transactional Inventory & Recipe Engine:** Automatic stock reservation on order placement, atomic consumption on prep, auto-restock on cancellation, and waste tracking.
- 🛵 **Delivery & Rider Dispatch:** Restaurant-owned fleets, outlet-scoped rider assignment, live GPS tracking simulations, OTP/signature verification.
- 💳 **Payment & Settlement Reconciliation:** Unified payment journal covering Cash, UPI, Card, Swiggy Online, and Zomato Online with commission calculations and dispute management.
- 👑 **Super Admin Control Center:** Multi-restaurant onboarding, tenant suspension/activation, SaaS subscription tier management, and real-time MRR analytics.
- 🔐 **Zero-Trust Multi-Tenancy:** Firestore security rules and backend middleware guarantee that tenant data is isolated cryptographically and logically.

---

## 💻 Prerequisites

Ensure your development computer has the following tools installed before beginning:

1. **Node.js:** `v20.x` or higher (LTS recommended)
   - Verify: `node -v`
2. **npm:** `v10.x` or higher
   - Verify: `npm -v`
3. **Git:**
   - Verify: `git --version`
4. **Java JDK:** `v21` or higher (required **only** if running the local Firebase Emulator suite)
   - Verify: `java -version`

---

## 🚀 Quick Start Guide

### 1. Clone the Repository

```bash
git clone https://github.com/Bangla-Production/Web_clone.git
cd Web_clone
```

### 2. Install Root & Backend Dependencies

Root dependencies include Express, Cors, Firebase Admin, and development testing tools:

```bash
npm install
```

*(Optional: if working inside `server/` directly, run `cd server && npm install`)*

### 3. Install Frontend Dependencies

```bash
npm --prefix client install
```
*(Or `cd client && npm install`)*

---

## ⚙️ Environment Variables Configuration

The project is designed with graceful fallbacks so that developers can test offline immediately. To connect to an actual Firebase project, configure the `.env` files:

### Frontend Configuration (`client/.env`)

Copy the client template:
```bash
cp client/.env.example client/.env
```
*(On Windows PowerShell: `Copy-Item client/.env.example client/.env`)*

Open `client/.env` and insert your Firebase Web App configuration from the [Firebase Console](https://console.firebase.google.com/):

```env
VITE_FIREBASE_API_KEY="your-api-key"
VITE_FIREBASE_AUTH_DOMAIN="your-project-id.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="your-project-id"
VITE_FIREBASE_STORAGE_BUCKET="your-project-id.appspot.com"
VITE_FIREBASE_MESSAGING_SENDER_ID="your-sender-id"
VITE_FIREBASE_APP_ID="your-app-id"

# Backend server API URL
VITE_API_URL="http://localhost:8080/api"

# ImgBB API Key for dish image uploads (https://api.imgbb.com/)
VITE_IMGBB_API_KEY="your-imgbb-api-key"
```

> **Note:** If `client/.env` is omitted, the frontend automatically falls back to development demo parameters, enabling you to inspect UI pages and layouts offline.

---

### Backend Configuration (`server/.env`)

Copy the server template:
```bash
cp server/.env.example server/.env
```
*(On Windows PowerShell: `Copy-Item server/.env.example server/.env`)*

Configure `server/.env`:

```env
PORT=8080
NODE_ENV=development

# Option A: Local Emulator
# FIRESTORE_EMULATOR_HOST=localhost:8080
# FIREBASE_PROJECT_ID=demo-abar-khabo

# Option B: Live Firebase Project
# FIREBASE_PROJECT_ID=your-project-id
# GCLOUD_PROJECT=your-project-id
# GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json

# Webhook signature verification keys
SWIGGY_WEBHOOK_SECRET=your-swiggy-secret-key-32chars
ZOMATO_WEBHOOK_SECRET=your-zomato-secret-key-32chars
GENERIC_WEBHOOK_SECRET=your-generic-secret-key-32chars
```

---

## 🏃 Starting the Application

### Option A: Starting Frontend & Backend Separately

Open **Terminal 1** to run the frontend:
```bash
npm run dev
# Or: npm --prefix client run dev
```
The frontend will start at **`http://localhost:5173`**.

Open **Terminal 2** to run the backend:
```bash
npm run server
# Or for live auto-reload: npm run server:dev
```
The backend API will start at **`http://localhost:8080`**.

Verify backend health by visiting: **`http://localhost:8080/healthz`**.

---

### Option B: Starting with Docker

The repository includes a production-grade multi-stage Dockerfile conforming to Google Cloud Run standards:

```bash
# Build the container image
docker build -t abar-khabo-backend:latest .

# Run the container locally on port 8080
docker run -p 8080:8080 -e PORT=8080 abar-khabo-backend:latest
```

---

## 🧪 Running Automated Tests

The repository contains a battle-tested regression suite with **778+ automated unit, integration, and security tests**.

### Master Regression Test Suite (778+ Tests)

Execute all 13 test suites in one command:
```bash
npm test
```

### Individual Modular Suites

You can run individual test suites as needed:

```bash
npm run test:outlet       # Tests 1: Multi-tenant restaurant and outlet data model
npm run test:identity     # Tests 2: Staff identity, PIN auth, and outlet authorization
npm run test:menu         # Tests 3: Menu catalog, variants, and channel pricing
npm run test:order        # Tests 4: Normalized online orders schema and dual-mirroring
npm run test:webhook      # Tests 5: Aggregator webhook ingestion and HMAC verification
npm run test:engine       # Tests 6: Unified order management engine (POS, KDS, Aggregators)
npm run test:inventory    # Tests 7: Inventory reservation, recipes, and stock ledger
npm run test:delivery     # Tests 8: Rider dispatch, fleet logistics, and OTP delivery
npm run test:payment      # Tests 9: Payment journal, settlement, and reconciliations
npm run test:saas         # Tests 10: Super Admin analytics and subscription quotas
npm run test:security     # Tests 11: Firestore security rules isolation (30 scenarios)
npm run test:perf         # Tests 12: High-concurrency performance and stress simulation
npm run test:production   # Tests 13: 30-category production readiness and security audit
```

### Live Firestore Emulator Security Rules Suite

To test rules against the live Google Firebase Firestore Emulator (*requires Java 21+*):

```bash
npm run test:emulator
```

---

## 🛡️ Firebase & Security Boundary for Developers

> [!IMPORTANT]
> **Production Boundary Notice:**
> - The repository maintainer / Firebase project owner controls the live Firebase project, IAM service accounts, and production Firestore Security Rules deployment.
> - **Never commit real `.env` files or Google Cloud service account keys** to version control. The repository `.gitignore` is pre-configured to strictly ignore them.
> - To make changes to security rules, modify [firestore.rules](file:///c:/Users/ARGHA/Downloads/Web_clone/firestore.rules) locally, run `npm run test:emulator` to verify all 72 scenarios pass, and submit a pull request. Deploying to production is reserved for the project administrator:
>   ```bash
>   firebase deploy --only firestore:rules
>   firebase deploy --only firestore:indexes
>   ```

---

## 📁 Directory Structure

```text
Web_clone/
├── .github/
│   └── workflows/
│       └── ci.yml                 # 5-stage GitHub Actions CI/CD Pipeline
├── client/                        # Frontend Application (React 18 + Vite)
│   ├── src/
│   │   ├── components/            # Reusable UI components & navigation
│   │   ├── context/               # Auth, Restaurant, Cart, and Delivery contexts
│   │   ├── firebase/              # Firebase Client SDK & App Check initialization
│   │   ├── pages/                 # POS, KDS, Cashier, Inventory, Admin pages
│   │   ├── services/              # Client-side API & Firestore query services
│   │   └── utils/                 # Formatting, monetary, and unit converters
│   ├── .env.example               # Frontend environment template
│   └── package.json               # Frontend dependencies & scripts
├── server/                        # Backend Application (Node.js + Express)
│   ├── src/
│   │   ├── config/                # Firebase Admin SDK & financial configuration
│   │   ├── middleware/            # Rate limiting, auth, App Check, sanitization
│   │   ├── services/              # Webhooks, orders, inventory, payments, subscriptions
│   │   ├── utils/                 # Structured JSON logger, crypto, monetary math
│   │   ├── app.js                 # Express application & route orchestration
│   │   └── server.js              # Server lifecycle & graceful Cloud Run shutdown
│   ├── .env.example               # Backend environment template
│   └── package.json               # Backend dependencies & scripts
├── tests/                         # Master Automated Test Suites (13 suites)
│   ├── emulator_rules_unit.test.js# Live Firebase Emulator security rules tests
│   ├── test_outlet_model.js       # Step 1 test suite
│   ├── test_staff_identity.js     # Step 2 test suite
│   ├── test_menu_pricing.js       # Step 3 test suite
│   ├── test_normalized_orders.js  # Step 4 test suite
│   ├── test_aggregator_webhooks.js# Step 5 test suite
│   ├── test_unified_order_engine.js# Step 6 test suite
│   ├── test_inventory_recipe_engine.js # Step 7 test suite
│   ├── test_delivery_fleet_engine.js   # Step 8 test suite
│   ├── test_payment_settlement_engine.js # Step 9 test suite
│   ├── test_super_admin_saas_engine.js # Step 10 test suite
│   ├── test_rules_isolation.js    # Security isolation suite
│   ├── test_performance_scalability.js # Concurrency & performance suite
│   └── test_production_readiness_security.js # Full production audit suite
├── .dockerignore                  # Docker ignore definitions
├── .env.example                   # Full repository environment template
├── .gitignore                     # Git exclusions (.env, keys, node_modules)
├── cloudrun.yaml                  # Google Cloud Run deployment definition
├── Dockerfile                     # Multi-stage production container definition
├── firebase.json                  # Firebase CLI configuration
├── firestore.indexes.json         # Firestore composite queries & indexes
├── firestore.rules                # Production multi-tenant security rules
├── package.json                   # Root package definition & master test runner
├── PROJECT_PROGRESS.md            # Comprehensive architecture & progress log
└── README.md                      # Developer documentation & quick start guide
```

---

## 👥 User Roles & Access Control

| Role | Scope | Key Permissions |
|---|---|---|
| **`SUPER_ADMIN`** | Platform-Wide | Provision restaurants, manage subscription plans, toggle feature gates, view global MRR analytics. |
| **`RESTAURANT_ADMIN`**| Restaurant Brand | Manage outlets, configure aggregator credentials, create staff, oversee financials and settlements. |
| **`OUTLET_MANAGER`** | Assigned Outlet(s) | Modify menu pricing/availability for outlet, manage inventory, view outlet reports. |
| **`CASHIER`** | Assigned Outlet | Process orders, collect payments (Cash/Card/UPI), generate tax invoices, process refunds. |
| **`POS_STAFF`** | Assigned Outlet | Create POS dine-in/takeaway orders, send KOTs to kitchen, apply authorized discounts. |
| **`KITCHEN`** | Assigned Outlet | View live KDS orders, transition item states (`PREPARING` ➔ `READY`), mark 86'd items. |
| **`RIDER`** | Assigned Outlet | Accept delivery dispatches, record customer OTP/signatures, update delivery status. |
| **`CUSTOMER`** | Public Portal | Browse digital menu, place direct online orders, track order & delivery in real-time. |

---

## 🚢 Deployment Standards

- **Frontend:** Pre-configured for Vite build and deployment on **Vercel** or **Firebase Hosting**.
  - Build command: `npm --prefix client run build`
  - Output directory: `client/dist`
- **Backend:** Conforms to **Google Cloud Run** requirements:
  - Listens on environment variable `PORT` (default `8080`).
  - Implements liveness probe (`/healthz`) and readiness probe (`/readyz`).
  - Handles `SIGTERM` gracefully, draining active connections before exit.
  - Runs in non-root container (`USER node`) via multi-stage Alpine Dockerfile.

---

Built with ❤️ for **Abar Khabo**. Happy coding! 🚀
