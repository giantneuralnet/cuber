import assert from 'node:assert/strict';
import * as T from '../dist/vendor/three.module.js';
import {snapProjectToGrid} from '../dist/editor-geometry.js';
import {editShape,editJoint,slidePosition,projectPose} from '../dist/model-ops.js';
import {faceResize,shapePreviewBase} from '../dist/build-editing.js';
import {snapOnPlane} from '../dist/world-grid.js';
const V=a=>new T.Vector3(...a),Q=a=>new T.Quaternion(...a),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`),grid=(v,s)=>near(v/s,Math.round(v/s));
const boxes=[
 {id:0,parent:null,p:[.03,.53,.04],q:[0,0,0,1],size:[1,1,1]},
 {id:1,parent:0,p:[.23,1.18,.04],q:[0,0,0,1],size:[.3,.3,.3],a:[.2,.5,0],b:[0,-.15,0],normal:[0,1,0]},
 {id:2,parent:1,p:[.23,1.48,.04],q:[0,0,0,1],size:[.3,.3,.3],a:[0,.15,0],b:[0,-.15,0],normal:[0,1,0]}
];
const base={boxes,gridSize:.1,pixelDensity:16,animations:[{frames:[{pose:projectPose(boxes,Object.fromEntries(boxes.map(b=>[b.id,b])))}]}]};
for(const step of [0,1/16,2/16,4/16,8/16,1,2]){
 const result=snapProjectToGrid(base,step),delta=V(result.boxes[0].p).sub(V(boxes[0].p));
 if(step)result.boxes[0].p.forEach(v=>grid(v,step));
 for(let i=0;i<boxes.length;i++){
  const b=result.boxes[i];assert.deepEqual(b.size,boxes[i].size);assert.deepEqual(b.a,boxes[i].a);assert.deepEqual(b.b,boxes[i].b);
  near(V(b.p).sub(V(boxes[i].p)).distanceTo(delta),0);
  near(V(result.animations[0].frames[0].pose[i].p).sub(V(base.animations[0].frames[0].pose[i].p)).distanceTo(delta),0);
  if(i)near(b.p[1]-b.size[1]/2,result.boxes[i-1].p[1]+result.boxes[i-1].size[1]/2);
 }
 assert.deepEqual(snapProjectToGrid(result,step),result,'repeated setting is stable');
}
// Off-grid starts must land on global coordinates, not multiples from the start.
const rootSlide=slidePosition(base,0,[.17,99,-.17]);near(rootSlide[0],.2);near(rootSlide[2],-.2);near(rootSlide[1],.53);
const childSlide=slidePosition(base,1,[.17,99,-.17]);near(childSlide[0],.2);near(childSlide[2],-.2);near(childSlide[1],1.18);
const joint=editJoint(base,1,[.26,1.03,.11]).boxes[1],world=V(joint.a).add(V(boxes[0].p));grid(world.x,.1);grid(world.z,.1);near(world.y,1.03);near(V(joint.p).distanceTo(V(boxes[1].p)),0);
for(const sign of [-1,1]){
 const args=faceResize(base,0,[sign,0,0],.23,{}),resized=editShape(base,0,args.position,args.size),root=resized.boxes[0];
 grid(root.p[0]+sign*root.size[0]/2,.1);near(root.p[0]-sign*root.size[0]/2,boxes[0].p[0]-sign*.5);
 const child=resized.boxes[1],pivot=V(child.a).add(V(root.p));grid(pivot.x,.1);grid(pivot.z,.1);near(pivot.y,root.p[1]+root.size[1]/2);
 near(child.p[1]-.15,root.p[1]+root.size[1]/2);near(V(resized.boxes[2].p).sub(V(child.p)).distanceTo(V(boxes[2].p).sub(V(boxes[1].p))),0);
 assert.deepEqual(editShape(shapePreviewBase(base),0,args.position,args.size).boxes,resized.boxes);
}
// Shrinking slides the edited cube's own pivot onto a feasible grid point.
const shrink=editShape(base,1,[.31,1.18,.04],[.14,.3,.3]),pivot=V(shrink.boxes[1].a).add(V(boxes[0].p));grid(pivot.x,.1);grid(pivot.z,.1);near(shrink.boxes[1].p[0],.31);
// If a coarse lattice has no point in a tiny overlap, retain contact; never jump out.
const tiny=editJoint({...base,gridSize:2},1,[99,1.03,99]).boxes[1];near(V(tiny.p).distanceTo(V(boxes[1].p)),0);tiny.b.forEach((v,i)=>assert.ok(Math.abs(v)<=tiny.size[i]/2+1e-8));
// Rotated face: two global coordinates quantized, the third solves the plane.
const normal=V([.2,1,.3]).normalize(),point=V([.13,.72,-.26]),result=snapOnPlane(point,normal,.1);grid(result.x,.1);grid(result.z,.1);near(normal.dot(result),normal.dot(point));
// Zero snapping preserves continuous joint motion.
const free=editJoint({...base,gridSize:0},1,[.261,1.03,.113]).boxes[1];near(free.a[0]+boxes[0].p[0],.261);near(free.a[2]+boxes[0].p[2],.113);
assert.deepEqual(base.boxes,boxes);
console.log('PASS global movement/face resizing/joints, snapped downstream pivots, continuous mode, contact-first tiny overlaps, rotated planes and rigid snap-setting changes across all pixel steps.');
