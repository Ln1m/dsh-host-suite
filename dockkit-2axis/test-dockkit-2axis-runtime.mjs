import fs from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const distDir = join(process.env.DSH_ROOT || join(homedir(), 'DeepSeek_harness'), 'node_modules', '@deepseek-ai', 'dsh-web-frontend', 'dist');
const html = fs.readFileSync(distDir + '\\index.html', 'utf8');
const m = html.match(/assets\/(index-[A-Za-z0-9_-]+\.js)/);
if (!m) throw new Error('cannot resolve shell bundle from dist/index.html');
const text = fs.readFileSync(distDir + '\\assets\\' + m[1], 'utf8');

function extractFn(src, name) {
  const anchor = 'function ' + name + '(';
  const i = src.indexOf(anchor);
  if (i < 0) throw new Error('function not found: ' + name);
  if (src.indexOf(anchor, i + 1) >= 0) throw new Error('function not unique: ' + name);
  let depth = 0;
  for (let k = i; k < src.length; k++) {
    const ch = src[k];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return src.slice(i, k + 1); }
  }
  throw new Error('unbalanced braces');
}

const nsSrc = extractFn(text, 'NS');
if (!nsSrc.includes('dkCell') && !nsSrc.includes('cell:cell')) { /* renderer does not use TabHost cell directly; fine */ }
if (nsSrc.includes('DockLayout requires one pane or two horizontally split panes')) throw new Error('old guard still present in NS');

const j = { useRef: () => ({ current: undefined }) };
const l = { jsx: (t, p, k) => ({ type: t, props: p || {}, key: k }), jsxs: (t, p, k) => ({ type: t, props: p || {}, key: k }) };
const cssNames = ['split', 'splitRow', 'splitColumn', 'splitCell', 'divider', 'surface', 'tabLayout', 'tabCell', 'emptyTabHost', 'floatingCell', 'tabHost', 'float', 'tabHostHeader', 'tabHostBody', 'tabLayoutDivider', 'pane', 'paneBody'];
const xe = {}; for (const n of cssNames) xe[n] = '_' + n;
const he = (...a) => a.filter(Boolean).join(' ');
function TabHost() {}
function TabPanel() {}
const _n = (s, id) => { const o = s.nodes[id]; if (!o) throw new Error('unknown node ' + id); return o; };
const Pe = (s, id) => { const o = _n(s, id); if (o.kind !== 'pane') throw new Error(id + ' is not a pane'); return o; };
const Kt = (s, tabId) => { for (const o of Object.values(s.nodes)) if (o.kind === 'pane' && o.tabs.includes(tabId)) return o; throw new Error('tab ' + tabId); };
const S7 = () => ({});

const NS = new Function('j', 'l', 'xe', 'he', '_n', 'Pe', 'Kt', 'S7', 'TS', 'b7', nsSrc + '\nreturn NS;')(j, l, xe, he, _n, Pe, Kt, S7, TabHost, TabPanel);

const dividerCalls = [];
function call(state) {
  return NS({
    state,
    callbacks: { onFocusTab() {}, onFocusPane() {}, onDividerPressed(id, i) { dividerCalls.push([id, i]); } },
    preview: undefined, intents: {}, labels: {}, renderTab() {}, renderTabTitle() {}, canCloseTab() {}, active: true
  });
}
function kids(el) { const c = el.props.children; return Array.isArray(c) ? c : (c === undefined || c === null ? [] : [c]); }
function isHost(el) { return typeof el.type === 'function' && el.type.name === 'TabHost'; }
function isPanel(el) { return typeof el.type === 'function' && el.type.name === 'TabPanel'; }

let fail = 0;
function eq(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { fail++; console.log('FAIL ' + label + '\n  got  ' + g + '\n  want ' + w); }
  else console.log('ok   ' + label);
}

