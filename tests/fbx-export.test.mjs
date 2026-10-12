import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import * as T from '../dist/vendor/three.module.js';
import {assetDescription} from '../dist/export.js';
import {fbxBytes} from '../dist/fbx-export.js';
import {projectPose} from '../dist/model-ops.js';
import {checkBlenderMetadata} from './fbx-metadata.mjs';
const inspector=process.env.FBX_INSPECTOR;
const matrix=t=>new T.Matrix4().compose(new T.Vector3(...t.position),new T.Quaternion(...t.rotation),new T.Vector3(1,1,1));
const expectedVertices=(asset,poses)=>asset.parts.map(p=>({name:`${p.name}_${p.id}`,positions:p.mesh.indices.flatMap(i=>new T.Vector3(...p.mesh.positions[i]).applyMatrix4(poses?.get(p.id)??matrix(p.restTransform)).toArray()),uvs:p.mesh.indices.flatMap(i=>p.mesh.uvs[i])}));
function compare(actual,expected){assert.equal(actual.length,expected.length);for(const a of actual){const e=expected.find(e=>e.name===a.name);assert.ok(e,a.name);assert.equal(a.skins,1);assert.equal(a.triangles,12);for(const key of ['positions','uvs']){assert.equal(a[key].length,e[key].length);a[key].forEach((v,i)=>assert.ok(Math.abs(v-e[key][i])<2e-5,`${a.name} ${key}[${i}]: ${v} != ${e[key][i]}`));}}}
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
const boxes=[{id:0,parent:null,slot:0,name:'Root',p:[.3,3,.8],q:new T.Quaternion().setFromEuler(new T.Euler(.2,.5,-.1)).toArray(),size:[1,1,2],color:'#ffffff',anchor:true,a:null,b:null},{id:1,parent:0,slot:1,name:'Child',p:[0,1,0],q:[0,0,0,1],size:[.6,1.3,.8],color:'#ffffff',anchor:false,a:[.5,-.5,.4],b:[0,.65,0],axis:'omni'}];
const rest=projectPose(boxes,Object.fromEntries(boxes.map(b=>[b.id,b])));for(const b of boxes)Object.assign(b,rest[b.id]);
const pose=angle=>projectPose(boxes,{...rest,1:{...rest[1],q:new T.Quaternion().setFromEuler(new T.Euler(.35,angle,-.45)).toArray()}});
const animations=[{id:0,name:'Turn',frames:[{time:0,pose:pose(2.8)},{time:1,pose:pose(3.5)}]},{id:1,name:'Rest',frames:[{time:0,pose:rest}]}];
const meshes=new Map(boxes.map(b=>[b.id,{geometry:new T.BoxGeometry()}]));
const asset=assetDescription({name:'FBX rig',boxes,animations},meshes,256),bytes=fbxBytes(asset,png);
assert.equal(new TextDecoder().decode(bytes.slice(0,21)),'Kaydara FBX Binary  \0');assert.equal(new DataView(bytes.buffer).getUint32(23,true),7400);
assert.ok(bytes.length>png.length);assert.deepEqual(bytes,fbxBytes(asset,png),'deterministic bytes');
checkBlenderMetadata(fbxBytes({...asset,animations:[...asset.animations,{...asset.animations[1],name:'Still'}]},png));
if(!inspector){console.log('PASS FBX binary header and deterministic export. Set FBX_INSPECTOR for independent rig/UV/animation checks.');process.exit(0);}
const path=join(mkdtempSync(join(tmpdir(),'cuber-fbx-')),'rig.fbx');writeFileSync(path,bytes);
for(const t of [0,.5,1]){
 const parsed=JSON.parse(execFileSync(inspector,[path,String(t)],{maxBuffer:20*1024*1024}));assert.equal(parsed.bones,2);assert.equal(parsed.materials,1);assert.equal(parsed.textures,1);assert.equal(parsed.embeddedBytes,png.length);compare(parsed.meshes,expectedVertices(asset));
 assert.deepEqual(parsed.animations.map(a=>a.name),['Turn','Rest']);
 for(let n=0;n<2;n++){
  const a=asset.animations[n].keyframes[0],b=asset.animations[n].keyframes.at(-1),world=new Map();
  for(const p of asset.parts){const j=asset.joints.find(j=>j.childPartId===p.id),av=a.jointTransforms[p.id],bv=b.jointTransforms[p.id],local=matrix({position:new T.Vector3(...av.position).lerp(new T.Vector3(...bv.position),t).toArray(),rotation:new T.Quaternion(...av.rotation).slerp(new T.Quaternion(...bv.rotation),t).toArray()});world.set(p.id,(world.get(j.parentPartId)?.clone()??matrix(asset.rigRoot.restTransform)).multiply(matrix(j.c0)).multiply(local).multiply(matrix(j.c1).invert()));}
  compare(parsed.animations[n].meshes,expectedVertices(asset,world));
 }
}
// Read all seven real files through ufbx, not the writer's own parser.
if(process.argv.includes('--pantry')){
const catalog=JSON.parse(readFileSync(new URL('../../assets/pantry-props/catalog.json',import.meta.url)));
for(const {slug,count} of catalog){
 const base=new URL(`../../assets/pantry-props/fbx/${slug}`,import.meta.url),p=JSON.parse(execFileSync(inspector,[base.pathname+'.fbx'],{maxBuffer:20*1024*1024})),a=JSON.parse(readFileSync(base.pathname+'-expected.json'));
 assert.equal(p.bones,count);assert.equal(p.embeddedBytes,readFileSync(base.pathname+'-atlas.png').length);compare(p.meshes,expectedVertices(a));compare(p.animations[0].meshes,expectedVertices(a));writeFileSync(base.pathname+'-read.json',JSON.stringify(p));
 console.log(`PASS ${slug}: independent FBX read, ${count} meshes/bones, exact UVs, texture, bind pose.`);
}
}
console.log('PASS animated rig: mixed rotations, pivot positions, 180-degree crossing, and separate clips.');
