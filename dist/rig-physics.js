import * as CANNON from './vendor/cannon-es.js';
import * as THREE from './vendor/three.module.js';
import {dimensions,axisVector,connectedPose,constrainedRelative} from './model-ops.js?v=5';
const quat=a=>new THREE.Quaternion(...a);
export function createRigPhysics(boxes,pose,{activeIds=null}={}){const world=new CANNON.World({gravity:new CANNON.Vec3(0,0,0)});if(activeIds)world.cuberDrag={activeIds:new Set(activeIds),fixedPose:structuredClone(pose)};world.solver.iterations=60;world.defaultContactMaterial.friction=.05;world.defaultContactMaterial.restitution=0;const bodies=new Map();for(const b of boxes){const m={position:new CANNON.Vec3(...pose[b.id].p),quaternion:new CANNON.Quaternion(...pose[b.id].q)},size=dimensions(b);const body=new CANNON.Body({mass:b.anchor||(activeIds&&!activeIds.has(b.id))?0:Math.max(.1,size[0]*size[1]*size[2]),shape:new CANNON.Box(new CANNON.Vec3(...size.map(n=>n*.495))),linearDamping:.985,angularDamping:.995,collisionFilterGroup:0,collisionFilterMask:0,collisionResponse:false});body.position.copy(m.position);body.quaternion.copy(m.quaternion);world.addBody(body);bodies.set(b.id,body);}for(const b of boxes){if(b.parent===null)continue;let c;if(b.axis&&b.axis!=='omni'){const parent=boxes.find(p=>p.id===b.parent),a=axisVector(b.axis),axisB=a.clone().applyQuaternion(quat(parent.q)).applyQuaternion(quat(b.q).invert());c=new CANNON.HingeConstraint(bodies.get(b.parent),bodies.get(b.id),{pivotA:new CANNON.Vec3(...b.a),pivotB:new CANNON.Vec3(...b.b),axisA:new CANNON.Vec3(...a.toArray()),axisB:new CANNON.Vec3(...axisB.toArray()),maxForce:1e5,collideConnected:false});}else{c=new CANNON.PointToPointConstraint(bodies.get(b.parent),new CANNON.Vec3(...b.a),bodies.get(b.id),new CANNON.Vec3(...b.b),1e5);c.collideConnected=false;}world.addConstraint(c);}return {world,bodies};}
export function stepRigPhysics(boxes,world,bodies,dt){dampJoints(boxes,bodies,dt);world.step(1/120,dt,6);const raw={};for(const [id,body] of bodies)raw[id]={p:[body.position.x,body.position.y,body.position.z],q:[body.quaternion.x,body.quaternion.y,body.quaternion.z,body.quaternion.w]};const pose=world.cuberDrag?downstreamPose(boxes,raw,world.cuberDrag):connectedPose(boxes,raw);for(const [id,body] of bodies){if(body.mass===0)continue;const p=pose[id];body.position.set(...p.p);body.quaternion.set(...p.q);body.aabbNeedsUpdate=true;}return pose;}

// Viscous resistance to relative joint rotation, including joints attached to anchors.
export function dampJoints(boxes,bodies,dt){const drag=1-Math.exp(-8*Math.max(0,dt));for(const box of boxes){if(box.parent===null)continue;const a=bodies.get(box.parent),b=bodies.get(box.id),wa=a.mass>0?1:0,wb=b.mass>0?1:0,total=wa+wb;if(!total)continue;const relative=b.angularVelocity.vsub(a.angularVelocity);if(wa)a.angularVelocity.vadd(relative.scale(drag*wa/total),a.angularVelocity);if(wb)b.angularVelocity.vsub(relative.scale(drag*wb/total),b.angularVelocity);}}

// A drag is scoped to the selected cube and its descendants, never ancestors.
export function animationDragIds(boxes,id){
 const branch=new Set([id]),byId=new Map(boxes.map(b=>[b.id,b]));for(const b of boxes)if(branch.has(b.parent))branch.add(b.id);
 const active=new Set(branch);
 // Keep anchored descendants fixed and connected by holding their ancestor path.
 for(const b of boxes)if(branch.has(b.id)&&b.anchor)for(let p=b;p&&branch.has(p.id);p=byId.get(p.parent))active.delete(p.id);
 return active;
}
function downstreamPose(boxes,raw,{activeIds,fixedPose}){
 const out={},byId=new Map(boxes.map(b=>[b.id,b]));
 for(const b of boxes){
  if(!activeIds.has(b.id)||b.anchor){out[b.id]=structuredClone(fixedPose[b.id]);continue;}
  if(b.parent===null){out[b.id]=structuredClone(raw[b.id]);continue;}
  const parent=byId.get(b.parent),parentRaw=raw[b.parent],relative=constrainedRelative(b,parent,quat(parentRaw.q).invert().multiply(quat(raw[b.id].q))),q=quat(out[b.parent].q).multiply(relative).normalize();
  const p=new THREE.Vector3(...out[b.parent].p).add(new THREE.Vector3(...b.a).applyQuaternion(quat(out[b.parent].q))).sub(new THREE.Vector3(...b.b).applyQuaternion(q));
  out[b.id]={p:p.toArray(),q:q.toArray()};
 }
 return out;
}
