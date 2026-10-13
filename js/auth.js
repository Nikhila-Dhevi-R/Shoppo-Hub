(() => {
    const allowedDestinations = new Set(["checkout.html", "orders.html", "profile.html"]);
    const searchParams = new URLSearchParams(window.location.search);
    const requestedNext = searchParams.get("next");
    const safeNext = allowedDestinations.has(requestedNext) ? requestedNext : null;

    function setStatus(element, message, kind = "error") {
        if (!element) return;
        element.textContent = message;
        element.classList.toggle("is-error", kind === "error");
        element.classList.toggle("is-success", kind === "success");
        element.classList.toggle("is-pending", kind === "pending");
    }

    function addNextToUrl(page, extra = {}) {
        const params = new URLSearchParams(extra);
        if (safeNext) params.set("next", safeNext);
        const query = params.toString();
        return query ? `${page}?${query}` : page;
    }

    const signupForm = document.getElementById("signupForm");
    if (signupForm) {
        const status = document.getElementById("signupStatus");
        const loginLink = document.getElementById("loginLink");
        if (loginLink && safeNext) loginLink.href = addNextToUrl("login.html");

        signupForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const submitButton = signupForm.querySelector('button[type="submit"]');
            if (submitButton) submitButton.disabled = true;
            setStatus(status, "Creating your account…", "pending");

            try {
                const name = document.getElementById("signupName").value.trim();
                const email = document.getElementById("signupEmail").value.trim();
                const password = document.getElementById("signupPassword").value;
                await window.shopApi.request("/api/auth/register", {
                    method: "POST",
                    body: { name, email, password }
                });
                window.location.assign(addNextToUrl("login.html", { created: "1" }));
            } catch (error) {
                setStatus(status, error.message || "We could not create your account.");
                if (submitButton) submitButton.disabled = false;
            }
        });
    }

    const loginForm = document.getElementById("loginForm");
    if (loginForm) {
        const status = document.getElementById("loginStatus");
        const signupLink = document.getElementById("signupLink");
        if (signupLink && safeNext) signupLink.href = addNextToUrl("signup.html");

        if (searchParams.get("created") === "1") {
            setStatus(status, "Your account is ready. Sign in to continue.", "success");
        }

        loginForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const submitButton = loginForm.querySelector('button[type="submit"]');
            if (submitButton) submitButton.disabled = true;
            setStatus(status, "Signing you in…", "pending");

            try {
                const email = document.getElementById("loginEmail").value.trim();
                const password = document.getElementById("loginPassword").value;
                await window.shopApi.request("/api/auth/login", {
                    method: "POST",
                    body: { email, password }
                });
                window.location.assign(safeNext || "index.html");
            } catch (error) {
                setStatus(status, error.message || "We could not sign you in.");
                if (submitButton) submitButton.disabled = false;
            }
        });
    }
})();
