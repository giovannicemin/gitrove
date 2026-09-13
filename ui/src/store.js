/* Where a project comes from and where it goes back to.

   Two backends. On the desktop the native shell does the work; in a plain
   browser the bundled example is fetched read-only, which is enough to work
   on the drawing without leaving the browser. */

const T = () => window.__TAURI__;
export const isDesktop = () => !!T();

const REMEMBER = 'gitrove.project';
const EXAMPLE  = 'data/example_thesis.org';

export const recall = () => { try { return localStorage.getItem(REMEMBER); } catch { return null; } };
const remember = p => { try { p ? localStorage.setItem(REMEMBER, p) : localStorage.removeItem(REMEMBER); } catch {} };

/** the sample that ships inside the app — no path, so it cannot be saved over */
export async function openExample(){
  const res = await fetch(EXAMPLE, {cache:'no-store'});
  if (!res.ok) throw new Error(`${EXAMPLE}: HTTP ${res.status}`);
  return {text: await res.text(), path: null, name: 'example (read-only)'};
}

export async function open(path){
  const text = await T().core.invoke('read_project', {path});
  remember(path);
  return {text, path, name: path.split('/').pop()};
}

/** native file picker; null if the user cancelled */
export async function choose(save = false){
  if (!isDesktop()) return null;
  return await T().core.invoke('pick_project', {save});
}

export async function save(path, text){
  await T().core.invoke('write_project', {path, text});
  remember(path);
}

/** tell me when this file changes underneath us */
export async function watch(path, onChange){
  if (!isDesktop() || !path) return;
  await T().core.invoke('watch_project', {path});
  if (watch.listening) return;
  watch.listening = true;
  await T().event.listen('project-changed', e => onChange(e.payload));
}

/** what to load at startup: the file you had open, else the sample */
export async function initial(){
  const last = isDesktop() && recall();
  if (last){
    try { return await open(last); }
    catch (e){ console.warn('gitrove: could not reopen', last, e); remember(null); }
  }
  return openExample();
}
