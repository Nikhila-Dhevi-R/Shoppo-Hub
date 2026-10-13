const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
let buildPages;
let createStaticServer;

test.before(async () => {
    ({ buildPages } = await import("../scripts/build-pages.mjs"));
    ({ createStaticServer } = await import("../scripts/serve-static.mjs"));
});

const CUSTOMER_PAGES = [
    "about.html",
    "cart.html",
    "checkout.html",
    "contact.html",
    "index.html",
    "login.html",
    "orders.html",
    "products.html",
    "profile.html",
    "signup.html",
    "wishlist.html"
];

async function writeFile(root, relative, contents = "sample") {
    const target = path.join(root, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, contents);
}

test("builds a deterministic customer-only Pages artifact", async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "shophub-pages-"));
    const source = path.join(temp, "source");
    const output = path.join(source, "_site");
    try {
        for (const page of CUSTOMER_PAGES) await writeFile(source, page, `<h1>${page}</h1>`);
        await writeFile(source, "css/style.css", "body { color: brown; }");
        await writeFile(source, "images/fashion/tee.webp", "webp-image");
        await writeFile(source, "images/private.sqlite3", "local database");
        await writeFile(source, "js/shop-store.js", "window.shopStore = {}; ");
        await writeFile(source, "server/app.py", "do not publish");
        await writeFile(source, "server/shophub.sqlite3", "local database");
        await writeFile(source, "admin/dashboard.html", "do not publish");
        await writeFile(source, "docs/design.md", "do not publish");
        await writeFile(source, ".venv/pyvenv.cfg", "do not publish");
        await writeFile(output, "stale.txt", "remove prior build output");

        await buildPages(source, output);

        const rootEntries = (await fs.readdir(output)).sort();
        assert.deepEqual(rootEntries, [...CUSTOMER_PAGES, "css", "images", "js"].sort());
        assert.equal(await fs.readFile(path.join(output, "index.html"), "utf8"), "<h1>index.html</h1>");
        assert.equal(await fs.readFile(path.join(output, "images/fashion/tee.webp"), "utf8"), "webp-image");
        assert.equal(await fs.readFile(path.join(output, "js/shop-store.js"), "utf8"), "window.shopStore = {}; ");
        for (const omitted of ["server", "admin", "docs", ".venv", "stale.txt"]) {
            await assert.rejects(fs.access(path.join(output, omitted)));
        }
        await assert.rejects(fs.access(path.join(output, "server/shophub.sqlite3")));
        await assert.rejects(fs.access(path.join(output, "images/private.sqlite3")));
    } finally {
        await fs.rm(temp, { recursive: true, force: true });
    }
});

test("refuses to replace a source directory or one of its parents", async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "shophub-pages-safe-"));
    const source = path.join(temp, "source");
    try {
        await fs.mkdir(source, { recursive: true });
        await assert.rejects(buildPages(source, source), /output directory must be a child/i);
        await assert.rejects(buildPages(source, temp), /output directory must be a child/i);
        assert.equal(await fs.stat(source).then((entry) => entry.isDirectory()), true);
        await writeFile(source, "index.html", "keep this source file");
        await writeFile(source, "css/style.css", "keep this source asset");
        await assert.rejects(buildPages(source, path.join(source, "index.html")), /overlap source files or assets/i);
        await assert.rejects(buildPages(source, path.join(source, "css")), /overlap source files or assets/i);
        assert.equal(await fs.readFile(path.join(source, "index.html"), "utf8"), "keep this source file");
        assert.equal(await fs.readFile(path.join(source, "css/style.css"), "utf8"), "keep this source asset");
    } finally {
        await fs.rm(temp, { recursive: true, force: true });
    }
});

test("serves only GET storefront files with safe paths and correct MIME types", async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "shophub-static-"));
    const root = path.join(temp, "_site");
    const secret = path.join(temp, "outside.txt");
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(secret, "private");
    await writeFile(root, "index.html", "home");
    await writeFile(root, "css/style.css", "body {}");
    await writeFile(root, "js/app.js", "window.ready = true;");
    await writeFile(root, "images/item.webp", "image-bytes");
    const server = createStaticServer(root);
    try {
        await new Promise((resolve, reject) => {
            server.once("error", reject);
            server.listen(0, "127.0.0.1", resolve);
        });
        const address = server.address();
        const base = `http://127.0.0.1:${address.port}`;
        const html = await fetch(`${base}/`);
        assert.equal(html.status, 200);
        assert.match(html.headers.get("content-type"), /text\/html/);
        assert.equal(await html.text(), "home");

        const css = await fetch(`${base}/css/style.css`);
        assert.equal(css.status, 200);
        assert.match(css.headers.get("content-type"), /text\/css/);
        const js = await fetch(`${base}/js/app.js`);
        assert.equal(js.status, 200);
        assert.match(js.headers.get("content-type"), /javascript/);
        const image = await fetch(`${base}/images/item.webp`);
        assert.equal(image.status, 200);
        assert.match(image.headers.get("content-type"), /image\/webp/);

        const blocked = await fetch(`${base}/%2e%2e%2foutside.txt`);
        assert.notEqual(blocked.status, 200);
        const notFound = await fetch(`${base}/missing.html`);
        assert.equal(notFound.status, 404);
        const post = await fetch(`${base}/index.html`, { method: "POST" });
        assert.equal(post.status, 405);
    } finally {
        await new Promise((resolve) => server.close(resolve));
        await fs.rm(temp, { recursive: true, force: true });
    }
});
