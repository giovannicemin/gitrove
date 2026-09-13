/* Pan, zoom and the two framings: fit the whole history, or sit on today. */

import { S } from './state.js';
import { $ } from './util.js';

/* ---------- pan / zoom ------------------------------------------- */
const svg = $('#svg');
export const applyTransform = () => $('#vp').setAttribute('transform',`translate(${S.tx},${S.ty}) scale(${S.k})`);
let drag = null;
svg.addEventListener('mousedown', e => { drag={x:e.clientX,y:e.clientY,tx:S.tx,ty:S.ty}; svg.classList.add('grabbing'); });
addEventListener('mousemove', e => { if (!drag) return;
  S.tx = drag.tx + (e.clientX-drag.x); S.ty = drag.ty + (e.clientY-drag.y); applyTransform(); });
addEventListener('mouseup', () => { drag=null; svg.classList.remove('grabbing'); });
svg.addEventListener('wheel', e => { e.preventDefault();
  const r = svg.getBoundingClientRect();
  zoomAt(e.clientX-r.left, e.clientY-r.top, Math.exp(-e.deltaY*0.0016)); }, {passive:false});
export function zoomAt(mx,my,factor){
  const k = Math.min(3, Math.max(0.18, S.k*factor)), f = k/S.k;
  S.tx = mx-(mx-S.tx)*f; S.ty = my-(my-S.ty)*f; S.k = k; applyTransform();
}
$('#zin').onclick  = () => { const r=svg.getBoundingClientRect(); zoomAt(r.width/2,r.height/2,1.3); };
$('#zout').onclick = () => { const r=svg.getBoundingClientRect(); zoomAt(r.width/2,r.height/2,1/1.3); };
$('#fit').onclick  = fit;
$('#home').onclick = home;

export function fit(){
  const r = svg.getBoundingClientRect(), L = S.layout;
  S.k = Math.max(0.18, Math.min(r.width/(L.width+60), r.height/(L.height+40), 1.4));
  S.tx = (r.width - L.width*S.k)/2; S.ty = (r.height - L.height*S.k)/2 + 6;
  applyTransform();
}
export function home(){          // readable zoom, parked on the present and on whatever is live
  const r = svg.getBoundingClientRect(), L = S.layout;
  S.k = Math.min(1, Math.max(0.55, r.height / (L.height * 0.62)));
  const live = S.nodes.find(n => n.status === 'current') || S.nodes[0];
  S.tx = r.width * 0.72 - L.nowX * S.k;
  S.ty = Math.min(8, r.height / 2 - live.y * S.k);
  applyTransform();
}
export function focusBranch(bid){
  const list = S.layout.byBranch.get(bid); if (!list.length) return;
  const r = svg.getBoundingClientRect(), sp = S.layout.spans.find(s => s.bid === bid);
  S.k = Math.min(1.4, Math.max(.5, r.width/(sp.hi - sp.title.left + 260)));
  S.tx = r.width/2 - ((sp.title.left + sp.hi)/2)*S.k;
  S.ty = r.height/2 - S.layout.laneY.get(bid)*S.k;
  applyTransform();
}
