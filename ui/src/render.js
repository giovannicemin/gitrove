/* Draws the layout into SVG. Reads positions, never computes them. */

import { CFG } from './config.js';
import { S } from './state.js';
import { $, el } from './util.js';
import { bcol } from './color.js';
import { ctrlOffset } from './layout.js';
import { applyTransform } from './camera.js';
import { select, showTip, moveTip, hideTip } from './ui.js';

/** the two segments of an abandoned branch's terminator */
export const deadPath = (x, y) =>
  `M${x + CFG.r + 5},${y} L${x + CFG.deadEnd},${y} M${x + CFG.deadEnd},${y-10} L${x + CFG.deadEnd},${y+10}`;

/** the shape of an edge between two points — shared with the animator */
export const edgePath = (a, b, straight) => {
  const c = ctrlOffset(b.x - a.x);
  return straight ? `M${a.x},${a.y} L${b.x},${b.y}`
                  : `M${a.x},${a.y} C${a.x+c},${a.y} ${b.x-c},${b.y} ${b.x},${b.y}`;
};

/* A connector passes behind every branch band, which would also hide the bit
   that meets its own nodes at either end. So it is drawn three times: once in
   full underneath, then its first and last stretch again on top — just far
   enough to clear the band it starts and ends on. */

const ctrlPts = (a, b) => {
  const c = ctrlOffset(b.x - a.x);
  return [[a.x, a.y], [a.x + c, a.y], [b.x - c, b.y], [b.x, b.y]];
};
const cubicY = (P, t) => { const u = 1 - t;
  return u*u*u*P[0][1] + 3*u*u*t*P[1][1] + 3*u*t*t*P[2][1] + t*t*t*P[3][1]; };
const splitAt = (P, t) => {
  const L = (p, q) => [p[0] + (q[0]-p[0])*t, p[1] + (q[1]-p[1])*t];
  const a = L(P[0],P[1]), b = L(P[1],P[2]), c = L(P[2],P[3]);
  const d = L(a,b), e = L(b,c), f = L(d,e);
  return {head: [P[0],a,d,f], tail: [f,e,c,P[3]]};
};
const dOf = P => `M${P[0][0]},${P[0][1]} C${P[1][0]},${P[1][1]} ${P[2][0]},${P[2][1]} ${P[3][0]},${P[3][1]}`;

/** how far along before the curve has dropped `dy` away from the end it started at */
function tPast(P, dy, fromEnd){
  const y0 = fromEnd ? P[3][1] : P[0][1];
  for (let i = 1; i <= 28; i++){
    const t = fromEnd ? 1 - i/28 : i/28;
    if (Math.abs(cubicY(P, t) - y0) >= dy) return t;
  }
  return fromEnd ? 0.62 : 0.38;
}
const CLEAR = CFG.bandH / 2 + 5;                  // enough to emerge from the band

export const edgeHead = (a, b) => { const P = ctrlPts(a, b);
  return dOf(splitAt(P, tPast(P, CLEAR, false)).head); };
export const edgeTail = (a, b) => { const P = ctrlPts(a, b);
  return dOf(splitAt(P, tPast(P, CLEAR, true)).tail); };

