import * as THREE from './vendor/three.module.js';

// Opaque texels write depth before any blended surfaces. A separate pass draws
// only partial alpha, so object-center sorting cannot paint a far cube over a
// nearer opaque face. Clear texels participate in neither pass.
export function createPaintMaterials(texture){
 const shared={map:texture,roughness:.82,metalness:0,side:THREE.DoubleSide};
 const opaque=new THREE.MeshStandardMaterial({...shared,alphaTest:1,depthWrite:true});
 const translucent=new THREE.MeshStandardMaterial({...shared,transparent:true,alphaTest:1/255,depthWrite:false});
 translucent.onBeforeCompile=shader=>{
  shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>','#include <alphatest_fragment>\nif ( diffuseColor.a >= 1.0 ) discard;');
 };
 translucent.customProgramCacheKey=()=> 'cuber-partial-alpha-v1';
 return {opaque,translucent};
}
