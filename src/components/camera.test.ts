import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildingTileZoom, cameraDelta } from './camera';
test('pure vertical gestures clamp pitch and reverse immediately without changing bearing',()=>{
  const limit=cameraDelta(69,35,0,-80);assert.equal(limit.pitch,70);assert.equal(limit.bearing,35);
  const reverse=cameraDelta(limit.pitch,limit.bearing,0,10);assert.ok(reverse.pitch<70);assert.equal(reverse.bearing,35);
});
test('both camera axes remain available when a gesture changes direction',()=>{
  const vertical=cameraDelta(40,0,0,-20);
  const diagonal=cameraDelta(vertical.pitch,vertical.bearing,20,-20);
  assert.ok(diagonal.pitch>vertical.pitch);assert.ok(diagonal.bearing>vertical.bearing);
  const horizontal=cameraDelta(diagonal.pitch,diagonal.bearing,20,0);
  assert.equal(horizontal.pitch,diagonal.pitch);assert.ok(horizontal.bearing>diagonal.bearing);
});
test('the building source retains detail independently of distance and caps at provider zoom',()=>{
  assert.equal(buildingTileZoom(14.8),14);assert.equal(buildingTileZoom(18),14);assert.equal(buildingTileZoom(13),13);
});
