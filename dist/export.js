import {fbxBytes} from './fbx-export.js?v=8';
import {robloxImportFiles} from './roblox-import-files.js?v=2';
import * as THREE from './vendor/three.module.js';
import {dimensions,normalizeModel,TEXTURE_SIZES} from './model-ops.js';
import {validateLayout,legacyLayout} from './atlas-layout.js';
import {projectFileData} from './asset-project.js?v=2';
import {validatePaintLayer} from './paint-layer.js';
import {zipSync,strToU8} from './vendor/fflate.js';

const matrix=p=>new THREE.Matrix4().compose(new THREE.Vector3(...p.p),new THREE.Quaternion(...p.q),new THREE.Vector3(1,1,1));
// A proper Y half-turn maps the editor's +Z front to Roblox's -Z front.
// All exported transforms AND local geometry use this same basis, once.
const basis=new THREE.Matrix4().makeScale(-1,1,-1);
const vector=(x,y,z)=>[-x,y,-z];
function transform(m){
  const p=new THREE.Vector3(),q=new THREE.Quaternion(),scale=new THREE.Vector3();
  basis.clone().multiply(m).multiply(basis).decompose(p,q,scale);
  return {position:p.toArray(),rotation:q.normalize().toArray()};
}
function bindFrames(child,parent){
  const c0=new THREE.Matrix4().makeTranslation(...child.a);
  const c1=matrix(child).invert().multiply(matrix(parent)).multiply(c0);
  return {c0,c1};
}
function meshData(box,geometry){
  const p=geometry.attributes.position,n=geometry.attributes.normal,uv=geometry.attributes.uv,size=dimensions(box);
  return {
    positions:Array.from({length:p.count},(_,i)=>vector(p.getX(i)*size[0],p.getY(i)*size[1],p.getZ(i)*size[2])),
    normals:Array.from({length:n.count},(_,i)=>vector(n.getX(i),n.getY(i),n.getZ(i))),
    uvs:Array.from({length:uv.count},(_,i)=>[uv.getX(i),uv.getY(i)]),
    indices:Array.from(geometry.index.array)
  };
}
export function assetDescription(state,meshes,textureSize=state.textureSize,settings={}){
  const root=state.boxes.find(b=>b.parent===null),rootFrame=matrix(root),byId=new Map(state.boxes.map(b=>[b.id,b]));
  const binds=new Map(state.boxes.map(b=>[b.id,b.parent===null?{c0:new THREE.Matrix4(),c1:new THREE.Matrix4()}:bindFrames(b,byId.get(b.parent))]));
  const animations=state.animations||[{id:0,name:'Animation 1',frames:state.frames||[]}];
  return {
    format:'cube-studio-asset',version:2,name:state.name?.trim()||'Cube Asset',
    editor:{version:1,nextId:state.nextId??Math.max(...state.boxes.map(b=>b.id))+1,nextAnimationId:state.nextAnimationId??Math.max(...animations.map(a=>a.id))+1,animation:state.animation??0,frame:state.frame??0,gridSize:state.gridSize??.25,atlasLayout:structuredClone(state.atlasLayout||legacyLayout(state.boxes,textureSize)),parts:Object.fromEntries(state.boxes.map(b=>[b.id,{slot:b.slot,...(b.normal?{normal:[...b.normal]}:{})}])),paintFrame:state.paintLayer?.frame??0,settings:structuredClone(settings)},
    coordinates:{handedness:'right',up:'+Y',forward:'-Z',units:'studs',quaternionOrder:'xyzw',rotation:'active-local-to-parent',conversionApplied:true,sourceToAsset:[[-1,0,0],[0,1,0],[0,0,-1]]},
    texture:{file:'atlas.png',width:textureSize,height:textureSize,filter:'nearest',uvOrigin:'bottom-left',imageOrigin:'top-left',colorSpace:'srgb',alphaMode:'blend'},
    ...(state.paintLayer?{paintLayer:{version:1,name:'Layer 1',blend:'source-over',uvLayout:'base-texture',frames:state.paintLayer.frames.map((f,i)=>({file:f.png?`paint-layer/frame-${i}.png`:null}))}}:{}),
    rigRoot:{name:'RigRoot',restTransform:transform(rootFrame),anchored:true,visible:false},
    parts:state.boxes.map(b=>({id:b.id,name:b.name||`Cube_${b.id}`,shape:'box',size:[...dimensions(b)],restTransform:transform(matrix(b)),editorAnchor:b.anchor,anchored:false,canCollide:false,massless:true,baseColor:b.color,texture:'atlas.png',mesh:meshData(b,meshes.get(b.id).geometry)})),
    joints:state.boxes.map(b=>{
      const {c0,c1}=binds.get(b.id),axis=b.parent===null?'omni':b.axis||'omni';
      return {id:b.id,name:`Joint_${b.id}`,parentPartId:b.parent,childPartId:b.id,type:'Motor6D',c0:transform(c0),c1:transform(c1),authoringConstraint:{axis,axisSpace:'parent-part-local',axisVector:axis==='omni'?null:vector(...['x','y','z'].map(a=>a===axis?1:0))}};
    }),
    animations:animations.map((a,index)=>({id:a.id??index,name:a.name,loop:true,interpolation:'linear-time-quaternion-slerp',keyframes:a.frames.map(f=>({time:f.time,paintFrame:f.paintFrame??0,jointTransforms:Object.fromEntries(state.boxes.map(b=>{
      const {c0,c1}=binds.get(b.id),parent=b.parent===null?rootFrame:matrix(f.pose[b.parent]||byId.get(b.parent));
      return [b.id,transform(c0.clone().invert().multiply(parent.clone().invert()).multiply(matrix(f.pose[b.id]||b)).multiply(c1))];
    }))}))}))
  };
}
export function triggerDownload(data,filename,type){const blob=new Blob([data],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
export function projectData(state,atlas){return {format:'cube-studio',version:3,state:structuredClone(state),atlas:atlas.toDataURL('image/png')};}
export const exportFilename=state=>(state.name?.trim()||'cube-asset').replace(/[<>:\"/\\|?*\x00-\x1f]/g,'-').replace(/[. ]+$/g,'').slice(0,80)||'cube-asset';
const bundleGuide=`CUBER PROJECT / ASSET ZIP v2

model.fbx is a mesh interchange copy with an embedded current-frame PNG. Fuse static joints is enabled by default: parts with identical relative poses throughout the bind pose and every animation are merged, while moving joints and their descendants retain their motion. A fully static asset becomes one textured mesh without bones. Disable fusion in Cuber's File tab to export the original rig. If the current texture layer changes the preview, fbx-atlas.png is its flattened texture; atlas.png remains the editable base. Fusion affects only the FBX; asset.json preserves every editable cube and Motor6D for the native Roblox Part importer. For native Roblox Parts, use the bundled importer and ignore the FBX.

asset.json describes the complete rig and every animation. atlas.png is its one shared texture. Open this same ZIP in Cuber to resume editing. The editor field holds atlas placement and workspace settings; parts, joints and animations are stored only once. This is source data for a Roblox importer, not a model file to insert into Studio. No asset upload or game modification happens during export.

ROBLOX IMPORT: USE PARTS, NOT MESHES
Start with ROBLOX-IMPORT.md and the scripts in roblox/. The bundled preparer and native-Part importer read this asset directly. They include no game-specific behavior or image IDs.
Create one native Roblox Part with Shape = Enum.PartType.Block for each entry in parts. Set its Size from size and its CFrame from restTransform, and connect the Parts using the supplied Motor6D joints. Do not create MeshParts or SpecialMeshes, combine the boxes into a mesh, or use FBX/OBJ mesh import. The mesh field is reference geometry and face texture-coordinate data only; it is not an instruction to create a Roblox mesh.

COORDINATES
All asset.json geometry and transforms are already in right-handed Roblox coordinates: +Y up, -Z forward, studs. The author's +Z front is converted with a proper 180-degree Y rotation. Do not convert again. Cuber converts these back when opening the ZIP. The editor atlas layout and surface normals use editor coordinates.
A transform is {position:[x,y,z],rotation:[x,y,z,w]}; rotation is a normalized quaternion, not Euler angles. Part restTransform and rigRoot.restTransform are world transforms. Compose translation * quaternion rotation, with unit scale.

PARTS AND TEXTURE
Each part has a stable numeric id, box dimensions, rest pose, and reference geometry. Use size for the Roblox Part dimensions. All parts share atlas.png. Use the reference normals and UVs to locate and orient each face's painted region, then display the artwork on the native Part faces using a Part-compatible face-image approach. Native Parts do not accept arbitrary mesh UVs; do not switch to MeshParts to apply the atlas. Preserve pixel art with nearest-neighbor filtering where supported. baseColor is the original authoring swatch, not an additional tint to multiply over the already painted atlas.
Reference positions already include the part's size; do not multiply them by size again. indices are zero-based counterclockwise triangle vertex indices. positions, normals, and uvs have matching indices. UVs use a bottom-left origin, while the PNG has its usual top-left image origin.

JOINTS
Create rigRoot as an invisible anchored Roblox Part, then all block Parts and Motor6Ds. parentPartId:null refers to rigRoot. Other parentPartId and childPartId values refer to part ids. c0 and c1 are the two part-local bind frames. The equation is:
childWorld = parentWorld * c0 * jointTransform * inverse(c1)
At rest, jointTransform is identity. Joint ids match their child part ids. Constraint axes and signed axisVector values are parent-part-local authoring metadata, not physical Motor6D limits. Animated poses already include these constraints. editorAnchor is an authoring pin; animated parts remain unanchored and non-colliding.

PAINT LAYER
The optional paintLayer is one transparent animated overlay above atlas.png. Each PNG uses the exact same dimensions and UV layout as the base. Null file means a fully transparent frame. Use source-over alpha composition, nearest filtering, and select the zero-based paintFrame referenced by each animation keyframe. Hold that texture until the next pose keyframe; there is no separate texture clock. Keep overlays separate when importing to Roblox; do not replace or tint the base atlas.

ANIMATIONS
Every animation row is separate. Empty keyframes means an unanimated row; use the rig rest pose. The editor settings are optional for Roblox import. Keyframe time is in seconds. jointTransforms maps each joint id to its local animation transform, including the joint from rigRoot to the first cube. Build nested poses using joint hierarchy and part names. Slerp rotations and linearly interpolate translations between keyframes. These poses belong to this exact rig; another rig needs retargeting. Creating the Roblox Part rig and uploading texture and animation assets is a later import step; no mesh assets are needed.
`;
export async function bundleBytes(state,atlas,meshes,settings={},fbxAtlas=atlas){
  state=structuredClone(state);settings=structuredClone(settings);
  const description=assetDescription(state,meshes,atlas.width,settings);
  const encode=canvas=>new Promise((resolve,reject)=>canvas.toBlob(b=>b?b.arrayBuffer().then(resolve,reject):reject(Error('Texture export failed')),'image/png'));
  const [base,preview]=await Promise.all([encode(atlas),fbxAtlas===atlas?null:encode(fbxAtlas)]);
  const png=new Uint8Array(base),fbxPng=preview?new Uint8Array(preview):png;
  const separateTexture=png.length!==fbxPng.length||png.some((v,i)=>v!==fbxPng[i]);
  const textureFilename=separateTexture?'fbx-atlas.png':'atlas.png';
  return zipSync({
    'asset.json':strToU8(JSON.stringify(description,null,2)),
    'atlas.png':png,
    'model.fbx':fbxBytes(description,fbxPng,{textureFilename,fuseStaticJoints:settings.fuseStaticJoints!==false}),
    ...(separateTexture?{'fbx-atlas.png':fbxPng}:{}),
    'README.txt':strToU8(bundleGuide),
    ...Object.fromEntries(Object.entries(robloxImportFiles).map(([name,text])=>[name,strToU8(text)])),
    ...Object.fromEntries((state.paintLayer?.frames||[]).flatMap((f,i)=>f.png?[[`paint-layer/frame-${i}.png`,Uint8Array.from(atob(f.png.split(',')[1]),c=>c.charCodeAt(0))]]:[]))
  },{level:6});
}
export async function downloadBundle(state,atlas,meshes,settings={},fbxAtlas=atlas){triggerDownload(await bundleBytes(state,atlas,meshes,settings,fbxAtlas),exportFilename(state)+'.zip','application/zip');}
export async function readProject(file){const data=await projectFileData(file),s=data.state;const fail=()=>{throw Error('Invalid Cube Studio project');};if(data.format!=='cube-studio'||![1,2,3].includes(data.version)||!s||!Array.isArray(s.boxes)||s.boxes.length<1||s.boxes.length>128)fail();
const validArray=(a,length)=>Array.isArray(a)&&a.length===length&&a.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<10000);const validQ=q=>validArray(q,4)&&Math.abs(Math.hypot(...q)-1)<.01;const ids=new Set(),slots=new Set();for(let i=0;i<s.boxes.length;i++){const b=s.boxes[i];if(!Number.isInteger(b.id)||b.id<0||ids.has(b.id)||!Number.isInteger(b.slot)||b.slot<0||b.slot>=128||slots.has(b.slot)||!validArray(b.p,3)||!validQ(b.q)||typeof b.anchor!=='boolean'||!/^#[0-9a-f]{6}$/i.test(b.color))fail();if(i===0){if(b.id!==0||b.parent!==null)fail();}else if(!ids.has(b.parent)||!validArray(b.a,3)||!validArray(b.b,3))fail();ids.add(b.id);slots.add(b.slot);if(b.size!==undefined&&(!validArray(b.size,3)||b.size.some(v=>v<.2||v>12)))fail();if(b.axis!==undefined&&!['omni','x','y','z'].includes(b.axis))fail();if(b.normal!==undefined&&(!validArray(b.normal,3)||b.normal.filter(v=>Math.abs(v)===1).length!==1||b.normal.filter(v=>v===0).length!==2))fail();}
if(s.name!==undefined&&(typeof s.name!=='string'||s.name.length>80))fail();
if(!Number.isInteger(s.nextId)||s.nextId<=Math.max(...ids))fail();
const animations=data.version<3?[{id:0,name:'Animation 1',frames:s.frames}]:s.animations;if(!Array.isArray(animations)||!animations.length||animations.length>16)fail();const animationIds=new Set();for(const animation of animations){if(!Number.isInteger(animation.id)||animation.id<0||animationIds.has(animation.id)||typeof animation.name!=='string'||animation.name.length>80||!Array.isArray(animation.frames)||animation.frames.length>60)fail();animationIds.add(animation.id);let prev=-1;for(const f of animation.frames){if(typeof f.time!=='number'||!Number.isFinite(f.time)||f.time<0||f.time>60||f.time<=prev||!f.pose)fail();for(const b of s.boxes)if(!f.pose[b.id]||!validArray(f.pose[b.id].p,3)||!validQ(f.pose[b.id].q))fail();prev=f.time;}if(animation.frames.length&&animation.frames[0].time!==0)fail();}const active=data.version<3?0:s.animation;if(!Number.isInteger(active)||active<0||active>=animations.length||!Number.isInteger(s.frame)||s.frame<0||s.frame>=Math.max(1,animations[active].frames.length))fail();
if(typeof data.atlas!=='string'||!data.atlas.startsWith('data:image/png;base64,')||data.atlas.length>24*1024*1024)fail();const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('Invalid paint texture'));image.src=data.atlas;});if(![...TEXTURE_SIZES,2048,4096].includes(image.width)||image.height!==image.width||(s.textureSize!==undefined&&s.textureSize!==image.width))fail();if(s.atlasLayout!==undefined&&!validateLayout(s.atlasLayout,s.boxes,image.width))fail();const layerImages=[];if(s.paintLayer!==undefined){if(!validatePaintLayer(s.paintLayer))fail();for(const frame of s.paintLayer.frames){if(!frame.png){layerImages.push(null);continue;}const overlay=new Image();await new Promise((resolve,reject)=>{overlay.onload=resolve;overlay.onerror=()=>reject(Error('Invalid paint layer texture'));overlay.src=frame.png;});if(overlay.width!==image.width||overlay.height!==image.height)fail();layerImages.push(overlay);}}for(const animation of animations)for(const frame of animation.frames)if(frame.paintFrame!==undefined&&(!Number.isInteger(frame.paintFrame)||frame.paintFrame<0||frame.paintFrame>=(s.paintLayer?.frames.length||1)))fail();s.textureSize=Math.min(image.width,1024);return {state:normalizeModel(s),image,layerImages,editor:data.editor};}
