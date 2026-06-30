import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHyrox365GymDetailUrl,
  buildHyrox365GymFinderUrl,
  buildHyrox365GymFinderSearchUrl,
  buildHyrox365MapUrl,
  buildHyroxCnUrl,
  buildRegionOptions,
  buildNominatimReverseJsonpUrl,
  buildNominatimReverseUrl,
  buildNominatimSearchJsonpUrl,
  buildNominatimSearchUrl,
  chooseHyroxCnFetchSize,
  computeDistanceKm,
  createNearbyGymMapView,
  createUserSearch,
  describeLocationSearchFailure,
  findNearbyCertifiedGyms,
  filterGyms,
  isStaticApiFallbackResponse,
  mergeHyrox365GymDetails,
  normalizeGeocodeFeature,
  normalizeHyrox365MapResponse,
  normalizeHyroxCnResponse,
  rankGyms,
} from "../src/hyrox.mjs";

const apiPayload = {
  success: true,
  code: "200",
  data: {
    totalElements: "2",
    content: [
      {
        id: "gym-1",
        name: "Shanghai HYROX Club",
        code: "31000001",
        coverImage: "https://files.hyroxcn.com/demo.jpg",
        images: "https://files.hyroxcn.com/a.jpg,https://files.hyroxcn.com/b.jpg",
        contactUsername: "Coach A",
        contactPhone: "13800000000",
        provinceName: "上海",
        cityName: "上海市",
        countyName: "静安区",
        status: "VALID",
        address: "上海市静安区南京西路699号",
        lng: "121.463385",
        lat: "31.230385",
        distance: "980.7659446527274",
        fitnessTestAativity: { activityId: "1", cost: "0.00" },
        bookingAppId: "wx-demo",
        bookingPath: "/pages/introduce/index",
      },
      {
        id: "gym-2",
        name: "Archived Club",
        provinceName: "浙江省",
        cityName: "杭州市",
        countyName: "西湖区",
        status: "INVALID",
        address: "杭州市西湖区",
        lng: "120.1",
        lat: "30.2",
        distance: "180000",
      },
    ],
  },
  path: "/appapi/fit/gym/query",
};

const hyrox365MapPayload = {
  success: true,
  message: "20 gyms retrieved",
  center: { latitude: 40.71455, longitude: -73.99735 },
  radiusMeters: 50000,
  gyms: [
    {
      hyroxEntityId: "HGY_9J9dsQrNbJSpYoPvicHaSUQFl",
      gymName: "OTF West Village - #1402",
      htcx: false,
      geoCoordinates: { lat: 40.7333238, lon: -74.0001278 },
      address: {
        country: "US",
        postalCode: "10014",
        city: "New York",
        street: "391 6TH AVE",
        state: "NY",
        contactDetails: {
          phone: "(646) 626-4412",
          email: "studio1402@orangetheoryfitness.com",
        },
      },
      bannerImage: null,
      cardImage: null,
      images: [],
      distanceMeters: 2100.6348752447666,
    },
  ],
};

const hyrox365DetailPayload = {
  success: true,
  gym: {
    hyroxEntityId: "HGY_9J9dsQrNbJSpYoPvicHaSUQFl",
    gymName: "OTF West Village - #1402",
    htcx: false,
    socialMedia: {
      website: "https://www.orangetheory.com/en-us/locations/new-york-new-york-1402",
      instagram: "otfwestvillage",
    },
    address: {
      country: "US",
      postalCode: "10014",
      city: "New York",
      street: "391 6TH AVE",
      state: "NY",
      geoCoordinates: { lat: 40.7333238, lon: -74.0001278 },
      contactDetails: {
        phone: "(646) 626-4412",
        email: "studio1402@orangetheoryfitness.com",
      },
    },
    amenities: {
      showers: true,
      lockers: true,
      wifi: false,
    },
    openingHours: {
      monday: ["05:00-20:00"],
      tuesday: ["05:00-20:00"],
    },
    images: [{ url: "https://example.com/public-gym.jpg" }],
    signedTCPDF: { pdfDraft: "private contract content" },
    chargebeeSubscriptionData: { status: "active" },
  },
};

