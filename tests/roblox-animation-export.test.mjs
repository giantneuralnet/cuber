import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import * as T from '../dist/vendor/three.module.js';
import {assetDescription,textureEventData,bundleBytes,readProject} from '../dist/export.js';
import {robloxAnimationData,robloxAnimationFiles} from '../dist/roblox-animation-export.js';
import {fuseStaticAsset} from '../dist/fbx-fusion.js';
const mat=t=>new T.Matrix4().compose(new T.Vector3(...t.position),new T.Quaternion(...t.rotation),new T.Vector3(1,1,1));
const near=(a,b)=>a.elements.forEach((v,i)=>assert.ok(Math.abs(v-b.elements[i])<1e-7,`${i}: ${v} != ${b.elements[i]}`));
const boxes=[
 {id:0,slot:0,name:'Frame & root',parent:null,p:[0,1,0],q:[0,0,0,1],size:[1,2,.2],anchor:true,color:'#ffffff'},
 {id:1,slot:1,name:'Rigid',parent:0,a:[1,0,0],b:[0,0,0],p:[1,1,0],q:[0,0,0,1],size:[.2,2,.2],anchor:false,color:'#ffffff'},
 {id:2,slot:2,name:'Door',parent:1,a:[0,0,.1],b:[-.5,0,0],p:[1.5,1,.1],q:[0,0,0,1],size:[1,2,.1],anchor:false,color:'#ffffff'}];
function doorPose(angle){const q=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),angle);return Object.fromEntries(boxes.map(b=>[b.id,b.id===2?{p:new T.Vector3(1,1,.1).sub(new T.Vector3(-.5,0,0).applyQuaternion(q)).toArray(),q:q.toArray()}:{p:b.p,q:b.q}]));}
const state={name:'Test rig',boxes,textureSize:128,animations:[{id:0,name:'Closed',frames:[{time:0,pose:doorPose(0)}]},...[1,-1].map((sign,i)=>({id:i+1,name:'Open',frames:Array.from({length:13},(_,k)=>({time:k/12*.8,pose:doorPose(sign*k/12*Math.PI/2)}))}))]};
state.animations[1].loop=false;state.animations[1].priority='Action3';state.animations[2].name='Open/Forward';state.animations[1].name='Open:Forward';
state.paintLayer={frame:0,frames:[{png:'data:image/png;base64,AA=='}]};
state.animations[1].frames.forEach((f,i)=>f.paintFrame=i<4?-1:i<9?0:-1);
const asset=assetDescription(state,new Map(state.boxes.map(b=>[b.id,{geometry:new T.BoxGeometry()}])),state.textureSize);
// Non-identity rest rotation exercises pivot-bone vs cube transforms.
for(const p of asset.parts)p.restTransform.rotation=new T.Quaternion().setFromEuler(new T.Euler(.2,.3,.1)).toArray();
for(const setting of [false,true]){
 const rig=setting?fuseStaticAsset(asset).asset:asset,data=robloxAnimationData(asset,{fuseStaticJoints:setting});
 const joints=new Map(rig.joints.map(j=>[j.childPartId,j]));
 for(const [ai,a] of data.animations.entries())for(const [fi,f] of a.keyframes.entries()){
  const actual=new Map(),expectedParts=new Map();
  for(const bone of data.bones){const j=joints.get(bone.id),expected=(expectedParts.get(j.parentPartId)?.clone()??mat(rig.rigRoot.restTransform)).multiply(mat(j.c0)).multiply(mat(rig.animations[ai].keyframes[fi].jointTransforms[bone.id]));
   expectedParts.set(bone.id,expected.clone().multiply(mat(j.c1).invert()));
   const reconstructed=(actual.get(bone.parent)?.clone()??new T.Matrix4()).multiply(bone.restLocal).multiply(f.poses[bone.id]);actual.set(bone.id,reconstructed);const basis=new T.Matrix4().makeScale(-1,1,-1);near(reconstructed,basis.clone().multiply(expected).multiply(basis));
  }
 }
}
const files=robloxAnimationFiles(asset,{fuseStaticJoints:true},textureEventData(asset)),dir=mkdtempSync(join(tmpdir(),'cuber-rbx-'));
assert.ok(files['roblox animations/Open_Forward.rbxmx']);assert.ok(files['roblox animations/Open_Forward_2.rbxmx']);
for(const [name,bytes] of Object.entries(files))if(name.endsWith('.rbxmx'))writeFileSync(join(dir,name.split('/').at(-1)),bytes);
const check=execFileSync('python3',['-c',`
import xml.etree.ElementTree as ET, pathlib,sys
p=pathlib.Path(sys.argv[1]);r=ET.parse(p/'Open_Forward.rbxmx').getroot();seq=r.find('Item');assert seq.attrib['class']=='KeyframeSequence'
props={x.attrib['name']:x.text for x in seq.find('Properties')};assert props['Loop']=='false';assert props['Priority']=='4'
frames=seq.findall('Item');assert len(frames)==13
markers=[]
for frame in frames:
 time=float(frame.find("Properties/float[@name='Time']").text)
 for marker in frame.findall("Item[@class='KeyframeMarker']"):
  assert marker.find("Properties/string[@name='Name']").text=='CuberTexture'
  markers.append((time,marker.find("Properties/string[@name='Value']").text))
 poses=frame.findall(".//Item[@class='Pose']")
 assert len(poses)==3 # wrapper + fused frame root + moving door
 for pose in poses: assert len(pose.find("Properties/CoordinateFrame"))==12
assert [v for t,v in markers]==['-1','0','-1']
assert abs(markers[1][0]-(4/12*.8))<1e-9
for f in p.glob('*.rbxmx'): ET.parse(f)
print('PASS independent XML parse: hierarchy, timing, markers, loop, priority, names')
`,dir],{encoding:'utf8'});console.log(check.trim());
const escaped=structuredClone(asset);escaped.animations[0].name='A < B & "C"';assert.ok(new TextDecoder().decode(Object.values(robloxAnimationFiles(escaped))[0]).includes('A &lt; B &amp; &quot;C&quot;'));
const staticAsset=structuredClone(asset);for(const a of staticAsset.animations)for(const f of a.keyframes)for(const id in f.jointTransforms)f.jointTransforms[id]={position:[0,0,0],rotation:[0,0,0,1]};assert.equal(robloxAnimationData(staticAsset).bones.length,0);
console.log('PASS rest-relative bone reconstruction with fusion on/off, static models, escaping and duplicate filenames');
