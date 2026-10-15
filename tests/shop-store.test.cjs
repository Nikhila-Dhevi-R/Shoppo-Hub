const test = require("node:test");
const assert = require("node:assert/strict");
const { webcrypto } = require("node:crypto");
const { createShopStore } = require("../js/shop-store.js");

const PRODUCTS = [
    { id: 1, name: "Original Graphic Tee", price: 999 },
    { id: 2, name: "Blue TWS Earbuds", price: 2499 }
];

function createMemoryStorage(seed = {}) {
    const values = new Map(Object.entries(seed));
    return {
        values,
        getItem(key) {
            return values.has(key) ? values.get(key) : null;
        },
        setItem(key, value) {
            if (this.failWrites) throw new Error("quota exceeded");
            values.set(key, String(value));
        },
        removeItem(key) {
            values.delete(key);
        },
        failWrites: false
    };
}

function makeStore(storage = createMemoryStorage(), crypto = webcrypto) {
    return { storage, store: createShopStore({ storage, crypto }) };
}

async function registerAndLogin(store, email = "ava@example.com") {
    await store.register({ name: "Ava Shopper", email, password: "correct horse battery" });
    return store.login({ email, password: "correct horse battery" });
}

test("normalizesEmailAndStoresOnlySaltedPasswordHash", async () => {
    const { storage, store } = makeStore();
    const profile = await store.register({ name: "  Ava Shopper ", email: " Ava@Example.COM ", password: "correct horse battery" });
    const records = JSON.parse(storage.getItem("shophub.profiles.v1"));

    assert.deepEqual(profile, { id: records[0].id, name: "Ava Shopper", email: "ava@example.com" });
    assert.deepEqual(Object.keys(profile).sort(), ["email", "id", "name"]);
    assert.equal(records[0].email, "ava@example.com");
    assert.equal("password" in records[0], false);
    assert.equal(records[0].passwordHash, undefined);
    assert.ok(records[0].credential.salt);
    assert.ok(records[0].credential.hash);
    assert.notEqual(records[0].credential.salt, records[0].credential.hash);
    assert.notEqual(records[0].credential.hash, "correct horse battery");
    assert.equal(await store.currentUser(), null);
});

test("preservesBothProfilesWhenRegistrationsOverlap", async () => {
    const { storage, store } = makeStore();

    await Promise.all([
        store.register({ name: "Ava Shopper", email: "ava@example.com", password: "correct horse battery" }),
        store.register({ name: "Lee Shopper", email: "lee@example.com", password: "another secure password" })
    ]);

    const profiles = JSON.parse(storage.getItem("shophub.profiles.v1"));
    assert.deepEqual(profiles.map((profile) => profile.email).sort(), ["ava@example.com", "lee@example.com"]);
});

test("rejectsConcurrentRegistrationForTheSameNormalizedEmail", async () => {
    const { storage, store } = makeStore();

    const outcomes = await Promise.allSettled([
        store.register({ name: "Ava Shopper", email: "ava@example.com", password: "correct horse battery" }),
        store.register({ name: "Another Ava", email: " AVA@EXAMPLE.COM ", password: "another secure password" })
    ]);

    assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
    assert.equal(outcomes.filter((outcome) => outcome.status === "rejected" && outcome.reason.code === "EMAIL_EXISTS").length, 1);
    assert.equal(JSON.parse(storage.getItem("shophub.profiles.v1")).length, 1);
});

