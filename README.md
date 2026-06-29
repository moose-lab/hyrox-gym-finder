# HYROX Gym Finder

A small browser tool for finding nearby HYROXCN certified gyms from a location, region keyword, or local HYROXCN JSON export.

Live app: <https://moose-lab.github.io/hyrox-gym-finder/>

## What It Does

- Calls the public HYROXCN gym endpoint: `https://api.hyroxcn.com/appapi/fit/gym/query`.
- Accepts latitude/longitude, browser geolocation, a region or address keyword, or an imported JSON export.
- Normalizes certified `VALID` gyms into a compact result model.
- Ranks gyms by API distance or local Haversine distance.
- Visualizes results with summary cards, a relative SVG map, and a ranked venue list.
- Redacts personal contact fields from included sample data.

## Run Locally

```bash
npm test
npm start
```

Open `http://localhost:4173`.

The app has no package dependencies. `npm start` only serves static files so browser module imports work consistently.

## Data Notes

The live API currently supports `page`, `size`, `lat`, and `lng` query parameters. A `size=500` request can retrieve the current China gym list in one response, while coordinates return distance-sorted nearby gyms. The response includes fields such as gym name, status, province, city, county, address, latitude, longitude, distance, image metadata, fitness-test metadata, and optional booking path.

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
- Add optional global HYROX Training Finder support once its base API URL is documented or stable.
