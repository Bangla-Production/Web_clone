# PROJECT_PLAN.md: Restaurant Billing & POS Management System

## 1. Project Overview & Architecture
The system is an enterprise-grade, standalone Restaurant POS, Kitchen Display, Billing, Inventory, and Digital Menu application named **"RestoPulse POS"**. It is structured for rapid real-time operations, strict backend data integrity, role-based authorization, and responsive multi-device support (Desktop POS, Tablet/Kitchen screen, Mobile customer menu).

### Architecture Components
- **Backend (`/server`)**: Node.js + Express.js + Prisma ORM + SQLite (Prisma migrations & seed). Decimal-accurate monetary calculations. JWT token authentication with bcrypt password hashing.
- **Frontend (`/client`)**: React 18 + Vite + Tailwind CSS + Lucide React + React Router v6 + Axios. Touch-friendly UI with high contrast, fast order entry, table selectors, custom thermal receipt & invoice printing.
- **Shared API Contract**: Clean REST APIs under `/api/...` with centralized validation, robust error handling, and role-based middleware guards.

---

## 2. Relational Database Schema
- **Restaurant**: Core branding, address, phone, GST, currency, tax rates, invoice headers.
- **User & Role**: `OWNER`, `STAFF`, `KITCHEN` with secure password hashes.
- **Category & MenuItem**: Categorization, pricing, image URL, Veg/Non-Veg indicators, availability toggles.
- **RestaurantTable**: Table number/name, capacity, `AVAILABLE` / `OCCUPIED` statuses.
- **Order & OrderItem**: Order types (`DINE_IN`, `TAKEAWAY`), statuses (`DRAFT`, `CONFIRMED`, `PREPARING`, `READY`, `COMPLETED`, `CANCELLED`), payment statuses (`UNPAID`, `PAID`), subtotal, discounts, tax, grand total.
- **Payment & Invoice**: Payment methods (`CASH`, `CARD`, `UPI`), invoice numbers, timestamps.
- **StockItem & StockTransaction**: Manual stock tracking, threshold alert, transaction history.

---

## 3. Implementation Phases
1. **Phase 1**: Architecture + Database (Express backend, Prisma schema, migration, seed script).
2. **Phase 2**: Authentication + Roles (Owner, Staff, Kitchen roles, JWT, bcrypt).
3. **Phase 3**: Restaurant Settings & Branding Engine.
4. **Phase 4**: Categories & Menu Management CRUD.
5. **Phase 5**: Table Management.
6. **Phase 6**: High-speed POS / Order Entry terminal.
7. **Phase 7**: Kitchen Display System (KDS).
8. **Phase 8 & 9**: Billing, Payment Settlement & Printable Invoices.
9. **Phase 10**: Inventory & Low-stock Alerts.
10. **Phase 11**: Real Sales Analytics & Reporting.
11. **Phase 12**: Public Branded Customer Menu (`/menu`).
12. **Phase 13**: End-to-End Testing & Verification.
13. **Phase 14 & 15**: UI Polish, Readme, and Production Verification.
