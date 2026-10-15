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

    const K = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];

    function sha256Block(state, W) {
        for (let t = 16; t < 64; t++) {
            const w15 = W[t - 2];
            const s1 = ((w15 >>> 17) | (w15 << 15)) ^ ((w15 >>> 19) | (w15 << 13)) ^ (w15 >>> 10);
            const w2 = W[t - 15];
            const s0 = ((w2 >>> 7) | (w2 << 25)) ^ ((w2 >>> 18) | (w2 << 14)) ^ (w2 >>> 3);
            W[t] = (s1 + W[t - 7] + s0 + W[t - 16]) | 0;
        }

        let a = state[0], b = state[1], c = state[2], d = state[3];
        let e = state[4], f = state[5], g = state[6], h = state[7];

        for (let t = 0; t < 64; t++) {
            const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
            const ch = (e & f) ^ ((~e) & g);
            const temp1 = (h + S1 + ch + K[t] + W[t]) | 0;
            const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const temp2 = (S0 + maj) | 0;

            h = g;
            g = f;
            f = e;
            e = (d + temp1) | 0;
            d = c;
            c = b;
            b = a;
            a = (temp1 + temp2) | 0;
        }

        state[0] = (state[0] + a) | 0;
        state[1] = (state[1] + b) | 0;
        state[2] = (state[2] + c) | 0;
        state[3] = (state[3] + d) | 0;
        state[4] = (state[4] + e) | 0;
        state[5] = (state[5] + f) | 0;
        state[6] = (state[6] + g) | 0;
        state[7] = (state[7] + h) | 0;
    }

    function sha256(bytes) {
        const state = new Int32Array([
            0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
            0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
        ]);
        const len = bytes.length;
        const bitLen = len * 8;
        const padLen = (len + 9 + 63) & ~63;
        const padded = new Uint8Array(padLen);
        padded.set(bytes);
        padded[len] = 0x80;
        const view = new DataView(padded.buffer);
        view.setUint32(padLen - 4, bitLen, false);

        const W = new Int32Array(64);
        for (let i = 0; i < padLen; i += 64) {
            for (let t = 0; t < 16; t++) {
                W[t] = view.getInt32(i + t * 4, false);
            }
            sha256Block(state, W);
        }
        return state;
    }

    function hmacSha256(key, message) {
        let k = key;
        if (k.length > 64) {
            const s = sha256(k);
            k = new Uint8Array(32);
            const v = new DataView(k.buffer);
            for (let i = 0; i < 8; i++) v.setInt32(i * 4, s[i], false);
        }
        const kPad = new Uint8Array(64);
        kPad.set(k);

        const iPad = new Uint8Array(64);
        const oPad = new Uint8Array(64);
        for (let i = 0; i < 64; i++) {
            iPad[i] = kPad[i] ^ 0x36;
            oPad[i] = kPad[i] ^ 0x5c;
        }

        const inner = new Uint8Array(64 + message.length);
        inner.set(iPad);
        inner.set(message, 64);
        const innerState = sha256(inner);
        const innerHash = new Uint8Array(32);
        const vInner = new DataView(innerHash.buffer);
        for (let i = 0; i < 8; i++) vInner.setInt32(i * 4, innerState[i], false);

        const outer = new Uint8Array(64 + 32);
        outer.set(oPad);
        outer.set(innerHash, 64);
        const outerState = sha256(outer);
        const outerHash = new Uint8Array(32);
        const vOuter = new DataView(outerHash.buffer);
        for (let i = 0; i < 8; i++) vOuter.setInt32(i * 4, outerState[i], false);
        return outerHash;
    }

    function pbkdf2HmacSha256(passwordBytes, saltBytes, iterations) {
        let k = passwordBytes;
        if (k.length > 64) {
            const s = sha256(k);
            k = new Uint8Array(32);
            const v = new DataView(k.buffer);
            for (let i = 0; i < 8; i++) v.setInt32(i * 4, s[i], false);
        }
        const kPad = new Uint8Array(64);
        kPad.set(k);

        const iPad = new Uint8Array(64);
        const oPad = new Uint8Array(64);
        for (let i = 0; i < 64; i++) {
            iPad[i] = kPad[i] ^ 0x36;
            oPad[i] = kPad[i] ^ 0x5c;
        }

        const innerStatePre = new Int32Array([
            0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
            0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
        ]);
        const Wpad = new Int32Array(64);
        const viewiPad = new DataView(iPad.buffer);
        for (let t = 0; t < 16; t++) Wpad[t] = viewiPad.getInt32(t * 4, false);
        sha256Block(innerStatePre, Wpad);

        const outerStatePre = new Int32Array([
            0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
            0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
        ]);
        const viewoPad = new DataView(oPad.buffer);
        for (let t = 0; t < 16; t++) Wpad[t] = viewoPad.getInt32(t * 4, false);
        sha256Block(outerStatePre, Wpad);

        const saltBlock = new Uint8Array(saltBytes.length + 4);
        saltBlock.set(saltBytes);
        saltBlock[saltBytes.length + 3] = 1;

        let u = hmacSha256(k, saltBlock);
        const result = new Uint8Array(u);

        const W = new Int32Array(64);
        W[8] = 0x80000000;
        W[9] = 0; W[10] = 0; W[11] = 0; W[12] = 0; W[13] = 0; W[14] = 0;
        W[15] = 768;

        const uView = new DataView(u.buffer);
        const innerState = new Int32Array(8);
        const outerState = new Int32Array(8);

        for (let i = 1; i < iterations; i++) {
            for (let t = 0; t < 8; t++) {
                W[t] = uView.getInt32(t * 4, false);
                innerState[t] = innerStatePre[t];
            }
            sha256Block(innerState, W);

            for (let t = 0; t < 8; t++) {
                W[t] = innerState[t];
                outerState[t] = outerStatePre[t];
            }
            sha256Block(outerState, W);

            for (let t = 0; t < 8; t++) {
                uView.setInt32(t * 4, outerState[t], false);
            }
            for (let j = 0; j < 32; j++) {
                result[j] ^= u[j];
            }
        }

        return result;
    }

        function randomBytes(length) {
            if (!crypto) {
                fail("CRYPTO_UNAVAILABLE", "Secure password processing is unavailable in this browser.");
            }
            const bytes = new Uint8Array(length);
            if (typeof crypto.getRandomValues === "function") {
                try {
                    crypto.getRandomValues(bytes);
                    return bytes;
                } catch (error) {
                    if (error instanceof ShopStoreError) throw error;
                }
            }
            for (let i = 0; i < length; i++) {
                bytes[i] = Math.floor(Math.random() * 256);
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
            if (!crypto) {
                fail("CRYPTO_UNAVAILABLE", "Secure password processing is unavailable in this browser.");
            }
            const salt = new Uint8Array(saltHex.match(/.{2}/g).map((part) => parseInt(part, 16)));
            if (crypto.subtle && typeof crypto.subtle.importKey === "function" && typeof crypto.subtle.deriveBits === "function") {
                try {
                    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
                    const derived = await crypto.subtle.deriveBits({
                        name: "PBKDF2",
                        hash: "SHA-256",
                        salt,
                        iterations: PASSWORD_ITERATIONS
                    }, key, 256);
                    return hex(new Uint8Array(derived));
                } catch (_error) {
                    // Fall back to pure JS PBKDF2 if subtle fails (e.g. non-secure origin)
                }
            }
            try {
                const derived = pbkdf2HmacSha256(new TextEncoder().encode(password), salt, PASSWORD_ITERATIONS);
                return hex(derived);
            } catch (error) {
                if (error instanceof ShopStoreError) throw error;
                fail("CRYPTO_UNAVAILABLE", "Secure password processing failed in this browser.");
            }
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
