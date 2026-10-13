const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ordersSource = readFileSync(path.join(__dirname, "../js/orders.js"), "utf8");
const profileSource = readFileSync(path.join(__dirname, "../js/profile.js"), "utf8");

class FakeElement {
    constructor(id = "") {
        this.id = id;
        this.hidden = false;
        this.textContent = "";
        this.children = [];
        this.style = {};
        this.listeners = new Map();
        this.classList = { add() {}, remove() {}, toggle() {} };
    }

    addEventListener(type, callback) {
        const listeners = this.listeners.get(type) || [];
        listeners.push(callback);
        this.listeners.set(type, listeners);
    }

    append(...children) { this.children.push(...children); }
    appendChild(child) { this.children.push(child); }
    replaceChildren(...children) { this.children = [...children]; }
}

function collectText(element) {
    return [element.textContent, ...element.children.map(collectText)].join(" ");
}

function makeDocument(ids) {
    const elements = new Map(ids.map((id) => [id, new FakeElement(id)]));
    return {
        elements,
        getElementById(id) { return elements.get(id) || null; },
        createElement(tag) { return new FakeElement(tag); }
    };
}

function makeWindow() {
    const listeners = new Map();
    const locationChanges = [];
    return {
        listeners,
        locationChanges,
        location: { replace(url) { locationChanges.push(url); }, assign(url) { locationChanges.push(url); } },
        addEventListener(type, callback) {
            const callbacks = listeners.get(type) || [];
            callbacks.push(callback);
            listeners.set(type, callbacks);
        }
    };
}

async function waitForInitialLoad() {
    await new Promise((resolve) => setImmediate(resolve));
}

test("refreshesVisibleOrderHistoryAfterTheActiveProfileChanges", async () => {
    const document = makeDocument(["ordersStatus", "ordersContainer"]);
    const window = makeWindow();
    let user = { id: "profile-a", name: "Ava" };
    const orders = {
        "profile-a": [{ reference: "SH-AVA-1", created_at: "2026-10-01T10:00:00.000Z", total: 999, items: [{ quantity: 1, name: "Ava Tee", price: 999 }] }],
        "profile-b": [{ reference: "SH-LEE-1", created_at: "2026-10-02T10:00:00.000Z", total: 1499, items: [{ quantity: 1, name: "Lee Earphones", price: 1499 }] }]
    };
    window.shopCatalog = { formatPrice: (value) => `₹${value}` };
    window.shopStore = {
        async currentUser() { return user; },
        async listOrders() { return orders[user.id]; }
    };
    vm.runInNewContext(ordersSource, { window, document, Intl, Date, Number, Math }, { filename: "orders.js" });
    await waitForInitialLoad();

    user = { id: "profile-b", name: "Lee" };
    for (const listener of window.listeners.get("storage") || []) await listener({ key: "shophub.active-profile.v1" });
    await waitForInitialLoad();

    const rendered = collectText(document.getElementById("ordersContainer"));
    assert.match(rendered, /SH-LEE-1/);
    assert.doesNotMatch(rendered, /SH-AVA-1/);
});

test("refreshesVisibleProfileAfterTheActiveProfileChanges", async () => {
    const document = makeDocument(["username", "email", "profileStatus"]);
    const window = makeWindow();
    let user = { id: "profile-a", name: "Ava", email: "ava@example.com" };
    window.shopStore = { async currentUser() { return user; } };
    vm.runInNewContext(profileSource, { window, document }, { filename: "profile.js" });
    await waitForInitialLoad();

    user = { id: "profile-b", name: "Lee", email: "lee@example.com" };
    for (const listener of window.listeners.get("storage") || []) await listener({ key: "shophub.active-profile.v1" });
    await waitForInitialLoad();

    assert.equal(document.getElementById("username").textContent, "Lee");
    assert.equal(document.getElementById("email").textContent, "lee@example.com");
});
