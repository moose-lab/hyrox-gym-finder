import {
  buildHyroxCnUrl,
  buildRegionOptions,
  chooseHyroxCnFetchSize,
  createUserSearch,
  describeLocationSearchFailure,
  findNearbyCertifiedGyms,
  normalizeHyroxCnResponse,
} from "./hyrox.mjs?v=20260630-nearby-default";

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
  limit: document.querySelector("#limit"),
};

const state = {
  gyms: [],
  filtered: [],
  regionOptions: [],
  selectedCity: "",
  selectedCounty: "",
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

const formatDistance = (km) => {
  if (!Number.isFinite(km)) return "Distance unknown";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(km < 10 ? 1 : 0)} km`;
};

const formatCoordinates = (gym) => {
  if (!Number.isFinite(gym.lat) || !Number.isFinite(gym.lng)) return "Coordinates unavailable";
  return `${gym.lat.toFixed(5)}, ${gym.lng.toFixed(5)}`;
};

const clampLimit = () => Math.min(500, Math.max(1, Number.parseInt(fields.limit.value, 10) || 50));

const currentOrigin = () => ({
  lat: numberOrNull(fields.lat.value),
  lng: numberOrNull(fields.lng.value),
});

const hasOrigin = () => {
  const origin = currentOrigin();
  return Number.isFinite(origin.lat) && Number.isFinite(origin.lng);
};

const activeQueryText = () => cleanText(fields.query.value);

const currentSearch = () => {
  const label = [hasOrigin() ? "GPS nearby" : "", state.selectedCity, state.selectedCounty, activeQueryText()]
    .filter(Boolean)
    .join(" / ");

  return createUserSearch({
    label: label || "HYROXCN search",
    query: activeQueryText(),
    ...currentOrigin(),
  });
};

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

function applySearch({ gyms = state.gyms, source = state.source, total = state.total || gyms.length } = {}) {
  state.gyms = gyms;
  state.source = source;
  state.total = total;
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

async function searchLiveGyms({ statusPrefix = "Loading HYROXCN certified gyms" } = {}) {
  setStatus(`${statusPrefix}...`, "neutral");

  const { gyms, total } = await fetchLiveGyms();
  applySearch({ gyms, source: "HYROXCN live API", total });

  const locationText = hasOrigin() ? "nearest to your current GPS position" : "from HYROXCN";
  setStatus(`Showing ${state.filtered.length} certified gyms ${locationText}.`, "success");
}

function render(total = state.total || state.gyms.length) {
  const nearest = state.filtered.find((gym) => Number.isFinite(gym.distanceKm));
  const cities = new Set(state.filtered.map((gym) => gym.city).filter(Boolean));
  const withBooking = state.filtered.filter((gym) => gym.hasBooking).length;
  const originLabel = hasOrigin() ? "GPS ready" : "No GPS";
  const regionLabel = [state.selectedCity, state.selectedCounty].filter(Boolean).join(" / ") || "All cities";

  summaryNode.innerHTML = [
    summaryCard("Origin", originLabel, hasOrigin() ? "distance ranking active" : "enter coordinates or allow GPS"),
    summaryCard("Loaded", `${total}`, "HYROXCN certified records"),
    summaryCard("Nearest", nearest ? formatDistance(nearest.distanceKm) : "None", nearest?.name ?? "No match"),
    summaryCard("Filters", `${state.filtered.length}`, `${regionLabel} / ${cities.size} cities / ${withBooking} booking`),
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
    cityTagsNode.innerHTML = '<span class="tag-empty">Load HYROXCN data to choose city tags.</span>';
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
    mapNode.innerHTML = '<div class="empty-map">Allow GPS or search a city to show nearby HYROX gyms.</div>';
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
    ? `<circle cx="${project(originForBounds).x}" cy="${project(originForBounds).y}" r="9" class="origin-dot"><title>Your GPS position</title></circle>`
    : "";

  mapNode.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Relative map of matched HYROX gyms and your GPS origin">
      <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="0" class="map-bg"></rect>
      <path d="M ${pad} ${height / 2} H ${width - pad} M ${width / 2} ${pad} V ${height - pad}" class="map-grid"></path>
      ${circles}
      ${originMarkup}
    </svg>
  `;
}

function renderResults() {
  if (state.filtered.length === 0) {
    resultsNode.replaceChildren(emptyTemplate.content.cloneNode(true));
    return;
  }

  resultsNode.innerHTML = state.filtered.map(resultCard).join("");
}

function resultCard(gym, index) {
  const mapsUrl =
    Number.isFinite(gym.lat) && Number.isFinite(gym.lng)
      ? `https://www.openstreetmap.org/?mlat=${gym.lat}&mlon=${gym.lng}#map=16/${gym.lat}/${gym.lng}`
      : "";
  const region = [gym.province, gym.city, gym.county].filter(Boolean).join(" / ") || "Region unavailable";

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
            <dd>${escapeHtml(gym.status || "VALID")}</dd>
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
            <dd>${escapeHtml(gym.source || "HYROXCN")}</dd>
          </div>
        </dl>
        <div class="chips">
          <span>HYROX certified</span>
          ${gym.hasFitnessTest ? "<span>Fitness test</span>" : ""}
          ${gym.hasBooking ? "<span>Booking path</span>" : ""}
          ${gym.imageCount ? `<span>${gym.imageCount} images</span>` : ""}
        </div>
        ${
          mapsUrl
            ? `<a class="map-link" href="${mapsUrl}" target="_blank" rel="noreferrer">Open map</a>`
            : ""
        }
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

  try {
    await searchLiveGyms({ statusPrefix: "GPS found. Loading nearest HYROXCN gyms" });
  } catch (error) {
    setStatus(describeLocationSearchFailure(error, { automatic, stage: "api" }), "error");
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    await searchLiveGyms();
  } catch (error) {
    applySearch();
    setStatus(`${error.message}. You can still import a saved HYROXCN JSON export.`, "error");
  }
});

fields.query.addEventListener("input", () => {
  if (state.gyms.length === 0) return;
  applySearch();
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
    fields.query.value = "";
    applySearch({ gyms, source: "Imported JSON", total: payload?.data?.totalElements ?? gyms.length });
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
