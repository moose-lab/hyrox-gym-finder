import {
  buildHyroxCnUrl,
  createUserSearch,
  filterGyms,
  normalizeHyroxCnResponse,
  rankGyms,
} from "./hyrox.mjs";

const form = document.querySelector("#search-form");
const statusNode = document.querySelector("#status");
const summaryNode = document.querySelector("#summary");
const mapNode = document.querySelector("#map");
const resultsNode = document.querySelector("#results");
const resultCountNode = document.querySelector("#result-count");
const sourcePillNode = document.querySelector("#source-pill");
const fileInput = document.querySelector("#json-file");
const useLocationButton = document.querySelector("#use-location");
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
  lastSearch: createUserSearch({ label: "Shanghai", query: "上海", lat: 31.2304, lng: 121.4737 }),
  source: "Not loaded",
};

const numberOrNull = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

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

const clampLimit = () => Math.min(500, Math.max(1, Number.parseInt(fields.limit.value, 10) || 50));

const currentOrigin = () => ({
  lat: numberOrNull(fields.lat.value),
  lng: numberOrNull(fields.lng.value),
});

const currentSearch = () =>
  createUserSearch({
    label: fields.query.value || "Coordinate search",
    query: fields.query.value,
    ...currentOrigin(),
  });

async function fetchLiveGyms() {
  const origin = currentOrigin();
  const limit = clampLimit();
  const url = buildHyroxCnUrl({ ...origin, page: 1, size: limit });
  const response = await fetch(url, { mode: "cors", credentials: "omit" });

  if (!response.ok) {
    throw new Error(`HYROXCN API returned ${response.status}`);
  }

  const payload = await response.json();
  const gyms = normalizeHyroxCnResponse(payload);
  return { gyms, total: payload?.data?.totalElements ?? gyms.length };
}

function applySearch({ gyms = state.gyms, source = state.source, total = gyms.length } = {}) {
  state.gyms = gyms;
  state.source = source;
  state.lastSearch = currentSearch();

  const filtered = filterGyms(gyms, state.lastSearch.query);
  state.filtered = rankGyms(filtered, currentOrigin()).slice(0, clampLimit());

  render(total);
}

function render(total = state.gyms.length) {
  const nearest = state.filtered.find((gym) => Number.isFinite(gym.distanceKm));
  const cities = new Set(state.filtered.map((gym) => gym.city).filter(Boolean));
  const withBooking = state.filtered.filter((gym) => gym.hasBooking).length;

  summaryNode.innerHTML = [
    summaryCard("Loaded", `${total}`, "HYROXCN records"),
    summaryCard("Visible", `${state.filtered.length}`, "after filters"),
    summaryCard("Nearest", nearest ? formatDistance(nearest.distanceKm) : "None", nearest?.name ?? "No match"),
    summaryCard("Booking", `${withBooking}`, `${cities.size} cities in view`),
  ].join("");

  resultCountNode.textContent = `${state.filtered.length} results`;
  sourcePillNode.textContent = state.source;

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

function renderMap() {
  if (state.filtered.length === 0) {
    mapNode.innerHTML = '<div class="empty-map">Search results will appear here.</div>';
    return;
  }

  const points = state.filtered.filter((gym) => Number.isFinite(gym.lat) && Number.isFinite(gym.lng));
  if (points.length === 0) {
    mapNode.innerHTML = '<div class="empty-map">Matched gyms do not include coordinates.</div>';
    return;
  }

  const lats = points.map((gym) => gym.lat);
  const lngs = points.map((gym) => gym.lng);
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

  const origin = currentOrigin();
  const originPoint =
    Number.isFinite(origin.lat) && Number.isFinite(origin.lng)
      ? project({ lat: origin.lat, lng: origin.lng })
      : null;

  const circles = points
    .map((gym, index) => {
      const { x, y } = project(gym);
      const radius = index === 0 ? 8 : 5;
      return `<circle cx="${x}" cy="${y}" r="${radius}" class="gym-dot"><title>${escapeHtml(gym.name)}</title></circle>`;
    })
    .join("");

  const originMarkup = originPoint
    ? `<circle cx="${originPoint.x}" cy="${originPoint.y}" r="9" class="origin-dot"><title>Your search origin</title></circle>`
    : "";

  mapNode.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Relative map of matched HYROX gyms">
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

  return `
    <article class="result-card">
      <div class="rank">${index + 1}</div>
      <div class="result-body">
        <div class="result-title">
          <h3>${escapeHtml(gym.name)}</h3>
          <span>${escapeHtml(formatDistance(gym.distanceKm))}</span>
        </div>
        <p>${escapeHtml([gym.city, gym.county].filter(Boolean).join(" · "))}</p>
        <p>${escapeHtml(gym.address)}</p>
        <div class="chips">
          <span>Certified ${escapeHtml(gym.status)}</span>
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

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("Loading HYROXCN certified gyms...", "neutral");

  try {
    const { gyms, total } = await fetchLiveGyms();
    applySearch({ gyms, source: "HYROXCN live API", total });
    setStatus(`Loaded ${gyms.length} live HYROXCN gyms.`, "success");
  } catch (error) {
    applySearch();
    setStatus(`${error.message}. You can still import a saved HYROXCN JSON export.`, "error");
  }
});

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  try {
    const payload = JSON.parse(await file.text());
    const gyms = normalizeHyroxCnResponse(payload);
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
  if (!navigator.geolocation) {
    setStatus("This browser does not support geolocation. Enter coordinates manually.", "error");
    return;
  }

  setStatus("Requesting browser location...", "neutral");
  navigator.geolocation.getCurrentPosition(
    (position) => {
      fields.lat.value = position.coords.latitude.toFixed(6);
      fields.lng.value = position.coords.longitude.toFixed(6);
      setStatus("Location filled. Search the live API when ready.", "success");
    },
    () => {
      setStatus("Location permission was denied or unavailable. Enter coordinates manually.", "error");
    },
    { timeout: 10000, maximumAge: 30000 },
  );
});

render(0);
