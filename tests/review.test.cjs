const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
// Run the actual TypeScript parsers without introducing a test runtime dependency.
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
const { buildHandReplay } = require('../lib/parser/hand-replay.ts');
const { parseReviewHands } = require('../lib/parser/review-hands.ts');
const { seatPosition } = require('../lib/parser/hand-history.ts');

const history = `Winamax Poker - CashGame - HandId: #test-1 - Holdem no limit (1€/2€) - 2026/09/30 12:00:00 UTC
Table: 'Test' 6-max (real money) Seat #1 is the button
Seat 1: Hero (200€)
Seat 2: Small Blind (200€)
Seat 3: Big Blind (200€)
*** ANTE/BLINDS ***
Small Blind posts small blind 1€
Big Blind posts big blind 2€
Dealt to Hero [As Kh]
*** PRE-FLOP ***
Hero raises 4€ to 6€
Small Blind folds
Big Blind calls 4€
*** FLOP *** [Ah 8c 2d]
Big Blind checks
Hero bets 8€
Big Blind raises 16€ to 24€
Hero calls 16€
*** TURN *** [Ah 8c 2d] [7s]
Big Blind checks
Hero checks
*** RIVER *** [Ah 8c 2d 7s] [3c]
Big Blind checks
Hero bets 30€
Big Blind folds
Uncalled bet (30€) returned to Hero
Hero collected 61€ from pot
*** SUMMARY ***
Total pot 61€ | No rake
Seat 1: Hero won 61€`;
const parsed = parseReviewHands(history);
assert.equal(parsed.length, 1, 'Native grouped-card histories import');
assert.equal(parsed[0].heroCards, '[AS] [KH]');
assert.equal(parsed[0].position, 'BTN');
assert.equal(parseReviewHands(history.replace('Seat #1 is the button', 'Seat #3 is the button').replace('Seat 1: Hero won 61€', 'Seat 1: Hero (small blind) won 61€'))[0].position, 'SB', 'Summary seats must not alter positions');
assert.ok(parsed[0].tags.includes('Paire au flop'), 'Grouped board cards are classified');
const replay = buildHandReplay(history, 'Hero');
assert.deepEqual(replay.warnings, []);
assert.equal(replay.bigBlind, 2);
assert.equal(buildHandReplay(history.replace('Big Blind posts big blind 2€', 'Big Blind posts big blind 0,50€ and is all-in'), 'Hero').bigBlind, 2, 'A short all-in blind does not redefine the stakes');
const afterRaise = replay.frames.find(f => f.label === 'Hero · raises 4€ to 6€');
assert.equal(afterRaise.pot, 9);
assert.equal(afterRaise.players.find(p => p.name === 'Hero').stack, 194);
const flop = replay.frames.find(f => f.label === 'Flop');
assert.equal(flop.pot, 13);
assert.deepEqual(flop.board, ['AH', '8C', '2D']);
assert.ok(flop.players.every(p => p.committed === 0));
const flopRaise = replay.frames.find(f => f.label === 'Big Blind · raises 16€ to 24€');
assert.equal(flopRaise.pot, 45, 'Raise-to uses current-street total, not its increment');
const turn = replay.frames.find(f => f.label === 'Turn');
assert.equal(turn.pot, 61);
assert.equal(turn.board.length, 4);
const river = replay.frames.find(f => f.label === 'River');
assert.equal(river.board.length, 5);
const refund = replay.frames.find(f => f.label.includes('récupère'));
assert.equal(refund.pot, 61);
assert.equal(refund.players.find(p => p.name === 'Hero').stack, 170);
const final = replay.frames.at(-1);
assert.equal(final.pot, 0);
assert.equal(final.players.find(p => p.name === 'Hero').stack, 231, 'Summary must not double-count payout');
assert.equal(final.players.reduce((n,p) => n+p.stack, 0) + final.pot, 600, 'Chip conservation');
assert.ok(replay.frames.filter(f => !f.result).every(f => !f.label.includes('collected')));
assert.ok(replay.frames.filter(f => f.street === 'Préflop').every(f => f.board.length === 0), 'No future board leaks');
assert.equal(replay.frames[0].players.find(p => p.name === 'Hero').stack, 200, 'Snapshots do not mutate');

const copied = history
  .replace('Dealt to Hero [As Kh]', 'Dealt to   [b]Hero[/b]   \n[AS] [KH]')
  .replace('*** FLOP *** [Ah 8c 2d]', '[b]FLOP[/b]\n\n[AH] [8C] [2D]')
  .replace('*** TURN *** [Ah 8c 2d] [7s]', '[b]TURN[/b]\n[AH 8C 2D] [7S]')
  .replace('*** RIVER *** [Ah 8c 2d 7s] [3c]', '[b]RIVER[/b]\n[AH 8C 2D 7S] [3C]');
