/* Branch colours, adapted to the active theme. */

import { S } from './state.js';

/* branch colours are tuned for the dark canvas; on light they are darkened so
   they keep the same contrast against the page */
export function hexHsl(h){
  const n = parseInt(h.slice(1), 16), r=(n>>16)/255, g=((n>>8)&255)/255, b=(n&255)/255;
  const mx=Math.max(r,g,b), mn=Math.min(r,g,b), l=(mx+mn)/2, d=mx-mn;
  if (!d) return [0,0,l];
  const sa = d / (1 - Math.abs(2*l - 1));
  const hu = mx===r ? ((g-b)/d + (g<b?6:0)) : mx===g ? (b-r)/d + 2 : (r-g)/d + 4;
  return [hu*60, sa, l];
}
export function hslHex(h, sa, l){
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2*l - 1)) * sa, x = c * (1 - Math.abs((h/60) % 2 - 1)), m = l - c/2;
  const seg = [[c,x,0],[x,c,0],[0,c,x],[0,x,c],[x,0,c],[c,0,x]][Math.floor(h/60) % 6];
  return '#' + seg.map(v => Math.round((v+m)*255).toString(16).padStart(2,'0')).join('');
}

export function bcol(b){
  if (S.theme !== 'light') return b.color;
  const [h,sa,l] = hexHsl(b.color);
  return hslHex(h, Math.min(sa * 1.1, .85), Math.min(l, .40));
}

/* Colours are not in the project file unless you put them there. Top-level
   branches take successive palette entries; a sub-branch takes its parent's
   hue, shifted and darkened a little, so a family stays recognisable. */
const PALETTE = ['#e8c37a','#7aa2f7','#7ddccf','#c39ae8','#8bd47c','#f78ca0','#f7a072','#9ad4e8'];
const MUTED = '#8b8fa3';

export function assignColors(branches, nodes){
  const byId = new Map(nodes.map(n => [n.id, n]));
  const byBranch = new Map(branches.map(b => [b.id, b]));
  const parentOf = b => b.from && byId.has(b.from) ? byBranch.get(byId.get(b.from).branch) : null;
  const trunk = branches.find(b => !b.from);

  // every branch hangs off the trunk somewhere, so "is a sub-branch" means
  // "its parent is not the trunk" — otherwise the whole file is one hue
  const depth = b => { let d = 0; for (let p = parentOf(b); p; p = parentOf(p)) d++; return d; };
  const kidCount = new Map();
  let next = 0;

  for (const b of [...branches].sort((x,y) => depth(x) - depth(y))){
    if (b.color) continue;                              // :COLOR: in the file wins
    if (b.status === 'abandoned'){ b.color = MUTED; continue; }
    const p = parentOf(b);
    if (!p || p === trunk){ b.color = PALETTE[next++ % PALETTE.length]; continue; }
    const k = (kidCount.get(p.id) || 0) + 1;
    kidCount.set(p.id, k);
    const [h, sa, l] = hexHsl(p.color);
    b.color = hslHex(h + 10 * k, Math.min(sa * 1.05, .9), Math.max(l * 0.88, .32));
  }
}
