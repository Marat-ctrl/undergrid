import { initialState, applyCommand, tick, validateSave, type Command } from './core';
let state=initialState();let speed=0;
self.onmessage=(event:MessageEvent)=>{const m=event.data;if(m.type==='command'){const error=applyCommand(state,m.command as Command);if(error)self.postMessage({type:'error',message:error});}if(m.type==='speed')speed=m.speed;if(m.type==='reset'){state=initialState();speed=0;}if(m.type==='load'){if(validateSave(m.state)){state=m.state;speed=0;}else self.postMessage({type:'error',message:'This save file is invalid or incompatible.'});}self.postMessage({type:'state',state,speed});};
setInterval(()=>{for(let i=0;i<speed;i++)tick(state,0.5);self.postMessage({type:'state',state,speed});},100);
self.postMessage({type:'state',state,speed});
