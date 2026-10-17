import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from '../dist/vendor/three.module.js';
import {robloxAnimationData} from '../dist/roblox-animation-export.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/hank-imported-bones.json',import.meta.url))),source=fixture.source;
const mat=t=>new T.Matrix4().compose(new T.Vector3(...t.position),new T.Quaternion(...t.rotation),new T.Vector3(1,1,1));
const cf=b=>new T.Matrix4().set(...b.rotation[0],b.position[0],...b.rotation[1],b.position[1],...b.rotation[2],b.position[2],0,0,0,1);
const near=(a,b)=>a.elements.forEach((v,i)=>assert.ok(Math.abs(v-b.elements[i])<2e-5,`${i}: ${v} != ${b.elements[i]}`));
const data=robloxAnimationData(source,{fuseStaticJoints:false,importScale:1.5,rootName:'RootPart'}),actual=new Map(fixture.bones.map(b=>[b.name,b]));
assert.equal(data.bones.length,7);assert.equal(data.animations.length,2);
for(const b of data.bones)near(b.restLocal,cf(actual.get(b.name)));
const joints=new Map(source.joints.map(j=>[j.childPartId,j]));
let oldRootError=0;
for(const [ai,animation] of data.animations.entries())for(const [fi,f] of animation.keyframes.entries()){
 const reconstructed=new Map(),rawWorlds=new Map();
 for(const b of data.bones){
  const j=joints.get(b.id),raw=(rawWorlds.get(j.parentPartId)?.clone()??mat(source.rigRoot.restTransform)).multiply(mat(j.c0)).multiply(mat(source.animations[ai].keyframes[fi].jointTransforms[b.id]));
  rawWorlds.set(b.id,raw.clone().multiply(mat(j.c1).invert()));
  // Independent measured import mapping: X/Z opposite, distances 1.5x.
  const expected=raw.clone(),e=expected.elements,sign=[-1,1,-1];
  for(let row=0;row<3;row++)for(let col=0;col<3;col++)e[col*4+row]*=sign[row]*sign[col];
  for(let row=0;row<3;row++)e[12+row]*=sign[row]*1.5;
  const world=(reconstructed.get(b.parent)?.clone()??new T.Matrix4()).multiply(cf(actual.get(b.name))).multiply(f.poses[b.id]);reconstructed.set(b.id,world);near(world,expected);
  if(b.parent===null){const old=cf(actual.get(b.name)).multiply(mat(source.animations[ai].keyframes[fi].jointTransforms[b.id]));oldRootError=Math.max(oldRootError,...old.elements.map((v,i)=>Math.abs(v-expected.elements[i])));}
 }
}
assert.ok(oldRootError>.5,'fixture must catch the previous root-axis error');
console.log('PASS measured imported Hank bone rests; all Picking/Sleeping frames; root and child rotations/translations at 1.5x; old root conversion fails');
