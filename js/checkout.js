(() => {
    const catalog = window.shopCatalog;
    const form = document.getElementById("checkoutForm");
    const status = document.getElementById("checkoutStatus");
    const submitButton = document.getElementById("placeOrderBtn");
    const newOrderAttemptButton = document.getElementById("newOrderAttemptBtn");
    const checkoutView = document.getElementById("checkoutView");
    const successPanel = document.getElementById("orderSuccess");
    const emptyCartLink = document.getElementById("checkoutEmptyLink");
    const summaryPanel = document.getElementById("checkoutSummary");
    const draftKey = "shophub.checkout.delivery.v1";
    if (!catalog || !form || !checkoutView || !successPanel) return;
    let activeRequestKey = null;

    const fields = {
        name: document.getElementById("deliveryName"),
        address: document.getElementById("deliveryAddress"),
        phone: document.getElementById("deliveryPhone")
    };

    function setStatus(message, kind = "error") {
        if (!status) return;
        status.textContent = message;
        status.classList.toggle("is-error", kind === "error");
        status.classList.toggle("is-success", kind === "success");
        status.classList.toggle("is-pending", kind === "pending");
    }

    function saveDraft() {
        const draft = Object.fromEntries(Object.entries(fields).map(([key, input]) => [key, input.value]));
        try {
            if (Object.values(draft).every((value) => !value.trim())) {
                sessionStorage.removeItem(draftKey);
                return;
            }
            sessionStorage.setItem(draftKey, JSON.stringify(draft));
        } catch (_error) { /* Keep the active form usable if browser storage is unavailable. */ }
    }

    function restoreDraft() {
        try {
            const draft = JSON.parse(sessionStorage.getItem(draftKey) || "null");
            if (!draft || typeof draft !== "object") return false;
            Object.keys(fields).forEach((key) => {
                if (typeof draft[key] === "string") fields[key].value = draft[key];
            });
            return true;
        } catch (_error) {
            return false;
        }
    }

    function orderItems() {
        const quantities = new Map();
        catalog.readIds("cart").forEach((id) => quantities.set(id, (quantities.get(id) || 0) + 1));
        return [...quantities].map(([id, quantity]) => ({ id, quantity }));
    }

    function createRequestKey() {
        if (window.crypto && typeof window.crypto.randomUUID === "function") {
            return window.crypto.randomUUID();
        }
        const bytes = new Uint8Array(16);
        window.crypto.getRandomValues(bytes);
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }

    function checkoutRequestKey() {
        if (activeRequestKey) return activeRequestKey;
        try {
            const existing = sessionStorage.getItem(catalog.checkoutKeyName);
            if (existing) {
                activeRequestKey = existing;
                return activeRequestKey;
            }
        } catch (_error) {
            // Keep one in-memory key for retries while this checkout page remains open.
        }
        activeRequestKey = createRequestKey();
        try { sessionStorage.setItem(catalog.checkoutKeyName, activeRequestKey); } catch (_error) { /* Retain it in memory for this attempt. */ }
        return activeRequestKey;
    }

    function renderSummary(items) {
        const list = document.getElementById("checkoutItems");
        const totalElement = document.getElementById("checkoutTotal");
        list.replaceChildren();
        let total = 0;
        items.forEach(({ id, quantity }) => {
            const product = catalog.byId.get(id);
            if (!product) return;
            total += product.price * quantity;
            const row = document.createElement("div");
            row.className = "checkout-item";
            const description = document.createElement("span");
            description.textContent = `${product.name} × ${quantity}`;
            const price = document.createElement("strong");
            price.textContent = catalog.formatPrice(product.price * quantity);
            row.append(description, price);
            list.appendChild(row);
        });
        totalElement.textContent = catalog.formatPrice(total);
        return total;
    }

    async function initialize() {
        const items = orderItems();
        renderSummary(items);
        if (!items.length) {
            form.hidden = true;
            if (summaryPanel) summaryPanel.hidden = true;
            if (emptyCartLink) emptyCartLink.hidden = false;
            setStatus("Your cart is empty. Add a product before checking out.");
            return;
        }

        const hadDraft = restoreDraft();
        try {
            const response = await window.shopApi.request("/api/auth/me");
            if (!hadDraft && response.user && response.user.name) fields.name.value = response.user.name;
        } catch (error) {
            if (error.status === 401) {
                saveDraft();
                window.location.replace("login.html?next=checkout.html");
                return;
            }
            setStatus(error.message || "We could not check your account. Please try again.");
        }
    }

    Object.values(fields).forEach((input) => input.addEventListener("input", saveDraft));

    if (newOrderAttemptButton) {
        newOrderAttemptButton.addEventListener("click", () => {
            activeRequestKey = null;
            try { sessionStorage.removeItem(catalog.checkoutKeyName); } catch (_error) { /* Start the new attempt in memory. */ }
            newOrderAttemptButton.hidden = true;
            submitButton.disabled = false;
            setStatus("Ready to place a separate order using these details.", "pending");
            submitButton.focus();
        });
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        const items = orderItems();
        if (!items.length) {
            setStatus("Your cart is empty. Add a product before checking out.");
            return;
        }

        saveDraft();
        submitButton.disabled = true;
        setStatus("Saving your order…", "pending");
        const requestKey = checkoutRequestKey();
        let response;
        try {
            response = await window.shopApi.request("/api/orders", {
                method: "POST",
                headers: { "Idempotency-Key": requestKey },
                body: {
                    items,
                    delivery: {
                        name: fields.name.value.trim(),
                        address: fields.address.value.trim(),
                        phone: fields.phone.value.trim()
                    }
                }
            });
        } catch (error) {
            if (error.status === 401) {
                saveDraft();
                window.location.assign("login.html?next=checkout.html");
                return;
            }
            if (error.status === 409 && newOrderAttemptButton) {
                setStatus(error.message || "This checkout attempt already saved different details.");
                newOrderAttemptButton.hidden = false;
                submitButton.disabled = true;
                newOrderAttemptButton.focus();
                return;
            }
            setStatus(error.message || "We could not save your order. Your cart is safe; please try again.");
            submitButton.disabled = false;
            return;
        }

        try { localStorage.removeItem("cart"); } catch (_error) { /* The order is saved, so still show its confirmation. */ }
        try { sessionStorage.removeItem(draftKey); } catch (_error) { /* The order is already saved. */ }
        try { sessionStorage.removeItem(catalog.checkoutKeyName); } catch (_error) { /* The order is already saved. */ }
        activeRequestKey = null;
        if (window.updateShopCounts) window.updateShopCounts();
        document.getElementById("orderReference").textContent = response.reference;
        document.getElementById("confirmedTotal").textContent = catalog.formatPrice(response.total);
        checkoutView.hidden = true;
        successPanel.hidden = false;
        const currentStep = document.querySelector('.checkout-step[aria-current="step"]');
        if (currentStep) {
            currentStep.removeAttribute("aria-current");
            currentStep.classList.remove("is-current");
            currentStep.classList.add("is-complete");
        }
        const confirmationStep = document.querySelectorAll(".checkout-step")[2];
        if (confirmationStep) {
            confirmationStep.classList.add("is-current", "is-complete");
            confirmationStep.setAttribute("aria-current", "step");
        }
        document.getElementById("successTitle").focus();
    });

    initialize();
})();
