// The first tap fills immediately. A matching second tap expands the stroke
// without applying opacity to the first face twice.
export class FillTap {
 last=null;
 take(key,x,y,time){const old=this.last;this.last=null;return old&&old.key===key&&time-old.time<=350&&Math.hypot(x-old.x,y-old.y)<=24?old:null;}
 remember(key,x,y,time,painted){this.last={key,x,y,time,painted:new Set(painted)};}
 reset(){this.last=null;}
}
