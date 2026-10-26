import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from '../dist/vendor/three.module.js';
import {encodeTexturePNG} from '../dist/texture-upscale.js';
import {bundleBytes,readProject,projectData} from '../dist/export.js';
import {stateFromAsset} from '../dist/asset-project.js';
import {packAtlas} from '../dist/atlas-layout.js';
import {projectPose} from '../dist/model-ops.js';
import {zipSync,unzipSync,strToU8,strFromU8} from '../dist/vendor/fflate.js';
// Image decoding is exercised in the browser; Node checks the same importer and PNG dimensions.
globalThis.Image=class {set src(url){const b=Buffer.from(url.split(',')[1],'base64');this.width=b.readUInt32BE(16);this.height=b.readUInt32BE(20);queueMicrotask(()=>this.onload());}};
const mat=p=>new T.Matrix4().compose(new T.Vector3(...p.p),new T.Quaternion(...p.q),new T.Vector3(1,1,1));
const samePose=(a,b)=>mat(a).elements.forEach((v,i)=>assert.ok(Math.abs(v-mat(b).elements[i])<1e-7));
function sameState(a,b){
 for(const key of ['name','textureSize','gridSize','nextId','nextAnimationId','animation','frame','atlasLayout'])assert.deepEqual(a[key],b[key],key);
 assert.equal(a.boxes.length,b.boxes.length);
 for(let i=0;i<a.boxes.length;i++){
  const x=a.boxes[i],y=b.boxes[i];samePose(x,y);
  for(const key of ['id','parent','slot','anchor','color','size','axis','normal'])assert.deepEqual(x[key],y[key],key);
  if(x.name)assert.equal(x.name,y.name);
  if(x.parent!==null)for(const key of ['a','b'])x[key].forEach((v,j)=>assert.ok(Math.abs(v-y[key][j])<1e-7,key));
 }
 assert.equal(a.animations.length,b.animations.length);
 for(let i=0;i<a.animations.length;i++){
  const x=a.animations[i],y=b.animations[i];assert.equal(x.id,y.id);assert.equal(x.name,y.name);assert.equal(x.frames.length,y.frames.length);
  x.frames.forEach((f,j)=>{assert.equal(f.time,y.frames[j].time);for(const box of a.boxes)samePose(f.pose[box.id],y.frames[j].pose[box.id]);});
 }
}
function meshMap(state){return new Map(state.boxes.map(b=>{
 const geometry=new T.BoxGeometry(),uv=geometry.attributes.uv;
 for(let f=0;f<6;f++){const r=state.atlasLayout.faces[b.slot*6+f];for(let v=0;v<4;v++){const i=f*4+v;uv.setXY(i,(r.x+.0001+uv.getX(i)*(r.spanW-.0002))/state.textureSize,1-(r.y+.0001+(1-uv.getY(i))*(r.spanH-.0002))/state.textureSize);}}
 return [b.id,{geometry}];
}));}
const boxes=[{id:0,parent:null,name:'Root',slot:8,anchor:true,color:'#abcdef',size:[1.3,1.1,.8],p:[2,3,-1],q:new T.Quaternion().setFromEuler(new T.Euler(.3,.8,-.2)).toArray(),a:null,b:null,axis:'omni'}];
for(const [i,axis] of ['x','y','z'].entries()){
 const parent=boxes.at(-1),q=new T.Quaternion(...parent.q).multiply(new T.Quaternion().setFromEuler(new T.Euler(.2,-.3,.1))),a=[0,parent.size[1]/2,0],b=[0,-.4,0];
 const p=new T.Vector3(...parent.p).add(new T.Vector3(...a).applyQuaternion(new T.Quaternion(...parent.q))).sub(new T.Vector3(...b).applyQuaternion(q));
 boxes.push({id:i+2,parent:parent.id,name:`Hinge ${axis}`,slot:i*3,anchor:i===1,color:'#f0dab2',size:[.7,.8,1.1],p:p.toArray(),q:q.toArray(),a,b,axis,normal:[0,1,0]});
}
const rest=Object.fromEntries(boxes.map(b=>[b.id,{p:b.p,q:b.q}])),moved=structuredClone(rest);
moved[0].p=[3,4,-2];moved[2].q=new T.Quaternion().setFromEuler(new T.Euler(.6,.4,.1)).toArray();
const state={name:'Round trip',boxes,nextId:12,textureSize:256,gridSize:.05,atlasLayout:packAtlas(boxes,256),animations:[{id:2,name:'Motion',loop:false,priority:'Movement',frames:[{time:0,pose:rest},{time:.5,pose:projectPose(boxes,moved)}]},{id:7,name:'Empty',frames:[]}],nextAnimationId:12,animation:0,frame:1};
const settings={mode:'paint',tool:'fill',color:'#123456',palette:['#123456','#ffffff','#000000','#aaaaaa','#bbbbbb','#cccccc','#dddddd'],brush:13,mirrors:{x:true,y:false,z:true},textureView:true,exploded:true,showJoints:false};
const png=Buffer.from(encodeTexturePNG({width:256,height:256,pixels:new Uint8Array(256*256*4)}));
const atlas={width:256,toBlob:cb=>cb(new Blob([png])),toDataURL:()=>`data:image/png;base64,${png.toString('base64')}`};
const meshes=meshMap(state),bytes=await bundleBytes(state,atlas,meshes,settings),files=unzipSync(bytes),loaded=await readProject(new Blob([bytes]));
assert.ok(files['project/asset.json']);assert.ok(Object.keys(files).some(n=>n.startsWith('Godot/')&&n.endsWith('.glb')));assert.equal(Object.keys(files).filter(n=>n.endsWith('.fbx')).length,2);
sameState(state,loaded.state);assert.equal(loaded.state.animations[0].loop,false);assert.equal(loaded.state.animations[0].priority,'Movement');assert.deepEqual(loaded.editor,settings);assert.deepEqual(Buffer.from(files['project/atlas.png']),png);
const savedAgain=await readProject(new Blob([await bundleBytes(loaded.state,atlas,meshMap(loaded.state),loaded.editor)]));sameState(state,savedAgain.state);
const legacy=projectData(state,atlas);sameState(state,(await readProject(new Blob([JSON.stringify(legacy)]))).state);
const oldZip=zipSync({'asset.json':strToU8(JSON.stringify({format:'cube-studio-asset',version:1})),'model.cube':strToU8(JSON.stringify(legacy))});sameState(state,(await readProject(new Blob([oldZip]))).state);
const asset=JSON.parse(strFromU8(files['project/asset.json']));
const layered=structuredClone(state);
layered.paintLayer={frame:1,frames:[{png:atlas.toDataURL()},{png:''}]};
layered.animations[0].frames[0].paintFrame=1;
layered.animations[0].frames[1].paintFrame=0;
const layerBytes=await bundleBytes(layered,atlas,meshes,settings),layerFiles=unzipSync(layerBytes),layerLoaded=await readProject(new Blob([layerBytes]));
assert.deepEqual(layerLoaded.state.paintLayer,layered.paintLayer);
assert.deepEqual(layerLoaded.state.animations[0].frames.map(f=>f.paintFrame),[1,0]);
assert.deepEqual(Buffer.from(layerFiles['project/paint-layer/frame-0.png']),png);
assert.equal(layerFiles['project/paint-layer/frame-1.png'],undefined);
const layerAsset=JSON.parse(strFromU8(layerFiles['project/asset.json']));
assert.deepEqual(layerAsset.paintLayer.frames,[{file:'paint-layer/frame-0.png'},{file:null}]);
for(const modify of [
 f=>delete f['project/paint-layer/frame-0.png'],
 f=>{const wrong=Buffer.from(png);wrong.writeUInt32BE(512,16);f['project/paint-layer/frame-0.png']=wrong;},
 f=>{const a=structuredClone(layerAsset);a.animations[0].keyframes[0].paintFrame=2;f['project/asset.json']=strToU8(JSON.stringify(a));},
 f=>{const a=structuredClone(layerAsset);a.editor.paintFrame=-1;f['project/asset.json']=strToU8(JSON.stringify(a));}
]){const malformed={...layerFiles};modify(malformed);await assert.rejects(readProject(new Blob([zipSync(malformed)])));}
const layerLegacy=await readProject(new Blob([JSON.stringify(projectData(layered,atlas,settings))]));
assert.deepEqual(layerLegacy.state.paintLayer,layered.paintLayer);
for(const mutate of [a=>a.version=99,a=>a.joints[1].parentPartId=123,a=>a.parts[0].restTransform.rotation=[0,0,0,0],a=>a.animations[0].keyframes[0].jointTransforms[2]=null]){
 const bad=structuredClone(asset);mutate(bad);assert.throws(()=>stateFromAsset(bad));
}
await assert.rejects(readProject(new Blob([zipSync({'asset.json':files['project/asset.json']})])));
await assert.rejects(readProject(new Blob([bytes.subarray(0,30)])));
const badAtlas=structuredClone(asset);badAtlas.editor.atlasLayout.faces[0].x=-1;
await assert.rejects(readProject(new Blob([zipSync({'asset.json':strToU8(JSON.stringify(badAtlas)),'atlas.png':png})])));
const large=zipSync({'padding':new Uint8Array(65*1024*1024)});await assert.rejects(readProject(new Blob([large])),/too large|Invalid/);
for(const filename of process.argv.slice(2)){
 const project=JSON.parse(readFileSync(filename,'utf8')),s=project.state,paint=Buffer.from(project.atlas.split(',')[1],'base64');
 const a={width:s.textureSize,toBlob:cb=>cb(new Blob([paint])),toDataURL:()=>project.atlas};
 const result=await readProject(new Blob([await bundleBytes(s,a,meshMap(s),settings)]));sameState(s,result.state);
 console.log(`PASS: real asset round trip: ${s.name}, ${s.boxes.length} parts, ${s.animations.length} animation rows.`);
}
console.log('PASS: repeated ZIP round trips, rotated XYZ hinges, sparse atlas slots, exact texture, editor settings, empty rows, legacy files/bundles, and malformed/oversized ZIP rejection.');

