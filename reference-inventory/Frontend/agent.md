# DocuFlow Nemo - Frontend New Developer & Agent Guidelines

This document establishes the architecture, code rules, styling standards, and implementation checklists for `frontend-new` - the official, simplified, and lightweight replacement of the legacy `frontend` folder. All future development, bug fixes, and feature migrations must adhere strictly to these guidelines.

---

## 🎯 Scope & Core Philosophy

The legacy `frontend` directory is deprecated due to bloated UI libraries, redundant workflows, and overly complex layout structures. The new frontend (`frontend-new`) prioritizes:

1. **Simplicity & Zero Bloat**
   - **No Tailwind CSS, PostCSS, or heavy CSS frameworks.** Use only Vanilla CSS utilizing design tokens via CSS variables.
   - **No bloated UI libraries (e.g., Material UI, Bootstrap, Chakra UI).** Build custom, pure visual components in `src/components`.
   - Keep styling local. Pair JSX files with adjacent `.css` files (e.g., `Button.jsx` imports `Button.css`).

2. **Clean State Management (No Local Storage Clutter)**
   - **Do not** write transient states (e.g., in-progress forms, search inputs, active table filters) to `localStorage` or `sessionStorage`.
   - Keep layout and navigation states strictly in-memory (using React State, Context, or Zustand).
   - Core preferences (language: `id`/`en` and color theme: `light`/`dark`) must sync with the backend database profile (`PATCH /api/auth/profile`) so preferences persist across devices without local caches.

3. **Multi-Language by Default**
   - Hardcoded strings in JSX/HTML are **strictly forbidden**.
   - Every label, placeholder, error message, or tooltip must use namespaced dictionary translations loaded from `src/utils/translations` via `useApp().t('namespace.key')`.

4. **Re-use Existing Backend (Do Not Modify or Create New Backend)**
   - The backend service (`backend` directory) must be reused exactly as-is.
   - Do not create a new backend, redesign endpoints, or add custom backend layers.
   - All network integrations in `frontend-new` must connect directly to the existing API endpoints (e.g., `/api/workspace/*` and `/api/auth/*`).
   - If the frontend requires structural checks (such as serial validity or stock limits), perform them client-side utilizing the data fetched from the existing backend.

---

## ⚡ Instant UI Updates & Caching Architecture

To prevent cache-heavy sluggishness while maintaining immediate UI feedback, we implement strict React Query cache management.

### Query Keys Map
Use these standard query keys with `@tanstack/react-query`:
- `['products']` - List of all products.
- `['product-serials']` - List of all tracked serial numbers.
- `['goods-in']` - List of goods-in transactions.
- `['goods-out']` - List of goods-out transactions.

### Synchronous Cache Invalidation Rules

To ensure items and transactions appear in the UI immediately upon creation without duplicate loads or cache latency:

1. **Creating a Product**
   - Perform the `POST /api/workspace/products` request.
   - Upon success, immediately call `queryClient.invalidateQueries({ queryKey: ['products'] })`.

2. **Submitting Goods In (Inbound Stock)**
   - Perform the `POST /api/workspace/documents` transaction.
   - On success:
     - Optimistically prepend the new transaction document into the `['goods-in']` cached array.
     - Invalidate `['products']` to force immediate recalculation of stock quantities.
     - Invalidate `['product-serials']` to immediately display newly added serial tracking numbers.

3. **Submitting Goods Out (Outbound Stock)**
   - Perform the `POST /api/workspace/documents` transaction.
   - On success:
     - Optimistically prepend the new transaction document into the `['goods-out']` cached array.
     - Invalidate `['products']` to force immediate deduction of product stock quantities in the dashboard.
     - Invalidate `['product-serials']` to immediately update serial number status to 'sold' / 'unavailable'.

---

## 📦 Transaction & Form Logic

Every transaction page (Goods In and Goods Out) must follow a predictable, highly operational worksheet layout.

### 1. Document Reference Formats
Reference sequences must be unique, auto-generated, and reset monthly:

*   **Goods In Format:** `WH/IN/YYYYMMDD/000X` (e.g., `WH/IN/20260617/0001`)
*   **Goods Out Format:** `WH/OUT/YYYYMMDD/000X` (e.g., `WH/OUT/20260617/0001`)

**Sequence Reset Rule:** The 4-digit sequence resets back to `0001` at the start of every calendar month, while still including the full creation date in the visible string.

### 2. Product Selector & Inline Creation
*   Dropdown input must support rapid lookup by **Product Name** or **SKU**.
*   If a product does not exist, the user must be allowed to create it **directly inside the transaction flow** without leaving the page.
*   The inline creation form must collect:
    - **Product Name**
    - **SKU** (Strictly required for inline registration)
    - Keep other fields defaulted (`stock: 0`, `unitCost: 0`, `sellingPrice: 0`, `discountType: 'none'`, `discountValue: 0`).

### 3. Serial Tracking Toggle Behavior
Every line item row in a transaction repeater has a strict mutual-exclusion toggle between bulk quantity and individual serial number tracking:

*   **Serial Mode OFF:**
    - Quantity input is editable and must be a valid integer `val >= 1`.
    - Serial number input field is hidden.
*   **Serial Mode ON:**
    - Quantity is hardcoded and locked to `1` (one row = one serial number).
    - Serial number input field is visible and strictly required.
    - If a user needs to receive/dispatch multiple serial-tracked items of the same product, they **must** add them as separate rows. Do not implement bulk serial list paste at this stage.

---

## 📱 Universal Responsiveness Checklist

All page designs must feel premium and adapt perfectly to different viewports.

| Breakpoint | Target Width | Layout Behavior |
| :--- | :--- | :--- |
| **Desktop** | `>= 993px` | Dense data tables, sidebars open, grid alignments. |
| **Tablet** | `577px - 992px` | Collapsed filters, drawer sidebar panels, compact cards. |
| **Mobile** | `<= 576px` | Full width stacked inputs, tables forced into card lists. |

### Visual Checklist:
- [ ] No horizontal scrollbars are allowed at a viewport width of `375px`.
- [ ] In mobile view, inputs (`<input>`, `<select>`, `<textarea>`) must span `width: 100%` and stack vertically.
- [ ] All table lists (Products, Goods In, Goods Out) must automatically switch to responsive stacked card lists (such as `ProductCard` and `GoodsInList` card grids) when view width drops below `576px`.
- [ ] Focus outlines (`:focus-visible`) must use `var(--color-border-focus)` for clear keyboard accessibility.

---

## 🗺️ Future Migrations Roadmap

When porting legacy pages from `/frontend` to `/frontend-new`, follow this blueprint:

1. **Goods Out Page (`/inventory/goods-out`)**
   - **Target:** Create `src/pages/GoodsOut` replicating the clean worksheet pattern of `GoodsInPage`.
   - **Logic:** Validate that outbound quantities do not exceed available stock. Validate serial numbers exist and are marked `available` in the database.
   - **Cache:** Optimistically insert to `['goods-out']` and invalidate `['products']`, `['product-serials']` on submit.

2. **Documents Page (`/documents`)**
   - **Target:** Rebuild as a simple centralized transaction log.
   - Filter by document type (`invoice`, `goods_in`, `goods_out`) using simple URL search parameters instead of bloated local states.

3. **Settings Page (`/settings`)**
   - **Target:** Minimalist card layout using standard forms.
   - Sync details via `PATCH /api/auth/profile` and immediately update the global AppContext session state.
