import * as T from './vendor/three.module.js';
import {allFrames,projectPose,snap} from './model-ops.js?v=4';
const V=a=>new T.Vector3(...a),Q=a=>new T.Quaternion(...a);
// Snap centers in world coordinates and rebind each joint at the midpoint of
// its translated endpoints. Preserve dimensions, rotations and animation bends.
export function snapProjectToGrid(base,step){
 const state=structuredClone(base);state.gridSize=step;if(!step)return state;
 const old=new Map(base.boxes.map(b=>[b.id,b])),byId=new Map(state.boxes.map(b=>[b.id,b]));
 for(const b of state.boxes)b.p=b.p.map(v=>snap(v,step));
 for(const b of state.boxes){if(b.parent===null)continue;const p=byId.get(b.parent);
  const a=V(b.a).applyQuaternion(Q(p.q)).add(V(p.p)),c=V(b.b).applyQuaternion(Q(b.q)).add(V(b.p)),joint=a.add(c).multiplyScalar(.5);
  b.a=joint.clone().sub(V(p.p)).applyQuaternion(Q(p.q).invert()).toArray();b.b=joint.sub(V(b.p)).applyQuaternion(Q(b.q).invert()).toArray();
 }
 const root=state.boxes.find(b=>b.parent===null),delta=V(root.p).sub(V(old.get(root.id).p));
 for(const f of allFrames(state)){f.pose[root.id].p=V(f.pose[root.id].p).add(delta).toArray();f.pose=projectPose(state.boxes,f.pose);}
 return state;
}
export function explodedOffsets(boxes,gap=.4){
 const center=boxes.reduce((sum,b)=>sum.add(V(b.p)),new T.Vector3()).divideScalar(boxes.length);
 const entries=boxes.map(b=>{const world=new T.Matrix4().compose(V(b.p),Q(b.q),V(b.size||[1,1,1])),bounds=new T.Box3(new T.Vector3(-.5,-.5,-.5),new T.Vector3(.5,.5,.5)).applyMatrix4(world);return {id:b.id,rest:V(b.p),p:V(b.p).sub(center).multiplyScalar(1.35).add(center),half:bounds.getSize(new T.Vector3()).multiplyScalar(.5)};});
 for(let pass=0;pass<80;pass++){let moved=false;for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++){
  const a=entries[i],b=entries[j],d=b.p.clone().sub(a.p),overlap=a.half.clone().add(b.half).addScalar(gap).sub(new T.Vector3(Math.abs(d.x),Math.abs(d.y),Math.abs(d.z)));
  if(overlap.x<=0||overlap.y<=0||overlap.z<=0)continue;
  const axis=['x','y','z'].reduce((best,k)=>overlap[k]<overlap[best]?k:best,'x'),shift=(overlap[axis]+1e-5)*.5*(Math.sign(d[axis])||1);a.p[axis]-=shift;b.p[axis]+=shift;moved=true;
 }if(!moved)break;}
 // Degenerate stacks can converge slowly. Resolve any residual overlap by
 // moving only the later box beyond already placed boxes; never change source.
 for(let i=1;i<entries.length;i++){const a=entries[i];let overlap;
  do{overlap=entries.slice(0,i).find(b=>['x','y','z'].every(k=>Math.abs(a.p[k]-b.p[k])<a.half[k]+b.half[k]+gap-1e-6));if(overlap)a.p.x=overlap.p.x+overlap.half.x+a.half.x+gap;}while(overlap);
 }
 return new Map(entries.map(e=>[e.id,e.p.sub(e.rest)]));
}
// Rasterize a circular screen-space brush onto face texel centers. Testing the
// nearest surface per texel prevents painting through occluders; no texture
// filtering or blending is used. Bounds in face space keep large atlases cheap.
export function visibleBrushTexels({objects,camera,width,height,x,y,radius,atlasSize}){
 const out=[],ray=new T.Raycaster(),ndc=new T.Vector2(),project=p=>{const v=p.clone().project(camera);return {x:(v.x+1)*width/2,y:(1-v.y)*height/2,z:v.z};};
 const setRay=(x,y)=>{ndc.set(x/width*2-1,1-y/height*2);ray.setFromCamera(ndc,camera);};
 const toward=camera.getWorldDirection(new T.Vector3());
 for(const object of objects){object.updateMatrixWorld();const g=object.geometry,positions=g.attributes.position,uv=g.attributes.uv,normals=g.attributes.normal;
  for(let face=0;face<6;face++){
   const i=face*4,p0=object.localToWorld(new T.Vector3().fromBufferAttribute(positions,i)),p1=object.localToWorld(new T.Vector3().fromBufferAttribute(positions,i+1)),p2=object.localToWorld(new T.Vector3().fromBufferAttribute(positions,i+2)),p3=object.localToWorld(new T.Vector3().fromBufferAttribute(positions,i+3)),normal=new T.Vector3().fromBufferAttribute(normals,i),worldNormal=normal.clone().transformDirection(object.matrixWorld);
   if(worldNormal.dot(camera.isOrthographicCamera?toward: p0.clone().sub(camera.position))>=0)continue;
   const projected=[p0,p1,p2,p3].map(project);if(projected.every(p=>p.z>1||p.z< -1))continue;
   if(Math.max(...projected.map(p=>p.x))<x-radius||Math.min(...projected.map(p=>p.x))>x+radius||Math.max(...projected.map(p=>p.y))<y-radius||Math.min(...projected.map(p=>p.y))>y+radius)continue;
   const u=p1.clone().sub(p0),v=p2.clone().sub(p0),u2=u.lengthSq(),v2=v.lengthSq(),plane=new T.Plane().setFromNormalAndCoplanarPoint(worldNormal,p0);
   let lows=[0,0],highs=[1,1],samples=[];
   for(const dx of [-radius,radius])for(const dy of [-radius,radius]){setRay(x+dx,y+dy);const p=ray.ray.intersectPlane(plane,new T.Vector3());if(p){p.sub(p0);samples.push([p.dot(u)/u2,p.dot(v)/v2]);}}
   if(samples.length===4){lows=[0,1].map(k=>Math.max(0,Math.min(...samples.map(s=>s[k]))));highs=[0,1].map(k=>Math.min(1,Math.max(...samples.map(s=>s[k]))));}
   const u0=uv.getX(i),v0=uv.getY(i),du=uv.getX(i+1)-u0,dv=uv.getY(i+2)-v0;
   const ax=[u0+du*lows[0],u0+du*highs[0]].map(t=>t*atlasSize),ay=[v0+dv*lows[1],v0+dv*highs[1]].map(t=>(1-t)*atlasSize);
   const minX=Math.max(0,Math.floor(Math.min(...ax))),maxX=Math.min(atlasSize-1,Math.floor(Math.max(...ax))),minY=Math.max(0,Math.floor(Math.min(...ay))),maxY=Math.min(atlasSize-1,Math.floor(Math.max(...ay)));
   for(let py=minY;py<=maxY;py++)for(let px=minX;px<=maxX;px++){
    const tx=(px+.5)/atlasSize,ty=1-(py+.5)/atlasSize,a=T.MathUtils.clamp((tx-u0)/du,1e-8,1-1e-8),b=T.MathUtils.clamp((ty-v0)/dv,1e-8,1-1e-8);
    const point=p0.clone().addScaledVector(u,a).addScaledVector(v,b),s=project(point);if(s.z< -1||s.z>1||(s.x-x)**2+(s.y-y)**2>radius*radius)continue;
    setRay(s.x,s.y);const first=ray.intersectObjects(objects,false)[0];if(!first||first.object!==object||Math.floor(first.faceIndex/2)!==face)continue;
    out.push({object,point,uv:new T.Vector2(tx,ty),faceIndex:face*2,face:{normal}});
   }
  }
 }
 return out;
}
