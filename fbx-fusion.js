import * as T from './vendor/three.module.js';

const matrix=t=>new T.Matrix4().compose(new T.Vector3(...t.position),new T.Quaternion(...t.rotation),new T.Vector3(1,1,1));
const transform=m=>{const p=new T.Vector3(),q=new T.Quaternion(),s=new T.Vector3();m.decompose(p,q,s);return {position:p.toArray(),rotation:q.normalize().toArray()};};
const identity=t=>!t||(t.position.every(v=>Math.abs(v)<1e-7)&&t.rotation.slice(0,3).every(v=>Math.abs(v)<1e-7)&&Math.abs(Math.abs(t.rotation[3])-1)<1e-7);

// The bind pose is part of the comparison too. A constant posed offset that
// differs from the bind pose needs its joint to reproduce both correctly.
// Only local transforms matter: a rigid child can travel with a moving parent.
export function fuseStaticAsset(source){
 const frames=(source.animations||[]).flatMap(a=>a.keyframes||[]);
 const fixed=new Map(source.joints.map(j=>[j.childPartId,frames.every(f=>identity(f.jointTransforms[j.childPartId]))]));
 const joints=new Map(source.joints.map(j=>[j.childPartId,j])),partsById=new Map(source.parts.map(p=>[p.id,p]));
 const owners=new Map(),groups=new Map(),parts=[],newJoints=[];
 for(const part of source.parts){
  const joint=joints.get(part.id),parent=joint.parentPartId;
  const owner=parent!==null&&fixed.get(part.id)?owners.get(parent):part.id;
  owners.set(part.id,owner);
  if(!groups.has(owner)){
   const merged={...part,mesh:{positions:[],normals:[],uvs:[],indices:[]}};
   groups.set(owner,merged);parts.push(merged);
   const parentOwner=parent===null?null:owners.get(parent);
   const c0=parentOwner===parent?joint.c0:transform(matrix(partsById.get(parentOwner).restTransform).invert().multiply(matrix(partsById.get(parent).restTransform)).multiply(matrix(joint.c0)));
   newJoints.push({...joint,parentPartId:parentOwner,c0});
  }
  const group=groups.get(owner),mesh=group.mesh,offset=mesh.positions.length;
  const local=matrix(group.restTransform).invert().multiply(matrix(part.restTransform));
  mesh.positions.push(...part.mesh.positions.map(p=>new T.Vector3(...p).applyMatrix4(local).toArray()));
  mesh.normals.push(...part.mesh.normals.map(n=>new T.Vector3(...n).transformDirection(local).toArray()));
  mesh.uvs.push(...part.mesh.uvs.map(uv=>[...uv]));mesh.indices.push(...part.mesh.indices.map(i=>i+offset));
 }
 const animations=(source.animations||[]).map(a=>({...a,keyframes:a.keyframes.map(f=>({...f,jointTransforms:Object.fromEntries(parts.map(p=>[p.id,f.jointTransforms[p.id]]))}))}));
 return {asset:{...source,parts,joints:newJoints,animations},staticMesh:source.joints.every(j=>fixed.get(j.childPartId))};
}
