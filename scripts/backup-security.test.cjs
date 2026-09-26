const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(path.join(__dirname, '../docs/index.html'), 'utf8');
const base = () => ({periods:['2026-08-01','2026-08-29'], tensions:['2026-08-28'], settings:{default_cycle_length:28,manual_cycle_length:null},onboarded:true,email_prompted:true,email:null,paused:false,partner_name:null,period_ends:{'2026-08-01':'2026-08-05'}});
function boot(t, data = base()) {
  const errors = [];
  const vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(e.message));
  const dom = new JSDOM(html, {url:'https://marcy.test/',runScripts:'dangerously',virtualConsole:vc,beforeParse(w) {
    w.structuredClone = structuredClone;
    w.scrollTo = () => {};
    w.fetch = () => { throw new Error('Network calls are forbidden in these tests'); };
    const OriginalDate = w.Date;
    w.Date = class extends OriginalDate { constructor(...args) { super(...(args.length ? args : ['2026-09-24T12:00:00'])); } };
    w.localStorage.setItem('marcy_data', JSON.stringify(data));
  }});
  t.after(() => dom.window.close());
  assert.deepEqual(errors, []);
  return dom.window;
}
function restore(w, data, confirm = true) {
  return new Promise(resolve => {
    const Reader = w.FileReader;
    w.FileReader = class extends Reader { constructor() { super(); this.addEventListener('loadend', () => {w.FileReader = Reader; if (confirm) w.document.querySelector('#confirm-yes')?.click(); resolve();}, {once:true}); } };
    w.importData(new w.File([JSON.stringify(data)], 'backup.json', {type:'application/json'}));
  });
}
const stored = w => JSON.parse(w.localStorage.getItem('marcy_data'));

test('imported name and email stay inert in settings, dashboard and confirmation', async t => {
  const w = boot(t);
  const payload = '"><img id="injected" src=x onerror="window.__xss=1">';
  await restore(w, {...base(),partner_name:payload,email:payload});
  w.switchView('manage');
  assert.equal(w.document.querySelector('#settings-name').value, payload);
  assert.equal(w.document.querySelector('#settings-email-value').textContent, payload);
  w.switchView('dashboard'); w.toggleToday(); w.confirmPeriodEnd(2);
  assert.ok(w.document.querySelector('#confirm-root').textContent.includes(payload));
  assert.equal(w.document.querySelector('#injected'), null);
  assert.equal(w.__xss, undefined);
});

test('ordinary entered names preserve punctuation and markup-looking text literally', t => {
  const w = boot(t); w.switchView('manage');
  const name = 'A&B <friend> "O\'Brien"';
  w.document.querySelector('#settings-name').value = name;
  w.document.querySelector('#settings-save-name').click();
  assert.equal(stored(w).partner_name, name);
  assert.equal(w.document.querySelector('#settings-name').value, name);
  w.confirmPeriodEnd(2);
  assert.ok(w.document.querySelector('#confirm-root').textContent.includes(name));
  assert.equal(w.document.querySelector('friend'), null);
});

test('invalid backups never replace existing records', async t => {
  const w = boot(t); const original = w.localStorage.getItem('marcy_data');
  const bad = [null,[],{periods:[null]},{periods:['2026-02-31']},{periods:['2099-01-01']},
    {...base(),periods:['2026-08-01','2026-08-01']}, {...base(),tensions:['\');window.__xss=1;//']},
    {...base(),settings:{default_cycle_length:'28'}}, {...base(),settings:{default_cycle_length:28,manual_cycle_length:999}},
    {...base(),partner_name:{}}, {...base(),partner_name:'x'.repeat(201)}, {...base(),email:'x'.repeat(321)},
    {...base(),paused:'false'}, {...base(),period_ends:{'2026-08-01':'2026-07-31'}}, {...base(),schema_version:99}];
  for (const data of bad) {
    await restore(w, data);
    assert.equal(w.localStorage.getItem('marcy_data'), original, JSON.stringify(data));
    assert.equal(w.document.querySelector('#toast').textContent, 'invalid backup file');
    assert.equal(w.document.querySelector('#confirm-yes'), null);
  }
});

test('legacy backups restore, unknown fields are dropped and valid fields round-trip', async t => {
  const w = boot(t);
  await restore(w, {periods:['2026-08-01'],extra:{unsafe:'ignored'}});
  assert.equal(stored(w).schema_version, 1);
  assert.equal(stored(w).settings.default_cycle_length, 28);
  assert.equal(stored(w).extra, undefined);
  const record = {...base(),schema_version:1,partner_name:'Renée & Jo',email:'person@example.test',paused:true};
  await restore(w, record);
  assert.deepEqual(stored(w), record);
});

test('oversize backup is rejected before reading', t => {
  const w = boot(t); const original = w.localStorage.getItem('marcy_data');
  w.importData({size:1024*1024+1});
  assert.equal(w.localStorage.getItem('marcy_data'), original);
  assert.equal(w.document.querySelector('#toast').textContent, 'backup file is too large');
});

test('history delete buttons use listeners and delete only selected entries', t => {
  const w = boot(t); w.switchView('manage'); w.togglePeriodHistory(); w.toggleTensionHistory();
  let button = w.document.querySelector('[data-delete-period="2026-08-01"]');
  assert.equal(button.getAttribute('onclick'), null);
  button.click(); w.document.querySelector('#confirm-yes').click();
  assert.deepEqual(stored(w).periods, ['2026-08-29']);
  button = w.document.querySelector('[data-delete-tension]');
  assert.equal(button.getAttribute('onclick'), null);
  button.click(); w.document.querySelector('#confirm-yes').click();
  assert.deepEqual(stored(w).tensions, []);
});

test('previously stored hostile name/email also render inertly', t => {
  const payload = '<svg id="injected" onload="window.__xss=1"></svg>';
  const w = boot(t, {...base(),partner_name:payload,email:payload});
  w.toggleToday(); w.switchView('manage');
  assert.equal(w.document.querySelector('#settings-email-value').textContent, payload);
  assert.equal(w.document.querySelector('#injected'), null);
  assert.equal(w.__xss, undefined);
});


test('valid imports wait for confirmation; cancel preserves history and confirmation replaces it', async t => {
  const w = boot(t);
  const original = w.localStorage.getItem('marcy_data');
  const replacement = {...base(), periods:['2026-09-01'], tensions:[], period_ends:{}};
  await restore(w, replacement, false);
  assert.ok(w.document.querySelector('.confirm-msg').textContent.includes('This will replace your current history.'));
  assert.equal(w.document.querySelector('#confirm-yes').textContent, 'replace history');
  assert.equal(w.localStorage.getItem('marcy_data'), original);
  w.document.querySelector('.confirm-cancel').click();
  assert.equal(w.localStorage.getItem('marcy_data'), original);
  assert.equal(w.document.querySelector('#confirm-yes'), null);
  await restore(w, replacement, false);
  assert.equal(w.localStorage.getItem('marcy_data'), original);
  w.document.querySelector('#confirm-yes').click();
  assert.deepEqual(stored(w).periods, ['2026-09-01']);
  assert.deepEqual(stored(w).tensions, []);
});

test('empty backups also require confirmation and dismissing the overlay preserves data', async t => {
  const w = boot(t);
  const original = w.localStorage.getItem('marcy_data');
  await restore(w, {periods:[]}, false);
  assert.ok(w.document.querySelector('#confirm-yes'));
  w.document.querySelector('.confirm-overlay').click();
  assert.equal(w.localStorage.getItem('marcy_data'), original);
  assert.equal(w.document.querySelector('#confirm-yes'), null);
});
