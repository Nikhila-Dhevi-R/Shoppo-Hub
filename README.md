# ShopHub

ShopHub is a responsive storefront demo with a warm peach, yellow, and orange glassmorphism theme. It is a static site built with HTML, CSS, and vanilla JavaScript, so it can run on GitHub Pages without a separate application server.

## Features

- Search and filter the Fashion and Electronics & Gadgets collections
- Product photos sized to fit their cards, with hover transitions
- Browser-local cart and saved finds
- Demo sign-up and login for profiles stored in this browser
- Delivery form, local order confirmation, and per-profile order history
- Responsive layout with glass panels and motion effects

## Run locally

Install Node.js 24 or newer. From the repository root, run these commands in PowerShell:

```powershell
node --version
node --test tests/shop-store.test.cjs tests/build-pages.test.cjs
node scripts/build-pages.mjs
node scripts/serve-static.mjs
```

Open <http://127.0.0.1:8000>. The preview server serves only the generated `_site` folder and has no application API.

## Deploy on GitHub Pages

The `main` branch builds and deploys the storefront through the GitHub Actions workflow in `.github/workflows/pages.yml`. In the repository, open **Settings > Pages** and select **GitHub Actions** as the build and deployment source. Pushes to `main` run the workflow; the deployment URL appears in the workflow's `github-pages` environment.

The expected project URL is <https://nikhila-dhevi-r.github.io/Shoppo-Hub/>.

## Demo data and privacy

Profiles and orders are stored in this browser only. They do not sync across browsers or devices, and they are not connected to the previous local SQLite data. Passwords are stored as salted PBKDF2 hashes, but this browser-only login is not server-secure: people with access to this browser can inspect or change its data and the JavaScript catalog.

Use sample information only. Do not reuse a real password or enter a real delivery address or phone number. ShopHub does not process payments, verify inventory, or send orders to a merchant. Order confirmation is a local demo record, not an accepted purchase.
