# ShopHub Glass Storefront Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh ShopHub with a responsive peach/yellow/orange glass UI, replace the Node server with Flask and SQLite, and support account-backed order checkout and history.

**Architecture:** Flask serves the existing static site and same-origin JSON APIs. SQLite persists password hashes, expiring sessions, and orders with trusted server-calculated totals. Vanilla JavaScript continues to own product browsing, cart, wishlist, and presentation.

**Tech Stack:** Python 3.14, Flask, SQLite, HTML, CSS, vanilla JavaScript.

**Spec:** `docs/superpowers/specs/2026-10-13-shophub-glass-storefront-design.md`

## Global Constraints

- Preserve the four existing products and INR prices; the backend is authoritative when saving orders.
- Do not store passwords in browser storage or in plaintext.
- Require login to place orders; allow browsing and cart building before login.
- Store local database files outside version control; never serve files under `server/` as static content.
- Keep checkout to name, address, and phone; confirm only after successful SQLite commit.
- Use the peach/cream and yellow/orange theme, deep-brown readable text, responsive glass panels, subtle motion, and `prefers-reduced-motion` support.
- Do not add or run tests or test commands unless the user asks; keep this work local and uncommitted.

## Review Focus

- Expired session during checkout: preserve delivery fields and cart, then return to checkout after login. Pin in Task 6 with a source review of the redirect and retry state.
- Empty cart or unknown product during order submission: reject without clearing cart or confirming. Pin in Task 3 with explicit validation and a source review of the error path.
- Client-edited price or quantity: calculate only from server catalog and enforce quantity 1–99. Pin in Task 3 by ensuring the order route ignores client prices.
- Duplicate email or invalid login: show an inline message; keep login's invalid-credentials response generic. Pin in Task 2 with explicit response behavior and a source review of the frontend message path.
- Small screens or reduced-motion preference: retain readable controls and suppress nonessential motion. Pin in Task 5 with responsive and media-query rules.

---

### Task 1: Replace the Node server shell with Flask static hosting

**Files:**
- Create: `server/__init__.py`
- Create: `server/app.py`
- Create: `server/requirements.txt`
- Modify: `.gitignore`
- Modify: `README.md`
- Delete: `server/server.js`
- Delete: `server/package.json`
- Delete: `server/package-lock.json`

**Interfaces:**
- Produces: `create_app(config: dict | None = None) -> Flask`, package entry point `python -m server.app`, and `GET /api/health -> {"success": true, "message": "ShopHub Backend Running"}`.
- Produces: same-origin delivery of customer HTML, CSS, JavaScript, and image assets without allowing static access to `server/`, `.git/`, hidden files, or database files.

- [x] **Step 1: Add Flask package and application factory**

Create `server/requirements.txt` with `Flask>=3.1,<4.0`. In `server/app.py`, define `create_app(config=None)`, default the database path to `server/shophub.sqlite3`, register the health route, and run the package entry point on `127.0.0.1:5000` with debug disabled.

- [x] **Step 2: Add safe static serving**

Serve `/` as root `index.html`; serve only `.html`, `.css`, `.js`, `.png`, `.jpg`, `.jpeg`, `.webp`, `.svg`, and `.ico` assets from the repository root. Reject paths containing `server`, `.git`, or hidden segments. Use Flask's safe `send_from_directory` helper.

- [x] **Step 3: Remove the Node backend and document local startup**

Delete the three Node backend files. Ignore `server/*.sqlite3`, `__pycache__/`, and `*.py[cod]`. Update README with `py -3 -m venv .venv`, `.\.venv\Scripts\Activate.ps1`, `pip install -r server/requirements.txt`, and `python -m server.app` startup instructions.

- [x] **Step 4: Review the declared runtime paths and files**

Read the application factory, static route, ignore rules, and README commands together; ensure each documented path matches the generated database and package layout.

### Task 2: Persist accounts and implement session APIs

**Files:**
- Create: `server/db.py`
- Create: `server/auth.py`
- Modify: `server/app.py`

