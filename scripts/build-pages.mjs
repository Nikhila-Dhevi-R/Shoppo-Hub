import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CUSTOMER_PAGES = Object.freeze([
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
]);

const ASSET_DIRECTORIES = Object.freeze(["css", "images", "js"]);

async function copyAssetTree(source, destination) {
    const entries = (await fs.readdir(source, { withFileTypes: true }))
        .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
        if (entry.isSymbolicLink() || entry.name.toLowerCase().endsWith(".sqlite3")) continue;
        const sourcePath = path.join(source, entry.name);
        const destinationPath = path.join(destination, entry.name);
        if (entry.isDirectory()) {
            await fs.mkdir(destinationPath, { recursive: true });
            await copyAssetTree(sourcePath, destinationPath);
        } else if (entry.isFile()) {
            await fs.copyFile(sourcePath, destinationPath);
        }
    }
}

export async function buildPages(sourceDir, outputDir) {
    const source = path.resolve(sourceDir);
    const output = path.resolve(outputDir);
    const relativeOutput = path.relative(source, output);
    if (!relativeOutput || relativeOutput === ".." || relativeOutput.startsWith(`..${path.sep}`) || path.isAbsolute(relativeOutput)) {
        throw new Error("The output directory must be a child of the storefront source directory.");
    }
    const normalizedRelativeOutput = relativeOutput.split(path.sep).join("/").toLowerCase();
    const overlapsSourceFiles = CUSTOMER_PAGES.some((page) => page.toLowerCase() === normalizedRelativeOutput) ||
        ASSET_DIRECTORIES.some((directory) => normalizedRelativeOutput === directory || normalizedRelativeOutput.startsWith(`${directory}/`));
    if (overlapsSourceFiles) {
        throw new Error("The output directory must not overlap source files or assets.");
    }

    await fs.access(source);
    await fs.rm(output, { recursive: true, force: true });
    await fs.mkdir(output, { recursive: true });

    for (const page of CUSTOMER_PAGES) {
        await fs.copyFile(path.join(source, page), path.join(output, page));
    }
    for (const directory of ASSET_DIRECTORIES) {
        const assetSource = path.join(source, directory);
        const assetOutput = path.join(output, directory);
        await fs.mkdir(assetOutput, { recursive: true });
        await copyAssetTree(assetSource, assetOutput);
    }
    return output;
}

const scriptPath = fileURLToPath(import.meta.url);
const isCli = process.argv[1] && path.resolve(process.argv[1]) === scriptPath;
if (isCli) {
    const source = path.resolve(path.dirname(scriptPath), "..");
    const output = path.join(source, "_site");
    await buildPages(source, output);
    console.log(`Built the ShopHub Pages site in ${output}`);
}
