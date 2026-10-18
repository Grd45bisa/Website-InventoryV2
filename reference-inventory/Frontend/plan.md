# Docuflow Nemo - Frontend New Implementation Plan (`plan.md`)

This document outlines the technical architecture, project setup, state management, translation setup, and API integration strategy for the new lightweight frontend.

---

## 🛠️ Technical Stack

- **Build Tool:** Vite (Ultra-fast startup and bundling, minimal overhead)
- **Framework:** React 18+ (Functional components, lightweight React hooks)
- **Routing:** React Router DOM (Declarative client-side routing)
- **State Management:** Zustand (Optional, extremely lightweight, no unnecessary render triggers) or native React Context
- **Styling:** Vanilla CSS (CSS variables, CSS Modules or modular structure, zero Tailwind dependencies)
- **HTTP Client:** Native `fetch` API wrapped in a clean, retry-enabled helper function

---

## 🗄️ Backend-Driven State & Configuration

To completely eliminate local clutter and keep the frontend lightweight, we implement a **Backend-Driven Preference Sync** pattern:

1. **User Preferences (Language & Theme):**
   - Active language (`id` or `en`) and theme (`light` or `dark`) are attributes inside the User Profile (`profiles` table on the database).
   - Upon initial dashboard load, the client queries `/api/auth/me` to retrieve the current profile settings.
   - When the user changes settings, the client performs a `PATCH` request to `/api/auth/profile` to update the profile on the server.
   - Fallback during unauthenticated states: Stored strictly in memory (React Context state) and initialized based on browser default properties (`navigator.language` and `prefers-color-scheme`).

2. **Session / Authentication Token:**
   - Instead of storing credentials locally, the app uses standard HttpOnly cookies managed by the backend to handle access and refresh tokens.
   - If HttpOnly cookies are not fully supported by the existing API, store the active JWT strictly in memory (`sessionState`) and use silent token refresh flows, keeping storage entirely clean.

---

## 🌐 Translation (Indonesian & English)

We use a simple dictionary-based translation system inside a lightweight React Context Provider (`AppContext.jsx`):

### 1. Dictionary Structure (`src/utils/translations.js`)
```javascript
export const translations = {
  en: {
    dashboard: {
      title: "DocuFlow Dashboard",
      welcome: "Welcome back",
      activeDocuments: "Active Documents",
      recentActivity: "Recent Activity",
    },
    common: {
      save: "Save",
      cancel: "Cancel",
      language: "Language",
      theme: "Theme",
    }
  },
  id: {
    dashboard: {
      title: "Dasbor DocuFlow",
      welcome: "Selamat datang kembali",
      activeDocuments: "Dokumen Aktif",
      recentActivity: "Aktivitas Terbaru",
    },
    common: {
      save: "Simpan",
      cancel: "Batal",
      language: "Bahasa",
      theme: "Tema",
    }
  }
};
```

### 2. Translation Hook usage
Components translate dynamically using a lightweight hook:
```javascript
import { useApp } from '../context/AppContext';

const MyComponent = () => {
  const { t } = useApp();
  return <h1>{t('dashboard.title')}</h1>;
};
```

---

## 🌓 Dark/Light Mode Application

- The app reads the active theme (`light` or `dark`) from the profile backend.
- The `AppContext` applies the theme class to the document root:
  ```javascript
  document.documentElement.className = theme === 'dark' ? 'theme-dark' : 'theme-light';
  ```
- CSS styling is automatically adapted through selectors referring to variables (e.g., `var(--background)`, `var(--text-color)`).

---

## 📡 API Integration Strategy & Routing Guide

The new frontend connects to the existing Express backend (running on `http://localhost:4000` by default in development, configured via `PORT` and `SUPABASE_URL` on the server). All requests must pass authentication headers (JWT Bearer Token or cookie credentials) to routes requiring auth.

### 1. Authentication Endpoints (`/api/auth`)

*   **Sign In:** `POST /api/auth/sign-in`
    *   *Payload:* `{ email: "user@example.com", password: "password123" }`
    *   *Response:* Returns `{ user, session }` where `session` contains `accessToken`, `refreshToken`, and expiration info.
