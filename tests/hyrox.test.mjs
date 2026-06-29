import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHyroxCnUrl,
  computeDistanceKm,
  createUserSearch,
  filterGyms,
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

test("createUserSearch links query context with result metadata", () => {
  const search = createUserSearch({ label: "上海静安", lat: 31.2304, lng: 121.4737, query: "静安" });

  assert.match(search.id, /^search-/);
  assert.equal(search.label, "上海静安");
  assert.equal(search.query, "静安");
  assert.equal(search.lat, 31.2304);
  assert.equal(search.lng, 121.4737);
  assert.ok(search.createdAt);
});
