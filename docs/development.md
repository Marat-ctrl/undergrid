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

Coverage is **New York City’s five boroughs and all 12 municipalities of Hudson County, New Jersey**. Density is a tract average per km² of **2020 Census land area**. Population counts residents in 2020. Jobs uses **LODES8.4 WAC S000/JT00 C000**: all covered jobs by workplace in 2023, including secondary jobs. These are jobs, not unique workers or working residents; the source does not cover all employment (including self-employment). The maps use different reference years and do not describe current occupancy or forecast ridership. Areas with zero official land area have no density value. NYC neighborhood names describe DCP statistical groupings. Hudson County units are Census tracts; no neighborhood or ward names are inferred.

The selected mode persists in the local quick save. Old saves with separate population/district booleans automatically become Population when either was enabled; otherwise they become Off. Saves without analysis settings remain compatible.

Packaged files in `public/data/` contain 2,325 shoreline-clipped tracts, all **8,804,190** NYC residents counted in 2020, and **4,585,129** covered jobs aggregated from **25,445** workplace blocks in 2023. Sources and methods are recorded in `public/data/nyc-analysis-metadata.json`. Population and land area are from U.S. Census Bureau TIGERweb Census 2020, joined to NYC DCP polygons by GEOID. Borough boundaries use NYC DCP release 26b. Jobs are summed by the first 11 digits of the 2020 workplace block GEOID. All workplace records in the five NYC counties match a packaged tract; tracts without a WAC record have zero covered jobs. The jobs source checksum and file creation date are retained in metadata. Download date: 2026-10-14.

