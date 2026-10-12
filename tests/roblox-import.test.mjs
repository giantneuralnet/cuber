import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import * as T from '../dist/vendor/three.module.js';
import {packAtlas} from '../dist/atlas-layout.js';
import {bundleBytes} from '../dist/export.js';
import {robloxImportFiles} from '../dist/roblox-import-files.js';
import {unzipSync,zipSync,strToU8,strFromU8} from '../dist/vendor/fflate.js';
const directory=mkdtempSync(join(tmpdir(),'cuber-import-test-'));
try{
 const box={id:0,slot:0,name:'Thin box',parent:null,size:[.2,.2,.2],p:[2,3,-4],q:[0,0,0,1],a:null,b:null,axis:'omni',anchor:true,color:'#abcdef'};
 const pose={0:{p:box.p,q:box.q}},png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
 const state={name:'Import fixture',boxes:[box],nextId:1,textureSize:256,gridSize:.1,atlasLayout:packAtlas([box],256),animations:[{id:0,name:'Still',frames:[]},{id:1,name:'Still',frames:[{time:0,pose,paintFrame:0},{time:1,pose,paintFrame:1}]}],nextAnimationId:2,animation:0,frame:0,paintLayer:{frame:0,frames:[{png:'data:image/png;base64,'+png.toString('base64')},{png:''}]}};
 const geometry=new T.BoxGeometry(),uv=geometry.attributes.uv;
 for(let f=0;f<6;f++){const r=state.atlasLayout.faces[f];for(let v=0;v<4;v++){const i=f*4+v;uv.setXY(i,(r.x+.0001+uv.getX(i)*(r.spanW-.0002))/256,1-(r.y+.0001+(1-uv.getY(i))*(r.spanH-.0002))/256);}}
 const files=unzipSync(await bundleBytes(state,{width:256,toBlob:cb=>cb(new Blob([png]))},new Map([[0,{geometry}]])));
 for(const [name,text] of Object.entries(robloxImportFiles)){
  assert.equal(strFromU8(files[name]),text);
  const source=name==='ROBLOX-IMPORT.md'?'IMPORT.md':name.split('/').at(-1);
  assert.equal(text,readFileSync(new URL('../dist/roblox/'+source,import.meta.url),'utf8'),'regenerate the embedded importer after source changes');
  assert.ok(!/89152742665505|94621651488630|MedievalVillage|VillageChickens|CloveChickenAI/.test(text));
 }
 const zip=join(directory,'asset.zip'),out=join(directory,'prepared'),script=new URL('../dist/roblox/prepare_cuber.py',import.meta.url).pathname;
 const original=JSON.parse(strFromU8(files['asset.json']));original.animations[1].loop=false;original.animations[1].events=[{time:.75,name:'ExampleEvent'}];files['asset.json']=strToU8(JSON.stringify(original));writeFileSync(zip,zipSync(files));
 const output=execFileSync('python3',[script,zip,'--out',out],{encoding:'utf8'});assert.ok(output.length<1000);
 const lua=readFileSync(join(out,'PreparedAsset.lua'),'utf8');const match=lua.match(/JSONDecode\(\[=\[([\s\S]*)\]=\]\)/);assert.ok(match);
 const data=JSON.parse(match[1]);assert.equal(data.version,1);assert.equal(data.textureAlpha,true);assert.equal(data.parts.length,1);assert.deepEqual(data.parts[0].restTransform,original.parts[0].restTransform);assert.deepEqual(data.joints[0].c0,original.joints[0].c0);
 assert.deepEqual(data.parts[0].faces.map(f=>f.face),['Left','Right','Top','Bottom','Front','Back']);assert.deepEqual(data.parts[0].faces.map(f=>f.rotation),[0,0,180,180,0,0]);
 assert.ok(data.parts[0].faces.every(f=>f.rect[2]>=1&&f.rect[3]>=1));
 assert.deepEqual(data.animations.Still.frames,[]);assert.equal(data.animations['Still [1]'].loop,false);assert.equal(data.animations['Still [1]'].frames.at(-1).paint,1);assert.deepEqual(data.animations['Still [1]'].events,original.animations[1].events);
 assert.deepEqual(data.animations['Still [1]'].frames[0].p['0'],[...original.animations[1].keyframes[0].jointTransforms['0'].position,...original.animations[1].keyframes[0].jointTransforms['0'].rotation]);
 assert.deepEqual(data.images.paintFrames,{'0':'paint-frame-0.png'});assert.deepEqual(readFileSync(join(out,'paint-frame-0.png')),png);assert.deepEqual(JSON.parse(readFileSync(join(out,'ImageFiles.json'),'utf8')),data.images);
 for(const size of [32,64,128]){const small=structuredClone(original);small.texture.width=small.texture.height=size;delete small.texture.alphaMode;files['asset.json']=strToU8(JSON.stringify(small));writeFileSync(zip,zipSync(files));execFileSync('python3',[script,zip,'--out',out]);assert.ok(readFileSync(join(out,'PreparedAsset.lua'),'utf8').includes('"textureAlpha":false'));}
 original.coordinates.forward='+Z';files['asset.json']=strToU8(JSON.stringify(original));writeFileSync(zip,zipSync(files));assert.throws(()=>execFileSync('python3',[script,zip,'--out',join(directory,'bad')],{stdio:'pipe'}),/Command failed/);
 console.log('PASS importer files, generic content, preparation CLI, UV face mapping/rotation, tiny faces, unchanged transforms, duplicate/empty animations, non-loop/events, overlay zero, and coordinate rejection.');
}finally{rmSync(directory,{recursive:true,force:true});}
