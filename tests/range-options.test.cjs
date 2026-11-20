const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { getRangeGroups } = require('../lib/range-options.ts');
const tab = { name: 'BB vs BU', rangeList: [] };
const data = { ranges: {}, categories: {
  root: { name: 'root', children: ['a', 'b'] },
  a: { name: 'Cash', children: ['nested'], tabList: ['own', 'missing', 'own'], tabs: { own: tab } },
  nested: { name: 'Défense', children: ['a'], tabs: { deep: tab } },
  b: { name: 'Tournoi', tabs: { other: tab } },
  orphan: { name: 'Import', tabs: { loose: tab } },
} };
assert.deepEqual(getRangeGroups(null), []);
const groups = getRangeGroups(data);
assert.deepEqual(groups.map(group => [group.catId, group.path, group.tabs.map(tab => tab.id)]), [
  ['a', 'Cash', ['own']], ['nested', 'Cash / Défense', ['deep']],
  ['b', 'Tournoi', ['other']], ['orphan', 'Import', ['loose']],
]);
// Selection values preserve both IDs even with separators or duplicate names.
for (const group of groups) for (const item of group.tabs) {
  const [catId, tabId] = JSON.parse(JSON.stringify([group.catId, item.id]));
  assert.equal(data.categories[catId].tabs[tabId], tab);
}
console.log('Range selection: parent folders, nested folders, all imports, duplicate names and cyclic links passed.');

