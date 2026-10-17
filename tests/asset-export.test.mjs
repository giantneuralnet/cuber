import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import * as T from '../dist/vendor/three.module.js';
import {encodeTexturePNG} from '../dist/texture-upscale.js';
import {assetDescription,bundleBytes} from '../dist/export.js';
import {projectPose} from '../dist/model-ops.js';
import {unzipSync,strFromU8} from '../dist/vendor/fflate.js';
const matrix=t=>new T.Matrix4().compose(new T.Vector3(...t.position),new T.Quaternion(...t.rotation),new T.Vector3(1,1,1));
const close=(a,b)=>assert.ok(a.distanceTo(b)<1e-7,`${a.toArray()} != ${b.toArray()}`);
const cube=(id,parent,p,a,b,axis='omni',q=[0,0,0,1])=>({id,parent,p,q,a,b,axis,size:[1,2,1],anchor:false,slot:id,color:'#ffffff'});
const boxes=[cube(0,null,[0,3,0],null,null),cube(1,0,[0,1,0],[0,-1,0],[0,1,0],'x')];
const meshes=new Map(boxes.map(b=>[b.id,{geometry:new T.BoxGeometry()}]));
for(const axis of ['x','y','z'])for(const angle of [-.7,.7]){
 boxes[1].axis=axis;const v=new T.Vector3();v[axis]=1;
 const pose=projectPose(boxes,{0:boxes[0],1:{...boxes[1],q:new T.Quaternion().setFromAxisAngle(v,angle).toArray()}});
 const data=JSON.parse(JSON.stringify(assetDescription({boxes,animations:[{id:3,name:'Test',frames:[{time:0,pose}]}]},meshes,256)));
 const joint=data.joints[1],t=data.animations[0].keyframes[0].jointTransforms[1],q=new T.Quaternion(...t.rotation);
 for(const other of ['x','y','z'].filter(a=>a!==axis))assert.ok(Math.abs(q[other])<1e-8,`${axis} must never become ${other}`);
 assert.equal(joint.authoringConstraint.axis,axis);
 close(new T.Vector3(...joint.authoringConstraint.axisVector),new T.Vector3(-v.x,v.y,-v.z));
 const world=matrix(data.parts[0].restTransform).multiply(matrix(joint.c0)).multiply(matrix(t)).multiply(matrix(joint.c1).invert());
 close(new T.Vector3(0,1,0).applyMatrix4(world),new T.Vector3(0,2,0));
 if(axis==='x'){
  const foot=new T.Vector3(0,-1,0).applyMatrix4(world);
  assert.ok(Math.abs(foot.x)<1e-8,'X hinge cannot swipe laterally');
  assert.ok(Math.abs(foot.z)>1,'X hinge swings forward/back');
  assert.equal(Math.sign(foot.z),Math.sign(angle));
 }
}
boxes[0].q=new T.Quaternion().setFromEuler(new T.Euler(.4,.8,-.3)).toArray();
boxes[1].q=new T.Quaternion().setFromEuler(new T.Euler(-.2,.3,.6)).toArray();
boxes[1].p=new T.Vector3(...boxes[0].p).add(new T.Vector3(...boxes[1].a).applyQuaternion(new T.Quaternion(...boxes[0].q))).sub(new T.Vector3(...boxes[1].b).applyQuaternion(new T.Quaternion(...boxes[1].q))).toArray();
const rest=Object.fromEntries(boxes.map(b=>[b.id,b])),state={boxes,animations:[{id:5,name:'Rest',frames:[{time:0,pose:rest}]},{id:9,name:'Empty',frames:[]}]};
const data=assetDescription(state,meshes,256),joint=data.joints[1];
assert.ok(matrix(data.animations[0].keyframes[0].jointTransforms[1]).elements.every((v,i)=>Math.abs(v-new T.Matrix4().elements[i])<1e-7),'rest keyframe is identity');
const idle=matrix(data.parts[0].restTransform).multiply(matrix(joint.c0)).multiply(matrix(joint.c1).invert());
assert.ok(idle.elements.every((v,i)=>Math.abs(v-matrix(data.parts[1].restTransform).elements[i])<1e-7),'idle joint retains rotated rest pose');
assert.equal(data.animations[1].keyframes.length,0,'empty animation remains editable without inventing a frame');
assert.deepEqual(data.animations.map(a=>a.id),[5,9]);
assert.equal(data.joints[0].parentPartId,null);
const mesh=data.parts[1].mesh,verts=mesh.positions.map(v=>new T.Vector3(...v)),normals=mesh.normals.map(v=>new T.Vector3(...v));
for(let i=16;i<20;i++){assert.ok(verts[i].z<0,'painted front becomes -Z');close(normals[i],new T.Vector3(0,0,-1));}
for(let i=0;i<mesh.indices.length;i+=3){const ids=mesh.indices.slice(i,i+3),[a,b,c]=ids.map(i=>verts[i]);assert.ok(b.clone().sub(a).cross(c.clone().sub(a)).dot(normals[ids[0]])>0,'outward winding retained');}
const uv=meshes.get(1).geometry.attributes.uv;
assert.deepEqual(mesh.uvs,Array.from({length:uv.count},(_,i)=>[uv.getX(i),uv.getY(i)]),'exact UVs retained');
assert.equal(data.coordinates.conversionApplied,true);
assert.equal(data.texture.filter,'nearest');
data.parts[0].size[0]=99;assert.equal(boxes[0].size[0],1,'description does not mutate project');
const testPng=encodeTexturePNG({width:256,height:256,pixels:new Uint8Array(256*256*4).fill(127)}),blob=new Blob([testPng]);
const bytes=await bundleBytes(state,{width:256,toBlob:cb=>cb(blob),toDataURL:()=> 'data:image/png;base64,dGVzdA=='},meshes),files=unzipSync(bytes);
assert.deepEqual(Object.keys(files).sort(),['README.txt','asset.json','atlas.png','cube-asset.fbx','roblox animations/BindToRig.luau','roblox animations/Empty.rbxmx','roblox animations/Rest.rbxmx','textures/1024/atlas.png','textures/512/atlas.png']);
assert.equal(JSON.parse(strFromU8(files['asset.json'])).format,'cube-studio-asset');
assert.equal(JSON.parse(strFromU8(files['asset.json'])).version,2);
assert.equal(files['model.cube'],undefined,'no duplicate editable model');
assert.deepEqual(files['atlas.png'],testPng);
console.log('PASS: data bundle schema, XYZ hinges, connected pivots, rotated rest pose, front orientation, winding, UVs, animation rows, editable metadata, and texture bytes.');
// Optional real-project export also exercises the exact browser bundle builder.
if(process.argv[2]){
 const project=JSON.parse(readFileSync(process.argv[2],'utf8')),state=project.state,png=Buffer.from(project.atlas.split(',')[1],'base64');
 const atlas={width:state.textureSize,toDataURL:()=>project.atlas,toBlob:cb=>cb(new Blob([png],{type:'image/png'}))};
 const meshes=new Map(state.boxes.map(b=>{const geometry=new T.BoxGeometry(),uv=geometry.attributes.uv;
  for(let f=0;f<6;f++){const r=state.atlasLayout.faces[b.slot*6+f];for(let v=0;v<4;v++){const i=f*4+v;uv.setXY(i,(r.x+.0001+uv.getX(i)*(r.spanW-.0002))/atlas.width,1-(r.y+.0001+(1-uv.getY(i))*(r.spanH-.0002))/atlas.width);}}
  return [b.id,{geometry}];}));
 writeFileSync(process.argv[3],await bundleBytes(state,atlas,meshes));
 console.log(`Exported real project: ${state.boxes.length} cubes, ${state.animations.length} animations.`);
}
const {exportFilename}=await import('../dist/export.js');
assert.equal(exportFilename({name:'  Walk Cycle  '}),'Walk Cycle');
assert.equal(exportFilename({name:'Legs/front:*?'}),'Legs-front---');
assert.equal(exportFilename({name:'...'}),'cube-asset');
console.log('PASS: named exports and safe filename fallback.');
const previewPng=encodeTexturePNG({width:256,height:256,pixels:new Uint8Array(256*256*4).fill(255)}),preview=new Blob([previewPng]);
const combined=unzipSync(await bundleBytes(state,{width:256,toBlob:cb=>cb(blob)},meshes,{}, {width:256,toBlob:cb=>cb(preview)}));
assert.deepEqual(combined['atlas.png'],testPng);
assert.deepEqual(combined['fbx-atlas.png'],previewPng);
assert.ok(combined['textures/1024/fbx-atlas.png']);
assert.equal(strFromU8(combined['cube-asset.fbx'].slice(0,20)),'Kaydara FBX Binary  ');
assert.ok(strFromU8(combined['cube-asset.fbx']).includes('fbx-atlas.png'));
assert.equal(files['fbx-atlas.png'],undefined,'no extra PNG when FBX uses the base atlas');
console.log('PASS unified ZIP includes FBX; composited preview stays separate from editable base texture.');

