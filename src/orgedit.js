/* Changes a project file by replacing lines, never by rewriting it.

   Every operation returns a patch — replace source lines [start,end) with
   these — and `apply` splices them all in one pass, back to front. Anything
   the parser did not model sits outside every patch and is therefore
   untouched by construction, rather than by being carefully re-emitted. */

const KW_NODE   = {done:'DONE', current:'DOING', planned:'TODO'};
const KW_BRANCH = {active:'ACTIVE', merged:'MERGED', abandoned:'CANCELLED'};
const PLAN_KIND = {done:'CLOSED', current:'SCHEDULED', planned:null};
const TAG_COL = 77;

/** [2026-01-15 Thu] — org's own date form, active <> or inactive [] */
export function stamp(date, active = false){
  const d = new Date(date + 'T00:00:00');
  const s = `${date} ${d.toLocaleDateString('en-GB',{weekday:'short'})}`;
  return active ? `<${s}>` : `[${s}]`;
}

function headingLine(level, keyword, title, tags){
  const head = `${'*'.repeat(level)} ${keyword ? keyword + ' ' : ''}${title}`;
  if (!tags || !tags.length) return head;
  const tag = ':' + tags.join(':') + ':';
  return head + ' '.repeat(Math.max(1, TAG_COL - head.length - tag.length)) + tag;
}

/** one line replaces the heading */
export function setHeading(entry, {title, status, tags} = {}){
  const kw = status === undefined ? entry.keyword
           : (entry.level === 1 ? KW_BRANCH : KW_NODE)[status] ?? entry.keyword;
  return [{start: entry.head, end: entry.head + 1,
           lines: [headingLine(entry.level, kw,
                               title  ?? entry.title,
                               tags   ?? entry.tags)]}];
}

/** add, change or drop the CLOSED:/SCHEDULED: line under a heading */
export function setPlanning(entry, kind, date){
  const line = kind && date
    ? `${kind}: ${stamp(date, kind !== 'CLOSED')}`
    : null;
  if (entry.plan !== null)
    return [{start: entry.plan, end: entry.plan + 1, lines: line ? [line] : []}];
  return line ? [{start: entry.head + 1, end: entry.head + 1, lines: [line]}] : [];
}

/** status drives both the keyword and which timestamp an entry carries */
export function setStatus(entry, status, date){
  const kind = entry.level === 1 ? null : PLAN_KIND[status];
  return [...setHeading(entry, {status}), ...setPlanning(entry, kind, date ?? entry.date)];
}

/** set a property, or remove it with value null; creates and deletes the drawer */
export function setProp(entry, key, value){
  const K = key.toUpperCase(), line = `:${K}:${' '.repeat(Math.max(1, 9 - K.length))}${value}`;
  if (!entry.drawer){
    if (value == null) return [];
    const at = entry.plan !== null ? entry.plan + 1 : entry.head + 1;
    return [{start: at, end: at, lines: [':PROPERTIES:', line, ':END:']}];
  }
  const { start, end } = entry.drawer;
  const kept = [];
  for (let i = start + 1; i < end - 1; i++){
    const m = entry.source[i].match(/^\s*:([A-Za-z_]+):/);
    if (!m || m[1].toUpperCase() !== K) kept.push(entry.source[i]);
  }
  if (value != null) kept.push(line);
  return [{start, end, lines: kept.length ? [':PROPERTIES:', ...kept, ':END:'] : []}];
}

/** replace the leading prose, leaving any list, table or block below it alone */
export function setDesc(entry, text){
  const body = (text ?? '').trim();
  return [{start: entry.desc.start, end: entry.desc.end, lines: body ? [body] : []}];
}

/** a whole new entry under a branch, after `after` (or as its first) */
export function insertNode(branch, after, {title, status = 'planned', date, desc, tags}){
  const at = after ? after.end : (branch.drawer ? branch.drawer.end : branch.head + 1);
  const lines = [headingLine(2, KW_NODE[status], title, tags)];
  const kind = PLAN_KIND[status];
  if (kind && date) lines.push(`${kind}: ${stamp(date, kind !== 'CLOSED')}`);
  if (desc) lines.push(desc.trim());
  return [{start: at, end: at, lines}];
}

export function removeEntry(entry){
  return [{start: entry.head, end: entry.end, lines: []}];
}

/** splice every patch into the source at once, back to front */
export function apply(doc, patches){
  const list = patches.flat().filter(Boolean).sort((a,b) => b.start - a.start || b.end - a.end);
  for (const p of list)                              // a bad range must not splice at 0
    if (!Number.isInteger(p.start) || !Number.isInteger(p.end) || p.start < 0 || p.end < p.start)
      throw new Error(`bad edit range ${p.start}..${p.end} — was an entry passed instead of its .at?`);
  for (let i = 1; i < list.length; i++)
    if (list[i].end > list[i-1].start)
      throw new Error(`overlapping edits at lines ${list[i].start}-${list[i].end}`);
  const lines = doc.lines.slice();
  for (const p of list) lines.splice(p.start, p.end - p.start, ...p.lines);
  return lines.join('\n');
}
