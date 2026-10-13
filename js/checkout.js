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
    const draftKeyPrefix = "shophub.checkout.delivery.v1";
    if (!catalog || !form || !checkoutView || !successPanel) return;
    let activeRequestKey = null;
    let activeDraftKey = null;
    let activeRequestStorageKey = null;
    let activeProfileId = null;

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
        if (!activeDraftKey) return;
        const draft = Object.fromEntries(Object.entries(fields).map(([key, input]) => [key, input.value]));
        try {
            if (Object.values(draft).every((value) => !value.trim())) {
                sessionStorage.removeItem(activeDraftKey);
                return;
            }
            sessionStorage.setItem(activeDraftKey, JSON.stringify(draft));
        } catch (_error) { /* Keep the active form usable if browser storage is unavailable. */ }
    }

    function restoreDraft() {
        if (!activeDraftKey) return false;
        try {
            const draft = JSON.parse(sessionStorage.getItem(activeDraftKey) || "null");
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
        return catalog.readCartForCheckout();
    }

    function clearCheckoutIdentity() {
        activeProfileId = null;
        activeRequestKey = null;
        activeDraftKey = null;
        submitButton.disabled = true;
        if (newOrderAttemptButton) newOrderAttemptButton.hidden = true;
        Object.values(fields).forEach((input) => { input.value = ""; });
        setStatus("Your signed-in profile changed. Sign in again to continue checkout.");
    }

    function createRequestKey() {
        try {
            if (window.crypto && typeof window.crypto.randomUUID === "function") {
                return window.crypto.randomUUID();
            }
            if (!window.crypto || typeof window.crypto.getRandomValues !== "function") throw new Error("Web Crypto unavailable");
            const bytes = new Uint8Array(16);
            window.crypto.getRandomValues(bytes);
            bytes[6] = (bytes[6] & 0x0f) | 0x40;
            bytes[8] = (bytes[8] & 0x3f) | 0x80;
            const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
            return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
        } catch (_error) {
            throw new Error("Secure checkout is unavailable in this browser. Try again from a secure connection.");
        }
    }

    function checkoutRequestKey() {
        if (activeRequestKey) return activeRequestKey;
        try {
            const existing = sessionStorage.getItem(catalog.checkoutKeyName);
            if (typeof existing === "string" && existing.length >= 8 && existing.length <= 128) {
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
        submitButton.disabled = true;
        const cart = orderItems();
        renderSummary(cart.items);
        if (cart.error) {
            setStatus(cart.error);
            if (emptyCartLink) {
                emptyCartLink.href = "cart.html";
                emptyCartLink.textContent = "Review your cart";
                emptyCartLink.hidden = false;
            }
            return;
        }
        if (!cart.items.length) {
            form.hidden = true;
            if (summaryPanel) summaryPanel.hidden = true;
            if (emptyCartLink) emptyCartLink.hidden = false;
            setStatus("Your cart is empty. Add a product before checking out.");
            return;
        }

        try {
            const user = await window.shopStore.currentUser();
            if (!user) {
                window.location.replace("login.html?next=checkout.html");
                return;
            }
            activeProfileId = user.id;
            activeDraftKey = `${draftKeyPrefix}.${activeProfileId}`;
            activeRequestStorageKey = catalog.checkoutKeyName;
            const hadDraft = restoreDraft();
            if (!hadDraft && user.name) fields.name.value = user.name;
            submitButton.disabled = false;
        } catch (error) {
            setStatus(error.message || "We could not check your account. Please try again.");
            submitButton.disabled = false;
        }
    }

    Object.values(fields).forEach((input) => input.addEventListener("input", saveDraft));

    if (newOrderAttemptButton) {
        newOrderAttemptButton.addEventListener("click", () => {
            activeRequestKey = createRequestKey();
            try { sessionStorage.setItem(activeRequestStorageKey, activeRequestKey); } catch (_error) { /* Retain this key in memory for the new attempt. */ }
            newOrderAttemptButton.hidden = true;
            submitButton.disabled = false;
            setStatus("Ready to place a separate order using these details.", "pending");
            submitButton.focus();
        });
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        const cart = orderItems();
        if (cart.error) {
            submitButton.disabled = true;
            setStatus(cart.error);
            if (emptyCartLink) {
                emptyCartLink.href = "cart.html";
                emptyCartLink.textContent = "Review your cart";
                emptyCartLink.hidden = false;
            }
            return;
        }
        const items = cart.items;
        if (!items.length) {
            setStatus("Your cart is empty. Add a product before checking out.");
            return;
        }

        if (!activeProfileId) {
            setStatus("Please sign in before placing your order.");
            return;
        }
        let currentUser;
        try {
            currentUser = await window.shopStore.currentUser();
        } catch (error) {
            setStatus(error.message || "We could not check your account. Please try again.");
            return;
        }
        if (!currentUser || currentUser.id !== activeProfileId) {
            clearCheckoutIdentity();
            window.location.assign("login.html?next=checkout.html");
            return;
        }

        saveDraft();
        submitButton.disabled = true;
        setStatus("Saving your order…", "pending");
        let response;
        try {
            const requestKey = checkoutRequestKey();
            response = await window.shopStore.placeOrder({
                items,
                delivery: {
                    name: fields.name.value.trim(),
                    address: fields.address.value.trim(),
                    phone: fields.phone.value.trim()
                },
                attemptKey: requestKey,
                expectedProfileId: activeProfileId
            }, catalog.products);
        } catch (error) {
            if (error.code === "AUTH_REQUIRED") {
                saveDraft();
                window.location.assign("login.html?next=checkout.html");
                return;
            }
            if (error.code === "PROFILE_CHANGED") {
                clearCheckoutIdentity();
                window.location.assign("login.html?next=checkout.html");
                return;
            }
            if (error.code === "ATTEMPT_CONFLICT" && newOrderAttemptButton) {
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
        if (activeDraftKey) {
            try { sessionStorage.removeItem(activeDraftKey); } catch (_error) { /* The order is already saved. */ }
        }
        if (activeRequestStorageKey) {
            try { sessionStorage.removeItem(activeRequestStorageKey); } catch (_error) { /* The order is already saved. */ }
        }
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

    window.addEventListener("storage", async (event) => {
        if (event.key !== "shophub.active-profile.v1" || !activeProfileId) return;
        try {
            const user = await window.shopStore.currentUser();
            if (!user || user.id !== activeProfileId) {
                clearCheckoutIdentity();
                window.location.replace("login.html?next=checkout.html");
            }
        } catch (_error) {
            clearCheckoutIdentity();
            window.location.replace("login.html?next=checkout.html");
        }
    });

    initialize();
})();
