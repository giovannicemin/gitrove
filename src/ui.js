/* Everything outside the canvas: header stats, the branch tree, the hover
   tooltip and the detail panel. */

import { CFG, DAY } from './config.js';
import { S } from './state.js';
import { $, parseDate, fmt } from './util.js';
import { bcol } from './color.js';
import { descendants, ancestry } from './tree.js';
import { focusBranch } from './camera.js';

/* ------------------------------------------------------------------ *
 * header + hierarchical sidebar
 * ------------------------------------------------------------------ */
export function paintHeader(){
  $('#pname').textContent = S.data.project.name;
  $('#psub').textContent  = S.data.project.subtitle || '';
  const done    = S.nodes.filter(n => n.status === 'done').length;
  const ahead   = S.nodes.filter(n => n.status !== 'done').length;
  const miles   = S.nodes.filter(n => (n.tags||[]).includes('milestone') && n.status === 'done').length;
  const merged  = [...S.branches.values()].filter(b => b.status === 'merged').length;
  const days    = Math.round((Date.now() - S.layout.t0) / DAY);
  $('#stats').innerHTML = [['hl',done,'done'],['',miles,'milestones'],['',merged,'merged'],
                           ['',ahead,'ahead'],['',days,'days in']]
    .map(([c,v,l]) => `<div class="chip ${c}"><b>${v}</b><span>${l}</span></div>`).join('');
}

export function subtreeNodeCount(bid){
  let n = S.layout.byBranch.get(bid).length;
  for (const c of descendants(bid)) n += S.layout.byBranch.get(c).length;
  return n;
}
export function paintSidebar(){
  const rows = [];
  (function walk(list, depth){
    for (const bid of list){
      const b = S.branches.get(bid), kids = S.tree.get(bid), col = bcol(b);
      const open = !S.collapsed.has(bid);
      const hidden = open ? 0 : subtreeNodeCount(bid) - S.layout.byBranch.get(bid).length;
      rows.push(`<div class="brow" data-b="${bid}" style="padding-left:${8 + depth*15}px">
        ${[...Array(depth)].map((_,i)=>`<span class="guide" style="left:${14 + i*15}px"></span>`).join('')}
        <span class="twist ${kids.length ? (open?'open':'') : 'leaf'}" data-t="${bid}">&#9656;</span>
        <span class="dot" style="background:${col}"></span>
        <span class="nm">${b.name}</span>
        ${b.status === 'active' ? '' : `<span class="st">${b.status}</span>`}
        <span class="ct">${S.layout.byBranch.get(bid).length}${hidden ? `<span style="opacity:.55">+${hidden}</span>` : ''}</span>
      </div>`);
      if (open) walk(kids, depth + 1);
    }
  })(S.roots, 0);
  $('#blist').innerHTML = rows.join('');

  $('#blist').querySelectorAll('.brow').forEach(el => {
    const bid = el.dataset.b;
    el.onmouseenter = () => setHover(bid);
    el.onmouseleave = () => setHover(null);
    el.onclick = e => {
      if (e.target.dataset.t){                              // the twisty
        S.collapsed.has(bid) ? S.collapsed.delete(bid) : S.collapsed.add(bid);
        paintSidebar(); setHover(null);
      } else focusBranch(bid);
    };
  });
}

export function setHover(bid){
  S.hover = bid;
  const keep = bid ? new Set([bid, ...descendants(bid)]) : null;
  document.querySelectorAll('[data-branch]').forEach(el =>
    el.classList.toggle('faded', !!keep && !keep.has(el.dataset.branch)));
  $('#blist').querySelectorAll('.brow').forEach(el =>
    el.classList.toggle('dim', !!keep && !keep.has(el.dataset.b)));
}

/* ------------------------------------------------------------------ *
 * render
 * ------------------------------------------------------------------ */

/* ---------- tooltip + detail ------------------------------------- */
export function showTip(n,e){
  const tip = $('#tip');
  tip.innerHTML = `<div class="h">${n.title}</div><div class="d">${n.desc || ''}</div>
    <div class="m">${S.branches.get(n.branch).name} · ${n.date ? fmt(parseDate(n.date)) : 'not scheduled'}</div>`;
  tip.style.opacity = 1; moveTip(e);
}
export function moveTip(e){
  const r = $('.canvas-wrap').getBoundingClientRect(), tip = $('#tip');
  tip.style.left = Math.min(e.clientX - r.left + 16, r.width - tip.offsetWidth - 12) + 'px';
  tip.style.top  = Math.min(e.clientY - r.top + 16, r.height - tip.offsetHeight - 12) + 'px';
}
export const hideTip = () => $('#tip').style.opacity = 0;

export function select(id){
  S.sel = id;
  document.querySelectorAll('.node').forEach(g => g.classList.toggle('sel', g.dataset.id === id));
  const n = S.byId.get(id), b = S.branches.get(n.branch);
  const list = S.layout.byBranch.get(n.branch);
  const crumb = ancestry(n.branch).map(x => `<b style="color:${bcol(S.branches.get(x))}">${S.branches.get(x).name}</b>`).join(' › ');
  const status = {done:'completed', current:'in progress', planned:'planned'}[n.status];
  $('#dbody').innerHTML = `
    <div class="crumb">${crumb}</div>
    <h2>${n.title}</h2>
    <div><span class="badge">${status}</span>${(n.tags||[]).map(t=>`<span class="badge">${t}</span>`).join('')}</div>
    ${n.desc ? `<div class="desc">${n.desc}</div>` : ''}
    <div class="meta">
      <div><span>Date</span><b>${n.date ? fmt(parseDate(n.date)) : '—'}</b></div>
      <div><span>Step on branch</span><b>${list.indexOf(n)+1} of ${list.length}</b></div>
      <div><span>Branch status</span><b>${b.status}</b></div>
      ${n.merges ? `<div><span>Merges in</span><b>${n.merges.map(m=>S.branches.get(m).name).join(', ')}</b></div>` : ''}
      ${S.tree.get(n.branch).length ? `<div><span>Sub-branches</span><b>${S.tree.get(n.branch).map(c=>S.branches.get(c).name).join(', ')}</b></div>` : ''}
    </div>`;
  $('#detail').classList.add('open');
}
$('#dclose').onclick = () => { $('#detail').classList.remove('open');
  document.querySelectorAll('.node.sel').forEach(g=>g.classList.remove('sel')); S.sel = null; };
