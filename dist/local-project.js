export const AUTOSAVE_KEY='cube-studio.current-project.v1';
export class LocalProjectAutosave {
  constructor({storage,snapshot,onError,delay=250,setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=id=>clearTimeout(id)}){Object.assign(this,{storage,snapshot,onError,delay,setTimer,clearTimer});this.ready=false;this.dirty=false;this.timer=null;this.failed=false;}
  read(){return this.storage().getItem(AUTOSAVE_KEY);}
  schedule(){if(!this.ready)return;this.dirty=true;this.clearTimer(this.timer);this.timer=this.setTimer(()=>this.flush(),this.delay);}
  flush(){this.clearTimer(this.timer);this.timer=null;if(!this.ready||!this.dirty)return;try{const data=JSON.stringify(this.snapshot());this.storage().setItem(AUTOSAVE_KEY,data);this.dirty=false;this.failed=false;}catch(error){if(!this.failed)this.onError?.(error);this.failed=true;}}
}
