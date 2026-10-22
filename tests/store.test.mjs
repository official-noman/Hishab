/* Undo snapshot persistence. Run with: npm test */
import assert from 'node:assert/strict';

const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => (memory.has(key) ? memory.get(key) : null),
  setItem: (key, value) => { memory.set(key, String(value)); },
  removeItem: (key) => { memory.delete(key); },
};

const {
  addTxn, clearUndo, defaultState, loadUndo, makeTxn, markDuplicateRows, saveUndo, undoInfo,
} = await import('../assets/js/store.js');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    throw error;
  }
}

console.log('\nundo snapshots');

test('snapshot restores the state from before the last action', () => {
  const state = defaultState();
  addTxn(state, makeTxn(state, {
    type: 'expense', amount: 100, category: 'food', account: 'cash',
    date: '2026-10-01', memberId: state.members[0].id, note: 'Lunch',
  }));
  const before = JSON.stringify(state);

  saveUndo(state, 'Added a transaction', { preset: 'custom', from: '2026-10-01', to: '2026-10-01' });
  addTxn(state, makeTxn(state, {
    type: 'expense', amount: 250, category: 'food', account: 'cash',
    date: '2026-10-02', memberId: state.members[0].id, note: 'Dinner',
  }));
  assert.equal(state.txns.length, 2);

  const undo = loadUndo();
  assert.ok(undo);
  assert.equal(undo.label, 'Added a transaction');
  assert.equal(undo.state.txns.length, 1);
  assert.equal(JSON.stringify(undo.state), before);
  assert.equal(undo.ui.preset, 'custom');
  assert.equal(undo.ui.from, '2026-10-01');
});

test('undo metadata is available without restoring the state', () => {
  const info = undoInfo();
  assert.ok(info);
  assert.equal(info.label, 'Added a transaction');
  assert.ok(info.at);
});

test('two rows sharing a loose key are not both treated as duplicates', () => {
  const existing = [{
    source: 'bank', date: '2026-10-18', amount: 200, type: 'expense',
    note: 'IB/BKASH/01775664595/NO REMARKS',
  }];
  const rows = [
    existing[0],
    {
      source: 'bank', date: '2026-10-18', amount: 200, type: 'expense',
      note: 'IB/BKASH/01521327804/NO REMARKS ABDULLAH AL NOMAN',
    },
  ];
  const marked = markDuplicateRows(existing, rows);
  assert.equal(marked[0].duplicate, true);
  assert.equal(marked[1].duplicate, false);
  assert.equal(marked[1].include, true);
});

test('an exact repeat inside one import is still a duplicate', () => {
  const row = {
    source: 'bank', date: '2026-10-18', amount: 200, type: 'expense',
    note: 'IB/BKASH/01775664595/NO REMARKS',
  };
  const marked = markDuplicateRows([], [row, { ...row }]);
  assert.equal(marked[0].duplicate, false);
  assert.equal(marked[1].duplicate, true);
});

test('clearing removes the snapshot', () => {
  clearUndo();
  assert.equal(loadUndo(), null);
  assert.equal(undoInfo(), null);
});

console.log(`\n${passed} undo tests passed`);
