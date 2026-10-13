const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

const catalogSource = readFileSync(path.join(__dirname, "../js/catalog.js"), "utf8");
const checkoutSource = readFileSync(path.join(__dirname, "../js/checkout.js"), "utf8");

class MemoryStorage {
    constructor(values = {}) {
        this.values = new Map(Object.entries(values));
        this.failRemove = false;
        this.failRead = false;
    }

    getItem(key) {
        if (this.failRead) throw new Error("storage unavailable");
        return this.values.has(key) ? this.values.get(key) : null;
    }

    setItem(key, value) {
        this.values.set(key, String(value));
    }

    removeItem(key) {
        if (this.failRemove) throw new Error("storage unavailable");
        this.values.delete(key);
    }
}

class FakeElement {
    constructor(id = "") {
        this.id = id;
        this.hidden = false;
        this.disabled = false;
        this.value = "";
        this.textContent = "";
        this.children = [];
        this.listeners = new Map();
        this.classList = { add() {}, remove() {}, toggle() {} };
    }

    addEventListener(type, callback) {
        const listeners = this.listeners.get(type) || [];
        listeners.push(callback);
        this.listeners.set(type, listeners);
    }

    async dispatch(type, event = {}) {
        const callbacks = this.listeners.get(type) || [];
        for (const callback of callbacks) await callback({ preventDefault() {}, ...event });
    }

    append(...children) { this.children.push(...children); }
    appendChild(child) { this.children.push(child); }
    replaceChildren(...children) { this.children = [...children]; }
    focus() {}
    setAttribute() {}
    removeAttribute() {}
    reportValidity() { return true; }
}

function makeCheckout({ cart = [1], attemptKey = null, initialUser = { id: "profile-a", name: "Ava" }, placeOrderHandler = null } = {}) {
    const elements = new Map();
    const element = (id) => {
        if (!elements.has(id)) elements.set(id, new FakeElement(id));
        return elements.get(id);
    };
    const localStorage = new MemoryStorage({ cart: JSON.stringify(cart) });
    const sessionStorage = new MemoryStorage(attemptKey ? { "shophub.checkout.request.v1": attemptKey } : {});
    const windowListeners = new Map();
    let activeUser = initialUser;
    const placedOrders = [];
    const locationChanges = [];

    element("orderSuccess").hidden = true;
    element("newOrderAttemptBtn").hidden = true;
    element("checkoutEmptyLink").hidden = true;

    const window = {
        crypto: webcrypto,
        location: {
            replace(url) { locationChanges.push({ type: "replace", url }); },
            assign(url) { locationChanges.push({ type: "assign", url }); }
        },
        addEventListener(type, callback) {
            const listeners = windowListeners.get(type) || [];
            listeners.push(callback);
            windowListeners.set(type, listeners);
        },
        updateShopCounts() {},
        shopStore: {
            async currentUser() { return activeUser; },
            async placeOrder(order) {
                placedOrders.push(order);
                if (placeOrderHandler) return placeOrderHandler(order, placedOrders.length);
                if (order.attemptKey.length < 8 || order.attemptKey.length > 128) {
                    const error = new Error("This checkout attempt is invalid. Start a new order and try again.");
                    error.code = "INVALID_ORDER";
                    throw error;
                }
                return { reference: "SH-TEST-123", total: 999 };
            }
        }
    };
    const document = {
        readyState: "complete",
        getElementById: element,
        createElement: (tag) => new FakeElement(tag),
        querySelector: () => null,
        querySelectorAll: () => []
    };
    const context = { window, document, localStorage, sessionStorage, Intl, Map, Set, Object, Array, JSON, Error, Uint8Array };
    vm.runInNewContext(catalogSource, context, { filename: "catalog.js" });
    vm.runInNewContext(checkoutSource, context, { filename: "checkout.js" });

    return {
        elements,
        localStorage,
        sessionStorage,
        placedOrders,
        locationChanges,
        setActiveUser(user) { activeUser = user; },
        async dispatchStorageChange() {
            for (const callback of windowListeners.get("storage") || []) {
                await callback({ key: "shophub.active-profile.v1" });
            }
        },
        async submit() { await element("checkoutForm").dispatch("submit"); }
    };
}

