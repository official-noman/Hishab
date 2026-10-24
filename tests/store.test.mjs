/* Undo snapshot persistence. Run with: npm test */
import assert from 'node:assert/strict';

const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => (memory.has(key) ? memory.get(key) : null),
  setItem: (key, value) => { memory.set(key, String(value)); },
  removeItem: (key) => { memory.delete(key); },
};

const {
  addContact, addTxn, buildBackup, clearUndo, defaultState, deleteContact, loadUndo, makeTxn,
  markDuplicateRows, mergeStates, parseBackup, saveUndo, undoInfo,
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

test('contacts normalize phone numbers, upsert by number and delete', () => {
  const state = defaultState();
  const created = addContact(state, { name: 'Jemmy bhai', phone: '+880 1712-345678' });
  assert.equal(created.ok, true);
  assert.equal(created.updated, false);
  assert.equal(created.contact.phone, '8801712345678');
  assert.equal(state.contacts.length, 1);

  const updated = addContact(state, { name: 'Jemmy', phone: '8801712345678' });
  assert.equal(updated.ok, true);
  assert.equal(updated.updated, true);
  assert.equal(state.contacts.length, 1);
  assert.equal(state.contacts[0].name, 'Jemmy');

  const removed = deleteContact(state, state.contacts[0].id);
  assert.equal(removed.name, 'Jemmy');
  assert.equal(state.contacts.length, 0);
});

test('contacts survive backup round-trip and merge once by phone', () => {
  const current = defaultState();
  addContact(current, { name: 'Jemmy bhai', phone: '918272727' });

  const exported = defaultState();
  addContact(exported, { name: 'Jemmy bhai', phone: '918272727' });
  addContact(exported, { name: 'Rizq restaurant', phone: '01711111111' });
  const restored = parseBackup(JSON.stringify(buildBackup(exported)));
  assert.equal(restored.contacts.length, 2);
  assert.equal(restored.contacts[1].phone, '01711111111');

  const merged = mergeStates(current, restored);
  assert.equal(merged.state.contacts.length, 2);
  assert.equal(merged.contactsAdded, 1);
  assert.deepEqual(
    merged.state.contacts.map((contact) => contact.phone).sort(),
    ['01711111111', '918272727'],
  );
});

test('clearing removes the snapshot', () => {
  clearUndo();
  assert.equal(loadUndo(), null);
  assert.equal(undoInfo(), null);
});

console.log(`\n${passed} undo tests passed`);
