import {unzlibSync,zlibSync} from './vendor/fflate.js';

// Canvas PNGs use non-interlaced 8-bit samples. Work on those bytes directly so
// transparent RGB and partial alpha stay exact (no canvas premultiplication).
const signature=new Uint8Array([137,80,78,71,13,10,26,10]);
const join=arrays=>{const out=new Uint8Array(arrays.reduce((n,a)=>n+a.length,0));let i=0;for(const a of arrays){out.set(a,i);i+=a.length;}return out;};
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n;});
function chunk(type,data){
 const out=new Uint8Array(data.length+12),view=new DataView(out.buffer);view.setUint32(0,data.length);
 out.set(Array.from(type,c=>c.charCodeAt(0)),4);out.set(data,8);let crc=0xffffffff;
 for(let i=4;i<out.length-4;i++)crc=crcTable[(crc^out[i])&255]^(crc>>>8);
 view.setUint32(out.length-4,(crc^0xffffffff)>>>0);return out;
}
const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
export function decodeTexturePNG(png){
 if(!signature.every((b,i)=>png[i]===b))throw Error('Invalid texture PNG');
 const view=new DataView(png.buffer,png.byteOffset,png.byteLength),idat=[],colorChunks=[];
 let width,height,channels,type,palette,alpha;
 for(let offset=8;offset+12<=png.length;){
  const length=view.getUint32(offset),end=offset+12+length;
  if(end>png.length)throw Error('Truncated texture PNG');
  const name=String.fromCharCode(...png.subarray(offset+4,offset+8)),data=png.subarray(offset+8,end-4);
  if(name==='IHDR'){
   width=view.getUint32(offset+8);height=view.getUint32(offset+12);type=data[9];channels=({0:1,2:3,3:1,4:2,6:4})[type];
   if(data[8]!==8||data[10]||data[11]||data[12]||!channels||!width||!height||width>4096||height>4096)throw Error('Unsupported texture PNG');
  }else if(name==='IDAT')idat.push(data);
  else if(name==='PLTE')palette=data;
  else if(name==='tRNS')alpha=data;
  else if(['sRGB','gAMA','cHRM','iCCP'].includes(name))colorChunks.push(png.slice(offset,end));
  offset=end;if(name==='IEND')break;
 }
 if(!channels||!idat.length)throw Error('Incomplete texture PNG');
 const stride=width*channels,raw=unzlibSync(join(idat));
 if(raw.length!==(stride+1)*height)throw Error('Invalid texture pixels');
 const samples=new Uint8Array(stride*height),pixels=new Uint8Array(width*height*4);
 for(let y=0;y<height;y++){
  const filter=raw[y*(stride+1)];if(filter>4)throw Error('Invalid PNG filter');
  for(let x=0;x<stride;x++){
   const i=y*stride+x,a=x>=channels?samples[i-channels]:0,b=y?samples[i-stride]:0,c=y&&x>=channels?samples[i-stride-channels]:0;
   samples[i]=raw[y*(stride+1)+1+x]+[0,a,b,(a+b)>>>1,paeth(a,b,c)][filter];
  }
 }
 for(let i=0,j=0;i<samples.length;i+=channels,j+=4){
  const a=samples[i],b=samples[i+1],c=samples[i+2];let r=a,g=a,blue=a,opacity=255;
  if(type===6||type===2){g=b;blue=c;opacity=type===6?samples[i+3]:alpha&&a===alpha[1]&&b===alpha[3]&&c===alpha[5]?0:255;}
  else if(type===4)opacity=b;
  else if(type===0&&alpha&&a===alpha[1])opacity=0;
  else if(type===3){if(!palette||a*3+2>=palette.length)throw Error('Invalid texture palette');r=palette[a*3];g=palette[a*3+1];blue=palette[a*3+2];opacity=alpha?.[a]??255;}
  pixels.set([r,g,blue,opacity],j);
 }
 return {width,height,pixels,colorChunks};
}
export function encodeTexturePNG({width,height,pixels,colorChunks=[]}){
 const header=new Uint8Array(13),view=new DataView(header.buffer);view.setUint32(0,width);view.setUint32(4,height);header[8]=8;header[9]=6;
 const stride=width*4,raw=new Uint8Array((stride+1)*height);
 for(let y=0;y<height;y++){
  const start=y*(stride+1);raw[start]=1;
  for(let x=0;x<stride;x++)raw[start+1+x]=pixels[y*stride+x]-(x>=4?pixels[y*stride+x-4]:0);
 }
 return join([signature,chunk('IHDR',header),...colorChunks,chunk('IDAT',zlibSync(raw,{level:6})),chunk('IEND',new Uint8Array())]);
}
export function textureUpscales(files,sourceSize){
 const sizes=[64,128,256,512,1024].filter(size=>size>sourceSize),out={};
 if(!sizes.length)return out;
 for(const [name,png] of Object.entries(files)){
  const image=decodeTexturePNG(png);
  for(const size of sizes){
   const width=size,height=Math.round(image.height*size/image.width),pixels=new Uint8Array(width*height*4);
   for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const source=(Math.floor(y*image.height/height)*image.width+Math.floor(x*image.width/width))*4;
    pixels.set(image.pixels.subarray(source,source+4),(y*width+x)*4);
   }
   out[`textures/${size}/${name}`]=encodeTexturePNG({width,height,pixels,colorChunks:image.colorChunks});
  }
 }
 return out;
}
