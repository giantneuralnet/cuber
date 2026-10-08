import assert from 'node:assert/strict';
import {PointerRegistry,bindPointerInput} from '../dist/pointer-input.js';
function event(type,id,x=100,y=100,extra={}){const e=new Event(type);for(const [key,value] of Object.entries({pointerId:id,clientX:x,clientY:y,pointerType:'touch',isPrimary:id===1,button:0,buttons:1,...extra}))Object.defineProperty(e,key,{value});return e;}
class Canvas extends EventTarget{captured=new Set();setPointerCapture(id){this.captured.add(id);}hasPointerCapture(id){return this.captured.has(id);}releasePointerCapture(id){this.captured.delete(id);}closest(){return null;}}
const canvas=new Canvas(),root=new EventTarget(),doc=new EventTarget(),calls=[];
const input=bindPointerInput(canvas,{begin:e=>calls.push(['begin',e.pointerId]),move:e=>calls.push(['move',e.pointerId]),end:cancel=>calls.push(['end',cancel]),multi:(a,b)=>calls.push(['multi',b.d/a.d]),hover:()=>{}},{root,doc});
const send=(where,type,id,x,y,extra)=>where.dispatchEvent(event(type,id,x,y,extra));
// Two fingers -> one -> none -> one: only the true two-finger interval can pan/zoom.
send(canvas,'pointerdown',1,100,100);send(canvas,'pointerdown',2,200,100);send(canvas,'pointermove',2,230,100);assert.equal(calls.filter(c=>c[0]==='multi').length,1);
send(root,'pointerup',2);send(canvas,'pointermove',1,120,100);assert.equal(calls.filter(c=>c[0]==='multi').length,1);send(root,'pointerup',1);assert.equal(input.registry.points.size,0);assert.equal(canvas.captured.size,0);
send(canvas,'pointerdown',7,100,100,{isPrimary:true});send(canvas,'pointermove',7,130,120);assert.deepEqual(calls.at(-1),['move',7]);send(root,'pointerup',7);
// Missing releases cannot leave ghost fingers behind when a fresh primary touch arrives.
send(canvas,'pointerdown',1);send(canvas,'pointerdown',2);send(canvas,'pointerdown',9,150,120,{isPrimary:true});assert.equal(input.registry.points.size,1);assert.equal(canvas.captured.size,1);send(canvas,'pointermove',9,160,140);assert.deepEqual(calls.at(-1),['move',9]);send(root,'pointerup',9);
// Release outside the canvas, cancelled touches, and capture loss all finish edits.
for(const end of ['pointerup','pointercancel']){send(canvas,'pointerdown',1);send(root,end,1);assert.equal(input.registry.points.size,0);assert.equal(calls.at(-1)[0],'end');}
send(canvas,'pointerdown',1);send(canvas,'lostpointercapture',1);assert.equal(input.registry.points.size,0);assert.deepEqual(calls.at(-1),['end',true]);
// Safari-style touchend reconciles physical touches even if pointerup was missed.
send(canvas,'pointerdown',1,100,100);send(canvas,'pointerdown',2,200,100);root.dispatchEvent(event('touchend',0,0,0,{touches:[{clientX:100,clientY:100}]}));assert.equal(input.registry.points.size,1);root.dispatchEvent(event('touchend',0,0,0,{touches:[]}));assert.equal(input.registry.points.size,0);
// Touching a toolbar cannot inherit the canvas capture or camera gesture.
send(canvas,'pointerdown',1);send(canvas,'pointerdown',2);root.dispatchEvent(event('pointerdown',3,0,0,{target:{closest:()=>({})}}));assert.equal(input.registry.points.size,0);assert.equal(canvas.captured.size,0);
// Unknown pointer-up events must not terminate a different active gesture.
send(canvas,'pointerdown',1);let count=calls.length;send(root,'pointerup',99);assert.equal(calls.length,count);send(canvas,'pointermove',1,140,140);assert.deepEqual(calls.at(-1),['move',1]);
root.dispatchEvent(new Event('blur'));assert.equal(input.registry.points.size,0);input.dispose();
const registry=new PointerRegistry();registry.down(event('pointerdown',1));assert.equal(registry.metrics(),null);
console.log('PASS: pinch-to-single recovery, fresh primary touch cleanup, outside release, pointer cancellation, capture loss, physical touch reconciliation, toolbar reset, and unrelated pointer events.');
