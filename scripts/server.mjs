#!/usr/bin/env node

import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  buildHyrox365GymDetailUrl,
  buildHyrox365MapUrl,
  buildNominatimReverseUrl,
  buildNominatimSearchUrl,
} from "../src/hyrox.mjs";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = Number.parseInt(process.env.PORT || "4173", 10);
const nominatimUserAgent =
  "hyrox-gym-finder/0.1 (https://github.com/moose-lab/hyrox-gym-finder)";
const execFileAsync = promisify(execFile);

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".svg", "image/svg+xml"],
]);

const send = (response, status, body, headers = {}) => {
  response.writeHead(status, {
    "cache-control": "no-store",
    ...headers,
  });
  response.end(body);
};

const sendJson = (response, status, payload) => {
  send(response, status, JSON.stringify(payload), {
    "content-type": "application/json; charset=utf-8",
  });
};

const proxyJson = async (response, targetUrl, { headers = {} } = {}) => {
  const statusMarker = "\n__HYROX_GYM_FINDER_STATUS__:";
  const args = [
    "--silent",
    "--show-error",
    "--location",
    "--max-time",
    "25",
    "--header",
    "accept: application/json",
    "--write-out",
    `${statusMarker}%{http_code}`,
  ];

  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === "user-agent") {
      args.push("--user-agent", value);
      continue;
    }
    args.push("--header", `${key}: ${value}`);
  }

  args.push(targetUrl.href);

  const { stdout } = await execFileAsync("curl", args, { maxBuffer: 5 * 1024 * 1024 });
  const markerIndex = stdout.lastIndexOf(statusMarker);
  const body = markerIndex === -1 ? stdout : stdout.slice(0, markerIndex);
  const status = markerIndex === -1 ? 200 : Number.parseInt(stdout.slice(markerIndex + statusMarker.length), 10) || 502;

  send(response, status, body, {
    "content-type": "application/json; charset=utf-8",
  });
};

const handleApi = async (requestUrl, response) => {
  if (requestUrl.pathname === "/api/geocode/search") {
    const query = requestUrl.searchParams.get("q");
    if (!query) {
      sendJson(response, 400, { error: "Missing q search parameter" });
      return true;
    }

    await proxyJson(response, buildNominatimSearchUrl(query), {
      headers: { "user-agent": nominatimUserAgent },
    });
    return true;
  }

  if (requestUrl.pathname === "/api/geocode/reverse") {
    const lat = requestUrl.searchParams.get("lat");
    const lng = requestUrl.searchParams.get("lng");
    if (!lat || !lng) {
      sendJson(response, 400, { error: "Missing lat or lng search parameter" });
      return true;
    }

    await proxyJson(response, buildNominatimReverseUrl({ lat, lng }), {
      headers: { "user-agent": nominatimUserAgent },
    });
    return true;
  }

  if (requestUrl.pathname === "/api/hyrox365/gyms/map") {
    const lat = requestUrl.searchParams.get("latitude") || requestUrl.searchParams.get("lat");
    const lng = requestUrl.searchParams.get("longitude") || requestUrl.searchParams.get("lng");
    const radiusMeters = Number(requestUrl.searchParams.get("radiusMeters"));
    const radiusKm = Number.isFinite(radiusMeters) ? radiusMeters / 1000 : 50;
    const limit = requestUrl.searchParams.get("limit") || 20;

    if (!lat || !lng) {
      sendJson(response, 400, { error: "Missing latitude or longitude search parameter" });
      return true;
    }

    await proxyJson(response, buildHyrox365MapUrl({ lat, lng, radiusKm, limit }));
    return true;
  }

  const detailMatch = requestUrl.pathname.match(/^\/api\/hyrox365\/gyms\/([^/]+)$/);
  if (detailMatch) {
    await proxyJson(response, buildHyrox365GymDetailUrl(decodeURIComponent(detailMatch[1])));
    return true;
  }

  return false;
};

const handleStatic = async (requestUrl, response) => {
  const pathname = decodeURIComponent(requestUrl.pathname);
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = resolve(rootDir, relativePath);

  if (filePath !== rootDir && !filePath.startsWith(`${rootDir}${sep}`)) {
    send(response, 403, "Forbidden", { "content-type": "text/plain; charset=utf-8" });
    return;
  }

  try {
    const body = await readFile(filePath);
    send(response, 200, body, {
      "content-type": mimeTypes.get(extname(filePath)) || "application/octet-stream",
    });
  } catch (error) {
    send(response, error.code === "ENOENT" ? 404 : 500, error.code === "ENOENT" ? "Not found" : error.message, {
      "content-type": "text/plain; charset=utf-8",
    });
  }
};

const server = createServer(async (request, response) => {
  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Only GET requests are supported" });
    return;
  }

  const requestUrl = new URL(request.url, `http://${request.headers.host || `localhost:${port}`}`);

  try {
    if (await handleApi(requestUrl, response)) return;
    await handleStatic(requestUrl, response);
  } catch (error) {
    sendJson(response, 502, { error: error.message });
  }
});

server.listen(port, () => {
  console.log(`HYROX Gym Finder running at http://localhost:${port}`);
});
