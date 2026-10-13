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

Choose **New Game → New York → Start**. Drag to pan and scroll to zoom. Right-drag (or Ctrl + drag) vertically to tilt, horizontally to rotate, or diagonally to change both. The dominant axis is locked for each gesture. Use Map display for Clean, Standard and Detailed presets, 3D building visibility, without permanent camera sliders. The cube toggles a tilted view; the compass resets the view. Escape opens the menu, where you can resume or return to the main menu.

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