const copiedHand = parseReviewHands(copied)[0];
assert.equal(copiedHand.heroCards, '[AS] [KH]', 'Multiline cards and formatted hero name import');
const copiedReplay = buildHandReplay(copied, 'Hero');
assert.deepEqual(copiedReplay.frames[0].players.find(p=>p.name==='Hero').cards, ['AS','KH']);
assert.deepEqual(copiedReplay.frames.find(f=>f.label==='Flop').board, ['AH','8C','2D']);
assert.deepEqual(copiedReplay.frames.find(f=>f.label==='Turn').board, ['AH','8C','2D','7S']);
assert.deepEqual(copiedReplay.frames.find(f=>f.label==='River').board, ['AH','8C','2D','7S','3C']);
assert.deepEqual(copiedReplay.warnings, []);
assert.ok(copiedReplay.frames.filter(f=>f.street==='Préflop').every(f=>f.board.length===0));
const savedCards = buildHandReplay(history.replace('Dealt to Hero [As Kh]', ''), 'Hero', '[AS] [KH]');
assert.deepEqual(savedCards.frames[0].players.find(p=>p.name==='Hero').cards, ['AS','KH'], 'Existing saved hero cards recover older incomplete raw text');
assert.deepEqual(require('../lib/parser/hand-history.ts').historyCards('[10♠ A♥️]'), ['TS','AH']);
assert.deepEqual(require('../lib/parser/hand-history.ts').historyCards('[AsKh]'), ['AS','KH']);

const forum = history.replace('[As Kh]', '[AS] [KH]').replace('[Ah 8c 2d]', '[AH] [8C] [2D]');
assert.equal(parseReviewHands(forum).length, 1);
assert.equal(buildHandReplay(forum, 'Hero').frames.find(f => f.label === 'Flop').board.length, 3);
assert.equal(parseReviewHands(history + '\n\n' + history.replace('#test-1', '#test-2')).length, 2);
assert.equal(seatPosition(1, [1, 3], 1), 'BTN / SB');
assert.equal(seatPosition(3, [1, 3], 1), 'BB');

const showdown = history.replace('Big Blind folds\nUncalled bet (30€) returned to Hero\nHero collected 61€ from pot', 'Big Blind calls 30€\n*** SHOW DOWN ***\nBig Blind shows [Ac Qh]\nHero shows [As Kh]\nHero collected 121€ from pot');
const shown = buildHandReplay(showdown, 'Hero');
assert.ok(shown.frames.filter(f=>!f.result).every(f=>f.players.find(p=>p.name==='Big Blind').cards.length===0), 'Opponent cards hidden before showdown');
assert.deepEqual(shown.frames.at(-1).players.find(p=>p.name==='Big Blind').cards, ['AC','QH']);
assert.equal(shown.frames.at(-1).players.reduce((n,p)=>n+p.stack,0),600);

const allIn = `Winamax Poker - CashGame - HandId: #sidepot - Holdem no limit (0,50€/1€)
Table: 'Test' Seat #1 is the button
Seat 1: Hero (10€)
Seat 2: Villain (20€)
Seat 3: Third (20€)
[ANTE/BLINDS]
Hero posts ante 0,50€
Villain posts small blind 0,50€
Third posts big blind 1€
Dealt to Hero [As] [Ks]
[PRE-FLOP]
Hero raises 8,50€ to 9,50€ and is all-in
Villain raises 10,50€ to 20€ and is all-in
Third calls 19€ and is all-in
[SHOW DOWN]
Hero shows [As Ks]
Villain shows [Ah Kh]
Third shows [Qc Qd]
Hero collected 29€ from main pot
Villain collected 21€ from side pot 1
[SUMMARY]
Seat 1: Hero won 29€`;
const side = buildHandReplay(allIn, 'Hero');
assert.deepEqual(side.warnings, []);
assert.equal(side.frames.find(f=>f.label.includes('calls 19')).pot,50);
assert.equal(side.frames.at(-1).pot,0);
assert.equal(side.frames.at(-1).players.reduce((n,p)=>n+p.stack,0),50);
assert.equal(side.frames.find(f=>f.label.includes('raises 8')).players.find(p=>p.name==='Hero').stack,0);
assert.ok(buildHandReplay(history.replace('Hero bets 8€', 'Hero bets unknown'), 'Hero').warnings.length, 'Unsupported betting lines are flagged');
assert.ok(buildHandReplay('Invalid hand', 'Hero').warnings.length);
console.log('Review parsers: native/forum import, snapshots, positions, raises, streets, refunds, all-ins, multiple pots, result privacy and malformed actions passed.');