const doyersGeocodeFeature = {
  place_id: 330780652,
  lat: "40.7145498",
  lon: "-73.9973438",
  display_name: "5, Doyers Street, Chinatown, Manhattan, New York County, City of New York, New York, 10013, United States",
  address: {
    house_number: "5",
    road: "Doyers Street",
    neighbourhood: "Chinatown",
    city: "City of New York",
    state: "New York",
    postcode: "10013",
    country: "United States",
  },
};

test("normalizeHyroxCnResponse keeps valid gyms and redacts personal contact fields", () => {
  const gyms = normalizeHyroxCnResponse(apiPayload);

  assert.equal(gyms.length, 1);
  assert.deepEqual(gyms[0], {
    id: "gym-1",
    name: "Shanghai HYROX Club",
    code: "31000001",
    status: "VALID",
    province: "上海",
    city: "上海市",
    county: "静安区",
    address: "上海市静安区南京西路699号",
    lat: 31.230385,
    lng: 121.463385,
    distanceMeters: 980.7659446527274,
    distanceKm: 0.981,
    coverImage: "https://files.hyroxcn.com/demo.jpg",
    imageCount: 2,
    hasFitnessTest: true,
    hasBooking: true,
    bookingAppId: "wx-demo",
    bookingPath: "/pages/introduce/index",
    source: "HYROXCN",
  });
  assert.equal("contactPhone" in gyms[0], false);
  assert.equal("contactUsername" in gyms[0], false);
});

test("filterGyms matches region, address, and gym name text", () => {
  const gyms = normalizeHyroxCnResponse(apiPayload);

  assert.equal(filterGyms(gyms, "静安").length, 1);
  assert.equal(filterGyms(gyms, "nanjing").length, 0);
  assert.equal(filterGyms(gyms, "Shanghai").length, 1);
});

test("filterGyms prefers region matches over street-name matches", () => {
  const gyms = [
    {
      id: "shanghai-street",
      name: "Shanghai Studio",
      province: "上海",
      city: "上海市",
      county: "静安区",
      address: "上海市静安区北京西路511号",
      status: "VALID",
      source: "HYROXCN",
    },
    {
      id: "beijing-city",
      name: "Beijing Studio",
      province: "北京",
      city: "北京市",
      county: "朝阳区",
      address: "北京市朝阳区建外街道",
      status: "VALID",
      source: "HYROXCN",
    },
  ];

  assert.deepEqual(
    filterGyms(gyms, "北京").map((gym) => gym.id),
    ["beijing-city"],
  );
});

test("rankGyms computes distance when API distance is absent", () => {
  const gyms = [
    { id: "near", name: "Near", lat: 31.231, lng: 121.474, distanceKm: null },
    { id: "far", name: "Far", lat: 39.9042, lng: 116.4074, distanceKm: null },
  ];
  const ranked = rankGyms(gyms, { lat: 31.2304, lng: 121.4737 });

  assert.equal(ranked[0].id, "near");
  assert.ok(ranked[0].distanceKm < 1);
  assert.ok(ranked[1].distanceKm > 1000);
});

test("buildNominatimSearchUrl encodes a precise street address", () => {
  const url = buildNominatimSearchUrl("5 Doyers St, New York, NY 10013, United States");

  assert.equal(url.origin, "https://nominatim.openstreetmap.org");
  assert.equal(url.pathname, "/search");
  assert.equal(url.searchParams.get("format"), "jsonv2");
  assert.equal(url.searchParams.get("addressdetails"), "1");
  assert.equal(url.searchParams.get("limit"), "1");
  assert.equal(url.searchParams.get("q"), "5 Doyers St, New York, NY 10013, United States");
});

test("buildNominatimSearchJsonpUrl encodes a static-page geocoding fallback", () => {
  const url = buildNominatimSearchJsonpUrl("5 Doyers St, New York, NY 10013, United States", {
    callback: "hyroxGeocodeCallback_1",
  });

  assert.equal(url.origin, "https://nominatim.openstreetmap.org");
  assert.equal(url.pathname, "/search");
  assert.equal(url.searchParams.get("format"), "json");
  assert.equal(url.searchParams.get("json_callback"), "hyroxGeocodeCallback_1");
  assert.equal(url.searchParams.get("addressdetails"), "1");
  assert.equal(url.searchParams.get("limit"), "1");
});

