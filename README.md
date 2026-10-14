# Undergrid

A browser-based metro game in development. The current milestone is a minimal main menu, New York city selection, a world loading screen, and a full-window vector OpenStreetMap world with display presets and a rotatable camera.

## Run locally

Requires Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
```

Open the localhost URL printed by Vite. `npm run build` checks TypeScript and creates a production build.

## Explore New York

Choose **New Game → New York → Start**. Drag to pan and scroll to zoom. Right-drag (or Ctrl + drag) vertically to tilt, horizontally to rotate, or diagonally to change both. Both camera axes remain available throughout the gesture. Use the compact Clean and Detailed selector; Clean shows flat building footprints at street zoom; Detailed includes 3D buildings. The cube toggles a tilted view; the compass faces north while preserving position, zoom and tilt. Escape opens the menu, where you can resume or return to the main menu.

The world covers all five boroughs and nearby parts of New Jersey, Westchester, and western Long Island. Map navigation and the tile source are bounded to longitude -74.32 to -73.65 and latitude 40.47 to 40.98. The boundary is a rectangular regional crop, not an administrative city boundary.

Vector tiles and fonts load on demand from OpenFreeMap, using OpenStreetMap data and the OpenMapTiles schema. Attribution links remain visible in a small text footer. Set `VITE_VECTOR_TILEJSON` to use an alternative compatible OpenMapTiles source. The browser uses the server's normal cache headers. An internet connection is required. No bulk download or offline pack is included. See the [OpenFreeMap quick start](https://openfreemap.org/quick_start/).

The main-menu illustration is decorative; the world itself uses real OSM cartography. A loading failure presents Retry and Back controls instead of opening an empty world.

## Architecture

- React and TypeScript: menu, loading lifecycle, and map controls.
- MapLibre: the regional vector map, geographic bounds, independent layers, camera rotation and pitch.
- Custom map style: local TypeScript configuration, no remote style dependency.
- Buildings use a separate vector source with stable zoom 13–14 detail across the visible region, preventing distant building tiles from losing geometry at high pitch. The base map retains adaptive detail.
- Building heights use source render heights; missing heights fall back to illustrative 10 m blocks. This is not a surveyed 3D city or terrain model.
- Previous experimental gameplay code remains in `src/Prototype.tsx`, `src/simulation`, and the earlier 3D components. It is not mounted by the current app. Construction, simulation and economy are outside this milestone's visible experience and will be integrated into the real city in later agreed stages.

Code and interface text are in English. Local preview only; no cloud account or deployment is required.

## Local quick save (alpha)

Starting a world immediately writes `saves/quick-save.json` through the local Vite server. Camera position, zoom, tilt, bearing and the Clean/Detailed preset are saved automatically. Reloading the page restores the active world. Choosing Main menu deliberately leaves the world and records that choice, so reload stays in the menu. The main menu shows **Continue** when a valid quick save is available; it reloads that save and restores the view. Starting a new world replaces the quick save.

The save is shared by browsers connected to the same project server and remains after restarting it. It is excluded from Git. Writes are atomic and serialized; older requests cannot overwrite newer saves. A save failure is shown in the interface. The map still requires an internet connection.

Use `npm run dev`, or `npm run build` followed by `npm run preview`. Both local servers expose the save endpoint. Opening `dist/index.html` directly or using a generic static host does not provide file saving.

## Population and workplace maps

Use **Map layers → Off / Population / Jobs**. Population combines Census 2020 residential density and district boundaries. Jobs shows Census LEHD/LODES 2023 workplace density with the same boundaries, using a distinct amber palette. The two maps are mutually exclusive. Clean / Detailed remains available; buildings become translucent while either density mode is active. Borough names appear at wider zoom and census tract boundaries from zoom 12.5. Click an area for its neighborhood grouping, borough, tract and the selected count/density.

Coverage is **New York City’s five boroughs**, not surrounding counties. Density is a tract average per km² of **2020 Census land area**. Population counts residents in 2020. Jobs uses **LODES8.4 WAC S000/JT00 C000**: all covered jobs by workplace in 2023, including secondary jobs. These are jobs, not unique workers or working residents; the source does not cover all employment (including self-employment). The maps use different reference years and do not describe current occupancy or forecast ridership. Areas with zero official land area have no density value. Neighborhood names describe NYC DCP statistical groupings and do not create official neighborhood boundaries.

The selected mode persists in the local quick save. Old saves with separate population/district booleans automatically become Population when either was enabled; otherwise they become Off. Saves without analysis settings remain compatible.

Packaged files in `public/data/` contain 2,325 shoreline-clipped tracts, all **8,804,190** NYC residents counted in 2020, and **4,585,129** covered jobs aggregated from **25,445** workplace blocks in 2023. Sources and methods are recorded in `public/data/nyc-analysis-metadata.json`. Population and land area are from U.S. Census Bureau TIGERweb Census 2020, joined to NYC DCP polygons by GEOID. Borough boundaries use NYC DCP release 26b. Jobs are summed by the first 11 digits of the 2020 workplace block GEOID. All workplace records in the five NYC counties match a packaged tract; tracts without a WAC record have zero covered jobs. The jobs source checksum and file creation date are retained in metadata. Download date: 2026-10-14.

Both maps load locally without API keys. The OpenStreetMap basemap still needs internet access. The last published New York WAC year at implementation was 2023; see the official [LODES New York WAC index](https://lehd.ces.census.gov/data/lodes/LODES8/ny/wac/) and [LODES documentation](https://lehd.ces.census.gov/data/lehd-code-samples/sections/lodes.html).

Regenerate population geometry with `python3 scripts/prepare-demographics.py TRACTS CENSUS BOROUGHS`: GeoJSON from NYC Open Data datasets `63ge-mke6` and `gthc-hcne`, and JSON from `https://tigerweb.geo.census.gov/arcgis/rest/services/Census2020/tigerWMS_Census2020/MapServer/6/query` using `where=STATE='36' AND COUNTY IN ('005','047','061','081','085')`, `outFields=GEOID,POP100,AREALAND,INTPTLAT,INTPTLON`, `returnGeometry=false`, `f=json`. Then run `python3 scripts/prepare-jobs.py WAC_CSV_GZ 2023` with `https://lehd.ces.census.gov/data/lodes/LODES8/ny/wac/ny_wac_S000_JT00_2023.csv.gz`. Generators reject missing joins, duplicate identifiers and inconsistent totals. Tests verify mode migration, saved settings, units, population totals, jobs totals and density joins.
