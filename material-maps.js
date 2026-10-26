import * as THREE from './vendor/three.module.js';
import {PaintLayerSurface} from './paint-layer.js?v=9';
import {padFace} from './atlas-layout.js?v=4';
export const MATERIAL_CHANNELS=['emission','metalness'];
const makeCanvas=()=>document.createElement('canvas');
// Each material channel has a base atlas and the same overlay frames as color.
export class MaterialMaps {
 constructor(getState,getLayer){
  this.getState=getState;this.maps={};
  for(const name of MATERIAL_CHANNELS){const base=makeCanvas(),surface=new PaintLayerSurface(base,getLayer,name),hover=makeCanvas(),texture=new THREE.CanvasTexture(surface.composite);texture.magFilter=texture.minFilter=THREE.NearestFilter;texture.generateMipmaps=false;this.maps[name]={base,surface,hover,texture,active:null,dirty:false};}
 }
 async prepare(){for(const [name,m] of Object.entries(this.maps)){const png=this.getState().materialMaps?.[name]||'';await m.surface.prepare({frames:[{[name]:png}]});await m.surface.prepare();m.active=null;this.syncBase(name);}}
 syncBase(name){const m=this.maps[name],s=this.getState(),png=s.materialMaps?.[name]||'',key=png+'|'+s.textureSize;if(m.active===key)return;m.base.width=m.base.height=s.textureSize;const source=m.surface.source(png);if(source)m.base.getContext('2d').drawImage(source,0,0,s.textureSize,s.textureSize);m.active=key;m.surface.active=null;m.dirty=false;}
 canvas(name,target,preview=false){const m=this.maps[name];this.syncBase(name);m.surface.sync();return preview?m.hover:target==='layer'?m.surface.edit:m.base;}
 touch(target){for(const m of Object.values(this.maps))if(target==='layer')m.surface.touch();else m.dirty=true;}
 flush(){for(const [name,m] of Object.entries(this.maps)){m.surface.flush();if(!m.dirty)continue;const png=m.base.toDataURL('image/png'),copy=makeCanvas();copy.width=copy.height=m.base.width;copy.getContext('2d').drawImage(m.base,0,0);m.surface.cache.set(png,copy);(this.getState().materialMaps??={})[name]=png;m.active=png+'|'+m.base.width;m.dirty=false;}}
 repack(boxes,layout,oldLayout){this.flush();for(const [name,m] of Object.entries(this.maps)){const s=this.getState(),png=s.materialMaps?.[name];if(png)(s.materialMaps??={})[name]=m.surface.remap(png,boxes,layout,oldLayout);m.surface.repack(boxes,layout,oldLayout);m.active=null;}}
 preview(target){for(const name of MATERIAL_CHANNELS){const m=this.maps[name],source=this.canvas(name,target);m.hover.width=m.hover.height=source.width;m.hover.getContext('2d').drawImage(source,0,0);}}
 compose(index,target,preview){for(const name of MATERIAL_CHANNELS){this.syncBase(name);const m=this.maps[name];m.surface.compose(index,preview?m.hover:null,preview?target:null);const ctx=m.surface.composite.getContext('2d');ctx.save();ctx.globalCompositeOperation='destination-over';ctx.fillStyle='#000';ctx.fillRect(0,0,m.base.width,m.base.height);ctx.restore();m.texture.needsUpdate=true;}}
 pad(touched,target,preview){for(const name of MATERIAL_CHANNELS){const c=this.canvas(name,target,preview);for(const r of touched.values())padFace(c.getContext('2d'),c,r);}}
 prune(){for(const [name,m] of Object.entries(this.maps)){const keep=new Set([this.getState().materialMaps?.[name],...m.surface.getLayer().frames.map(f=>f[name])]);for(const key of m.surface.cache.keys())if(!keep.has(key))m.surface.cache.delete(key);}}
}