test("buildNominatimReverseUrl encodes exact GPS coordinates", () => {
  const url = buildNominatimReverseUrl({ lat: 40.7145498, lng: -73.9973438 });

  assert.equal(url.origin, "https://nominatim.openstreetmap.org");
  assert.equal(url.pathname, "/reverse");
  assert.equal(url.searchParams.get("lat"), "40.7145498");
  assert.equal(url.searchParams.get("lon"), "-73.9973438");
  assert.equal(url.searchParams.get("addressdetails"), "1");
});

test("buildNominatimReverseJsonpUrl encodes a static-page GPS reverse-geocoding fallback", () => {
  const url = buildNominatimReverseJsonpUrl({
    lat: 40.7145498,
    lng: -73.9973438,
    callback: "hyroxReverseCallback",
  });

  assert.equal(url.origin, "https://nominatim.openstreetmap.org");
  assert.equal(url.pathname, "/reverse");
  assert.equal(url.searchParams.get("format"), "json");
  assert.equal(url.searchParams.get("json_callback"), "hyroxReverseCallback");
  assert.equal(url.searchParams.get("lat"), "40.7145498");
  assert.equal(url.searchParams.get("lon"), "-73.9973438");
});

test("normalizeGeocodeFeature keeps precise place label and coordinates", () => {
  const place = normalizeGeocodeFeature(doyersGeocodeFeature);

  assert.deepEqual(place, {
    id: "osm-330780652",
    label: "5, Doyers Street, Chinatown, Manhattan, New York County, City of New York, New York, 10013, United States",
    shortLabel: "5 Doyers Street, City of New York, New York 10013",
    lat: 40.7145498,
    lng: -73.9973438,
    source: "OpenStreetMap Nominatim",
  });
});

test("buildHyrox365MapUrl targets the official global gym finder API", () => {
  const url = buildHyrox365MapUrl({ lat: 40.71455, lng: -73.99735, radiusKm: 50, limit: 20 });

  assert.equal(url.origin, "https://api.prod.hyrox.fiit-tech.net");
  assert.equal(url.pathname, "/hyrox365/v1/gyms/map");
  assert.equal(url.searchParams.get("latitude"), "40.71455");
  assert.equal(url.searchParams.get("longitude"), "-73.99735");
  assert.equal(url.searchParams.get("radiusMeters"), "50000");
  assert.equal(url.searchParams.get("limit"), "20");
});

test("buildHyrox365GymFinderSearchUrl creates an official finder fallback for static hosts", () => {
  const url = buildHyrox365GymFinderSearchUrl({
    origin: { lat: 40.7143387, lng: -73.9980744 },
    label: "5 Doyers Street, New York, New York 10013",
    radiusKm: 50,
    limit: 20,
  });

  assert.equal(url.origin, "https://hyrox-training-finder.hyrox.com");
  assert.equal(url.pathname, "/gyms");
  assert.equal(url.searchParams.get("lat"), "40.7143387");
  assert.equal(url.searchParams.get("lng"), "-73.9980744");
  assert.equal(url.searchParams.get("label"), "5 Doyers Street, New York, New York 10013");
  assert.equal(url.searchParams.get("radiusKm"), "50");
  assert.equal(url.searchParams.get("limit"), "20");
});

test("isStaticApiFallbackResponse identifies GitHub Pages API 404 HTML", () => {
  assert.equal(
    isStaticApiFallbackResponse({
      status: 404,
      contentType: "text/html; charset=utf-8",
      body: "<!DOCTYPE html><title>Page not found · GitHub Pages</title>",
    }),
    true,
  );

  assert.equal(
    isStaticApiFallbackResponse({
      status: 500,
      contentType: "application/json",
      body: '{"error":"upstream failed"}',
    }),
    false,
  );
});

