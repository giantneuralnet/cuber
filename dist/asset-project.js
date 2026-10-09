import * as THREE from './vendor/three.module.js';
import {unzipSync,strFromU8} from './vendor/fflate.js';

const fail=()=>{throw Error('Invalid Cube Studio ZIP');};
const validArray=(a,n)=>Array.isArray(a)&&a.length===n&&a.every(v=>Number.isFinite(v)&&Math.abs(v)<10000);
const basis=new THREE.Matrix4().makeScale(-1,1,-1);
function matrix(t){
  if(!t||!validArray(t.position,3)||!validArray(t.rotation,4)||Math.abs(Math.hypot(...t.rotation)-1)>.01)fail();
  return new THREE.Matrix4().compose(new THREE.Vector3(...t.position),new THREE.Quaternion(...t.rotation),new THREE.Vector3(1,1,1));
}
function editorPose(m){
  const p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();
  basis.clone().multiply(m).multiply(basis).decompose(p,q,s);
  return {p:p.toArray(),q:q.normalize().toArray()};
}
const editorVector=v=>[-v[0],v[1],-v[2]];

// The rig is authoritative. Only atlas slots, face normals and workspace settings
// live in editor metadata; no second copy of boxes or animation poses is stored.
export function stateFromAsset(asset){
  const editor=asset?.editor;
  if(asset?.format!=='cube-studio-asset'||asset.version!==2||editor?.version!==1||
     asset.coordinates?.forward!=='-Z'||asset.coordinates?.up!=='+Y'||asset.coordinates?.conversionApplied!==true||
     asset.texture?.file!=='atlas.png'||asset.texture.width!==asset.texture.height||
     !Array.isArray(asset.parts)||asset.parts.length<1||asset.parts.length>128||
     !Array.isArray(asset.joints)||asset.joints.length!==asset.parts.length||
     !Array.isArray(asset.animations)||asset.animations.length<1||asset.animations.length>16)fail();
  const joints=new Map(),worlds=new Map(),boxes=[],seen=new Set();
  for(const joint of asset.joints){
    if(!joint||joint.id!==joint.childPartId||joints.has(joint.id)||!['omni','x','y','z'].includes(joint.authoringConstraint?.axis))fail();
    joints.set(joint.id,{...joint,c0:matrix(joint.c0),c1:matrix(joint.c1)});
  }
  const root=matrix(asset.rigRoot?.restTransform);
  for(const part of asset.parts){
    const joint=joints.get(part.id),meta=editor.parts?.[part.id];
    if(!joint||!meta||seen.has(part.id)||(boxes.length===0?part.id!==0||joint.parentPartId!==null:!seen.has(joint.parentPartId)))fail();
    const world=matrix(part.restTransform),parent=joint.parentPartId===null?root:worlds.get(joint.parentPartId);
    const bind=parent.clone().multiply(joint.c0).multiply(joint.c1.clone().invert());
    if(bind.elements.some((v,i)=>Math.abs(v-world.elements[i])>1e-5))fail();
    boxes.push({id:part.id,parent:joint.parentPartId,name:part.name,size:part.size,...editorPose(world),
      a:joint.parentPartId===null?null:editorVector(asset.joints.find(j=>j.id===part.id).c0.position),
      b:joint.parentPartId===null?null:editorVector(asset.joints.find(j=>j.id===part.id).c1.position),
      slot:meta.slot,anchor:part.editorAnchor,color:part.baseColor,axis:joint.authoringConstraint.axis,
      ...(meta.normal?{normal:meta.normal}:{})});
    worlds.set(part.id,world);seen.add(part.id);
  }
  const animations=asset.animations.map(animation=>{
    if(!Array.isArray(animation.keyframes)||animation.keyframes.length>60)fail();
    return {id:animation.id,name:animation.name,frames:animation.keyframes.map(frame=>{
      const world=new Map(),pose={};
      for(const box of boxes){
        const joint=joints.get(box.id),parent=box.parent===null?root:world.get(box.parent);
        const m=parent.clone().multiply(joint.c0).multiply(matrix(frame.jointTransforms?.[box.id])).multiply(joint.c1.clone().invert());
        world.set(box.id,m);pose[box.id]=editorPose(m);
      }
      return {time:frame.time,pose};
    })};
  });
  return {name:asset.name,boxes,animations,textureSize:asset.texture.width,nextId:editor.nextId,
    nextAnimationId:editor.nextAnimationId,animation:editor.animation,frame:editor.frame,gridSize:editor.gridSize,
    ...(editor.atlasLayout?.version===0?{}:{atlasLayout:editor.atlasLayout})};
}

export async function projectFileData(file){
  if(file.size>30*1024*1024)throw Error('Project is too large');
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(bytes[0]!==0x50||bytes[1]!==0x4b)return JSON.parse(strFromU8(bytes));
  let total=0,count=0;const names=new Set();
  const files=unzipSync(bytes,{filter:entry=>{
    total+=entry.originalSize;
    if(++count>100||total>64*1024*1024)throw Error('Project ZIP is too large');
    if(!['asset.json','atlas.png','model.cube'].includes(entry.name))return false;
    if(names.has(entry.name))fail();names.add(entry.name);return true;
  }});
  if(!files['asset.json'])fail();
  const asset=JSON.parse(strFromU8(files['asset.json']));
  // Previously exported bundles remain editable through their legacy backup.
  if(asset.format==='cube-studio-asset'&&asset.version===1&&files['model.cube'])return JSON.parse(strFromU8(files['model.cube']));
  const state=stateFromAsset(asset),png=files['atlas.png'];
  if(!png||png.length>18*1024*1024||png.length<24||![137,80,78,71,13,10,26,10].every((v,i)=>png[i]===v))fail();
  const view=new DataView(png.buffer,png.byteOffset,png.byteLength);
  if(view.getUint32(16)!==state.textureSize||view.getUint32(20)!==state.textureSize)fail();
  let binary='';for(let i=0;i<png.length;i+=8192)binary+=String.fromCharCode(...png.subarray(i,i+8192));
  return {format:'cube-studio',version:3,state,atlas:'data:image/png;base64,'+btoa(binary),editor:asset.editor.settings};
}
