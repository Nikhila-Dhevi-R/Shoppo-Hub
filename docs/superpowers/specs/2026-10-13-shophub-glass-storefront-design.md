# ShopHub Glass Storefront and Python Backend Design

## Goal

Refresh the ShopHub customer experience with a responsive peach, yellow, and orange glassmorphism theme, make the cart-to-checkout flow clear, confirm orders only after they are saved, and replace the Node.js server with a Python backend for accounts and orders.

## Context

ShopHub is a plain HTML, CSS, and vanilla JavaScript storefront. Products are currently hard-coded in several scripts. Cart and wishlist state use browser localStorage. Signup and login also use localStorage, including plaintext passwords. `server/server.js` only exposes a health response; it does not serve the site or participate in authentication or checkout. The profile menu links to an `orders.html` page that does not exist.

The reference URL could not be opened in the available viewers. The approved visual direction therefore follows the user's description: yellow and orange accents on a peach background, glass surfaces, and animation.

## Approved Design

### Customer experience

- Use a shared visual language across the home, products, cart, wishlist, checkout, login, signup, profile, about, contact, and order history pages.
- Use a warm peach and cream background, readable deep-brown text, translucent light panels with blur and fine borders, and yellow/orange accents.
- Add restrained page entrance effects, decorative ambient motion, and product-card/button hover transitions. Respect `prefers-reduced-motion` and retain visible keyboard focus.
- Keep layouts responsive and maintain strong contrast for text and form controls.
- After successful login, return the customer to the home page and show their account name and menu in the shared navigation.
- Keep the current product catalog and client-side cart/wishlist storage. At checkout, aggregate repeated cart product IDs into quantities for the order request.
- Present checkout as a compact delivery step with an order summary and only three delivery inputs: full name, address, and phone number. A successful API response replaces the form with an inline confirmation containing the order reference and total. Clear the cart only after that response succeeds.
- Visitors may browse and build a cart. Require an authenticated account to submit an order; redirect to login and return to checkout afterward.
- Add an order history page backed by the current account's saved orders.
- Do not add payment processing.

### Backend and persistence

- Use Flask with SQLite. Serve the storefront and JSON API from one origin so the browser does not need CORS.
- Store data in a generated local SQLite database under `server/`; ignore the database and Python cache files in Git.
- Persist users, sessions, orders, order-item snapshots, and per-account order-submission keys. Store password hashes rather than plaintext passwords. Issue cryptographically random session tokens in HTTP-only, same-site cookies and store SHA-256 token hashes in SQLite. Expire sessions after seven days, set a seven-day cookie lifetime, and remove sessions on logout.
- Trim and lowercase email addresses for uniqueness. Require a valid email shape and a minimum eight-character password on registration.
- Keep the storefront catalog mirrored by the server so order validation and price calculation remain authoritative:

  | ID | Product | Price (INR) |
  | --- | --- | ---: |
  | 1 | Smart Watch | 4999 |
  | 2 | Headphones | 1999 |
  | 3 | T Shirt | 799 |
  | 4 | Shoes | 2999 |
  | 5 | Original Graphic Tee | 999 |
  | 6 | Imagine Peace Oversized Tee | 1199 |
  | 7 | Circuit Warrior Tee | 1299 |
  | 8 | Vintage Slogan Tee | 899 |
  | 9 | Court Street Sneakers | 2499 |
  | 10 | Sand and Maroon Sneakers | 3299 |
  | 11 | Glossy Gray Loafers | 2199 |
  | 12 | Black TWS Earbuds | 1799 |
  | 13 | Blue TWS Earbuds | 2499 |
  | 14 | Clear Wired IEM Earphones | 1499 |
  | 15 | Everyday Wired Earphones | 499 |
  | 16 | Neon Red Gaming Mouse | 899 |
  | 17 | Cloud White Wireless Mouse | 699 |
  | 18 | RGB Gaming Mouse | 1499 |
  | 19 | Anime Wireless Mouse | 1199 |

- The browser submits product IDs and quantities, not trusted prices. The backend rejects an empty cart, unknown product IDs, quantities outside 1–99, invalid delivery fields, unauthenticated requests, and malformed JSON. Delivery name must be 1–120 characters, address 5–300 characters, and phone must contain 7–15 digits with optional leading `+`, spaces, parentheses, or hyphens. The backend calculates the total from its catalog and stores a snapshot of each product name, unit price, and quantity with the delivery details.
- Return the saved order reference and calculated total. The frontend shows success and removes local cart data only after the API succeeds. On failure, show an inline message and preserve the form and cart for retry.
- The account order-history API returns only orders owned by the authenticated user.
- Include health, register, login, current-user, logout, create-order, and list-orders endpoints.
- Keep the SQLite file local and document that it contains account and delivery data. This is a local demo backend; payment handling and production hosting configuration are outside this design.

