import { MercatorCoordinate, type ExpressionSpecification } from 'maplibre-gl';
export function metroWidthPixels(metres:number,zoom:number){return metres*MercatorCoordinate.fromLngLat([-74.005,40.7126]).meterInMercatorCoordinateUnits()*512*2**zoom;}
export function metroLineWidth(metres:number,minimum:number):ExpressionSpecification{
 const stops:number[]=[];for(let zoom=10;zoom<=22;zoom++)stops.push(zoom,Math.max(minimum,metroWidthPixels(metres,zoom)));
 return ['interpolate',['exponential',2],['zoom'],...stops] as ExpressionSpecification;
}
