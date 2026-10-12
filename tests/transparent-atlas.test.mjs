import assert from 'node:assert/strict';
import {packAtlas,validateLayout,repackPixelData,facePixelBounds,padFace} from '../dist/atlas-layout.js';
const boxes=Array.from({length:128},(_,id)=>({id,slot:id,size:[1+(id%4),.2+(id%3),2],color:'#ff0000'}));
for(const size of [32,64,128]){
 const layout=packAtlas(boxes,size);assert.ok(validateLayout(layout,boxes,size));
 const blank=repackPixelData(null,boxes,layout,null);assert.ok(blank.every(v=>v===0));
 const source={data:blank,width:size,height:size};
 for(const b of boxes)for(let face=0;face<6;face++){
  const r=layout.faces[b.slot*6+face];for(let y=0;y<r.h;y++)for(let x=0;x<r.w;x++)source.data.set([b.id,face,91,[0,64,128,255][b.id%4]],((r.y+y)*size+r.x+x)*4);
 }
 const larger=packAtlas(boxes,256),resized=repackPixelData(source,boxes,larger,layout);
 for(const b of boxes)for(let face=0;face<6;face++){
  const r=larger.faces[b.slot*6+face],[x,y,w,h]=facePixelBounds(r);
  for(let dy=0;dy<h;dy++)for(let dx=0;dx<w;dx++){const i=((y+dy)*256+x+dx)*4;assert.deepEqual([...resized.slice(i,i+4)],[b.id,face,91,[0,64,128,255][b.id%4]],'face pixels and gutters retain exact RGBA');}
 }
 const repacked=repackPixelData({width:256,height:256,data:resized},boxes,layout,larger);
 for(const b of boxes){const r=layout.faces[b.slot*6],i=(r.y*size+r.x)*4;assert.deepEqual([...repacked.slice(i,i+4)],[b.id,0,91,[0,64,128,255][b.id%4]]);}
 if(size===32){assert.equal(layout.faces[0].gutter,0);padFace(new Proxy({},{get(){throw Error('No gutter writes allowed');}}),{},layout.faces[0]);}
 const invalid=structuredClone(layout);invalid.faces[0].gutter=2;assert.equal(validateLayout(invalid,boxes,size),false);
}
const prior=packAtlas(boxes.slice(0,1),32),next=packAtlas(boxes.slice(0,2),32),paint={width:32,height:32,data:new Uint8ClampedArray(32*32*4).fill(255)};
const data=repackPixelData(paint,boxes.slice(0,2),next,prior),r=next.faces[6],i=(r.y*32+r.x)*4;assert.deepEqual([...data.slice(i,i+4)],[0,0,0,0],'new cubes start transparent');
console.log('PASS small atlases fit 128 cubes; transparent starts; exact RGBA and isolated faces through resize.');
