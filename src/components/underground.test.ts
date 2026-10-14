import test from 'node:test';
import assert from 'node:assert/strict';
import {foundationRange,foundationRisk,isPlanningLayers} from './underground';
import {isQuickSave,DEFAULT_CAMERA} from '../gameSave';
test('unknown heights never produce a clearance estimate',()=>{for(const h of [null,0,-10,NaN,Infinity]){assert.equal(foundationRange(h),null);assert.equal(foundationRisk(h,100),'unknown');}});
test('tunnel envelope and buffer change risk with depth and height',()=>{assert.deepEqual(foundationRange(100),[6,16]);assert.equal(foundationRisk(100,11),'overlap');assert.equal(foundationRisk(100,12),'uncertain');assert.equal(foundationRisk(100,21),'uncertain');assert.equal(foundationRisk(100,22),'lower');assert.equal(foundationRisk(400,25),'overlap');});
test('old saves remain valid and planning settings are validated',()=>{const save={version:1,city:'new-york',active:true,updatedAt:1,camera:DEFAULT_CAMERA,preset:'clean'};assert.ok(isQuickSave(save));const planning={existingRail:true,foundations:true,plannedDepth:25};assert.ok(isQuickSave({...save,planning}));for(const plannedDepth of [0,101,25.5,NaN])assert.equal(isPlanningLayers({...planning,plannedDepth}),false);assert.equal(isQuickSave({...save,planning:{...planning,existingRail:'yes'}}),false);});
