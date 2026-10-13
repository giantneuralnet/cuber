import assert from 'node:assert/strict';
import * as T from '../dist/vendor/three.module.js';
import {parentFaceSign} from '../dist/build-editing.js';
import {FillTap} from '../dist/fill-tap.js';
const parent={q:[0,0,0,1]},child={q:[0,0,0,1],normal:[0,1,0]};
assert.equal(parentFaceSign(child,null),null);assert.deepEqual(parentFaceSign(child,parent),[0,-1,0]);
child.q=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),Math.PI/2).toArray();assert.deepEqual(parentFaceSign(child,parent),[-1,0,0]);
parent.q=child.q;assert.deepEqual(parentFaceSign(child,parent),[0,-1,0]);
const taps=new FillTap(),painted=new Set(['cube:face']);taps.remember('face',100,100,10,painted);painted.add('other');const match=taps.take('face',102,105,200);assert.deepEqual([...match.painted],['cube:face']);assert.equal(taps.take('face',102,105,210),null);
for(const [key,x,time] of [['other',100,200],['face',140,200],['face',100,500]]){taps.remember('face',100,100,10,painted);assert.equal(taps.take(key,x,100,time),null);}
taps.remember('face',100,100,10,painted);taps.reset();assert.equal(taps.take('face',100,100,30),null);
console.log('PASS parent-facing handle with rotated frames, immediate single fill/double-tap matching, brush coverage reuse, and gesture rejection.');
