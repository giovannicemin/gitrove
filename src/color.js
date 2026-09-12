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
export function bcol(b){
  if (S.theme !== 'light') return b.color;
  const [h,sa,l] = hexHsl(b.color);
  const L = Math.min(l, .40), Sa = Math.min(sa * 1.1, .85);
  const c = (1 - Math.abs(2*L - 1)) * Sa, x = c * (1 - Math.abs((h/60) % 2 - 1)), m = L - c/2;
  const seg = [[c,x,0],[x,c,0],[0,c,x],[0,x,c],[x,0,c],[c,0,x]][Math.floor(h/60) % 6];
  return '#' + seg.map(v => Math.round((v+m)*255).toString(16).padStart(2,'0')).join('');
}
