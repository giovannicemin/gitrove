/* Pan, zoom and the two framings: fit the whole history, or sit on today. */

import { S } from './state.js';
import { $ } from './util.js';

/* ---------- pan / zoom ------------------------------------------- */
const svg = $('#svg');
export const applyTransform = () => $('#vp').setAttribute('transform',`translate(${S.tx},${S.ty}) scale(${S.k})`);
/* Panning repaints every vector on screen, so two things matter: do it at most
   once per frame, and make each repaint cheaper while the mouse is down. The
   fidelity comes back the moment it stops moving. */

let pending = 0;
function scheduleTransform(){
  if (pending) return;
  pending = requestAnimationFrame(() => { pending = 0; applyTransform(); });
}

let busy = 0, idle = 0;
function interacting(on){
  clearTimeout(idle);
  if (on){
    if (!busy++) document.body.classList.add('panning');
  } else {
    // one frame of grace, so a zoom made of many wheel ticks stays cheap throughout
    idle = setTimeout(() => { busy = 0; document.body.classList.remove('panning'); applyTransform(); }, 140);
  }
}

/* Pointer capture rather than window-level mouse listeners: the browser then
   guarantees the move and up events come back to us even when the pointer
   leaves the window, which is what used to leave the cursor stuck mid-grab. */

let drag = null;

function endDrag(){
  if (!drag) return;
  const id = drag.id;
  drag = null;                                   // before release, so the
  try { svg.releasePointerCapture(id); } catch {} // lostpointercapture no-ops
  svg.classList.remove('grabbing');
  interacting(false);
}

svg.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  drag = {id: e.pointerId, x: e.clientX, y: e.clientY, tx: S.tx, ty: S.ty};
  try { svg.setPointerCapture(e.pointerId); } catch {}
  svg.classList.add('grabbing');
  interacting(true);
});

svg.addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id) return;
  if (!(e.buttons & 1)) return endDrag();        // released somewhere we never heard about
  S.tx = drag.tx + (e.clientX - drag.x);
  S.ty = drag.ty + (e.clientY - drag.y);
  scheduleTransform();
});

for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'])
  svg.addEventListener(ev, e => { if (!drag || e.pointerId === drag.id) endDrag(); });

addEventListener('blur', endDrag);               // alt-tab away mid-drag
document.addEventListener('visibilitychange', () => { if (document.hidden) endDrag(); });

svg.addEventListener('wheel', e => {
  e.preventDefault();
  const r = svg.getBoundingClientRect();
  interacting(true);
  zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0016));
  interacting(false);
}, {passive:false});

function zoomAt(mx, my, factor){
  const k = Math.min(3, Math.max(0.18, S.k * factor)), f = k / S.k;
  S.tx = mx - (mx - S.tx) * f; S.ty = my - (my - S.ty) * f; S.k = k;
  scheduleTransform();
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