### Local operation

- Add a Python requirements file for Flask and document a PowerShell workflow to create a virtual environment, install the requirements, and start the server at `http://127.0.0.1:5000`.
- Remove `server/server.js` and the Node-only `server/package.json` and lockfile. Keep the frontend's vanilla JavaScript files.
- Serve only storefront assets through Flask; do not expose the `server/` source or database as static files.

## API Contract

- `GET /api/health` returns a small success response.
- `POST /api/auth/register` accepts `{name, email, password}` and creates a user. Duplicate email returns `409`; successful registration returns `201` and the frontend proceeds to login.
- `POST /api/auth/login` accepts `{email, password}` and sets a seven-day session cookie. Invalid credentials return `401` with a generic message.
- `GET /api/auth/me` returns the current user's safe profile fields (`id`, `name`, `email`) or `401`.
- `POST /api/auth/logout` invalidates the current session and clears its cookie.
- `POST /api/orders` requires a current session and an `Idempotency-Key` UUID header; it accepts `{items: [{id, quantity}], delivery: {name, address, phone}}`. The backend calculates prices and returns `{reference, total, created_at}` for the saved order. Repeating the same key and normalized payload for the same account returns that saved order instead of creating a duplicate; reusing a key with different details returns `409`.
- `GET /api/orders` requires a current session and returns only that user's order references, dates, line items, and totals; it does not return stored delivery details.
- Validation errors return `400`, unauthenticated requests return `401`, and duplicate email or mismatched idempotency-key reuse returns `409`. Errors use JSON with a stable `error` message so the frontend can provide inline feedback.

## Data Model

- `users`: ID, display name, normalized unique email, password hash, creation time.
- `sessions`: ID, user ID, hashed random token, expiration time, creation time.
- `orders`: internal ID, unique public reference, user ID, delivery name/address/phone, calculated total, creation time.
- `order_items`: ID, order ID, product ID, product name and unit-price snapshots, quantity.
- `order_submissions`: user ID, UUID idempotency key, normalized request fingerprint, saved order ID, submission time.

Create tables on application startup with idempotent schema initialization. When upgrading an existing `order_submissions` table, backfill missing request fingerprints from the saved order's normalized item and delivery snapshots; leave incomplete legacy records unbound so they return a conflict instead of silently creating a duplicate. Generate public order references with UUIDs. Use SQLite transactions when saving an order and its line items.

## Error and Session Behavior

- Registration displays duplicate-email and validation errors next to the form. Login displays a generic invalid-credentials message.
- If a session expires before order submission, preserve cart and form data and provide a path back through login to checkout. Reuse the submission key on retries so a saved order with a lost response is returned without duplication. Bind each key to normalized items and delivery details; reject mismatched reuse and require an explicit new attempt.
- Never report an order as confirmed before the database transaction commits. Network and server errors leave the cart intact and permit a retry.
- Do not enable cross-origin API access. Use same-origin JSON requests and `SameSite=Lax` cookies.
- Use server-side price validation so client edits cannot change order totals.

## Acceptance Criteria

1. Customer-facing pages share the approved warm glass visual system and remain usable on mobile and desktop.
2. Motion is present but subtle, and reduced-motion preferences suppress nonessential animation.
3. Signup and login call the Flask API; passwords are not saved in browser storage or stored in plaintext; logged-in state survives navigation through the session cookie.
4. Successful login lands on the home page and displays the signed-in account menu.
5. A non-empty cart reaches checkout, where the user can submit name, address, and phone after signing in.
6. The server validates the cart and calculates totals from its catalog. A saved order appears in that account's order history.
7. The checkout confirmation appears only after a successful save. Failed requests preserve the cart and entered form values; retrying the same submission key and payload does not create a duplicate order, and mismatched payloads require a new attempt.
8. Empty or malformed carts, unknown products, invalid delivery details, duplicate signup, invalid login, and expired sessions produce clear user-facing errors.
9. The Python server serves the storefront without exposing its source or database. The README contains the local setup and startup commands.
10. The Node backend files are removed; no commit or push is part of the work.

## Out of Scope

- Payment processor or payment collection.
- Server-side catalog administration or replacement of the existing local admin pages.
- Multi-factor authentication, email verification, password reset, and production deployment configuration.
- A redesign of product selection or price changes beyond keeping the server-side order catalog aligned with the existing four products.

## Review Notes

- The storefront currently has no automated test suite. The implementation will not add or run test commands unless requested. Source changes will be reviewed against the acceptance criteria.
- The local SQLite file contains user credentials as hashes and customer delivery information; it must remain ignored by Git.
- The Python app must not serve files below `server/` as static content.