test("normalizeHyrox365MapResponse maps the Doyers Street nearest gym with public details", () => {
  const gyms = normalizeHyrox365MapResponse(hyrox365MapPayload, {
    origin: { lat: 40.7145498, lng: -73.9973438 },
    label: "5 Doyers St",
    radiusKm: 50,
    limit: 20,
  });

  assert.equal(gyms.length, 1);
  assert.deepEqual(gyms[0], {
    id: "HGY_9J9dsQrNbJSpYoPvicHaSUQFl",
    name: "OTF West Village - #1402",
    code: "HGY_9J9dsQrNbJSpYoPvicHaSUQFl",
    status: "VALID",
    certification: "HYROX Training Club",
    province: "NY",
    city: "New York",
    county: "",
    address: "391 6TH AVE, 10014, New York, NY, US",
    lat: 40.7333238,
    lng: -74.0001278,
    distanceMeters: 2100.6348752447666,
    distanceKm: 2.101,
    coverImage: "",
    imageCount: 0,
    hasFitnessTest: false,
    hasBooking: false,
    hasContact: true,
    phone: "(646) 626-4412",
    email: "studio1402@orangetheoryfitness.com",
    website: "",
    htcx: false,
    amenities: [],
    openingHours: [],
    source: "HYROX365 global API",
    sourceUrl:
      "https://hyrox-training-finder.hyrox.com/gyms/new-york/otf-west-village-1402-HGY_9J9dsQrNbJSpYoPvicHaSUQFl?lat=40.7145498&lng=-73.9973438&label=5+Doyers+St&radiusKm=50&limit=20&resultRank=1",
  });
});

test("mergeHyrox365GymDetails adds public profile fields without leaking internal contract data", () => {
  const [gym] = normalizeHyrox365MapResponse(hyrox365MapPayload);
  const detailed = mergeHyrox365GymDetails(gym, hyrox365DetailPayload);

  assert.equal(detailed.website, "https://www.orangetheory.com/en-us/locations/new-york-new-york-1402");
  assert.deepEqual(detailed.amenities, ["Showers", "Lockers"]);
  assert.deepEqual(detailed.openingHours, ["Monday: 05:00-20:00", "Tuesday: 05:00-20:00"]);
  assert.equal(detailed.imageCount, 1);
  assert.equal(detailed.coverImage, "https://example.com/public-gym.jpg");
  assert.equal("signedTCPDF" in detailed, false);
  assert.equal("chargebeeSubscriptionData" in detailed, false);
});

test("buildHyrox365GymDetailUrl targets one official gym record", () => {
  const url = buildHyrox365GymDetailUrl("HGY_9J9dsQrNbJSpYoPvicHaSUQFl");

  assert.equal(url.origin, "https://api.prod.hyrox.fiit-tech.net");
  assert.equal(url.pathname, "/hyrox365/v1/gyms/HGY_9J9dsQrNbJSpYoPvicHaSUQFl");
});

test("buildRegionOptions groups city tags with second-level county tags", () => {
  const gyms = [
    { id: "jing-an", city: "上海市", county: "静安区" },
    { id: "xu-hui", city: "上海市", county: "徐汇区" },
    { id: "jing-an-2", city: "上海市", county: "静安区" },
    { id: "chaoyang", city: "北京市", county: "朝阳区" },
    { id: "unknown", city: "", county: "碑林区" },
  ];

  assert.deepEqual(buildRegionOptions(gyms), [
    {
      city: "上海市",
      count: 3,
      counties: [
        { county: "静安区", count: 2 },
        { county: "徐汇区", count: 1 },
      ],
    },
    {
      city: "北京市",
      count: 1,
      counties: [{ county: "朝阳区", count: 1 }],
    },
  ]);
});

test("findNearbyCertifiedGyms defaults to nearest GPS-ranked gyms when no text filter is set", () => {
  const gyms = [
    { id: "beijing", name: "Beijing", city: "北京市", county: "朝阳区", lat: 39.9042, lng: 116.4074 },
    { id: "jing-an", name: "Jing An", city: "上海市", county: "静安区", lat: 31.231, lng: 121.474 },
    { id: "xuhui", name: "Xuhui", city: "上海市", county: "徐汇区", lat: 31.188, lng: 121.436 },
  ];

  const results = findNearbyCertifiedGyms(gyms, {
    origin: { lat: 31.2304, lng: 121.4737 },
    query: "",
    city: "",
    county: "",
    limit: 2,
  });

  assert.deepEqual(
    results.map((gym) => gym.id),
    ["jing-an", "xuhui"],
  );
  assert.ok(results[0].distanceKm < results[1].distanceKm);
});

