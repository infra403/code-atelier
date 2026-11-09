const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readableScale, fitScale } = require('../extensions/paper-writing/diagram-reader');

test('wide diagrams open with readable text instead of being shrunk to the column', () => {
  assert.equal(readableScale(16), 1.25);
  assert.equal(readableScale(20), 1);
  assert.equal(readableScale(NaN), 1.25);
  assert.equal(readableScale(4), 2);
  const fit = fitScale(3000, 330, 800, 700);
  assert.ok(fit < .26);
  assert.ok(readableScale(16) > fit * 4);
});
test('fit shows both wide and tall diagrams within padded viewport', () => {
  for (const [width, height] of [[3000,330], [300,4000], [1200,900]]) {
    const scale = fitScale(width, height, 800, 700);
    assert.ok(width * scale <= 752);
    assert.ok(height * scale <= 652);
  }
  assert.equal(fitScale(200,100,800,700), 1.25);
  assert.ok(fitScale(3000,300,10,10) > 0);
});
