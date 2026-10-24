import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSpeechRecognizer, normalizeVoiceText, parseVoiceCommand, speechSupported,
} from '../assets/js/voice.js';

const members = [
  { id: 'm_me', name: 'Me' },
  { id: 'm_dad', name: 'Dad' },
  { id: 'm_mom', name: 'Mom' },
];

test('fare with a description becomes a transport expense', () => {
  const result = parseVoiceCommand('fare 50 taka, for bus and rickshaw', {
    members,
    today: '2026-10-22',
  });
  assert.equal(result.ok, true);
  assert.equal(result.amount, 50);
  assert.equal(result.type, 'expense');
  assert.equal(result.category, 'transport');
  assert.equal(result.note, 'Bus and rickshaw');
  assert.equal(result.account, 'cash');
  assert.equal(result.date, '2026-10-22');
});

test('quoted category amount account note sequence is parsed', () => {
  const result = parseVoiceCommand('"transport" "50 taka" by cash for "bus fare"', {
    members,
    today: '2026-10-24',
  });
  assert.equal(result.ok, true);
  assert.equal(result.type, 'expense');
  assert.equal(result.category, 'transport');
  assert.equal(result.amount, 50);
  assert.equal(result.account, 'cash');
  assert.equal(result.toAccount, '');
  assert.equal(result.note, 'Bus fare');
  assert.equal(result.date, '2026-10-24');
  assert.deepEqual(result.warnings, []);
});

test('bus fare in words is parsed', () => {
  const result = parseVoiceCommand('bus fare fifty taka', { today: '2026-10-22' });
  assert.equal(result.amount, 50);
  assert.equal(result.category, 'transport');
  assert.equal(result.note, 'Bus fare');

  const fair = parseVoiceCommand('fair 50 taka', { today: '2026-10-22' });
  assert.equal(fair.category, 'transport');
  assert.equal(fair.amount, 50);
});

test('large spoken numbers and comma amounts work', () => {
  const result = parseVoiceCommand('I spent one thousand two hundred taka on groceries', {
    today: '2026-10-22',
  });
  assert.equal(result.amount, 1200);
  assert.equal(result.category, 'groceries');
  assert.equal(result.note, 'Groceries');

  const comma = parseVoiceCommand('paid 1,250 taka for medicine', { today: '2026-10-22' });
  assert.equal(comma.amount, 1250);
  assert.equal(comma.category, 'health');

  const lakh = parseVoiceCommand('paid 1.5 lakh taka for land', { today: '2026-10-22' });
  assert.equal(lakh.amount, 150000);
  assert.equal(lakh.note, 'Land');
});

test('salary is income', () => {
  const result = parseVoiceCommand('received 5000 taka salary', { today: '2026-10-22' });
  assert.equal(result.type, 'income');
  assert.equal(result.category, 'salary');
  assert.equal(result.amount, 5000);
  assert.equal(result.note, 'Salary');

  const payment = parseVoiceCommand('received payment 5000 taka', { today: '2026-10-22' });
  assert.equal(payment.type, 'income');
  assert.equal(payment.amount, 5000);

  const card = parseVoiceCommand('credit card payment 500', { today: '2026-10-22' });
  assert.equal(card.type, 'expense');
  assert.equal(card.category, 'bills');
  assert.equal(card.amount, 500);
});

test('transfer reads both accounts', () => {
  const result = parseVoiceCommand('transfer 1000 taka from bank to cash', {
    today: '2026-10-22',
  });
  assert.equal(result.type, 'transfer');
  assert.equal(result.category, 'transfer');
  assert.equal(result.account, 'bank');
  assert.equal(result.toAccount, 'cash');
  assert.equal(result.note, 'Bank to Cash');
});

test('bKash style transfers get sensible accounts', () => {
  const add = parseVoiceCommand('add money 500 from bank', { today: '2026-10-22' });
  assert.equal(add.type, 'transfer');
  assert.equal(add.account, 'bank');
  assert.equal(add.toAccount, 'bkash');

  const out = parseVoiceCommand('cash out 200 taka', { today: '2026-10-22' });
  assert.equal(out.type, 'transfer');
  assert.equal(out.account, 'bkash');
  assert.equal(out.toAccount, 'cash');

  const atm = parseVoiceCommand('ATM withdrawal 500', { today: '2026-10-22' });
  assert.equal(atm.type, 'transfer');
  assert.equal(atm.account, 'bank');
  assert.equal(atm.toAccount, 'cash');
});

test('yesterday and member names are understood', () => {
  const result = parseVoiceCommand('Dad spent 500 on medicine yesterday', {
    members,
    today: '2026-10-22',
  });
  assert.equal(result.memberId, 'm_dad');
  assert.equal(result.category, 'health');
  assert.equal(result.date, '2026-10-21');
  assert.equal(result.amount, 500);

  const lastNight = parseVoiceCommand('paid 300 for dinner last night', {
    today: '2026-10-22',
  });
  assert.equal(lastNight.date, '2026-10-21');
  assert.equal(lastNight.category, 'food');
});

