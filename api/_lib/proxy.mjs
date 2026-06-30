import {
  buildHyrox365GymDetailUrl,
  buildHyrox365MapUrl,
  buildNominatimReverseUrl,
  buildNominatimSearchUrl,
} from "../../src/hyrox.mjs";

const NOMINATIM_USER_AGENT = "hyrox-gym-finder/0.1 (+https://github.com/moose-lab/hyrox-gym-finder)";

const jsonResponse = (status, payload) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    },
  });

const routePathFromRequest = (requestUrl) => {
  const rewritePath = requestUrl.searchParams.get("path");
  if (rewritePath) return rewritePath.replace(/^\/+|\/+$/g, "");
  return requestUrl.pathname.replace(/^\/api\/?/, "").replace(/^\/+|\/+$/g, "");
};

const proxyJson = async (targetUrl, { fetchImpl, headers = {} } = {}) => {
  let upstreamResponse;
  try {
    upstreamResponse = await fetchImpl(targetUrl.href, {
      headers: {
        accept: "application/json",
        ...headers,
      },
    });
  } catch {
    return jsonResponse(502, { error: "Upstream request failed" });
  }

  const body = await upstreamResponse.text();

  return new Response(body, {
    status: upstreamResponse.status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    },
  });
};

export async function handleProxyRequest(request, { fetchImpl = fetch } = {}) {
  if (request.method !== "GET") {
    return jsonResponse(405, { error: "Only GET requests are supported" });
  }

  const requestUrl = new URL(request.url);
  const routePath = routePathFromRequest(requestUrl);

  if (routePath === "geocode/search") {
    const query = requestUrl.searchParams.get("q");
    if (!query) return jsonResponse(400, { error: "Missing q search parameter" });

    return proxyJson(buildNominatimSearchUrl(query), {
      fetchImpl,
      headers: { "user-agent": NOMINATIM_USER_AGENT },
    });
  }

  if (routePath === "geocode/reverse") {
    const lat = requestUrl.searchParams.get("lat");
    const lng = requestUrl.searchParams.get("lng");
    if (!lat || !lng) return jsonResponse(400, { error: "Missing lat or lng search parameter" });

    return proxyJson(buildNominatimReverseUrl({ lat, lng }), {
      fetchImpl,
      headers: { "user-agent": NOMINATIM_USER_AGENT },
    });
  }

  if (routePath === "hyrox365/gyms/map") {
    const lat = requestUrl.searchParams.get("latitude") || requestUrl.searchParams.get("lat");
    const lng = requestUrl.searchParams.get("longitude") || requestUrl.searchParams.get("lng");
    const radiusMeters = Number(requestUrl.searchParams.get("radiusMeters"));
    const radiusKm = Number.isFinite(radiusMeters) ? radiusMeters / 1000 : 50;
    const limit = requestUrl.searchParams.get("limit") || 20;

    if (!lat || !lng) return jsonResponse(400, { error: "Missing latitude or longitude search parameter" });

    return proxyJson(buildHyrox365MapUrl({ lat, lng, radiusKm, limit }), { fetchImpl });
  }

  const detailMatch = routePath.match(/^hyrox365\/gyms\/([^/]+)$/);
  if (detailMatch) {
    return proxyJson(buildHyrox365GymDetailUrl(decodeURIComponent(detailMatch[1])), { fetchImpl });
  }

  return jsonResponse(404, { error: "Unknown API route" });
}
