const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(path.join(__dirname, '../docs/index.html'), 'utf8');
function boot(t, day, plugin) {
  const errors = [];
  const vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(e.message));
  const dom = new JSDOM(html, {url:'https://marcy.test/',runScripts:'dangerously',virtualConsole:vc,beforeParse(w) {
    w.structuredClone = structuredClone;
    w.scrollTo = () => {};
    w.fetch = () => { throw new Error('Unexpected network call'); };
    const OriginalDate = w.Date;
    w.Date = class extends OriginalDate { constructor(...args) { super(...(args.length ? args : [`2026-09-${day}T12:00:00`])); } };
    w.localStorage.setItem('marcy_data', JSON.stringify({periods:['2026-09-01'],tensions:[],settings:{default_cycle_length:28,manual_cycle_length:null},onboarded:true}));
    if (plugin) w.Capacitor = {Plugins:{LocalNotifications:plugin}};
  }});
  t.after(() => dom.window.close());
  assert.deepEqual(errors, []);
  return dom.window;
}

test('fertility banner and timeline clearly label estimates', t => {
  const w = boot(t, '12');
  assert.equal(w.document.querySelector('.phase-label').textContent, 'ESTIMATED FERTILE WINDOW');
  assert.equal(w.document.querySelector('.phase-banner .phase-sub'), null);
  assert.equal(w.document.querySelector('.timeline-title').textContent, 'Upcoming estimates');
  assert.equal(w.document.querySelector('.timeline p').textContent, 'Timing is estimated. Do not use for contraception.');
  const labels = [...w.document.querySelectorAll('.tl-event')].map(el => el.textContent);
  assert.ok(labels.includes('Fertile window'));
  assert.ok(labels.includes('Ovulation'));
  w.toggleToday();
  assert.ok(w.document.querySelector('#content').textContent.includes('estimated ovulation phase'));
});

test('fertility-related daily advice no longer declares peak fertility', t => {
  for (const day of ['11','12','13','14','15','16']) {
    const w = boot(t, day); w.toggleToday();
    assert.doesNotMatch(w.document.querySelector('#content').textContent, /peak fertility|primed for conception|high conception risk/i);
  }
});

test('startup replaces old alerts without scheduling a fertile-window-ended notification', async t => {
  let scheduled = [];
  const cancelled = [];
  let resolveScheduled;
  const completed = new Promise(resolve => { resolveScheduled = resolve; });
  boot(t, '01', {
    requestPermissions: async () => ({display:'granted'}),
    getPending: async () => ({notifications:[{id:99,title:'Fertile window ended'}]}),
    cancel: async pending => { cancelled.push(...pending.notifications); },
    schedule: async request => { scheduled = request.notifications; resolveScheduled(); },
  });
  await completed;
  assert.equal(cancelled[0].id, 99);
  const fertility = scheduled.find(n => n.title === 'Estimated fertile window');
  assert.ok(fertility);
  assert.equal(fertility.body, 'Calendar estimate only; do not use for contraception.');
  assert.ok(scheduled.some(n => n.title === 'Estimated PMS window'));
  assert.ok(scheduled.every(n => !/window ended|ovulation is behind|high conception risk/i.test(n.title + n.body)));
});


test('PMS banner identifies its estimate outside the timeline', t => {
  const w = boot(t, '23');
  assert.equal(w.document.querySelector('.phase-label').textContent, 'ESTIMATED PMS WINDOW');
  assert.equal(w.document.querySelectorAll('.timeline p').length, 1);
});
