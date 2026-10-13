(() => {
    const status = document.getElementById("ordersStatus");
    const container = document.getElementById("ordersContainer");
    if (!status || !container) return;

    function formatDate(value) {
        const date = new Date(value);
        return Number.isNaN(date.getTime())
            ? "Date unavailable"
            : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(date);
    }

    function renderEmpty() {
        const empty = document.createElement("section");
        empty.className = "empty-state glass-panel";
        const heading = document.createElement("h2");
        heading.textContent = "No orders to show yet";
        const message = document.createElement("p");
        message.textContent = "Your next happy find could be just around the corner.";
        const link = document.createElement("a");
        link.className = "button-primary";
        link.href = "products.html";
        link.textContent = "Explore the shop";
        empty.append(heading, message, link);
        container.appendChild(empty);
    }

    function renderOrders(orders) {
        container.replaceChildren();
        orders.forEach((order, index) => {
            const card = document.createElement("article");
            card.className = "order-card glass-panel";
            card.style.animationDelay = `${Math.min(index * 70, 350)}ms`;

            const top = document.createElement("div");
            top.className = "order-card-top";
            const headingGroup = document.createElement("div");
            const eyebrow = document.createElement("p");
            eyebrow.className = "eyebrow";
            eyebrow.textContent = "ORDER REFERENCE";
            const reference = document.createElement("h2");
            reference.textContent = order.reference;
            const date = document.createElement("time");
            date.className = "order-date";
            date.dateTime = order.created_at;
            date.textContent = formatDate(order.created_at);
            headingGroup.append(eyebrow, reference, date);
            const total = document.createElement("strong");
            total.className = "order-total";
            total.textContent = window.shopCatalog.formatPrice(order.total);
            top.append(headingGroup, total);

            const itemList = document.createElement("ul");
            itemList.className = "order-items";
            order.items.forEach((item) => {
                const line = document.createElement("li");
                const name = document.createElement("span");
                name.textContent = `${item.quantity} × ${item.name}`;
                const amount = document.createElement("strong");
                amount.textContent = window.shopCatalog.formatPrice(item.price * item.quantity);
                line.append(name, amount);
                itemList.appendChild(line);
            });
            card.append(top, itemList);
            container.appendChild(card);
        });
    }

    let loadGeneration = 0;

    async function loadOrders() {
        const generation = ++loadGeneration;
        container.replaceChildren();
        status.textContent = "";
        status.classList.remove("is-error");
        try {
            const user = await window.shopStore.currentUser();
            if (generation !== loadGeneration) return;
            if (!user) {
                window.location.replace("login.html?next=orders.html");
                return;
            }
            const orders = await window.shopStore.listOrders();
            if (generation !== loadGeneration) return;
            status.textContent = "";
            if (orders.length === 0) {
                renderEmpty();
                return;
            }
            renderOrders(orders.slice().reverse());
        } catch (error) {
            if (generation !== loadGeneration) return;
            if (error.code === "AUTH_REQUIRED") {
                window.location.replace("login.html?next=orders.html");
                return;
            }
            status.textContent = error.message || "Your orders could not be loaded. Please try again.";
            status.classList.add("is-error");
        }
    }

    window.addEventListener("storage", (event) => {
        if (event.key === "shophub.active-profile.v1") loadOrders();
    });

    loadOrders();
})();
