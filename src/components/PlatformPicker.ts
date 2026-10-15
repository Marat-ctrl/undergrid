import { platformName,type PlatformSide } from './metroLines';
import { elevationText } from './constructionDimensions';
import { platformChoicePositions,type ScreenPoint } from './platformChoices';
import type { PlacedStation } from './stationPlacement';

export function createPlatformPicker(container:HTMLElement,onChoose:(id:string,side:PlatformSide)=>void){
 const root=document.createElement('div');root.className='platform-picker';root.hidden=true;
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('aria-hidden','true');root.append(svg);
 const caption=document.createElement('div');caption.className='platform-picker-name';caption.hidden=true;root.append(caption);
 interface Entry {group:HTMLDivElement;buttons:HTMLButtonElement[];leaders:Element[];name:string;transform:string;}
 const entries=new Map<string,Entry>(),seen=new Set<string>();let hovered:string|null=null;
 const attribute=(node:Element,key:string,value:string)=>{if(node.getAttribute(key)!==value)node.setAttribute(key,value);};
 const showCaption=(id:string)=>{const entry=entries.get(id);if(!entry)return;hovered=id;caption.hidden=false;caption.textContent=entry.name;caption.style.transform=entry.transform;};
 const create=(id:string):Entry=>{
  const group=document.createElement('div');root.append(group);
  const leaders=[0,1].map(()=>{const line=document.createElementNS(svg.namespaceURI,'line');svg.append(line);return line;});
  const buttons=(['left','right'] as const).map((side,index)=>{
   const button=document.createElement('button');button.type='button';button.className='platform-choice';button.dataset.platform=side;button.dataset.stationId=id;
   const plus=document.createElement('span');plus.className='platform-choice-plus';plus.textContent='+';plus.setAttribute('aria-hidden','true');
   const number=document.createElement('small');number.textContent=String(index+1);number.setAttribute('aria-hidden','true');button.append(plus,number);
   for(const event of ['pointerdown','mousedown','dblclick'])button.addEventListener(event,e=>e.stopPropagation());
   for(const event of ['mouseenter','focus'])button.addEventListener(event,()=>showCaption(id));
   for(const event of ['mouseleave','blur'])button.addEventListener(event,()=>{hovered=null;caption.hidden=true;});
   button.addEventListener('click',event=>{event.stopPropagation();onChoose(id,side);});group.append(button);return button;
  });return {group,leaders,buttons,name:'',transform:''};
 };
 container.append(root);
 return {hide(){root.hidden=true;caption.hidden=true;hovered=null;},remove(){root.remove();entries.clear();},begin(){root.hidden=false;seen.clear();},end(){
  for(const [id,entry] of entries)if(!seen.has(id)){entry.group.remove();entry.leaders.forEach(line=>line.remove());entries.delete(id);if(hovered===id){hovered=null;caption.hidden=true;}}
 },show(station:PlacedStation,anchors:[ScreenPoint,ScreenPoint],width:number,height:number,color:string){
  seen.add(station.id);let entry=entries.get(station.id);if(!entry){entry=create(station.id);entries.set(station.id,entry);}
  const positions=platformChoicePositions(...anchors,width,height);root.style.setProperty('--route-color',color);
  entry.name=`${station.name}\n${elevationText(station.depth)} m`;
  const above=Math.min(...positions.map(p=>p.y))-18,below=above<32,y=below?Math.max(...positions.map(p=>p.y))+18:above,x=Math.max(110,Math.min(width-110,(positions[0].x+positions[1].x)/2));
  entry.transform=`translate(${x}px,${y}px) translate(-50%,${below?'0':'-100%'})`;
  if(hovered===station.id)showCaption(station.id);
  for(const [i,button] of entry.buttons.entries()){
   const side=i===0?'left':'right',name=`Add ${station.name} · ${platformName(side)}`;attribute(button,'aria-label',name);attribute(button,'title',name);
   const transform=`translate(${positions[i].x}px,${positions[i].y}px) translate(-50%,-50%)`;if(button.style.transform!==transform)button.style.transform=transform;
   const line=entry.leaders[i];attribute(line,'x1',String(anchors[i].x));attribute(line,'y1',String(anchors[i].y));attribute(line,'x2',String(positions[i].x));attribute(line,'y2',String(positions[i].y));
  }
 }};
}
