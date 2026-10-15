// Neutral structures with restrained landscape colors. Routes keep their saved colors.
export const MAP_PALETTE={
 land:'#f5f5f5',wood:'#c9d3c4',park:'#d5decf',water:'#bccdd5',
 minorRoad:'#dedede',majorRoad:'#bdbdbd',path:'#c4c4c4',
 footprint:'#e2e2e2',footprintEdge:'#bcbcbc',building:'#d2d2d2',
 place:'#626262',neighborhood:'#737373',roadLabel:'#777777',poi:'#686868',
 railSurface:'#555555',railBridge:'#202020',railTunnel:'#858585'
} as const;
export const METRO_PALETTE={
 built:'#454545',blueprint:'#777777',selected:'#111111',invalid:'#111111',
 halo:'#ffffff',platformTop:'#fafafa',platformSide:'#bcbcbc',
 port:'#454545',hotPort:'#111111',gap:'#333333'
} as const;
export const DENSITY_PALETTE=['#f0f0f0','#d6d6d6','#b4b4b4','#8a8a8a','#5e5e5e','#303030'] as const;
