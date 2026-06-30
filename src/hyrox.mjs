export const HYROX_CN_API = "https://api.hyroxcn.com/appapi/fit/gym/query";
export const HYROX365_API = "https://api.prod.hyrox.fiit-tech.net/hyrox365/v1";
export const HYROX365_FINDER_BASE = "https://hyrox-training-finder.hyrox.com/gyms";
export const NOMINATIM_API = "https://nominatim.openstreetmap.org";

const EARTH_RADIUS_KM = 6371.0088;

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const round = (value, decimals = 3) => {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const cleanText = (value) => String(value ?? "").trim();

const clampSize = (value) => Math.min(500, Math.max(1, Number.parseInt(value, 10) || 100));

const clampLimit = (value, fallback = 20) => Math.min(100, Math.max(1, Number.parseInt(value, 10) || fallback));

const splitImages = (value) =>
  cleanText(value)
    .split(",")
    .map((image) => image.trim())
    .filter(Boolean);

const titleCase = (value) =>
  cleanText(value)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const slugify = (value, fallback = "hyrox-gym") => {
  const slug = cleanText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || fallback;
};

const sanitizeJsonpCallback = (value) => {
  const callback = cleanText(value).replace(/[^\w$.]/g, "");
  return callback || "hyroxGeocodeCallback";
};

const imageUrl = (image) => {
  if (typeof image === "string") return cleanText(image);
  return cleanText(image?.url || image?.src || image?.publicUrl || image?.imageUrl);
};

const normalizeImages = (...values) =>
  values
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .map(imageUrl)
    .filter(Boolean);

const formatHyrox365Address = (address = {}) =>
  [
    cleanText(address.street),
    cleanText(address.postalCode),
    cleanText(address.city),
    cleanText(address.state),
    cleanText(address.country),
  ]
    .filter(Boolean)
    .join(", ");

const formatOpeningHours = (openingHours) => {
  if (!openingHours || typeof openingHours !== "object" || Array.isArray(openingHours)) return [];

  return Object.entries(openingHours)
    .filter(([, slots]) => {
      if (Array.isArray(slots)) return slots.some((slot) => cleanText(slot));
      return Boolean(cleanText(slots));
    })
    .map(([day, slots]) => {
      const value = Array.isArray(slots) ? slots.map(cleanText).filter(Boolean).join(", ") : cleanText(slots);
      return `${titleCase(day)}: ${value}`;
    });
};

const formatAmenities = (amenities) => {
  if (Array.isArray(amenities)) {
    return amenities.map((amenity) => titleCase(amenity?.label || amenity?.name || amenity)).filter(Boolean);
  }

  if (!amenities || typeof amenities !== "object") return [];

  return Object.entries(amenities)
    .filter(([, enabled]) => Boolean(enabled))
    .map(([key]) => titleCase(key));
};

export function buildHyroxCnUrl({ lat, lng, page = 1, size = 100 } = {}) {
  const url = new URL(HYROX_CN_API);
  url.searchParams.set("page", String(page));
  url.searchParams.set("size", String(clampSize(size)));

  if (Number.isFinite(Number(lat))) url.searchParams.set("lat", String(lat));
  if (Number.isFinite(Number(lng))) url.searchParams.set("lng", String(lng));

  return url;
}

export function buildNominatimSearchUrl(query, { limit = 1 } = {}) {
  const url = new URL("/search", NOMINATIM_API);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", String(clampLimit(limit, 1)));
  url.searchParams.set("q", cleanText(query));
  return url;
}

export function buildNominatimSearchJsonpUrl(query, { callback = "hyroxGeocodeCallback", limit = 1 } = {}) {
  const url = buildNominatimSearchUrl(query, { limit });
  url.searchParams.set("format", "json");
  url.searchParams.set("json_callback", sanitizeJsonpCallback(callback));
  return url;
}

export function buildNominatimReverseUrl({ lat, lng } = {}) {
  const url = new URL("/reverse", NOMINATIM_API);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  if (Number.isFinite(Number(lat))) url.searchParams.set("lat", String(lat));
  if (Number.isFinite(Number(lng))) url.searchParams.set("lon", String(lng));
  return url;
}

export function buildNominatimReverseJsonpUrl({
  lat,
  lng,
  callback = "hyroxReverseCallback",
} = {}) {
  const url = buildNominatimReverseUrl({ lat, lng });
  url.searchParams.set("format", "json");
  url.searchParams.set("json_callback", sanitizeJsonpCallback(callback));
  return url;
}

export function buildHyrox365MapUrl({ lat, lng, radiusKm = 50, limit = 20 } = {}) {
  const url = new URL(`${HYROX365_API}/gyms/map`);
  if (Number.isFinite(Number(lat))) url.searchParams.set("latitude", String(lat));
  if (Number.isFinite(Number(lng))) url.searchParams.set("longitude", String(lng));
  url.searchParams.set("radiusMeters", String(Math.round((Number(radiusKm) || 50) * 1000)));
  url.searchParams.set("limit", String(clampLimit(limit, 20)));
  return url;
}

export function buildHyrox365GymFinderSearchUrl({ origin = {}, label = "", radiusKm = 50, limit = 20 } = {}) {
  const url = new URL(HYROX365_FINDER_BASE);

  if (Number.isFinite(Number(origin?.lat))) url.searchParams.set("lat", String(origin.lat));
  if (Number.isFinite(Number(origin?.lng))) url.searchParams.set("lng", String(origin.lng));
  if (cleanText(label)) url.searchParams.set("label", cleanText(label));
  url.searchParams.set("radiusKm", String(Number(radiusKm) || 50));
  url.searchParams.set("limit", String(clampLimit(limit, 20)));

  return url;
}

export function buildHyrox365GymDetailUrl(gymId) {
  return new URL(`${HYROX365_API}/gyms/${encodeURIComponent(cleanText(gymId))}`);
}

export function buildHyrox365GymFinderUrl(
  gym,
  { origin = {}, label = "", radiusKm = 50, limit = 20, resultRank = null } = {},
) {
  const citySlug = slugify(gym?.city || gym?.address?.city || "nearby", "nearby");
  const gymSlug = slugify(gym?.name || gym?.gymName, "hyrox-gym");
  const id = cleanText(gym?.id || gym?.hyroxEntityId || gym?.code);
  const url = new URL(`${HYROX365_FINDER_BASE}/${citySlug}/${gymSlug}-${encodeURIComponent(id)}`);

  if (Number.isFinite(Number(origin?.lat))) url.searchParams.set("lat", String(origin.lat));
  if (Number.isFinite(Number(origin?.lng))) url.searchParams.set("lng", String(origin.lng));
  if (cleanText(label)) url.searchParams.set("label", cleanText(label));
  url.searchParams.set("radiusKm", String(Number(radiusKm) || 50));
  url.searchParams.set("limit", String(clampLimit(limit, 20)));
  if (Number.isFinite(Number(resultRank))) url.searchParams.set("resultRank", String(resultRank));

  return url;
}

export function chooseHyroxCnFetchSize({ query = "", limit = 100 } = {}) {
  return cleanText(query) ? 500 : clampSize(limit);
}

export function computeDistanceKm(from, to) {
  const fromLat = toNumber(from?.lat);
  const fromLng = toNumber(from?.lng);
  const toLat = toNumber(to?.lat);
  const toLng = toNumber(to?.lng);

  if ([fromLat, fromLng, toLat, toLng].some((value) => value === null)) return null;

  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const deltaLat = toRadians(toLat - fromLat);
  const deltaLng = toRadians(toLng - fromLng);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(fromLat)) * Math.cos(toRadians(toLat)) * Math.sin(deltaLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isStaticApiFallbackResponse({ status, contentType = "", body = "" } = {}) {
  if (Number(status) !== 404) return false;

  const normalizedContentType = cleanText(contentType).toLowerCase();
  const normalizedBody = cleanText(body).toLowerCase();
  return (
    normalizedContentType.includes("text/html") &&
    (normalizedBody.startsWith("<!doctype html") ||
      normalizedBody.includes("github pages") ||
      normalizedBody.includes("page not found"))
  );
}

export function normalizeGeocodeFeature(feature) {
  if (!feature) return null;

  const lat = toNumber(feature.lat);
  const lng = toNumber(feature.lon ?? feature.lng);
  if (lat === null || lng === null) return null;

  const address = feature.address ?? {};
  const street = [cleanText(address.house_number), cleanText(address.road || address.pedestrian)]
    .filter(Boolean)
    .join(" ");
  const locality = cleanText(
    address.city ||
      address.town ||
      address.village ||
      address.municipality ||
      address.county ||
      address.state_district,
  );
  const stateAndPostcode = [cleanText(address.state), cleanText(address.postcode)].filter(Boolean).join(" ");
  const shortLabel =
    [street, locality, stateAndPostcode].filter(Boolean).join(", ") ||
    cleanText(feature.display_name) ||
    `${lat}, ${lng}`;

  return {
    id: `osm-${cleanText(feature.place_id || feature.osm_id || `${lat},${lng}`)}`,
    label: cleanText(feature.display_name) || shortLabel,
    shortLabel,
    lat,
    lng,
    source: "OpenStreetMap Nominatim",
  };
}

export function normalizeHyroxCnResponse(payload) {
  const content = Array.isArray(payload?.data?.content) ? payload.data.content : [];

  return content
    .filter((gym) => cleanText(gym.status) === "VALID")
    .map((gym) => {
      const distanceMeters = toNumber(gym.distance);
      const images = splitImages(gym.images);

      return {
        id: cleanText(gym.id || gym.code || gym.name),
        name: cleanText(gym.name) || "Unnamed HYROX gym",
        code: cleanText(gym.code),
        status: cleanText(gym.status),
        province: cleanText(gym.provinceName),
        city: cleanText(gym.cityName),
        county: cleanText(gym.countyName),
        address: cleanText(gym.address),
        lat: toNumber(gym.lat),
        lng: toNumber(gym.lng),
        distanceMeters,
        distanceKm: distanceMeters === null ? null : round(distanceMeters / 1000),
        coverImage: cleanText(gym.coverImage),
        imageCount: images.length,
        hasFitnessTest: Boolean(gym.fitnessTestAativity),
        hasBooking: Boolean(gym.bookingAppId || gym.bookingPath),
        bookingAppId: cleanText(gym.bookingAppId),
        bookingPath: cleanText(gym.bookingPath),
        source: "HYROXCN",
      };
    });
}

export function normalizeHyrox365MapResponse(
  payload,
  { origin = {}, label = "", radiusKm = 50, limit = 20 } = {},
) {
  const gyms = Array.isArray(payload?.gyms) ? payload.gyms : [];

  return gyms.map((gym, index) => {
    const id = cleanText(gym.hyroxEntityId || gym.id);
    const address = gym.address ?? {};
    const coordinates = gym.geoCoordinates ?? address.geoCoordinates ?? {};
    const lat = toNumber(coordinates.lat ?? gym.lat);
    const lng = toNumber(coordinates.lon ?? coordinates.lng ?? gym.lng);
    const distanceMeters = toNumber(gym.distanceMeters);
    const images = normalizeImages(gym.cardImage, gym.bannerImage, gym.images);
    const phone = cleanText(address.contactDetails?.phone);
    const email = cleanText(address.contactDetails?.email);
    const website = cleanText(gym.socialMedia?.website);

    const normalized = {
      id,
      name: cleanText(gym.gymName || gym.name) || "Unnamed HYROX gym",
      code: id,
      status: "VALID",
      certification: "HYROX Training Club",
      province: cleanText(address.state),
      city: cleanText(address.city),
      county: "",
      address: formatHyrox365Address(address),
      lat,
      lng,
      distanceMeters,
      distanceKm: distanceMeters === null ? null : round(distanceMeters / 1000),
      coverImage: images[0] ?? "",
      imageCount: images.length,
      hasFitnessTest: false,
      hasBooking: false,
      hasContact: Boolean(phone || email || website),
      phone,
      email,
      website,
      htcx: Boolean(gym.htcx),
      amenities: formatAmenities(gym.amenities),
      openingHours: formatOpeningHours(gym.openingHours),
      source: "HYROX365 global API",
    };

    return {
      ...normalized,
      sourceUrl: buildHyrox365GymFinderUrl(normalized, {
        origin,
        label,
        radiusKm,
        limit,
        resultRank: index + 1,
      }).href,
    };
  });
}

export function mergeHyrox365GymDetails(gym, payload) {
  const detail = payload?.gym ?? payload;
  if (!detail || typeof detail !== "object") return { ...gym };

  const address = detail.address ?? {};
  const coordinates = detail.geoCoordinates ?? address.geoCoordinates ?? {};
  const lat = toNumber(coordinates.lat ?? gym.lat);
  const lng = toNumber(coordinates.lon ?? coordinates.lng ?? gym.lng);
  const images = normalizeImages(detail.cardImage, detail.bannerImage, detail.images);
  const phone = cleanText(address.contactDetails?.phone || gym.phone);
  const email = cleanText(address.contactDetails?.email || gym.email);
  const website = cleanText(detail.socialMedia?.website || gym.website);
  const formattedAddress = formatHyrox365Address(address) || gym.address;

  return {
    ...gym,
    name: cleanText(detail.gymName || detail.name) || gym.name,
    code: cleanText(detail.hyroxEntityId || detail.id) || gym.code,
    province: cleanText(address.state) || gym.province,
    city: cleanText(address.city) || gym.city,
    address: formattedAddress,
    lat,
    lng,
    phone,
    email,
    website,
    hasContact: Boolean(phone || email || website),
    htcx: Boolean(detail.htcx ?? gym.htcx),
    amenities: formatAmenities(detail.amenities).length > 0 ? formatAmenities(detail.amenities) : (gym.amenities ?? []),
    openingHours:
      formatOpeningHours(detail.openingHours).length > 0 ? formatOpeningHours(detail.openingHours) : (gym.openingHours ?? []),
    coverImage: images[0] ?? gym.coverImage ?? "",
    imageCount: images.length || gym.imageCount || 0,
  };
}

export function filterGyms(gyms, query) {
  const needle = cleanText(query).toLowerCase();
  if (!needle) return [...gyms];

  const includesNeedle = (values) =>
    values
      .map(cleanText)
      .join(" ")
      .toLowerCase()
      .includes(needle);

  const regionMatches = gyms.filter((gym) => includesNeedle([gym.province, gym.city, gym.county]));
  if (regionMatches.length > 0) return regionMatches;

  return gyms.filter((gym) =>
    includesNeedle([
      gym.name,
      gym.code,
      gym.province,
      gym.city,
      gym.county,
      gym.address,
      gym.status,
      gym.source,
    ]),
  );
}

const compareCountThenName = (a, b, field) => b.count - a.count || a[field].localeCompare(b[field]);

export function buildRegionOptions(gyms) {
  const cities = new Map();

  for (const gym of gyms) {
    const city = cleanText(gym.city);
    if (!city) continue;

    if (!cities.has(city)) {
      cities.set(city, { city, count: 0, counties: new Map() });
    }

    const entry = cities.get(city);
    const county = cleanText(gym.county);
    entry.count += 1;

    if (county) {
      entry.counties.set(county, (entry.counties.get(county) ?? 0) + 1);
    }
  }

  return [...cities.values()]
    .map((entry) => ({
      city: entry.city,
      count: entry.count,
      counties: [...entry.counties.entries()]
        .map(([county, count]) => ({ county, count }))
        .sort((a, b) => compareCountThenName(a, b, "county")),
    }))
    .sort((a, b) => compareCountThenName(a, b, "city"));
}

export function rankGyms(gyms, origin) {
  return gyms
    .map((gym) => {
      const computedDistance = computeDistanceKm(origin, gym);
      const distanceKm = gym.distanceKm ?? (computedDistance === null ? null : round(computedDistance));

      return {
        ...gym,
        distanceKm,
        distanceMeters: gym.distanceMeters ?? (computedDistance === null ? null : computedDistance * 1000),
      };
    })
    .sort((a, b) => {
      const aDistance = a.distanceKm ?? Number.POSITIVE_INFINITY;
      const bDistance = b.distanceKm ?? Number.POSITIVE_INFINITY;
      return aDistance - bDistance || a.name.localeCompare(b.name);
    });
}

export function createNearbyGymMapView(gyms, { origin = {}, selectedId = "", limit = 20 } = {}) {
  const results = rankGyms(gyms, origin).slice(0, clampSize(limit));
  const selectedGym = results.find((gym) => cleanText(gym.id) === cleanText(selectedId)) ?? results[0] ?? null;

  return { results, selectedGym };
}

export function findNearbyCertifiedGyms(
  gyms,
  { origin = {}, query = "", city = "", county = "", limit = 50 } = {},
) {
  const selectedCity = cleanText(city);
  const selectedCounty = cleanText(county);

  const scoped = gyms.filter((gym) => {
    const status = cleanText(gym.status);
    if (status && status !== "VALID") return false;
    if (selectedCity && cleanText(gym.city) !== selectedCity) return false;
    if (selectedCounty && cleanText(gym.county) !== selectedCounty) return false;
    return true;
  });

  return rankGyms(filterGyms(scoped, query), origin).slice(0, clampSize(limit));
}

export function describeLocationSearchFailure(error, { automatic = false, stage = "geolocation" } = {}) {
  if (stage === "api") {
    const message = cleanText(error?.message) || "Could not load HYROXCN gyms";
    return `${message}. Search by city, enter coordinates, or import a saved HYROXCN JSON export.`;
  }

  return automatic
    ? "GPS is unavailable or permission was denied. Search a city tag, keyword, or enter coordinates manually."
    : "GPS permission was denied or unavailable. Enter coordinates manually or search by city.";
}

export function createUserSearch({ label = "Custom search", query = "", lat = null, lng = null } = {}) {
  const createdAt = new Date().toISOString();
  const suffix = Math.random().toString(36).slice(2, 8);

  return {
    id: `search-${Date.now().toString(36)}-${suffix}`,
    label: cleanText(label) || "Custom search",
    query: cleanText(query),
    lat: toNumber(lat),
    lng: toNumber(lng),
    createdAt,
  };
}
