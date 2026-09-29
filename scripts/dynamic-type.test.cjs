const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'docs', 'index.html'), 'utf8');

test('iOS text follows Dynamic Type while browser defaults keep their current size', () => {
  assert.match(html, /html \{ font-size: 17px; \}/);
  assert.match(html, /@supports \(font: -apple-system-body\)[\s\S]*@media \(hover: none\)[\s\S]*html \{ font: -apple-system-body; \}/);

  const fixedPixelSizes = [...html.matchAll(/font-size:\s*([\d.]+)px/g)].map(match => Number(match[1]));
  assert.deepEqual(fixedPixelSizes, [17]);
  assert.match(html, /\.today-text \{[\s\S]*?font-size: \.764706rem;/);
  assert.match(html, /\.nav-tab \{[\s\S]*?font-size: \.588235rem;/);
});

test('large text layouts can wrap or scroll instead of clipping controls', () => {
  assert.match(html, /\.settings-row \{[\s\S]*?flex-wrap: wrap;/);
  assert.match(html, /\.backup-row \{[\s\S]*?flex-wrap: wrap;/);
  assert.match(html, /\.heat-grid \{[^}]*minmax\(2\.3rem, 1fr\)[^}]*overflow-x: auto;/);
});
