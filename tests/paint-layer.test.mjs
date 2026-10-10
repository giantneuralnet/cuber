import assert from 'node:assert/strict';
import {freshPaintLayer,validatePaintLayer,appendPaintFrame,deletePaintFrame,paintFrameForPose} from '../dist/paint-layer.js';
import {ViewCubeTap} from '../dist/view-cube.js';

const layer=freshPaintLayer();
assert.ok(validatePaintLayer(layer));
layer.frames[0].png='data:image/png;base64,first';
appendPaintFrame(layer);
layer.frames[1].png='';
assert.equal(layer.frames[0].png,'data:image/png;base64,first');
appendPaintFrame(layer);
const animations=[{frames:[{paintFrame:0},{paintFrame:1},{paintFrame:2},{}]},{frames:[{paintFrame:2}]}];
layer.frame=1;
assert.equal(deletePaintFrame(layer,animations),true);
assert.deepEqual(animations.map(a=>a.frames.map(f=>f.paintFrame)),[[0,1,1,0],[1]]);
assert.equal(paintFrameForPose({},layer),0);
assert.equal(paintFrameForPose({paintFrame:9},layer),1);
layer.frame=1;deletePaintFrame(layer,animations);
assert.ok(animations.every(a=>a.frames.every(f=>f.paintFrame===0)));
assert.equal(deletePaintFrame(layer,animations),false);
while(appendPaintFrame(layer)){}
assert.equal(layer.frames.length,16);
assert.equal(appendPaintFrame(layer),false);
assert.equal(validatePaintLayer({...layer,frame:16}),false);
assert.equal(validatePaintLayer({frame:0,frames:[{png:'bad'}]}),false);

let pending=null,selected=[],recenters=0;
const tap=new ViewCubeTap({select:view=>selected.push(view),recenter:()=>recenters++,setTimer:fn=>(pending=fn,1),clearTimer:()=>pending=null});
tap.tap('front',10,10,0);assert.deepEqual(selected,['front']);pending();
assert.deepEqual(selected,['front']);
tap.tap('top',10,10,1000);tap.tap('top',11,12,1150);
assert.equal(recenters,1);assert.equal(pending,null);assert.deepEqual(selected,['front','top']);
tap.tap('right',10,10,2000);tap.cancel();assert.equal(pending,null);
console.log('PASS: independent texture frames, limits, deletion reference repair, legacy defaults, and single/double/drag view-cube gestures.');
