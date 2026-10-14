# Station model research and Undergrid adaptation

Sources reviewed October 14, 2026:

- [Subway Builder Type Reference](https://www.subwaybuilder.com/docs/api-reference/types): Station has stable ID, map coordinates, track IDs, track group ID, station-track routing node IDs and a preview/blueprint/constructed build stage. Tracks have start/end elevations, geometry and station feature types.
- [Build Automation](https://www.subwaybuilder.com/docs/api-reference/build): parallel track groups have a centreline; placing blueprints and constructing them are separate operations.
- [Station Types](https://www.subwaybuilder.com/docs/api-reference/stations): walking catchment, transfer radius, walking speed and dwell parameters influence routing. This documents station-level accessibility, not independently simulated street entrances.
- [Map Customization](https://www.subwaybuilder.com/docs/api-reference/map): the game exposes a MapLibre instance and station/track map layers.

The reviewed public Station schema and changelog do not document individually placed 3D street entrances, their stair orientation, or their interior connections. This is a limitation of the available evidence, not proof about private internals or every game version. Undergrid does not claim to reproduce an undocumented entrance algorithm.

## Adaptation in this prototype

`StationModel` separates station data from Three.js meshes. It carries identity, coordinate origin, axis bearing, dimensions, stage, a parallel track group, platforms bound to tracks, and entrances bound to the station/platform. The demo remains preview-only, not a constructed asset in a quicksave. It is not yet a passenger routing graph or a playable blueprint/build tool.

Each street entrance uses the same local geometry once, with its own position and rotation. The west pair has rotation 0; the east pair rotates by π. The staircase opening, canopy, supports and sign rotate together. Both openings face away from the station centre. Changing station bearing rotates the whole local layout coherently. Station marker and 3D geometry read the same station coordinate origin.

Surface entrance models are an Undergrid extension. Platform associations are data relationships, not simulated pedestrian passages or a verified accessible design. Future construction can reuse the descriptor for preview placement, rotation, depth, independent entrance editing and routing nodes; those player tools are not added in this change.
