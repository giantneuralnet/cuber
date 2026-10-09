import assert from 'node:assert/strict';
import * as T from '../dist/vendor/three.module.js';
import {snapProjectToGrid,explodedOffsets,visibleBrushTexels} from '../dist/editor-geometry.js';
import {normalizeModel,projectPose} from '../dist/model-ops.js';
import {packAtlas} from '../dist/atlas-layout.js';
const v=a=>new T.Vector3(...a),q=a=>new T.Quaternion(...a);
const state=normalizeModel({nextId:3,boxes:[{id:0,parent:null,p:[.03,.53,.04],q:[0,0,0,1],size:[1,1,1],slot:0},{id:1,parent:0,p:[1.03,.53,.04],q:[0,0,0,1],size:[1,1,1],a:[.5,0,0],b:[-.5,0,0],slot:1},{id:2,parent:1,p:[2.03,.53,.04],q:[0,0,0,1],size:[1,1,1],a:[.5,0,0],b:[-.5,0,0],slot:2}],frames:[]});
const pose=Object.fromEntries(state.boxes.map(b=>[b.id,b]));pose[2]={...state.boxes[2],q:new T.Quaternion().setFromEuler(new T.Euler(.3,.2,.5)).toArray()};state.animations[0].frames=[{time:0,pose:projectPose(state.boxes,pose)}];
for(const step of [.05,.1,.2,.25]){const next=snapProjectToGrid(state,step);for(const b of next.boxes){assert.deepEqual(b.size,state.boxes.find(p=>p.id===b.id).size);assert.ok(b.p.every(c=>Math.abs(c/step-Math.round(c/step))<1e-8));}for(const ps of [Object.fromEntries(next.boxes.map(b=>[b.id,b])),next.animations[0].frames[0].pose])for(const b of next.boxes){if(b.parent===null)continue;const p=ps[b.parent],c=ps[b.id];assert.ok(v(b.a).applyQuaternion(q(p.q)).add(v(p.p)).distanceTo(v(b.b).applyQuaternion(q(c.q)).add(v(c.p)))<1e-8);}}
assert.deepEqual(snapProjectToGrid(state,0).boxes,state.boxes);assert.equal(state.boxes[0].p[0],.03);
const offsets=explodedOffsets(state.boxes);for(let i=0;i<3;i++)for(let j=i+1;j<3;j++){const a=v(state.boxes[i].p).add(offsets.get(i)),b=v(state.boxes[j].p).add(offsets.get(j));assert.ok(Math.max(...a.sub(b).toArray().map(Math.abs))>=1.39,'separated cube bounds');}
const boxes=[{id:0,slot:0,size:[1,1,1]},{id:1,slot:1,size:[1,1,1]}],layout=packAtlas(boxes,256);
const objects=boxes.map(b=>{const g=new T.BoxGeometry(),uv=g.attributes.uv;for(let f=0;f<6;f++){const r=layout.faces[b.slot*6+f];for(let v=0;v<4;v++){const i=f*4+v;uv.setXY(i,(r.x+uv.getX(i)*r.spanW)/256,1-(r.y+(1-uv.getY(i))*r.spanH)/256);}}const m=new T.Mesh(g,new T.MeshBasicMaterial());m.userData.id=b.id;return m;});
objects[1].position.z=-2;objects.forEach(m=>m.updateMatrixWorld());
const camera=new T.OrthographicCamera(-2,2,2,-2,.05,100);camera.position.set(4,3,6);camera.lookAt(0,0,0);camera.updateMatrixWorld();
const args={objects,camera,width:400,height:400,x:200,y:200,radius:65,atlasSize:256};
let samples=visibleBrushTexels(args);assert.ok(new Set(samples.filter(h=>h.object===objects[0]).map(h=>Math.floor(h.faceIndex/2))).size>=2,'big brush crosses visible faces');
assert.ok(samples.every(h=>Number.isInteger(h.uv.x*256-.5)&&Number.isInteger((1-h.uv.y)*256-.5)),'pixel-center paint');
camera.position.set(0,0,6);camera.lookAt(0,0,0);camera.updateMatrixWorld();samples=visibleBrushTexels(args);assert.ok(samples.length>0);assert.ok(samples.every(h=>h.object===objects[0]),'brush cannot paint through front cube');assert.ok(samples.every(h=>Math.floor(h.faceIndex/2)===4),'only front face visible');
objects[1].position.x=1;objects[1].position.z=0;objects[1].updateMatrixWorld();samples=visibleBrushTexels({...args,x:250,radius:55});assert.equal(new Set(samples.map(h=>h.object.userData.id)).size,2,'brush overlaps neighboring cubes');
console.log('PASS: all grid sizes, connected rest/animation pivots, independent snapshots, exploded separation, multi-face/multi-cube brush, pixel centers and occlusion.');
