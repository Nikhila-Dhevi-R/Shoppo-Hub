(() => {
    const catalog = window.shopCatalog;
    const container = document.getElementById("productsContainer");
    const searchInput = document.getElementById("searchInput");
    const categoryFilter = document.getElementById("filterCategory");
    if (!catalog || !container || !searchInput || !categoryFilter) return;

    const params = new URLSearchParams(window.location.search);
    searchInput.value = params.get("search") || "";

    function render() {
        const search = searchInput.value.trim().toLocaleLowerCase();
        const category = categoryFilter.value;
        const matches = catalog.products.filter((product) => {
            const matchesName = product.name.toLocaleLowerCase().includes(search);
            const matchesCategory = category === "all" || product.category === category;
            return matchesName && matchesCategory;
        });

        container.replaceChildren();
        if (!matches.length) {
            const empty = document.createElement("div");
            empty.className = "empty-state";
            empty.innerHTML = "<h2>No finds just yet</h2><p>Try another search or browse all categories.</p>";
            container.appendChild(empty);
            return;
        }

        matches.forEach((product, index) => {
            const card = document.createElement("article");
            card.className = "product-card";
            card.style.animationDelay = `${Math.min(index * 70, 350)}ms`;

            const image = document.createElement("img");
            image.src = product.image;
            image.alt = product.alt;
            image.loading = "lazy";

            const title = document.createElement("h3");
            title.textContent = product.name;
            const price = document.createElement("p");
            price.className = "product-price";
            price.textContent = catalog.formatPrice(product.price);
            const addButton = document.createElement("button");
            addButton.type = "button";
            addButton.textContent = "Add to cart";
            addButton.addEventListener("click", () => window.addToCart(product.id));
            const saveButton = document.createElement("button");
            saveButton.type = "button";
            saveButton.className = "button-secondary";
            saveButton.textContent = "Save for later";
            saveButton.addEventListener("click", () => window.addWishlist(product.id));

            card.append(image, title, price, addButton, saveButton);
            container.appendChild(card);
        });
    }

    searchInput.addEventListener("input", render);
    categoryFilter.addEventListener("change", render);
    render();
})();