// The smallest atlas plus all sixteen frames produces over 100 ZIP entries.
const small=structuredClone(state);small.textureSize=32;small.atlasLayout=packAtlas(small.boxes,32);
const smallPNG=encodeTexturePNG({width:32,height:32,pixels:new Uint8Array(32*32*4).fill(127)});
small.paintLayer={frame:15,frames:Array.from({length:16},()=>({png:'data:image/png;base64,'+Buffer.from(smallPNG).toString('base64')}))};
const smallBundle=await bundleBytes(small,{width:32,toBlob:cb=>cb(new Blob([smallPNG]))},meshMap(small),settings);
assert.ok(Object.keys(unzipSync(smallBundle)).length>100);
const smallLoaded=await readProject(new Blob([smallBundle]));assert.equal(smallLoaded.state.paintLayer.frames.length,16);assert.equal(smallLoaded.state.textureSize,32);
console.log('PASS maximum paint frames with every upscale remain editable.');
// Previous flat version-2 exports remain loadable after folder migration.
const flat=Object.fromEntries(Object.entries(files).filter(([n])=>n.startsWith('project/')).map(([n,d])=>[n.slice(8),d]));
sameState(state,(await readProject(new Blob([zipSync(flat)]))).state);
assert.ok(files['Roblox/animations/fused/Motion.rbxmx']);
assert.ok(files['Roblox/animations/unfused/Motion.rbxmx']);
assert.ok(files['Roblox/Round_trip.fbx']);assert.ok(files['Roblox/Round_trip_fused.fbx']);
assert.equal(files['Godot/texture_player.gd'],undefined,'no texture helper without animated texture sources');
