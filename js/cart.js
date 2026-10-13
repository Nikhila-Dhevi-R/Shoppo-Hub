(() => {
    const catalog = window.shopCatalog;
    const cartContainer = document.getElementById("cartItems");
    const totalPrice = document.getElementById("totalPrice");
    const cartSummary = document.getElementById("cartSummary");
    if (!catalog || !cartContainer || !totalPrice) return;

    function render() {
        const cart = catalog.readIds("cart");
        const quantities = new Map();
        cart.forEach((id) => quantities.set(id, (quantities.get(id) || 0) + 1));
        cartContainer.replaceChildren();

        if (!quantities.size) {
            const empty = document.createElement("div");
            empty.className = "empty-state";
            empty.innerHTML = '<h2>Your cart is taking a little break</h2><p>Find something lovely and it will show up here.</p><a class="button-primary" href="products.html">Explore the shop</a>';
            cartContainer.appendChild(empty);
            totalPrice.textContent = "";
            if (cartSummary) cartSummary.hidden = true;
            return;
        }

        if (cartSummary) cartSummary.hidden = false;
        let total = 0;
        quantities.forEach((quantity, id) => {
            const product = catalog.byId.get(id);
            if (!product) return;
            total += product.price * quantity;

            const card = document.createElement("article");
            card.className = "product-card cart-product-card";
            const image = document.createElement("img");
            image.src = product.image;
            image.alt = product.alt;
            image.loading = "lazy";
            const name = document.createElement("h3");
            name.textContent = product.name;
            const price = document.createElement("p");
            price.className = "product-price";
            price.textContent = catalog.formatPrice(product.price);
            const quantityText = document.createElement("p");
            quantityText.textContent = `Quantity: ${quantity} · Subtotal: ${catalog.formatPrice(quantity * product.price)}`;
            const removeOne = document.createElement("button");
            removeOne.type = "button";
            removeOne.className = "button-secondary";
            removeOne.textContent = "Remove one";
            removeOne.addEventListener("click", () => remove(id, false));
            const removeAll = document.createElement("button");
            removeAll.type = "button";
            removeAll.className = "button-quiet";
            removeAll.textContent = "Remove item";
            removeAll.addEventListener("click", () => remove(id, true));
            card.append(image, name, price, quantityText, removeOne, removeAll);
            cartContainer.appendChild(card);
        });

        totalPrice.textContent = `Your total · ${catalog.formatPrice(total)}`;
    }

    function remove(id, all) {
        const cart = catalog.readIds("cart");
        const next = all ? cart.filter((itemId) => itemId !== id) : [...cart];
        if (!all) {
            const index = next.indexOf(id);
            if (index >= 0) next.splice(index, 1);
        }
        catalog.writeIds("cart", next);
        render();
    }

    render();
})();
