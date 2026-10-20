#!/usr/bin/env node
/**
 * One origin in front of a locally running stack, the way nginx fronts the Docker one: the web
 * export from `dist/`, `/api` and the restaurants' public websites from the backend, `/media`
 * from the backend's upload directory. It exists so the capture scripts and the Playwright
 * suite can run without Docker.
 *
 *   npx expo export --platform web          # with EXPO_PUBLIC_API_URL=/api
 *   node scripts/serve-local-stack.mjs      # http://localhost:5062
 *
 * Environment: PORT (5062), BACKEND_URL (http://localhost:8080), DIST_DIR (./dist),
 * MEDIA_DIR (../OpenRestoApi/wwwroot/media).
 */
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createReadStream, existsSync, statSync } from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 5062);
const BACKEND = new URL(process.env.BACKEND_URL ?? "http://localhost:8080");
const DIST_DIR = path.resolve(process.env.DIST_DIR ?? path.join(here, "../dist"));
const MEDIA_DIR = path.resolve(
  process.env.MEDIA_DIR ?? path.join(here, "../../OpenRestoApi/wwwroot/media")
);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".pdf": "application/pdf",
};

/** The backend answers these; everything else is the web export. Mirrors nginx/default.conf.template. */
const BACKEND_PATHS = [
  /^\/api\//,
  /^\/openapi\//,
  /^\/r\/[a-z0-9-]+(\/reserver)?$/,
  /^\/sitemap\.xml$/,
  /^\/robots\.txt$/,
];

function sendFile(res, file) {
  const stream = createReadStream(file);
  stream.on("open", () => {
    res.writeHead(200, {
      "content-type": TYPES[path.extname(file)] ?? "application/octet-stream",
      "cache-control": "no-cache",
    });
    stream.pipe(res);
  });
  stream.on("error", () => {
    res.writeHead(404);
    res.end();
  });
}

function resolveWithin(root, urlPath) {
  const file = path.join(root, decodeURIComponent(urlPath));
  return file.startsWith(root) && existsSync(file) && statSync(file).isFile() ? file : null;
}

http
  .createServer((req, res) => {
    const { pathname } = new URL(req.url, "http://local");

    if (BACKEND_PATHS.some((p) => p.test(pathname))) {
      const upstream = http.request(
        {
          host: BACKEND.hostname,
          port: BACKEND.port,
          path: req.url,
          method: req.method,
          headers: { ...req.headers, host: req.headers.host, "x-forwarded-proto": "http" },
        },
        (up) => {
          res.writeHead(up.statusCode ?? 502, up.headers);
          up.pipe(res);
        }
      );
      upstream.on("error", () => {
        res.writeHead(502);
        res.end("backend unreachable");
      });
      req.pipe(upstream);
      return;
    }

    if (pathname.startsWith("/media/")) {
      const file = resolveWithin(MEDIA_DIR, pathname.slice("/media/".length));
      if (file) return sendFile(res, file);
      res.writeHead(404);
      return res.end();
    }

    const asset =
      resolveWithin(DIST_DIR, pathname) ??
      resolveWithin(DIST_DIR, `${pathname.replace(/\/$/, "")}.html`) ??
      resolveWithin(DIST_DIR, path.join(pathname, "index.html"));
    sendFile(res, asset ?? path.join(DIST_DIR, "index.html"));
  })
  .listen(PORT, () => console.log(`stack on http://localhost:${PORT} (backend ${BACKEND.origin})`));