export function render(){
  const vp = $('#vp'); vp.textContent = '';
  const L = S.layout;
  // handles the animator moves between layouts; nothing else reads them
  const gfx = L.gfx = {nodes:new Map(), edges:[], texts:[], leaders:[], bands:[], deads:[], calendar:[]};

  L.months.forEach(m => {
    const g = el('line',{class:'grid-line',x1:m.x,y1:CFG.padTop-40,x2:m.x,y2:L.height});
    const t = el('text',{class:'grid-label',x:m.x+7,y:CFG.padTop-46});
    t.textContent = m.year ? `${m.label} ${m.year}` : m.label;
    vp.append(g); vp.append(t); gfx.calendar.push(g, t);
  });

  const nw = el('line',{class:'now-line',x1:L.nowX,y1:CFG.padTop-44,x2:L.nowX,y2:L.height});
  const nl = el('text',{class:'now-label',x:L.nowX+7,y:L.height-14}); nl.textContent='TODAY';
  vp.append(nw); vp.append(nl); gfx.calendar.push(nw, nl);

  // describe every edge once, then lay them down in three passes
  const edges = L.edges.map(({from, to}) => {
    const same   = from.branch === to.branch;
    const isFork = !same && L.byBranch.get(to.branch)[0] === to;
    const cid    = same ? to.branch : (isFork ? to.branch : from.branch);
    const col    = S.branches.get(cid);
    return {from, to, cid, col, straight: from.y === to.y, ghost: to.status === 'planned'};
  });
  const line = (e, d, kind) => {
    const p = el('path', {class: 'edge' + (e.ghost ? ' ghost' : ''), 'data-branch': e.cid, d,
                          stroke: bcol(e.col), opacity: e.col.status === 'abandoned' ? .5 : 1});
    vp.append(p);
    gfx.edges.push({el: p, from: e.from, to: e.to, straight: e.straight, kind});
  };

  // 1. connectors in full, to be covered by the bands
  for (const e of edges) if (!e.straight) line(e, edgePath(e.from, e.to, false), 'full');

  // 2. the bands. Each is an opaque panel in the page colour with the branch
  //    tint over it — a 5% wash cannot hide a line, a solid panel can
  L.spans.forEach(sp => {
    const b = S.branches.get(sp.bid), col = bcol(b), y = L.laneY.get(sp.bid);
    const hi   = sp.bid === S.roots[0] ? L.width - 60 : sp.hi;
    const left = sp.title.left - 14;                       // the band starts at the title
    const anchor = L.byBranch.get(sp.bid)[0];              // the band rides with the branch
    const box = {x:left, y:y - CFG.bandH/2, width:hi - left + 26, height:CFG.bandH, rx:CFG.bandH/2};
    const back = el('rect',{class:'lane-back','data-branch':sp.bid, ...box});
    const rect = el('rect',{class:'lane-band','data-branch':sp.bid, ...box, fill:col});
    vp.append(back); vp.append(rect);
    gfx.bands.push({el:back, x:box.x, y:box.y, id:anchor.id},
                   {el:rect, x:box.x, y:box.y, id:anchor.id});
    sp.title.lines.forEach((ln,i) => {
      const ty = y + 4 - (sp.title.lines.length-1)*7 + i*CFG.lineH;
      const t = el('text',{class:'branch-name','data-branch':sp.bid,'text-anchor':'end',
                           x:sp.title.right, y:ty,
                           fill:col, opacity: b.status === 'abandoned' ? .65 : 1});
      t.textContent = ln; vp.append(t);
      gfx.texts.push({el:t, x:sp.title.right, y:ty, id:anchor.id});
    });
  });


  // 3. the ends of each connector again, on top, so it still meets its nodes
  for (const e of edges) if (!e.straight){
    line(e, edgeHead(e.from, e.to), 'head');
    line(e, edgeTail(e.from, e.to), 'tail');
  }

  // and the in-lane segments, which belong on top of their own band
  for (const e of edges) if (e.straight) line(e, edgePath(e.from, e.to, true), 'straight');

  // an abandoned branch stops dead: a short stub and a bar across it
  L.spans.forEach(sp => {
    const b = S.branches.get(sp.bid);
    if (b.status !== 'abandoned') return;
    const list = L.byBranch.get(sp.bid), last = list[list.length-1];
    const p = el('path',{class:'dead-end','data-branch':sp.bid,stroke:bcol(b),
                         d:deadPath(last.x, last.y)});
    vp.append(p); gfx.deads.push({el:p, id:last.id});
  });

  S.nodes.forEach(n => {
    const b = S.branches.get(n.branch), col = bcol(b);
    const ms = (n.tags||[]).includes('milestone');
    const r  = ms ? CFG.rMile : CFG.r;

    if (n.label){
      const up  = n.label.side !== 'below';   // 'left' also hangs above the line
      const top = n.y + n.label.offset - (up ? (n.label.lines.length-1)*CFG.lineH : 0);
      if (n.label.tier > 0){
        const y1 = n.y + (up ? -r-3 : r+3), y2 = n.y + n.label.offset + (up ? 4 : -CFG.lineH);
        const ld = el('line',{class:'leader','data-branch':n.branch,x1:n.x,y1,x2:n.x,y2,stroke:col});
        vp.append(ld); gfx.leaders.push({el:ld, x:n.x, y1, y2, id:n.id});
      }
      const lft = n.label.side === 'left';
      n.label.lines.forEach((ln,i) => {
        const tx = lft ? n.label.right : n.label.left, ty = top + i*CFG.lineH;
        const t = el('text',{class:'lbl'+(ms?' milestone':'')+(n.status==='planned'?' ghost':''),
                             'data-branch':n.branch, x:tx, y:ty, ...(lft ? {'text-anchor':'end'} : {})});
        t.textContent = ln; vp.append(t);
        gfx.texts.push({el:t, x:tx, y:ty, id:n.id});
      });
    }

    const g = el('g',{class:`node ${n.status}`,'data-branch':n.branch,'data-id':n.id,
                      transform:`translate(${n.x},${n.y})`});
    g.append(el('circle',{class:'halo',r:r+6,stroke:col}));
    if (n.status === 'current') g.append(el('circle',{class:'ring',r:r+7,stroke:col}));
    g.append(el('circle',{class:'core',r,fill:col,...(n.status==='planned'?{stroke:col}:{})}));
    if (ms && n.status !== 'planned') g.append(el('circle',{class:'mile-core',r:r-5,opacity:.7}));
    g.append(el('circle',{r:r+11,fill:'transparent'}));
    vp.append(g); gfx.nodes.set(n.id, g);
  });

  vp.querySelectorAll('.node').forEach(g => {
    const n = S.byId.get(g.dataset.id);
    g.onclick      = e => { e.stopPropagation(); select(n.id); };
    g.onmouseenter = e => showTip(n,e);
    g.onmousemove  = moveTip;
    g.onmouseleave = hideTip;
  });
  if (S.sel) document.querySelector(`.node[data-id="${S.sel}"]`)?.classList.add('sel');
  applyTransform();
}
