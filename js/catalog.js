(() => {
    const checkoutKeyName = "shophub.checkout.request.v1";
    const products = [
        { id: 1, name: "Smart Watch", price: 4999, category: "Electronics & Gadgets", image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=85", alt: "Smart watch with a warm neutral strap" },
        { id: 2, name: "Headphones", price: 1999, category: "Electronics & Gadgets", image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&auto=format&fit=crop&q=85", alt: "Over-ear headphones" },
        { id: 3, name: "T Shirt", price: 799, category: "Fashion", image: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=600&auto=format&fit=crop&q=85", alt: "Casual cotton T-shirt" },
        { id: 4, name: "Shoes", price: 2999, category: "Fashion", image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&auto=format&fit=crop&q=85", alt: "Bright red running shoe" },
        { id: 5, name: "Original Graphic Tee", price: 999, category: "Fashion", image: "images/fashion/original-graphic-tee.webp", alt: "Cream graphic T-shirt with a playful vintage print" },
        { id: 6, name: "Imagine Peace Oversized Tee", price: 1199, category: "Fashion", image: "images/fashion/imagine-peace-tee.webp", alt: "Sky blue oversized graphic T-shirt shown from the back" },
        { id: 7, name: "Circuit Warrior Tee", price: 1299, category: "Fashion", image: "images/fashion/circuit-warrior-tee.webp", alt: "Black graphic T-shirt with a purple sci-fi illustration" },
        { id: 8, name: "Vintage Slogan Tee", price: 899, category: "Fashion", image: "images/fashion/vintage-slogan-tee.webp", alt: "Washed charcoal T-shirt with a bold cream slogan" },
        { id: 9, name: "Court Street Sneakers", price: 2499, category: "Fashion", image: "images/fashion/court-street-sneakers.webp", alt: "Black and white low-top court sneakers" },
        { id: 10, name: "Sand and Maroon Sneakers", price: 3299, category: "Fashion", image: "images/fashion/sand-maroon-sneakers.webp", alt: "Sand-colored sneakers with maroon side stripes" },
        { id: 11, name: "Glossy Gray Loafers", price: 2199, category: "Fashion", image: "images/fashion/glossy-gray-loafers.webp", alt: "Glossy gray slip-on loafers" },
        { id: 12, name: "Black TWS Earbuds", price: 1799, category: "Electronics & Gadgets", image: "images/electronics/black-tws-earbuds.webp", alt: "Black wireless earbuds in their charging case" },
        { id: 13, name: "Blue TWS Earbuds", price: 2499, category: "Electronics & Gadgets", image: "images/electronics/blue-tws-earbuds.webp", alt: "Blue wireless earbuds in their charging case" },
        { id: 14, name: "Clear Wired IEM Earphones", price: 1499, category: "Electronics & Gadgets", image: "images/electronics/clear-wired-iems.webp", alt: "Transparent teal in-ear monitor earphones with clear cables" },
        { id: 15, name: "Everyday Wired Earphones", price: 499, category: "Electronics & Gadgets", image: "images/electronics/black-wired-earphones.webp", alt: "Black wired in-ear earphones" },
        { id: 16, name: "Neon Red Gaming Mouse", price: 899, category: "Electronics & Gadgets", image: "images/electronics/neon-red-gaming-mouse.webp", alt: "Red translucent gaming mouse" },
        { id: 17, name: "Cloud White Wireless Mouse", price: 699, category: "Electronics & Gadgets", image: "images/electronics/cloud-white-wireless-mouse.webp", alt: "Minimal white wireless mouse with USB receiver" },
        { id: 18, name: "RGB Gaming Mouse", price: 1499, category: "Electronics & Gadgets", image: "images/electronics/rgb-gaming-mouse.webp", alt: "Black gaming mouse with bright RGB lighting" },
        { id: 19, name: "Anime Wireless Mouse", price: 1199, category: "Electronics & Gadgets", image: "images/electronics/anime-wireless-mouse.webp", alt: "White wireless mouse with anime artwork and USB receiver" }
    ];
    const byId = new Map(products.map((product) => [product.id, product]));

    function readIds(key) {
        try {
            const stored = JSON.parse(localStorage.getItem(key) || "[]");
            return Array.isArray(stored)
                ? stored.filter((id) => typeof id === "number" && Number.isInteger(id) && byId.has(id))
                : [];
        } catch (_error) {
            return [];
        }
    }

    function readCartForCheckout() {
        let raw;
        try {
            raw = localStorage.getItem("cart");
        } catch (_error) {
            return { items: [], error: "Your cart could not be read. Keep this page open and try again." };
        }
        if (raw === null) return { items: [], error: null };

        let ids;
        try {
            ids = JSON.parse(raw);
        } catch (_error) {
            return { items: [], error: "Your cart data is unreadable. Review your cart before checking out." };
        }
        if (!Array.isArray(ids) || ids.some((id) => !Number.isInteger(id) || !byId.has(id))) {
            return { items: [], error: "Your cart contains an unavailable item. Review your cart before checking out." };
        }

        const quantities = new Map();
        ids.forEach((id) => quantities.set(id, (quantities.get(id) || 0) + 1));
        return { items: [...quantities].map(([id, quantity]) => ({ id, quantity })), error: null };
    }

    function writeIds(key, ids) {
        localStorage.setItem(key, JSON.stringify(ids));
        if (key === "cart") {
            try { sessionStorage.removeItem(checkoutKeyName); } catch (_error) { /* Cart edits still work if tab storage is unavailable. */ }
        }
        if (window.updateShopCounts) window.updateShopCounts();
    }

    function formatPrice(value) {
        return new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency: "INR",
            maximumFractionDigits: 0
        }).format(value);
    }

    function showToast(message) {
        let toast = document.getElementById("shopToast");
        if (!toast) {
            toast = document.createElement("p");
            toast.id = "shopToast";
            toast.className = "shop-toast glass-panel";
            toast.setAttribute("role", "status");
            toast.setAttribute("aria-live", "polite");
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add("is-visible");
        window.clearTimeout(showToast.timer);
        showToast.timer = window.setTimeout(() => toast.classList.remove("is-visible"), 2400);
    }

    function addToCart(id) {
        const product = byId.get(Number(id));
        if (!product) return;
        const cart = readIds("cart");
        cart.push(product.id);
        writeIds("cart", cart);
        showToast(`${product.name} added to your cart.`);
    }

    function addWishlist(id) {
        const product = byId.get(Number(id));
        if (!product) return;
        const wishlist = readIds("wishlist");
        if (!wishlist.includes(product.id)) {
            wishlist.push(product.id);
            writeIds("wishlist", wishlist);
            showToast(`${product.name} saved to your finds.`);
        } else {
            showToast(`${product.name} is already in your saved finds.`);
        }
    }

    window.shopCatalog = { products, byId, readIds, readCartForCheckout, writeIds, formatPrice, checkoutKeyName };
    window.addToCart = addToCart;
    window.addWishlist = addWishlist;
    window.showShopToast = showToast;
})();
