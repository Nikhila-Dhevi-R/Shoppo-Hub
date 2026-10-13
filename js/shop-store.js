(function initializeShopStore(root, build) {
    const api = build();
    if (typeof module === "object" && module.exports) module.exports = api;
    if (!root) return;

    root.createShopStore = api.createShopStore;
    let storage = null;
    try { storage = root.localStorage; } catch (_error) { /* The store reports blocked storage inline. */ }
    root.shopStore = api.createShopStore({ storage, crypto: root.crypto, locks: root.navigator && root.navigator.locks });
})(typeof window === "object" ? window : null, function createShopStoreModule() {
    "use strict";

    const PROFILE_KEY = "shophub.profiles.v1";
    const ACTIVE_PROFILE_KEY = "shophub.active-profile.v1";
    const ORDER_KEY_PREFIX = "shophub.orders.v1.";
    const PASSWORD_ITERATIONS = 210000;

    class ShopStoreError extends Error {
        constructor(code, message) {
            super(message);
            this.name = "ShopStoreError";
            this.code = code;
        }
    }

    function fail(code, message) {
        throw new ShopStoreError(code, message);
    }

    function isObject(value) {
        return value !== null && typeof value === "object" && !Array.isArray(value);
    }

    function safeProfile(profile) {
        return { id: profile.id, name: profile.name, email: profile.email };
    }

    function hex(bytes) {
        return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    }

    function sameString(left, right) {
        if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) return false;
        let difference = 0;
        for (let index = 0; index < left.length; index += 1) {
            difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
        }
        return difference === 0;
    }

    function validateProfiles(profiles) {
        return Array.isArray(profiles) && profiles.every((profile) =>
            isObject(profile) &&
            typeof profile.id === "string" && /^[0-9a-f-]{36}$/i.test(profile.id) &&
            typeof profile.name === "string" && profile.name.length > 0 && profile.name.length <= 120 &&
            typeof profile.email === "string" && profile.email.length <= 254 &&
            isObject(profile.credential) &&
            profile.credential.algorithm === "PBKDF2-SHA-256" &&
            profile.credential.iterations === PASSWORD_ITERATIONS &&
            typeof profile.credential.salt === "string" && /^[0-9a-f]{32}$/i.test(profile.credential.salt) &&
            typeof profile.credential.hash === "string" && /^[0-9a-f]{64}$/i.test(profile.credential.hash)
        );
    }

    function validateOrder(order) {
        return isObject(order) &&
            typeof order.reference === "string" &&
            typeof order.created_at === "string" && Number.isFinite(Date.parse(order.created_at)) &&
            Number.isSafeInteger(order.total) && order.total > 0 &&
            Array.isArray(order.items) && order.items.length > 0 &&
            order.items.every((item) => isObject(item) && Number.isSafeInteger(item.id) &&
                typeof item.name === "string" && Number.isSafeInteger(item.price) && item.price > 0 &&
                Number.isInteger(item.quantity) && item.quantity > 0) &&
            isObject(order.delivery) && typeof order.delivery.name === "string" &&
            typeof order.delivery.address === "string" && typeof order.delivery.phone === "string" &&
            typeof order.attemptKey === "string" && typeof order.payloadFingerprint === "string";
    }

    function createShopStore({ storage, crypto, locks } = {}) {
        function requireStorage() {
            if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function" || typeof storage.removeItem !== "function") {
                fail("STORAGE_UNAVAILABLE", "Browser storage is unavailable. Enable storage and try again.");
            }
        }

        function readJson(key, fallback, validator) {
            requireStorage();
            let raw;
            try {
                raw = storage.getItem(key);
            } catch (_error) {
                fail("STORAGE_UNAVAILABLE", "Browser storage could not be read. Enable storage and try again.");
            }
            if (raw === null) return fallback;
            let value;
            try {
                value = JSON.parse(raw);
            } catch (_error) {
                fail("STORAGE_DATA_INVALID", "Saved ShopHub data is unreadable. It has been left unchanged.");
            }
            if (!validator(value)) {
                fail("STORAGE_DATA_INVALID", "Saved ShopHub data is invalid. It has been left unchanged.");
            }
            return value;
        }

        function writeJson(key, value) {
            requireStorage();
            try {
                storage.setItem(key, JSON.stringify(value));
            } catch (_error) {
                fail("STORAGE_UNAVAILABLE", "Browser storage could not save this change. Free space and try again.");
            }
        }

        function readProfiles() {
            return readJson(PROFILE_KEY, [], validateProfiles);
        }

        function webCrypto() {
            if (!crypto || !crypto.subtle || typeof crypto.getRandomValues !== "function") {
                fail("CRYPTO_UNAVAILABLE", "Secure password processing is unavailable in this browser.");
            }
            return crypto;
        }

        function randomBytes(length) {
            const bytes = new Uint8Array(length);
            try {
                webCrypto().getRandomValues(bytes);
            } catch (error) {
                if (error instanceof ShopStoreError) throw error;
                fail("CRYPTO_UNAVAILABLE", "Secure password processing is unavailable in this browser.");
            }
            return bytes;
        }

        function randomId() {
            const bytes = randomBytes(16);
            bytes[6] = (bytes[6] & 0x0f) | 0x40;
            bytes[8] = (bytes[8] & 0x3f) | 0x80;
            const value = hex(bytes);
            return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
        }

        async function passwordHash(password, saltHex) {
            let derived;
            try {
                const web = webCrypto();
                const salt = new Uint8Array(saltHex.match(/.{2}/g).map((part) => parseInt(part, 16)));
                const key = await web.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
                derived = await web.subtle.deriveBits({
                    name: "PBKDF2",
                    hash: "SHA-256",
                    salt,
                    iterations: PASSWORD_ITERATIONS
                }, key, 256);
            } catch (error) {
                if (error instanceof ShopStoreError) throw error;
                fail("CRYPTO_UNAVAILABLE", "Secure password processing failed in this browser.");
            }
            return hex(new Uint8Array(derived));
        }

        function normalizeEmail(email) {
            if (typeof email !== "string") fail("INVALID_INPUT", "Enter a valid email address.");
            const normalized = email.trim().toLowerCase();
            if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
                fail("INVALID_INPUT", "Enter a valid email address.");
            }
            return normalized;
        }

        function normalizePassword(password) {
            if (typeof password !== "string" || password.length < 8 || password.length > 256) {
                fail("INVALID_INPUT", "Use a password between 8 and 256 characters.");
            }
            return password;
        }

        function safeOrder(order) {
            return {
                reference: order.reference,
                created_at: order.created_at,
                total: order.total,
                items: order.items.map(({ id, name, price, quantity }) => ({ id, name, price, quantity }))
            };
        }

        function getCurrentProfile(profiles = readProfiles()) {
            requireStorage();
            let activeId;
            try {
                activeId = storage.getItem(ACTIVE_PROFILE_KEY);
            } catch (_error) {
                fail("STORAGE_UNAVAILABLE", "Browser storage could not be read. Enable storage and try again.");
            }
            if (typeof activeId !== "string") return null;
            const profile = profiles.find((candidate) => candidate.id === activeId);
            return profile ? safeProfile(profile) : null;
        }

        function readOrders(profileId) {
            return readJson(`${ORDER_KEY_PREFIX}${profileId}`, [], (orders) => Array.isArray(orders) && orders.every(validateOrder));
        }

        function normalizedDelivery(delivery) {
            if (!isObject(delivery)) fail("INVALID_ORDER", "Enter your delivery details before placing an order.");
            const name = typeof delivery.name === "string" ? delivery.name.trim() : "";
            const address = typeof delivery.address === "string" ? delivery.address.trim() : "";
            const phone = typeof delivery.phone === "string" ? delivery.phone.trim() : "";
            const digitCount = phone.replace(/\D/g, "").length;
            if (!name || name.length > 120 || address.length < 5 || address.length > 300 ||
                !/^\+?[0-9().\-\s]{7,24}$/.test(phone) || digitCount < 7 || digitCount > 15) {
                fail("INVALID_ORDER", "Check your name, address, and phone number, then try again.");
            }
            return { name, address, phone };
        }

        function orderSnapshots(items, products) {
            if (!Array.isArray(items) || items.length === 0 || !Array.isArray(products)) {
                fail("INVALID_ORDER", "Your cart is empty or unavailable. Refresh the page and try again.");
            }
            const catalog = new Map(products.map((product) => [product && product.id, product]));
            const seen = new Set();
            const snapshots = items.map((item) => {
                if (!isObject(item) || !Number.isSafeInteger(item.id) || !Number.isInteger(item.quantity) ||
                    item.quantity < 1 || item.quantity > 99 || seen.has(item.id)) {
                    fail("INVALID_ORDER", "Your cart contains an invalid item. Update your cart and try again.");
                }
                seen.add(item.id);
                const product = catalog.get(item.id);
                if (!product || typeof product.name !== "string" || !Number.isSafeInteger(product.price) || product.price < 1) {
                    fail("INVALID_ORDER", "A product in your cart is no longer available.");
                }
                return { id: product.id, name: product.name, price: product.price, quantity: item.quantity };
            }).sort((left, right) => left.id - right.id);
            const total = snapshots.reduce((sum, item) => sum + item.price * item.quantity, 0);
            if (!Number.isSafeInteger(total) || total < 1) fail("INVALID_ORDER", "The order total is invalid.");
            return { items: snapshots, total };
        }

        return {
            async register({ name, email, password } = {}) {
                const displayName = typeof name === "string" ? name.trim() : "";
                if (!displayName || displayName.length > 120) fail("INVALID_INPUT", "Enter your name to create an account.");
                const normalizedEmail = normalizeEmail(email);
                const acceptedPassword = normalizePassword(password);
                const profiles = readProfiles();
                if (profiles.some((profile) => profile.email === normalizedEmail)) {
                    fail("EMAIL_EXISTS", "An account already uses this email address. Log in instead.");
                }
                const salt = hex(randomBytes(16));
                const hash = await passwordHash(acceptedPassword, salt);
                const profile = {
                    id: randomId(),
                    name: displayName,
                    email: normalizedEmail,
                    credential: { algorithm: "PBKDF2-SHA-256", iterations: PASSWORD_ITERATIONS, salt, hash },
                    created_at: new Date().toISOString()
                };
                const saveProfile = () => {
                    const latestProfiles = readProfiles();
                    if (latestProfiles.some((candidate) => candidate.email === normalizedEmail)) {
                        fail("EMAIL_EXISTS", "An account already uses this email address. Log in instead.");
                    }
                    writeJson(PROFILE_KEY, [...latestProfiles, profile]);
                    return safeProfile(profile);
                };
                if (!locks || typeof locks.request !== "function") return saveProfile();
                try {
                    return await locks.request("shophub.profiles.register.v1", { mode: "exclusive" }, saveProfile);
                } catch (error) {
                    if (error instanceof ShopStoreError) throw error;
                    fail("STORAGE_UNAVAILABLE", "Browser profiles could not be updated safely. Try again.");
                }
            },

            async login({ email, password } = {}) {
                const normalizedEmail = normalizeEmail(email);
                const acceptedPassword = normalizePassword(password);
                const profiles = readProfiles();
                const profile = profiles.find((candidate) => candidate.email === normalizedEmail);
                if (!profile) fail("INVALID_CREDENTIALS", "Email or password is incorrect.");
                const hash = await passwordHash(acceptedPassword, profile.credential.salt);
                if (!sameString(hash, profile.credential.hash)) fail("INVALID_CREDENTIALS", "Email or password is incorrect.");
                requireStorage();
                try {
                    storage.setItem(ACTIVE_PROFILE_KEY, profile.id);
                } catch (_error) {
                    fail("STORAGE_UNAVAILABLE", "Browser storage could not keep you signed in. Enable storage and try again.");
                }
                return safeProfile(profile);
            },

            async currentUser() {
                return getCurrentProfile();
            },

            logout() {
                requireStorage();
                try {
                    storage.removeItem(ACTIVE_PROFILE_KEY);
                } catch (_error) {
                    fail("STORAGE_UNAVAILABLE", "Browser storage could not sign you out. Try again.");
                }
            },

            async listOrders() {
                const profile = getCurrentProfile();
                if (!profile) fail("AUTH_REQUIRED", "Log in to view your orders.");
                return readOrders(profile.id).map(safeOrder);
            },

            async placeOrder({ items, delivery, attemptKey, expectedProfileId } = {}, products) {
                const profile = getCurrentProfile();
                if (!profile) fail("AUTH_REQUIRED", "Log in before placing an order.");
                if (expectedProfileId !== undefined && expectedProfileId !== profile.id) {
                    fail("PROFILE_CHANGED", "Your signed-in profile changed. Review your details and try again.");
                }
                if (typeof attemptKey !== "string" || attemptKey.length < 8 || attemptKey.length > 128) {
                    fail("INVALID_ORDER", "This checkout attempt is invalid. Start a new order and try again.");
                }
                const snapshots = orderSnapshots(items, products);
                const cleanDelivery = normalizedDelivery(delivery);
                const payloadFingerprint = JSON.stringify({ items: snapshots.items, delivery: cleanDelivery });
                const orders = readOrders(profile.id);
                const existing = orders.find((order) => order.attemptKey === attemptKey);
                if (existing) {
                    if (existing.payloadFingerprint !== payloadFingerprint) {
                        fail("ATTEMPT_CONFLICT", "This checkout attempt already saved different details. Start a new order to continue.");
                    }
                    return safeOrder(existing);
                }
                const order = {
                    reference: `SH-${randomId().replace(/-/g, "").slice(0, 12).toUpperCase()}`,
                    created_at: new Date().toISOString(),
                    total: snapshots.total,
                    items: snapshots.items,
                    delivery: cleanDelivery,
                    attemptKey,
                    payloadFingerprint
                };
                writeJson(`${ORDER_KEY_PREFIX}${profile.id}`, [...orders, order]);
                return safeOrder(order);
            }
        };
    }

    return { createShopStore, ShopStoreError };
});
