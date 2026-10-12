import assert from 'node:assert/strict';

// Read the serialized FBX, independently of the writer's node representation.
// These labels/types are required by Blender's io_scene_fbx property readers.
export function checkBlenderMetadata(bytes){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),decoder=new TextDecoder();
 let at=27;const string=n=>{const s=decoder.decode(bytes.subarray(at,at+n));at+=n;return s;};
 function property(){
  const type=String.fromCharCode(bytes[at++]);let value;
  if(type==='S'||type==='R'){const n=view.getUint32(at,true);at+=4;if(type==='S')value=string(n);else{value=bytes.slice(at,at+n);at+=n;}}
  else if('dfil'.includes(type)){const n=view.getUint32(at+8,true);at+=12+n;}
  else if(type==='I'){value=view.getInt32(at,true);at+=4;}
  else if(type==='L'){value=Number(view.getBigInt64(at,true));at+=8;}
  else if(type==='D'){value=view.getFloat64(at,true);at+=8;}
  else assert.fail(`Unexpected FBX property type ${type}`);
  return {type,value};
 }
 function nodes(end){const result=[];while(at<end&&view.getUint32(at,true)){
  const stop=view.getUint32(at,true),count=view.getUint32(at+4,true),length=bytes[at+12];at+=13;
  const name=string(length),p=Array.from({length:count},property),children=nodes(stop);at=stop;result.push({name,p,children});
 }return result;}
 const root=nodes(bytes.length),all=[];function walk(n){all.push(n);n.children.forEach(walk);}root.forEach(walk);
 assert.equal(root.find(n=>n.name==='FileId')?.p[0].value.length,16,'Autodesk requires a FileId');
 assert.equal(root.find(n=>n.name==='CreationTime')?.p[0].value,'1970-01-01 10:00:00:000');
 assert.ok(root.find(n=>n.name==='FBXHeaderExtension').children.some(n=>n.name==='CreationTimeStamp'));
 const footerVersion=bytes.length-140;
 assert.equal(footerVersion%16,0,'footer version is aligned after reserved bytes');
 assert.equal(view.getUint32(footerVersion,true),7400);
 const properties=all.filter(n=>n.name==='P');
 for(const n of properties){const [name,type,subtype]=n.p.map(p=>p.value);
  const expected={int:['Integer','I'],double:['Number','D'],KTime:['Time','L'],Number:['','D'],enum:['','I'],bool:['','I'],KString:[name==='Path'?'Url':'','S']}[type];
  if(expected){assert.equal(subtype,expected[0],`${name} subtype`);assert.equal(n.p[4].type,expected[1],`${name} value type`);}
 }
 for(const name of ['UnitScaleFactor','OriginalUnitScaleFactor','FrontAxis','FrontAxisSign','UpAxis','UpAxisSign','CoordAxis','CoordAxisSign'])assert.ok(properties.some(n=>n.p[0].value===name),name);
 const objects=root.find(n=>n.name==='Objects').children;
 for(const [kind,label] of Object.entries({AnimationStack:'AnimStack',AnimationLayer:'AnimLayer',AnimationCurveNode:'AnimCurveNode',AnimationCurve:'AnimCurve'})){
  const matches=objects.filter(n=>n.name===kind);assert.ok(matches.length,kind);
  for(const n of matches)assert.equal(n.p[1].value.split('\0\x01')[1],label,`${kind} embedded class`);
 }
 assert.ok(objects.some(n=>n.name==='AnimationStack'&&n.p[1].value==='Still\0\x01AnimStack'),'one-frame Still stack');
}
