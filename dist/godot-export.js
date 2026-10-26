import * as T from './vendor/three.module.js';
import {fuseStaticAsset} from './fbx-fusion.js';
import {decodeTexturePNG,encodeTexturePNG} from './texture-upscale.js';
import {strToU8} from './vendor/fflate.js';
const mat=t=>new T.Matrix4().compose(new T.Vector3(...t.position),new T.Quaternion(...t.rotation),new T.Vector3(1,1,1));
const trs=m=>{const p=new T.Vector3(),q=new T.Quaternion(),s=new T.Vector3();m.decompose(p,q,s);return {translation:p.toArray(),rotation:q.normalize().toArray()};};
const combine=arrays=>{const out=new Uint8Array(arrays.reduce((n,a)=>n+a.length,0));let at=0;for(const a of arrays){out.set(a,at);at+=a.length;}return out;};
export function compositeColor(base,overlay){const a=decodeTexturePNG(base);if(!overlay)return base;const b=decodeTexturePNG(overlay);if(a.width!==b.width||a.height!==b.height)throw Error('Overlay size mismatch');for(let i=0;i<a.pixels.length;i+=4){const x=a.pixels[i+3]/255,y=b.pixels[i+3]/255,z=y+x*(1-y);for(let k=0;k<3;k++)a.pixels[i+k]=z?Math.round((b.pixels[i+k]*y+a.pixels[i+k]*x*(1-y))/z):0;a.pixels[i+3]=Math.round(z*255);}return encodeTexturePNG(a);}
export function pbrTextures(color,emission,metalness){const c=decodeTexturePNG(color),result={};if(emission){const e=decodeTexturePNG(emission);for(let i=0;i<e.pixels.length;i+=4){const mask=e.pixels[i]/255;for(let k=0;k<3;k++)e.pixels[i+k]=Math.round(c.pixels[i+k]*Math.pow(mask,1/2.2));e.pixels[i+3]=255;}result.emission=encodeTexturePNG(e);}if(metalness){const m=decodeTexturePNG(metalness);for(let i=0;i<m.pixels.length;i+=4){const v=m.pixels[i];m.pixels.set([255,Math.round(255-v*.7),v,255],i);}result.orm=encodeTexturePNG(m);}return result;}
// Right-handed Y-up, -Z front. One Cuber unit becomes one Godot unit.
// Vertices are baked into bind-world space and rigidly weighted to pivot bones.
export function glbBytes(source,png,maps={}){
 const asset=fuseStaticAsset(source).asset,parts=asset.parts,joints=new Map(asset.joints.map(j=>[j.childPartId,j]));
 const g={asset:{version:'2.0',generator:'Cuber'},scene:0,scenes:[{nodes:[0]}],nodes:[{name:'Cuber',children:[]}],meshes:[],skins:[],animations:[],buffers:[{byteLength:0}],bufferViews:[],accessors:[],images:[],textures:[],samplers:[{magFilter:9728,minFilter:9728,wrapS:33071,wrapT:33071}],materials:[]};
 const chunks=[];let length=0;
 function view(bytes,target){const pad=(4-length%4)%4;if(pad){chunks.push(new Uint8Array(pad));length+=pad;}const id=g.bufferViews.length;g.bufferViews.push({buffer:0,byteOffset:length,byteLength:bytes.length,...(target?{target}:{})});chunks.push(bytes);length+=bytes.length;return id;}
 function accessor(values,type,width,integer=false,target){const arr=integer?new Uint16Array(values):new Float32Array(values);const a={bufferView:view(new Uint8Array(arr.buffer),target),componentType:integer?5123:5126,count:values.length/width,type};if(type==='VEC3'||type==='SCALAR'){a.min=Array.from({length:width},(_,i)=>Math.min(...Array.from(arr).filter((_,j)=>j%width===i)));a.max=Array.from({length:width},(_,i)=>Math.max(...Array.from(arr).filter((_,j)=>j%width===i)));}g.accessors.push(a);return g.accessors.length-1;}
 function texture(bytes){const image=g.images.length;g.images.push({bufferView:view(bytes),mimeType:'image/png'});g.textures.push({source:image,sampler:0});return {index:g.textures.length-1};}
 const pixels=decodeTexturePNG(png).pixels;let clear=false,partial=false;for(let i=3;i<pixels.length;i+=4){clear||=pixels[i]===0;partial||=pixels[i]>0&&pixels[i]<255;}
 const material={name:'CuberAtlas',pbrMetallicRoughness:{baseColorTexture:texture(png),metallicFactor:maps.orm?1:0,roughnessFactor:1},alphaMode:partial?'BLEND':clear?'MASK':'OPAQUE',...(clear&&!partial?{alphaCutoff:.5}:{}),doubleSided:clear||partial};
 if(maps.emission){material.emissiveTexture=texture(maps.emission);material.emissiveFactor=[1,1,1];material.extensions={KHR_materials_emissive_strength:{emissiveStrength:1.5}};g.extensionsUsed=['KHR_materials_emissive_strength'];}if(maps.orm)material.pbrMetallicRoughness.metallicRoughnessTexture=texture(maps.orm);g.materials.push(material);
 const nodeIds=new Map(),worlds=new Map();
 for(const p of parts){const j=joints.get(p.id),w=mat(p.restTransform).multiply(mat(j.c1)),parent=worlds.get(j.parentPartId),local=parent?parent.clone().invert().multiply(w):w;worlds.set(p.id,w);const id=g.nodes.length;nodeIds.set(p.id,id);g.nodes.push({name:`Bone_${p.id}`,children:[],...trs(local)});g.nodes[parent?nodeIds.get(j.parentPartId):0].children.push(id);}
 const ibm=parts.flatMap(p=>worlds.get(p.id).clone().invert().toArray());g.skins.push({joints:parts.map(p=>nodeIds.get(p.id)),inverseBindMatrices:accessor(ibm,'MAT4',16),skeleton:nodeIds.get(parts[0].id)});
 // All fused sections share one skinned mesh and material, reducing draw calls.
 const pos=[],norm=[],uv=[],ind=[],weights=[],bone=[];
 parts.forEach((p,j)=>{const w=mat(p.restTransform),offset=pos.length/3;for(let i=0;i<p.mesh.positions.length;i++){pos.push(...new T.Vector3(...p.mesh.positions[i]).applyMatrix4(w).toArray());norm.push(...new T.Vector3(...p.mesh.normals[i]).transformDirection(w).toArray());uv.push(p.mesh.uvs[i][0],1-p.mesh.uvs[i][1]);weights.push(1,0,0,0);bone.push(j,0,0,0);}ind.push(...p.mesh.indices.map(i=>i+offset));});
 g.meshes.push({name:asset.name,primitives:[{attributes:{POSITION:accessor(pos,'VEC3',3,false,34962),NORMAL:accessor(norm,'VEC3',3,false,34962),TEXCOORD_0:accessor(uv,'VEC2',2,false,34962),JOINTS_0:accessor(bone,'VEC4',4,true,34962),WEIGHTS_0:accessor(weights,'VEC4',4,false,34962)},indices:accessor(ind,'SCALAR',1,true,34963),material:0}]});g.scenes[0].nodes.push(g.nodes.length);g.nodes.push({name:'Model',mesh:0,skin:0});
 for(const [index,a] of (asset.animations||[]).entries()){const frames=a.keyframes;if(!frames.length)continue;const end=frames.at(-1).time,times=[...new Set([...frames.map(f=>f.time),...Array.from({length:Math.ceil(end*30)},(_,i)=>i/30),end])].sort((a,b)=>a-b),samples=new Map(parts.map(p=>[p.id,[]]));
  for(const time of times){let i=0;while(i<frames.length-1&&frames[i+1].time<=time)i++;const a=frames[i],b=frames[Math.min(i+1,frames.length-1)],alpha=b.time===a.time?0:(time-a.time)/(b.time-a.time),world=new Map(),bw=new Map();for(const p of parts){const j=joints.get(p.id),ta=a.jointTransforms[p.id],tb=b.jointTransforms[p.id],delta=mat({position:new T.Vector3(...ta.position).lerp(new T.Vector3(...tb.position),alpha).toArray(),rotation:new T.Quaternion(...ta.rotation).slerp(new T.Quaternion(...tb.rotation),alpha).toArray()}),w=(world.get(j.parentPartId)?.clone()??mat(asset.rigRoot.restTransform)).multiply(mat(j.c0)).multiply(delta);bw.set(p.id,w);world.set(p.id,w.clone().multiply(mat(j.c1).invert()));const local=(bw.get(j.parentPartId)?.clone().invert()??new T.Matrix4()).multiply(w);samples.get(p.id).push(trs(local));}}
  const animation={name:a.name||`Animation ${index+1}`,extras:{cuberId:a.id,loop:a.loop!==false},samplers:[],channels:[]},input=accessor(times,'SCALAR',1);
  for(const p of parts)for(const [path,width,type] of [['translation',3,'VEC3'],['rotation',4,'VEC4']]){const values=samples.get(p.id).map(s=>s[path].slice());if(path==='rotation')for(let i=1;i<values.length;i++)if(values[i].reduce((sum,v,k)=>sum+v*values[i-1][k],0)<0)values[i]=values[i].map(v=>-v);animation.channels.push({sampler:animation.samplers.length,target:{node:nodeIds.get(p.id),path}});animation.samplers.push({input,output:accessor(values.flat(),type,width),interpolation:'LINEAR'});}g.animations.push(animation);
 }
 for(const n of g.nodes)if(n.children?.length===0)delete n.children;if(!g.animations.length)delete g.animations;g.buffers[0].byteLength=length;const json=strToU8(JSON.stringify(g)),jp=new Uint8Array((4-json.length%4)%4).fill(32),bin=combine(chunks),bp=new Uint8Array((4-bin.length%4)%4),total=12+8+json.length+jp.length+8+bin.length+bp.length,header=new Uint8Array(12),v=new DataView(header.buffer);v.setUint32(0,0x46546c67,true);v.setUint32(4,2,true);v.setUint32(8,total,true);const chunkHeader=(length,type)=>{const b=new Uint8Array(8),d=new DataView(b.buffer);d.setUint32(0,length,true);d.setUint32(4,type,true);return b;};return combine([header,chunkHeader(json.length+jp.length,0x4e4f534a),json,jp,chunkHeader(bin.length+bp.length,0x004e4942),bin,bp]);
}
export function godotFiles(asset,base,preview,textures,events,stem){
 const used=new Set();const names=new Map();asset=structuredClone(asset);asset.animations=asset.animations.map((a,i)=>{const base=(a.name||'Animation').replace(/[.:@/\\%]/g,'_');let name=base,n=2;while(used.has(name))name=base+' '+n++;used.add(name);names.set(a.id??i,name);return {...a,id:a.id??i,name};});if(events){events=structuredClone(events);for(const a of events.animations)a.name=names.get(a.id)||a.name;}
 const frameMaps=asset.materials?Object.fromEntries(Object.entries(asset.materials.channels).map(([key,v])=>[key,textures[v.file]])):{};
 const maps=pbrTextures(base,frameMaps.emission,frameMaps.metalness);
 const files={['Godot/'+stem+'.glb']:glbBytes(asset,base,maps)};
 const guide=`GODOT 4\n\nCopy this whole folder into your Godot project. Drag ${stem}.glb into a 3D scene. The GLB contains its atlas, nearest-neighbor sampler, alpha, PBR maps, fused static sections and native skeleton animation clips. One Cuber unit is one Godot unit; front is -Z and up is +Y. No collision shapes are generated.\n\nSet each clip's loop option in Advanced Import Settings to match animation-settings.json. glTF does not standardize looping or Roblox priorities. Motion plays through Godot's AnimationPlayer. In Advanced Import Settings, select AnimationPlayer and disable Optimizer if you want to preserve tiny movements exactly.\n${events?`\nFor animated textures, create an inherited scene from ${stem}.glb and attach texture_player.gd to its root. It finds the AnimationPlayer and meshes automatically, sets clip loops, and switches precomposited color/emission/metalness textures at the authored times. Keep textures/ and texture-events.json beside the script. During blends, the current destination clip selects the expression (expressions do not blend). Do not attach it to a shared parent containing other models.\n`:''}`;
 files['Godot/README.txt']=strToU8(guide);files['Godot/animation-settings.json']=strToU8(JSON.stringify(asset.animations.map(a=>({name:a.name,loop:a.loop!==false})),null,2));
 if(!events)return files;
 const data=structuredClone(events);data.animations=data.animations.map(a=>({...a,loop:asset.animations.find(v=>v.id===a.id)?.loop!==false}));
 data.frames=[{value:'-1',overlay:null,materials:asset.materials?Object.fromEntries(Object.entries(asset.materials.channels).map(([n,c])=>[n,c.file])):{}},...events.frames.filter(f=>f.value!=='-1')].map(f=>{
  const color=compositeColor(base,f.overlay?textures[f.overlay]:null),pbr=pbrTextures(color,f.materials?.emission?textures[f.materials.emission]:null,f.materials?.metalness?textures[f.materials.metalness]:null),path=`textures/frame-${f.value}`;
  files[`Godot/${path}.png`]=color;if(pbr.emission)files[`Godot/${path}-emission.png`]=pbr.emission;if(pbr.orm)files[`Godot/${path}-orm.png`]=pbr.orm;
  return {value:f.value,color:path+'.png',emission:pbr.emission?path+'-emission.png':null,orm:pbr.orm?path+'-orm.png':null};
 });files['Godot/texture-events.json']=strToU8(JSON.stringify(data,null,2));
 files['Godot/texture_player.gd']=strToU8(`extends Node3D
# Native AnimationPlayer handles motion. This only selects discrete materials.
var _player: AnimationPlayer
var _clips: Dictionary = {}
var _frames: Dictionary = {}
var _meshes: Array[MeshInstance3D] = []
var _last_frame := ""

func _ready() -> void:
 var directory: String = get_script().resource_path.get_base_dir()
 var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(directory.path_join("texture-events.json")))
 var players: Array[Node] = find_children("*", "AnimationPlayer", true, false)
 if players.is_empty():
  push_warning("Cuber texture player requires an AnimationPlayer.")
  return
 _player = players[0] as AnimationPlayer
 for mesh in find_children("*", "MeshInstance3D", true, false):
  _meshes.append(mesh as MeshInstance3D)
 for frame in data.frames:
  var material := StandardMaterial3D.new()
  material.albedo_texture = load(directory.path_join(frame.color))
  material.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
  material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA_DEPTH_PRE_PASS
  material.cull_mode = BaseMaterial3D.CULL_DISABLED
  if frame.emission != null:
   material.emission_enabled = true
   material.emission = Color.WHITE
   material.emission_energy_multiplier = 1.5
   material.emission_texture = load(directory.path_join(frame.emission))
  if frame.orm != null:
   var orm: Texture2D = load(directory.path_join(frame.orm))
   material.metallic = 1.0
   material.metallic_texture = orm
   material.metallic_texture_channel = BaseMaterial3D.TEXTURE_CHANNEL_BLUE
   material.roughness_texture = orm
   material.roughness_texture_channel = BaseMaterial3D.TEXTURE_CHANNEL_GREEN
  _frames[str(frame.value)] = material
 for clip in data.animations:
  _clips[clip.name] = clip
  if _player.has_animation(clip.name):
   _player.get_animation(clip.name).loop_mode = Animation.LOOP_LINEAR if clip.loop else Animation.LOOP_NONE
 _apply_frame("-1")

func _process(_delta: float) -> void:
 if not is_instance_valid(_player):
  return
 var clip_name: String = _player.assigned_animation
 if not _clips.has(clip_name):
  return
 var clip: Dictionary = _clips[clip_name]
 var value: String = str(clip.initialValue)
 var time: float = _player.current_animation_position
 for event in clip.events:
  if float(event.time) > time + 0.00001:
   break
  value = str(event.value)
 _apply_frame(value)

func _apply_frame(value: String) -> void:
 if value == _last_frame or not _frames.has(value):
  return
 _last_frame = value
 for mesh in _meshes:
  mesh.material_override = _frames[value]
`);return files;
}
