import assert from 'node:assert/strict';
import * as T from '../dist/vendor/three.module.js';
import {centeredPlacement,faceResize,shapePreviewBase,FACE_HANDLES,connectedSelection} from '../dist/build-editing.js';
import {editMirroredShape,editMirroredJoint,allFrames} from '../dist/model-ops.js';
const root={id:0,parent:null,p:[0,.5,0],q:[0,0,0,1],size:[2,1,3],a:null,b:null};
const child={id:1,parent:0,p:[0,1.5,0],q:root.q.slice(),size:[2,1,3],a:[0,.5,0],b:[0,-.5,0],normal:[0,1,0]};
const base={boxes:[root,child],gridSize:.1,animations:[{frames:[{time:0,pose:Object.fromEntries([root,child].map(b=>[b.id,{p:b.p,q:b.q}]))}]}]};
assert.equal(FACE_HANDLES.length,6);
for(const n of FACE_HANDLES){const r=centeredPlacement(root,n);assert.deepEqual(r.size,root.size);assert.deepEqual(r.position,root.p.map((p,i)=>p+n[i]*root.size[i]));}
for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){
 const normal=[0,0,0];normal[axis]=sign;const axes={['xyz'[axis]]:true};const r=faceResize(base,0,normal,.3,axes);assert.deepEqual(r.position,root.p);assert.equal(r.size[axis],root.size[axis]+.6);assert.equal(r.symmetric,true);
 const one=faceResize(base,0,normal,.3,{});assert.equal(one.size[axis],root.size[axis]+.3);assert.ok(Math.abs(one.position[axis]-root.p[axis]-sign*.15)<1e-8);
}
const onPlane=faceResize(base,1,[1,0,0],.3,{x:true});assert.deepEqual(onPlane.position,child.p);assert.equal(onPlane.size[0],2.6);
const rotated=structuredClone(base),q=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI/2);for(const b of rotated.boxes)b.q=q.toArray();assert.ok(faceResize(rotated,0,[1,0,0],.3,{x:true}).symmetric);
const offPlane=structuredClone(base);offPlane.boxes[1].p[0]=1;assert.equal(faceResize(offPlane,1,[1,0,0],.3,{x:true}).symmetric,false);
const before=structuredClone(base),args=faceResize(base,0,[1,0,0],.4,{x:true});
const preview=editMirroredShape(shapePreviewBase(base),0,args.position,args.size,{x:true}),full=editMirroredShape(base,0,args.position,args.size,{x:true});assert.deepEqual(preview.boxes,full.boxes);assert.equal(allFrames(preview).length,0);assert.deepEqual(base,before);
assert.deepEqual(editMirroredJoint(shapePreviewBase(base),1,[.2,1,0],{}).boxes,editMirroredJoint(base,1,[.2,1,0],{}).boxes);
assert.ok(connectedSelection(child,0));assert.ok(connectedSelection(child,1));assert.ok(!connectedSelection({id:3,parent:2},1));assert.ok(connectedSelection(child,null));
console.log('PASS: six face handles, inherited centered placement, self-mirror XYZ and rotated roots, lightweight previews match committed edits, selected joint visibility.');

const fresh=centeredPlacement(root,[1,0,0],[1,1,1]);assert.deepEqual(fresh.size,[1,1,1]);assert.deepEqual(fresh.position,[1.5,.5,0]);assert.deepEqual(fresh.a,[1,0,0]);assert.ok(new T.Vector3(...fresh.b).distanceTo(new T.Vector3(-.5,0,0))<1e-9);
