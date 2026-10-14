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

Vector tiles and fonts load on demand from OpenFreeMap, using OpenStreetMap data and the OpenMapTiles schema. Attribution links are available in the main-menu Credits dialog. Set `VITE_VECTOR_TILEJSON` to use an alternative compatible OpenMapTiles source. The browser uses the server's normal cache headers. An internet connection is required. No bulk download or offline pack is included. See the [OpenFreeMap quick start](https://openfreemap.org/quick_start/).

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

## Credits

Open **Credits** from the main menu for map/data attribution, source links and the OpenStreetMap ODbL license. Links are grouped by map/geography and population/jobs/boundaries. The loading screen, world HUD and density legend contain no external source links. Legends retain the data year, units and coverage. Attribution is provided through the game’s Credits page, following the OpenStreetMap Foundation’s [computer games and simulations guidance](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines#Computer_games_and_simulations).

Detailed uses a restrained label hierarchy: areas at wider zoom, major streets with spaced labels, and selected high-priority parks, stadiums, museums and historic landmarks. Shops, cafés, offices, services, indoor POIs and minor street labels are omitted.

### Underground planning overlays

Map layers includes independent **Existing rail** visibility and **Foundations — estimated** with a planned centreline depth of 5–100 m. Rail uses mapped OpenMapTiles transportation rail/transit features: bridges are blue, tagged tunnels are dashed purple, and surface/untagged alignments green. Missing tags or alignments do not prove that a corridor is clear; tunnel depths are unknown.

Foundation footprints use an explicit gameplay proxy, not observed foundation depths. For usable `render_height` H, the proxy interval is `[max(3, 0.06H), max(6, 4 + 0.12H)]` metres. Heights may themselves be inferred from building levels. The illustrative tunnel roof is planned centreline depth minus 3 m, with a 2 m buffer. Red indicates potential overlap with the shallow bound; amber uncertain clearance within the deeper bound; blue lower proxy risk; gray unknown height. No color authorizes construction. Ground-relative depth assumes uniform ground; geology, actual foundations, utilities, terrain and verified underground infrastructure remain future work. This is a visible-tile overlay, not a complete city collision database.

Foundation mode shows flat footprints and switches density off to keep its colors readable. Rail can accompany any analysis map. Settings persist in local quicksave and older saves remain supported.

Rail uses a separate vector source with tile detail held at zoom 14 across the pitched viewport to retain distant mapped tunnel and local rail segments. A 128 px source tile size also preserves more detail at lower pitches; rail widths compensate for that scale. This can request more tiles than the adaptive basemap.

### Underground cutaway prototype

The **Underground** button beside the cube switches to a translucent surface reference and hides above-ground 3D buildings. **View demo** moves the camera to a fictional station near City Hall, with rails, platforms and an open roof. A single shared two-track bore on each side narrows smoothly from the station over a 100 m approach; tracks remain independent and do not form a turnout. Four small entrances and a clickable Demo station marker remain visible on the surface. This demo is not existing infrastructure and is not a constructed asset in the quicksave. The dashed outline lies at ground 0 m; a vertical reference connects it to the rail level. The depth control (5–100 m below ground) moves the demonstration, rather than filtering existing infrastructure.

A Three.js custom MapLibre layer shares the map WebGL context and projection matrix. Local metre coordinates map to Mercator coordinates; negative Z is below a uniform ground datum. The cutaway deliberately renders through the surface and does not model soil, terrain or collision clearance. Underground mode/depth and map camera persist locally; legacy saves default to surface mode. Population/jobs and estimated foundations are temporarily hidden during the cutaway; choosing an analysis layer returns to the surface.

The demo now reads a separate station descriptor with track/platform relationships and independently positioned/rotated entrances. Stair openings face opposite station ends. See [station research and adaptation](station-design.md) for the documented Subway Builder concepts and the limits of the comparison.

### Depth datum and Blender assets

Underground view depth is now measured from uniform ground Z=0 to the rail-head datum. The legacy procedural mesh used rail Z=-2.5 relative to its origin: it is now translated by `2.5 - depth`, making the displayed 100 m depth correspond to rail datum Z=-100 rather than Z=-102.5. Existing depth values remain readable but acquire the corrected rail-level meaning. All three spatial axes use the same local metre-to-Mercator scale; there is no vertical exaggeration. Camera perspective and the transparent cutaway are not measurements of real local terrain. The foundation planning overlay retains its separately documented illustrative centreline envelope.

See [Blender station asset specification](blender-stations.md) for three 150 m station variants, coordinate conventions, rail sockets and export requirements. No imported station assets or GLB loader are implemented in this stage.

### Current direction: map-based metro planning

The 3D metro demo is parked: Underground controls, surface demo marker/entrances and custom Three.js layer are no longer mounted. Its source code, station descriptor and Blender specification remain available for later development. Older saves still load; a saved underground view resumes in normal surface view, retaining camera, map preset and other analysis settings. Three.js is not included in the active map bundle.

3D basemap buildings remain in Detailed. Existing rail, estimated foundations and density maps remain available. Future player-built metro will use map lines/station markers with explicit depth values; no construction tool is added by this visibility change. The earlier cutaway sections document the parked prototype, not the current interface.

### 2D metro visual preview

Map layers → Metro preview shows one fictional City Hall station with two parallel paths, elongated platform polygons, a translucent station envelope, a small station dot/name and depth labels. The orange central stroke demonstrates route styling over physical tracks. View preview focuses it; the checkbox hides all its layers. Buildings remain 3D in Detailed. The geometry uses surface map layers: depth is stored/displayed as numbers, not rendered as an underground volume. This stage is a visual reference, not existing infrastructure, a built network or player construction. Preview visibility is session-only and the demo is not a quicksave asset.

### Line scale and building support rendering

Metro preview track strokes use a 1.4 m map-space width (route 2 m, halo 2.8 m), converted to pixels at the demo latitude with exponential zoom stops and distant minimums. This is a cartographic line width, not a track gauge or tunnel diameter. Station/track geometry is unchanged. Platform and envelope fills render below building extrusions so they do not paint over lower building faces; thin track lines and labels remain readable overlays.

Some provider tiles contain a hidden main outline and only elevated visible building parts (e.g. a lower outline of 120 m and visible parts starting at 120 m). The renderer reconstructs a lower mass from that outline up to the lowest visible part base, capped by the outline height. It only does so when no ground-level part is found within the outline. Existing part heights and minimum heights remain untouched; standalone elevated structures stay elevated. This is a visual fallback from mapped geometry, not surveyed architecture. Supports update as building source tiles finish loading; duplicate outlines are deduplicated. It is independent of metro intersections and is hidden alongside buildings in foundation mode.
