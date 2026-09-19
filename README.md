# RestoPulse — Multi-Tenant Cloud Restaurant Management & POS System

**RestoPulse** is an enterprise-grade Multi-Tenant Restaurant Point of Sale (POS), Kitchen Display System (KDS), Table Management, Inventory, Sales Analytics, Table Reservations, and Digital Public Menu platform powered by **Google Firebase Firestore** and **ImgBB Cloud Media CDN**.

Designed to run **24/7 in the cloud**, completely independent of any local development computer.

---

## 🍽️ Key Modules & Capabilities

- **👑 Super Admin Platform Portal (`/super-admin`)**: Platform owner portal to register and manage multiple restaurant tenants, assign restaurant admins, view platform-wide metrics (total restaurants, system revenue, active staff), and switch live active tenant context.
- **⚡ Fast POS Order Entry Terminal (`/pos`)**: Touch & desktop optimized order taker with category pills, instant search, Veg/Non-Veg filter, customizable dish cooking notes, table selectors, live tax/discount recalculations, and 1-click KOT / Quick Settle.
- **👨‍🍳 Kitchen Display System (KDS) (`/kitchen`)**: Real-time 3-stage visual Kanban board (`NEW/CONFIRMED` ➔ `PREPARING` ➔ `READY` ➔ `SERVED`) with live Firestore synchronization, elapsed timers, delayed order warnings, and dietary badges.
- **🪑 Table & Floor Management (`/tables`)**: Real-time dining table status (`AVAILABLE` vs `OCCUPIED`), seating capacity, active order binding, and automatic occupancy release on bill settlement.
- **📅 Table Booking & Reservations (`/reservations`)**: Manage customer table reservations with status workflows (`CONFIRMED`, `SEATED`, `CANCELLED`).
- **💳 Multi-Mode Billing & Thermal Invoices (`/invoices`)**: Financial calculations, support for `CASH`, `CARD`, and `UPI`, automatic invoice numbering, and a dedicated 80mm thermal receipt print layout.
- **📦 Stock & Raw Material Inventory (`/inventory`)**: Real-time quantity tracking, minimum threshold alerts, `IN`/`OUT`/`ADJUSTMENT` logging, and immutable audit trails.
- **📊 Real-Time Sales & Revenue Analytics (`/dashboard`, `/reports`)**: Day-by-day revenue breakdown, average order value (AOV), dine-in vs. takeaway share, payment method split, and top-selling dishes ranking.
- **📖 Public Multi-Tenant Digital Menu (`/menu` & `/menu/:restaurantId`)**: Mobile-first, customer-facing digital menu showcasing restaurant branding, categories, high-resolution ImgBB food photos, and instant online table reservation.
- **🖼️ ImgBB Free Cloud Media CDN**: Integrated drag-and-drop image uploader for logos, banners, and food dishes with zero local storage requirements.
- **🛡️ Firestore Production Security Rules (`firestore.rules`)**: Granular multi-tenant isolation, super-admin overrides, restaurant-admin scoping, and public menu read access.

---

## 🛠️ Architecture & Tech Stack

| Layer | Technologies |
|---|---|
| **Database & Auth** | Google Firebase Firestore (NoSQL Cloud DB) & Firebase Authentication |
| **Image Hosting** | ImgBB Cloud Media API (Direct CDN URLs saved to Firestore) |
| **Frontend UI** | React 18, Vite, Tailwind CSS, Lucide Icons, React Router v6 |
| **Deployment** | 100% Serverless / Static Cloud (Vercel, Netlify, Firebase Hosting) — Runs 24/7 |

---

## 🚀 Quick Start (Development & Demo)

### 1. Prerequisites
- **Node.js**: v18+ (tested on v24)
- **npm**: v9+

### 2. Install & Start Client
```bash
cd client
npm install
npm run dev
```

