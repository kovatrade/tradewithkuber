const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
for (const app of ['web', 'mobile']) {
  const file = path.join(__dirname, app === 'web' ? '../lib/quote-flash.ts' : '../../mobile/src/quote-flash.ts');
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module, exports: module.exports });
  const { quoteMove } = module.exports;
  test(`${app}: only new highs and lows use dark directional pulses`, () => {
    const p = { value: '100', high: '110', low: '90' };
    assert.equal(quoteMove({}, p), null);
    assert.equal(quoteMove(p, p), null);
    assert.equal(JSON.stringify(quoteMove(p, { ...p, value: '101' })), JSON.stringify({ up: true, extreme: false }));
    assert.equal(JSON.stringify(quoteMove(p, { ...p, high: '111' })), JSON.stringify({ up: true, extreme: true }));
    assert.equal(JSON.stringify(quoteMove(p, { ...p, low: '89' })), JSON.stringify({ up: false, extreme: true }));
    assert.equal(quoteMove(p, { ...p, high: '109', low: '91' }), null);
  });
}
