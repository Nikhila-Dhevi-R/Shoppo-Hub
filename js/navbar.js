(() => {
    function readList(key) {
        try {
            const value = JSON.parse(localStorage.getItem(key) || "[]");
            return Array.isArray(value) ? value : [];
        } catch (_error) {
            return [];
        }
    }

    function renderShell() {
        const header = document.getElementById("siteHeader");
        const footer = document.getElementById("siteFooter");

        if (header) {
            header.innerHTML = `
                <nav class="navbar" aria-label="Main navigation">
                    <div class="logo"><a href="index.html">Shop<span>Hub</span></a></div>
                    <form class="search-box" id="headerSearchForm" role="search">
                        <label class="sr-only" for="headerSearchInput">Search products</label>
                        <input id="headerSearchInput" type="search" placeholder="Find something lovely…" autocomplete="off">
                        <button id="searchBtn" type="submit" aria-label="Search">⌕</button>
                    </form>
                    <div class="nav-links">
                        <a href="index.html" data-page="index.html">Home</a>
                        <a href="products.html" data-page="products.html">Shop</a>
                        <a href="wishlist.html" data-page="wishlist.html">Saved <span class="count-badge" id="wishlistCount">0</span></a>
                        <a href="cart.html" data-page="cart.html">Cart <span class="count-badge" id="cartCount">0</span></a>
                    </div>
                    <div class="user-menu">
                        <a id="loginLink" href="login.html">Log in</a>
                        <a id="signupLink" href="signup.html">Join</a>
                        <div id="profileMenu" class="profile-menu" hidden>
                            <button id="profileBtn" type="button" aria-haspopup="true" aria-expanded="false">Hi, <span id="userName">Shopper</span>⌄</button>
                            <div class="dropdown" id="dropdown" hidden>
                                <a href="profile.html">My profile</a>
                                <a href="orders.html">My orders</a>
                                <button id="logoutBtn" class="logout-link" type="button">Log out</button>
                            </div>
                        </div>
                    </div>
                </nav>`;
        }

        if (footer) {
            footer.innerHTML = `
                <div class="footer">
                    <div class="footer-container">
                        <div class="footer-left"><h2>ShopHub</h2><p>Little finds for brighter everyday moments. Browse at your own pace and keep your favorites close.</p></div>
                        <div class="footer-links"><h3>Explore</h3><a href="products.html">Shop all</a><a href="wishlist.html">Saved finds</a><a href="cart.html">Your cart</a></div>
                        <div class="footer-links"><h3>ShopHub</h3><a href="about.html">Our story</a><a href="contact.html">Contact</a><a href="profile.html">My account</a></div>
                    </div>
                    <div class="footer-bottom">© 2026 ShopHub · Made for everyday finds</div>
                </div>`;
        }
    }

    function updateCounts() {
        const cartCount = document.getElementById("cartCount");
        const wishlistCount = document.getElementById("wishlistCount");
        if (cartCount) cartCount.textContent = String(readList("cart").length);
        if (wishlistCount) wishlistCount.textContent = String(readList("wishlist").length);
    }

    function setSignedInUser(user) {
        const loginLink = document.getElementById("loginLink");
        const signupLink = document.getElementById("signupLink");
        const profileMenu = document.getElementById("profileMenu");
        const userName = document.getElementById("userName");

        if (loginLink) loginLink.hidden = Boolean(user);
        if (signupLink) signupLink.hidden = Boolean(user);
        if (profileMenu) profileMenu.hidden = !user;
        if (userName && user) userName.textContent = user.name;
    }

    function attachAccountMenu() {
        const profileBtn = document.getElementById("profileBtn");
        const dropdown = document.getElementById("dropdown");
        const logoutBtn = document.getElementById("logoutBtn");

        if (profileBtn && dropdown) {
            profileBtn.addEventListener("click", () => {
                dropdown.hidden = !dropdown.hidden;
                profileBtn.setAttribute("aria-expanded", String(!dropdown.hidden));
            });
            document.addEventListener("click", (event) => {
                if (!profileBtn.contains(event.target) && !dropdown.contains(event.target)) {
                    dropdown.hidden = true;
                    profileBtn.setAttribute("aria-expanded", "false");
                }
            });
        }

        if (logoutBtn) {
            logoutBtn.addEventListener("click", async () => {
                logoutBtn.disabled = true;
                try {
                    window.shopStore.logout();
                } catch (error) {
                    let status = document.getElementById("navStatus");
                    if (!status && dropdown) {
                        status = document.createElement("p");
                        status.id = "navStatus";
                        status.className = "nav-status";
                        status.setAttribute("role", "status");
                        status.setAttribute("aria-live", "polite");
                        dropdown.insertBefore(status, logoutBtn);
                    }
                    if (status) status.textContent = error.message || "We could not sign you out. Try again.";
                    logoutBtn.disabled = false;
                    return;
                }
                window.location.assign("login.html");
            });
        }
    }

    function attachSearch() {
        const form = document.getElementById("headerSearchForm");
        const input = document.getElementById("headerSearchInput");
        if (!form || !input) return;
        form.addEventListener("submit", (event) => {
            event.preventDefault();
            const value = input.value.trim();
            if (!value) {
                input.focus();
                return;
            }
            window.location.assign(`products.html?search=${encodeURIComponent(value)}`);
        });
    }

    async function refreshSession() {
        try {
            setSignedInUser(await window.shopStore.currentUser());
        } catch (_error) {
            setSignedInUser(null);
        }
    }

    function setCurrentPage() {
        const page = window.location.pathname.split("/").pop() || "index.html";
        document.querySelectorAll(".nav-links [data-page]").forEach((link) => {
            if (link.dataset.page === page) link.setAttribute("aria-current", "page");
        });
    }

    function initialize() {
        renderShell();
        setCurrentPage();
        updateCounts();
        attachAccountMenu();
        attachSearch();
        refreshSession();
    }

    window.updateShopCounts = updateCounts;
    window.addEventListener("storage", () => {
        updateCounts();
        refreshSession();
    });
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
        initialize();
    }
})();
