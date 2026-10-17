import * as T from './vendor/three.module.js';
import {fuseStaticAsset} from './fbx-fusion.js';
import {fbxPartName,fbxBoneName} from './rig-names.js';
import {strToU8} from './vendor/fflate.js';

export const animationPriorities={Core:1000,Idle:0,Movement:1,Action:2,Action2:3,Action3:4,Action4:5};
export const animationPriority=a=>Object.hasOwn(animationPriorities,a.priority)?a.priority:'Action';
const matrix=t=>new T.Matrix4().compose(new T.Vector3(...t.position),new T.Quaternion(...t.rotation),new T.Vector3(1,1,1));
const xml=s=>String(s).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const prop=(type,name,value)=>`<${type} name="${name}">${xml(value)}</${type}>`;
const number=v=>Math.abs(v)<1e-12?'0':String(v);
function cframe(m){const e=m.elements;return `<CoordinateFrame name="CFrame">${['X','Y','Z','R00','R01','R02','R10','R11','R12','R20','R21','R22'].map((key,i)=>`<${key}>${number(e[[12,13,14,0,4,8,1,5,9,2,6,10][i]])}</${key}>`).join('')}</CoordinateFrame>`;}
const item=(type,properties,children='')=>`<Item class="${type}"><Properties>${properties}</Properties>${children}</Item>`;
const pose=(name,m,children,weight=1)=>item('Pose',prop('string','Name',name)+cframe(m)+prop('float','Weight',weight)+prop('token','EasingStyle',0)+prop('token','EasingDirection',0),children);

// FBX uses pivot bones, not the original cube-local Motor6D basis. Reconstruct
// animated bone worlds, then remove each FBX bone's rest local transform.
export function robloxAnimationData(source,{fuseStaticJoints=true}={}){
 const fused=fuseStaticJoints?fuseStaticAsset(source):{asset:source,staticMesh:false};
 const asset=fused.asset,parts=fused.staticMesh?[]:asset.parts;
 const joints=new Map(asset.joints.map(j=>[j.childPartId,j]));
 const rest=new Map(parts.map(p=>[p.id,matrix(p.restTransform).multiply(matrix(joints.get(p.id).c1))]));
 const bones=parts.map(p=>{const j=joints.get(p.id);return {id:p.id,name:fbxBoneName(p),parent:j.parentPartId,restLocal:(rest.get(j.parentPartId)?.clone().invert()??new T.Matrix4()).multiply(rest.get(p.id))};});
 const rootName=fused.staticMesh?(asset.name||'Cuber'):fbxPartName(parts.find(p=>joints.get(p.id).parentPartId===null));
 return {bones,rootName,staticMesh:fused.staticMesh,animations:asset.animations.map(a=>({...a,priority:animationPriority(a),loop:a.loop!==false,keyframes:a.keyframes.map(f=>{
  const worlds=new Map(),boneWorlds=new Map(),poses={};
  for(const bone of bones){const j=joints.get(bone.id),bw=(worlds.get(j.parentPartId)?.clone()??matrix(asset.rigRoot.restTransform)).multiply(matrix(j.c0)).multiply(matrix(f.jointTransforms[bone.id]));
   boneWorlds.set(bone.id,bw);worlds.set(bone.id,bw.clone().multiply(matrix(j.c1).invert()));
   poses[bone.id]=bone.restLocal.clone().invert().multiply((boneWorlds.get(j.parentPartId)?.clone().invert()??new T.Matrix4()).multiply(bw));
  }
  return {...f,poses};
 })}))};
}
export function robloxAnimationFiles(source,settings={},events=null){
 const data=robloxAnimationData(source,settings),files={},used=new Set();
 for(const [index,a] of data.animations.entries()){
  let stem=(a.name||`Animation_${index+1}`).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/\s+/g,'_').replace(/[. ]+$/g,'').slice(0,80)||'Animation';
  const base=stem;let suffix=2;while(used.has(stem.toLowerCase()))stem=`${base}_${suffix++}`;used.add(stem.toLowerCase());
  const markers=events?.animations.find(e=>e.id===a.id)?.events||[];
  const frames=a.keyframes.map((f,index)=>{
   const branch=parent=>data.bones.filter(b=>b.parent===parent).map(b=>pose(b.name,f.poses[b.id],branch(b.id))).join('');
   const markerXML=markers.filter(e=>e.time===f.time).map(e=>item('KeyframeMarker',prop('string','Name','CuberTexture')+prop('string','Value',e.value))).join('');
   return item('Keyframe',prop('string','Name',`Keyframe_${index}`)+prop('float','Time',f.time),pose(data.rootName,new T.Matrix4(),branch(null),0)+markerXML);
  }).join('');
  files[`roblox animations/${stem}.rbxmx`]=strToU8(`<roblox version="4">${item('KeyframeSequence',prop('string','Name',a.name)+prop('bool','Loop',a.loop)+prop('token','Priority',animationPriorities[a.priority]),frames)}</roblox>`);
 }
 files['roblox animations/BindToRig.luau']=strToU8(bindToRig);
 return files;
}

// Studio-only adapter: imported FBX MeshPart containers can differ across
// importer versions/options. Derive wrappers from the actual imported rig.
const bindToRig=`-- Paste into a ModuleScript in Studio. Call require(module)(rig, animationsFolder).
-- Run once before publishing. This is not a runtime animation player.
return function(rig, animationsFolder)
 local bones = {}
 for _, object in rig:GetDescendants() do
  if object:IsA("Bone") then bones[object.Name] = true end
 end
 local result = Instance.new("Folder")
 result.Name = "Roblox Animations"
 for _, sequence in animationsFolder:GetChildren() do
  if not sequence:IsA("KeyframeSequence") then continue end
  local copy = sequence:Clone()
  for _, keyframe in copy:GetKeyframes() do
   local source = {}
   for _, object in keyframe:GetDescendants() do
    if object:IsA("Pose") and object.Name:sub(1,6) == "Joint_" then
     assert(bones[object.Name], "Missing imported bone: " .. object.Name)
     source[object.Name] = object:Clone()
    end
   end
   for _, old in keyframe:GetPoses() do old:Destroy() end
   local made = {}
   local function ensure(object)
    if made[object] then return made[object] end
    local parent = object.Parent
    local parentPose = keyframe
    while parent and parent ~= rig do
     if parent:IsA("Bone") or parent:IsA("BasePart") then parentPose = ensure(parent); break end
     parent = parent.Parent
    end
    local sample = object:IsA("Bone") and source[object.Name]
    local p = sample and sample:Clone() or Instance.new("Pose")
    for _, child in p:GetChildren() do child:Destroy() end
    p.Name = object.Name
    if not sample then p.CFrame = CFrame.identity; p.Weight = 0 end
    p.Parent = parentPose
    made[object] = p
    return p
   end
   for _, object in rig:GetDescendants() do
    if object:IsA("Bone") and source[object.Name] then ensure(object) end
   end
   for _, sample in source do sample:Destroy() end
  end
  copy.Parent = result
 end
 result.Parent = animationsFolder.Parent
 return result
end
`;
