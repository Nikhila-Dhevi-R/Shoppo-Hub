# ShopHub Browser-Only Storefront Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Implement this plan task-by-task in the current checkout; do not use subagents.

**Goal:** Convert ShopHub into a static GitHub Pages storefront with browser-only demo accounts, checkout, and order history.

**Architecture:** A small browser storage service will own local profiles, active profile state, and per-profile order snapshots. Existing HTML/CSS and product/cart code stay in the static app; account and order flows stop calling Flask. GitHub Actions will assemble and publish only the customer storefront files to Pages.

**Tech Stack:** HTML, CSS, vanilla browser JavaScript, Web Crypto API, localStorage/sessionStorage, Node.js 24 built-in test runner and local static preview utility, GitHub Actions Pages artifacts.

**Spec:** `docs/superpowers/specs/2026-10-13-shophub-browser-only-design.md`

## Global Constraints

- Browser-side accounts and orders are demo data local to one browser profile; do not claim server-backed identity or order acceptance.
- Never persist plaintext passwords; use Web Crypto PBKDF2-SHA-256 with a unique random salt.
- Never show order success before order storage succeeds; preserve cart and checkout fields on storage errors.
- Keep the existing product catalog, INR prices, image assets, warm visual design, cart, and wishlist.
- Preserve the ignored local `server/shophub.sqlite3` file unchanged; never stage or publish it.
- Do not add an account, database, or order API to the GitHub Pages artifact.
- Use only Node built-ins for tests and the local static preview; no new package dependencies.

## Review Focus

- Malformed or blocked browser storage: show a recoverable inline error and never report a saved order; test parse and write failures.
- Email normalization and duplicate profiles: trim/lowercase email and reject duplicates without creating a session; test duplicate and case variants.
- Invalid credentials or unavailable Web Crypto: show a clear form error and never save a plaintext password or sign in; test wrong passwords and missing crypto.
- Unknown product IDs or invalid quantities: reject the order without clearing the cart; test malformed, unknown, zero, and over-limit quantities.
- Checkout retries and profile isolation: replay the same attempt only for the same payload, reject changed payloads, and keep histories separate; test both cases.

---

### Task 1: Implement and test browser-local account and order storage

**Files:**
- Create: `js/shop-store.js`
- Create: `tests/shop-store.test.cjs`

**Interfaces:**
- `createShopStore({ storage, crypto })` returns `register({name, email, password})`, `login({email, password})`, `currentUser()`, `logout()`, `listOrders()`, and `placeOrder({items, delivery, attemptKey}, products)`.
- `register` and `login` return safe profile fields only (`id`, `name`, `email`). `placeOrder` returns `{reference, created_at, total, items}` and stores delivery details privately in the local order record.
- Expose the factory through CommonJS for Node tests and instantiate `window.shopStore` in browser pages.

- [ ] **Step 1: Write failing storage-service tests**

Add Node built-in tests named `normalizesEmailAndStoresOnlySaltedPasswordHash`, `rejectsDuplicateEmailAndWrongPassword`, `failsSafelyWithoutWebCryptoOrStorage`, `handlesMalformedStoredJsonWithoutErasingData`, `isolatesOrdersAndSnapshotsCatalogPrices`, `replaysMatchingAttemptAndRejectsChangedPayload`, and `rejectsMalformedCartItemsWithoutSaving` using injected fake storage and `node:crypto` Web Crypto.

- [ ] **Step 2: Run tests to confirm the service is missing**

Run: `node --test tests/shop-store.test.cjs`
Expected: FAIL because `js/shop-store.js` and its exported factory do not exist.

- [ ] **Step 3: Implement the storage service**

Implement namespaced/versioned records, normalized emails, salted PBKDF2-SHA-256 hashes, active local profile state, safe JSON reads, order validation and catalog-based totals, per-profile order lists, and attempt-key idempotency. Convert storage and Web Crypto failures to typed errors without clearing existing data.

- [ ] **Step 4: Run the storage-service tests**

Run: `node --test tests/shop-store.test.cjs`
Expected: all seven tests pass.

- [ ] **Step 5: Commit the storage service**

