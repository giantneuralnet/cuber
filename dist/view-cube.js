import * as T from './vendor/three.module.js';
export function createViewCube(root,{select,orbit}){
 const el=document.createElement('div');el.id='view-selector';el.setAttribute('aria-label','View selector');
 el.innerHTML='<div class="view-cube-stage"><div class="view-cube">'+[['front','F','rotateY(0deg)'],['back','B','rotateY(180deg)'],['right','R','rotateY(90deg)'],['left','L','rotateY(-90deg)'],['top','T','rotateX(90deg)'],['bottom','D','rotateX(-90deg)']].map(([name,label,rotation])=>`<button class="view-face" data-view="${name}" aria-label="${name} orthographic view" title="${name}" style="transform:${rotation} translateZ(22px)">${label}</button>`).join('')+'</div></div>';
 root.append(el);let start=null,moved=false;const stage=el.querySelector('.view-cube-stage'),cube=el.querySelector('.view-cube');
 stage.onpointerdown=e=>{e.preventDefault();start={x:e.clientX,y:e.clientY,target:e.target.closest('[data-view]')};moved=false;stage.setPointerCapture(e.pointerId);};
 stage.onpointermove=e=>{if(!start)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;if(Math.hypot(dx,dy)>4||moved){moved=true;orbit(dx,dy);start.x=e.clientX;start.y=e.clientY;}};
 stage.onpointerup=()=>{if(start&&!moved&&start.target)select(start.target.dataset.view);start=null;};stage.onpointercancel=()=>start=null;
 for(const b of el.querySelectorAll('[data-view]'))b.onclick=e=>{if(e.detail===0)select(b.dataset.view);};
 return {update(camera,view){const m=new T.Matrix4().makeRotationFromQuaternion(camera.quaternion.clone().invert()),s=new T.Matrix4().makeScale(1,-1,1);m.premultiply(s).multiply(s);cube.style.transform=`matrix3d(${m.elements.join(',')})`;for(const b of el.querySelectorAll('[data-view]'))b.setAttribute('aria-pressed',String(view===b.dataset.view));},layout(top){el.style.top=(top+12)+'px';}};
}
