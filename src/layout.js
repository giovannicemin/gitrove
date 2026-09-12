/* The layout engine: dates to x, branches to lanes, titles and labels to
   positions that do not collide. Pure geometry — it draws nothing. */

import { CFG, DAY, FONT_LBL, FONT_BR } from './config.js';
import { S } from './state.js';
import { parseDate, measure, wrap } from './util.js';

/* ------------------------------------------------------------------ *
 * layout
 * ------------------------------------------------------------------ */
export function layout(){
  const byBranch = new Map([...S.branches.keys()].map(b => [b, []]));
  S.nodes.forEach(n => byBranch.get(n.branch).push(n));
  for (const list of byBranch.values())
    list.sort((a,b) => a.date && b.date ? parseDate(a.date) - parseDate(b.date) : a.date ? -1 : b.date ? 1 : 0);

  // --- derive parents: chain in a branch, first node hangs off the fork point
  for (const [bid, list] of byBranch){
    const br = S.branches.get(bid);
    list.forEach((n, i) => {
      n.parents = i === 0 ? (br.from ? [br.from] : []) : [list[i-1].id];
      for (const m of n.merges || []){
        const src = (byBranch.get(m) || []).filter(x => x.status !== 'planned').pop();
        if (src) n.parents.push(src.id);
      }
    });
  }

  // nodes a branch merges FROM: their outgoing edge climbs to another lane,
  // so their label has to sit below the line instead of above it
  const mergeSources = new Set();
  for (const n of S.nodes) for (const m of n.merges || []){
    const src = (byBranch.get(m) || []).filter(x => x.status !== 'planned').pop();
    if (src) mergeSources.add(src.id);
  }

  // --- x from real dates, swept left-to-right so nothing collides
  const dated = S.nodes.filter(n => n.date).sort((a,b) => parseDate(a.date) - parseDate(b.date));
  const t0 = parseDate(dated[0].date), today = Date.now();
  let nowX;
  if (S.timeMode === 'even'){
    // constant distance between consecutive events; the calendar is what stretches
    dated.forEach((n,i) => n.x = CFG.padX + i * CFG.evenGap);
    const nxt = dated.findIndex(n => parseDate(n.date) > today);
    if (nxt < 0)      nowX = dated[dated.length-1].x + CFG.evenGap * .6;
    else if (!nxt)    nowX = dated[0].x - CFG.evenGap * .6;
    else { const a = dated[nxt-1], b = dated[nxt];
           nowX = a.x + (b.x - a.x) * (today - parseDate(a.date)) / (parseDate(b.date) - parseDate(a.date)); }
  } else {
    // x is the real date, swept left-to-right so a busy week cannot collapse
    let prev = -Infinity;
    for (const n of dated){
      n.x = Math.max(CFG.padX + (parseDate(n.date) - t0)/DAY*CFG.pxPerDay, prev + CFG.minGap);
      prev = n.x;
    }
    nowX = CFG.padX + (today - t0)/DAY*CFG.pxPerDay;
  }
  const tipX = Math.max(nowX, ...dated.map(n => n.x));
  for (const list of byBranch.values()){
    let cursor = tipX;
    for (const n of list) if (!n.date) n.x = (cursor += CFG.plannedGap);
  }

  // --- branch spans, including the title block that sits just before the first node.
  //     The incoming fork curve flattens out within `ctrl` px of its destination,
  //     so that is exactly how much room the title has to keep clear.
  const parentB = new Map([...S.branches.keys()].map(b => {
    const f = S.branches.get(b).from;
    return [b, f && S.byId.has(f) ? S.byId.get(f).branch : null];
  }));
  const span = new Map();
  for (const bid of S.branches.keys()){
    const list = byBranch.get(bid);
    if (!list.length) continue;
    const br = S.branches.get(bid);
    const fork = br.from && S.byId.has(br.from) ? S.byId.get(br.from) : null;
    const first = list[0];
    let hi = list[list.length-1].x;
    for (const n of S.nodes) if ((n.merges||[]).includes(bid)) hi = Math.max(hi, n.x);
    const lines = wrap(br.name, CFG.branchWrapChars);
    const w = Math.max(...lines.map(l => measure(l, FONT_BR)));
    if (br.status === 'abandoned') hi += CFG.deadEnd + 6;   // room for the terminator
    const clear = fork ? ctrlOffset(first.x - fork.x) : 16;
    const right = first.x - clear - 14;
    span.set(bid, {bid, lo:first.x, hi, forkX: fork ? fork.x : null,
                   title:{lines, w, right, left: right - w}});
  }

  // --- lanes: reuse a row as soon as its previous occupant is finished, but a
  //     sub-branch always lands strictly below its parent so the tree still reads
  //     downwards. Branches are placed in fork order, which guarantees a parent
  //     is already placed when its children are considered.
  const placed = [];                                  // per lane: list of [left,right]
  const laneOf = new Map();
  const root = [...S.branches.keys()].find(b => !parentB.get(b));
  laneOf.set(root, 0); placed[0] = [[-1e9, 1e9]];      // the trunk owns row 0 outright
  const chrono = [...S.branches.keys()].filter(b => b !== root && span.has(b))
                   .sort((a,b) => span.get(a).title.left - span.get(b).title.left);
  for (const bid of chrono){
    const sp = span.get(bid);
    const lo = sp.title.left - CFG.laneReuseGap, hi = sp.hi + CFG.laneReuseGap;
    const floor = (laneOf.get(parentB.get(bid)) ?? 0) + 1;
    let row = floor;
    while ((placed[row] || []).some(([a,b]) => lo < b && hi > a)) row++;
    (placed[row] = placed[row] || []).push([lo, hi]);
    laneOf.set(bid, row);
  }
  const kidsOf = new Map(S.nodes.map(n => [n.id, []]));
  for (const n of S.nodes) for (const p of n.parents) if (kidsOf.has(p)) kidsOf.get(p).push(n);

  const laneCount = Math.max(...laneOf.values()) + 1;
  const laneNodes = [...Array(laneCount)].map(() => []);
  S.nodes.forEach(n => laneNodes[laneOf.get(n.branch)].push(n));
  laneNodes.forEach(l => l.sort((a,b) => a.x - b.x));

  // --- labels: wrap, pick a side, then pack into collision tiers on that side
  const showLabel = n => S.allLabels || (n.tags||[]).includes('milestone') || n.status !== 'done';
  const above = [], below = [];
  laneNodes.forEach((list, i) => {
    let maxA = 1, maxB = 1;
    for (const n of list){
      n.label = null;
      if (!showLabel(n)) continue;
      const lines = wrap(n.title, CFG.wrapChars);
      const w = Math.max(...lines.map(l => measure(l, FONT_LBL)));
      // every outgoing edge leaves to the right of the node, climbing to a lane
      // above (a merge) or dropping to one below (a fork). Put the label where
      // no such curve is going to run: below, above, or — when the node does
      // both — to the left, which is always clear.
      const lane = laneOf.get(n.branch);
      let up = false, down = false;
      for (const c of kidsOf.get(n.id)){
        const cl = laneOf.get(c.branch);
        if (cl < lane) up = true; else if (cl > lane) down = true;
      }
      // 'free' means no cross-lane edge leaves this node, so either side works and
      // the packer picks whichever needs the lower tier
      const side = S.labelMode === 'above' ? 'above'
                 : S.labelMode === 'below' ? 'below'
                 : up && down ? 'left' : up ? 'below' : down ? 'above' : 'free';
      const left = side === 'left' ? n.x - 12 - w : n.x - 4;
      n.label = {lines, w, side, tier:0, left, right: left + w};
      maxA = maxB = Math.max(maxA, maxB, lines.length);
    }
    const stepA = maxA * CFG.lineH + CFG.tierPad, stepB = maxB * CFG.lineH + CFG.tierPad;
    const tiers = {above:[], below:[]};
    const lowest = (t, lbl) => { let k = 0;
      while (t[k] !== undefined && t[k] + CFG.labelGap > lbl.left) k++; return k; };
    for (const n of list){
      if (!n.label) continue;
      if (n.label.side === 'free'){
        const a = lowest(tiers.above, n.label), b = lowest(tiers.below, n.label);
        n.label.side = b < a ? 'below' : 'above';
      }
      const t = tiers[n.label.side === 'below' ? 'below' : 'above'];
      const k = lowest(t, n.label);
      t[k] = n.label.right;
      n.label.tier = k;
      n.label.offset = n.label.side === 'below'
        ?  (CFG.nodePadBelow + k * stepB)
        : -(CFG.nodePad + k * stepA);
    }
    above[i] = tiers.above.length ? tiers.above.length * stepA + CFG.nodePad : CFG.laneClear;
    below[i] = tiers.below.length ? tiers.below.length * stepB + CFG.nodePadBelow : CFG.laneClear;
  });

  // --- lane y: each gap carries the labels hanging below the row above it
  const laneYIdx = [];
  let y = CFG.padTop;
  for (let i = 0; i < laneCount; i++){
    y = i === 0 ? y + above[i] : y + Math.max(CFG.laneGapMin, below[i-1] + above[i]);
    laneYIdx[i] = y;
  }
  const laneY = new Map([...laneOf].map(([b,i]) => [b, laneYIdx[i]]));
  S.nodes.forEach(n => n.y = laneY.get(n.branch));

  // --- shift so the leftmost branch title stays on canvas
  const spans = [...span.values()];
  const shift = Math.max(0, 26 - Math.min(...spans.map(s => s.title.left),
                                          ...S.nodes.filter(n => n.label).map(n => n.label.left)));
  if (shift){
    S.nodes.forEach(n => { n.x += shift; if (n.label){ n.label.left += shift; n.label.right += shift; } });
    spans.forEach(s => { s.lo += shift; s.hi += shift; if (s.forkX !== null) s.forkX += shift;
                         s.title.right += shift; s.title.left += shift; });
    nowX += shift;
  }
  spans.sort((a,b) => laneOf.get(a.bid) - laneOf.get(b.bid) || a.lo - b.lo);

  const edges = [];
  for (const n of S.nodes) for (const p of n.parents)
    if (S.byId.has(p)) edges.push({from: S.byId.get(p), to: n});

  const months = [];
  if (S.timeMode === 'even'){
    // no uniform calendar to draw on: a tick goes wherever the month turns over
    const seen = new Set();
    dated.forEach(n => {
      const d = parseDate(n.date), key = d.getFullYear() + '-' + d.getMonth();
      if (seen.has(key)) return;
      seen.add(key);
      months.push({x: n.x - CFG.evenGap * .5,
                   label: d.toLocaleDateString('en-GB',{month:'short'}),
                   year: (d.getMonth() === 0 || seen.size === 1) ? d.getFullYear() : null});
    });
  } else {
    const cur = new Date(t0.getFullYear(), t0.getMonth(), 1);
    const end = parseDate(dated[dated.length-1].date);
    let k = 0;
    while (cur <= end){
      months.push({x: CFG.padX + shift + (cur - t0)/DAY*CFG.pxPerDay,
                   label: cur.toLocaleDateString('en-GB',{month:'short'}),
                   year: (cur.getMonth() === 0 || k === 0) ? cur.getFullYear() : null});
      cur.setMonth(cur.getMonth() + 1); k++;
    }
  }

  const width  = Math.max(...S.nodes.map(n => n.label ? n.label.right + 20 : n.x + 40)) + 40;
  const height = laneYIdx[laneCount-1] + below[laneCount-1] + 30;
  return {byBranch, edges, laneOf, laneY, spans, span, months, nowX, t0, width, height, laneCount};
}

/** how far a fork/merge curve runs horizontally before it turns — capped, so long
 *  vertical jumps stay tidy and the destination keeps a predictable clear zone */
export const ctrlOffset = dx => Math.min(Math.abs(dx) * 0.45, CFG.ctrlMax);
