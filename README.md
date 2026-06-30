# HYROX Gym Finder

A small browser tool for finding nearby HYROX certified gyms from your GPS position or a precise street address.

Live app: <https://hyrox-gym-finder.vercel.app/>

Static fallback: <https://moose-lab.github.io/hyrox-gym-finder/>

## What It Does

- Resolves typed addresses and browser GPS coordinates through OpenStreetMap Nominatim.
- Calls the official HYROX365 gym finder API through the local same-origin proxy: `https://api.prod.hyrox.fiit-tech.net/hyrox365/v1/gyms/map`.
- Requests browser GPS by default, reverse-geocodes the precise place, and ranks certified gyms by nearest distance.
- Accepts a precise address, city keyword, gym keyword, or browser GPS location.
- Normalizes HYROX365 gyms into a compact map/list result model.
- Ranks gyms by API distance or local Haversine distance.
- Renders only the core finder surface: a map and a distance-sorted nearby gym list.
- Lets users click map markers or right-side list rows to inspect the selected gym directly on the map.
- Fetches public HYROX365 gym details for top nearby results and shows address, city, coordinates, phone, email, website, and official HYROX profile links.
- Uses Vercel Functions as a hosted same-origin proxy for full in-app HYROX365 map results.
- Detects static GitHub Pages deployments without an API proxy, avoids raw `/api/*` 404 HTML errors, and falls back to an official HYROX Finder link for the resolved address.
- Redacts personal contact fields from included sample data.

## Run Locally

```bash
npm test
npm start
```

Open `http://localhost:4173`.

The app has no package dependencies. `npm start` runs a small Node server that serves static files and exposes fixed proxy routes for Nominatim and HYROX365. The proxy uses the system `curl` binary for upstream requests and is needed because the official HYROX365 API allows the official HYROX finder origin but does not allow arbitrary static browser origins.

The Vercel deployment uses `api/proxy.mjs` as a hosted same-origin proxy, so the production app can render the full interactive HYROX365 map and right-side nearest-gym list. The GitHub Pages build is static. It can resolve a typed address through a JSONP fallback and open the official HYROX Finder for that precise location, but full in-app HYROX365 result cards require `npm start` locally or the Vercel deployment.

## Data Notes

The global HYROX365 map API supports latitude, longitude, radius, and limit parameters and returns distance-sorted HYROX gym records. The app then fetches public detail records for the top nearby gyms and keeps only display-safe public fields.

The HYROXCN parser and redacted sample remain in the repo for regression coverage, but the current frontend no longer renders the old import, city-tag, or coordinate-debug controls.

Do not commit raw exports that include `contactPhone` or other direct personal contact details. Use the redacted sample in `sample/hyroxcn-redacted-sample.json` for demos and tests.

## Contribution Path

Keep changes small:

1. Add one failing test in `tests/hyrox.test.mjs`.
2. Update `src/hyrox.mjs` for data behavior or `src/main.mjs` for UI behavior.
3. Run `npm test`.
4. Check the browser at `http://localhost:4173`.

Deployment changes should include `npm test`, `npm run build`, and a browser check against the Vercel URL.
