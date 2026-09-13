/* Branch hierarchy: who forked off whom. Drives the sidebar, not the lanes. */

import { S } from './state.js';

/* ---------- branch hierarchy ------------------------------------- */
export function parentOf(bid){
  const b = S.branches.get(bid);
  return b.from && S.byId.has(b.from) ? S.byId.get(b.from).branch : null;
}
export function buildTree(){
  S.tree = new Map([...S.branches.keys()].map(b => [b, []]));
  S.roots = [];
  for (const bid of S.branches.keys()){
    const p = parentOf(bid);
    if (p && p !== bid) S.tree.get(p).push(bid); else S.roots.push(bid);
  }
  const startX = b => (S.layout.byBranch.get(b)[0] || {x:0}).x;
  for (const kids of S.tree.values()) kids.sort((a,b) => startX(a) - startX(b));
}
export function descendants(bid, acc = new Set()){
  for (const c of S.tree.get(bid) || []){ acc.add(c); descendants(c, acc); }
  return acc;
}
export function ancestry(bid){                     // ['main','ch3','stats']
  const out = [bid];
  for (let p = parentOf(bid); p; p = parentOf(p)) out.unshift(p);
  return out;
}
