import type { Feature, FeatureCollection, Polygon, MultiPolygon, Position } from 'geojson';
type Building=Feature<Polygon|MultiPolygon>;
function inRing(point:Position,ring:Position[]){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
function contains(building:Building,point:Position){const polygons=building.geometry.type==='Polygon'?[building.geometry.coordinates]:building.geometry.coordinates;return polygons.some(polygon=>inRing(point,polygon[0])&&!polygon.slice(1).some(hole=>inRing(point,hole)));}
function centre(building:Building):Position{const ring=building.geometry.type==='Polygon'?building.geometry.coordinates[0]:building.geometry.coordinates[0][0];const points=ring.slice(0,-1);return [points.reduce((sum,p)=>sum+p[0],0)/points.length,points.reduce((sum,p)=>sum+p[1],0)/points.length];}
// Restore a missing lower mass only where a hidden outline contains elevated visible parts and no ground-level part.
export function missingBuildingSupports(buildings:Building[],cache=new Map<string,Building>()):FeatureCollection<Polygon|MultiPolygon>{
 const parts=buildings.filter(b=>b.properties?.hide_3d!==true).map(building=>({building,point:centre(building),base:Number(building.properties?.render_min_height??0)}));
 // Search nearby parts rather than scanning every building for every hidden outline.
 const cell=.002,buckets=new Map<string,typeof parts>();
 for(const part of parts){const key=`${Math.floor(part.point[0]/cell)}:${Math.floor(part.point[1]/cell)}`;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key)!.push(part);}
 const features:Building[]=[];const seen=new Set<string>(),keys=new Map<Building,string>();
 for(const outline of buildings){
   if(outline.properties?.hide_3d!==true||Number(outline.properties.render_min_height??0)!==0)continue;
   const key=JSON.stringify(outline.geometry);if(seen.has(key))continue;seen.add(key);
   const polygons=outline.geometry.type==='Polygon'?[outline.geometry.coordinates]:outline.geometry.coordinates;
   let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
   for(const polygon of polygons)for(const p of polygon[0]){minX=Math.min(minX,Math.floor(p[0]/cell));maxX=Math.max(maxX,Math.floor(p[0]/cell));minY=Math.min(minY,Math.floor(p[1]/cell));maxY=Math.max(maxY,Math.floor(p[1]/cell));}
   const broad=(maxX-minX+1)*(maxY-minY+1)>4096,candidates:typeof parts=broad?parts:[];
   if(!broad)for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++)candidates.push(...(buckets.get(`${x}:${y}`)??[]));
   let lowest=Infinity;
   for(const part of candidates)if(contains(outline,part.point)){lowest=Math.min(lowest,part.base);if(lowest<=0)break;}
   if(!Number.isFinite(lowest))continue;
   const height=Math.min(lowest,Number(outline.properties.render_height));
   if(!Number.isFinite(height)||height<=0)continue;
   let feature=cache.get(key);
   if(feature?.properties?.supportHeight!==height){feature={type:'Feature',geometry:outline.geometry,properties:{supportHeight:height}};cache.set(key,feature);if(cache.size>1024)cache.delete(cache.keys().next().value!);}
   features.push(feature!);keys.set(feature!,key);
 }
 features.sort((a,b)=>keys.get(a)!.localeCompare(keys.get(b)!));
 return {type:'FeatureCollection',features};
}
