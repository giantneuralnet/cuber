import assert from 'node:assert/strict';
import * as T from '../dist/vendor/three.module.js';
import {normalizeModel,animationMirrorPairs,mirrorAnimationPose,projectPose,editJoint,allFrames} from '../dist/model-ops.js';
import {packAtlas,faceSize,validateLayout,stampPixelBrush} from '../dist/atlas-layout.js';
const V=a=>new T.Vector3(...a),Q=a=>new T.Quaternion(...a);
for(const axis of ['x','y','z']){
 const index='xyz'.indexOf(axis),p=[0,0,0],a=[0,0,0];p[index]=1;a[index]=.5;
 const boxes=[{id:0,parent:null,p:[0,0,0],q:[0,0,0,1],anchor:true,slot:0},{id:1,parent:0,p,q:[0,0,0,1],a,b:a.map(v=>-v),slot:1},{id:2,parent:0,p:p.map(v=>-v),q:[0,0,0,1],a:a.map(v=>-v),b:a,slot:2}];
 const state=normalizeModel({boxes,frames:[],frame:0}),raw=Object.fromEntries(boxes.map(b=>[b.id,structuredClone(b)]));raw[1].q=new T.Quaternion().setFromEuler(new T.Euler(.4,.3,.6)).toArray();
 const pairs=animationMirrorPairs(boxes,1,{[axis]:true});assert.equal(pairs.length,1);
 const pose=mirrorAnimationPose(boxes,projectPose(boxes,raw),pairs),reflection=V(pose[1].p);reflection.setComponent(index,-reflection.getComponent(index));assert.ok(V(pose[2].p).distanceTo(reflection)<1e-9);
 for(const b of boxes.slice(1)){const pp=pose[b.parent],bp=pose[b.id];assert.ok(V(pp.p).add(V(b.a).applyQuaternion(Q(pp.q))).distanceTo(V(bp.p).add(V(b.b).applyQuaternion(Q(bp.q))))<1e-9);}
 state.animations[0].frames=[{time:0,pose:structuredClone(pose)}];state.animations.push({id:1,name:'Animation 2',frames:[{time:0,pose:structuredClone(pose)}]});const edited=editJoint(state,1,a);assert.equal(allFrames(edited).length,2);assert.notEqual(edited.animations[0].frames[0].pose,edited.animations[1].frames[0].pose);
}
const sizes=[[1,1,1],[3,1.25,.2],[.25,6,2.05],[12,12,12]];
for(const size of [32,64,128,256,512,1024])for(const count of [4,128]){
 const boxes=Array.from({length:count},(_,slot)=>({slot,size:sizes[slot%sizes.length]})),layout=packAtlas(boxes,size);assert.ok(validateLayout(layout,boxes,size));
 for(const b of boxes)for(let f=0;f<6;f++){const r=layout.faces[b.slot*6+f],[w,h]=faceSize(b,f);assert.ok(Math.abs(r.spanW/w-layout.density)<1e-8);assert.ok(Math.abs(r.spanH/h-layout.density)<1e-8);}
 const invalid=structuredClone(layout);invalid.faces[0].x=size;assert.equal(validateLayout(invalid,boxes,size),false);
}
for(let size=1;size<=30;size++){const calls=[];stampPixelBrush({fillRect:(...args)=>calls.push(args)},8.73,9.1,size);assert.ok(calls.length);assert.ok(calls.every(a=>a.every(Number.isInteger)&&a[2]>=1&&a[3]===1));}
console.log('PASS: mirrored XYZ poses with connected pivots, independent animation rows, uniform face density at every resolution, packed bounds/gutters for 128 boxes, and integer pixel brushes.');
