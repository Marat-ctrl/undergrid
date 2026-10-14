import { BufferGeometry,Float32BufferAttribute,ShapeUtils,Vector2 } from 'three';
import { depthPosition } from './depthProjection';
import type { Coordinate } from './stationPlacement';
export const PLATFORM_HEIGHT_METRES=1.5;
// Closed platform prism: rail altitude stays unchanged; the deck rises 1.5 metres.
export function platformGeometry(ring:Coordinate[],railDepth:number){
 const points=ring.slice(0,-1),bottom=points.map(p=>depthPosition(p,railDepth)),top=points.map(p=>depthPosition(p,railDepth+PLATFORM_HEIGHT_METRES)),n=points.length;
 const faces=ShapeUtils.triangulateShape(bottom.map(p=>new Vector2(p.x,p.y)),[]),roof=faces.flatMap(face=>face.map(i=>i+n)),walls=faces.flatMap(face=>[face[2],face[1],face[0]]);
 for(let i=0;i<n;i++){const j=(i+1)%n;walls.push(i,j,j+n,i,j+n,i+n);}
 const geometry=new BufferGeometry().setAttribute('position',new Float32BufferAttribute([...bottom,...top].flatMap(p=>p.toArray()),3));geometry.setIndex([...roof,...walls]);geometry.addGroup(0,roof.length,0);geometry.addGroup(roof.length,walls.length,1);geometry.computeVertexNormals();return geometry;
}

// Outline only the prism's perimeter edges, without diagonals from face triangulation.
// Reuse the mesh vertices so edges and faces share exactly the same physical elevation.
export function platformEdgePositions(geometry:BufferGeometry){
 const vertices=geometry.getAttribute('position'),n=vertices.count/2,segments:number[]=[];
 const edge=(a:number,b:number)=>segments.push(vertices.getX(a),vertices.getY(a),vertices.getZ(a),vertices.getX(b),vertices.getY(b),vertices.getZ(b));
 for(let i=0;i<n;i++){const j=(i+1)%n;edge(i,j);edge(i+n,j+n);edge(i,i+n);}
 return segments;
}