// The simplified Roblox bundle keeps all clips together and exports marker data,
// without shipping a native-Part importer or custom animation runtime.
const {fbxFilename,textureEventData}=await import('../dist/export.js');
assert.equal(fbxFilename({name:'  Wooden Duck  '}),'Wooden_Duck.fbx');
assert.equal(fbxFilename({name:'Duck/Walk: test'}),'Duck-Walk-_test.fbx');
const multi=structuredClone(state);multi.name='Wooden Duck';
const later=structuredClone(rest);later[0].p=[4,3,2];
const moved=projectPose(multi.boxes,later);
multi.animations=[{id:20,name:'Idle',frames:[{time:0,pose:rest,paintFrame:1}]},{id:30,name:'Walk',frames:[{time:0,pose:rest,paintFrame:0},{time:.5,pose:moved,paintFrame:0},{time:1,pose:rest,paintFrame:1},{time:2,pose:moved,paintFrame:0}]},{id:40,name:'Empty',frames:[]}];
const actualPng=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
multi.paintLayer={frame:0,frames:[{png:'data:image/png;base64,'+actualPng.toString('base64')},{png:''}]};
const simplified=unzipSync(await bundleBytes(multi,{width:256,toBlob:cb=>cb(new Blob([actualPng]))},meshes));
assert.deepEqual(Object.keys(simplified).filter(n=>n.endsWith('.fbx')),['Wooden_Duck.fbx']);
assert.ok(Object.keys(simplified).every(n=>!n.startsWith('roblox/')&&!n.endsWith('.lua')&&!n.endsWith('.py')));
const readme=strFromU8(simplified['README.txt']);assert.ok(readme.includes('Wooden_Duck.fbx'));assert.ok(readme.includes('Animator:LoadAnimation()'));assert.ok(!readme.includes('USE PARTS'));assert.ok(readme.length<2400);
assert.ok(simplified['textures/512/paint-layer/frame-0.png']);assert.equal(simplified['textures/512/paint-layer/frame-1.png'],undefined);
const events=JSON.parse(strFromU8(simplified['texture-events.json']));assert.equal(events.marker,'CuberTexture');
assert.deepEqual(events.frames,[{value:'0',overlay:'paint-layer/frame-0.png'},{value:'1',overlay:null}]);
assert.deepEqual(events.animations,[{id:20,name:'Idle',initialValue:'1',events:[{time:0,value:'1'}]},{id:30,name:'Walk',initialValue:'0',events:[{time:0,value:'0'},{time:1,value:'1'},{time:2,value:'0'}]}]);
assert.deepEqual(JSON.parse(strFromU8(simplified['asset.json'])).animations.map(a=>a.id),[20,30,40]);
assert.equal(textureEventData({paintLayer:{frames:[{file:null}]}}),null);
if(process.env.FBX_INSPECTOR){const {mkdtempSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{execFileSync}=await import('node:child_process');const dir=mkdtempSync(tmpdir()+'/cuber-bundle-'),file=dir+'/Wooden_Duck.fbx';writeFileSync(file,simplified['Wooden_Duck.fbx']);const imported=JSON.parse(execFileSync(process.env.FBX_INSPECTOR,[file],{maxBuffer:20*1024*1024}));assert.deepEqual(imported.animations.map(a=>a.name),['Idle','Walk']);assert.equal(imported.meshes.length,1);assert.equal(imported.bones,1);}
console.log('PASS named single FBX with all clips, concise README, no legacy runtime, and exact texture marker labels/times.');
