/* The safety net for editing a file you also hand-edit in Emacs.

   Run: node test/orgedit.test.mjs                                            */

import { readFileSync } from 'fs';
import { parse } from '../src/org.js';
import * as E from '../src/orgedit.js';

const SRC = readFileSync(new URL('../data/example_thesis.org', import.meta.url), 'utf8');

let pass = 0, fail = 0;
const ok  = (name, cond, detail='') => cond ? (pass++, console.log(`  ok   ${name}`))
                                            : (fail++, console.log(`  FAIL ${name}${detail?'\n       '+detail:''}`));
const diffLines = (a, b) => {                      // proper LCS: :END: recurs everywhere
  const A = a.split('\n'), B = b.split('\n'), m = A.length, n = B.length;
  const dp = Array.from({length: m+1}, () => new Int32Array(n+1));
  for (let i = m-1; i >= 0; i--)
    for (let j = n-1; j >= 0; j--)
      dp[i][j] = A[i] === B[j] ? dp[i+1][j+1] + 1 : Math.max(dp[i+1][j], dp[i][j+1]);
  const out = [];
  let i = 0, j = 0;
  while (i < m && j < n){
    if (A[i] === B[j]) { i++; j++; }
    else if (dp[i+1][j] >= dp[i][j+1]) out.push(`-${i}: ${A[i++]}`);
    else out.push(`+${j}: ${B[j++]}`);
  }
  while (i < m) out.push(`-${i}: ${A[i++]}`);
  while (j < n) out.push(`+${j}: ${B[j++]}`);
  return out;
};
const node = (doc, title) => doc.nodes.find(n => n.title === title).at;
const branch = (doc, id) => doc.branches.find(b => b.id === id).at;

console.log('\nno-op');
{
  const doc = parse(SRC);
  ok('applying nothing returns the file byte for byte', E.apply(doc, []) === SRC);
}

console.log('\nediting one entry touches only that entry');
{
  const doc = parse(SRC);
  const out = E.apply(doc, E.setHeading(node(doc,'Derivation appendix'), {title:'Derivation appendix, rewritten'}));
  const d = diffLines(SRC, out);
  ok('exactly one line changed', d.length === 2, d.join('\n       '));
  ok('the new title is there', out.includes('** DONE Derivation appendix, rewritten'));
  ok('everything else re-parses unchanged',
     JSON.stringify(parse(out).nodes.map(n=>n.title).filter(t=>!t.startsWith('Derivation'))) ===
     JSON.stringify(parse(SRC).nodes.map(n=>n.title).filter(t=>!t.startsWith('Derivation'))));
}

console.log('\ntags and milestones survive a retitle');
{
  const doc = parse(SRC);
  const out = E.apply(doc, E.setHeading(node(doc,'Submit'), {title:'Submit the thesis'}));
  ok('tag is still there and still aligned',
     out.split('\n').some(l => l.startsWith('** TODO Submit the thesis') && l.endsWith(':milestone:')));
  ok('re-parses as a milestone', parse(out).nodes.find(n=>n.title==='Submit the thesis').tags.includes('milestone'));
}

console.log('\nstatus changes carry the timestamp with them');
{
  const doc = parse(SRC);
  const n = node(doc,'Chapter 5 — Conclusions');
  const out = E.apply(doc, E.setStatus(n, 'done', '2026-09-20'));
  const got = parse(out).nodes.find(x => x.title === 'Chapter 5 — Conclusions');
  ok('TODO became DONE', got.status === 'done');
  ok('a CLOSED stamp was added', out.includes('CLOSED: [2026-09-20 Sun]'));
  ok('only two lines differ', diffLines(SRC, out).length === 3, diffLines(SRC,out).join('\n       '));
}
{
  const doc = parse(SRC);
  const out = E.apply(doc, E.setStatus(node(doc,'Added the pseudo-code box'), 'planned'));
  const got = parse(out).nodes.find(x => x.title === 'Added the pseudo-code box');
  ok('DONE became TODO', got.status === 'planned');
  ok('the CLOSED line was removed', got.date === null);
}

