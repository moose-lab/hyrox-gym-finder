import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { handleProxyRequest } from "../api/_lib/proxy.mjs";

const jsonUpstreamResponse = (payload, { status = 200 } = {}) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

test("Vercel proxy forwards HYROX365 map requests to the official API", async () => {
  const calls = [];
  const response = await handleProxyRequest(
    new Request(
      "https://hyrox-gym-finder.vercel.app/api/proxy?path=hyrox365/gyms/map&latitude=40.71455&longitude=-73.99735&radiusMeters=50000&limit=20",
    ),
    {
      fetchImpl: async (url, options) => {
        calls.push({ url: new URL(url), options });
        return jsonUpstreamResponse({ success: true, gyms: [] });
      },
    },
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.href, "https://api.prod.hyrox.fiit-tech.net/hyrox365/v1/gyms/map?latitude=40.71455&longitude=-73.99735&radiusMeters=50000&limit=20");
  assert.equal(calls[0].options.headers.accept, "application/json");
});

test("Vercel proxy forwards HYROX365 gym detail requests by id", async () => {
  const calls = [];
  const response = await handleProxyRequest(
    new Request("https://hyrox-gym-finder.vercel.app/api/proxy?path=hyrox365/gyms/HGY_9J9dsQrNbJSpYoPvicHaSUQFl"),
    {
      fetchImpl: async (url) => {
        calls.push(new URL(url));
        return jsonUpstreamResponse({ success: true, gym: { hyroxEntityId: "HGY_9J9dsQrNbJSpYoPvicHaSUQFl" } });
      },
    },
  );

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].href, "https://api.prod.hyrox.fiit-tech.net/hyrox365/v1/gyms/HGY_9J9dsQrNbJSpYoPvicHaSUQFl");
});

test("Vercel proxy identifies the app when geocoding addresses", async () => {
  const calls = [];
  const response = await handleProxyRequest(
    new Request("https://hyrox-gym-finder.vercel.app/api/proxy?path=geocode/search&q=5%20Doyers%20St"),
    {
      fetchImpl: async (url, options) => {
        calls.push({ url: new URL(url), options });
        return jsonUpstreamResponse([{ lat: "40.71455", lon: "-73.99735" }]);
      },
    },
  );

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.href, "https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&q=5+Doyers+St");
  assert.match(calls[0].options.headers["user-agent"], /^hyrox-gym-finder\//);
  assert.equal(calls[0].options.headers.accept, "application/json");
});

test("Vercel proxy rejects non-GET and unknown proxy paths", async () => {
  const postResponse = await handleProxyRequest(new Request("https://hyrox-gym-finder.vercel.app/api/proxy?path=hyrox365/gyms/map", { method: "POST" }));
  const unknownResponse = await handleProxyRequest(new Request("https://hyrox-gym-finder.vercel.app/api/proxy?path=https://example.com"));

  assert.equal(postResponse.status, 405);
  assert.deepEqual(await postResponse.json(), { error: "Only GET requests are supported" });
  assert.equal(unknownResponse.status, 404);
  assert.deepEqual(await unknownResponse.json(), { error: "Unknown API route" });
});

test("Vercel proxy returns JSON when an upstream request fails", async () => {
  const response = await handleProxyRequest(
    new Request("https://hyrox-gym-finder.vercel.app/api/proxy?path=geocode/search&q=5%20Doyers%20St"),
    {
      fetchImpl: async () => {
        throw new Error("connect timeout");
      },
    },
  );

  assert.equal(response.status, 502);
  assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
  assert.deepEqual(await response.json(), { error: "Upstream request failed" });
});

test("Vercel configuration builds static assets and rewrites all API calls to the proxy function", async () => {
  const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

  assert.equal(config.framework, null);
  assert.equal(config.buildCommand, "npm test && npm run build");
  assert.equal(config.outputDirectory, "dist");
  assert.deepEqual(config.rewrites, [
    { source: "/api/geocode/search", destination: "/api/proxy?path=geocode/search" },
    { source: "/api/geocode/reverse", destination: "/api/proxy?path=geocode/reverse" },
    { source: "/api/hyrox365/gyms/map", destination: "/api/proxy?path=hyrox365/gyms/map" },
    { source: "/api/hyrox365/gyms/:gymId", destination: "/api/proxy?path=hyrox365/gyms/:gymId" },
  ]);
  assert.equal(packageJson.scripts.build, "node scripts/build.mjs");
});
