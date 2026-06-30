import {
  buildHyrox365GymFinderSearchUrl,
  buildNominatimReverseJsonpUrl,
  buildNominatimSearchJsonpUrl,
  createNearbyGymMapView,
  describeLocationSearchFailure,
  isStaticApiFallbackResponse,
  mergeHyrox365GymDetails,
  normalizeGeocodeFeature,
  normalizeHyrox365MapResponse,
  shouldUseGeocodeJsonpFallback,
} from "./hyrox.mjs?v=20260630-map-results";

const RADIUS_KM = 50;
const RESULT_LIMIT = 20;

const form = document.querySelector("#search-form");
const statusNode = document.querySelector("#status");
const mapNode = document.querySelector("#map");
const resultsNode = document.querySelector("#results");
const resultCountNode = document.querySelector("#result-count");
const useLocationButton = document.querySelector("#use-location");
const emptyTemplate = document.querySelector("#empty-template");

const fields = {
  query: document.querySelector("#query"),
};

const state = {
  gyms: [],
  results: [],
  selectedGym: null,
  selectedGymId: "",
  place: null,
  apiProxyUnavailable: false,
  staticFallbackUrl: "",
  staticFallbackLabel: "",
  total: 0,
};

const cleanText = (value) => String(value ?? "").trim();

const setStatus = (message, tone = "neutral") => {
  statusNode.textContent = message;
  statusNode.dataset.tone = tone;
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const safeExternalUrl = (value) => {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
};

const numberOrNull = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const formatDistance = (km) => {
  if (!Number.isFinite(km)) return "Distance unknown";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(km < 10 ? 1 : 0)} km`;
};

const formatCoordinates = (gym) => {
  if (!Number.isFinite(gym?.lat) || !Number.isFinite(gym?.lng)) return "Coordinates unavailable";
  return `${gym.lat.toFixed(5)}, ${gym.lng.toFixed(5)}`;
};

const activeQueryText = () => cleanText(fields.query.value);

const isStaticPagesDeployment = () =>
  window.location.hostname.endsWith("github.io") || window.location.protocol === "file:";

const currentOrigin = () =>
  state.place && Number.isFinite(state.place.lat) && Number.isFinite(state.place.lng)
    ? { lat: state.place.lat, lng: state.place.lng }
    : {};

const hasOrigin = () => {
  const origin = currentOrigin();
  return Number.isFinite(origin.lat) && Number.isFinite(origin.lng);
};

const currentLocationLabel = () => {
  if (state.place?.shortLabel) return state.place.shortLabel;
  if (state.place?.label) return state.place.label;
  if (hasOrigin()) return "Current GPS position";
  return "";
};

const clearStaticFallback = () => {
  state.staticFallbackUrl = "";
  state.staticFallbackLabel = "";
};

const apiUrl = (path) => new URL(path, window.location.origin);

const isStaticApiUnavailableError = (error) => Boolean(error?.staticApiUnavailable);

const createStaticApiUnavailableError = () => {
  const error = new Error("This deployment does not include the HYROX365 API proxy required for in-app results.");
  error.name = "StaticApiUnavailableError";
  error.staticApiUnavailable = true;
  return error;
};

async function fetchJson(url) {
  const response = await fetch(url, { credentials: "same-origin" });
  const text = await response.text();
  const contentType = response.headers.get("content-type") || "";

  if (!response.ok) {
    if (isStaticApiFallbackResponse({ status: response.status, contentType, body: text })) {
      throw createStaticApiUnavailableError();
    }

    const preview = contentType.includes("text/html") ? "HTML error page" : text.slice(0, 140);
    const error = new Error(`${url.pathname} returned ${response.status}${preview ? `: ${preview}` : ""}`);
    error.status = response.status;
    error.apiPath = url.pathname;
    throw error;
  }

  return text ? JSON.parse(text) : null;
}

function loadJsonp(url, callbackName) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Address lookup timed out"));
    }, 12000);

    const cleanup = () => {
      window.clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
    };

    window[callbackName] = (payload) => {
      cleanup();
      resolve(payload);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("Address lookup failed"));
    };
    script.src = url.href;
    document.head.append(script);
  });
}

async function geocodeQueryJsonp(query) {
  const callback = `hyroxGeocodeCallback_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const payload = await loadJsonp(buildNominatimSearchJsonpUrl(query, { callback }), callback);
  const feature = Array.isArray(payload) ? payload[0] : payload;
  return normalizeGeocodeFeature(feature);
}