**Interfaces:**
- Consumes: `create_app` and `DATABASE` configuration from Task 1.
- Produces: `init_db()`, `get_db()`, `current_user() -> dict | None`, and `login_required` for the order blueprint.
- Produces: `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, and `POST /api/auth/logout`.

- [x] **Step 1: Create SQLite schema and connection helpers**

In `server/db.py`, create `users` and `sessions` tables with idempotent initialization, `sqlite3.Row`, foreign keys, normalized unique email, password hash, SHA-256 session-token hash, and session expiration/creation timestamps. Store the file at the configured `server/shophub.sqlite3` path and call `init_db()` during application startup.

- [x] **Step 2: Implement registration and password verification**

In `server/auth.py`, implement a Flask blueprint. Trim name/email, lowercase email, enforce email shape and eight-character minimum password, hash with `werkzeug.security`, return `400` for malformed input and `409` for duplicate email, and return `201` after creation. Never accept or return a browser-stored password.

- [x] **Step 3: Implement expiring cookie sessions**

Use a cryptographically random token; store only its SHA-256 hash. On login, verify the stored password hash and set `shophub_session` with `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Max-Age=604800`. Resolve and expire sessions through `current_user`; clear the database session and cookie on logout. Return safe `id`, `name`, and `email` from `/api/auth/me`.

- [x] **Step 4: Register the auth blueprint and review failure responses**

Register the blueprint from `create_app`. Ensure invalid login always returns the same `401` message, duplicate registration returns `409`, and unauthenticated `/api/auth/me` returns `401` JSON.

### Task 3: Save trusted orders and expose order history

**Files:**
- Create: `server/catalog.py`
- Create: `server/orders.py`
- Modify: `server/db.py`
- Modify: `server/app.py`

**Interfaces:**
- Consumes: `get_db`, `current_user`, and `login_required` from Task 2.
- Produces: server catalog for product IDs 1–4 at INR 4999, 1999, 799, and 2999; `POST /api/orders` requiring an `Idempotency-Key` UUID header and replaying the saved order for the same user/key; `GET /api/orders`.
- Order submit payload: `{items: [{id: number, quantity: number}], delivery: {name: string, address: string, phone: string}}`.
- Order submit response: `{reference: string, total: number, created_at: string}`. History returns only the signed-in user's references, dates, item snapshots, and totals.

- [x] **Step 1: Add order schema**

Extend `init_db()` with `orders` (internal ID, unique UUID reference, user ID, delivery name/address/phone, integer INR total, creation timestamp), `order_items` (order ID, product ID/name snapshot, unit-price snapshot, quantity), and `order_submissions` (user ID, unique idempotency key, normalized request hash, order ID) with foreign keys. Add the request-hash column idempotently if a local database already has the earlier submission table, and backfill missing hashes from each saved order's normalized item and delivery snapshots. Keep incomplete legacy mappings unbound so a retry conflicts safely instead of silently creating a duplicate.

- [x] **Step 2: Define the server catalog and delivery validation**

In `server/catalog.py`, define the four existing catalog records. Validate nonempty items, known IDs, integer quantities 1–99, name length 1–120, address length 5–300, and phone with 7–15 digits allowing an optional leading `+`, spaces, parentheses, and hyphens. Ignore any price field supplied by the browser.

- [x] **Step 3: Implement transactional order creation**

In `server/orders.py`, require login, validate the UUID `Idempotency-Key`, calculate totals from `catalog.py`, generate a UUID reference, and insert the order, item snapshots, and request key plus normalized-payload hash in one SQLite transaction. Return the original saved order for matching repeated keys and `409` for a mismatched payload on an existing key. Return `400` for invalid order data, `401` for missing/expired sessions, and the saved reference/total/time only after commit.

- [x] **Step 4: Implement account-scoped order history**

Return the authenticated user's orders, ordered newest first, with `{reference, created_at, total, items: [{product_id, name, unit_price, quantity}]}`. Do not return delivery details in the history response. Ensure every query is filtered by the current user's ID.

- [x] **Step 5: Register the order blueprint and review ownership/transaction boundaries**

Register routes in `create_app`; review source paths for transaction rollback on failure, owner-filtered history, and catalog-only totals.

### Task 4: Add shared browser API, authentication flow, and storefront navigation

**Files:**
- Create: `js/api.js`
- Modify: `js/auth.js`
- Modify: `js/navbar.js`
- Modify: `js/profile.js`
- Modify: `login.html`
- Modify: `signup.html`
- Modify: `profile.html`

**Interfaces:**
- Consumes: the Flask APIs from Tasks 2–3.
- Produces: `window.shopApi.request(path, options) -> Promise<object>` that sends same-origin JSON with cookies and throws a structured API error for non-2xx responses.
- Produces: nav session refresh via `/api/auth/me`, logout via `/api/auth/logout`, and login/register form submission through the API.

- [x] **Step 1: Add the shared JSON API helper**

Implement `js/api.js` to set `Content-Type: application/json` for JSON bodies, use `credentials: "same-origin"`, parse JSON errors, and throw an error retaining HTTP status and server `error` text. Do not persist passwords or user sessions in localStorage.

- [x] **Step 2: Wire signup and login forms to Flask**

Update `js/auth.js` to submit through `shopApi.request`, render accessible inline success/error status, route successful signup to login, and route successful login to a validated local `next` value or `index.html`. Accept only `checkout.html`, `orders.html`, or `profile.html` as a return target.

- [x] **Step 3: Replace browser-local auth state in navigation and profile**

Update `js/navbar.js` to load safe current-user details, render the account menu with `textContent`, update counts from the existing local cart/wishlist keys, and call the logout API before returning to `login.html`. Update `js/profile.js` and its markup to load the profile via `/api/auth/me`, link to the implemented order history, and handle `401` by linking to login.

- [x] **Step 4: Add consistent account form markup and script ordering**

Update `login.html`, `signup.html`, and `profile.html` with labeled inputs, live status regions, the shared visual hooks, and script order `api.js`, page script, navigation where applicable.

- [x] **Step 5: Review account flows for plaintext storage and open redirects**

Search the active customer auth scripts for `registeredUser`, `currentUser`, and password writes to localStorage. Confirm no auth script writes them, and confirm login return navigation accepts only `checkout.html`, `orders.html`, or `profile.html`.

### Task 5: Build the shared warm glass design system and refresh customer pages

**Files:**
- Modify: `css/style.css`
- Modify: `css/auth.css`
- Modify: `css/profile.css`
- Modify: `index.html`
- Modify: `products.html`
- Modify: `cart.html`
- Modify: `wishlist.html`
- Modify: `about.html`
- Modify: `contact.html`
- Modify: `login.html`
- Modify: `signup.html`
- Modify: `profile.html`
- Modify: `js/navbar.js`

**Interfaces:**
- Consumes: authenticated user and cart-count state from Task 4.
- Produces: shared `#siteHeader` and `#siteFooter` shell; reusable `.glass-panel`, `.product-card`, `.button-primary`, `.section-heading`, and `.reveal` styles for customer pages.

