// Gameplay dimensions are physical metres; screen-space rail strokes are cartographic symbols.
export const MIN_ELEVATION=-100;
export const MAX_ELEVATION=50;
export const MIN_STATION_LENGTH=50;
export const MAX_STATION_LENGTH=300;
export const PLATFORM_WIDTH_METRES=4;
export const ISLAND_PLATFORM_WIDTH_METRES=8;
// Rounded 13 ft (3.96 m) guideway spacing; platform clearances use a 2 m lateral offset.
export const ROUTE_TRACK_CENTRES_METRES=4;
export const PLATFORM_TRACK_OFFSET_METRES=2;
export const DEPOT_PLATFORM_WIDTH_METRES=4;
export function stationHalfSpacing(layout:'side'|'island'){return layout==='side'?ROUTE_TRACK_CENTRES_METRES/2:ISLAND_PLATFORM_WIDTH_METRES/2+PLATFORM_TRACK_OFFSET_METRES;}
export function depotRowOffsets(capacity:number){const rows=Array.from({length:capacity},(_,i)=>Math.floor(i/2)*(DEPOT_PLATFORM_WIDTH_METRES+2*PLATFORM_TRACK_OFFSET_METRES+ROUTE_TRACK_CENTRES_METRES)+(i%2)*(DEPOT_PLATFORM_WIDTH_METRES+2*PLATFORM_TRACK_OFFSET_METRES));const centre=(rows[0]+rows.at(-1)!)/2;return rows.map(row=>row-centre);}
export function elevationText(value:number){const rounded=Math.round(value*10)/10;return `${rounded<0?'−':rounded>0?'+':''}${Math.abs(rounded)}`;}
