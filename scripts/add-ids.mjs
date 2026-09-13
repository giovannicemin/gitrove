/* Give every entry in a project file an :ID:, so you can fork a branch off any
   of them without stopping to invent one.

   Ids are <branch>-<n> in file order, and existing references are remapped to
   match. Run: node scripts/add-ids.mjs path/to/project.org [--dry]           */

import { readFileSync, writeFileSync } from 'fs';
import { parse } from '../ui/src/org.js';
import * as E from '../ui/src/orgedit.js';

const path = process.argv[2];
const dry  = process.argv.includes('--dry');
if (!path){ console.error('usage: node scripts/add-ids.mjs <file.org> [--dry]'); process.exit(1); }

const src = readFileSync(path, 'utf8');
const doc = parse(src);

const seen = new Map(), rename = new Map();
for (const n of doc.nodes){
  const i = (seen.get(n.branch) || 0) + 1;
  seen.set(n.branch, i);
  n.newId = `${n.branch}-${i}`;
  rename.set(n.id, n.newId);
}

const patches = [];
let added = 0, renamed = 0;
for (const n of doc.nodes){
  if (n.generatedId) added++; else if (n.id !== n.newId) renamed++; else continue;
  patches.push(E.setProp(n.at, 'ID', n.newId));
}
for (const b of doc.branches)
  if (b.from && rename.has(b.from) && rename.get(b.from) !== b.from)
    patches.push(E.setProp(b.at, 'FROM', rename.get(b.from)));

const out = E.apply(doc, patches);

// the document must mean exactly the same thing afterwards
const after = parse(out);
const same = (a, b, f) => JSON.stringify(a.map(f)) === JSON.stringify(b.map(f));
const intact =
  same(doc.nodes, after.nodes, n => [n.branch, n.title, n.date, n.status, n.desc, n.tags, n.merges ?? null]) &&
  same(doc.branches, after.branches, b => [b.id, b.name, b.status]) &&
  doc.branches.every((b, i) => (b.from ? rename.get(b.from) : null) === (after.branches[i].from ?? null)) &&
  after.problems.length === 0 &&
  new Set(after.nodes.map(n => n.id)).size === after.nodes.length;

if (!intact){ console.error('refusing to write: the document changed meaning'); process.exit(1); }

console.log(`${added} ids added, ${renamed} renamed, ${after.nodes.length} entries now addressable`);
console.log(`${src.split('\n').length} lines -> ${out.split('\n').length}`);
if (dry) console.log('(dry run, nothing written)');
else { writeFileSync(path, out); console.log(`wrote ${path}`); }
