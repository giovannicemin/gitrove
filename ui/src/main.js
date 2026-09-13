/* Entry point: load the project file, then wire the controls. */

import { S } from './state.js';
import { $ } from './util.js';
import { layout } from './layout.js';
import { buildTree } from './tree.js';
import { paintHeader, paintSidebar, select } from './ui.js';
import { render } from './render.js';
import { home } from './camera.js';
import { relayout } from './app.js';
import { parse } from './org.js';
import { apply } from './orgedit.js';
import { assignColors } from './color.js';
import * as store from './store.js';

async function boot(){
  let file;
  try {
    file = await store.initial();
  } catch (e) {
    $('#app').hidden = true;
    const err = $('#err'); err.hidden = false;
    err.innerHTML = '<h2 style="color:var(--fg)">Could not load a project</h2>' +
      '<p>In a browser, serve the folder over HTTP:</p><p><code>npm run serve</code></p>' +
      '<p style="color:#5c6478;font-size:12px">(' + e + ')</p>';
    return;
  }
  load(file);
  if (file.path) store.watch(file.path, external);
}

/** take a freshly read file and make it the thing on screen */
function load(file){
  S.source = file.text;
  S.path   = file.path;
  S.name   = file.name;
  const doc = parse(file.text);
  assignColors(doc.branches, doc.nodes);
  S.doc = doc;
  S.data = doc;
  S.branches = new Map(doc.branches.map(b => [b.id, b]));
  S.nodes = doc.nodes.map(n => ({...n, status: n.status || 'done'}));
  S.byId = new Map(S.nodes.map(n => [n.id, n]));
  S.sel = null;
  S.layout = layout();
  buildTree();
  paintHeader(); paintSidebar(); paintFile();
  render(); home();
  if (doc.problems.length) console.warn('gitrove:', doc.problems);
}

/* ---------- opening and saving ----------------------------------- */

function paintFile(){
  $('#fname').textContent = S.name || '—';
  $('#file').classList.toggle('dirty', !!S.dirty);
  $('#save').disabled = !S.dirty || !store.isDesktop();
}

/** the file changed on disk while we had it open */
async function external(path){
  if (path !== S.path) return;
  if (S.dirty && !confirm(`${S.name} changed on disk, and you have unsaved edits.\n\nDiscard yours and reload?`))
    return;
  const file = await store.open(path);
  load(file);
  S.dirty = false; paintFile();
}

async function openFile(){
  const path = await store.choose();
  if (!path) return;
  const file = await store.open(path);
  load(file);
  S.dirty = false; paintFile();
  store.watch(file.path, external);
}

async function saveFile(){
  let path = S.path;
  if (!path){
    path = await store.choose(true);
    if (!path) return;
  }
  await store.save(path, S.source);
  S.path = path; S.name = path.split('/').pop(); S.dirty = false;
  paintFile();
  store.watch(path, external);
}

/** the only way the document changes: patch the source, reparse, redraw */
function commit(patches){
  const next = apply(S.doc, patches);
  load({text: next, path: S.path, name: S.name});
  S.dirty = true;
  paintFile();
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
$('#open').onclick = openFile;
$('#save').onclick = saveFile;
addEventListener('keydown', e => {
  if (!(e.metaKey || e.ctrlKey)) return;
  if (e.key === 's'){ e.preventDefault(); if (S.dirty) saveFile(); }
  if (e.key === 'o'){ e.preventDefault(); openFile(); }
});
addEventListener('beforeunload', e => { if (S.dirty){ e.preventDefault(); e.returnValue = ''; } });

// dev handle: the whole app state, for poking at from the console
window.gitrove = { S, layout, render, relayout, select, store, load, commit, saveFile, openFile };

let saved = 'dark';
try { saved = localStorage.getItem('gitrove.theme') || 'dark'; } catch(e){}
setTheme(saved);
boot();
