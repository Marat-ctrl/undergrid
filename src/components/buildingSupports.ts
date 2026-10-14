import type { Feature, FeatureCollection, Polygon, MultiPolygon, Position } from 'geojson';
type Building=Feature<Polygon|MultiPolygon>;
function inRing(point:Position,ring:Position[]){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
function contains(building:Building,point:Position){const polygons=building.geometry.type==='Polygon'?[building.geometry.coordinates]:building.geometry.coordinates;return polygons.some(polygon=>inRing(point,polygon[0])&&!polygon.slice(1).some(hole=>inRing(point,hole)));}
function centre(building:Building):Position{const ring=building.geometry.type==='Polygon'?building.geometry.coordinates[0]:building.geometry.coordinates[0][0];const points=ring.slice(0,-1);return [points.reduce((sum,p)=>sum+p[0],0)/points.length,points.reduce((sum,p)=>sum+p[1],0)/points.length];}
// Restore a missing lower mass only where a hidden outline contains elevated visible parts and no ground-level part.
export function missingBuildingSupports(buildings:Building[]):FeatureCollection<Polygon|MultiPolygon>{
 const parts=buildings.filter(b=>b.properties?.hide_3d!==true).map(building=>({building,point:centre(building),base:Number(building.properties?.render_min_height??0)}));
 const features:Building[]=[];const seen=new Set<string>();
 for(const outline of buildings){
   if(outline.properties?.hide_3d!==true||Number(outline.properties.render_min_height??0)!==0)continue;
   let lowest=Infinity;
   for(const part of parts)if(contains(outline,part.point))lowest=Math.min(lowest,part.base);
   if(!Number.isFinite(lowest))continue;
   const height=Math.min(lowest,Number(outline.properties.render_height));
   if(!Number.isFinite(height)||height<=0)continue;
   const key=JSON.stringify(outline.geometry);if(seen.has(key))continue;seen.add(key);
   features.push({type:'Feature',geometry:outline.geometry,properties:{supportHeight:height}});
 }
 return {type:'FeatureCollection',features};
}
