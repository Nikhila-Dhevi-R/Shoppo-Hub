# ShopHub

ShopHub is a responsive e-commerce storefront with a warm peach, yellow, and orange glassmorphism design. It features Fashion and Electronics & Gadgets products, search and category filters, a cart, saved items, browser-local sign-up and login, and a checkout flow with per-profile order history. It runs as a static site on GitHub Pages; accounts and orders stay in the user’s browser, and checkout is a demo without payment processing.

<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/655f3a87-d525-46df-a3f5-a77f6fdaadea" />

## Run locally

Install Node.js 24 or newer. From the repository root, run these commands in PowerShell:

```powershell
node --version
node --test tests/shop-store.test.cjs tests/build-pages.test.cjs
node scripts/build-pages.mjs
node scripts/serve-static.mjs
```

Open <http://127.0.0.1:8000>. The preview server serves only the generated `_site` folder and has no application API.

The project URL is <https://nikhila-dhevi-r.github.io/Shoppo-Hub/>.


