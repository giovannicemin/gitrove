/* Reads the subset of org-mode that a gitrove project uses.

   Branches are level-1 headings, the things you did are their level-2
   children. Everything the parser does not understand is left alone — each
   entry records the line range it occupies, so edits can later be applied
   surgically instead of by rewriting the file. */

const KEYWORD = {
  DONE:'done', DOING:'current', TODO:'planned',            // nodes
  ACTIVE:'active', MERGED:'merged', CANCELLED:'abandoned'  // branches
};
const HEAD    = /^(\*+)\s+(.*)$/;
const META    = /^#\+([A-Za-z_]+):\s*(.*)$/;
const PLAN    = /^\s*(CLOSED|SCHEDULED|DEADLINE):\s*[[<](\d{4}-\d{2}-\d{2})/;
const PROP    = /^\s*:([A-Za-z_]+):\s*(.*?)\s*$/;
const TAGS    = /\s+(:(?:[\w@#%-]+:)+)\s*$/;
const STAMP   = /[[<](\d{4}-\d{2}-\d{2})/;

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'branch';

/** split a heading into keyword, title and tags */
function splitHead(rest){
  let tags = [];
  const m = rest.match(TAGS);
  if (m){ tags = m[1].split(':').filter(Boolean); rest = rest.slice(0, m.index); }
  let kw = null;
  const first = rest.split(/\s+/)[0];
  if (first in KEYWORD){ kw = first; rest = rest.slice(first.length); }
  return {kw, title: rest.trim(), tags};
}

/** one heading and everything under it, up to the next heading */
function readEntry(lines, i){
  const e = {head:i, plan:null, date:null, props:{}, drawer:null, body:[], end:i+1};
  let j = i + 1;
  if (j < lines.length && PLAN.test(lines[j])){
    e.plan = j; e.date = lines[j].match(PLAN)[2]; j++;
  }
  if (j < lines.length && /^\s*:PROPERTIES:\s*$/.test(lines[j])){
    const start = j++;
    while (j < lines.length && !/^\s*:END:\s*$/.test(lines[j])){
      const p = lines[j].match(PROP);
      if (p) e.props[p[1].toUpperCase()] = p[2];
      j++;
    }
    e.drawer = {start, end: Math.min(j + 1, lines.length)};
    j = e.drawer.end;
  }
  const bodyStart = j;
  while (j < lines.length && !HEAD.test(lines[j])) j++;
  let bodyEnd = j;
  while (bodyEnd > bodyStart && !lines[bodyEnd-1].trim()) bodyEnd--;   // drop trailing blanks
  e.body = {start: bodyStart, end: bodyEnd};
  e.end = j;
  return e;
}

/** text -> {project, branches, nodes, problems, lines} */
export function parse(text){
  const lines = text.split('\n');
  const meta = {}, branches = [], nodes = [], problems = [];
  const note = (line, msg) => problems.push({line: line + 1, msg});

  let branch = null, seq = 0;
  for (let i = 0; i < lines.length; i++){
    const line = lines[i];
    const h = line.match(HEAD);
    if (!h){
      const m = !branch && line.match(META);
      if (m) meta[m[1].toUpperCase()] = m[2].trim();
      continue;
    }
    const level = h[1].length;
    const {kw, title, tags} = splitHead(h[2]);
    const e = readEntry(lines, i);
    const desc = lines.slice(e.body.start, e.body.end)
                      .map(l => l.trim()).filter(Boolean).join(' ');

    if (level === 1){
      if (kw && !['ACTIVE','MERGED','CANCELLED'].includes(kw))
        note(i, `branch "${title}" has node keyword ${kw}`);
      branch = {
        id: e.props.ID || slug(title), name: title,
        status: KEYWORD[kw] || 'active',
        from: e.props.FROM || null,
        desc, at: e, tags
      };
      if (branches.some(b => b.id === branch.id)) note(i, `duplicate branch id "${branch.id}"`);
      branches.push(branch);
      seq = 0;
    } else if (level === 2){
      if (!branch){ note(i, `"${title}" is not under a branch`); i = e.end - 1; continue; }
      if (kw && !['TODO','DOING','DONE'].includes(kw))
        note(i, `node "${title}" has branch keyword ${kw}`);
      const status = KEYWORD[kw] || (e.date ? 'done' : 'planned');
      nodes.push({
        id: e.props.ID || `${branch.id}#${seq}`,
        branch: branch.id, title, desc, status, tags,
        date: e.date || (desc.match(STAMP)?.[1] ?? null),
        merges: e.props.MERGES ? e.props.MERGES.split(/[\s,]+/).filter(Boolean) : undefined,
        at: e, generatedId: !e.props.ID
      });
      seq++;
    } else {
      note(i, `heading is ${level} deep; branches are 1, entries are 2`);
    }
    i = e.end - 1;
  }

  // references must resolve
  const nodeIds = new Set(nodes.map(n => n.id));
  const branchIds = new Set(branches.map(b => b.id));
  for (const b of branches)
    if (b.from && !nodeIds.has(b.from)) note(b.at.head, `":FROM: ${b.from}" matches no entry`);
  for (const n of nodes)
    for (const m of n.merges || [])
      if (!branchIds.has(m)) note(n.at.head, `":MERGES: ${m}" matches no branch`);
  if (!branches.length) problems.push({line:1, msg:'no branches found'});

  return {
    project: {name: meta.TITLE || 'Untitled', subtitle: meta.SUBTITLE || '',
              started: (meta.STARTED || '').match(STAMP)?.[1] || null},
    branches, nodes, problems, lines
  };
}
