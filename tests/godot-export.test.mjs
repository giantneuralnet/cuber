import assert from 'node:assert/strict';
import {writeFileSync,mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import * as T from '../dist/vendor/three.module.js';
import {fuseStaticAsset} from '../dist/fbx-fusion.js';
import {glbBytes} from '../dist/godot-export.js';
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

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
// Include root motion as well as mixed-axis hinges and rigid intermediate parts.
asset.animations[0].keyframes[1].jointTransforms[0].position=[.4,.2,-.3];
const original=JSON.stringify(asset),bytes=glbBytes(asset,png),v=new DataView(bytes.buffer),jsonLength=v.getUint32(12,true),g=JSON.parse(new TextDecoder().decode(bytes.subarray(20,20+jsonLength))),bin=bytes.subarray(28+jsonLength);
assert.equal(v.getUint32(0,true),0x46546c67);assert.equal(v.getUint32(8,true),bytes.length);assert.equal(JSON.stringify(asset),original);
function read(index){const a=g.accessors[index],b=g.bufferViews[a.bufferView],count=a.count*({SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[a.type]),data=new DataView(bin.buffer,bin.byteOffset+b.byteOffset,b.byteLength);return Array.from({length:count},(_,i)=>a.componentType===5126?data.getFloat32(i*4,true):data.getUint16(i*2,true));}
const fused=fuseStaticAsset(asset).asset,skin=g.skins[0];assert.equal(skin.joints.length,4);assert.equal(g.animations.length,2);assert.equal(g.samplers[0].magFilter,9728);
const inv=read(skin.inverseBindMatrices),attrs=g.meshes[0].primitives[0].attributes,positions=read(attrs.POSITION),boneIds=read(attrs.JOINTS_0),uvs=read(attrs.TEXCOORD_0);
const close=(a,b)=>a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<2e-5,`${v} != ${b[i]}`));
for(const [clip,animation] of g.animations.entries())for(const time of [0,.4,1]){
 const local=new Map();for(const channel of animation.channels){const sampler=animation.samplers[channel.sampler],times=read(sampler.input),index=times.findIndex(t=>Math.abs(t-time)<1e-6),width=channel.target.path==='rotation'?4:3;assert.ok(index>=0);const value=read(sampler.output).slice(index*width,(index+1)*width);if(!local.has(channel.target.node))local.set(channel.target.node,{});local.get(channel.target.node)[channel.target.path]=value;}
 const bw=new Map(),world=new Map();for(const p of fused.parts){const j=fused.joints.find(j=>j.childPartId===p.id),a=asset.animations[clip].keyframes[0].jointTransforms[p.id],b=asset.animations[clip].keyframes[1].jointTransforms[p.id],delta=matrix({position:new T.Vector3(...a.position).lerp(new T.Vector3(...b.position),time).toArray(),rotation:new T.Quaternion(...a.rotation).slerp(new T.Quaternion(...b.rotation),time).toArray()}),expected=(world.get(j.parentPartId)?.clone()??matrix(asset.rigRoot.restTransform)).multiply(matrix(j.c0)).multiply(delta);world.set(p.id,expected.clone().multiply(matrix(j.c1).invert()));const node=skin.joints[fused.parts.indexOf(p)],l=local.get(node),actual=(bw.get(j.parentPartId)?.clone()??new T.Matrix4()).multiply(matrix({position:l.translation,rotation:l.rotation}));bw.set(p.id,actual);close(actual.elements,expected.elements);}
 let vertex=0;for(const [i,p] of fused.parts.entries()){const j=fused.joints.find(j=>j.childPartId===p.id),bone=bw.get(p.id),bind=new T.Matrix4().fromArray(inv,i*16);for(let k=0;k<p.mesh.positions.length;k++,vertex++){assert.equal(boneIds[vertex*4],i);const actual=new T.Vector3(...positions.slice(vertex*3,vertex*3+3)).applyMatrix4(bind).applyMatrix4(bone),expected=new T.Vector3(...p.mesh.positions[k]).applyMatrix4(world.get(p.id));close(actual.toArray(),expected.toArray());close(uvs.slice(vertex*2,vertex*2+2),[p.mesh.uvs[k][0],1-p.mesh.uvs[k][1]]);}}
}
console.log('PASS GLB skinning, fused hierarchy, mixed-axis hinges, root motion, UV orientation, nearest filtering and unchanged source.');
const {godotFiles,pbrTextures}=await import('../dist/godot-export.js');
const {encodeTexturePNG,decodeTexturePNG}=await import('../dist/texture-upscale.js');
const pixel=rgba=>encodeTexturePNG({width:1,height:1,pixels:Uint8Array.from(rgba)}),color=pixel([200,80,30,128]),mask=pixel([128,128,128,255]);
const maps=pbrTextures(color,mask,mask);assert.deepEqual(Array.from(decodeTexturePNG(maps.orm).pixels),[255,165,128,255]);
const materialGLB=glbBytes(asset,color,maps),ml=new DataView(materialGLB.buffer).getUint32(12,true),mg=JSON.parse(new TextDecoder().decode(materialGLB.subarray(20,20+ml)));
assert.equal(mg.materials[0].alphaMode,'BLEND');assert.ok(mg.materials[0].emissiveTexture);assert.ok(mg.materials[0].pbrMetallicRoughness.metallicRoughnessTexture);
const duplicate=structuredClone(asset);duplicate.animations.forEach((a,i)=>{a.id=i;a.name='Walk';});const exported=godotFiles(duplicate,png,png,{},null,'Example');const settings=JSON.parse(new TextDecoder().decode(exported['Godot/animation-settings.json']));assert.deepEqual(settings.map(a=>a.name),['Walk','Walk 2']);
console.log('PASS Godot PBR channel packing, partial alpha, emission and distinct duplicate clip names.');
