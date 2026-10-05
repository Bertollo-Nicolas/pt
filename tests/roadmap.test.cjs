const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);

const { buildRoadmap, nextRoadmapSpot } = require('../lib/roadmap.ts');
const tab = name => ({ name, rangeList: [] });
const rmData = {
  ranges: {},
  categories: {
    root: { name: 'Root', children: ['open', 'bb-utg', 'bb-bu'] },
    open: { name: 'Open', tabList: ['utg'], tabs: { utg: tab('UTG') } },
    'bb-utg': { name: 'BB vs UTG', tabList: ['two-five', 'three'], tabs: { 'two-five': tab('BB vs 2.5x'), three: tab('BB vs 3x') } },
    'bb-bu': { name: 'BB vs BU', tabList: ['two-five', 'three'], tabs: { 'two-five': tab('BB vs 2,5x'), three: tab('BB vs 3x') } },
  },
};

const stages = buildRoadmap(rmData, [], {}, {}, { roadmapKnown: ['open__utg'] });
const defense = stages.find(stage => stage.id === 'defense').spots;
assert.equal(defense.length, 4);
assert.equal(new Set(defense.map(spot => spot.displayName)).size, 4, 'Different sizings must have distinct labels');
assert.ok(defense.some(spot => spot.displayName === 'Défense · BB vs UTG - BB vs 2.5x'));
assert.ok(defense.some(spot => spot.displayName === 'Défense · BB vs UTG - BB vs 3x'));
assert.ok(defense.some(spot => spot.displayName === 'Défense · BB vs BU - BB vs 2.5x'), 'Comma decimals are normalized');
assert.equal(defense[0].villainPosition, 'BU', 'Button defense is prioritized before UTG defense');
assert.ok(defense.find(spot => spot.villainPosition === 'BU').priority > defense.find(spot => spot.villainPosition === 'UTG').priority);
assert.equal(nextRoadmapSpot(stages).villainPosition, 'BU', 'The next recommended spot follows impact priority');
console.log('Roadmap sizing labels and impact ordering passed.');
