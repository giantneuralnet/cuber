import * as T from './vendor/three.module.js';
import {dimensions,contactNormal,steppedValue} from './model-ops.js?v=2';
const V=a=>new T.Vector3(...a),Q=a=>new T.Quaternion(...a);
export const FACE_HANDLES=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
export function centeredPlacement(parent,normal){
 const size=dimensions(parent).slice(),n=V(normal),a=n.clone().multiply(V(size)).multiplyScalar(.5),b=a.clone().negate();
 return {size,a:a.toArray(),b:b.toArray(),position:a.clone().sub(b).applyQuaternion(Q(parent.q)).add(V(parent.p)).toArray()};
}
// Resize one face. Cubes centered on an enabled mirror plane grow equally on
// both faces; root-local axes keep this correct for rotated projects, too.
export function faceResize(base,id,sign,amount,mirrors){
 const box=base.boxes.find(b=>b.id===id),root=base.boxes[0],size=dimensions(box).slice(),axis=sign.findIndex(v=>v!==0),direction=V(sign).applyQuaternion(Q(box.q)).applyQuaternion(Q(root.q).invert()),center=V(box.p).sub(V(root.p)).applyQuaternion(Q(root.q).invert());
 const symmetric=['x','y','z'].some((name,i)=>mirrors[name]&&Math.abs(center.getComponent(i))<.015&&Math.abs(direction.getComponent(i))>.999);
 const next=steppedValue(size[axis]+amount*(symmetric?2:1),size[axis],base.pixelDensity?Math.min(.2,1/base.pixelDensity):.2,12,base.gridSize),change=next-size[axis];size[axis]=next;
 const shift=new T.Vector3();if(!symmetric){let side=sign[axis];const parent=base.boxes.find(b=>b.id===box.parent);if(parent){const n=contactNormal(box,parent)?.applyQuaternion(Q(parent.q)).applyQuaternion(Q(box.q).invert());if(n&&Math.abs(n.getComponent(axis))>.999)side=n.getComponent(axis);}shift.setComponent(axis,side*change/2);}
 return {position:V(box.p).add(shift.applyQuaternion(Q(box.q))).toArray(),size,symmetric};
}
// A drag preview deliberately excludes saved poses, PNGs and atlas metadata.
// The full edit is applied once, on release, from the same untouched baseline.
export const shapePreviewBase=base=>({boxes:base.boxes,gridSize:base.gridSize,pixelDensity:base.pixelDensity,animations:[]});
export const connectedSelection=(box,selected)=>selected===null||box.id===selected||box.parent===selected;

// Edge-on planes have a nearly singular screen projection. Ignore their
// unobservable direction instead of dividing by a near-zero ray/plane angle.
export function planeDragDelta(dx,dy,u,v){const uu=u.x*u.x+u.y*u.y,vv=v.x*v.x+v.y*v.y,uv=u.x*v.x+u.y*v.y,du=dx*u.x+dy*u.y,dv=dx*v.x+dy*v.y,det=uu*vv-uv*uv;if(det>Math.max(uu*vv*.02,1)&&Math.min(uu,vv)>4)return [(du*vv-dv*uv)/det,(dv*uu-du*uv)/det];return uu>=vv?(uu>4?[du/uu,0]:[0,0]):(vv>4?[0,dv/vv]:[0,0]);}
