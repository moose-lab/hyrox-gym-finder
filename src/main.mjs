import {
  buildHyrox365GymFinderSearchUrl,
  buildHyroxCnUrl,
  buildRegionOptions,
  buildNominatimReverseJsonpUrl,
  buildNominatimSearchJsonpUrl,
  chooseHyroxCnFetchSize,
  createUserSearch,
  describeLocationSearchFailure,
  findNearbyCertifiedGyms,
  isStaticApiFallbackResponse,
  mergeHyrox365GymDetails,
  normalizeGeocodeFeature,
  normalizeHyrox365MapResponse,
  normalizeHyroxCnResponse,
} from "./hyrox.mjs?v=20260630-static-fallback";

const form = document.querySelector("#search-form");
const statusNode = document.querySelector("#status");
const summaryNode = document.querySelector("#summary");
const mapNode = document.querySelector("#map");
const resultsNode = document.querySelector("#results");
const resultCountNode = document.querySelector("#result-count");
const sourcePillNode = document.querySelector("#source-pill");
const fileInput = document.querySelector("#json-file");
const useLocationButton = document.querySelector("#use-location");
const cityTagsNode = document.querySelector("#city-tags");
const countyTagsNode = document.querySelector("#county-tags");
const clearRegionButton = document.querySelector("#clear-region");
const emptyTemplate = document.querySelector("#empty-template");

const fields = {
  query: document.querySelector("#query"),
  lat: document.querySelector("#lat"),
  lng: document.querySelector("#lng"),
  radius: document.querySelector("#radius"),
  limit: document.querySelector("#limit"),
};

const state = {
  gyms: [],
  filtered: [],
  regionOptions: [],
  selectedCity: "",
  selectedCounty: "",
  place: null,
  filterQuery: true,
  apiProxyUnavailable: false,
  staticFallbackUrl: "",
  staticFallbackLabel: "",
  lastSearch: createUserSearch({ label: "GPS nearby" }),
  source: "Not loaded",
  total: 0,
};

const numberOrNull = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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

