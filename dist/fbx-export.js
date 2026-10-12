import * as T from './vendor/three.module.js';
import {assetDescription,exportFilename,triggerDownload} from './export.js?v=7';

// FBX 7.4 binary. Arrays are uncompressed so the writer needs no runtime dependencies.
const enc=new TextEncoder(), I=v=>({type:'I',value:v}), L=v=>({type:'L',value:v}), D=v=>({type:'D',value:v});
const A=(type,value)=>({type,value}), N=(name,props=[],children=[])=>({name,props,children});
const P=(name,type,values,flags='')=>N('P',[name,type,'',flags,...values]);
const props=children=>N('Properties70',[],children), named=(name,kind)=>`${name}\0\x01${kind}`;
const time=t=>Math.round(t*46186158000), matrix=t=>new T.Matrix4().compose(new T.Vector3(...t.position),new T.Quaternion(...t.rotation),new T.Vector3(1,1,1));
const vec=v=>v.map(D), idName=p=>`${p.name}_${p.id}`;
function property(p){
 if(typeof p==='string')p={type:'S',value:enc.encode(p)};
 const {type,value}=p, array='dfil'.includes(type),raw=type==='S'||type==='R';
 const width=type==='I'||type==='i'||type==='f'?4:8;
 const b=new Uint8Array(1+(array?12+value.length*width:raw?4+value.length:width)),v=new DataView(b.buffer);
 b[0]=type.charCodeAt(0);
 const write=(offset,x)=>{if(type==='L'||type==='l')v.setBigInt64(offset,BigInt(Math.round(x)),true);else if(type==='I'||type==='i')v.setInt32(offset,x,true);else if(type==='f')v.setFloat32(offset,x,true);else v.setFloat64(offset,x,true);};
 if(raw){v.setUint32(1,value.length,true);b.set(value,5);}
 else if(array){v.setUint32(1,value.length,true);v.setUint32(5,0,true);v.setUint32(9,value.length*width,true);value.forEach((x,i)=>write(13+i*width,x));}
 else write(1,value);
 return b;
}
function binary(nodes){
 const prepare=n=>{n.nameBytes=enc.encode(n.name);n.bytes=n.props.map(property);n.propertyLength=n.bytes.reduce((s,b)=>s+b.length,0);n.children.forEach(prepare);n.length=13+n.nameBytes.length+n.propertyLength+n.children.reduce((s,c)=>s+c.length,0)+(n.children.length?13:0);};nodes.forEach(prepare);
 const end=27+nodes.reduce((s,n)=>s+n.length,0)+13,padding=(16-(end+16)%16)%16;
 const bytes=new Uint8Array(end+16+padding+4+4+120+16),v=new DataView(bytes.buffer);bytes.set(enc.encode('Kaydara FBX Binary  \0\x1a\0'));v.setUint32(23,7400,true);
 const write=(n,start)=>{v.setUint32(start,start+n.length,true);v.setUint32(start+4,n.props.length,true);v.setUint32(start+8,n.propertyLength,true);bytes[start+12]=n.nameBytes.length;let at=start+13;bytes.set(n.nameBytes,at);at+=n.nameBytes.length;for(const b of n.bytes){bytes.set(b,at);at+=b.length;}for(const c of n.children)at=write(c,at);return start+n.length;};
 let at=27;for(const n of nodes)at=write(n,at);
 bytes.set([0xfa,0xbc,0xab,0x09,0xd0,0xc8,0xd4,0x66,0xb1,0x76,0xfb,0x83,0x1c,0xf7,0x26,0x7e],end);
 v.setUint32(end+16+padding+4,7400,true);
 bytes.set([0xf8,0x5a,0x8c,0x6a,0xde,0xf5,0xd9,0x7e,0xec,0xe9,0x0c,0xe3,0x75,0x8f,0x29,0x0b],bytes.length-16);
 return bytes;
}
function components(m){
 const p=new T.Vector3(),q=new T.Quaternion(),s=new T.Vector3();m.decompose(p,q,s);
 // FBX Euler XYZ is an extrinsic Rz*Ry*Rx product (Three.js calls that ZYX).
 const e=new T.Euler().setFromQuaternion(q,'ZYX');return {t:p.toArray(),r:[e.x,e.y,e.z].map(T.MathUtils.radToDeg)};
}
function transformProps(m){const c=components(m);return props([P('Lcl Translation','Lcl Translation',vec(c.t),'A'),P('Lcl Rotation','Lcl Rotation',vec(c.r),'A'),P('Lcl Scaling','Lcl Scaling',vec([1,1,1]),'A'),P('RotationOrder','enum',[I(0)]),P('InheritType','enum',[I(1)])]);}