test("serializesProfileWritesAcrossStoresSharingBrowserStorage", async () => {
    let tail = Promise.resolve();
    const lockNames = [];
    const locks = {
        request(name, _options, callback) {
            lockNames.push(name);
            const result = tail.then(callback);
            tail = result.catch(() => {});
            return result;
        }
    };
    const storage = createMemoryStorage();
    const firstStore = createShopStore({ storage, crypto: webcrypto, locks });
    const secondStore = createShopStore({ storage, crypto: webcrypto, locks });

    await Promise.all([
        firstStore.register({ name: "Ava Shopper", email: "ava@example.com", password: "correct horse battery" }),
        secondStore.register({ name: "Lee Shopper", email: "lee@example.com", password: "another secure password" })
    ]);

    assert.equal(lockNames.length, 2);
    assert.deepEqual(
        JSON.parse(storage.getItem("shophub.profiles.v1")).map((profile) => profile.email).sort(),
        ["ava@example.com", "lee@example.com"]
    );
});

test("rejectsDuplicateEmailAndWrongPassword", async () => {
    const { store } = makeStore();
    await store.register({ name: "Ava", email: "ava@example.com", password: "correct horse battery" });

    await assert.rejects(
        store.register({ name: "Another Ava", email: " AVA@EXAMPLE.COM ", password: "another password" }),
        (error) => error.code === "EMAIL_EXISTS"
    );
    await assert.rejects(
        store.login({ email: "ava@example.com", password: "wrong password" }),
        (error) => error.code === "INVALID_CREDENTIALS"
    );
    assert.equal(await store.currentUser(), null);
});

test("failsSafelyWithoutWebCryptoOrStorage", async () => {
    const storage = createMemoryStorage();
    const noCrypto = createShopStore({ storage, crypto: null });
    await assert.rejects(
        noCrypto.register({ name: "Ava", email: "ava@example.com", password: "correct horse battery" }),
        (error) => error.code === "CRYPTO_UNAVAILABLE"
    );
    assert.equal(storage.values.size, 0);

    const noStorage = createShopStore({ storage: null, crypto: webcrypto });
    await assert.rejects(
        noStorage.register({ name: "Ava", email: "ava@example.com", password: "correct horse battery" }),
        (error) => error.code === "STORAGE_UNAVAILABLE"
    );
});

test("worksOnInsecureOriginsWithoutSubtleCrypto", async () => {
    const storage = createMemoryStorage();
    const httpCrypto = {
        getRandomValues(bytes) {
            return webcrypto.getRandomValues(bytes);
        }
    };
    const store = createShopStore({ storage, crypto: httpCrypto });
    const profile = await store.register({ name: "AWS User", email: "aws@example.com", password: "password1234" });
    assert.equal(profile.email, "aws@example.com");

    const loggedIn = await store.login({ email: "aws@example.com", password: "password1234" });
    assert.equal(loggedIn.email, "aws@example.com");

    await assert.rejects(
        store.login({ email: "aws@example.com", password: "wrongpassword" }),
        (error) => error.code === "INVALID_CREDENTIALS"
    );
});

test("handlesMalformedStoredJsonWithoutErasingData", async () => {
    const corrupt = "{not valid json";
    const storage = createMemoryStorage({ "shophub.profiles.v1": corrupt });
    const store = createShopStore({ storage, crypto: webcrypto });

    await assert.rejects(
        store.register({ name: "Ava", email: "ava@example.com", password: "correct horse battery" }),
        (error) => error.code === "STORAGE_DATA_INVALID"
    );
    assert.equal(storage.getItem("shophub.profiles.v1"), corrupt);
});

test("isolatesOrdersAndSnapshotsCatalogPrices", async () => {
    const { storage, store } = makeStore();
    const ava = await registerAndLogin(store);
    const first = await store.placeOrder({
        items: [{ id: 1, quantity: 2 }],
        delivery: { name: "Ava Shopper", address: "12 Peach Lane, Pune", phone: "+91 98765 43210" },
        attemptKey: "attempt-ava-0001"
    }, PRODUCTS);

    assert.equal(first.total, 1998);
    assert.deepEqual(first.items, [{ id: 1, name: "Original Graphic Tee", price: 999, quantity: 2 }]);
    assert.equal("delivery" in first, false);
    assert.deepEqual(await store.listOrders(), [first]);
    const storedAvaOrders = JSON.parse(storage.getItem(`shophub.orders.v1.${ava.id}`));
    assert.equal(storedAvaOrders[0].delivery.address, "12 Peach Lane, Pune");

    store.logout();
    await registerAndLogin(store, "lee@example.com");
    assert.deepEqual(await store.listOrders(), []);

    await store.login({ email: "ava@example.com", password: "correct horse battery" });
    assert.deepEqual(await store.listOrders(), [first]);
});

