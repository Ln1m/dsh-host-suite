const nodes = {};
function reset() { for (const k of Object.keys(nodes)) delete nodes[k]; }
function pane(id, tabs) { nodes[id] = { kind: 'pane', id, host: 'dock', tabs: tabs || ['t-' + id] }; return id; }
function split(id, axis, children, sizes) { nodes[id] = { kind: 'split', id, axis, children, sizes: sizes || children.map(() => +(1 / children.length).toFixed(6)) }; return id; }

function TR(z) { return z.map(v => 'minmax(0, ' + v + 'fr)').join(' 0px '); }

function place(nodeId, cell) {
  const node = nodes[nodeId];
  if (node.kind === 'pane') return { kind: 'pane', id: nodeId, cell: { col: cell.col, row: cell.row }, idx: cell.idx };
  const row = node.axis === 'row';
  const t = { kind: 'split', id: nodeId, axis: node.axis, style: row ? { gridTemplateColumns: TR(node.sizes) } : { gridTemplateColumns: 'minmax(0, 1fr)', gridTemplateRows: TR(node.sizes) }, cls: row ? 'tabLayout' : 'tabLayout+splitColumn', children: [] };
  node.children.forEach((childId, i) => {
    const track = i * 2 + 1;
    if (i > 0) t.children.push({ kind: 'divider', split: nodeId, index: i - 1, col: row ? i * 2 : 1, row: row ? 1 : i * 2, cls: row ? 'divider+tabLayoutDivider' : 'divider' });
    const child = nodes[childId];
    const local = row ? { col: track, row: 1 } : { col: 1, row: track };
    const placed = place(childId, { col: local.col, row: local.row, idx: i });
    if (child.kind === 'pane') { placed.cell = local; placed.idx = i; t.children.push(placed); }
    else { placed.cell = local; t.children.push(placed); }
  });
  return t;
}

let fail = 0;
function eq(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { fail++; console.log('FAIL ' + label + '\n  got  ' + g + '\n  want ' + w); }
  else console.log('ok   ' + label);
}

// 1 single pane
reset(); const p1 = pane('pane1');
eq('single pane', place('pane1', { col: 1, row: 1, idx: 0 }), { kind: 'pane', id: 'pane1', cell: { col: 1, row: 1 }, idx: 0 });

// 2 two panes in a row (current product behaviour - must stay identical)
reset(); const a2 = pane('pane1'), b2 = pane('pane2'); const s2 = split('split2', 'row', [a2, b2]);
eq('row of 2', place('split2', { col: 0, row: 0, idx: 0 }), {
  kind: 'split', id: 'split2', axis: 'row', style: { gridTemplateColumns: 'minmax(0, 0.5fr) 0px minmax(0, 0.5fr)' }, cls: 'tabLayout',
  children: [
    { kind: 'pane', id: 'pane1', cell: { col: 1, row: 1 }, idx: 0 },
    { kind: 'divider', split: 'split2', index: 0, col: 2, row: 1, cls: 'divider+tabLayoutDivider' },
    { kind: 'pane', id: 'pane2', cell: { col: 3, row: 1 }, idx: 1 }
  ]
});

// 3 two panes stacked (column axis - terminal below)
reset(); const a3 = pane('pane1'), b3 = pane('pane2'); split('split3', 'column', [a3, b3]);
eq('column of 2', place('split3', { col: 0, row: 0, idx: 0 }), {
  kind: 'split', id: 'split3', axis: 'column', style: { gridTemplateColumns: 'minmax(0, 1fr)', gridTemplateRows: 'minmax(0, 0.5fr) 0px minmax(0, 0.5fr)' }, cls: 'tabLayout+splitColumn',
  children: [
    { kind: 'pane', id: 'pane1', cell: { col: 1, row: 1 }, idx: 0 },
    { kind: 'divider', split: 'split3', index: 0, col: 1, row: 2, cls: 'divider' },
    { kind: 'pane', id: 'pane2', cell: { col: 1, row: 3 }, idx: 1 }
  ]
});

// 4 three panes in a row -> two dividers
reset(); const r1 = pane('pane1'), r2 = pane('pane2'), r3 = pane('pane3'); split('split4', 'row', [r1, r2, r3], [0.4, 0.3, 0.3]);
const t4 = place('split4', { col: 0, row: 0, idx: 0 });
eq('row of 3 cells', t4.children.filter(x => x.kind === 'pane').map(x => x.cell), [{ col: 1, row: 1 }, { col: 3, row: 1 }, { col: 5, row: 1 }]);
eq('row of 3 dividers', t4.children.filter(x => x.kind === 'divider').map(x => [x.split, x.index, x.col, x.row]), [['split4', 0, 2, 1], ['split4', 1, 4, 1]]);

// 5 nested: left half stacked, right half whole
reset();
const n1 = pane('pane10'), n2 = pane('pane11'); const left = split('split11', 'column', [n1, n2], [0.3, 0.7]);
const right = pane('pane12'); split('split22', 'row', [left, right], [0.5, 0.5]);
const t5 = place('split22', { col: 0, row: 0, idx: 0 });
eq('nested root tracks', t5.style, { gridTemplateColumns: 'minmax(0, 0.5fr) 0px minmax(0, 0.5fr)' });
eq('nested root divider', t5.children.find(x => x.kind === 'divider'), { kind: 'divider', split: 'split22', index: 0, col: 2, row: 1, cls: 'divider+tabLayoutDivider' });
const inner = t5.children.find(x => x.kind === 'split');
eq('nested inner placement', { cell: inner.cell, cls: inner.cls }, { cell: { col: 1, row: 1 }, cls: 'tabLayout+splitColumn' });
eq('nested inner rows', inner.style.gridTemplateRows, 'minmax(0, 0.3fr) 0px minmax(0, 0.7fr)');
eq('nested inner panes', inner.children.filter(x => x.kind === 'pane').map(x => [x.id, x.cell]), [['pane10', { col: 1, row: 1 }], ['pane11', { col: 1, row: 3 }]]);
eq('nested inner divider', inner.children.find(x => x.kind === 'divider'), { kind: 'divider', split: 'split11', index: 0, col: 1, row: 2, cls: 'divider' });
eq('nested right pane', t5.children.filter(x => x.kind === 'pane').map(x => [x.id, x.cell]), [['pane12', { col: 3, row: 1 }]]);

// 6 nested deeper: row containing (column containing (row of 2))
reset();
const d1 = pane('pane1'), d2 = pane('pane2'); const deepRow = split('split3', 'row', [d1, d2]);
const d3 = pane('pane3'); const midCol = split('split2', 'column', [deepRow, d3], [0.5, 0.5]);
const d4 = pane('pane4'); split('split1', 'row', [midCol, d4], [0.5, 0.5]);
const t6 = place('split1', { col: 0, row: 0, idx: 0 });
const mid = t6.children.find(x => x.kind === 'split');
const deep = mid.children.find(x => x.kind === 'split');
eq('deep level3 axis', deep.axis, 'row');
eq('deep level3 pane cells', deep.children.filter(x => x.kind === 'pane').map(x => x.cell), [{ col: 1, row: 1 }, { col: 3, row: 1 }]);
eq('deep level2 pane cell', mid.children.filter(x => x.kind === 'pane').map(x => x.cell), [{ col: 1, row: 3 }]);

console.log(fail === 0 ? '\nALL PLACEMENT TESTS PASSED' : '\n' + fail + ' TEST(S) FAILED');
process.exit(fail === 0 ? 0 : 1);
