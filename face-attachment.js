import {snapOnPlane} from './world-grid.js';
import * as T from './vendor/three.module.js';
const V=a=>new T.Vector3(...a),Q=a=>new T.Quaternion(...a),dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
function closest(p,a,b){const d=[b[0]-a[0],b[1]-a[1]],t=Math.max(0,Math.min(1,dot([p[0]-a[0],p[1]-a[1]],d)/(dot(d,d)||1)));return [a[0]+d[0]*t,a[1]+d[1]*t];}
function clip(poly,axis,value,side){const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=(a[axis]-value)*side,db=(b[axis]-value)*side;if(da<=1e-9)out.push(a);if((da<0&&db>0)||(da>0&&db<0)){const t=da/(da-db);out.push(a.map((v,k)=>v+(b[k]-v)*t));}}return out;}
function nearest(poly,p){if(poly.length===1)return poly[0];let best=null,distance=Infinity,positive=false,negative=false;for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],cross=(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);positive||=cross>1e-8;negative||=cross<-1e-8;const q=closest(p,a,b),d=(q[0]-p[0])**2+(q[1]-p[1])**2;if(d<distance){best=q;distance=d;}}const area=poly.reduce((sum,a,i)=>{const b=poly[(i+1)%poly.length];return sum+a[0]*b[1]-b[0]*a[1];},0);return Math.abs(area)>1e-9&&!(positive&&negative)?p:best;}
// Keep touching face planes together, but preserve the requested tangential
// position. Slide the pivot inside their overlap before moving either cube.
export function fitFaceAttachment(child,parent,normal,preferredWorld,step=0){
 const pq=Q(parent.q),cq=Q(child.q),inverse=pq.clone().invert(),n=V(normal),axis=normal.findIndex(v=>Math.abs(v)>.5),tangents=[0,1,2].filter(i=>i!==axis),localNormal=n.clone().applyQuaternion(pq).applyQuaternion(cq.clone().invert()),childAxis=localNormal.toArray().findIndex(v=>Math.abs(v)>.999);
 const ps=parent.size||[1,1,1],cs=child.size||[1,1,1],face=V(cs).multiply(localNormal).multiplyScalar(-.5),center=V(child.p).add(face.clone().applyQuaternion(cq)).sub(V(parent.p)).applyQuaternion(inverse);
 const plane=normal[axis]*ps[axis]/2,shift=n.clone().multiplyScalar((plane-center.getComponent(axis))*normal[axis]);child.p=V(child.p).add(shift.applyQuaternion(pq)).toArray();
 const childTangents=[0,1,2].filter(i=>i!==childAxis),poly=[[-1,-1],[1,-1],[1,1],[-1,1]].map(signs=>{
  const p=face.clone();for(let i=0;i<2;i++)p.setComponent(childTangents[i],signs[i]*cs[childTangents[i]]/2);
  p.applyQuaternion(cq).add(V(child.p)).sub(V(parent.p)).applyQuaternion(inverse);return tangents.map(i=>p.getComponent(i));
 });
 const half=tangents.map(i=>ps[i]/2),rect=[[-half[0],-half[1]],[half[0],-half[1]],[half[0],half[1]],[-half[0],half[1]]];
 let overlap=poly;for(let i=0;i<2;i++){overlap=clip(overlap,i,half[i],1);overlap=clip(overlap,i,-half[i],-1);}
 const preferred=V(preferredWorld).sub(V(parent.p)).applyQuaternion(inverse),point=tangents.map(i=>preferred.getComponent(i));let joint;
 if(overlap.length)joint=nearest(overlap,point);
 else{
  // Disjoint rectangles: the closest edge pair gives the smallest translation
  // that restores contact. This is the first point at which the cube is limited.
  let distance=Infinity,delta;
  for(let i=0;i<4;i++)for(let j=0;j<4;j++)for(const fromChild of [true,false]){
   const a=fromChild?poly[i]:rect[i],b=fromChild?rect[j]:poly[j],c=fromChild?rect[(j+1)%4]:poly[(j+1)%4],q=closest(a,b,c),onChild=fromChild?a:q,onParent=fromChild?q:a,d=(q[0]-a[0])**2+(q[1]-a[1])**2;
   if(d<distance){distance=d;delta=onParent.map((v,k)=>v-onChild[k]);joint=onParent;}
  }
  const move=new T.Vector3();tangents.forEach((k,i)=>move.setComponent(k,delta[i]));child.p=V(child.p).add(move.applyQuaternion(pq)).toArray();
  let touching=poly.map(p=>p.map((v,i)=>v+delta[i]));for(let i=0;i<2;i++){touching=clip(touching,i,half[i],1);touching=clip(touching,i,-half[i],-1);}if(touching.length){overlap=touching;joint=nearest(touching,point);}
 }
 const localPoint=point=>{const a=new T.Vector3().setComponent(axis,plane);tangents.forEach((k,i)=>a.setComponent(k,point[i]));return a;};
 const world=a=>a.applyQuaternion(pq).add(V(parent.p)),worldJoint=snapOnPlane(world(localPoint(joint)),n.clone().applyQuaternion(pq),step,overlap.map(p=>world(localPoint(p))));
 child.a=worldJoint.clone().sub(V(parent.p)).applyQuaternion(inverse).toArray();child.b=worldJoint.sub(V(child.p)).applyQuaternion(cq.invert()).toArray();child.normal=normal.slice();
}