console.log('\nproperties');
{
  const doc = parse(SRC);
  const out = E.apply(doc, E.setProp(node(doc,'Read the twelve core papers'), 'ID', 'l3'));
  ok('a drawer was created', parse(out).nodes.find(n=>n.title==='Read the twelve core papers').id === 'l3');
  ok('only the drawer was inserted', diffLines(SRC, out).length === 3);

  const doc2 = parse(out);
  const back = E.apply(doc2, E.setProp(node(doc2,'Read the twelve core papers'), 'ID', null));
  ok('removing the last property removes the drawer', back === SRC, diffLines(SRC, back).join('\n       '));
}
{
  const doc = parse(SRC);
  const n = node(doc,'Related work folded into Chapter 1');       // already has :MERGES:
  const out = E.apply(doc, E.setProp(n, 'ID', 'm4'));
  const got = parse(out).nodes.find(x => x.title === 'Related work folded into Chapter 1');
  ok('added alongside an existing property', got.id === 'm4' && got.merges[0] === 'lit');
}

console.log('\ninserting and removing');
{
  const doc = parse(SRC);
  const last = doc.nodes.filter(n => n.branch === 'ch4').pop().at;
  const out = E.apply(doc, E.insertNode(branch(doc,'ch4'), last,
    {title:'Rework 4.3 as well', status:'done', date:'2026-09-12', desc:'Same problem as 4.2.'}));
  const got = parse(out);
  ok('the entry landed on the right branch', got.nodes.filter(n=>n.branch==='ch4').pop().title === 'Rework 4.3 as well');
  ok('three lines added, nothing removed', diffLines(SRC,out).every(l=>l.startsWith('+')) && diffLines(SRC,out).length===3);
  ok('node count went up by one', got.nodes.length === doc.nodes.length + 1);

  const doc2 = parse(out);
  const back = E.apply(doc2, E.removeEntry(node(doc2,'Rework 4.3 as well')));
  ok('removing it again restores the file exactly', back === SRC, diffLines(SRC,back).join('\n       '));
}

console.log('\norg that gitrove does not model is left alone');
{
  const foreign = SRC.replace(
`** DONE Batch runs on the cluster
CLOSED: [2026-01-08 Thu]`,
`** DONE Batch runs on the cluster
CLOSED: [2026-01-08 Thu]
:LOGBOOK:
CLOCK: [2026-01-08 Thu 09:14]--[2026-01-08 Thu 17:02] =>  7:48
:END:
Ran overnight. See [[file:notes/cluster.org][the cluster notes]].
#+begin_src sh
  sbatch --array=1-240 run.sh
#+end_src
- 240 jobs
- one failed node`);

  const doc = parse(foreign);
  const nd = doc.nodes.find(x => x.title === 'Batch runs on the cluster');
  ok('the logbook drawer is not read as prose', !nd.desc.includes('CLOCK'));
  ok('the src block is not read as prose', !nd.desc.includes('sbatch'));
  ok('the link line is the description', nd.desc.startsWith('Ran overnight.'));

  // edit an unrelated entry
  const out = E.apply(doc, E.setHeading(node(doc,'Final pass on Chapter 3'), {title:'Final pass on Ch. 3'}));
  ok('every foreign line survives an unrelated edit',
     ['[[file:notes/cluster.org]', '#+begin_src sh', 'sbatch --array=1-240 run.sh', ':LOGBOOK:',
      'CLOCK: [2026-01-08 Thu 09:14]', '- 240 jobs'].every(s => out.includes(s)));
  ok('only the retitled line differs', diffLines(foreign, out).length === 2);

  // edit the entry that HAS the foreign content
  const out2 = E.apply(doc, E.setDesc(nd.at, 'Ran overnight, eleven hours of wall time.'));
  ok('rewriting its description keeps the block, list and drawer',
     ['#+begin_src sh','sbatch --array=1-240 run.sh',':LOGBOOK:','- 240 jobs'].every(s => out2.includes(s)));
  ok('and the old prose is gone', !out2.includes('See [[file:notes/cluster.org]'));
  ok('only the prose line differs', diffLines(foreign, out2).length === 2, diffLines(foreign,out2).join('\n       '));
}

console.log('\noverlapping edits are refused');
{
  const doc = parse(SRC);
  const n = node(doc,'Derivation appendix');
  let threw = false;
  try { E.apply(doc, [E.setHeading(n,{title:'a'}), E.setHeading(n,{title:'b'})]); } catch { threw = true; }
  ok('two edits to the same line throw rather than corrupt', threw);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
