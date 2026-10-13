import assert from 'node:assert/strict';
import * as T from '../dist/vendor/three.module.js';
import {editShape,projectPose} from '../dist/model-ops.js';
import {faceResize,shapePreviewBase} from '../dist/build-editing.js';
const V=a=>new T.Vector3(...a),Q=a=>new T.Quaternion(...a),near=(a,b)=>assert.ok(V(a).distanceTo(V(b))<1e-7,`${a} != ${b}`);
const parent={id:0,parent:null,p:[0,0,0],q:[0,0,0,1],size:[2,1,2]},child={id:1,parent:0,p:[.75,1,0],q:[0,0,0,1],size:[1,1,1],a:[1,.5,0],b:[.25,-.5,0],normal:[0,1,0]};
const base={boxes:[parent,child],gridSize:.0625,pixelDensity:16,animations:[{frames:[{time:0,pose:Object.fromEntries([parent,child].map(b=>[b.id,{p:b.p.slice(),q:b.q.slice()}]))}]}]};
function check(s){for(const b of s.boxes.slice(1)){const p=s.boxes.find(p=>p.id===b.parent);near(V(b.a).applyQuaternion(Q(p.q)).add(V(p.p)).toArray(),V(b.b).applyQuaternion(Q(b.q)).add(V(b.p)).toArray());b.a.forEach((v,i)=>assert.ok(Math.abs(v)<=p.size[i]/2+1e-7));b.b.forEach((v,i)=>assert.ok(Math.abs(v)<=b.size[i]/2+1e-7));}for(const f of s.animations.flatMap(a=>a.frames)){const connected=projectPose(s.boxes,f.pose);for(const b of s.boxes)near(f.pose[b.id].p,connected[b.id].p);}}
// Growing the outer face cannot pull a cube back toward a pivot at the edge.
let target=faceResize(base,1,[1,0,0],1,{}),s=editShape(base,1,target.position,target.size);near(s.boxes[1].p,[1.25,1,0]);near(s.boxes[1].a,child.a);near(s.boxes[1].b,[-.25,-.5,0]);check(s);
// Shrinking past the pivot slides it along the shared face, preserving position.
target=faceResize(base,1,[1,0,0],-.75,{});s=editShape(base,1,target.position,target.size);near(s.boxes[1].p,target.position);near(s.boxes[1].a,[.5,.5,0]);near(s.boxes[1].b,[.125,-.5,0]);check(s);
// Once the resized face loses overlap, only the minimum necessary shift applies.
target=faceResize(base,1,[-1,0,0],-.875,{});s=editShape(base,1,target.position,target.size);near(s.boxes[1].p,[1.0625,1,0]);near(s.boxes[1].a,[1,.5,0]);check(s);
// Resizing a parent tangentially leaves the child in place, and slides its joint.
s=editShape(base,0,[.5,0,0],[3,1,2]);near(s.boxes[1].p,child.p);check(s);
s=editShape(base,0,[-.5,0,0],[1,1,2]);near(s.boxes[1].p,[.5,1,0]);near(s.boxes[1].a,[.5,.5,0]);check(s);
// The same behavior holds with a rotated project and an in-plane rotated child.
for(const angle of [.3,Math.PI/2]){const rotated=structuredClone(base),q=new T.Quaternion().setFromEuler(new T.Euler(.3,.7,-.2)),twist=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),angle);for(const b of rotated.boxes){b.p=V(b.p).applyQuaternion(q).toArray();b.q=q.toArray();}const b=rotated.boxes[1];b.q=q.clone().multiply(twist).toArray();b.b=V(b.a).applyQuaternion(q).add(V(rotated.boxes[0].p)).sub(V(b.p)).applyQuaternion(Q(b.q).invert()).toArray();b.a=[.75,.5,0];b.b=[0,-.5,0];rotated.animations=[];const r=faceResize(rotated,1,[1,0,0],.4,{}),out=editShape(rotated,1,r.position,r.size);check(out);near(out.boxes[1].p,r.position);assert.deepEqual(editShape(shapePreviewBase(rotated),1,r.position,r.size).boxes,out.boxes);}
console.log('PASS resize freedom, pivot-first sliding, minimal overlap constraints, parent edits, rotated faces, connected poses and matching previews.');
