import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import * as T from '../dist/vendor/three.module.js';
import {robloxXML,meshOBJ,bundleBytes} from '../dist/export.js';
import {projectPose} from '../dist/model-ops.js';
const identity=[0,0,0,1];
function frame(xml,ref,field='CFrame'){
 const start=xml.indexOf(`referent="${ref}"`);assert.ok(start>=0);
 const chunk=xml.slice(start).match(new RegExp(`<CoordinateFrame name="${field}">(.*?)</CoordinateFrame>`))[1];
 const n=tag=>Number(chunk.match(new RegExp(`<${tag}>(.*?)</${tag}>`))[1]);
 return new T.Matrix4().set(...[0,1,2].flatMap(r=>[0,1,2].map(c=>n(`R${r}${c}`)).concat(n('XYZ'[r]))),0,0,0,1);
}
const close=(a,b)=>assert.ok(a.distanceTo(b)<1e-7,`${a.toArray()} != ${b.toArray()}`);
const cube=(id,parent,p,a,b,axis='omni',q=identity)=>({id,parent,p,q,a,b,axis,size:[1,2,1],anchor:false,slot:id,color:'#ffffff'});
const boxes=[cube(0,null,[0,3,0],null,null),cube(1,0,[0,1,0],[0,-1,0],[0,1,0],'x')];
for(const axis of ['x','y','z'])for(const angle of [-.7,.7]){
 boxes[1].axis=axis;const v=new T.Vector3();v[axis]=1;
 const pose=projectPose(boxes,{0:boxes[0],1:{...boxes[1],q:new T.Quaternion().setFromAxisAngle(v,angle).toArray()}});
 const xml=robloxXML({boxes,animations:[{name:'Test',frames:[{time:0,pose}]}]});
 const m=frame(xml,'FA0K0P1');const q=new T.Quaternion().setFromRotationMatrix(m);
 for(const other of ['x','y','z'].filter(a=>a!==axis))assert.ok(Math.abs(q[other])<1e-8,`${axis} must never become ${other}`);
 const world=frame(xml,'P0').multiply(frame(xml,'M1','C0')).multiply(m).multiply(frame(xml,'M1','C1').invert());
 const pivot=new T.Vector3(0,1,0).applyMatrix4(world);close(pivot,new T.Vector3(0,2,0));
 if(axis==='x'){
  const foot=new T.Vector3(0,-1,0).applyMatrix4(world);
  assert.ok(Math.abs(foot.x)<1e-8,'X hinge cannot swipe laterally');
  assert.ok(Math.abs(foot.z)>1,'X hinge swings forward/back');
  assert.equal(Math.sign(foot.z),Math.sign(angle),'frontward swing retains direction after conversion');
 }
}
// Arbitrary, noncommuting rest rotations: idle Motor6D must not snap to a new pose.
boxes[0].q=new T.Quaternion().setFromEuler(new T.Euler(.4,.8,-.3)).toArray();
boxes[1].q=new T.Quaternion().setFromEuler(new T.Euler(-.2,.3,.6)).toArray();
boxes[1].p=new T.Vector3(...boxes[0].p).add(new T.Vector3(...boxes[1].a).applyQuaternion(new T.Quaternion(...boxes[0].q))).sub(new T.Vector3(...boxes[1].b).applyQuaternion(new T.Quaternion(...boxes[1].q))).toArray();
const rest=Object.fromEntries(boxes.map(b=>[b.id,b]));
const xml=robloxXML({boxes,animations:[{name:'Rest',frames:[{time:0,pose:rest}]}]});
assert.ok(frame(xml,'FA0K0P1').elements.every((v,i)=>Math.abs(v-new T.Matrix4().elements[i])<1e-7),'rest keyframe must be identity');
const idle=frame(xml,'P0').multiply(frame(xml,'M1','C0')).multiply(frame(xml,'M1','C1').invert());
assert.ok(idle.elements.every((v,i)=>Math.abs(v-frame(xml,'P1').elements[i])<1e-7),'rest part orientation retained');
const g=new T.BoxGeometry(),obj=meshOBJ(boxes[1],g),lines=obj.split('\n'),verts=lines.filter(l=>l.startsWith('v ')).map(l=>new T.Vector3(...l.split(' ').slice(1).map(Number))),normals=lines.filter(l=>l.startsWith('vn ')).map(l=>new T.Vector3(...l.split(' ').slice(1).map(Number)));
for(let i=16;i<20;i++){assert.ok(verts[i].z<0,'painted +Z front becomes Roblox -Z');close(normals[i],new T.Vector3(0,0,-1));}
for(const l of lines.filter(l=>l.startsWith('f '))){const ids=l.split(' ').slice(1).map(t=>Number(t.split('/')[0])-1),[a,b,c]=ids.map(i=>verts[i]);assert.ok(b.clone().sub(a).cross(c.clone().sub(a)).dot(normals[ids[0]])>0,'outward winding retained');}
assert.deepEqual(lines.filter(l=>l.startsWith('vt ')).map(l=>l.split(' ').slice(1).map(Number)),Array.from({length:g.attributes.uv.count},(_,i)=>[g.attributes.uv.getX(i),g.attributes.uv.getY(i)]),'UVs stay on original painted vertices');
console.log('PASS: XYZ hinge axes, signed X leg swing, connected pivots, rotated bind pose, -Z painted front, outward winding, and unchanged UVs.');
// Optional real-project export also exercises the exact browser bundle builder.
if(process.argv[2]){
 const project=JSON.parse(readFileSync(process.argv[2],'utf8')),state=project.state,png=Buffer.from(project.atlas.split(',')[1],'base64');
 const atlas={width:state.textureSize,toDataURL:()=>project.atlas,toBlob:cb=>cb(new Blob([png],{type:'image/png'}))};
 const meshes=new Map(state.boxes.map(b=>{const geometry=new T.BoxGeometry(),uv=geometry.attributes.uv;
  for(let f=0;f<6;f++){const r=state.atlasLayout.faces[b.slot*6+f];for(let v=0;v<4;v++){const i=f*4+v;uv.setXY(i,(r.x+.0001+uv.getX(i)*(r.spanW-.0002))/atlas.width,1-(r.y+.0001+(1-uv.getY(i))*(r.spanH-.0002))/atlas.width);}}
  return [b.id,{geometry}];}));
 writeFileSync(process.argv[3],await bundleBytes(state,atlas,meshes));
 console.log(`Exported real project: ${state.boxes.length} cubes, ${state.animations.length} animations.`);
}