test("rejectsOrderWhenActiveProfileDiffersFromCheckoutProfile", async () => {
    const { store } = makeStore();
    await store.register({ name: "Ava", email: "ava@example.com", password: "correct horse battery" });
    const ava = await store.login({ email: "ava@example.com", password: "correct horse battery" });
    await store.register({ name: "Lee", email: "lee@example.com", password: "another secure password" });
    await store.login({ email: "lee@example.com", password: "another secure password" });

    await assert.rejects(
        store.placeOrder({
            items: [{ id: 1, quantity: 1 }],
            delivery: { name: "Ava Shopper", address: "12 Peach Lane, Pune", phone: "9876543210" },
            attemptKey: "attempt-profile-check-1",
            expectedProfileId: ava.id
        }, PRODUCTS),
        (error) => error.code === "PROFILE_CHANGED"
    );
    assert.deepEqual(await store.listOrders(), []);
});

test("replaysMatchingAttemptAndRejectsChangedPayload", async () => {
    const { storage, store } = makeStore();
    await registerAndLogin(store);
    const request = {
        items: [{ id: 2, quantity: 1 }],
        delivery: { name: "Ava Shopper", address: "12 Peach Lane, Pune", phone: "9876543210" },
        attemptKey: "attempt-ava-0002"
    };

    const first = await store.placeOrder(request, PRODUCTS);
    const replay = await store.placeOrder(request, PRODUCTS);
    assert.equal(replay.reference, first.reference);
    assert.equal(JSON.parse(storage.getItem(`shophub.orders.v1.${(await store.currentUser()).id}`)).length, 1);

    await assert.rejects(
        store.placeOrder({ ...request, delivery: { ...request.delivery, address: "99 New Peach Road, Pune" } }, PRODUCTS),
        (error) => error.code === "ATTEMPT_CONFLICT"
    );
});

test("rejectsMalformedCartItemsWithoutSaving", async () => {
    const { storage, store } = makeStore();
    await registerAndLogin(store);
    const base = {
        delivery: { name: "Ava Shopper", address: "12 Peach Lane, Pune", phone: "9876543210" },
        attemptKey: "attempt-ava-0003"
    };
    const malformed = [
        [],
        [{ id: 999, quantity: 1 }],
        [{ id: 1, quantity: 0 }],
        [{ id: 1, quantity: 100 }],
        [{ id: 1, quantity: 1.5 }],
        [{ id: 1, quantity: 1 }, { id: 1, quantity: 1 }]
    ];

    for (const items of malformed) {
        await assert.rejects(
            store.placeOrder({ ...base, items }, PRODUCTS),
            (error) => error.code === "INVALID_ORDER"
        );
    }
    assert.equal(storage.values.has("shophub.orders.v1." + (await store.currentUser()).id), false);
});

test("preservesCartOrderStateWhenOrderStorageWriteFails", async () => {
    const storage = createMemoryStorage();
    const store = createShopStore({ storage, crypto: webcrypto });
    await registerAndLogin(store);
    storage.failWrites = true;

    await assert.rejects(
        store.placeOrder({
            items: [{ id: 1, quantity: 1 }],
            delivery: { name: "Ava Shopper", address: "12 Peach Lane, Pune", phone: "9876543210" },
            attemptKey: "attempt-ava-0004"
        }, PRODUCTS),
        (error) => error.code === "STORAGE_UNAVAILABLE"
    );
    assert.equal(storage.values.has("shophub.orders.v1." + (await store.currentUser()).id), false);
});
