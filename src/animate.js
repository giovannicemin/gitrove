/* Moves the picture from one layout to the next.

   Everything is keyed off how far each node travelled, so labels, leaders,
   bands, titles and edge curves all ride along with the nodes they belong to
   rather than being animated independently. */

import { S } from './state.js';
import { edgePath, deadPath } from './render.js';

const SPRING = { zeta: .66, omega: 12, stagger: .18 };

/** damped harmonic oscillator, normalised: 0 at rest, 1 when settled.
 *  Underdamped on purpose — it overshoots a little and comes back. */
function spring(t){
  if (t <= 0) return 0;
  const { zeta: z, omega: w } = SPRING;
  const wd = w * Math.sqrt(1 - z*z);
  return 1 - Math.exp(-z*w*t) * (Math.cos(wd*t) + (z*w/wd) * Math.sin(wd*t));
}
const SETTLE = 5 / (SPRING.zeta * SPRING.omega);       // ~0.63s to come to rest

const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let running = 0;

/** run `apply` (a relayout + redraw), then spring the drawing from where it
 *  used to be to where it now is */
export function transition(apply){
  const was = new Map(S.nodes.map(n => [n.id, {x:n.x, y:n.y}]));
  const calendarWas = (S.layout?.months || []).map(m => m.x).join();

  apply();

  const L = S.layout, gfx = L.gfx;
  if (!gfx || still()) return;

  // how far did each node travel, and did anything actually move?
  const from = new Map();
  let moved = false;
  for (const n of S.nodes){
    const w = was.get(n.id) || {x:n.x, y:n.y};
    from.set(n.id, w);
    if (Math.hypot(w.x - n.x, w.y - n.y) > .5) moved = true;
  }
  if (!moved) return;

  // left-to-right ripple: a node's spring starts a little after the one before it
  const delay = new Map(S.nodes.map(n => [n.id, SPRING.stagger * (n.x / Math.max(L.width, 1))]));
  const calendarMoved = calendarWas !== L.months.map(m => m.x).join();
  const total = SPRING.stagger + SETTLE;
  const token = ++running;
  const t0 = performance.now();

  const at = (n, now) => {
    const f = spring(now - delay.get(n.id));
    const w = from.get(n.id);
    return {x: n.x + (w.x - n.x) * (1 - f), y: n.y + (w.y - n.y) * (1 - f)};
  };

  (function frame(){
    if (token !== running) return;                      // a newer transition took over
    const now = (performance.now() - t0) / 1000;
    const done = now >= total;
    const pos = new Map(S.nodes.map(n => [n.id, done ? {x:n.x, y:n.y} : at(n, now)]));
    const slide = (rec) => {                            // offset from the node it belongs to
      const n = S.byId.get(rec.id), p = pos.get(rec.id);
      return {dx: p.x - n.x, dy: p.y - n.y};
    };

    for (const [id, g] of gfx.nodes){
      const p = pos.get(id);
      g.setAttribute('transform', `translate(${p.x},${p.y})`);
    }
    for (const e of gfx.edges)
      e.el.setAttribute('d', edgePath(pos.get(e.from.id), pos.get(e.to.id), e.straight));
    for (const t of gfx.texts){
      const { dx, dy } = slide(t);
      t.el.setAttribute('x', t.x + dx); t.el.setAttribute('y', t.y + dy);
    }
    for (const l of gfx.leaders){
      const { dx, dy } = slide(l);
      l.el.setAttribute('x1', l.x + dx); l.el.setAttribute('x2', l.x + dx);
      l.el.setAttribute('y1', l.y1 + dy); l.el.setAttribute('y2', l.y2 + dy);
    }
    for (const b of gfx.bands){
      const { dx, dy } = slide(b);
      b.el.setAttribute('x', b.x + dx); b.el.setAttribute('y', b.y + dy);
    }
    for (const d of gfx.deads){
      const p = pos.get(d.id);
      d.el.setAttribute('d', deadPath(p.x, p.y));
    }
    // the calendar cannot travel — a month tick in one spacing is not the same
    // tick in the other — so it dips out and comes back instead
    if (calendarMoved){
      const o = done ? 1 : 1 - .8 * Math.sin(Math.PI * Math.min(now / total, 1));
      for (const c of gfx.calendar) c.setAttribute('opacity', o);
    }
    if (!done) requestAnimationFrame(frame);
  })();
}