const formatDistance = (km) => {
  if (!Number.isFinite(km)) return "Distance unknown";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(km < 10 ? 1 : 0)} km`;
};

const formatCoordinates = (gym) => {
  if (!Number.isFinite(gym.lat) || !Number.isFinite(gym.lng)) return "Coordinates unavailable";
  return `${gym.lat.toFixed(5)}, ${gym.lng.toFixed(5)}`;
};

const clampLimit = () => Math.min(500, Math.max(1, Number.parseInt(fields.limit.value, 10) || 20));

const clampRadiusKm = () => Math.min(500, Math.max(1, Number.parseFloat(fields.radius.value) || 50));

const currentOrigin = () => ({
  lat: numberOrNull(fields.lat.value),
  lng: numberOrNull(fields.lng.value),
});

const hasOrigin = () => {
  const origin = currentOrigin();
  return Number.isFinite(origin.lat) && Number.isFinite(origin.lng);
};

const activeQueryText = () => cleanText(fields.query.value);

const isStaticApiUnavailableError = (error) => Boolean(error?.staticApiUnavailable);

const createStaticApiUnavailableError = () => {
  const error = new Error(
    "This static deployment does not include the HYROX365 API proxy required for in-app results.",
  );
  error.name = "StaticApiUnavailableError";
  error.staticApiUnavailable = true;
  return error;
};

const clearStaticFallback = () => {
  state.staticFallbackUrl = "";
  state.staticFallbackLabel = "";
};

const currentLocationLabel = () => {
  if (state.place?.shortLabel) return state.place.shortLabel;
  if (state.place?.label) return state.place.label;
  if (hasOrigin()) return "Current GPS position";
  return "";
};

const currentSearch = () => {
  const query = state.filterQuery ? activeQueryText() : "";
  const label = [currentLocationLabel(), state.selectedCity, state.selectedCounty, query].filter(Boolean).join(" / ");

  return createUserSearch({
    label: label || "HYROX gym search",
    query,
    ...currentOrigin(),
  });
};

const apiUrl = (path) => new URL(path, window.location.origin);

const isStaticPagesDeployment = () =>
  window.location.hostname.endsWith("github.io") || window.location.protocol === "file:";

async function fetchJson(url) {
  const response = await fetch(url, { credentials: "same-origin" });
  const text = await response.text();
  const contentType = response.headers.get("content-type") || "";

  if (!response.ok) {
    if (isStaticApiFallbackResponse({ status: response.status, contentType, body: text })) {
      throw createStaticApiUnavailableError();
    }

    const preview = contentType.includes("text/html") ? "HTML error page" : text.slice(0, 140);
    throw new Error(`${url.pathname} returned ${response.status}${preview ? `: ${preview}` : ""}`);
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
    if (!isStaticApiUnavailableError(error)) throw error;
    state.apiProxyUnavailable = true;
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
    if (!isStaticApiUnavailableError(error)) throw error;
    state.apiProxyUnavailable = true;
    return reverseGeocodeJsonp(origin);
  }
}

function applyPlace(place, { updateQuery = true } = {}) {
  if (!place) return;

  state.place = place;
  state.filterQuery = false;
  fields.lat.value = String(place.lat);
  fields.lng.value = String(place.lng);

  if (updateQuery) {
    fields.query.value = place.shortLabel || place.label;
  }
}

async function fetchLiveGyms() {
  const origin = currentOrigin();
  const limit = clampLimit();
  const textOrRegion = [activeQueryText(), state.selectedCity, state.selectedCounty].filter(Boolean).join(" ");
  const size = textOrRegion ? 500 : chooseHyroxCnFetchSize({ query: "", limit: Math.max(limit, 500) });
  const url = buildHyroxCnUrl({ ...origin, page: 1, size });
  const response = await fetch(url, { mode: "cors", credentials: "omit" });

  if (!response.ok) {
    throw new Error(`HYROXCN API returned ${response.status}`);
  }

  const payload = await response.json();
  const gyms = normalizeHyroxCnResponse(payload);
  return { gyms, total: payload?.data?.totalElements ?? gyms.length };
}

async function fetchHyrox365Gyms() {
  const origin = currentOrigin();
  const radiusKm = clampRadiusKm();
  const limit = clampLimit();
  const url = apiUrl("/api/hyrox365/gyms/map");
  url.searchParams.set("latitude", String(origin.lat));
  url.searchParams.set("longitude", String(origin.lng));
  url.searchParams.set("radiusMeters", String(Math.round(radiusKm * 1000)));
  url.searchParams.set("limit", String(limit));

  const payload = await fetchJson(url);
  let gyms = normalizeHyrox365MapResponse(payload, {
    origin,
    label: currentLocationLabel() || activeQueryText() || "Current GPS position",
    radiusKm,
    limit,
  });

  const detailLimit = Math.min(gyms.length, limit, 10);
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

function showStaticProxyFallback() {
  const label = currentLocationLabel() || activeQueryText() || "this location";
  const origin = currentOrigin();
  state.staticFallbackLabel = label;
  state.staticFallbackUrl = hasOrigin()
    ? buildHyrox365GymFinderSearchUrl({
        origin,
        label,
        radiusKm: clampRadiusKm(),
        limit: clampLimit(),
      }).href
    : "";
  applySearch({ gyms: [], source: "Static page needs API proxy", total: 0, filterQuery: false });
  setStatus(
    "This GitHub Pages build is static, so in-app HYROX365 results need a hosted API proxy. Use the official HYROX Finder link below for live nearby results, or run npm start locally for full detail cards.",
    "error",
  );
}

function applySearch({
  gyms = state.gyms,
  source = state.source,
  total = state.total || gyms.length,
  filterQuery = state.filterQuery,
} = {}) {
  state.gyms = gyms;
  state.source = source;
  state.total = total;
  state.filterQuery = filterQuery;
  state.regionOptions = buildRegionOptions(gyms);
  state.lastSearch = currentSearch();
  state.filtered = findNearbyCertifiedGyms(gyms, {
    origin: currentOrigin(),
    query: state.lastSearch.query,
    city: state.selectedCity,
    county: state.selectedCounty,
    limit: clampLimit(),
  });

  render(total);
}

async function searchLiveGyms({ statusPrefix = "Loading nearby HYROX gyms", allowGeocode = true } = {}) {
  clearStaticFallback();
  if (isStaticPagesDeployment()) state.apiProxyUnavailable = true;

  let globalFilterQuery = false;
  const query = activeQueryText();

  if (allowGeocode && query && state.filterQuery) {
    setStatus(`Resolving "${query}" to a precise place...`, "neutral");
    const place = await geocodeQuery(query);

    if (place) {
      state.selectedCity = "";
      state.selectedCounty = "";
      applyPlace(place);
    } else {
      globalFilterQuery = true;
    }
  }

  if (hasOrigin()) {
    const label = currentLocationLabel() || "your coordinates";
    setStatus(`${statusPrefix} near ${label}...`, "neutral");

    if (state.apiProxyUnavailable) {
      showStaticProxyFallback();
      return;
    }

    try {
      const { gyms, total } = await fetchHyrox365Gyms();
      applySearch({ gyms, source: "HYROX365 global API", total, filterQuery: globalFilterQuery });
      setStatus(`Showing ${state.filtered.length} HYROX gyms within ${clampRadiusKm()} km of ${label}.`, "success");
      return;
    } catch (error) {
      if (isStaticApiUnavailableError(error)) {
        state.apiProxyUnavailable = true;
        showStaticProxyFallback();
        return;
      }

      console.warn(error);
      setStatus(`HYROX365 lookup failed. Trying HYROXCN fallback...`, "neutral");
    }
  }

  const { gyms, total } = await fetchLiveGyms();
  applySearch({ gyms, source: "HYROXCN live API", total, filterQuery: true });

  const locationText = hasOrigin() ? "nearest to your coordinates" : "from HYROXCN";
  setStatus(`Showing ${state.filtered.length} certified gyms ${locationText}.`, "success");
}

function render(total = state.total || state.gyms.length) {
  const nearest = state.filtered.find((gym) => Number.isFinite(gym.distanceKm));
  const cities = new Set(state.filtered.map((gym) => gym.city).filter(Boolean));
  const withContact = state.filtered.filter((gym) => gym.hasContact).length;
  const originLabel = hasOrigin() ? currentLocationLabel() || "GPS ready" : "No GPS";
  const regionLabel = [state.selectedCity, state.selectedCounty].filter(Boolean).join(" / ") || "All cities";

  summaryNode.innerHTML = [
    summaryCard("Origin", originLabel, hasOrigin() ? "distance ranking active" : "enter an address or allow GPS"),
    summaryCard("Loaded", `${total}`, state.source),
    summaryCard("Nearest", nearest ? formatDistance(nearest.distanceKm) : "None", nearest?.name ?? "No match"),
    summaryCard("Filters", `${state.filtered.length}`, `${regionLabel} / ${cities.size} cities / ${withContact} contacts`),
  ].join("");

  resultCountNode.textContent = `${state.filtered.length} results`;
  sourcePillNode.textContent = state.source;

  renderRegionTags();
  renderMap();
  renderResults();
}

function summaryCard(label, value, note) {
  return `
    <article class="summary-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(note)}</small>
    </article>
  `;
}

function renderRegionTags() {
  if (state.regionOptions.length === 0) {
    cityTagsNode.innerHTML = '<span class="tag-empty">Load live data to choose city tags.</span>';
    countyTagsNode.innerHTML = '<span class="tag-empty">Choose a city to reveal district tags.</span>';
    clearRegionButton.disabled = true;
    return;
  }

  clearRegionButton.disabled = !state.selectedCity && !state.selectedCounty;

  cityTagsNode.innerHTML = state.regionOptions
    .slice(0, 24)
    .map((option) =>
      tagButton({
        label: `${option.city} ${option.count}`,
        value: option.city,
        type: "city",
        pressed: option.city === state.selectedCity,
      }),
    )
    .join("");

  const selectedCity = state.regionOptions.find((option) => option.city === state.selectedCity);
  if (!selectedCity) {
    countyTagsNode.innerHTML = '<span class="tag-empty">Select a city tag for district-level filters.</span>';
    return;
  }

  countyTagsNode.innerHTML =
    selectedCity.counties.length === 0
      ? '<span class="tag-empty">This city has no district tags in the loaded data.</span>'
      : selectedCity.counties
          .slice(0, 24)
          .map((option) =>
            tagButton({
              label: `${option.county} ${option.count}`,
              value: option.county,
              type: "county",
              pressed: option.county === state.selectedCounty,
            }),
          )
          .join("");
}

function tagButton({ label, value, type, pressed }) {
  return `
    <button
      type="button"
      class="region-tag${pressed ? " is-active" : ""}"
      data-region-type="${escapeHtml(type)}"
      data-region-value="${escapeHtml(value)}"
      aria-pressed="${pressed ? "true" : "false"}"
    >
      ${escapeHtml(label)}
    </button>
  `;
}

function renderMap() {
  if (state.filtered.length === 0) {
    mapNode.innerHTML = '<div class="empty-map">Allow GPS or search an address to show nearby HYROX gyms.</div>';
    return;
  }

  const points = state.filtered.filter((gym) => Number.isFinite(gym.lat) && Number.isFinite(gym.lng));
  if (points.length === 0) {
    mapNode.innerHTML = '<div class="empty-map">Matched gyms do not include coordinates.</div>';
    return;
  }

  const origin = currentOrigin();
  const originForBounds =
    Number.isFinite(origin.lat) && Number.isFinite(origin.lng) ? { lat: origin.lat, lng: origin.lng } : null;
  const boundsPoints = originForBounds ? [...points, originForBounds] : points;
  const lats = boundsPoints.map((gym) => gym.lat);
  const lngs = boundsPoints.map((gym) => gym.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const width = 720;
  const height = 420;
  const pad = 42;

  const project = (gym) => {
    const xRatio = maxLng === minLng ? 0.5 : (gym.lng - minLng) / (maxLng - minLng);
    const yRatio = maxLat === minLat ? 0.5 : (maxLat - gym.lat) / (maxLat - minLat);
    return {
      x: pad + xRatio * (width - pad * 2),
      y: pad + yRatio * (height - pad * 2),
    };
  };

  const circles = points
    .map((gym, index) => {
      const { x, y } = project(gym);
      const radius = index === 0 ? 8 : 5;
      return `<circle cx="${x}" cy="${y}" r="${radius}" class="gym-dot"><title>${escapeHtml(gym.name)}</title></circle>`;
    })
    .join("");

  const originMarkup = originForBounds
    ? `<circle cx="${project(originForBounds).x}" cy="${project(originForBounds).y}" r="9" class="origin-dot"><title>Search origin</title></circle>`
    : "";

  mapNode.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Relative map of matched HYROX gyms and your search origin">
      <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="0" class="map-bg"></rect>
      <path d="M ${pad} ${height / 2} H ${width - pad} M ${width / 2} ${pad} V ${height - pad}" class="map-grid"></path>
      ${circles}
      ${originMarkup}
    </svg>
  `;
}

