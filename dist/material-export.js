import {decodeTexturePNG,encodeTexturePNG} from './texture-upscale.js';
export const materialChannels=['emission','metalness'];
export const materialFilename=name=>name==='emission'?'emissive-mask.png':'metalness.png';
const bytes=png=>Uint8Array.from(atob(png.split(',')[1]),c=>c.charCodeAt(0));
export function materialDescription(state){
 const present=materialChannels.filter(name=>state.materialMaps?.[name]||state.paintLayer?.frames.some(f=>f[name]));
 if(!present.length)return null;
 return {version:1,uvLayout:'base-texture',colorSpace:'linear',emissiveStrength:1.5,channels:Object.fromEntries(present.map(name=>[name,{file:materialFilename(name),source:state.materialMaps?.[name]?`paint-material/base-${name}.png`:null}]))};
}
export function compositeMask(size,base,overlay){
 const a=base?decodeTexturePNG(bytes(base)):null,b=overlay?decodeTexturePNG(bytes(overlay)):null;
 for(const im of [a,b])if(im&&(im.width!==size||im.height!==size))throw Error('Material mask dimensions do not match the atlas');
 const pixels=new Uint8Array(size*size*4);
 for(let i=0;i<pixels.length;i+=4){const av=a?a.pixels[i]*a.pixels[i+3]/255:0,alpha=b?b.pixels[i+3]/255:0,value=Math.round((b?b.pixels[i]*alpha:0)+av*(1-alpha));pixels[i]=pixels[i+1]=pixels[i+2]=value;pixels[i+3]=255;}
 return encodeTexturePNG({width:size,height:size,pixels});
}
export function materialFiles(state,size){
 const description=materialDescription(state),sources={},textures={};if(!description)return {sources,textures};
 for(const [name,info] of Object.entries(description.channels)){
  const base=state.materialMaps?.[name];if(base)sources[info.source]=bytes(base);
  textures[info.file]=compositeMask(size,base);
  for(const [i,frame] of (state.paintLayer?.frames||[]).entries())if(frame[name]){
   sources[`paint-layer/frame-${i}-${name}.png`]=bytes(frame[name]);
   textures[`materials/frame-${i}-${materialFilename(name)}`]=compositeMask(size,base,frame[name]);
  }
 }
 return {sources,textures};
}
export function materialFrameFiles(state,index){const desc=materialDescription(state);if(!desc)return {};return Object.fromEntries(Object.entries(desc.channels).map(([name,info])=>[name,index>=0&&state.paintLayer?.frames[index]?.[name]?`materials/frame-${index}-${materialFilename(name)}`:info.file]));}
