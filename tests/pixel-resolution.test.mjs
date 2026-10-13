import assert from 'node:assert/strict';
import {packPixelAtlas,validateLayout,repackPixelData} from '../dist/atlas-layout.js';
import {normalizeModel,slidePosition,editJoint} from '../dist/model-ops.js';
import {faceResize,shapePreviewBase} from '../dist/build-editing.js';
import {FACE_PIXELS,PIXEL_SNAPS,migratePixelSettings} from '../dist/pixel-settings.js';
const cube=(id=0)=>({id,slot:id,parent:id?0:null,p:[0,id+.5,0],q:[0,0,0,1],size:[1,1,1],a:id?[0,.5,0]:null,b:id?[0,-.5,0]:null,normal:[0,1,0]});
for(const density of FACE_PIXELS){
 for(const count of [1,2,8,32,128]){
  const boxes=Array.from({length:count},(_,i)=>cube(i)),layout=packPixelAtlas(boxes,density);
  assert.ok(validateLayout(layout,boxes,layout.size));
  assert.equal(layout.density,density);
  assert.ok(Math.floor(layout.size/density)**2>=count*6);
  assert.ok(Math.floor(layout.size/2/density)**2<count*6,'smallest fitting power of two for square faces');
  for(const r of Object.values(layout.faces))assert.equal(r.w,density);
 }
 for(const pixels of PIXEL_SNAPS){
  const state=normalizeModel({pixelDensity:density,snapPixels:pixels,boxes:[cube(),cube(1)],frames:[]});
  assert.equal(state.gridSize,pixels/density);assert.equal(shapePreviewBase(state).pixelDensity,density);
  const slide=slidePosition(state,1,[.163,1.5,.127])[0],joint=editJoint(state,1,[.163,1,.127]).boxes[1].a[0];
  const resize=faceResize(state,0,[1,0,0],.321,{}),resized=resize.size[0]-1,face=resize.position[0]+resize.size[0]/2;
  for(const v of [slide,joint,face])if(pixels)assert.ok(Math.abs(v/state.gridSize-Math.round(v/state.gridSize))<1e-8);
  if(!pixels){assert.equal(slide,.163);assert.equal(joint,.163);assert.ok(Math.abs(resized-.321)<1e-8);}
 }
 const state=normalizeModel({pixelDensity:density,snapPixels:1,boxes:[cube()],frames:[]});
 assert.equal(faceResize(state,0,[1,0,0],-1,{}).size[0],1/density,'one pixel thick is possible');
}
const boxes=[cube()],before=packPixelAtlas(boxes,16),source={width:before.size,height:before.size,data:new Uint8ClampedArray(before.size**2*4)};
for(const [key,r] of Object.entries(before.faces))for(let y=0;y<r.h;y++)for(let x=0;x<r.w;x++)source.data.set([+key,x,y,(x+y)%2?255:0],((r.y+y)*before.size+r.x+x)*4);
boxes[0].size=[2,1,1];const after=packPixelAtlas(boxes,16),paint=repackPixelData(source,boxes,after,before);
for(const [key,r] of Object.entries(after.faces))for(let y=0;y<r.h;y++)for(let x=0;x<r.w;x++){
 const old=before.faces[key],sx=Math.floor((x+.5)*old.w/r.w),sy=Math.floor((y+.5)*old.h/r.h);
 assert.deepEqual([...paint.slice(((r.y+y)*after.size+r.x+x)*4,((r.y+y)*after.size+r.x+x)*4+4)],[+key,sx,sy,(sx+sy)%2?255:0]);
}
assert.equal(packPixelAtlas([cube()],16).size,64);assert.equal(packPixelAtlas([cube()],8).size,32);
assert.notEqual(packPixelAtlas([cube()],16).signature,packPixelAtlas([cube()],18).signature,'density changes invalidate paint remapping even at the same atlas size');
assert.equal(migratePixelSettings({atlasLayout:{density:7.25},gridSize:.2}).pixelDensity,7.25,'legacy density preserved');
assert.throws(()=>packPixelAtlas(Array.from({length:128},(_,i)=>({...cube(i),size:[12,12,12]})),64),/larger than 4096/);
console.log('PASS fixed pixel density, minimal power-of-two atlas, 128 cubes, pixel snapping, one-pixel minimum, exact resized alpha paint and legacy migration.');