// Accept the same already-converted geometry/rig description used by the native Part ZIP.
export function fbxBytes(asset,png,{textureFilename='atlas.png',fps=30}={}){
 if(!asset.parts?.length||!png?.length)throw Error('A model and PNG texture are required');
 if(!Number.isFinite(fps)||fps<1||fps>120)throw Error('Invalid FBX sample rate');
 const objects=[],connections=[],bindNodes=[],identity=new T.Matrix4(),ids=new Map();let serial=1000;
 const alloc=()=>serial++,add=(kind,id,name,type,children)=>objects.push(N(kind,[L(id),named(name,kind==='Model'?'Model':kind),type],children));
 const link=(child,parent,property)=>connections.push(N('C',[property?'OP':'OO',L(child),L(parent),...(property?[property]:[])]));
 const rig=alloc(),mat=alloc(),tex=alloc(),video=alloc(),joints=new Map(asset.joints.map(j=>[j.childPartId,j]));
 add('Model',rig,asset.name||'Cuber','Null',[N('Version',[I(232)]),transformProps(identity)]);link(rig,0);
 add('Material',mat,'Atlas','',[N('Version',[I(102)]),N('ShadingModel',['lambert']),N('MultiLayer',[I(0)]),props([P('DiffuseColor','Color',vec([1,1,1])),P('DiffuseFactor','Number',[D(1)]),P('TransparencyFactor','Number',[D(0)]),P('TransparentColor','Color',vec([0,0,0])),P('Opacity','Number',[D(1)])])]);
 add('Texture',tex,'Atlas','',[N('Type',['TextureVideoClip']),N('Version',[I(202)]),N('TextureName',[named('Atlas','Texture')]),N('Media',[named('Atlas','Video')]),N('FileName',[textureFilename]),N('RelativeFilename',[textureFilename]),props([P('AlphaSource','enum',[I(2)]),P('PremultiplyAlpha','bool',[I(0)]),P('UVSet','KString',['UVMap']),P('UseMaterial','bool',[I(1)]),P('WrapModeU','enum',[I(1)]),P('WrapModeV','enum',[I(1)])])]);
 add('Video',video,'Atlas','Clip',[N('Type',['Clip']),N('UseMipMap',[I(0)]),N('Filename',[textureFilename]),N('RelativeFilename',[textureFilename]),N('Content',[A('R',png)])]);link(video,tex);link(tex,mat,'DiffuseColor');link(tex,mat,'TransparentColor');
 for(const part of asset.parts){const joint=joints.get(part.id);if(!joint)throw Error('Missing joint');ids.set(part.id,{bone:alloc(),attr:alloc(),mesh:alloc(),geo:alloc(),skin:alloc(),cluster:alloc(),world:matrix(part.restTransform),boneWorld:matrix(part.restTransform).multiply(matrix(joint.c1))});}
 for(const part of asset.parts){
  const x=ids.get(part.id),joint=joints.get(part.id),parent=ids.get(joint.parentPartId),local=(parent?parent.boneWorld.clone().invert():identity.clone()).multiply(x.boneWorld),name=idName(part);
  add('Model',x.bone,`Joint_${name}`,'LimbNode',[N('Version',[I(232)]),transformProps(local),N('Shading',[I(1)]),N('Culling',['CullingOff'])]);link(x.bone,parent?.bone??rig);
  add('NodeAttribute',x.attr,`Joint_${name}`,'LimbNode',[N('TypeFlags',['Skeleton']),props([P('Size','double',[D(.2)])])]);link(x.attr,x.bone);
  add('Model',x.mesh,name,'Mesh',[N('Version',[I(232)]),transformProps(identity),N('Shading',[I(1)]),N('Culling',['CullingOff'])]);link(x.mesh,rig);link(mat,x.mesh);
  const mesh=part.mesh,vertices=mesh.positions.flatMap(p=>new T.Vector3(...p).applyMatrix4(x.world).toArray());
  const normals=mesh.indices.flatMap(i=>new T.Vector3(...mesh.normals[i]).transformDirection(x.world).toArray());
  add('Geometry',x.geo,name,'Mesh',[
   N('GeometryVersion',[I(124)]),N('Vertices',[A('d',vertices)]),N('PolygonVertexIndex',[A('i',mesh.indices.map((i,n)=>n%3===2?-i-1:i))]),
   N('LayerElementNormal',[I(0)],[N('Version',[I(101)]),N('Name',['']),N('MappingInformationType',['ByPolygonVertex']),N('ReferenceInformationType',['Direct']),N('Normals',[A('d',normals)])]),
   N('LayerElementUV',[I(0)],[N('Version',[I(101)]),N('Name',['UVMap']),N('MappingInformationType',['ByPolygonVertex']),N('ReferenceInformationType',['IndexToDirect']),N('UV',[A('d',mesh.uvs.flat())]),N('UVIndex',[A('i',mesh.indices)])]),
   N('LayerElementMaterial',[I(0)],[N('Version',[I(101)]),N('Name',['']),N('MappingInformationType',['AllSame']),N('ReferenceInformationType',['IndexToDirect']),N('Materials',[A('i',[0])])]),
   N('Layer',[I(0)],[N('Version',[I(100)]),...['Normal','UV','Material'].map(t=>N('LayerElement',[],[N('Type',[`LayerElement${t}`]),N('TypedIndex',[I(0)])]))])
  ]);link(x.geo,x.mesh);
  add('Deformer',x.skin,`${name}_Skin`,'Skin',[N('Version',[I(101)]),N('Link_DeformAcuracy',[D(50)])]);link(x.skin,x.geo);
  add('Deformer',x.cluster,`${name}_Weight`,'Cluster',[N('Version',[I(100)]),N('UserData',['','']),N('Indexes',[A('i',mesh.positions.map((_,i)=>i))]),N('Weights',[A('d',mesh.positions.map(()=>1))]),N('Transform',[A('d',x.boneWorld.clone().invert().elements)]),N('TransformLink',[A('d',x.boneWorld.elements)])]);link(x.cluster,x.skin);link(x.bone,x.cluster);
  bindNodes.push(N('PoseNode',[],[N('Node',[L(x.bone)]),N('Matrix',[A('d',x.boneWorld.elements)])]),N('PoseNode',[],[N('Node',[L(x.mesh)]),N('Matrix',[A('d',identity.elements)])]));
 }
 bindNodes.push(N('PoseNode',[],[N('Node',[L(rig)]),N('Matrix',[A('d',identity.elements)])]));
 add('Pose',alloc(),'BindPose','BindPose',[N('Type',['BindPose']),N('Version',[I(100)]),N('NbPoseNodes',[I(bindNodes.length)]),...bindNodes]);
 let duration=0;
 for(const animation of asset.animations||[]){
  const frames=animation.keyframes;if(!frames?.length)continue;
  const end=frames.at(-1).time;duration=Math.max(duration,end);const stack=alloc(),layer=alloc();
  add('AnimationStack',stack,animation.name||'Animation','',[props([P('LocalStart','KTime',[L(0)]),P('LocalStop','KTime',[L(time(end))]),P('ReferenceStart','KTime',[L(0)]),P('ReferenceStop','KTime',[L(time(end))])])]);
  add('AnimationLayer',layer,animation.name||'Animation','',[]);link(layer,stack);
  const times=[...new Set([...frames.map(f=>f.time),...Array.from({length:Math.ceil(end*fps)},(_,i)=>i/fps),end])].sort((a,b)=>a-b),samples=new Map(asset.parts.map(p=>[p.id,[]]));
  for(const t of times){
   let index=0;while(index<frames.length-1&&frames[index+1].time<=t)index++;
   const a=frames[index],b=frames[Math.min(index+1,frames.length-1)],alpha=b.time===a.time?0:(t-a.time)/(b.time-a.time),world=new Map(),boneWorld=new Map();
   for(const part of asset.parts){
    const j=joints.get(part.id),ta=a.jointTransforms[part.id],tb=b.jointTransforms[part.id];
    const local=matrix({position:new T.Vector3(...ta.position).lerp(new T.Vector3(...tb.position),alpha).toArray(),rotation:new T.Quaternion(...ta.rotation).slerp(new T.Quaternion(...tb.rotation),alpha).toArray()});
    const bw=(world.get(j.parentPartId)?.clone()??matrix(asset.rigRoot.restTransform)).multiply(matrix(j.c0)).multiply(local);
    boneWorld.set(part.id,bw);world.set(part.id,bw.clone().multiply(matrix(j.c1).invert()));
    const c=components((boneWorld.get(j.parentPartId)?.clone().invert()??identity.clone()).multiply(bw)),list=samples.get(part.id),prev=list.at(-1);
    if(prev)for(let axis=0;axis<3;axis++){while(c.r[axis]-prev.r[axis]>180)c.r[axis]-=360;while(c.r[axis]-prev.r[axis]<-180)c.r[axis]+=360;}
    list.push(c);
   }
  }
  for(const part of asset.parts)for(const [key,label] of [['t','Lcl Translation'],['r','Lcl Rotation']]){
   const node=alloc(),list=samples.get(part.id);
   add('AnimationCurveNode',node,key.toUpperCase(),'', [props(['X','Y','Z'].map((axis,i)=>P(`d|${axis}`,'Number',[D(list[0][key][i])],'A')))]);link(node,layer);link(node,ids.get(part.id).bone,label);
   for(let i=0;i<3;i++){const curve=alloc();add('AnimationCurve',curve,'','',[N('Default',[D(list[0][key][i])]),N('KeyVer',[I(4008)]),N('KeyTime',[A('l',times.map(time))]),N('KeyValueFloat',[A('f',list.map(s=>s[key][i]))]),N('KeyAttrFlags',[A('i',[24836])]),N('KeyAttrDataFloat',[A('f',[0,0,0,0])]),N('KeyAttrRefCount',[A('i',[times.length])])]);link(curve,node,`d|${'XYZ'[i]}`);}
  }
 }
 const counts=new Map();for(const n of objects)counts.set(n.name,(counts.get(n.name)||0)+1);
 return binary([
  N('FBXHeaderExtension',[],[N('FBXHeaderVersion',[I(1003)]),N('FBXVersion',[I(7400)]),N('EncryptionType',[I(0)]),N('Creator',['Cuber'])]),
  N('GlobalSettings',[],[N('Version',[I(1000)]),props([P('UpAxis','int',[I(1)]),P('UpAxisSign','int',[I(1)]),P('FrontAxis','int',[I(2)]),P('FrontAxisSign','int',[I(1)]),P('CoordAxis','int',[I(0)]),P('CoordAxisSign','int',[I(1)]),P('UnitScaleFactor','double',[D(28)]),P('OriginalUnitScaleFactor','double',[D(28)]),P('TimeMode','enum',[I(6)]),P('TimeSpanStart','KTime',[L(0)]),P('TimeSpanStop','KTime',[L(time(duration))])])]),
  N('Documents',[],[N('Count',[I(1)]),N('Document',[L(1),asset.name||'Cuber','Scene'],[props([P('SourceObject','object',[]),P('ActiveAnimStackName','KString',[asset.animations?.[0]?.name||''])]),N('RootNode',[L(0)])])]),
  N('References'),N('Definitions',[],[N('Version',[I(100)]),N('Count',[I(objects.length)]),...[...counts].map(([name,count])=>N('ObjectType',[name],[N('Count',[I(count)])]))]),
  N('Objects',[],objects),N('Connections',[],connections),N('Takes',[],[N('Current',[''])])
 ]);
}
export async function downloadFBX(state,canvas,meshes){
 const snapshot=structuredClone(state),asset=assetDescription(snapshot,meshes,canvas.width);
 const png=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?b.arrayBuffer().then(resolve,reject):reject(Error('Texture export failed')),'image/png'));
 const name=exportFilename(snapshot);
 triggerDownload(fbxBytes(asset,new Uint8Array(png),{textureFilename:`${name}-atlas.png`}),`${name}.fbx`,'application/octet-stream');
}
