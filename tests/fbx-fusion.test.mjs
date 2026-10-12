import assert from 'node:assert/strict';
import {writeFileSync,mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import * as T from '../dist/vendor/three.module.js';
import {fuseStaticAsset} from '../dist/fbx-fusion.js';
import {fbxBytes} from '../dist/fbx-export.js';
const identity=()=>({position:[0,0,0],rotation:[0,0,0,1]});
const matrix=t=>new T.Matrix4().compose(new T.Vector3(...t.position),new T.Quaternion(...t.rotation),new T.Vector3(1,1,1));
const transform=m=>{const p=new T.Vector3(),q=new T.Quaternion(),s=new T.Vector3();m.decompose(p,q,s);return {position:p.toArray(),rotation:q.toArray()};};
const geometry=new T.BoxGeometry(),a=geometry.attributes;
const box={positions:Array.from({length:24},(_,i)=>[a.position.getX(i),a.position.getY(i),a.position.getZ(i)]),normals:Array.from({length:24},(_,i)=>[a.normal.getX(i),a.normal.getY(i),a.normal.getZ(i)]),uvs:Array.from({length:24},(_,i)=>[a.uv.getX(i),a.uv.getY(i)]),indices:Array.from(geometry.index.array)};
const parts=Array.from({length:6},(_,i)=>({id:i,name:'Part'+i,mesh:structuredClone(box),restTransform:{position:[i*.4,2+i*.3,-i*.2],rotation:new T.Quaternion().setFromEuler(new T.Euler(.1*i,.15*i,-.07*i)).toArray()}}));
const parents=[null,0,1,2,3,1],rigRoot={restTransform:parts[0].restTransform};
const joints=parts.map((p,i)=>{const parent=parents[i],c1=i?{position:[.2,.3,-.1],rotation:new T.Quaternion().setFromEuler(new T.Euler(.1,-.2,.15)).toArray()}:identity();return {childPartId:i,parentPartId:parent,c1,c0:transform(matrix(parent===null?rigRoot.restTransform:parts[parent].restTransform).invert().multiply(matrix(p.restTransform)).multiply(matrix(c1)))};});
function frame(time,clip){return {time,jointTransforms:Object.fromEntries(parts.map(p=>[p.id,(!clip&&[2,4].includes(p.id))||(clip&&p.id===5)?{position:[time*.12,0,0],rotation:new T.Quaternion().setFromEuler(new T.Euler(.2*time,.7*time,-.3*time)).toArray()}:identity()]))};}
const asset={name:'Fusion',parts,joints,rigRoot,animations:[{name:'Walk',keyframes:[frame(0,0),frame(1,0)]},{name:'Attack',keyframes:[frame(0,1),frame(1,1)]}]};
const before=JSON.stringify(asset),fused=fuseStaticAsset(asset);assert.equal(JSON.stringify(asset),before,'does not modify editor/source asset');
assert.deepEqual(fused.asset.parts.map(p=>p.id),[0,2,4,5]);assert.equal(fused.staticMesh,false);
assert.deepEqual(fused.asset.joints.map(j=>j.parentPartId),[null,0,2,0]);
const groups=[[0,1],[2,3],[4],[5]];
function worlds(asset,clip,t){const out=new Map(),frames=asset.animations[clip].keyframes;for(const p of asset.parts){const j=asset.joints.find(j=>j.childPartId===p.id),a=frames[0].jointTransforms[p.id],b=frames.at(-1).jointTransforms[p.id];const value={position:new T.Vector3(...a.position).lerp(new T.Vector3(...b.position),t).toArray(),rotation:new T.Quaternion(...a.rotation).slerp(new T.Quaternion(...b.rotation),t).toArray()};out.set(p.id,(out.get(j.parentPartId)?.clone()??matrix(asset.rigRoot.restTransform)).multiply(matrix(j.c0)).multiply(matrix(value)).multiply(matrix(j.c1).invert()));}return out;}
const compare=(actual,expected,label,tolerance=2e-5)=>{assert.equal(actual.length,expected.length);actual.forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<tolerance,`${label}[${i}]: ${v} vs ${expected[i]}`));};
function expected(clip,t){const w=worlds(asset,clip,t);return groups.map(g=>({positions:g.flatMap(id=>parts[id].mesh.indices.flatMap(i=>new T.Vector3(...parts[id].mesh.positions[i]).applyMatrix4(w.get(id)).toArray())),uvs:g.flatMap(id=>parts[id].mesh.indices.flatMap(i=>parts[id].mesh.uvs[i]))}));}
for(let clip=0;clip<2;clip++)for(const t of [0,.35,.75,1]){const w=worlds(fused.asset,clip,t),e=expected(clip,t);fused.asset.parts.forEach((p,i)=>{compare(p.mesh.indices.flatMap(index=>new T.Vector3(...p.mesh.positions[index]).applyMatrix4(w.get(p.id)).toArray()),e[i].positions,'fused motion');compare(p.mesh.indices.flatMap(index=>p.mesh.uvs[index]),e[i].uvs,'fused UVs');});}
const staticAsset={...asset,animations:[]};assert.equal(fuseStaticAsset(staticAsset).staticMesh,true);assert.equal(fuseStaticAsset(staticAsset).asset.parts.length,1);
const still={...asset,animations:[{name:'Still',keyframes:[frame(0,0)]}]};assert.equal(fuseStaticAsset(still).staticMesh,true);
const rootMotion=structuredClone(still);rootMotion.animations[0].keyframes.push(frame(1,2));rootMotion.animations[0].keyframes[1].jointTransforms[0].position=[1,0,0];rootMotion.animations[0].keyframes[1].jointTransforms[5]=identity();
assert.equal(fuseStaticAsset(rootMotion).staticMesh,false);assert.equal(fuseStaticAsset(rootMotion).asset.parts.length,1,'whole-asset motion retains one bone');
const posed=structuredClone(still);posed.animations[0].keyframes[0].jointTransforms[1].position=[.1,0,0];assert.equal(fuseStaticAsset(posed).asset.parts.length,2,'preserve an offset from the bind pose');
const signed=structuredClone(still);signed.animations[0].keyframes[0].jointTransforms[1].rotation=[0,0,0,-1];assert.equal(fuseStaticAsset(signed).staticMesh,true,'equivalent quaternion signs');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64'),dir=mkdtempSync(join(tmpdir(),'cuber-fusion-'));
for(const [name,source,on,count,bones] of [['fused',asset,true,4,4],['original',asset,false,6,6],['static',staticAsset,true,1,0],['still',still,true,1,0],['root',rootMotion,true,1,1]]){
 const file=join(dir,name+'.fbx');writeFileSync(file,fbxBytes(source,png,{fuseStaticJoints:on}));
 if(process.env.FBX_SDK_LIBRARY){const sdk=JSON.parse(execFileSync('python3',[new URL('./fbx-sdk-check.py',import.meta.url).pathname,file]));assert.equal(sdk.imported,true);assert.equal(sdk.nodes.filter(n=>n.activeMesh).length,count);assert.equal(sdk.nodes.filter(n=>n.activeSkeleton).length,bones);assert.deepEqual(readFileSync(sdk.textureFiles[0]),png);}
 // Between baked 30fps keys, FBX interpolates Euler channels instead of slerping.
 if(process.env.FBX_INSPECTOR){for(const t of name==='fused'?[0,1/3,.35,.75,23/30,1]:[0]){const parsed=JSON.parse(execFileSync(process.env.FBX_INSPECTOR,[file,String(t)],{maxBuffer:20*1024*1024}));assert.equal(parsed.meshes.length,count);assert.equal(parsed.bones,bones);if(name==='fused')for(let clip=0;clip<2;clip++){const e=expected(clip,t);parsed.animations[clip].meshes.forEach((m,i)=>{compare(m.positions,e[i].positions,'FBX motion',Number.isInteger(t*30)?2e-5:1e-3);compare(m.uvs,e[i].uvs,'FBX UVs');});}}}
}
console.log('PASS fusion across all clips and rest, reparented moving descendants, exact motion/UVs, whole-asset motion, static/Still collapse, fusion off, unchanged source, Autodesk active scene nodes.');
