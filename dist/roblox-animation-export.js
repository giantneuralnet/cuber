import * as T from './vendor/three.module.js';
import {fuseStaticAsset} from './fbx-fusion.js';
import {fbxPartName,fbxBoneName} from './rig-names.js';
import {strToU8} from './vendor/fflate.js';

export const animationPriorities={Core:1000,Idle:0,Movement:1,Action:2,Action2:3,Action3:4,Action4:5};
export const animationPriority=a=>Object.hasOwn(animationPriorities,a.priority)?a.priority:'Action';
// Roblox's FBX import expresses each pivot bone in the opposite X/Z basis.
// Apply this to offsets (including the root), not to the FBX rig itself.
const importedBasis=new T.Matrix4().makeScale(-1,1,-1);
export function importedBoneTransform(m,scale=1){
 const result=importedBasis.clone().multiply(m).multiply(importedBasis);
 result.elements[12]*=scale;result.elements[13]*=scale;result.elements[14]*=scale;
 return result;
}
const matrix=t=>new T.Matrix4().compose(new T.Vector3(...t.position),new T.Quaternion(...t.rotation),new T.Vector3(1,1,1));
const xml=s=>String(s).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const prop=(type,name,value)=>`<${type} name="${name}">${xml(value)}</${type}>`;
const number=v=>Math.abs(v)<1e-12?'0':String(v);
function cframe(m){const e=m.elements;return `<CoordinateFrame name="CFrame">${['X','Y','Z','R00','R01','R02','R10','R11','R12','R20','R21','R22'].map((key,i)=>`<${key}>${number(e[[12,13,14,0,4,8,1,5,9,2,6,10][i]])}</${key}>`).join('')}</CoordinateFrame>`;}
const item=(type,properties,children='')=>`<Item class="${type}"><Properties>${properties}</Properties>${children}</Item>`;
const pose=(name,m,children,weight=1)=>item('Pose',prop('string','Name',name)+cframe(m)+prop('float','Weight',weight)+prop('token','EasingStyle',0)+prop('token','EasingDirection',0),children);

// FBX uses pivot bones, not the original cube-local Motor6D basis. Reconstruct
// animated bone worlds, then remove each FBX bone's rest local transform.
export function robloxAnimationData(source,{fuseStaticJoints=true,importScale=1,rootName:importedRootName}={}){
 if(!Number.isFinite(importScale)||importScale<=0)throw Error('Invalid imported animation scale');
 const fused=fuseStaticJoints?fuseStaticAsset(source):{asset:source,staticMesh:false};
 const asset=fused.asset,parts=fused.staticMesh?[]:asset.parts;
 const joints=new Map(asset.joints.map(j=>[j.childPartId,j]));
 const rest=new Map(parts.map(p=>[p.id,matrix(p.restTransform).multiply(matrix(joints.get(p.id).c1))]));
 const bones=parts.map(p=>{const j=joints.get(p.id);return {id:p.id,name:fbxBoneName(p),parent:j.parentPartId,restLocal:importedBoneTransform((rest.get(j.parentPartId)?.clone().invert()??new T.Matrix4()).multiply(rest.get(p.id)),importScale)};});
 const rootName=importedRootName||(fused.staticMesh?(asset.name||'Cuber'):fbxPartName(parts.find(p=>joints.get(p.id).parentPartId===null)));
 return {bones,rootName,staticMesh:fused.staticMesh,animations:asset.animations.map(a=>({...a,priority:animationPriority(a),loop:a.loop!==false,keyframes:a.keyframes.map(f=>{
  const worlds=new Map(),boneWorlds=new Map(),poses={};
  for(const bone of bones){const j=joints.get(bone.id),bw=(worlds.get(j.parentPartId)?.clone()??matrix(asset.rigRoot.restTransform)).multiply(matrix(j.c0)).multiply(matrix(f.jointTransforms[bone.id]));
   boneWorlds.set(bone.id,bw);worlds.set(bone.id,bw.clone().multiply(matrix(j.c1).invert()));
   const importedLocal=importedBoneTransform((boneWorlds.get(j.parentPartId)?.clone().invert()??new T.Matrix4()).multiply(bw),importScale);
   poses[bone.id]=bone.restLocal.clone().invert().multiply(importedLocal);
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
 const restTable=data.bones.map(b=>`[${JSON.stringify(b.name)}] = Vector3.new(${b.restLocal.elements.slice(12,15).join(',')})`).join(',\n');
 files['roblox animations/BindToRig.luau']=strToU8(bindToRig.replace('-- REST_POSITIONS',`local restPositions = {${restTable}}`));
 return files;
}

// Studio-only adapter: imported FBX MeshPart containers can differ across
// importer versions/options. Derive wrappers from the actual imported rig.
const bindToRig=`-- Paste into a ModuleScript in Studio. Call require(module)(rig, animationsFolder).
-- Run once before publishing. This is not a runtime animation player.
return function(rig, animationsFolder)
 -- REST_POSITIONS
 local ratios = {}
 local bones = {}
 for _, object in rig:GetDescendants() do
  if object:IsA("Bone") then
   bones[object.Name] = true
   local expected = restPositions[object.Name]
   if expected and expected.Magnitude > 0.00001 and object.Parent:IsA("Bone") then
    table.insert(ratios, object.CFrame.Position.Magnitude / expected.Magnitude)
   end
  end
 end
 table.sort(ratios)
 local scale = #ratios > 0 and ratios[math.ceil(#ratios/2)] or 1
 for _, value in ratios do assert(math.abs(value-scale)<0.001*math.max(1,scale), "Rig has nonuniform or edited bone spacing") end
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
    if sample then p.CFrame = CFrame.new(p.CFrame.Position * scale) * p.CFrame.Rotation
    else p.CFrame = CFrame.identity; p.Weight = 0 end
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
