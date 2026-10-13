import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildingTileZoom, cameraDelta, gestureAxis } from './camera';
test('vertical orbit gestures do not turn into rotation at the pitch limit',()=>{
  const axis=gestureAxis(2,-20);assert.equal(axis,'pitch');
  const limit=cameraDelta(69,35,40,-80,axis);assert.equal(limit.pitch,70);assert.equal(limit.bearing,35);
  const reverse=cameraDelta(limit.pitch,limit.bearing,1,10,axis);assert.ok(reverse.pitch<70);assert.equal(reverse.bearing,35);
});
test('horizontal gestures rotate without changing pitch, and diagonal gestures support both',()=>{
  assert.deepEqual(cameraDelta(40,0,20,2,gestureAxis(20,2)),{pitch:40,bearing:6.4});
  const diagonal=cameraDelta(40,0,20,-20,gestureAxis(20,-20));assert.ok(diagonal.pitch>40);assert.ok(diagonal.bearing>0);
});
test('the building source retains detail independently of distance and caps at provider zoom',()=>{
  assert.equal(buildingTileZoom(14.8),14);assert.equal(buildingTileZoom(18),14);assert.equal(buildingTileZoom(13),13);
});
