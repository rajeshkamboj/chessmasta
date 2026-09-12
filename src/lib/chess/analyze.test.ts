import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { aggregate, categorize, isCheckmateMove } from './analyze.ts';

test('checkmate move is terminal and excluded from CP loss classification', () => {
  const fen = '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1';
  const san = 'Qf8#';

  assert.equal(isCheckmateMove(fen, san), true);
  assert.equal(categorize(0, 100000, true), 'checkmate');
  assert.equal(categorize(0, 90000, false), 'good');

  const evals = [
    { color: 'white', category: 'checkmate', pattern: 'mate_missed', dropCp: 0 },
    { color: 'white', category: 'mistake', pattern: 'planning', dropCp: 150 },
    { color: 'white', category: 'inaccuracy', pattern: 'planning', dropCp: 80 },
    { color: 'black', category: 'checkmate', pattern: 'mate_missed', dropCp: 0 },
  ] as any[];

  const agg = aggregate(evals, 'white');
  assert.equal(agg.blunders, 0);
  assert.equal(agg.mistakes, 1);
  assert.equal(agg.inaccuracies, 1);
  assert.equal(agg.acpl, 77);
});

test('mate detection works for black and a legal mate-in-one move', () => {
  const blackFen = 'rnbqkbnr/pppp1ppp/4p3/8/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2';
  const blackMove = new Chess(blackFen).moves({ verbose: true }).find((m) => m.san === 'Qh4#');
  assert.ok(blackMove);
  assert.equal(isCheckmateMove(blackFen, blackMove!.san), true);

  const after = new Chess(blackFen);
  after.move('Qh4#');
  assert.equal(after.isCheckmate(), true);
});
