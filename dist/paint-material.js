import * as THREE from './vendor/three.module.js';

// Opaque texels write depth before any blended surfaces. A separate pass draws
// only partial alpha, so object-center sorting cannot paint a far cube over a
// nearer opaque face. Clear texels participate in neither pass.
export function createPaintMaterials(texture,{checker=false}={}){
 const shared={map:texture,roughness:.82,metalness:0,side:THREE.DoubleSide};
 const opaque=new THREE.MeshStandardMaterial({...shared,alphaTest:1,depthWrite:true});
 const translucent=new THREE.MeshStandardMaterial({...shared,transparent:true,alphaTest:1/255,depthWrite:false});
 translucent.onBeforeCompile=shader=>{
  shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>','#include <alphatest_fragment>\nif ( diffuseColor.a >= 1.0 ) discard;');
 };
 translucent.customProgramCacheKey=()=> 'cuber-partial-alpha-v1';
 if(checker){
  // Display only: the source/composited PNGs and FBX keep their real alpha.
  const size=new THREE.Vector2(texture.image.width,texture.image.height);opaque.userData.checkerSize=size;
  opaque.onBeforeCompile=shader=>{
   shader.uniforms.cuberTextureSize={value:size};
   shader.fragmentShader='uniform vec2 cuberTextureSize;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
    vec2 pixel = floor(vMapUv * cuberTextureSize);
    float square = mod(pixel.x + pixel.y, 2.0);
    vec3 checkerColor = mix(vec3(0.085), vec3(0.15), square);
    diffuseColor.rgb = mix(checkerColor, diffuseColor.rgb, diffuseColor.a);
    diffuseColor.a = 1.0;`);
  };
  opaque.customProgramCacheKey=()=> 'cuber-pixel-checker-v1';translucent.visible=false;
 }
 return {opaque,translucent};
}