function paneState(spec, floats) {
  const nodes = {}, tabs = {};
  for (const id of Object.keys(spec)) {
    const n = spec[id];
    if (n.kind === 'pane') {
      nodes[id] = { kind: 'pane', id, host: n.host || 'dock', tabs: n.tabs, activeTabId: n.tabs[0], rect: n.rect };
      for (const t of n.tabs) tabs[t] = { id: t, kind: 'guide', title: t };
    } else nodes[id] = { kind: 'split', id, axis: n.axis, children: n.children, sizes: n.sizes };
  }
  return { rootId: spec.__root, floats: floats || [], tabs, nodes, activePaneId: spec.__root === undefined ? undefined : undefined, expanded: true };
}

// 1) single pane
let st = paneState({ __root: 'pane1', pane1: { kind: 'pane', tabs: ['t1'] } });
let el = call(st);
eq('single: root className', el.props.className, '_tabLayout');
eq('single: no split attr', el.props['data-dockkit-split'], undefined);
eq('single: child count', kids(el).length, 1);
eq('single: child is TabHost', isHost(kids(el)[0]), true);
eq('single: cell', kids(el)[0].props.cell, { col: 1, row: 1, idx: 0 });
eq('single: column prop', kids(el)[0].props.column, 0);

// 2) row of two
st = paneState({ __root: 'split2', pane1: { kind: 'pane', tabs: ['t1'] }, pane2: { kind: 'pane', tabs: ['t2'] }, split2: { kind: 'split', axis: 'row', children: ['pane1', 'pane2'], sizes: [0.5, 0.5] } });
el = call(st);
eq('row2: split attr', el.props['data-dockkit-split'], 'split2');
eq('row2: tracks', el.props.style.gridTemplateColumns, 'minmax(0, 0.5fr) 0px minmax(0, 0.5fr)');
eq('row2: no rows override', el.props.style.gridTemplateRows, undefined);
eq('row2: children', kids(el).length, 3);
eq('row2: cells', kids(el).filter(isHost).map(x => x.props.cell), [{ col: 1, row: 1, idx: 0 }, { col: 3, row: 1, idx: 1 }]);
const d2 = kids(el).find(x => x.props['data-dockkit-divider']);
eq('row2: divider attr', d2.props['data-dockkit-divider'], 'split2:0');
eq('row2: divider cls', d2.props.className, '_divider _tabLayoutDivider');
eq('row2: divider place', [d2.props.style.gridColumn, d2.props.style.gridRow], [2, 1]);
d2.props.onPointerDown({});
eq('row2: divider reports', dividerCalls[dividerCalls.length - 1], ['split2', 0]);

// 3) column of two (terminal below)
dividerCalls.length = 0;
st = paneState({ __root: 'split3', pane1: { kind: 'pane', tabs: ['t1'] }, pane2: { kind: 'pane', tabs: ['t2'] }, split3: { kind: 'split', axis: 'column', children: ['pane1', 'pane2'], sizes: [0.5, 0.5] } });
el = call(st);
eq('col2: root className', el.props.className, '_tabLayout _splitColumn');
eq('col2: columns minmax', el.props.style.gridTemplateColumns, 'minmax(0, 1fr)');
eq('col2: rows tracks', el.props.style.gridTemplateRows, 'minmax(0, 0.5fr) 0px minmax(0, 0.5fr)');
eq('col2: cells', kids(el).filter(isHost).map(x => x.props.cell), [{ col: 1, row: 1, idx: 0 }, { col: 1, row: 3, idx: 1 }]);
const d3 = kids(el).find(x => x.props['data-dockkit-divider']);
eq('col2: divider cls', d3.props.className, '_divider');
eq('col2: divider place', [d3.props.style.gridColumn, d3.props.style.gridRow], [1, 2]);
eq('col2: divider pointer-events', d3.props.style.pointerEvents, 'auto');
d3.props.onPointerDown({});
eq('col2: divider reports', dividerCalls[dividerCalls.length - 1], ['split3', 0]);

