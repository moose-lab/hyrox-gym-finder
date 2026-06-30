# HYROX Gym Finder

A small browser tool for finding nearby HYROX certified gyms from your GPS position, a precise street address, city/district tags, coordinates, or a local HYROXCN JSON export.

Live app: <https://moose-lab.github.io/hyrox-gym-finder/>

## What It Does

- Resolves typed addresses and browser GPS coordinates through OpenStreetMap Nominatim.
- Calls the official HYROX365 gym finder API through the local same-origin proxy: `https://api.prod.hyrox.fiit-tech.net/hyrox365/v1/gyms/map`.
- Requests browser GPS by default, reverse-geocodes the precise place, and ranks certified gyms by nearest distance.
- Accepts latitude/longitude, search radius, city and district tags, a precise address, city keyword, gym keyword, or an imported JSON export.
- Normalizes certified `VALID` gyms into a compact result model.
- Ranks gyms by API distance or local Haversine distance.
- Builds city-level tags with second-level district filters from the loaded HYROXCN records.
- Visualizes results with summary cards, a relative SVG map, and a ranked venue list.
- Fetches public HYROX365 gym details for top nearby results and shows address, region, coordinates, certification status, gym code, phone, email, website, amenities, opening hours, official HYROX profile, source, and map links.
- Detects static GitHub Pages deployments without an API proxy, avoids raw `/api/*` 404 HTML errors, and falls back to an official HYROX Finder link for the resolved address.
- Redacts personal contact fields from included sample data.

## Run Locally

```bash
npm test
npm start
```

Open `http://localhost:4173`.

The app has no package dependencies. `npm start` runs a small Node server that serves static files and exposes fixed proxy routes for Nominatim and HYROX365. The proxy uses the system `curl` binary for upstream requests and is needed because the official HYROX365 API allows the official HYROX finder origin but does not allow arbitrary static browser origins.

The GitHub Pages build is static. It can resolve a typed address through a JSONP fallback and open the official HYROX Finder for that precise location, but full in-app HYROX365 result cards require `npm start` locally or a hosted same-origin proxy deployment.

## Data Notes

The global HYROX365 map API supports latitude, longitude, radius, and limit parameters and returns distance-sorted HYROX gym records. The app then fetches public detail records for the top nearby gyms and keeps only display-safe public fields.

The HYROXCN fallback endpoint supports `page`, `size`, `lat`, and `lng` query parameters. A `size=500` request can retrieve the current China gym list in one response, while coordinates return distance-sorted nearby gyms. The response includes fields such as gym name, status, province, city, county, address, latitude, longitude, distance, image metadata, fitness-test metadata, and optional booking path.

Do not commit raw exports that include `contactPhone` or other direct personal contact details. Use the redacted sample in `sample/hyroxcn-redacted-sample.json` for demos and tests.

## Contribution Path

Keep changes small:

1. Add one failing test in `tests/hyrox.test.mjs`.
2. Update `src/hyrox.mjs` for data behavior or `src/main.mjs` for UI behavior.
3. Run `npm test`.
4. Check the browser at `http://localhost:4173`.

Good first extensions:

- Add a richer city-center preset list for text-only searches.
- Add CSV export for selected gyms.
- Add deployment support for a hosted same-origin proxy so the public GitHub Pages app can use HYROX365 global search outside local development.