```powershell
git add js/shop-store.js tests/shop-store.test.cjs
git commit -m "feat: add browser-local ShopHub accounts and orders"
```

### Task 2: Connect sign-up, login, navigation, and profile pages

**Files:**
- Modify: `js/auth.js`
- Modify: `js/navbar.js`
- Modify: `js/profile.js`
- Modify: `login.html`, `signup.html`, `profile.html`
- Modify: `about.html`, `contact.html`, `cart.html`, `index.html`, `products.html`, `wishlist.html`, `checkout.html`, `orders.html` to load `js/shop-store.js` and remove `js/api.js`.

**Interfaces:**
- Consume `window.shopStore.register`, `login`, `currentUser`, and `logout` from Task 1.
- Existing links may return to only `checkout.html`, `orders.html`, or `profile.html` after login.

- [ ] **Step 1: Update form and navigation flows to use the local store**

Wire sign-up/login to the store service, keep inline live-region messages and disabled-button behavior, refresh the navbar from `currentUser()`, and gate profile access locally. Add concise demo-data notices to sign-up, login, and checkout pages; advise against real passwords and delivery details. Scope the checkout draft to the signed-in profile so browser users do not see one another's delivery fields.

- [ ] **Step 2: Add manual browser checks for the changed flows**

Using the local static preview, verify a new profile can be created, duplicate email is rejected case-insensitively, login and logout update the navbar, invalid credentials stay on the login page, and protected profile navigation returns to login when signed out.

- [ ] **Step 3: Commit the account and profile flow**

```powershell
git add js/auth.js js/navbar.js js/profile.js login.html signup.html profile.html about.html contact.html cart.html index.html products.html wishlist.html checkout.html orders.html
git commit -m "feat: use local profiles across ShopHub pages"
```

### Task 3: Save checkout orders and render local order history

**Files:**
- Modify: `js/checkout.js`
- Modify: `js/orders.js`

**Interfaces:**
- Consume `window.shopStore.currentUser`, `placeOrder`, and `listOrders` plus `window.shopCatalog` from `js/catalog.js`.
- Keep the current order confirmation markup, reference/total fields, delivery draft, checkout-step focus behavior, and explicit new-attempt control.

- [ ] **Step 1: Run the order-service tests before changing the page wiring**

Run `node --test tests/shop-store.test.cjs` and confirm the Task 1 assertions pass for empty carts, unknown product IDs, invalid quantities, price snapshots, matching retry replay, changed-payload conflicts, profile isolation, and storage write failure. These tests define the order-store behavior that the page wiring will consume.

- [ ] **Step 2: Wire checkout and order history to local storage**

Remove `/api/auth/me` and `/api/orders` calls. Require a current local profile before checkout, call `placeOrder` on submit, clear the cart only after a successful write, preserve form/cart on errors, and render only the active profile's order snapshots. Do not render delivery details in order history.

- [ ] **Step 3: Run the storage and order tests**

Run: `node --test tests/shop-store.test.cjs`
Expected: all account, order, error, and isolation assertions pass.

- [ ] **Step 4: Verify checkout in the browser**

Place a test order using fake delivery information, verify confirmation follows storage, verify one history entry appears, retry the same attempt without duplication, verify a second local profile cannot see the first profile's order, and verify a storage error preserves the cart and form.

- [ ] **Step 5: Commit the local checkout and history flow**

```powershell
git add js/checkout.js js/orders.js
git commit -m "feat: save ShopHub checkout orders in the browser"
```

### Task 4: Remove backend deployment and prepare the static Pages artifact

**Files:**
- Create: `scripts/build-pages.mjs`
- Create: `scripts/serve-static.mjs`
- Create: `tests/build-pages.test.cjs`
- Create: `.github/workflows/pages.yml`
- Modify: `README.md`, `.gitignore`
- Delete tracked runtime files: `server/__init__.py`, `server/app.py`, `server/auth.py`, `server/catalog.py`, `server/db.py`, `server/orders.py`, `server/requirements.txt`, `render.yaml`, `js/api.js`
- Preserve without reading or staging: ignored `server/shophub.sqlite3`