### 3. Initialize Demo Cloud Data
1. Open [http://localhost:5173/login](http://localhost:5173/login) in your browser.
2. Click **"Seed Firestore Demo"** in the bottom right of the login screen to initialize sample restaurants (*Spice Haven Bistro* and *Grand Royal Kitchen*), categories, menu items, tables, inventory, and staff.
3. Use the **1-Click Role Switcher** buttons to test:
   - 👑 **Super Admin** (`superadmin@restopulse.com`) ➔ Full platform management
   - 🏢 **Restaurant Admin** (`owner@restopulse.com`) ➔ Spice Haven administration
   - 🛎️ **POS Staff** (`staff@restopulse.com`) ➔ POS order entry & billing
   - 👨‍🍳 **Kitchen KDS** (`kitchen@restopulse.com`) ➔ Kitchen display terminal

---

## 🌐 Deploying to Production (24/7 Cloud Independence)

### Step 1: Create a Free Firebase Project
1. Go to the [Firebase Console](https://console.firebase.google.com/) and click **"Add project"**.
2. Enable **Cloud Firestore**:
   - In the left sidebar, click **Firestore Database** ➔ **Create Database**.
   - Choose production mode and select your closest cloud location.
3. Enable **Firebase Authentication**:
   - In the left sidebar, click **Authentication** ➔ **Get Started** ➔ Enable **Email/Password** sign-in method.
4. Register a **Web App**:
   - In Project Settings ➔ General ➔ Your apps ➔ Add Web App `</>`.
   - Copy the `firebaseConfig` keys (`apiKey`, `authDomain`, `projectId`, etc.).

### Step 2: Deploy Firestore Security Rules
Install the Firebase CLI and deploy the included `firestore.rules`:
```bash
npm install -g firebase-tools
firebase login
firebase init firestore # Select your project
firebase deploy --only firestore:rules
```

### Step 3: Get Free ImgBB API Key
1. Go to [https://api.imgbb.com/](https://api.imgbb.com/) and sign up.
2. Click **"Get API Key"** and copy the 32-character key.

### Step 4: Configure Environment Variables
Create a `.env` file in the `client/` directory (or configure them in your Vercel/Netlify dashboard):
```env
VITE_FIREBASE_API_KEY="AIzaSy..."
VITE_FIREBASE_AUTH_DOMAIN="your-app.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="your-app"
VITE_FIREBASE_STORAGE_BUCKET="your-app.appspot.com"
VITE_FIREBASE_MESSAGING_SENDER_ID="123456789"
VITE_FIREBASE_APP_ID="1:123456789:web:abcd"
VITE_IMGBB_API_KEY="your_imgbb_api_key"
```

### Step 5: Deploy to Vercel / Netlify / Firebase Hosting
- **Vercel**: Import the GitHub repository, set Root Directory to `client`, add your environment variables, and deploy.
- **Firebase Hosting**: Run `npm run build` in `client/` and run `firebase deploy --only hosting`.

Once deployed, the website runs **24 hours a day, 7 days a week** in the cloud. You can shut down your computer and the POS, KDS, customer menu, and admin portals will continue functioning worldwide.

---

## 🔑 Access Control & Permissions

| Role | Access Scope |
|---|---|
| **Super Admin** | Platform Owner. Can view all restaurants, onboard new restaurants, create/delete restaurant admins, and access every tenant. |
| **Restaurant Admin** | Isolated to their assigned restaurant. Can manage menus, prices, tables, staff, inventory, view analytics, and edit branding. |
| **POS Staff** | Scoped to their restaurant. Fast order taking, table booking, invoice printing, and bill settlement. |
| **Kitchen KDS** | Scoped to their restaurant. Dedicated view of incoming, cooking, and ready food tickets. |
| **Public Customer** | Accessible at `/menu/:restaurantId` without login. Read-only menu viewing and table reservations. |

---

## 📁 Project Directory Structure

```
├── client/                     # Frontend React + Vite Cloud Application
│   ├── src/
│   │   ├── context/            # Auth, Restaurant, & Toast Contexts
│   │   ├── firebase/           # Firebase SDK initialization & Firestore demo seeder
│   │   ├── services/           # Firestore Multi-Tenant CRUD & ImgBB Upload Service
│   │   ├── components/
│   │   │   ├── common/         # Layout, Sidebar, Header, ImgBBUploader, ProtectedRoute
│   │   │   └── invoice/        # PrintableReceipt & Thermal Invoice Modal
│   │   ├── pages/              # SuperAdmin, POS, Kitchen, Reservations, MenuAdmin,
│   │   │                       # Tables, Inventory, Invoices, Reports, Settings, PublicMenu
│   │   ├── App.jsx             # React Router v6 routing & role gates
│   │   └── index.css           # Tailwind CSS directives & 80mm thermal print styles
│   └── package.json
│
├── firestore.rules             # Production Firestore multi-tenant security rules
├── PROJECT_PLAN.md             # Multi-tenant architectural specification
├── README.md                   # Complete system documentation
└── .env.example                # Environment variables template
```
