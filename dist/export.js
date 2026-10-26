import {godotFiles} from './godot-export.js';
import {robloxAnimationFiles,animationPriority} from './roblox-animation-export.js?v=2';
import {materialDescription,materialFiles,materialFrameFiles,materialChannels} from './material-export.js';
import {AUTO_ATLAS_SIZES,PIXEL_SNAPS} from './pixel-settings.js?v=2';
import {fbxBytes} from './fbx-export.js?v=9';
import * as THREE from './vendor/three.module.js';
import {dimensions,normalizeModel} from './model-ops.js?v=5';
import {validateLayout,legacyLayout} from './atlas-layout.js?v=3';
import {projectFileData} from './asset-project.js?v=7';
import {validatePaintLayer,validMaterialPNG} from './paint-layer.js?v=9';
import {textureUpscales} from './texture-upscale.js?v=2';
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
    editor:{version:1,nextId:state.nextId??Math.max(...state.boxes.map(b=>b.id))+1,nextAnimationId:state.nextAnimationId??Math.max(...animations.map(a=>a.id))+1,animation:state.animation??0,frame:state.frame??0,gridSize:state.gridSize??.25,...(state.pixelDensity?{pixelDensity:state.pixelDensity,snapPixels:state.snapPixels}:{}),atlasLayout:structuredClone(state.atlasLayout||legacyLayout(state.boxes,textureSize)),parts:Object.fromEntries(state.boxes.map(b=>[b.id,{slot:b.slot,...(b.normal?{normal:[...b.normal]}:{})}])),paintFrame:state.paintLayer?.frame??0,settings:structuredClone(settings)},
    coordinates:{handedness:'right',up:'+Y',forward:'-Z',units:'studs',quaternionOrder:'xyzw',rotation:'active-local-to-parent',conversionApplied:true,sourceToAsset:[[-1,0,0],[0,1,0],[0,0,-1]]},
    texture:{file:'atlas.png',width:textureSize,height:textureSize,filter:'nearest',uvOrigin:'bottom-left',imageOrigin:'top-left',colorSpace:'srgb',alphaMode:'blend'},
    ...(materialDescription(state)?{materials:materialDescription(state)}:{}),
    ...(state.paintLayer?{paintLayer:{version:1,name:'Layer 1',blend:'source-over',uvLayout:'base-texture',frames:state.paintLayer.frames.map((f,i)=>({file:f.png?`paint-layer/frame-${i}.png`:null,...(materialDescription(state)?{materialSources:Object.fromEntries(materialChannels.filter(n=>f[n]).map(n=>[n,`paint-layer/frame-${i}-${n}.png`])),materials:materialFrameFiles(state,i)}:{})}))}}:{}),
    rigRoot:{name:'RigRoot',restTransform:transform(rootFrame),anchored:true,visible:false},
    parts:state.boxes.map(b=>({id:b.id,name:b.name||`Cube_${b.id}`,shape:'box',size:[...dimensions(b)],restTransform:transform(matrix(b)),editorAnchor:b.anchor,anchored:false,canCollide:false,massless:true,baseColor:b.color,texture:'atlas.png',mesh:meshData(b,meshes.get(b.id).geometry)})),
    joints:state.boxes.map(b=>{
      const {c0,c1}=binds.get(b.id),axis=b.parent===null?'omni':b.axis||'omni';
      return {id:b.id,name:`Joint_${b.id}`,parentPartId:b.parent,childPartId:b.id,type:'Motor6D',c0:transform(c0),c1:transform(c1),authoringConstraint:{axis,axisSpace:'parent-part-local',axisVector:axis==='omni'?null:vector(...['x','y','z'].map(a=>a===axis?1:0))}};
    }),
    animations:animations.map((a,index)=>({id:a.id??index,name:a.name,loop:a.loop!==false,priority:animationPriority(a),interpolation:'linear-time-quaternion-slerp',keyframes:a.frames.map(f=>({time:f.time,paintFrame:f.paintFrame??0,jointTransforms:Object.fromEntries(state.boxes.map(b=>{
      const {c0,c1}=binds.get(b.id),parent=b.parent===null?rootFrame:matrix(f.pose[b.parent]||byId.get(b.parent));
      return [b.id,transform(c0.clone().invert().multiply(parent.clone().invert()).multiply(matrix(f.pose[b.id]||b)).multiply(c1))];
    }))}))}))
  };
}
export function triggerDownload(data,filename,type){const blob=new Blob([data],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
export function projectData(state,atlas){return {format:'cube-studio',version:3,state:structuredClone(state),atlas:atlas.toDataURL('image/png')};}
export const exportFilename=state=>(state.name?.trim()||'cube-asset').replace(/[<>:\"/\\|?*\x00-\x1f]/g,'-').replace(/[. ]+$/g,'').slice(0,80)||'cube-asset';
export const fbxFilename=state=>exportFilename(state).replace(/\s+/g,'_')+'.fbx';
export function textureEventData(description){
 if(!description.paintLayer?.frames.some(f=>f.file||Object.keys(f.materialSources||{}).length))return null;
 return {version:1,marker:'CuberTexture',timeUnit:'seconds',baseTexture:'atlas.png',blend:'source-over',frames:[...(description.animations.some(a=>a.keyframes.some(f=>f.paintFrame===-1))?[{value:'-1',overlay:null,...(description.materials?{materials:Object.fromEntries(Object.entries(description.materials.channels).map(([n,c])=>[n,c.file]))}:{})}]:[]),...description.paintLayer.frames.map((f,i)=>({value:String(i),overlay:f.file,...(f.materials?{materials:f.materials}:{})}))],animations:description.animations.filter(a=>a.keyframes.length).map(a=>{
  let previous;const events=[];
  for(const f of a.keyframes){const value=String(f.paintFrame??0);if(value!==previous)events.push({time:f.time,value});previous=value;}
  return {id:a.id,name:a.name,initialValue:events[0].value,events};
 })};
}
function bundleGuide(main,texture,hasPaint,hasUpscales,hasMaterials){return `ROBLOX

Choose ${main} to retain every cube joint, or ${main.slice(0,-4)}_fused.fbx to merge sections that never move relative to one another across any clip. Both retain the model and authored motion. Fully static fused models become one mesh.

Import your chosen FBX into Roblox Studio as a mesh model. Keep its orientation and scale. ${texture} is the texture fallback.

Use animations/unfused/ for the original FBX and animations/fused/ for the fused FBX. Each folder has matching .rbxmx KeyframeSequences with timing, pose hierarchy, loop, priority and CuberTexture markers. Run its BindToRig.luau helper once against the imported rig and sequences before publishing. Publish sequences as animation assets and use Animator:LoadAnimation(). No custom motion runtime is needed.
${hasUpscales?'\ntextures/<size>/ provides nearest-neighbor upscales through 1024px. UVs stay unchanged.\n':''}
${hasMaterials?'\nAssign the color atlas to SurfaceAppearance.ColorMap, emissive-mask.png to EmissiveMaskContent (white tint, strength 1.5), and metalness.png to MetalnessMap when present. Set maps in Studio; FBX does not assign these Roblox-specific properties. materials/ contains composited masks for overlay frames.\n':''}
${hasPaint?'\ntexture-events.json lists CuberTexture marker times and frame values. -1 means Base, 0 means the first overlay. Markers are in the .rbxmx files, not the FBXs. Listen with AnimationTrack:GetMarkerReachedSignal("CuberTexture"). Composite each overlay over atlas.png and upload each resulting atlas once; switch TextureID or preconfigured SurfaceAppearance instances. Initialize the first texture at playback start and loop restart.\n':''}

Open the original whole ZIP in Cuber to resume editing; project/ contains its editable data.
`;}
export async function bundleBytes(state,atlas,meshes,settings={},fbxAtlas=atlas){
  state=structuredClone(state);settings=structuredClone(settings);
  const description=assetDescription(state,meshes,atlas.width,settings);
  const encode=canvas=>new Promise((resolve,reject)=>canvas.toBlob(b=>b?b.arrayBuffer().then(resolve,reject):reject(Error('Texture export failed')),'image/png'));
  const [base,preview]=await Promise.all([encode(atlas),fbxAtlas===atlas?null:encode(fbxAtlas)]);
  const png=new Uint8Array(base),fbxPng=preview?new Uint8Array(preview):png;
  const separateTexture=png.length!==fbxPng.length||png.some((v,i)=>v!==fbxPng[i]);
  const textureFilename=separateTexture?'fbx-atlas.png':'atlas.png';
  const main=fbxFilename(state),events=textureEventData(description);
  const textures={
    'atlas.png':png,
    ...(separateTexture?{'fbx-atlas.png':fbxPng}:{}),
    ...Object.fromEntries((state.paintLayer?.frames||[]).flatMap((f,i)=>f.png?[[`paint-layer/frame-${i}.png`,Uint8Array.from(atob(f.png.split(',')[1]),c=>c.charCodeAt(0))]]:[]))
  };
  const masks=materialFiles(state,atlas.width);Object.assign(textures,masks.textures);
  const upscales=textureUpscales(textures,atlas.width);
  const prefix=(folder,files)=>Object.fromEntries(Object.entries(files).map(([name,data])=>[folder+'/'+name,data]));
  const animations=fused=>Object.fromEntries(Object.entries(robloxAnimationFiles(description,{fuseStaticJoints:fused},events)).map(([name,data])=>[name.replace('roblox animations/',''),data]));
  const stem=main.slice(0,-4);
  return zipSync({
    ...prefix('project',{'asset.json':strToU8(JSON.stringify(description,null,2)),...textures,...masks.sources}),
    ...prefix('Roblox',{...textures,...upscales,[main]:fbxBytes(description,fbxPng,{textureFilename,fuseStaticJoints:false}),[stem+'_fused.fbx']:fbxBytes(description,fbxPng,{textureFilename,fuseStaticJoints:true}),
      'README.txt':strToU8(bundleGuide(main,textureFilename,!!events,Object.keys(upscales).length>0,!!description.materials)),
      ...(events?{'texture-events.json':strToU8(JSON.stringify(events,null,2))}:{})}),
    ...prefix('Roblox/animations/unfused',animations(false)),
    ...prefix('Roblox/animations/fused',animations(true)),
    ...godotFiles(description,png,fbxPng,textures,events,stem),
    'README.txt':strToU8('CUBER\n\nOpen this whole ZIP in Cuber to continue editing.\nproject/ preserves editable cubes, paint and keyframes.\nRoblox/ contains unfused and fused FBX files, matching animation folders, textures and import instructions.\nGodot/ contains a self-contained GLB with native animations and import instructions.\n')
  },{level:6});
}
export async function downloadBundle(state,atlas,meshes,settings={},fbxAtlas=atlas){triggerDownload(await bundleBytes(state,atlas,meshes,settings,fbxAtlas),exportFilename(state)+'.zip','application/zip');}
export async function readProject(file){const data=await projectFileData(file),s=data.state;const fail=()=>{throw Error('Invalid Cube Studio project');};if(data.format!=='cube-studio'||![1,2,3].includes(data.version)||!s||!Array.isArray(s.boxes)||s.boxes.length<1||s.boxes.length>128)fail();
const validArray=(a,length)=>Array.isArray(a)&&a.length===length&&a.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<10000);const validQ=q=>validArray(q,4)&&Math.abs(Math.hypot(...q)-1)<.01;const ids=new Set(),slots=new Set();for(let i=0;i<s.boxes.length;i++){const b=s.boxes[i];if(!Number.isInteger(b.id)||b.id<0||ids.has(b.id)||!Number.isInteger(b.slot)||b.slot<0||b.slot>=128||slots.has(b.slot)||!validArray(b.p,3)||!validQ(b.q)||typeof b.anchor!=='boolean'||!/^#[0-9a-f]{6}$/i.test(b.color))fail();if(i===0){if(b.id!==0||b.parent!==null)fail();}else if(!ids.has(b.parent)||!validArray(b.a,3)||!validArray(b.b,3))fail();ids.add(b.id);slots.add(b.slot);if(b.size!==undefined&&(!validArray(b.size,3)||b.size.some(v=>v<1/64||v>12)))fail();if(b.axis!==undefined&&!['omni','x','y','z'].includes(b.axis))fail();if(b.normal!==undefined&&(!validArray(b.normal,3)||b.normal.filter(v=>Math.abs(v)===1).length!==1||b.normal.filter(v=>v===0).length!==2))fail();}
if(s.pixelDensity!==undefined&&(!Number.isFinite(s.pixelDensity)||s.pixelDensity<=0||s.pixelDensity>64||!PIXEL_SNAPS.includes(s.snapPixels)))fail();
if(s.materialMaps!==undefined&&(!s.materialMaps||typeof s.materialMaps!=='object'||materialChannels.some(n=>s.materialMaps[n]!==undefined&&!validMaterialPNG(s.materialMaps[n]))))fail();
if(s.name!==undefined&&(typeof s.name!=='string'||s.name.length>80))fail();
if(!Number.isInteger(s.nextId)||s.nextId<=Math.max(...ids))fail();
const animations=data.version<3?[{id:0,name:'Animation 1',frames:s.frames}]:s.animations;if(!Array.isArray(animations)||!animations.length||animations.length>16)fail();const animationIds=new Set();for(const animation of animations){if(!Number.isInteger(animation.id)||animation.id<0||animationIds.has(animation.id)||typeof animation.name!=='string'||animation.name.length>80||!Array.isArray(animation.frames)||animation.frames.length>60)fail();animationIds.add(animation.id);let prev=-1;for(const f of animation.frames){if(typeof f.time!=='number'||!Number.isFinite(f.time)||f.time<0||f.time>60||f.time<=prev||!f.pose)fail();for(const b of s.boxes)if(!f.pose[b.id]||!validArray(f.pose[b.id].p,3)||!validQ(f.pose[b.id].q))fail();prev=f.time;}if(animation.frames.length&&animation.frames[0].time!==0)fail();}const active=data.version<3?0:s.animation;if(!Number.isInteger(active)||active<0||active>=animations.length||!Number.isInteger(s.frame)||s.frame<0||s.frame>=Math.max(1,animations[active].frames.length))fail();
if(typeof data.atlas!=='string'||!data.atlas.startsWith('data:image/png;base64,')||data.atlas.length>24*1024*1024)fail();const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('Invalid paint texture'));image.src=data.atlas;});if(!AUTO_ATLAS_SIZES.includes(image.width)||image.height!==image.width||(s.textureSize!==undefined&&s.textureSize!==image.width))fail();if(s.atlasLayout!==undefined&&!validateLayout(s.atlasLayout,s.boxes,image.width))fail();const layerImages=[];if(s.paintLayer!==undefined){if(!validatePaintLayer(s.paintLayer))fail();for(const frame of s.paintLayer.frames){if(!frame.png){layerImages.push(null);continue;}const overlay=new Image();await new Promise((resolve,reject)=>{overlay.onload=resolve;overlay.onerror=()=>reject(Error('Invalid paint layer texture'));overlay.src=frame.png;});if(overlay.width!==image.width||overlay.height!==image.height)fail();layerImages.push(overlay);}}for(const png of [...Object.values(s.materialMaps||{}),...(s.paintLayer?.frames||[]).flatMap(f=>materialChannels.map(n=>f[n]))]){if(!png)continue;if(!validMaterialPNG(png))fail();const mask=new Image();await new Promise((resolve,reject)=>{mask.onload=resolve;mask.onerror=()=>reject(Error('Invalid material mask'));mask.src=png;});if(mask.width!==image.width||mask.height!==image.height)fail();}for(const animation of animations)for(const frame of animation.frames)if(frame.paintFrame!==undefined&&(!Number.isInteger(frame.paintFrame)||frame.paintFrame< -1||frame.paintFrame>=(s.paintLayer?.frames.length||1)))fail();s.textureSize=Math.min(image.width,s.pixelDensity?4096:1024);return {state:normalizeModel(s),image,layerImages,editor:data.editor};}