test("refusesToCheckoutMixedCartAndPreservesOriginalItems", async () => {
    const checkout = makeCheckout({ cart: [1, 999] });
    await new Promise((resolve) => setImmediate(resolve));

    await checkout.submit();

    assert.equal(checkout.placedOrders.length, 0);
    assert.equal(checkout.localStorage.getItem("cart"), "[1,999]");
    assert.equal(checkout.elements.get("orderSuccess").hidden, true);
    assert.match(checkout.elements.get("checkoutStatus").textContent, /unavailable/i);
});

test("rejectsCheckoutAfterTheActiveProfileChanges", async () => {
    const checkout = makeCheckout();
    await new Promise((resolve) => setImmediate(resolve));
    checkout.elements.get("deliveryName").value = "Ava Shopper";
    checkout.elements.get("deliveryAddress").value = "12 Peach Lane, Pune";
    checkout.elements.get("deliveryPhone").value = "9876543210";
    checkout.setActiveUser({ id: "profile-b", name: "Lee" });

    await checkout.submit();

    assert.equal(checkout.placedOrders.length, 0);
    assert.equal(checkout.localStorage.getItem("cart"), "[1]");
    assert.equal(checkout.elements.get("deliveryAddress").value, "");
    assert.match(checkout.elements.get("checkoutStatus").textContent, /profile changed/i);
});

test("replacesMalformedPersistedAttemptKeyAndCompletesCheckout", async () => {
    const checkout = makeCheckout({ attemptKey: "bad" });
    await new Promise((resolve) => setImmediate(resolve));

    await checkout.submit();

    assert.equal(checkout.placedOrders.length, 1);
    assert.ok(checkout.placedOrders[0].attemptKey.length >= 8);
    assert.notEqual(checkout.placedOrders[0].attemptKey, "bad");
    assert.equal(checkout.elements.get("orderSuccess").hidden, false);
});

test("rotatesRetryKeyWhenStorageRemovalFails", async () => {
    const checkout = makeCheckout({
        attemptKey: "existing-attempt-key",
        placeOrderHandler(order, callNumber) {
            if (callNumber === 1) {
                const error = new Error("This checkout attempt already saved different details.");
                error.code = "ATTEMPT_CONFLICT";
                throw error;
            }
            return { reference: "SH-TEST-456", total: 999 };
        }
    });
    await new Promise((resolve) => setImmediate(resolve));
    checkout.sessionStorage.failRemove = true;

    await checkout.submit();
    await checkout.elements.get("newOrderAttemptBtn").dispatch("click");
    await checkout.submit();

    assert.equal(checkout.placedOrders.length, 2);
    assert.notEqual(checkout.placedOrders[1].attemptKey, "existing-attempt-key");
    assert.equal(checkout.elements.get("orderSuccess").hidden, false);
});

test("clearsDeliveryFieldsWhenAnotherTabSwitchesTheActiveProfile", async () => {
    const checkout = makeCheckout();
    await new Promise((resolve) => setImmediate(resolve));
    checkout.elements.get("deliveryName").value = "Ava Shopper";
    checkout.elements.get("deliveryAddress").value = "12 Peach Lane, Pune";
    checkout.elements.get("deliveryPhone").value = "9876543210";
    checkout.setActiveUser({ id: "profile-b", name: "Lee" });

    await checkout.dispatchStorageChange();

    assert.equal(checkout.elements.get("deliveryName").value, "");
    assert.equal(checkout.elements.get("deliveryAddress").value, "");
    assert.equal(checkout.elements.get("deliveryPhone").value, "");
    assert.deepEqual(checkout.locationChanges.at(-1), { type: "replace", url: "login.html?next=checkout.html" });
});