function renderResults() {
  if (state.staticFallbackUrl) {
    resultsNode.innerHTML = staticFallbackCard();
    return;
  }

  if (state.filtered.length === 0) {
    resultsNode.replaceChildren(emptyTemplate.content.cloneNode(true));
    return;
  }

  resultsNode.innerHTML = state.filtered.map(resultCard).join("");
}

function staticFallbackCard() {
  return `
    <article class="static-fallback-card">
      <h3>Open official HYROX results</h3>
      <p>
        The precise place was resolved as ${escapeHtml(state.staticFallbackLabel || "your search origin")}.
        GitHub Pages cannot run the HYROX365 proxy, so full in-app gym cards require the local server or a hosted proxy deployment.
      </p>
      <a class="map-link" href="${escapeHtml(state.staticFallbackUrl)}" target="_blank" rel="noreferrer">
        Open HYROX Finder
      </a>
    </article>
  `;
}

function resultCard(gym, index) {
  const mapsUrl =
    Number.isFinite(gym.lat) && Number.isFinite(gym.lng)
      ? `https://www.openstreetmap.org/?mlat=${gym.lat}&mlon=${gym.lng}#map=16/${gym.lat}/${gym.lng}`
      : "";
  const region = [gym.province, gym.city, gym.county].filter(Boolean).join(" / ") || "Region unavailable";
  const websiteUrl = safeExternalUrl(gym.website);
  const sourceUrl = safeExternalUrl(gym.sourceUrl);
  const amenities = Array.isArray(gym.amenities) ? gym.amenities.slice(0, 6) : [];
  const openingHours = Array.isArray(gym.openingHours) ? gym.openingHours.slice(0, 4) : [];

  return `
    <article class="result-card">
      <div class="rank">${index + 1}</div>
      <div class="result-body">
        <div class="result-title">
          <h3>${escapeHtml(gym.name)}</h3>
          <span>${escapeHtml(formatDistance(gym.distanceKm))}</span>
        </div>
        <p class="result-region">${escapeHtml(region)}</p>
        <p>${escapeHtml(gym.address || "Address unavailable")}</p>
        <dl class="detail-grid">
          <div>
            <dt>Certification</dt>
            <dd>${escapeHtml(gym.certification || gym.status || "VALID")}</dd>
          </div>
          <div>
            <dt>Gym code</dt>
            <dd>${escapeHtml(gym.code || "Not listed")}</dd>
          </div>
          <div>
            <dt>Coordinates</dt>
            <dd>${escapeHtml(formatCoordinates(gym))}</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>${escapeHtml(gym.source || "HYROX")}</dd>
          </div>
          ${
            gym.phone
              ? `<div><dt>Phone</dt><dd>${escapeHtml(gym.phone)}</dd></div>`
              : ""
          }
          ${
            gym.email
              ? `<div><dt>Email</dt><dd>${escapeHtml(gym.email)}</dd></div>`
              : ""
          }
        </dl>
        <div class="chips">
          <span>HYROX certified</span>
          ${gym.htcx ? "<span>HTCX</span>" : ""}
          ${gym.hasFitnessTest ? "<span>Fitness test</span>" : ""}
          ${gym.hasBooking ? "<span>Booking path</span>" : ""}
          ${gym.hasContact ? "<span>Contact listed</span>" : ""}
          ${gym.imageCount ? `<span>${gym.imageCount} images</span>` : ""}
          ${amenities.map((amenity) => `<span>${escapeHtml(amenity)}</span>`).join("")}
        </div>
        ${
          openingHours.length
            ? `<div class="hours-list"><strong>Opening hours</strong>${openingHours
                .map((entry) => `<span>${escapeHtml(entry)}</span>`)
                .join("")}</div>`
            : ""
        }
        <div class="result-links">
          ${mapsUrl ? `<a class="map-link" href="${mapsUrl}" target="_blank" rel="noreferrer">Open map</a>` : ""}
          ${websiteUrl ? `<a class="map-link" href="${escapeHtml(websiteUrl)}" target="_blank" rel="noreferrer">Website</a>` : ""}
          ${
            sourceUrl
              ? `<a class="map-link" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noreferrer">HYROX profile</a>`
              : ""
          }
        </div>
      </div>
    </article>
  `;
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
  setStatus(automatic ? "Requesting GPS so the default search can rank nearby gyms..." : "Requesting GPS...", "neutral");

  let position;
  try {
    position = await getBrowserPosition();
  } catch (error) {
    setStatus(describeLocationSearchFailure(error, { automatic, stage: "geolocation" }), "error");
    return;
  }

  fields.lat.value = position.coords.latitude.toFixed(6);
  fields.lng.value = position.coords.longitude.toFixed(6);
  state.place = {
    id: "browser-gps",
    label: "Current GPS position",
    shortLabel: "Current GPS position",
    lat: numberOrNull(fields.lat.value),
    lng: numberOrNull(fields.lng.value),
    source: "Browser GPS",
  };
  state.filterQuery = false;

  try {
    const precisePlace = await reverseGeocode(currentOrigin());
    if (precisePlace) applyPlace(precisePlace);
  } catch {
    fields.query.value = state.place.shortLabel;
  }

  try {
    await searchLiveGyms({ statusPrefix: "GPS found. Loading nearest HYROX gyms", allowGeocode: false });
  } catch (error) {
    setStatus(describeLocationSearchFailure(error, { automatic, stage: "api" }), "error");
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  state.filterQuery = Boolean(activeQueryText());

  try {
    await searchLiveGyms();
  } catch (error) {
    applySearch();
    setStatus(`${error.message}. You can still import a saved HYROXCN JSON export.`, "error");
  }
});

fields.query.addEventListener("input", () => {
  state.filterQuery = true;
  state.place = null;
  clearStaticFallback();
  if (state.gyms.length === 0) return;
  applySearch({ filterQuery: true });
});

cityTagsNode.addEventListener("click", (event) => {
  const button = event.target.closest("[data-region-type='city']");
  if (!button) return;

  const city = button.dataset.regionValue;
  state.selectedCity = state.selectedCity === city ? "" : city;
  state.selectedCounty = "";
  applySearch();
});

countyTagsNode.addEventListener("click", (event) => {
  const button = event.target.closest("[data-region-type='county']");
  if (!button) return;

  const county = button.dataset.regionValue;
  state.selectedCounty = state.selectedCounty === county ? "" : county;
  applySearch();
});

clearRegionButton.addEventListener("click", () => {
  state.selectedCity = "";
  state.selectedCounty = "";
  applySearch();
});

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  try {
    const payload = JSON.parse(await file.text());
    const gyms = normalizeHyroxCnResponse(payload);
    state.selectedCity = "";
    state.selectedCounty = "";
    state.place = null;
    state.filterQuery = true;
    state.apiProxyUnavailable = false;
    clearStaticFallback();
    fields.query.value = "";
    applySearch({ gyms, source: "Imported JSON", total: payload?.data?.totalElements ?? gyms.length, filterQuery: true });
    setStatus(`Imported ${gyms.length} valid gyms from ${file.name}.`, "success");
  } catch (error) {
    setStatus(`Could not import JSON: ${error.message}`, "error");
  } finally {
    fileInput.value = "";
  }
});

useLocationButton.addEventListener("click", () => {
  locateAndSearch();
});

render(0);
locateAndSearch({ automatic: true });
