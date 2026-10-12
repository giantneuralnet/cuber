import assert from 'node:assert/strict';
import {decodeTexturePNG,encodeTexturePNG,textureUpscales} from '../dist/texture-upscale.js';
for(const size of [32,64,128,256,512,1024]){
 const pixels=Uint8Array.from({length:size*size*4},(_,i)=>{
  const p=i>>>2,x=p%size,y=Math.floor(p/size);
  return [x*17%256,y*31%256,(x+y)*29%256,[0,1,127,254,255][(x+y)%5]][i%4];
 });
 const png=encodeTexturePNG({width:size,height:size,pixels}),original=png.slice(),upscales=textureUpscales({'atlas.png':png},size);
 assert.deepEqual(Object.keys(upscales),[64,128,256,512,1024].filter(n=>n>size).map(n=>`textures/${n}/atlas.png`));
 for(const [name,bytes] of Object.entries(upscales)){
  const target=Number(name.split('/')[1]),image=decodeTexturePNG(bytes),factor=target/size;
  assert.equal(image.width,target);assert.equal(image.height,target);
  for(let y=0;y<target;y++)for(let x=0;x<target;x++){
   const src=(Math.floor(y/factor)*size+Math.floor(x/factor))*4,dst=(y*target+x)*4;
   for(let c=0;c<4;c++)assert.equal(image.pixels[dst+c],pixels[src+c],`${name} pixel ${x},${y} channel ${c}`);
  }
 }
 assert.deepEqual(png,original,'original PNG is untouched');
}
console.log('PASS every supported size, no redundant/downscaled outputs, exact nearest-neighbor blocks and all alpha values.');