*   **Refresh Session:** `POST /api/auth/refresh`
    *   *Payload:* `{ refreshToken: "..." }`
    *   *Response:* Returns a fresh `accessToken` and `refreshToken` payload.
*   **Sign Out:** `POST /api/auth/sign-out`
    *   *Headers:* `Authorization: Bearer <token>`
    *   *Response:* Status `204 No Content`.
*   **Current User Info:** `GET /api/auth/me`
    *   *Headers:* `Authorization: Bearer <token>`
    *   *Response:* Returns user profile, status, role, and workspace owner IDs.
*   **Update Profile & Settings:** `PATCH /api/auth/profile`
    *   *Headers:* `Authorization: Bearer <token>`
    *   *Payload (optional fields):* `{ fullName, email, phone, password }`
    *   *Response:* Returns the updated user profile model. Perfect for syncing dynamic settings.
*   **Create Member Account:** `POST /api/auth/accounts`
    *   *Headers:* `Authorization: Bearer <token>`
    *   *Payload:* `{ fullName, email, phone, role, password }`
    *   *Response:* Status `201 Created` with the new user profile details.

### 2. Workspace Endpoints (`/api/workspace`)

All routes require authentication and tenant loading via `loadTenant` middleware.

*   **Products (CRUD):**
    *   *Route:* `/api/workspace/products`
    *   *Methods:*
        *   `GET /`: List all products (supports paging: `search`, `limit`, `offset`, `category`, `status`).
        *   `POST /`: Add a product. Payload: `{ sku, name, category, stock, unitCost, sellingPrice, discountType, discountValue, status, metadata }`.
        *   `GET /:id`: Retrieve a single product.
        *   `PATCH /:id`: Update product details.
        *   `DELETE /:id`: Remove a product.
*   **Product Serials (CRUD):**
    *   *Route:* `/api/workspace/product-serials`
    *   *Methods:*
        *   `GET /`, `POST /`, `GET /:id`, `PATCH /:id`, `DELETE /:id`
        *   *POST Payload:* `{ productId, serialNumber, status, goodsInDocumentId, goodsInItemId, goodsOutDocumentId, goodsOutItemId, metadata }`.
*   **Contacts (CRUD):**
    *   *Route:* `/api/workspace/contacts`
    *   *Methods:*
        *   `GET /`, `POST /`, `GET /:id`, `PATCH /:id`, `DELETE /:id`
        *   *POST Payload:* `{ type, name, email, phone, address, city, province, status, metadata }`.
*   **Templates (CRUD):**
    *   *Route:* `/api/workspace/templates`
    *   *Methods:*
        *   `GET /`, `POST /`, `GET /:id`, `PATCH /:id`, `DELETE /:id`
        *   *POST Payload:* `{ name, category, status, isDefault, isCustom, orientation, paperSize, layout }`.
*   **Documents (Invoices, Goods In, Goods Out):**
    *   *Route:* `/api/workspace/documents`
    *   *Methods:*
        *   `GET /`: List workspace documents (filtered by types, search query, status).
        *   `GET /:id`: Detail view of a document.
        *   `POST /`: Create a new transaction document (e.g. `WH/IN/` reference transactions).
            *   *Payload:* `{ documentType: 'goods_in' | 'goods_out' | 'invoice', documentNumber, contactId, contactName, status, items: [{ productId, itemName, sku, quantity, unitPrice, amount, metadata }] }`.
        *   `PATCH /:id`: Modify document info.
        *   `DELETE /:id`: Cancel/delete document.
*   **Inventory Reports & Metrics:**
    *   `GET /api/workspace/inventory/summary`: Returns overview stock values, counts, and item values.
    *   `GET /api/workspace/inventory/low-stock`: Lists items falling below normal thresholds.
    *   `GET /api/workspace/inventory/movements`: Historical records of stock adjustments.
*   **System Settings:**
    *   `GET /api/workspace/settings`: Load workspace-wide metadata configurations.
    *   `PATCH /api/workspace/settings/:key`: Dynamic settings patch.