- [x] **Step 1: Define the responsive warm theme tokens and base styles**

Replace conflicting dark-blue/gray base rules in `css/style.css` with peach/cream surfaces, deep-brown text, yellow/orange accents, shared spacing/radii/shadows, readable input styles, visible focus rings, and responsive breakpoints.

- [x] **Step 2: Add glass, transition, and motion effects**

Style translucent navigation, panels, cards, and auth surfaces with `backdrop-filter`, a subtle light border, and warm shadows. Add gentle page reveal, ambient background drift, and hover/press transitions. Add `@media (prefers-reduced-motion: reduce)` to disable nonessential animation and transition movement.

- [x] **Step 3: Add shared navigation and footer shell**

Update each customer page to provide `#siteHeader` and `#siteFooter`. Update `navbar.js` to render the same links and account/cart/wishlist counts on all customer pages, including login/logout state. Keep user-provided names assigned via `textContent`.

- [x] **Step 4: Refresh the home and informational pages**

Update `index.html` with a warm glass hero, clear Shop Now action, featured existing products, and shared shell. Remove inline blue styling in `about.html` and `contact.html`; use shared theme classes and responsive card/form layouts.

- [x] **Step 5: Review mobile, focus, contrast, and reduced-motion declarations in source**

Inspect the shared stylesheet rules to ensure narrow layouts wrap navigation and product grids, text remains deep brown on light translucent surfaces, keyboard focus remains visible, and reduced-motion overrides the motion classes.

### Task 6: Complete cart, checkout, and order-history interfaces

**Files:**
- Create: `js/checkout.js`
- Create: `js/orders.js`
- Create: `orders.html`
- Modify: `js/products.js`
- Modify: `js/cart.js`
- Modify: `js/wishlist.js`
- Modify: `products.html`
- Modify: `cart.html`
- Modify: `wishlist.html`
- Modify: `checkout.html`
- Modify: `README.md`

**Interfaces:**
- Consumes: `shopApi.request`, `#siteHeader`, and the authenticated session from Task 4; design tokens from Task 5.
- Produces: product add/remove/wishlist actions with synchronized counts; checkout POST to `/api/orders` with a stable retry key; order history GET from `/api/orders`.
- Cart storage remains an array of product IDs in localStorage; checkout submits aggregated `{id, quantity}` entries.

- [x] **Step 1: Refine product, cart, and wishlist states**

Render product cards with semantic buttons and accessible image alt text. Preserve the four existing products and prices. Make cart counts derive from the cart array; show a clear empty-cart state; keep checkout disabled or hidden until the cart has items. Keep wishlist add/move-to-cart behavior and synchronize counts after each action.

- [x] **Step 2: Build the compact delivery checkout**

Replace inline checkout JavaScript with `js/checkout.js`. Show a three-stage progress indicator, order summary, and only full name/address/phone inputs. If unauthenticated, send the user through `login.html?next=checkout.html`. On submission, aggregate duplicate IDs into quantities and POST to `/api/orders`.

- [x] **Step 3: Preserve retry state and confirm only saved orders**

Show validation/server errors in an accessible live region. Preserve checkout fields, cart, and the idempotency key after API errors. For a key/payload mismatch, offer an explicit new-order attempt that rotates the key. After a successful response, clear `cart`, update visible counts, and replace the form with a glass success panel containing the order reference, total, and link to order history.

- [x] **Step 4: Add account order-history page**

Create `orders.html` and `js/orders.js` to fetch `/api/orders`, show reference/date/items/total in responsive cards, render an empty state, and route `401` to login with a safe return value. Do not render stored delivery details.

- [x] **Step 5: Update README feature and data notes**

Document account-backed signup/login, local cart/wishlist, saved orders, required checkout login, local delivery-data storage, and no payment processing.

- [x] **Step 6: Review end-to-end source paths against acceptance criteria**

Trace signup → login → home, add-to-cart → checkout → saved order confirmation, and order history → current user's orders. Review empty cart, unknown product, expired session, failed request, mobile breakpoints, and reduced-motion handling in source without running test commands.
