export const HYROX_CN_API = "https://api.hyroxcn.com/appapi/fit/gym/query";

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

const splitImages = (value) =>
  cleanText(value)
    .split(",")
    .map((image) => image.trim())
    .filter(Boolean);

export function buildHyroxCnUrl({ lat, lng, page = 1, size = 100 } = {}) {
  const url = new URL(HYROX_CN_API);
  url.searchParams.set("page", String(page));
  url.searchParams.set("size", String(clampSize(size)));

  if (Number.isFinite(Number(lat))) url.searchParams.set("lat", String(lat));
  if (Number.isFinite(Number(lng))) url.searchParams.set("lng", String(lng));

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