test("createNearbyGymMapView sorts results by distance and keeps the selected gym", () => {
  const view = createNearbyGymMapView(
    [
      { id: "far", name: "Far", distanceKm: 8, lat: 40.8, lng: -74.1 },
      { id: "selected", name: "Selected", distanceKm: 3, lat: 40.74, lng: -74.02 },
      { id: "near", name: "Near", distanceKm: 1, lat: 40.72, lng: -74.0 },
    ],
    {
      origin: { lat: 40.7143387, lng: -73.9980744 },
      selectedId: "selected",
      limit: 3,
    },
  );

  assert.deepEqual(
    view.results.map((gym) => gym.id),
    ["near", "selected", "far"],
  );
  assert.equal(view.selectedGym.id, "selected");

  const fallbackView = createNearbyGymMapView(view.results, { selectedId: "missing" });
  assert.equal(fallbackView.selectedGym.id, "near");
});

test("findNearbyCertifiedGyms applies city and county tag filters before ranking", () => {
  const gyms = [
    { id: "jing-an", name: "Jing An", city: "上海市", county: "静安区", lat: 31.231, lng: 121.474 },
    { id: "xuhui", name: "Xuhui", city: "上海市", county: "徐汇区", lat: 31.188, lng: 121.436 },
    { id: "beijing", name: "Beijing", city: "北京市", county: "朝阳区", lat: 39.9042, lng: 116.4074 },
  ];

  const results = findNearbyCertifiedGyms(gyms, {
    origin: { lat: 31.2304, lng: 121.4737 },
    city: "上海市",
    county: "徐汇区",
  });

  assert.deepEqual(
    results.map((gym) => gym.id),
    ["xuhui"],
  );
});

test("describeLocationSearchFailure distinguishes GPS failures from API failures", () => {
  assert.equal(
    describeLocationSearchFailure(new Error("HYROXCN API returned 500"), { stage: "api" }),
    "HYROXCN API returned 500. Search by city, enter coordinates, or import a saved HYROXCN JSON export.",
  );
  assert.equal(
    describeLocationSearchFailure(new Error("User denied Geolocation"), { automatic: true, stage: "geolocation" }),
    "GPS is unavailable or permission was denied. Search a city tag, keyword, or enter coordinates manually.",
  );
});

test("computeDistanceKm returns stable haversine distance", () => {
  const km = computeDistanceKm(
    { lat: 31.2304, lng: 121.4737 },
    { lat: 39.9042, lng: 116.4074 },
  );

  assert.ok(km > 1066);
  assert.ok(km < 1069);
});

test("buildHyroxCnUrl encodes live API search parameters", () => {
  const url = buildHyroxCnUrl({ lat: 31.2304, lng: 121.4737, page: 2, size: 20 });

  assert.equal(url.origin, "https://api.hyroxcn.com");
  assert.equal(url.pathname, "/appapi/fit/gym/query");
  assert.equal(url.searchParams.get("lat"), "31.2304");
  assert.equal(url.searchParams.get("lng"), "121.4737");
  assert.equal(url.searchParams.get("page"), "2");
  assert.equal(url.searchParams.get("size"), "20");
});

test("chooseHyroxCnFetchSize loads the full list for text searches", () => {
  assert.equal(chooseHyroxCnFetchSize({ query: "北京", limit: 20 }), 500);
  assert.equal(chooseHyroxCnFetchSize({ query: "", limit: 20 }), 20);
  assert.equal(chooseHyroxCnFetchSize({ query: "   ", limit: 999 }), 500);
});

test("createUserSearch links query context with result metadata", () => {
  const search = createUserSearch({ label: "上海静安", lat: 31.2304, lng: 121.4737, query: "静安" });

  assert.match(search.id, /^search-/);
  assert.equal(search.label, "上海静安");
  assert.equal(search.query, "静安");
  assert.equal(search.lat, 31.2304);
  assert.equal(search.lng, 121.4737);
  assert.ok(search.createdAt);
});
