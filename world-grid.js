import * as T from './vendor/three.module.js';
// Intersect the global grid with a face. The two world axes most parallel to
// the face define the lattice; the remaining coordinate stays on its plane.
// Never force a pivot outside a narrow overlap merely to reach a grid point.
export function snapOnPlane(point,normal,step,polygon=null){
 if(!step)return point.clone();
 const n=normal.toArray(),drop=n.reduce((a,v,i)=>Math.abs(v)>Math.abs(n[a])?i:a,0),axes=[0,1,2].filter(i=>i!==drop),plane=normal.dot(point),p=axes.map(i=>point.getComponent(i));
 const lift=a=>{const out=point.clone();axes.forEach((k,i)=>out.setComponent(k,a[i]));return out.setComponent(drop,(plane-axes.reduce((s,k)=>s+n[k]*out.getComponent(k),0))/n[drop]);};
 const rounded=p.map(v=>Math.round(v/step)*step);if(!polygon)return lift(rounded);
 const poly=polygon.map(v=>axes.map(i=>v.getComponent(i))),cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 const inside=a=>{let pos=false,neg=false;for(let i=0;i<poly.length;i++){const c=cross(poly[i],poly[(i+1)%poly.length],a);pos||=c>1e-8;neg||=c<-1e-8;}return !(pos&&neg)&&axes.every((_,i)=>a[i]>=Math.min(...poly.map(v=>v[i]))-1e-8&&a[i]<=Math.max(...poly.map(v=>v[i]))+1e-8);};
 if(inside(rounded))return lift(rounded);
 let best=null,distance=Infinity;
 const lo=Math.ceil(Math.min(...poly.map(v=>v[0]))/step-1e-8),hi=Math.floor(Math.max(...poly.map(v=>v[0]))/step+1e-8);
 for(let k=lo;k<=hi;k++){
  const x=k*step,ys=[];
  for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length];if(x<Math.min(a[0],b[0])-1e-8||x>Math.max(a[0],b[0])+1e-8)continue;if(Math.abs(a[0]-b[0])<1e-9)ys.push(a[1],b[1]);else ys.push(a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]));}
  if(!ys.length)continue;const low=Math.ceil(Math.min(...ys)/step-1e-8),high=Math.floor(Math.max(...ys)/step+1e-8);if(low>high)continue;
  const y=Math.max(low,Math.min(high,Math.round(p[1]/step)))*step,candidate=lift([x,y]),d=candidate.distanceToSquared(point);if(d<distance){distance=d;best=candidate;}
 }
 return best||point.clone();
}
// Snap a one-dimensional drag to world grid planes, not drag-start offsets.
export function snapAlongLine(point,direction,amount,min,max,step){
 if(!step)return T.MathUtils.clamp(amount,min,max);
 const d=direction.toArray(),axis=d.reduce((a,v,i)=>Math.abs(v)>Math.abs(d[a])?i:a,0),s=d[axis],origin=point.getComponent(axis),ends=[origin+s*min,origin+s*max],low=Math.ceil(Math.min(...ends)/step-1e-8),high=Math.floor(Math.max(...ends)/step+1e-8);
 if(low>high)return T.MathUtils.clamp(amount,min,max);
 return (Math.max(low,Math.min(high,Math.round((origin+s*amount)/step)))*step-origin)/s;
}
