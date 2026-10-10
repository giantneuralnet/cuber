import {repackPixels} from './atlas-layout.js';

export const freshPaintLayer=()=>({frame:0,frames:[{png:''}]});
export function validatePaintLayer(layer){
 if(!layer||!Array.isArray(layer.frames)||!layer.frames.length||layer.frames.length>16||!Number.isInteger(layer.frame)||layer.frame<0||layer.frame>=layer.frames.length)return false;
 return layer.frames.every(frame=>typeof frame.png==='string'&&frame.png.length<=24*1024*1024&&(!frame.png||frame.png.startsWith('data:image/png;base64,')));
}
export function appendPaintFrame(layer){if(layer.frames.length>=16)return false;layer.frames.push({png:layer.frames[layer.frame].png});layer.frame=layer.frames.length-1;return true;}
export function deletePaintFrame(layer,animations=[]){if(layer.frames.length<2)return false;const removed=layer.frame;layer.frames.splice(removed,1);layer.frame=Math.max(0,removed-1);for(const a of animations)for(const frame of a.frames){const selected=frame.paintFrame??0;frame.paintFrame=selected>removed?selected-1:selected===removed?Math.min(removed,layer.frames.length-1):selected;}return true;}
export const paintFrameForPose=(frame,layer)=>Math.max(0,Math.min(layer.frames.length-1,frame?.paintFrame??0));
const canvas=size=>{const c=document.createElement('canvas');c.width=c.height=size;c.getContext('2d',{willReadFrequently:true});return c;};

// The base and overlay remain independently editable. Only the preview is composited.
export class PaintLayerSurface {
 constructor(base,getLayer){this.base=base;this.getLayer=getLayer;this.edit=canvas(base.width);this.composite=canvas(base.width);this.cache=new Map();this.active=null;this.dirty=false;this.lastPreview=null;}
 async prepare(layer=this.getLayer(),images=[]){
  for(let i=0;i<layer.frames.length;i++){const png=layer.frames[i].png;if(!png||this.cache.has(png))continue;let image=images[i];if(!image){image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('Invalid paint layer texture'));image.src=png;});}this.cache.set(png,image);}
 }
 source(png){const source=this.cache.get(png);if(png&&!source)throw Error('Paint layer image is not ready');return source;}
 sync(){const layer=this.getLayer(),frame=layer.frames[layer.frame],key=frame.png+'|'+this.base.width;if(this.active===key)return;this.edit.width=this.edit.height=this.base.width;const source=this.source(frame.png);if(source)this.edit.getContext('2d').drawImage(source,0,0,this.edit.width,this.edit.height);this.active=key;this.dirty=false;}
 touch(){this.sync();this.dirty=true;}
 flush(){if(!this.dirty)return;const png=this.edit.toDataURL('image/png'),copy=canvas(this.edit.width);copy.getContext('2d').drawImage(this.edit,0,0);this.cache.set(png,copy);this.getLayer().frames[this.getLayer().frame].png=png;this.active=png+'|'+this.base.width;this.dirty=false;}
 prune(){const keep=new Set(this.getLayer().frames.map(f=>f.png));for(const key of this.cache.keys())if(!keep.has(key))this.cache.delete(key);}
 compose(index=this.getLayer().frame){
  this.sync();const size=this.base.width;if(this.composite.width!==size)this.composite.width=this.composite.height=size;
  const ctx=this.composite.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,size,size);ctx.drawImage(this.base,0,0);
  const layer=this.getLayer(),source=index===layer.frame?this.edit:this.source(layer.frames[index].png);if(source)ctx.drawImage(source,0,0,size,size);this.lastPreview=index;
 }
 remap(png,boxes,layout,oldLayout){
  if(!png)return '';if(layout.signature===oldLayout?.signature)return png;
  const source=this.source(png),next=canvas(layout.size),ctx=next.getContext('2d');ctx.imageSmoothingEnabled=false;
  repackPixels(ctx,next,boxes,layout,source,oldLayout,{overlay:true});
  const result=next.toDataURL('image/png');this.cache.set(result,next);return result;
 }
 repack(boxes,layout,oldLayout){const remapped=new Map();for(const frame of this.getLayer().frames){if(!remapped.has(frame.png))remapped.set(frame.png,this.remap(frame.png,boxes,layout,oldLayout));frame.png=remapped.get(frame.png);}this.active=null;}
}
