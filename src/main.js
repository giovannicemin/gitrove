/* Entry point: load the project file, then wire the controls. */

import { S } from './state.js';
import { $ } from './util.js';
import { layout } from './layout.js';
import { buildTree } from './tree.js';
import { paintHeader, paintSidebar, select } from './ui.js';
import { render } from './render.js';
import { home } from './camera.js';
import { relayout } from './app.js';

/* The one place that knows where a project comes from. Everything downstream
   takes a parsed object, so another source — a file picker, a drop, a desktop
   shell — only has to replace this. */
const PROJECT = 'data/example_thesis.json';

async function boot(){
  let data;
  try{
    const res = await fetch(PROJECT, {cache:'no-store'});
    if (!res.ok) throw new Error('HTTP ' + res.status);
    data = await res.json();
  }catch(e){
    $('#app').hidden = true;
    const err = $('#err'); err.hidden = false;
    err.innerHTML = '<h2 style="color:var(--fg)">Could not load <code>' + PROJECT + '</code></h2>' +
      '<p>Serve the folder over HTTP instead of opening the file directly:</p>' +
      '<p><code>python3 -m http.server 5173</code></p><p style="color:#5c6478;font-size:12px">(' + e + ')</p>';
    return;
  }
  S.data = data;
  data.branches.forEach(b => S.branches.set(b.id, b));
  S.nodes = data.nodes.map(n => ({...n, status: n.status || 'done'}));
  S.nodes.forEach(n => S.byId.set(n.id, n));
  S.layout = layout();
  buildTree();
  paintHeader(); paintSidebar();
  render(); home();
}

$('#alllabels').onchange = e => { S.allLabels = e.target.checked; relayout(); };
$('#shead').onclick = () => $('#settings').classList.toggle('open');

function segment(id, apply){
  $('#'+id).querySelectorAll('button').forEach(b => b.onclick = () => {
    $('#'+id).querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    apply(b.dataset.v);
  });
}
segment('timemode',  v => { S.timeMode  = v; relayout(); });
segment('labelmode',  v => { S.labelMode  = v; relayout(); });
segment('branchside', v => { S.branchSide = v; relayout(); });

function setTheme(t){
  S.theme = t;
  document.body.classList.toggle('light', t === 'light');
  $('#theme').setAttribute('aria-checked', t === 'light');
  try { localStorage.setItem('gitrove.theme', t); } catch(e){}
  if (S.layout){ paintSidebar(); render(); if (S.sel) select(S.sel); }
}
$('#theme').onclick = () => setTheme(S.theme === 'light' ? 'dark' : 'light');

// dev handle: the whole app state, for poking at from the console
window.gitrove = { S, layout, render, relayout, select };

let saved = 'dark';
try { saved = localStorage.getItem('gitrove.theme') || 'dark'; } catch(e){}
setTheme(saved);
boot();
