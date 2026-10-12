import assert from 'node:assert/strict';
import {editShape,editJoint,slidePosition,contactNormal} from '../dist/model-ops.js';
import {faceResize,planeDragDelta} from '../dist/build-editing.js';
import {packAtlas,repackPixelData} from '../dist/atlas-layout.js';

// Imported articulated assets can place pivots inside or outside either box.
const root={id:0,parent:null,p:[0,0,0],q:[0,0,0,1],size:[4,4,4]};
const child={id:1,parent:0,p:[0,-1,0],q:[0,0,0,1],size:[1,1,1],a:[0,-1,0],b:[0,0,0]};
const state={boxes:[root,child],gridSize:.05,animations:[{frames:[{pose:{0:{p:root.p,q:root.q},1:{p:child.p,q:child.q}}}]}]};
assert.equal(contactNormal(child,root),null);
assert.deepEqual(editShape(state,1,slidePosition(state,1,child.p),child.size).boxes,state.boxes);
const position=slidePosition(state,1,[.1,-1,.15]);
assert.deepEqual(position,[.1,-1,.15000000000000002]);
assert.deepEqual(editShape(state,1,position,child.size).boxes[1].p,position);
const resize=faceResize(state,1,[0,1,0],.2,{}),result=editShape(state,1,resize.position,resize.size);
assert.ok(Math.abs(result.boxes[1].p[1]+.9)<1e-9);
assert.deepEqual(result.boxes[1].b,[0,0,0]);
assert.deepEqual(editJoint(state,1,[.1,-1,.15]).boxes.map(b=>b.p),state.boxes.map(b=>b.p));
assert.deepEqual(planeDragDelta(0,0,{x:100,y:0},{x:99,y:.001}),[0,0]);
assert.deepEqual(planeDragDelta(10,20,{x:100,y:0},{x:0,y:100}),[.1,.2]);
const edge=planeDragDelta(10,20,{x:100,y:0},{x:99,y:.001});
assert.ok(Math.hypot(...edge)<.3,'edge-on plane must not amplify a small drag');
assert.deepEqual(planeDragDelta(10,20,{x:0,y:0},{x:0,y:0}),[0,0]);

// Nearest resampling must preserve exact pixels and transparent overlays,
// including the one-pixel border used to isolate neighboring atlas faces.
const boxes=[{slot:0,color:'#204060',size:[1,1,1]}],old=packAtlas(boxes,256);
const source={width:256,height:256,data:new Uint8ClampedArray(256*256*4)};
for(const r of Object.values(old.faces))for(let y=0;y<r.h;y++)for(let x=0;x<r.w;x++)source.data.set([x*25,y*25,100,x%2?128:255],((r.y+y)*256+r.x+x)*4);
const larger=[{...boxes[0],size:[2,1.5,.5]}],next=packAtlas(larger,256),overlay=repackPixelData(source,larger,next,old,{overlay:true}),base=repackPixelData(source,larger,next,old);
for(const [key,r] of Object.entries(next.faces))for(let y=-1;y<=r.h;y++)for(let x=-1;x<=r.w;x++){
 const original=old.faces[key],sx=Math.floor(original.x+(Math.max(0,Math.min(r.w-1,x))+.5)*original.w/r.w),sy=Math.floor(original.y+(Math.max(0,Math.min(r.h-1,y))+.5)*original.h/r.h),si=(sy*256+sx)*4,di=((r.y+y)*256+r.x+x)*4;
 assert.deepEqual(overlay.slice(di,di+4),source.data.slice(si,si+4));
 assert.deepEqual(base.slice(di,di+4),source.data.slice(si,si+4));
}
const blank=repackPixelData(null,boxes,old,null,{overlay:true});assert.ok(blank.every(v=>v===0));
const filled=repackPixelData(null,boxes,old,null),r=old.faces[0],offset=(r.y*256+r.x)*4;assert.deepEqual([...filled.slice(offset,offset+4)],[0,0,0,0]);
console.log('PASS: inset pivots, bounded edge-on dragging, exact nearest pixels, base/overlay alpha and atlas gutters.');
