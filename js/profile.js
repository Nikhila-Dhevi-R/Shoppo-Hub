(() => {
    const username = document.getElementById("username");
    const email = document.getElementById("email");
    const status = document.getElementById("profileStatus");

    function showError(message) {
        if (!status) return;
        status.textContent = message;
        status.classList.add("is-error");
    }

    let loadGeneration = 0;

    async function loadProfile() {
        const generation = ++loadGeneration;
        if (username) username.textContent = "";
        if (email) email.textContent = "";
        if (status) {
            status.textContent = "";
            status.classList.remove("is-error");
        }
        try {
            const user = await window.shopStore.currentUser();
            if (generation !== loadGeneration) return;
            if (!user) {
                window.location.replace("login.html?next=profile.html");
                return;
            }
            if (username) username.textContent = user.name;
            if (email) email.textContent = user.email;
        } catch (error) {
            if (generation !== loadGeneration) return;
            showError(error.message || "Your profile could not be loaded.");
        }
    }

    window.addEventListener("storage", (event) => {
        if (event.key === "shophub.active-profile.v1") loadProfile();
    });

    const ordersButton = document.getElementById("ordersBtn");
    if (ordersButton) ordersButton.addEventListener("click", () => window.location.assign("orders.html"));

    const wishlistButton = document.getElementById("wishlistBtn");
    if (wishlistButton) wishlistButton.addEventListener("click", () => window.location.assign("wishlist.html"));

    const logoutButton = document.getElementById("profileLogoutBtn");
    if (logoutButton) {
        logoutButton.addEventListener("click", async () => {
            logoutButton.disabled = true;
            try {
                window.shopStore.logout();
            } catch (error) {
                showError(error.message || "We could not sign you out.");
                logoutButton.disabled = false;
                return;
            }
            window.location.assign("login.html");
        });
    }

    loadProfile();
})();
