(() => {
    const catalog = window.shopCatalog;
    const container = document.getElementById("wishlistItems");
    if (!catalog || !container) return;

    function render() {
        const current = catalog.readIds("wishlist");
        const saved = [...new Set(current)];
        if (saved.length !== current.length) catalog.writeIds("wishlist", saved);
        container.replaceChildren();
        if (!saved.length) {
            const empty = document.createElement("div");
            empty.className = "empty-state";
            empty.innerHTML = '<h2>Your saved finds will live here</h2><p>Tap “Save for later” on something you love.</p><a class="button-primary" href="products.html">Explore the shop</a>';
            container.appendChild(empty);
            return;
        }

        saved.forEach((id) => {
            const product = catalog.byId.get(id);
            if (!product) return;
            const card = document.createElement("article");
            card.className = "product-card";
            const image = document.createElement("img");
            image.src = product.image;
            image.alt = product.alt;
            image.loading = "lazy";
            const name = document.createElement("h3");
            name.textContent = product.name;
            const price = document.createElement("p");
            price.className = "product-price";
            price.textContent = catalog.formatPrice(product.price);
            const moveButton = document.createElement("button");
            moveButton.type = "button";
            moveButton.textContent = "Add to cart";
            moveButton.addEventListener("click", () => {
                window.addToCart(product.id);
                const remaining = catalog.readIds("wishlist").filter((savedId) => savedId !== product.id);
                catalog.writeIds("wishlist", remaining);
                render();
            });
            const removeButton = document.createElement("button");
            removeButton.type = "button";
            removeButton.className = "button-secondary";
            removeButton.textContent = "Remove saved item";
            removeButton.addEventListener("click", () => {
                catalog.writeIds("wishlist", catalog.readIds("wishlist").filter((savedId) => savedId !== product.id));
                render();
            });
            card.append(image, name, price, moveButton, removeButton);
            container.appendChild(card);
        });
    }

    render();
})();
