import {dimensions} from './model-ops.js';
export const faceSize=(box,face)=>{const [x,y,z]=dimensions(box);return face<2?[z,y]:face<4?[x,z]:[x,y];};
export const atlasSignature=(boxes,size)=>JSON.stringify([size,...boxes.map(b=>[b.slot,...dimensions(b)])]);
export function legacyLayout(boxes,size){const tile=size/32,faces={};for(const b of boxes)for(let f=0;f<6;f++){const n=b.slot*6+f;faces[n]={x:n%32*tile+tile/64,y:Math.floor(n/32)*tile+tile/64,w:tile*62/64,h:tile*62/64,spanW:tile*62/64,spanH:tile*62/64};}return {version:0,size,faces};}
export function packAtlas(boxes,size){function pack(density){const rects=boxes.flatMap(b=>Array.from({length:6},(_,f)=>{const [a,c]=faceSize(b,f),spanW=a*density,spanH=c*density;return {key:b.slot*6+f,w:Math.max(1,Math.ceil(spanW-1e-9)),h:Math.max(1,Math.ceil(spanH-1e-9)),spanW,spanH};})).sort((a,b)=>b.h-a.h||b.w-a.w||a.key-b.key);
function attempt(width){const faces={},rows=[];let bottom=0;for(const r of rects){const w=r.w+2,h=r.h+2;if(w>width||h>size)return null;let row=rows.find(row=>row.h>=h&&row.x+w<=width);if(!row){if(bottom+h>size)return null;row={x:0,y:bottom,h};rows.push(row);bottom+=h;}faces[r.key]={x:row.x+1,y:row.y+1,w:r.w,h:r.h,spanW:r.spanW,spanH:r.spanH};row.x+=w;}return {version:1,size,density,signature:atlasSignature(boxes,size),faces};}
const width=Math.min(size,Math.max(...rects.map(r=>r.w+2),Math.ceil(Math.sqrt(rects.reduce((a,r)=>a+(r.w+2)*(r.h+2),0)))));return attempt(width)||attempt(size);}
let hi=size/32,lo=0,found=pack(hi);if(found)return found;for(let i=0;i<20;i++){const d=(lo+hi)/2,result=pack(d);if(result){lo=d;found=result;}else hi=d;}if(!found)throw Error('Texture atlas is full');return found;}
export function padFace(ctx,atlas,r){ctx.imageSmoothingEnabled=false;ctx.clearRect(r.x-1,r.y,1,r.h);ctx.clearRect(r.x+r.w,r.y,1,r.h);ctx.drawImage(atlas,r.x,r.y,1,r.h,r.x-1,r.y,1,r.h);ctx.drawImage(atlas,r.x+r.w-1,r.y,1,r.h,r.x+r.w,r.y,1,r.h);ctx.clearRect(r.x-1,r.y-1,r.w+2,1);ctx.clearRect(r.x-1,r.y+r.h,r.w+2,1);ctx.drawImage(atlas,r.x-1,r.y,r.w+2,1,r.x-1,r.y-1,r.w+2,1);ctx.drawImage(atlas,r.x-1,r.y+r.h-1,r.w+2,1,r.x-1,r.y+r.h,r.w+2,1);}
// Repack all faces and their gutters in one CPU pass. Drawing hundreds of
// tiny borders from a canvas back into itself forces expensive GPU readbacks.
export function repackPixelData(source,boxes,layout,oldLayout,{overlay=false}={}){
 const data=new Uint8ClampedArray(layout.size*layout.size*4),out=new Uint32Array(data.buffer),pixels=source&&new Uint32Array(source.data.buffer,source.data.byteOffset,source.data.byteLength/4);
 for(const box of boxes)for(let face=0;face<6;face++){
  const key=box.slot*6+face,r=layout.faces[key],old=oldLayout?.faces[key],hex=parseInt((box.color||'#f4f7fc').slice(1),16),red=hex>>>16,green=hex>>>8&255,blue=hex&255,fill=(0xff000000|blue<<16|green<<8|red)>>>0;
  const xs=new Int32Array(r.w+2);if(source&&old)for(let x=-1;x<=r.w;x++)xs[x+1]=Math.max(0,Math.min(source.width-1,Math.floor(old.x+(Math.max(0,Math.min(r.w-1,x))+.5)*old.w/r.w)));
  for(let y=-1;y<=r.h;y++){
   const dest=(r.y+y)*layout.size+r.x-1,sy=source&&old?Math.max(0,Math.min(source.height-1,Math.floor(old.y+(Math.max(0,Math.min(r.h-1,y))+.5)*old.h/r.h)))*source.width:0;
   for(let x=0;x<r.w+2;x++){const index=dest+x;if(!source||!old){out[index]=overlay?0:fill;continue;}const src=sy+xs[x],alpha=source.data[src*4+3];if(overlay||alpha===255)out[index]=pixels[src];else if(!alpha)out[index]=fill;else{const offset=index*4,inverse=255-alpha;data[offset]=(source.data[src*4]*alpha+red*inverse)/255;data[offset+1]=(source.data[src*4+1]*alpha+green*inverse)/255;data[offset+2]=(source.data[src*4+2]*alpha+blue*inverse)/255;data[offset+3]=255;}}
  }
 }
 return data;
}
export function sourcePixels(source){if(!source)return null;if(source.data&&source.width)return source;let canvas=source;if(!source.getContext){canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;canvas.getContext('2d',{willReadFrequently:true}).drawImage(source,0,0);}return canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);}
export function repackPixels(ctx,atlas,boxes,layout,source,oldLayout,options){const data=repackPixelData(sourcePixels(source),boxes,layout,oldLayout,options);ctx.putImageData(new ImageData(data,layout.size,layout.size),0,0);}
// Integer scanlines avoid antialiasing and partially transparent brush-edge pixels.
export function stampPixelBrush(ctx,x,y,diameter){const d=Math.max(1,Math.round(diameter)),startX=Math.floor(x)-Math.floor(d/2),startY=Math.floor(y)-Math.floor(d/2),radius=d/2;for(let row=0;row<d;row++){const dy=row+.5-radius;let left=0,right=d-1;while(left<d&&(left+.5-radius)**2+dy*dy>radius*radius)left++;while(right>=left&&(right+.5-radius)**2+dy*dy>radius*radius)right--;if(right>=left)ctx.fillRect(startX+left,startY+row,right-left+1,1);}}