// 4) three panes in a row
st = paneState({ __root: 'split4', pane1: { kind: 'pane', tabs: ['t1'] }, pane2: { kind: 'pane', tabs: ['t2'] }, pane3: { kind: 'pane', tabs: ['t3'] }, split4: { kind: 'split', axis: 'row', children: ['pane1', 'pane2', 'pane3'], sizes: [0.4, 0.3, 0.3] } });
el = call(st);
eq('row3: cells', kids(el).filter(isHost).map(x => x.props.cell), [{ col: 1, row: 1, idx: 0 }, { col: 3, row: 1, idx: 1 }, { col: 5, row: 1, idx: 2 }]);
eq('row3: dividers', kids(el).filter(x => x.props['data-dockkit-divider']).map(x => [x.props['data-dockkit-divider'], x.props.style.gridColumn]), [['split4:0', 2], ['split4:1', 4]]);

// 5) nested: left half stacked, right half whole
st = paneState({
  __root: 'split22',
  pane10: { kind: 'pane', tabs: ['t10'] }, pane11: { kind: 'pane', tabs: ['t11'] }, pane12: { kind: 'pane', tabs: ['t12'] },
  split11: { kind: 'split', axis: 'column', children: ['pane10', 'pane11'], sizes: [0.3, 0.7] },
  split22: { kind: 'split', axis: 'row', children: ['split11', 'pane12'], sizes: [0.5, 0.5] }
});
el = call(st);
const nested = kids(el).find(x => x.props['data-dockkit-split'] === 'split11');
eq('nested: container cls', nested.props.className, '_tabLayout _splitColumn');
eq('nested: container place', [nested.props.style.gridColumn, nested.props.style.gridRow], [1, 1]);
eq('nested: rows', nested.props.style.gridTemplateRows, 'minmax(0, 0.3fr) 0px minmax(0, 0.7fr)');
eq('nested: inner cells', kids(nested).filter(isHost).map(x => x.props.cell), [{ col: 1, row: 1, idx: 0 }, { col: 1, row: 3, idx: 1 }]);
eq('nested: inner divider', kids(nested).find(x => x.props['data-dockkit-divider']).props['data-dockkit-divider'], 'split11:0');
eq('nested: right pane cell', kids(el).filter(isHost).map(x => x.props.cell), [{ col: 3, row: 1, idx: 1 }]);
eq('nested: root dividers', kids(el).filter(x => x.props['data-dockkit-divider']).map(x => x.props['data-dockkit-divider']), ['split22:0']);

// 6) empty pane placeholder
st = paneState({ __root: 'split5', pane1: { kind: 'pane', tabs: [] }, pane2: { kind: 'pane', tabs: ['t2'] }, split5: { kind: 'split', axis: 'row', children: ['pane1', 'pane2'], sizes: [0.5, 0.5] } });
el = call(st);
const empty = kids(el).find(x => x.props['data-dockkit-empty']);
eq('empty: placeholder exists', !!empty, true);
eq('empty: placeholder cell', [empty.props.style.gridColumn, empty.props.style.gridRow], [1, 1]);
eq('empty: renders TabPanel', isPanel(kids(empty)[0]), true);

// 7) floating pane still rendered, no cell placement
st = paneState({ __root: 'pane1', pane1: { kind: 'pane', tabs: ['t1'] } }, ['paneF']);
st.nodes.paneF = { kind: 'pane', id: 'paneF', host: 'float', tabs: ['tF'], activeTabId: 'tF', rect: { x: 10, y: 10, width: 300, height: 200 } };
st.tabs.tF = { id: 'tF', kind: 'terminal', title: 'T' };
el = call(st);
const fl = kids(el).filter(isHost).filter(x => x.props.pane.host === 'float');
eq('float: rendered once', fl.length, 1);
eq('float: no cell prop', fl[0].props.cell, undefined);
eq('float: column prop', fl[0].props.column, 0);
eq('float: appended last', isHost(kids(el)[kids(el).length - 1]), true);

console.log(fail === 0 ? '\nALL RUNTIME RENDER TESTS PASSED' : '\n' + fail + ' TEST(S) FAILED');
process.exit(fail === 0 ? 0 : 1);
