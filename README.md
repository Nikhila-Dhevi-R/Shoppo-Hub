# ShopHub

ShopHub is a small e-commerce demo built with HTML, CSS, vanilla JavaScript, and a Flask backend. Product browsing, cart, and wishlist interactions run in the browser. Flask serves the storefront and handles account sessions and order persistence.

## Features

- Responsive storefront with product search and category filtering
- Expanded Fashion collection with graphic tees, sneakers, and loafers
- Electronics & Gadgets collection with wireless earbuds, wired earphones, and mice
- Local cart and wishlist
- SQLite-backed signup, login, and account sessions
- Checkout requires a signed-in account and collects delivery name, address, and phone number
- Server-calculated order totals and account order history
- Warm peach, yellow, and orange glassmorphism theme with motion effects

## Run locally on Windows

From the project root in PowerShell:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r server/requirements.txt
python -m server.app
```

Open <http://127.0.0.1:5000>. The Python server creates `server/shophub.sqlite3` when it initializes the account and order database. This local database stores password hashes, order items, and customer delivery details; the SQLite file is ignored by Git. Cart and wishlist items stay in browser localStorage. A checkout draft is kept in the current tab while a shopper signs in or retries an order.

Orders require a signed-in account. Checkout retries reuse a request key tied to the order details so a lost response does not create a second order. Changed details require an explicit new-order attempt. This demo does not process payments.