export function validateLayout(layout,boxes,size){if(!layout||layout.version!==1||layout.size!==size||!Number.isFinite(layout.density)||layout.density<=0||!layout.faces||typeof layout.faces!=='object'||Object.keys(layout.faces).length!==boxes.length*6)return false;const rects=[];for(const box of boxes)for(let f=0;f<6;f++){const r=layout.faces[box.slot*6+f],dims=faceSize(box,f);if(!r||![r.x,r.y,r.w,r.h].every(Number.isInteger)||r.x<1||r.y<1||r.w<1||r.h<1||r.x+r.w>=size||r.y+r.h>=size||![r.spanW,r.spanH].every(v=>Number.isFinite(v)&&v>0)||Math.abs(r.spanW-dims[0]*layout.density)>1e-6||Math.abs(r.spanH-dims[1]*layout.density)>1e-6||r.w!==Math.max(1,Math.ceil(r.spanW-1e-9))||r.h!==Math.max(1,Math.ceil(r.spanH-1e-9)))return false;for(const other of rects)if(r.x-1<other.x+other.w+1&&r.x+r.w+1>other.x-1&&r.y-1<other.y+other.h+1&&r.y+r.h+1>other.y-1)return false;rects.push(r);}return layout.signature===atlasSignature(boxes,size);}
