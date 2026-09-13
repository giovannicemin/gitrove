/* Small helpers with no dependencies: DOM, dates, text measurement, SVG. */

export const $ = s => document.querySelector(s);
export const parseDate = s => new Date(s + 'T00:00:00');
export const fmt = d => d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});

export const measure = (() => {
  const c = document.createElement('canvas').getContext('2d');
  return (t, font) => { c.font = font; return c.measureText(t).width; };
})();

/** greedy word wrap at a character budget; long words are hard-broken */
export function wrap(text, maxChars){
  const out = [];
  let line = '';
  for (let w of text.split(/\s+/)){
    while (w.length > maxChars){                       // hard-break a very long word
      if (line) { out.push(line); line = ''; }
      out.push(w.slice(0, maxChars - 1) + '-');
      w = w.slice(maxChars - 1);
    }
    if (!line) line = w;
    else if ((line + ' ' + w).length <= maxChars) line += ' ' + w;
    else { out.push(line); line = w; }
  }
  if (line) out.push(line);
  return out;
}

/* ------------------------------------------------------------------ */

export const NS = 'http://www.w3.org/2000/svg';
export const el = (t,a={}) => { const e = document.createElementNS(NS,t); for (const k in a) e.setAttribute(k,a[k]); return e; };
