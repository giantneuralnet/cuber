import assert from 'node:assert/strict';
import * as T from '../dist/vendor/three.module.js';
import * as C from '../dist/vendor/cannon-es.js';
import {editShape,animationMirrorPairs,mirrorAnimationPose} from '../dist/model-ops.js';
import {animationDragIds,createRigPhysics,stepRigPhysics} from '../dist/rig-physics.js';
const V=a=>new T.Vector3(...a),Q=a=>new T.Quaternion(...a),near=(a,b)=>assert.ok(V(a).distanceTo(V(b))<1e-8,`${a} != ${b}`);
const pose=boxes=>Object.fromEntries(boxes.map(b=>[b.id,{p:b.p.slice(),q:b.q.slice()}]));
const make=(id,parent,p,a=null,b=null,size=[1,1,1])=>({id,parent,p,q:[0,0,0,1],a,b,size,anchor:false,slot:id,color:'#ffffff',axis:'omni'});
const boxes=[make(0,null,[0,0,0],null,null,[2,2,1]),make(1,0,[1.5,.5,0],[1,.5,0],[-.5,0,0]),make(2,1,[1.5,-.5,0],[0,-.5,0],[0,.5,0]),make(3,2,[1.5,-1.5,0],[0,-.5,0],[0,.5,0]),make(4,0,[-1.5,.5,0],[-1,.5,0],[.5,0,0]),make(5,4,[-1.5,-.5,0],[0,-.5,0],[0,.5,0]),make(6,5,[-1.5,-1.5,0],[0,-.5,0],[0,.5,0]),make(7,0,[0,1.5,0],[0,1,0],[0,-.5,0])];
function connected(boxes,pose){for(const b of boxes)if(b.parent!==null)near(V(b.a).applyQuaternion(Q(pose[b.parent].q)).add(V(pose[b.parent].p)).toArray(),V(b.b).applyQuaternion(Q(pose[b.id].q)).add(V(pose[b.id].p)).toArray());}
for(const selected of [1,2,3,0]){
 const initial=pose(boxes),activeIds=animationDragIds(boxes,selected),before=structuredClone(boxes),{world,bodies}=createRigPhysics(boxes,initial,{activeIds});
 assert.deepEqual([...activeIds],selected===0?[0,1,2,3,4,5,6,7]:Array.from({length:4-selected},(_,i)=>i+selected));
 for(const b of boxes)assert.equal(bodies.get(b.id).mass===0,!activeIds.has(b.id));
 const grab=new C.Body({mass:0,type:C.Body.KINEMATIC,collisionFilterGroup:0,collisionFilterMask:0});world.addBody(grab);world.addConstraint(new C.PointToPointConstraint(bodies.get(selected),new C.Vec3(.3,-.3,.3),grab,new C.Vec3(),700));let last;
 for(let i=0;i<180;i++){
  grab.position.set(2+Math.sin(i*.03),.5+Math.cos(i*.03),1.5);last=stepRigPhysics(boxes,world,bodies,1/60);connected(boxes,last);
  for(const b of boxes)if(!activeIds.has(b.id))assert.deepEqual(last[b.id],initial[b.id],'upstream and unrelated poses are exactly fixed');
  assert.equal(world.contacts.length,0);
 }
 assert.ok(Q(last[selected].q).angleTo(Q(initial[selected].q))>.05);assert.deepEqual(boxes,before,'temporary locks never change saved anchors');
}
assert.deepEqual(animationMirrorPairs(boxes,2,{x:true}).map(p=>[p.source,p.target]),[[2,5],[3,6]],'forearm mirroring does not reach upper arms');
const anchored=structuredClone(boxes);anchored[3].anchor=true;const locked=animationDragIds(anchored,1);assert.ok(!locked.has(1)&&!locked.has(2)&&!locked.has(3));
// Two small cubes atop a growing parent spread with their attachment points.
const build=[make(0,null,[0,0,0],null,null,[2,2,2]),make(1,0,[-.5,1.25,0],[-.5,1,0],[0,-.25,0],[.5,.5,.5]),make(2,0,[.5,1.25,0],[.5,1,0],[0,-.25,0],[.5,.5,.5]),make(3,1,[-.5,1.75,0],[0,.25,0],[0,-.25,0],[.5,.5,.5])];
for(const rotate of [false,true]){
 const source=structuredClone(build),rotation=new T.Quaternion().setFromEuler(new T.Euler(.4,.7,.2));if(rotate)for(const b of source){b.p=V(b.p).applyQuaternion(rotation).toArray();b.q=rotation.toArray();}
 const state={boxes:source,animations:[{frames:[{time:0,pose:pose(source)}]}]},out=editShape(state,0,[0,0,0],[4,4,2]);
 for(const [id,position] of [[1,[-1,2.25,0]],[2,[1,2.25,0]],[3,[-1,2.75,0]]]){near(out.boxes[id].p,rotate?V(position).applyQuaternion(rotation).toArray():position);assert.deepEqual(out.boxes[id].size,[.5,.5,.5]);}
 connected(out.boxes,pose(out.boxes));connected(out.boxes,out.animations[0].frames[0].pose);
}
console.log('PASS downstream-only arm/forearm/hand/root physics, fixed upstream poses without anchors, scoped mirroring, anchor preservation, proportional child attachment scaling and grandchildren.');
