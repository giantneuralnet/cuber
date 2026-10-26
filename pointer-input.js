// Keep physical pointer lifetime separate from the editor's current tool.
export class PointerRegistry {
  points=new Map();
  down(e){const retired=[];if(e.isPrimary||e.pointerType==='mouse'){retired.push(...this.points.keys());this.points.clear();}this.points.set(e.pointerId,{x:e.clientX,y:e.clientY,type:e.pointerType});return retired;}
  move(e){if(!this.points.has(e.pointerId))return false;this.points.set(e.pointerId,{x:e.clientX,y:e.clientY,type:e.pointerType});return true;}
  up(id){return this.points.delete(id);}
  reset(){const ids=[...this.points.keys()];this.points.clear();return ids;}
  reconcile(touches){const keep=new Set(),candidates=[...this.points].filter(([,p])=>p.type==='touch');for(const t of touches){let nearest=null,distance=Infinity;for(const [id,p] of candidates){if(keep.has(id))continue;const d=Math.hypot(p.x-t.clientX,p.y-t.clientY);if(d<distance){nearest=id;distance=d;}}if(nearest!==null)keep.add(nearest);}const removed=[];for(const [id,p] of this.points)if(p.type==='touch'&&!keep.has(id)){this.points.delete(id);removed.push(id);}return removed;}
  metrics(){if(this.points.size<2)return null;const [[idA,a],[idB,b]]=[...this.points];return {key:`${idA}:${idB}`,x:(a.x+b.x)/2,y:(a.y+b.y)/2,d:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y))};}
}
export function bindPointerInput(canvas,callbacks,{root=window,doc=document}={}){
  const registry=new PointerRegistry();let multi=null,session=false;
  const release=ids=>{for(const id of ids)try{if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);}catch{}};
  function finish(cancel=false){if(session){session=false;callbacks.end?.(cancel);}}
  function reset(){const ids=registry.reset();multi=null;finish(true);release(ids);}
  function down(e){if(e.button>2)return;const retired=registry.down(e);if(retired.length){multi=null;finish(true);release(retired);}try{canvas.setPointerCapture(e.pointerId);}catch{}if(registry.points.size>1){finish(true);multi=registry.metrics();return;}multi=null;session=true;callbacks.begin(e);}
  function move(e){if(e.pointerType==='mouse'&&e.buttons===0&&registry.points.has(e.pointerId)){reset();callbacks.hover?.(e);return;}if(!registry.move(e)){callbacks.hover?.(e);return;}const next=registry.metrics();if(next){if(multi?.key===next.key)callbacks.multi(multi,next);multi=next;return;}multi=null;if(session)callbacks.move(e);}
  function end(e,cancel=false){if(!registry.up(e.pointerId))return;const wasMulti=multi!==null;if(registry.points.size<2)multi=null;else multi=registry.metrics();if(wasMulti)finish(true);else finish(cancel);release([e.pointerId]);}
  function touchEnd(e){const removed=registry.reconcile(e.touches||[]);if(removed.length){finish(true);release(removed);}if(registry.points.size<2)multi=null;}
  const onUp=e=>end(e,false),onCancel=e=>end(e,true),onLost=e=>end(e,true);
  const onControl=e=>{if(e.target!==canvas&&e.target?.closest?.('#dock,.modes,#sheet'))reset();};
  const onVisibility=()=>{if(doc.hidden)reset();};
  const preventNativeTouch=e=>{if(e.cancelable)e.preventDefault();};canvas.addEventListener('touchstart',preventNativeTouch,{passive:false});canvas.addEventListener('touchmove',preventNativeTouch,{passive:false});
  canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('lostpointercapture',onLost);
  // Capture globally: a release outside the canvas or over a control still ends the gesture.
  root.addEventListener('pointerup',onUp,true);root.addEventListener('pointercancel',onCancel,true);root.addEventListener('pointerdown',onControl,true);
  root.addEventListener('touchend',touchEnd,{capture:true,passive:true});root.addEventListener('touchcancel',touchEnd,{capture:true,passive:true});
  root.addEventListener('blur',reset);root.addEventListener('pagehide',reset);doc.addEventListener('visibilitychange',onVisibility);
  return {reset,registry,dispose(){reset();canvas.removeEventListener('touchstart',preventNativeTouch);canvas.removeEventListener('touchmove',preventNativeTouch);canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('lostpointercapture',onLost);root.removeEventListener('pointerup',onUp,true);root.removeEventListener('pointercancel',onCancel,true);root.removeEventListener('pointerdown',onControl,true);root.removeEventListener('touchend',touchEnd,true);root.removeEventListener('touchcancel',touchEnd,true);root.removeEventListener('blur',reset);root.removeEventListener('pagehide',reset);doc.removeEventListener('visibilitychange',onVisibility);}};
}
