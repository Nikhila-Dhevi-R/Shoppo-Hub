# ShopHub Browser-Only Storefront Design

**Status:** Approved design; supersedes the Flask/SQLite runtime and account/order-storage decisions in the earlier ShopHub storefront spec.

## Goal

Publish the existing ShopHub storefront as a static GitHub Pages site while retaining client-side sign-up, login, cart, checkout, order confirmation, and order history.

## Chosen approach

Serve the existing HTML, CSS, images, and vanilla JavaScript directly from GitHub Pages. Replace calls to the Flask API with browser-side modules that store demo profiles and orders in the visitor's local browser storage. This matches the requested GitHub deployment and avoids a separately hosted server.

The other viable paths are retaining Flask on a server host, or rewriting the server in Node.js and hosting that server separately. Both still require a backend host; GitHub Pages cannot run either backend. The user selected the static, browser-only path.

## Storefront behavior

- Keep product browsing, search, category filters, product images, wishlist, cart, styling, and product prices as currently implemented.
- Require a signed-in local profile to use checkout and order history, preserving the current navigation behavior.
- Sign-up stores a normalized email, display name, random profile ID, random salt, and a Web Crypto PBKDF2-SHA-256 password hash. Never store a plaintext password.
- Login compares a newly derived hash with the saved value. Logout clears the active profile ID.
- The profile record and active profile ID are local browser data. They are not proof of identity: a visitor can inspect or edit localStorage or the page code. Password reset and account recovery are not supported.
- Checkout keeps the existing name, address, and phone fields and validates them in the browser. On submit, calculate a product and quantity snapshot from the shipped JavaScript catalog, create an order reference and timestamp, and save the order under the active profile.
- Save the delivery details with the order so the browser retains a complete local order record. The order-history page displays product snapshots, total, reference, and date, and does not render delivery details.
- Keep a checkout attempt key in sessionStorage. A retry with the same key and unchanged payload returns the already saved local order; a new order attempt receives a new key.
- Show confirmation and clear the cart only after the order record has been stored successfully. If browser storage is unavailable or full, keep the cart and form values and show an error.
- Existing cart and wishlist keys remain browser-local. Existing Flask/SQLite accounts and orders are not imported into browser storage; customers create local profiles in the static site.

## Storage and trust boundaries

- Use namespaced, versioned localStorage keys for account records, the active profile ID, and orders by profile ID. Keep checkout drafts and attempt keys in sessionStorage.
- Validate stored JSON and tolerate missing, malformed, or unavailable browser storage with a visible status message rather than a broken page.
- Web Crypto hashing prevents plaintext passwords from being persisted, but it does not make client-side authentication secure. All local data is visible to people and software with access to that browser profile. The storefront must clearly describe accounts and order history as demo data stored on this device and must advise against real passwords or delivery information.
- There is no server authority for users, prices, inventory, or order acceptance. A modified browser can change the catalog, account records, or orders.

## Static deployment

- Remove runtime dependencies on Flask, SQLite, and the Render Blueprint. Keep any existing local SQLite file untouched and ignored; do not publish or import it.
- Remove all storefront `/api/...` requests and the unused API client. Customer pages use relative links and assets so they work at the GitHub Pages project path `/Shoppo-Hub/`.
- Publish only the customer storefront pages and their `css/`, `images/`, and `js/` assets. The unfinished legacy admin mockup is excluded from the published site; client-side code cannot protect an admin area.
- Add a GitHub Actions workflow that uploads the static storefront to GitHub Pages when `main` changes. Configure the repository Pages source to GitHub Actions and document the resulting URL and local preview steps in README.

## Error handling and accessibility

- Keep form errors and status messages inline using the existing live regions.
- Keep submit buttons disabled during asynchronous password derivation and storage writes, then restore them on errors.
- Do not show success if storage fails. Keep checkout inputs and cart intact so the visitor can retry.
- Preserve the existing keyboard, focus, and responsive behaviors. After login or order confirmation, retain the current focus and step updates.

## Acceptance criteria

1. The static storefront works under a repository subpath and does not request a backend endpoint.
2. Sign-up and login work for profiles stored in that browser; duplicate email and incorrect password receive clear inline errors.
3. Logout clears the active local profile and protected profile/order/checkout pages return to login.
4. A signed-in visitor can submit a non-empty cart with delivery details. An order is saved once per attempt, confirmation follows a successful save, and the cart is cleared.
5. A storage failure does not claim an order succeeded and leaves form values and cart available for retry.
6. Order history shows only the active browser profile's orders.
7. GitHub Actions publishes the customer pages and assets; the deployed product and checkout pages load over HTTPS.
8. README states that authentication and orders are browser-only demo data, with no cross-device sync, server security, or migration from SQLite.

## Out of scope

- A trusted production sign-in system, shared customer database, payment processing, inventory enforcement, password reset, cross-device synchronization, or admin access control.
- Importing local SQLite accounts or orders into the public static site.
