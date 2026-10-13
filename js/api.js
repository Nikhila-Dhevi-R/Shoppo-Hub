(() => {
    class ShopApiError extends Error {
        constructor(status, message) {
            super(message);
            this.name = "ShopApiError";
            this.status = status;
        }
    }

    async function request(path, options = {}) {
        if (typeof path !== "string" || !path.startsWith("/api/")) {
            throw new ShopApiError(0, "Invalid ShopHub API path.");
        }

        const headers = new Headers(options.headers || {});
        let body = options.body;
        if (body !== undefined && body !== null && typeof body !== "string" && !(body instanceof FormData)) {
            body = JSON.stringify(body);
        }
        if (body !== undefined && body !== null && !(body instanceof FormData) && !headers.has("Content-Type")) {
            headers.set("Content-Type", "application/json");
        }

        let response;
        try {
            response = await fetch(path, {
                ...options,
                body,
                headers,
                credentials: "same-origin"
            });
        } catch (_error) {
            throw new ShopApiError(0, "We could not reach ShopHub. Check your connection and try again.");
        }

        const responseText = await response.text();
        let payload = {};
        if (responseText) {
            try {
                payload = JSON.parse(responseText);
            } catch (_error) {
                payload = {};
            }
        }

        if (!response.ok) {
            const message = typeof payload.error === "string"
                ? payload.error
                : "Something went wrong. Please try again.";
            throw new ShopApiError(response.status, message);
        }

        return payload;
    }

    window.shopApi = { request, ShopApiError };
})();