**Interfaces:**
- `buildPages(sourceDir, outputDir)` in `scripts/build-pages.mjs` creates `_site/` containing root customer HTML files plus `css/`, `images/`, and `js/`; it excludes `server/`, `admin/`, `docs/`, and local databases. The CLI entry runs `buildPages` for the repository root and `_site/`.
- `node scripts/serve-static.mjs` serves only that generated `_site/` on `http://127.0.0.1:8000` for local browser checks; it implements no application API.
- GitHub Actions builds/tests on pushes to `main` and manual workflow dispatch, then a dependent deploy job publishes `_site/` to the `github-pages` environment.

- [ ] **Step 1: Write static-build selection checks**

Add `tests/build-pages.test.cjs` with built-in Node tests for the artifact builder so it includes all customer pages and required assets while excluding `server`, `admin`, `docs`, `.venv`, and `*.sqlite3`. Run the test and confirm it fails before the builder exists.

- [ ] **Step 2: Implement the static artifact builder and local preview server**

Create a deterministic `_site/` from the allowlisted storefront HTML and asset directories. Serve only files under `_site/`, reject traversal paths and non-GET requests, and provide correct MIME types for HTML, CSS, JS, images, and WebP.

- [ ] **Step 3: Add the GitHub Pages workflow**

Create a `build` job with `contents: read`, `actions/checkout@v7`, `actions/setup-node@v7` with Node 24, `actions/configure-pages@v6`, the Node test suite, the static build command, and `actions/upload-pages-artifact@v5`. Create a dependent `deploy` job with `needs: build`, `pages: write`, `id-token: write`, the `github-pages` environment, and `actions/deploy-pages@v5`; expose the deployment URL as the environment URL. Trigger on pushes to `main` and `workflow_dispatch`.

- [ ] **Step 4: Remove Flask references and document the static app**

Remove the listed tracked backend source and Render Blueprint. Keep the ignored local database file intact. Update `.gitignore` for `_site/` and local SQLite files. Rewrite README setup/deploy instructions for the browser-only demo, its data/security limitations, `node --test`, and the dependency-free local preview command.

- [ ] **Step 5: Verify the generated artifact and static routes**

Run: `node scripts/build-pages.mjs`
Run: `node --test tests/shop-store.test.cjs tests/build-pages.test.cjs`
Expected: only storefront files are present in `_site/`, and all tests pass.

Run: `node scripts/serve-static.mjs` and open `http://127.0.0.1:8000`; verify pages, styles, scripts, and product images return successfully.

- [ ] **Step 6: Commit static deployment support**

```powershell
git add .github/workflows/pages.yml scripts tests README.md .gitignore
git add -u
git commit -m "feat: publish ShopHub as a static Pages site"
```

### Task 5: Push to Shoppo-Hub and verify the live GitHub Pages site

**Files:**
- No new source files; publish the commits from Tasks 1-4 to the existing `target` remote only.

**Interfaces:**
- GitHub repository: `Nikhila-Dhevi-R/Shoppo-Hub`, branch `main`.
- Expected project site: `https://nikhila-dhevi-r.github.io/Shoppo-Hub/`.

- [ ] **Step 1: Run final local verification**

Run `node --test tests/shop-store.test.cjs tests/build-pages.test.cjs`, build `_site/`, check for remaining storefront `/api/` references and Flask/Render instructions, and run `git diff --check`. Confirm `server/shophub.sqlite3` remains ignored and unstaged.

- [ ] **Step 2: Push only to the requested GitHub repository**

Run `git push target main`. Verify `git ls-remote target refs/heads/main` matches the pushed commit. Do not push to `origin`, which points to a different repository.

- [ ] **Step 3: Enable Pages and verify deployment**

Set the repository Pages source to GitHub Actions if it is not already enabled. Wait for the Pages workflow to succeed, then verify the live home, products, login, checkout, and order-history pages. Complete a browser-only flow with synthetic profile and delivery data, and remove that temporary local test profile afterward.

- [ ] **Step 4: Report the live URL and limitations**

State the verified Pages URL, the successful workflow and local test commands, and that account/order data stays in each browser and does not migrate from SQLite.