test('purpose and description labels are separated', () => {
  const result = parseVoiceCommand('purpose fare description bus and rickshaw 50 taka', {
    today: '2026-10-22',
  });
  assert.equal(result.category, 'transport');
  assert.equal(result.note, 'Bus and rickshaw');
  assert.equal(result.amount, 50);
});

test('Bengali digits and words are parsed', () => {
  const digits = parseVoiceCommand('বাস ভাড়া ৫০ টাকা', { today: '2026-10-22' });
  assert.equal(digits.amount, 50);
  assert.equal(digits.type, 'expense');
  assert.equal(digits.category, 'transport');

  const words = parseVoiceCommand('রিকশা ভাড়া পঞ্চাশ টাকা', { today: '2026-10-22' });
  assert.equal(words.amount, 50);
  assert.equal(words.category, 'transport');
  assert.equal(words.note, 'রিকশা ভাড়া');

  const income = parseVoiceCommand('বেতন পেয়েছি ৫০০০ টাকা', { today: '2026-10-22' });
  assert.equal(income.type, 'income');
  assert.equal(income.category, 'salary');
  assert.equal(income.amount, 5000);
  assert.equal(income.note, 'বেতন');

  const transfer = parseVoiceCommand('বিকাশ থেকে ব্যাংকে ট্রান্সফার ১০০০ টাকা', {
    today: '2026-10-22',
  });
  assert.equal(transfer.type, 'transfer');
  assert.equal(transfer.account, 'bkash');
  assert.equal(transfer.toAccount, 'bank');

  const lakh = parseVoiceCommand('জমির জন্য ১.৫ লাখ টাকা দিয়েছি', { today: '2026-10-22' });
  assert.equal(lakh.type, 'expense');
  assert.equal(lakh.amount, 150000);
});

test('sent money to a family member is an expense, not a transfer', () => {
  const result = parseVoiceCommand('sent 300 taka to mom', { members, today: '2026-10-22' });
  assert.equal(result.type, 'expense');
  assert.equal(result.category, 'family');
  assert.equal(result.memberId, 'm_mom');
  assert.equal(result.note, 'Mom');
});

test('missing amount is reported without throwing', () => {
  const result = parseVoiceCommand('bus and rickshaw', { today: '2026-10-22' });
  assert.equal(result.ok, false);
  assert.equal(result.amount, 0);
  assert.ok(result.warnings.includes('missing-amount'));
});

test('normalization converts Bengali digits and keeps money separators', () => {
  assert.equal(normalizeVoiceText(' ৳১,২৫০.৫০ '), '1,250.50');
});

test('Android bridge is preferred and delivers native speech results', () => {
  const previousWindow = globalThis.window;
  let startedLang = '';
  let stopped = false;
  let aborted = false;

  globalThis.window = {
    HishabAndroid: {
      startVoice(lang) {
        startedLang = lang;
      },
      stopVoice() {
        stopped = true;
      },
      abortVoice() {
        aborted = true;
      },
    },
  };

  try {
    assert.equal(speechSupported(), true);
    const recognizer = createSpeechRecognizer('bn-BD');
    assert.ok(recognizer);

    let started = false;
    let finalText = '';
    let interimText = '';
    let ended = false;
    recognizer.onstart = () => {
      started = true;
    };
    recognizer.onresult = (event) => {
      const text = event.results[0][0].transcript;
      if (event.results[0].isFinal) finalText = text;
      else interimText = text;
    };
    recognizer.onend = () => {
      ended = true;
    };

    recognizer.start();
    assert.equal(startedLang, 'bn-BD');

    globalThis.window.HishabVoiceEvent('start', '', '');
    globalThis.window.HishabVoiceEvent('partial', 'transport 50', '');
    globalThis.window.HishabVoiceEvent(
      'result',
      'transport 50 taka by cash for bus fare',
      '',
    );

    assert.equal(started, true);
    assert.equal(interimText, 'transport 50');
    assert.equal(finalText, 'transport 50 taka by cash for bus fare');
    assert.equal(ended, true);

    const parsed = parseVoiceCommand(finalText, { today: '2026-10-24' });
    assert.equal(parsed.category, 'transport');
    assert.equal(parsed.amount, 50);
    assert.equal(parsed.account, 'cash');
    assert.equal(parsed.note, 'Bus fare');

    const second = createSpeechRecognizer('en-US');
    second.start();
    second.stop();
    second.abort();
    assert.equal(stopped, true);
    assert.equal(aborted, true);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