async function reverseGeocodeJsonp(origin) {
  const callback = `hyroxReverseCallback_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const payload = await loadJsonp(buildNominatimReverseJsonpUrl({ ...origin, callback }), callback);
  return normalizeGeocodeFeature(payload);
}

async function geocodeQuery(query) {
  if (isStaticPagesDeployment()) {
    state.apiProxyUnavailable = true;
    return geocodeQueryJsonp(query);
  }

  const url = apiUrl("/api/geocode/search");
  url.searchParams.set("q", query);

  try {
    const payload = await fetchJson(url);
    const feature = Array.isArray(payload) ? payload[0] : payload;
    return normalizeGeocodeFeature(feature);
  } catch (error) {
    if (!shouldUseGeocodeJsonpFallback(error)) throw error;
    if (error.staticApiUnavailable) state.apiProxyUnavailable = true;
    return geocodeQueryJsonp(query);
  }
}

async function reverseGeocode(origin) {
  if (isStaticPagesDeployment()) {
    state.apiProxyUnavailable = true;
    return reverseGeocodeJsonp(origin);
  }

  const url = apiUrl("/api/geocode/reverse");
  url.searchParams.set("lat", String(origin.lat));
  url.searchParams.set("lng", String(origin.lng));

  try {
    return normalizeGeocodeFeature(await fetchJson(url));
  } catch (error) {
    if (!shouldUseGeocodeJsonpFallback(error)) throw error;
    if (error.staticApiUnavailable) state.apiProxyUnavailable = true;
    return reverseGeocodeJsonp(origin);
  }
}

function applyPlace(place, { updateQuery = true } = {}) {
  if (!place) return;

  state.place = place;
  if (updateQuery) fields.query.value = place.shortLabel || place.label;
}

async function fetchHyrox365Gyms() {
  const origin = currentOrigin();
  const url = apiUrl("/api/hyrox365/gyms/map");
  url.searchParams.set("latitude", String(origin.lat));
  url.searchParams.set("longitude", String(origin.lng));
  url.searchParams.set("radiusMeters", String(Math.round(RADIUS_KM * 1000)));
  url.searchParams.set("limit", String(RESULT_LIMIT));

  const payload = await fetchJson(url);
  let gyms = normalizeHyrox365MapResponse(payload, {
    origin,
    label: currentLocationLabel() || activeQueryText() || "Current GPS position",
    radiusKm: RADIUS_KM,
    limit: RESULT_LIMIT,
  });

  const detailLimit = Math.min(gyms.length, RESULT_LIMIT, 10);
  const detailedGyms = await Promise.all(
    gyms.slice(0, detailLimit).map(async (gym) => {
      try {
        const detailPayload = await fetchJson(apiUrl(`/api/hyrox365/gyms/${encodeURIComponent(gym.id)}`));
        return mergeHyrox365GymDetails(gym, detailPayload);
      } catch {
        return gym;
      }
    }),
  );
  const detailsById = new Map(detailedGyms.map((gym) => [gym.id, gym]));
  gyms = gyms.map((gym) => detailsById.get(gym.id) ?? gym);

  return { gyms, total: payload?.gyms?.length ?? gyms.length };
}

function refreshGymView() {
  const view = createNearbyGymMapView(state.gyms, {
    origin: currentOrigin(),
    selectedId: state.selectedGymId,
    limit: RESULT_LIMIT,
  });

  state.results = view.results;
  state.selectedGym = view.selectedGym;
  state.selectedGymId = view.selectedGym?.id ?? "";
  render();
}

function applyGymResults({ gyms = [], total = gyms.length } = {}) {
  state.gyms = gyms;
  state.total = total;
  state.selectedGymId = "";
  clearStaticFallback();
  refreshGymView();
}

function showStaticProxyFallback() {
  const label = currentLocationLabel() || activeQueryText() || "this location";
  state.staticFallbackLabel = label;
  state.staticFallbackUrl = hasOrigin()
    ? buildHyrox365GymFinderSearchUrl({
        origin: currentOrigin(),
        label,
        radiusKm: RADIUS_KM,
        limit: RESULT_LIMIT,
      }).href
    : "";
  state.gyms = [];
  state.results = [];
  state.selectedGym = null;
  state.selectedGymId = "";
  state.total = 0;
  render();
  setStatus(
    "This GitHub Pages build is static, so the interactive map needs a hosted HYROX365 proxy. Open the official HYROX Finder link in the results list for live nearby gyms.",
    "error",
  );
}

async function searchNearby({ statusPrefix = "Loading nearest HYROX gyms", allowGeocode = true } = {}) {
  clearStaticFallback();
  if (isStaticPagesDeployment()) state.apiProxyUnavailable = true;

  const query = activeQueryText();
  if (allowGeocode && query) {
    setStatus(`Resolving "${query}" to a precise place...`, "neutral");
    const place = await geocodeQuery(query);
    if (place) applyPlace(place);
  }

  if (!hasOrigin()) {
    setStatus("Allow GPS or enter a precise address to rank HYROX gyms by distance.", "error");
    render();
    return;
  }

  const label = currentLocationLabel() || "your location";
  if (state.apiProxyUnavailable) {
    showStaticProxyFallback();
    return;
  }

  setStatus(`${statusPrefix} near ${label}...`, "neutral");

  try {
    const { gyms, total } = await fetchHyrox365Gyms();
    applyGymResults({ gyms, total });
    setStatus(`Showing ${state.results.length} nearest HYROX gyms within ${RADIUS_KM} km of ${label}.`, "success");
  } catch (error) {
    if (isStaticApiUnavailableError(error)) {
      state.apiProxyUnavailable = true;
      showStaticProxyFallback();
      return;
    }

    setStatus(`${error.message}. Try again or open the official HYROX Finder.`, "error");
  }
}

function render() {
  resultCountNode.textContent = state.results.length === 1 ? "1 result" : `${state.results.length} results`;
  renderMap();
  renderResults();
}

function renderMap() {
  const origin = currentOrigin();
  const points = state.results.filter((gym) => Number.isFinite(gym.lat) && Number.isFinite(gym.lng));
  const hasSearchOrigin = Number.isFinite(origin.lat) && Number.isFinite(origin.lng);

  if (points.length === 0) {
    mapNode.innerHTML = `
      <div class="empty-map">
        <strong>${state.staticFallbackUrl ? "Static map unavailable" : "No nearby gyms loaded"}</strong>
        <span>${state.staticFallbackUrl ? "Open the official HYROX Finder from the result list." : "Allow GPS or search an address."}</span>
      </div>
    `;
    return;
  }

  const boundsPoints = hasSearchOrigin ? [...points, origin] : points;
  const lats = boundsPoints.map((point) => point.lat);
  const lngs = boundsPoints.map((point) => point.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const project = (point) => {
    const xRatio = maxLng === minLng ? 0.5 : (point.lng - minLng) / (maxLng - minLng);
    const yRatio = maxLat === minLat ? 0.5 : (maxLat - point.lat) / (maxLat - minLat);
    return {
      x: Math.round((6 + xRatio * 88) * 1000) / 1000,
      y: Math.round((8 + yRatio * 84) * 1000) / 1000,
    };
  };

  const markers = points
    .map((gym, index) => {
      const position = project(gym);
      const selected = gym.id === state.selectedGymId;
      return `
        <button
          type="button"
          class="map-marker${selected ? " is-selected" : ""}"
          data-gym-id="${escapeHtml(gym.id)}"
          style="--x: ${position.x}%; --y: ${position.y}%"
          aria-label="Select ${escapeHtml(gym.name)}"
        >
          <span>${index + 1}</span>
        </button>
      `;
    })
    .join("");

  const originMarker = hasSearchOrigin
    ? `<span class="origin-marker" style="--x: ${project(origin).x}%; --y: ${project(origin).y}%">You</span>`
    : "";

  mapNode.innerHTML = `
    <div class="map-grid-layer" aria-hidden="true"></div>
    ${originMarker}
    ${markers}
    ${mapGymDetail(state.selectedGym)}
  `;
}

function mapGymDetail(gym) {
  if (!gym) return "";

  const websiteUrl = safeExternalUrl(gym.website);
  const sourceUrl = safeExternalUrl(gym.sourceUrl);

  return `
    <article class="map-detail" aria-live="polite">
      <div>
        <span class="detail-kicker">${escapeHtml(formatDistance(gym.distanceKm))}</span>
        <h3>${escapeHtml(gym.name)}</h3>
      </div>
      <p>${escapeHtml(gym.address || "Address unavailable")}</p>
      <dl>
        <div>
          <dt>City</dt>
          <dd>${escapeHtml([gym.city, gym.province].filter(Boolean).join(", ") || "Not listed")}</dd>
        </div>
        <div>
          <dt>Coordinates</dt>
          <dd>${escapeHtml(formatCoordinates(gym))}</dd>
        </div>
        ${gym.phone ? `<div><dt>Phone</dt><dd>${escapeHtml(gym.phone)}</dd></div>` : ""}
        ${gym.email ? `<div><dt>Email</dt><dd>${escapeHtml(gym.email)}</dd></div>` : ""}
      </dl>
      <div class="result-links">
        ${websiteUrl ? `<a class="map-link" href="${escapeHtml(websiteUrl)}" target="_blank" rel="noreferrer">Website</a>` : ""}
        ${sourceUrl ? `<a class="map-link" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noreferrer">HYROX profile</a>` : ""}
      </div>
    </article>
  `;
}

function renderResults() {
  if (state.staticFallbackUrl) {
    resultsNode.innerHTML = staticFallbackCard();
    return;
  }

  if (state.results.length === 0) {
    resultsNode.replaceChildren(emptyTemplate.content.cloneNode(true));
    return;
  }

  resultsNode.innerHTML = state.results.map(resultCard).join("");
}

function staticFallbackCard() {
  return `
    <article class="static-fallback-card">
      <h3>Open official HYROX results</h3>
      <p>
        The precise place was resolved as ${escapeHtml(state.staticFallbackLabel || "your search origin")}.
        This static page cannot run the HYROX365 proxy needed for the interactive map.
      </p>
      <a class="map-link" href="${escapeHtml(state.staticFallbackUrl)}" target="_blank" rel="noreferrer">
        Open HYROX Finder
      </a>
    </article>
  `;
}

function resultCard(gym, index) {
  const selected = gym.id === state.selectedGymId;
  const region = [gym.city, gym.province].filter(Boolean).join(", ") || "Region unavailable";

  return `
    <button type="button" class="result-card${selected ? " is-selected" : ""}" data-gym-id="${escapeHtml(gym.id)}">
      <span class="rank">${index + 1}</span>
      <span class="result-body">
        <span class="result-title">
          <strong>${escapeHtml(gym.name)}</strong>
          <span>${escapeHtml(formatDistance(gym.distanceKm))}</span>
        </span>
        <span class="result-region">${escapeHtml(region)}</span>
        <span class="result-address">${escapeHtml(gym.address || "Address unavailable")}</span>
      </span>
    </button>
  `;
}

function selectGym(gymId) {
  if (!gymId) return;
  state.selectedGymId = gymId;
  refreshGymView();
}

function getBrowserPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("This browser does not support GPS geolocation"));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000, maximumAge: 30000 });
  });
}

async function locateAndSearch({ automatic = false } = {}) {
  setStatus(automatic ? "Requesting GPS to rank nearest HYROX gyms..." : "Requesting GPS...", "neutral");

  let position;
  try {
    position = await getBrowserPosition();
  } catch (error) {
    setStatus(describeLocationSearchFailure(error, { automatic, stage: "geolocation" }), "error");
    return;
  }

  const origin = {
    lat: numberOrNull(position.coords.latitude),
    lng: numberOrNull(position.coords.longitude),
  };
  state.place = {
    id: "browser-gps",
    label: "Current GPS position",
    shortLabel: "Current GPS position",
    ...origin,
    source: "Browser GPS",
  };

  try {
    const precisePlace = await reverseGeocode(origin);
    if (precisePlace) applyPlace(precisePlace);
  } catch {
    fields.query.value = state.place.shortLabel;
  }

  try {
    await searchNearby({ statusPrefix: "GPS found. Loading nearest HYROX gyms", allowGeocode: false });
  } catch (error) {
    setStatus(describeLocationSearchFailure(error, { automatic, stage: "api" }), "error");
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    await searchNearby();
  } catch (error) {
    setStatus(`${error.message}.`, "error");
  }
});

fields.query.addEventListener("input", () => {
  clearStaticFallback();
});

mapNode.addEventListener("click", (event) => {
  const marker = event.target.closest("[data-gym-id]");
  if (!marker) return;
  selectGym(marker.dataset.gymId);
});

resultsNode.addEventListener("click", (event) => {
  const result = event.target.closest("[data-gym-id]");
  if (!result) return;
  selectGym(result.dataset.gymId);
});

useLocationButton.addEventListener("click", () => {
  locateAndSearch();
});

render();
locateAndSearch({ automatic: true });