Both maps load locally without API keys. The OpenStreetMap basemap still needs internet access. The last published New York WAC year at implementation was 2023; see the official [LODES New York WAC index](https://lehd.ces.census.gov/data/lodes/LODES8/ny/wac/) and [LODES documentation](https://lehd.ces.census.gov/data/lehd-code-samples/sections/lodes.html).

Regenerate population geometry with `python3 scripts/prepare-demographics.py TRACTS CENSUS BOROUGHS`: GeoJSON from NYC Open Data datasets `63ge-mke6` and `gthc-hcne`, and JSON from `https://tigerweb.geo.census.gov/arcgis/rest/services/Census2020/tigerWMS_Census2020/MapServer/6/query` using `where=STATE='36' AND COUNTY IN ('005','047','061','081','085')`, `outFields=GEOID,POP100,AREALAND,INTPTLAT,INTPTLON`, `returnGeometry=false`, `f=json`. Then run `python3 scripts/prepare-jobs.py WAC_CSV_GZ 2023` with `https://lehd.ces.census.gov/data/lodes/LODES8/ny/wac/ny_wac_S000_JT00_2023.csv.gz`. Generators reject missing joins, duplicate identifiers and inconsistent totals. Tests verify mode migration, saved settings, units, population totals, jobs totals and density joins.

## Credits

Open **Credits** from the main menu for map/data attribution, source links and the OpenStreetMap ODbL license. Links are grouped by map/geography and population/jobs/boundaries. The loading screen, world HUD and density legend contain no external source links. Legends retain the data year, units and coverage. Attribution is provided through the game’s Credits page, following the OpenStreetMap Foundation’s [computer games and simulations guidance](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines#Computer_games_and_simulations).

Detailed uses a restrained label hierarchy: areas at wider zoom, major streets with spaced labels, and selected high-priority parks, stadiums, museums and historic landmarks. Shops, cafés, offices, services, indoor POIs and minor street labels are omitted.

### Existing rail overlay

Map layers retains independent **Existing rail** visibility. It uses mapped OpenMapTiles transportation rail/transit features, with surface, bridge and tagged tunnel styles. Missing alignments do not prove that a corridor is clear; tunnel depths are unknown.

The estimated foundation overlay, depth slider, proxy calculations, map layer and popup are removed. Legacy planning objects still load, but normalization retains only `existingRail`; new snapshots no longer write the obsolete fields. Station and track rail elevations are independent and unchanged.

Rail uses a separate vector source with tile detail held at zoom 14 across the pitched viewport to retain distant mapped tunnel and local rail segments. A 128 px source tile size also preserves more detail at lower pitches; rail widths compensate for that scale. This can request more tiles than the adaptive basemap.

### Underground cutaway prototype

The **Underground** button beside the cube switches to a translucent surface reference and hides above-ground 3D buildings. **View demo** moves the camera to a fictional station near City Hall, with rails, platforms and an open roof. A single shared two-track bore on each side narrows smoothly from the station over a 100 m approach; tracks remain independent and do not form a turnout. Four small entrances and a clickable Demo station marker remain visible on the surface. This demo is not existing infrastructure and is not a constructed asset in the quicksave. The dashed outline lies at ground 0 m; a vertical reference connects it to the rail level. The depth control (5–100 m below ground) moves the demonstration, rather than filtering existing infrastructure.

A Three.js custom MapLibre layer shares the map WebGL context and projection matrix. Local metre coordinates map to Mercator coordinates; negative Z is below a uniform ground datum. The cutaway deliberately renders through the surface and does not model soil, terrain or collision clearance. Underground mode/depth and map camera persist locally; legacy saves default to surface mode. Population/jobs are temporarily hidden during the cutaway; choosing an analysis layer returns to the surface.

The demo now reads a separate station descriptor with track/platform relationships and independently positioned/rotated entrances. Stair openings face opposite station ends. See [station research and adaptation](station-design.md) for the documented Subway Builder concepts and the limits of the comparison.

### Depth datum and Blender assets

Underground view depth is now measured from uniform ground Z=0 to the rail-head datum. The legacy procedural mesh used rail Z=-2.5 relative to its origin: it is now translated by `2.5 - depth`, making the displayed 100 m depth correspond to rail datum Z=-100 rather than Z=-102.5. Existing depth values remain readable but acquire the corrected rail-level meaning. All three spatial axes use the same local metre-to-Mercator scale; there is no vertical exaggeration. Camera perspective and the transparent cutaway are not measurements of real local terrain.

See [Blender station asset specification](blender-stations.md) for three 150 m station variants, coordinate conventions, rail sockets and export requirements. No imported station assets or GLB loader are implemented in this stage.

### Current direction: map-based metro planning

The 3D metro demo is parked: Underground controls, surface demo marker/entrances and custom Three.js layer are no longer mounted. Its source code, station descriptor and Blender specification remain available for later development. Older saves still load; a saved underground view resumes in normal surface view, retaining camera, map preset and other analysis settings. Three.js is not included in the active map bundle.

3D basemap buildings remain in Detailed. Existing rail and density maps remain available. Future player-built metro will use map lines/station markers with explicit depth values; no construction tool is added by this visibility change. The earlier cutaway sections document the parked prototype, not the current interface.

### 2D metro visual preview

Map layers → Metro preview shows one fictional City Hall station with two parallel paths, elongated platform polygons, a translucent station envelope, a small station dot/name and depth labels. The orange central stroke demonstrates route styling over physical tracks. View preview focuses it; the checkbox hides all its layers. Buildings remain 3D in Detailed. The geometry uses surface map layers: depth is stored/displayed as numbers, not rendered as an underground volume. This stage is a visual reference, not existing infrastructure, a built network or player construction. Preview visibility is session-only and the demo is not a quicksave asset.

### Line scale and building support rendering

Metro preview track strokes use a 1.4 m map-space width (route 2 m, halo 2.8 m), converted to pixels at the demo latitude with exponential zoom stops and distant minimums. This is a cartographic line width, not a track gauge or tunnel diameter. Station/track geometry is unchanged. Platform and envelope fills render below building extrusions so they do not paint over lower building faces; thin track lines and labels remain readable overlays.

Some provider tiles contain a hidden main outline and only elevated visible building parts (e.g. a lower outline of 120 m and visible parts starting at 120 m). The renderer reconstructs a lower mass from that outline up to the lowest visible part base, capped by the outline height. It only does so when no ground-level part is found within the outline. Existing part heights and minimum heights remain untouched; standalone elevated structures stay elevated. This is a visual fallback from mapped geometry, not surveyed architecture. Supports update as building source tiles finish loading; duplicate outlines are deduplicated. It is independent of metro intersections and is hidden alongside buildings in foundation mode.

### Construction panel prototype

The hammer button at bottom left opens construction settings: Station/Track, Side/Island platforms, Single/Parallel tracks and editable rail depth 5–100 m below ground. Quad tracks and crossovers are locked. Build and Clear are disabled pending placement integration; cost is intentionally unavailable. These are session-only panel settings and do not alter the map preview or quicksave. Escape closes the panel before opening the game menu; reopening retains its current parameters. Analytical legends move to the right while construction is open, or hide on narrow screens to preserve map space.

### Two-click station placement

Construction → Station now places side/island stations with rail depth −100 to +50 m. Click a start point, move the mouse to set direction and stretch length (clamped to 50–300 m), then click a second point to add a blueprint. The cursor shows length and depth. Escape cancels the active stretch first; a further Escape closes Construction. Closing the panel or choosing Track cancels the cursor preview without clearing already placed blueprints. Map pan/zoom/tilt remain available.

Click an existing player station to select it; Delete selected blueprint only removes a blueprint. Build confirms all finished station projects, Clear removes all unbuilt projects and an unfinished stretch. Built stations and blueprints save locally, with compatible defaults for older saves. There are no costs, foundation/collision checks, connecting-track construction or running trains in this stage. The fictional Metro preview remains separately toggleable and is never added to the player's station list. Up to 200 stations are supported by the alpha save validator.

Station selection now clears when Construction closes or empty map space is clicked. With a selection active, the first empty-space click deselects; a subsequent click can begin another station. Clicking a built player station outside Construction opens the panel with Demolish. Demolish removes that built station and writes the updated station list immediately; there is no demolition cost or refund yet. Clear still affects blueprints only. Escape prioritizes an active stretch, then selection, then the panel.

### Station ports and connecting tracks

Construction → Track displays station-end snap points: one pair-centre point at each end in Parallel mode, or individual rail-end points in Single mode. Hover within 18 screen pixels to snap. Click a starting port or free map position, then click the ending port or free position to create a blueprint. Cubic curves follow station tangents. Parallel paths taper from station rail spacing to shared-tunnel spacing over a 100 m approach. Port endpoints reference station IDs and inherit position and depth; free endpoints use the panel depth. Depth transitions use smooth interpolation.

Build confirms finished station and track blueprints together; Clear removes unbuilt projects. Track blueprints can be selected and deleted; built sections can be demolished. Demolishing a station also removes its attached sections, with a count displayed before demolition. Closing Construction clears selection, and Escape cancels drawing before clearing selection or closing the panel. Changing track mode cancels the active drawing.

Tracks are persisted in the local quicksave, with backward compatibility for station-only saves. The alpha supports up to 200 combined station/track objects and track sections from 10 m to 10 km inside city bounds. There are no costs, clearance, gradient or minimum-radius checks. Snapping includes player stations and free ends of built tracks; the fictional preview, existing rail, junctions and crossovers are not connection targets.

Run `npm run test:construction` for the targeted station geometry, track snapping/tangents/depth, save validation and local save/restart checks. Earlier milestone notes above describe the stages before track integration.

### Track continuation and direction markers

Built track sections expose snap points at free ends. Parallel mode continues a pair; Single mode offers individual lanes of a parallel section or the end of a single section. New sections reference the preceding track endpoint and inherit its exact endpoint position, outgoing tangent and depth. Used endpoints hide their snap points; each new built free end exposes another one. References survive quicksave/reload. Demolition removes dependent continuations too, with the affected count displayed before removal.

Station approaches now reach the 5 m pair spacing within 25 m, independent of total section length. Longer curves use finer sampling so a short approach remains visible even on kilometre-long sections. Very short sections can end within the approach and carry their endpoint spacing into the next section. Small arrow markers follow the rails: opposite directions for parallel lanes, inherited lane direction for connected single sections. Markers are visual planning aids; train operations and track junctions remain future work.

### Blueprint connections, tangent arcs and Heavy Metro checks

Track-end snap points now appear on blueprints as well as built sections. Dependencies remain explicit track references; Build confirms the complete valid plan, Clear discards blueprints, and deleting a parent removes dependent sections. Blueprint ports use amber outlines.

New sections store `curve: "arc"`. A free end opposite a fixed departure is fitted to a circular arc from the departure tangent and cursor position; its final heading is the circle tangent. Two fixed connection ends retain tangent-constrained cubic curves. Completely free sections start as straight lines. Arc endpoints and lane spacing have continuous tangents at connections. Existing saved sections without `curve` retain the older cubic construction and 25 m taper. Right-hand arrows reverse the former direction on both station and parallel track lanes; connected single tracks inherit the chosen lane direction.

New station transitions use quintic tapering from 10 m rail-centre spacing to 5 m. The base transition length is 70 m and grows when main-curve curvature reduces the available curvature budget. A section too short for full narrowing keeps a wider endpoint, carried into its continuation; it does not force a tight taper. Both transitions and each physical lane are included in the radius check.

The initial gameplay limits are 305 m minimum horizontal radius, 4% maximum absolute grade and 0.015/30.48 per metre maximum change of grade. They are based on the BART Facilities Standards R2.1, Civil–Trackway §§8.3–8.4 (1,000 ft mainline radius; 4% grade; 1.5 percentage points per 100 ft absolute grade-change bound), rounded/adapted for the alpha: [project design criteria](https://partners.skanska.com/usa/clients/vta/BEP/Prosit/Reference%20Materials/Design%20Criteria/BFS_R2-1%20Criteria%202%20of%202.pdf). These are fixed gameplay parameters, not universal metro rules or a full implementation of BART's speed-dependent design criteria, cant or spirals.

Horizontal radius is sampled on both physical lane paths, including tapers, with approximately 2 m resolution. New vertical profiles use quintic interpolation with zero grade and grade derivative at both ends; grade and change-of-grade extrema are checked analytically and against each lane's sampled length. This prevents abrupt slope joins between sections/stations. Depth still assumes flat ground and is not terrain elevation.

Invalid ghosts and blueprints turn red. The panel shows the radius/grade or a specific error. Build is disabled and its handler independently rechecks the plan; invalid blueprints can still be saved, continued, selected and deleted. Save validation remains separate from construction constraints so older constructed networks continue to load.

### Simplified construction profile

The current gameplay profile supersedes the stricter limits above: main-alignment minimum radius 70 m, maximum grade 8%, station taper 10 m. Radius checks use the centreline and intentionally exclude the schematic narrowing/widening of station tracks. Tapers no longer grow according to curvature; both existing and new rendered paths use the 10 m transition. Grade and vertical-transition checks remain enabled, including the previous change-of-grade bound. These are game parameters chosen for flexible planning, not real construction standards.

### Compact Side station presentation

The current main-alignment minimum radius is 20 m; the 10 m schematic taper and 8% maximum grade are unchanged. Side platforms move 0.5 m outward, increasing rail-centre-to-platform-edge clearance from 1.7 m to 2.2 m while preserving platform width and both track-end connection coordinates. The Side envelope has a uniform 2 m margin around the platform bounds, including the ends. Rail ends consequently extend 3 m beyond the envelope. Island station geometry is unchanged.

### Island envelope and Shift straight locking

Island envelopes now have a uniform 3 m margin around the platform, keeping both rail strokes within the side boundaries; rail ends project slightly beyond the envelope as on Side stations. Platform and connector coordinates stay unchanged.

Hold Shift while drawing a track to project the endpoint onto its departure tangent. From a free anchor, pressing Shift captures the current cursor heading until release. Releasing Shift immediately returns to the curved draft; blur, Escape, tool changes and mode changes clear the lock. Off-axis ports do not snap while the line is locked. A collinear port must also face the correct way to connect. Completed straight sections persist `curve: "straight"` so they remain straight after reload and expose the correct continuation tangent. Depth and vertical interpolation still apply.

The current grade limit is 16%. The 20 m radius, 10 m schematic taper and change-of-grade bound remain in effect.

Map box-zoom is disabled only while Track construction is active, so its Shift gesture cannot consume the placement click. It is restored for other modes.

### Depot construction and simplified vertical profiles

Construction → Depot places a yard at the chosen depth. Select a capacity of 5–30 train sets; the first click sets the entrance, the second sets the yard direction. Yard width and switch-throat length scale with capacity, with one storage track per space and 200 m service decks. Depot entrances offer a pair-centre port in Parallel mode or two individual ports in Single mode, with 4 m centre spacing and inherited depth/tangent. Internal turnouts are visual geometry; train dispatch, operational switch controls, stock purchases and costs are not implemented. Capacity represents available parking, not supplied trains.

Depots use the shared station-asset list with `kind: "depot"` and an integer `capacity`. They follow the same blueprint, Build, Clear, selection, deletion/demolition and dependency-removal lifecycle. The local save persists capacity, position, direction, depth and stage. Older station-only saves remain supported. Depot footprint and rail points must remain inside city bounds; their rear storage ends are not external connection ports. Depot blueprints have their own count in the panel, and all assets together remain subject to the 200-object limit.

Constant-depth track sections no longer display redundant depth arrows; cursor length remains visible. Depth transitions retain their labels. The current vertical profile uses 10 m smooth grade ramps at both ends and a constant middle grade. For sections shorter than 20 m, each ramp occupies half the section. The slope-change limit is now 0.03 per metre as a gameplay parameter. The peak grade is `abs(depth difference) / (length - ramp length)`, checked alongside each physical lane; a 10 m depth difference across 102 m reaches about 10.9%, within the 16% limit. Endpoint grade and its derivative are zero so neighbouring sections and level stations join smoothly. This profile supersedes the earlier full-section quintic vertical interpolation and stricter change-of-grade limit.

### Active network, Undo, station attachment and physical depth

The fictional Metro preview and its focus/visibility controls are no longer installed. Legacy demo model sources remain parked. Active surface line styling is independent of the demo.

Construction Undo (also Ctrl/Cmd+Z, outside editable fields) keeps up to 50 network snapshots for this session. Placing, deleting, demolition, Build and Clear are whole transactions, including dependent sections; restoring one writes the quicksave immediately. An unfinished drawing is cancelled before a history entry is consumed. New Game, Continue and page reload reset history.

Stations snap to free ends of single or paired player tracks, including blueprints. They inherit rail depth and the endpoint tangent, stretch 50–300 m along that tangent, and include a 12 m connecting section for the existing 10 m spacing transition. The connector references both the previous track and the new station; single-track connections preserve right-hand travel. Station plus connector are one undo action. Occupied rail and station ports hide. Inserting stations into the middle of a track, junctions and crossings are not included.

Surface / Underground preserves the flat network scheme. Underground uses a custom Three.js layer with metre-scaled Mercator vertices: stations and depots are horizontal at their saved negative rail altitude, and track vertices follow the existing vertical profile. There are no tunnel or station volumes. The map surface is faded, building extrusions are hidden only in Underground, and selected/preview stations show a dashed ground footprint and Ground 0 m reference. Surface Detailed retains 3D buildings. Ground is the existing uniform datum, not surveyed terrain.

Depth labels, hit testing, connection ports and pointer drawing share the same projection; cursor coordinates are unprojected onto the chosen rail-depth plane. Underground strokes keep a screen-space width; blueprint dashes are split geometrically to avoid short-segment shader artifacts. The x-ray layer ignores surface occlusion and clamps only clip Z so below-ground vertices are not cut by MapLibre's ground-oriented far plane; their physical XYZ and perspective remain intact. The enabled view persists in quicksave, including reload/Continue. Analysis selection returns to Surface. Targeted construction checks cover attachment, direction, atomic snapshots, depth projection, persistence and existing construction geometry.


### Unified physical-depth network and station labels

The active renderer now always places flat stations, depots and track vertices at their saved negative rail altitude on the normal basemap. Surface / Underground controls are removed. Clean/Detailed, buildings, population/jobs, existing rail overlays retain their normal behavior. Legacy underground save fields are accepted for compatibility and no longer control the active view.

A network-only depth prepass determines the nearest schematic per pixel. The color pass reads that buffer; station polygons and crossing tracks no longer depend on creation order. Ground/building color is retained while their depth buffer is cleared for the schematic overlay. An infinite far-plane projection keeps negative altitudes visible and preserves perspective XY. A small color-pass depth tolerance handles coplanar stroke precision; white track halos do not write the prepass depth. This is an x-ray planning scheme, not excavation or a terrain model.

Every station/depot envelope has a persistent dashed projection at ground altitude 0 m, including unselected assets and drawing previews. These references remain readable above the map. Station dots remain visible unless covered by a nearer network asset. Saved station name/depth labels appear only on hover by default; drawing previews still show construction dimensions. Map layers → Always show station labels persists the optional boolean `stationLabels` in quicksave (absent in legacy saves means false). Hover is session-only and clears when leaving the canvas.

Hover, selection and connection ports use the same physical projection and camera-distance ordering as the renderer. Projected pick geometry is cached per frame; hidden ports cannot snap through a nearer station. Label hover is reevaluated when the camera moves. Targeted checks include crossing stations at −10/−20 m in either creation order, a crossing track above both, tilted projection, label policy and preference persistence/rejection of malformed save values.

### Building occlusion, raised platforms and shared labels

The metro custom layer draws before building extrusions. It retains its own depth prepass for network intersections, then clears that depth before MapLibre draws the actual buildings. In the ordinary view, building extrusions are opaque, so they cover underground stations, track strokes and ground outlines where they overlap on screen. The basemap remains below the schematic, allowing depth planning in open areas. Hover, click, marker/label visibility and port snapping also respect MapLibre's rendered building silhouettes, including restored lower building supports. Clean display keeps its existing building visibility behavior; density analysis retains its translucent building context.

Platforms now have a closed prism from the saved rail level to rail level +1.5 m, with a light deck and shaded vertical walls. A single outline draw call covers the upper perimeter, lower perimeter and vertical corner edges; face diagonals are omitted. Outline vertices come from the platform mesh and share its depth testing, so hidden edges remain occluded. Track, station floor, saved rail depth and ground projections stay unchanged. Station and track labels share Map layers → Always show labels (the existing `stationLabels` save key remains compatible). A depth transition appears on hover of its track; constant-depth completed sections stay unlabelled. Track construction previews retain length while drawing; their depth transition follows the shared hover/label setting.

Manual gameplay checks use the current world until independent save slots are implemented, as recorded in AGENTS.md. No additional cloned save or server is needed for those checks.

### Construction dimensions and interaction

- Rail elevation: −100 to +50 m; station length: 50–300 m. Island platforms are 8 m wide; Side platforms and depot decks are 4 m wide. All platforms rise 1.5 m above the rail level. Cartographic rail strokes have fixed screen width.
- Station mouths remain available for multiple branches. Free track ends snap to each other with inherited elevation and tangent. All rail halos render before the cores to avoid white seams at joins.
- Right-click without dragging cancels the active drawing; right-drag still rotates and tilts. Placing a blueprint does not select it or require an extra confirmation click.
- Depot service decks sit between each pair of storage tracks; an odd last track has a side deck.
- Underground geometry uses a separate depth pass before buildings. Geometry at or above zero uses the native building depth buffer after buildings; mixed-height geometry is clipped per fragment into the two passes.
- Planned later: narrow, standard and wide platform choices. No width selector is implemented yet.

### Continuous rail snapping and compact clearances

Ordinary paired rail centres are 4 m apart (rounded from the 13 ft / 3.96 m example in Metro Rail Design Criteria §4.1.3, [guideway and trackwork](https://partners.skanska.com/usa/projects/098010/Q/C0980%20Conformed%20Contract%20Documents/5._Project_Def_Docs_of_equal_precedence/5b._Metro_Rail_Design_Criteria/1_Metro_Design_Criteria/MRDC_Section_04_Guideway_and_Trackwork_Rev_1_final_072511.pdf)). This is the game's baseline, not a universal New York clearance specification. Side stations use this spacing and 4 m outer platforms. Island stations use 12 m centres around an 8 m central platform with a 2 m platform-edge offset to each track centre. Depot tracks use 8 m centres across a 4 m service deck and 4 m centres between adjacent pairs, with a side deck for an odd final track. All decks rise 1.5 m above the saved rail-head elevation (a provisional gameplay value).

Interior connections use `{trackId, at, lane, direction}`: `at` is the normalized physical distance along the parent centreline; `direction` selects the outward tangent. Geometry resolves the selected lane and interpolates its exact junction elevation. No parent track is cut or replaced, so old endpoint references remain stable. Dependency traversal covers both endpoint and interior references for deletion, validation, history and saves. Future train routing can divide the parent virtually at these junctions.

Pointer magnetism projects the rails when camera/network changes, then searches continuous screen segments within 12 px. Clip-W interpolation converts a screen location back into the physical distance fraction under perspective. Parallel branches can be picked on either visible rail and attach at the paired centre. Single branches attach to the chosen individual lane. Elevation, opposing arrival/departure tangents, right-hand arrows, radius and grade checks remain active. Existing junctions remain reusable; ghost markers disappear when drawing is cancelled. Station attachment currently remains at free track ends.

### Named local snapshots

`Save` in the game menu writes a named snapshot; `Load Game` lists snapshots from the main menu. `/api/saves` supports list/create and `/api/saves/:id` loads a validated snapshot. Files are atomic JSON writes in `saves/manual/<UUID>.json`, ignored by Git. Display names are independent of file paths; duplicate names create separate snapshots rather than overwriting data. Corrupt files cannot replace valid snapshots. Full save validation and normalization are shared with quick save, including interior rail references. Loading restores camera, layers and the construction network, resets session Undo history and makes that world the current quick save. No named snapshot is automatically modified by quick save.

### Building updates during camera movement

The lower-mass building repair layer now waits for 250 ms of camera inactivity before updating. Camera and building-tile content changes mark it dirty; unrelated idle frames do not rebuild it. A spatial grid restricts containment checks to nearby building parts. A bounded cache reuses unchanged support geometry, and stable ordering avoids data uploads caused only by tile enumeration order. The ordinary map tiles and 3D building detail remain enabled. This reduces extra application work; it does not eliminate the native map's tile decoding and GPU uploads.

The shared map canvas uses the display pixel ratio capped at 2, preserving Retina sharpness for buildings and player construction. Off-screen label and port anchors skip building silhouette queries and network occlusion checks. Picking projections are reused across both rendering passes and unchanged camera frames; entirely off-screen picks are discarded, while lines crossing the viewport remain eligible. Rail snapping projections are prepared lazily when drawing requests a snap instead of during ordinary camera navigation. These changes do not guarantee that native tile-loading stalls are eliminated.

### Single track strokes and automatic network batching

Each physical track is displayed as one fixed 1.2 CSS-pixel centerline with a 2.4 px halo; Parallel sections therefore show two lines. Station, depot, scissors and preview tracks share this representation at every zoom. The former rail-pair offsets, zoom-morph attributes and duplicate rail picking paths are removed. Picking retains each asset ID, lane center and physical elevation; routing, snapping, connections and saves keep their original data.

Network strokes are collected by color, width and opacity within separate base, preview, ground-reference and route groups. After a network edit, each style is uploaded once, regardless of the number of sections. Direction arrows share one LineSegments object per base/preview group. Rebuilds clear old batches and dispose their GPU geometry. This happens automatically for newly drawn and loaded assets, including blueprints, selected objects and invalid previews. Dashed blueprint geometry, platform edge heights, building occlusion and depth passes are retained. The camera changes projection and screen resolution without rebuilding stroke geometry.

### Depot fans, selection and compact help

Depot storage tracks branch successively from two shared entrance leads, replacing the short quintic fan. Leads start with 20 m straights, curve toward a diagonal ladder at up to 25°, and feed tangent siding arcs with a 60 m radius. Shared leads are rendered once, with explicit samples at turnout joins. The throat grows with the outermost siding offset; all service decks retain 200 m of usable length and 4 m width. Existing entrance positions, orientation anchors, elevations and external connections are unchanged. The saved 300 m start/end baseline now defines orientation rather than total yard length; the rear geometry extends as required. New placements validate the expanded footprint. Legacy yards near the city boundary still load against their original footprint bounds. These internal yard curves remain visual geometry, without a turnout or train-routing simulation.

Construction has an explicit Select mode so track drawing magnetism does not prevent selecting tracks for removal. Clicking an object outside construction also enters Select. Station, track and depot selections expose the existing blueprint deletion or built-object demolition actions, dependent-section count and transaction-based Undo. Depot fan rails outside the yard envelope participate in station picking. Selecting empty space clears the selection; switching to a drawing tool clears it too. Select is session state, not a saved asset type.

MapLibre box zoom is disabled for every active construction tool, including Station, Depot and Select. Its Shift + left-mouse gesture must not consume construction clicks. Shift straight-lock handling remains specific to Track; ordinary map box zoom returns when construction is inactive.

How to play uses four concise cards in a wider dialog. Narrow or short windows display the same topics one at a time through topic buttons. Both close actions remain outside the cards, with no content scrollbar. Help text describes current placement, selection, saving and camera controls.

### Metro line planning

`metroLines.ts` builds a directed lane graph from built player infrastructure. Station left lanes run end → start and right lanes start → end; single tracks inherit `trackForward`. Station midpoints are stop nodes on each independent lane. Track endpoints and saved interior reference fractions split each lane virtually, retaining existing asset identifiers and sampled elevation profiles. Only explicit station/track references join nodes. Geographic crossings, close free endpoints, blueprints and depot storage rails do not create passenger-route connections. Paired endpoint references match lanes by physical endpoint position, including reversed track orientation.

Routing uses Dijkstra search over `(node, next stop, arrival edge)` states so each itinerary follows the chosen order and preserves its arrival heading through switch junctions and zero-length asset links. The selected platform stop permits a direction reversal for a terminal cab change; ordinary switch nodes do not. Crossover lane names are kept separate from graph node destinations. Trains cannot change platforms without a connected rail path. It finds one directed itinerary; a return route needs its own physical connections. Stops are ordered visits, so a station may appear again on the return trip, and consecutive visits to its opposite platforms represent a terminal turnback. Consecutive identical station/platform visits are rejected as duplicate clicks. A repeated first station/platform can close a loop without locking further editing. Save validation preserves every visit and its platform; each leg still requires a directed physical path. Failed searches retain any reachable prefix and identify the first unresolved leg. This is route planning, without train dispatch, signals or depot assignments. New tracks with `scissors: true` derive two smooth crossovers per attached passenger-station mouth (75 m minimum section, 22 m offset after the 20 m approach, up to 30 m crossover length). The graph cuts both lanes at crossover ends, joins only the corresponding diagonal endpoints (not the X centre), and permits reverse travel through station lanes and their switch throats. Main tracks beyond the switches remain directed. This models route access and platform turnbacks, not a running train or interlocking simulation.

Lines have immutable IDs, names, palette colors, ordered station IDs and optional parallel `platforms` arrays (`left` / `right`). Legacy routes without platform metadata still search both sides; editing infers the sides from the existing valid route. The Lines panel edits a draft before Save line commits it; only connected routes can be newly saved. All visible built passenger stations immediately expose two 22 px platform + buttons while creating or editing a line. Each pair stays at least 48 px apart with leaders to the physical boarding faces. The overlay caches anchors and DOM elements, culls off-screen stations and tracks camera projection without querying building occlusion or rebuilding rail geometry. Closing the editor hides all buttons; no station-selection click or station dropdown is needed. Route search accepts only the requested lane midpoint at each stop. All saved route strokes (4 CSS pixels) and boarding-face outlines use the same physical-depth renderer and building occlusion as the network; unresolved legs use a graphite dashed display stroke. Graphs and routes are memoized by network/stop-list changes, never rebuilt for camera movement or name typing.

`stationNames.ts` names newly placed passenger stations from OSM source features, including names hidden by map styling: nearest crossing street within the station span (plus a 20 m end margin), ranked by distance to its centre and excluding near-parallel road segments. Used station names are skipped in favour of another crossing, a nearby named feature or a junction name. Existing station names are untouched; the OSM city name New York remains the unloaded-data fallback.

Optional `lines` metadata is validated and copied by both save endpoints, with backward compatibility for older worlds. The alpha limits are 16 lines and 32 stops per line. Missing station references remain readable as broken lines after demolition and can be repaired in the editor. Network history includes line metadata, making saved line edits/deletion and construction Undo consistent. Draft Ctrl/Cmd+Z removes the latest stop; input text retains native undo. Both local save endpoints accept up to 256 KiB for the larger world snapshots. No user saves or extra worlds are created for routing checks; API tests use temporary directories and ephemeral localhost ports.

Station approach tapers now use a 20 m length but receive 32 local sampling intervals per widened end, independently of the base section sampling. Farther track geometry keeps its original sample density.

Station midpoint markers are screen-space navigation symbols and stay visible over buildings and network geometry at all camera tilts. Other station/track geometry retains physical occlusion. New station attachments reserve a 22 m connector for the longer approach; existing saved placements stay unchanged.

### Compact line details and batched route drawing

Opening Lines starts with the line cards only. Clicking a card toggles its stop list and edit/delete actions; closing the panel (including Escape) clears the selection. Selection no longer invalidates the saved route overlay or recomputes the draft route.

Colored route segments share one stroke geometry per line; station platform outlines share a second geometry, with repeated station/platform outlines deduplicated. Paths remain disconnected and retain their individual per-vertex elevations, 4 px route widths, 2 px platform outlines and existing depth/occlusion passes. Broken gaps keep their dashed strokes. The current two complete saved lines use four route/outline objects instead of 463. This reduces rendering submissions without lowering building or network detail; it is not a measured frame-rate guarantee.

### Hudson County analysis extension

The shared Population and Jobs modes combine the original 2,325 NYC tracts with all 183 Census 2020 Hudson County tracts. Coverage includes Jersey City, Hoboken, Bayonne, Weehawken, Union City, West New York, North Bergen, Guttenberg, Secaucus, Kearny, Harrison and East Newark. Hudson totals are 724,854 residents and 119.640822 km² of official land area. Each tract belongs to one municipality according to the NJ LODES crosswalk; population and land totals match all 12 Census 2020 county subdivision records. Workplace jobs use the same 2023 S000/JT00 C000 definition as NYC. Exact job and block totals are recorded in the generated metadata.

Display polygons subtract TIGER 2020 area water. Density uses official Census land area, independently of display geometry. Colors, scale thresholds, legend, boundaries and clickable cards are shared with NYC; NYC coverage and source files are unchanged. Map display defaults are applied before analysis opacity so the first asynchronous layer load matches later switches.

Rebuild with `python3 scripts/prepare-hudson.py RAW_DIRECTORY 2026-10-15`, using Shapely 2.1.2 and PyShp 3.0.3 for offline geometry preparation. The raw directory contains `hudson-tracts-2020.geojson` (TIGERweb Census2020 layer 6, STATE=34, COUNTY=017, all fields, EPSG:4326), `hudson-municipalities-2020.geojson` (layer 20, same county query), `hudson-water-2020.zip`, `nj-xwalk.csv.gz` and `nj-wac-2023.csv.gz`. Source URLs, input hashes, reference years, totals and methods are in `public/data/hudson-analysis-metadata.json`. GIS libraries and raw downloads are not required at game runtime.
