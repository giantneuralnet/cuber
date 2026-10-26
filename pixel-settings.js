export const FACE_PIXELS=[4,8,16,32,64];
export const PIXEL_SNAPS=[0,1,2,4,8,16,32];
export const AUTO_ATLAS_SIZES=[4,8,16,32,64,128,256,512,1024,2048,4096];
export function migratePixelSettings(state){
 if(!Number.isFinite(state.pixelDensity)||state.pixelDensity<=0||state.pixelDensity>64)state.pixelDensity=state.atlasLayout?.density||Math.min(64,(state.textureSize||512)/32);
 if(!PIXEL_SNAPS.includes(state.snapPixels)){
  const pixels=(state.gridSize??1/state.pixelDensity)*state.pixelDensity;
  state.snapPixels=pixels===0?0:PIXEL_SNAPS.slice(1).reduce((a,b)=>Math.abs(a-pixels)<=Math.abs(b-pixels)?a:b);
 }
 state.gridSize=state.snapPixels/state.pixelDensity;
 return state;
}
