import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIME_TYPES = new Map([
    [".html", "text/html; charset=utf-8"],
    [".css", "text/css; charset=utf-8"],
    [".js", "text/javascript; charset=utf-8"],
    [".mjs", "text/javascript; charset=utf-8"],
    [".svg", "image/svg+xml"],
    [".png", "image/png"],
    [".jpg", "image/jpeg"],
    [".jpeg", "image/jpeg"],
    [".webp", "image/webp"],
    [".gif", "image/gif"],
    [".avif", "image/avif"],
    [".ico", "image/x-icon"],
    [".woff", "font/woff"],
    [".woff2", "font/woff2"]
]);

function respond(response, status, message, headers = {}) {
    response.writeHead(status, { "content-type": "text/plain; charset=utf-8", "x-content-type-options": "nosniff", ...headers });
    response.end(message);
}

export function createStaticServer(rootDirectory) {
    const root = path.resolve(rootDirectory);
    return http.createServer(async (request, response) => {
        if (request.method !== "GET") {
            respond(response, 405, "Method not allowed", { allow: "GET" });
            return;
        }

        let pathname;
        try {
            pathname = decodeURIComponent(new URL(request.url || "/", "http://127.0.0.1").pathname);
        } catch (_error) {
            respond(response, 400, "Bad request");
            return;
        }
        if (pathname.includes("\0")) {
            respond(response, 400, "Bad request");
            return;
        }

        const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^[/\\]+/, "");
        const target = path.resolve(root, relativePath);
        const rootPrefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
        if (target !== root && !target.startsWith(rootPrefix)) {
            respond(response, 404, "Not found");
            return;
        }

        try {
            const [realRoot, realTarget] = await Promise.all([fs.realpath(root), fs.realpath(target)]);
            const realPrefix = realRoot.endsWith(path.sep) ? realRoot : `${realRoot}${path.sep}`;
            if (realTarget !== realRoot && !realTarget.startsWith(realPrefix)) {
                respond(response, 404, "Not found");
                return;
            }
            const details = await fs.stat(realTarget);
            if (!details.isFile()) {
                respond(response, 404, "Not found");
                return;
            }
            response.writeHead(200, {
                "content-type": MIME_TYPES.get(path.extname(realTarget).toLowerCase()) || "application/octet-stream",
                "content-length": details.size,
                "x-content-type-options": "nosniff"
            });
            createReadStream(realTarget).pipe(response);
        } catch (error) {
            if (error && error.code === "ENOENT") {
                respond(response, 404, "Not found");
                return;
            }
            respond(response, 500, "Unable to read this file");
        }
    });
}

const scriptPath = fileURLToPath(import.meta.url);
const isCli = process.argv[1] && path.resolve(process.argv[1]) === scriptPath;
if (isCli) {
    const root = path.resolve(path.dirname(scriptPath), "..", "_site");
    const server = createStaticServer(root);
    const port = Number(process.env.PORT || 8000);
    server.listen(port, "127.0.0.1", () => {
        console.log(`ShopHub preview: http://127.0.0.1:${port}`);
    });
}
