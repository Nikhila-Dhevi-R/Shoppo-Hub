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
                amount.textContent = window.shopCatalog.formatPrice(item.unit_price * item.quantity);
                line.append(name, amount);
                itemList.appendChild(line);
            });
            card.append(top, itemList);
            container.appendChild(card);
        });
    }

    async function loadOrders() {
        try {
            const response = await window.shopApi.request("/api/orders");
            status.textContent = "";
            if (!response.orders || response.orders.length === 0) {
                renderEmpty();
                return;
            }
            renderOrders(response.orders);
        } catch (error) {
            if (error.status === 401) {
                window.location.replace("login.html?next=orders.html");
                return;
            }
            status.textContent = error.message || "Your orders could not be loaded. Please try again.";
            status.classList.add("is-error");
        }
    }

    loadOrders();
})();
