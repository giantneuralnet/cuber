import * as THREE from './vendor/three.module.js';

// Opaque texels write depth before any blended surfaces. A separate pass draws
// only partial alpha, so object-center sorting cannot paint a far cube over a
// nearer opaque face. Clear texels participate in neither pass.
export function createPaintMaterials(texture,{checker=false,emission=null,metalness=null}={}){
 const shared={map:texture,roughness:.82,metalness:metalness?1:0,metalnessMap:metalness,emissive:emission?0xffffff:0,emissiveIntensity:1.5,emissiveMap:emission,side:THREE.DoubleSide};
 const opaque=new THREE.MeshStandardMaterial({...shared,alphaTest:1,depthWrite:true});
 const translucent=new THREE.MeshStandardMaterial({...shared,transparent:true,alphaTest:1/255,depthWrite:false});
 translucent.onBeforeCompile=shader=>{
  shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>','#include <alphatest_fragment>\nif ( diffuseColor.a >= 1.0 ) discard;');
 };
 translucent.customProgramCacheKey=()=> 'cuber-partial-alpha-v1';
 if(checker){
  // Display only: the source/composited PNGs and FBX keep their real alpha.
  const size=new THREE.Vector2(texture.image.width,texture.image.height);opaque.userData.checkerSize=size;const preview={value:false};opaque.userData.resizePreview=preview;
  opaque.onBeforeCompile=shader=>{
   shader.uniforms.cuberTextureSize={value:size};shader.uniforms.cuberResizePreview=preview;
   shader.vertexShader='attribute vec2 cuberFaceUV; attribute vec4 cuberFaceRect; attribute vec2 cuberFaceSpan; varying vec2 faceUV; varying vec4 faceRect; varying vec2 faceSpan;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\nfaceUV=cuberFaceUV;faceRect=cuberFaceRect;faceSpan=cuberFaceSpan;');
   shader.fragmentShader='uniform vec2 cuberTextureSize; uniform bool cuberResizePreview; varying vec2 faceUV; varying vec4 faceRect; varying vec2 faceSpan;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`vec2 cuberMaterialUV=vMapUv;
    vec2 pixel = min(floor(faceUV * faceSpan), max(vec2(0.0), ceil(faceSpan - 0.00001) - 1.0));
    if(cuberResizePreview){
      vec2 extent = max(vec2(1.0), ceil(faceSpan - 0.00001));
      vec2 oldPixel = floor((pixel + 0.5) * faceRect.zw / extent);
      vec2 sampleUV = (faceRect.xy + oldPixel + 0.5) / cuberTextureSize;
      sampleUV.y = 1.0 - sampleUV.y; cuberMaterialUV=sampleUV;
      diffuseColor *= texture2D(map, sampleUV);
    }else{
      #include <map_fragment>
    }
    vec3 cuberEmissionColor = diffuseColor.rgb * diffuseColor.a;
    float square = mod(pixel.x + pixel.y, 2.0);
    vec3 checkerColor = mix(vec3(0.085), vec3(0.15), square);
    diffuseColor.rgb = mix(checkerColor, diffuseColor.rgb, diffuseColor.a);
    diffuseColor.a = 1.0;`);
  };
  opaque.customProgramCacheKey=()=> 'cuber-pixel-checker-v1';translucent.visible=false;
 }
 for(const mat of [opaque,translucent]){const previous=mat.onBeforeCompile;mat.onBeforeCompile=shader=>{previous(shader);const uv=checker&&mat===opaque?'cuberMaterialUV':null;
  shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#ifdef USE_EMISSIVEMAP
 totalEmissiveRadiance *= texture2D(emissiveMap, ${uv||'vEmissiveMapUv'}).rgb * ${checker&&mat===opaque?'cuberEmissionColor':'diffuseColor.rgb'};
 #endif`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>',`float metalnessFactor = metalness;
 #ifdef USE_METALNESSMAP
 metalnessFactor *= texture2D(metalnessMap, ${uv||'vMetalnessMapUv'}).g;
 #endif
 roughnessFactor = mix(roughnessFactor, 0.3, metalnessFactor);`);
 };const key=mat.customProgramCacheKey.bind(mat);mat.customProgramCacheKey=()=>key()+'-material-masks-v1';}
 return {opaque,translucent};
}

// Neutral studio reflections for metallic paint; never changes the background.
export function createPaintEnvironment(renderer){
 const width=128,height=64,data=new Uint8Array(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const u=x/width,v=y/height,sky=.05+.2*Math.max(0,1-v*1.8);
  const panel=(Math.abs(u-.2)<.08||Math.abs(u-.7)<.11)&&v>.15&&v<.52?1.0:0;
  const value=Math.round(Math.min(1,sky+panel)*255),i=(y*width+x)*4;data.set([value,value,value,255],i);
 }
 const source=new THREE.DataTexture(data,width,height);source.mapping=THREE.EquirectangularReflectionMapping;source.needsUpdate=true;
 const generator=new THREE.PMREMGenerator(renderer),environment=generator.fromEquirectangular(source);source.dispose();generator.dispose();return environment;
}
