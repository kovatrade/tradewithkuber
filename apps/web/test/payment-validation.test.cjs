const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

function load(file, imports = {}) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(source, { module, exports: module.exports, require: name => imports[name] || {} });
  return module.exports;
}

for (const [app, reference, details, referenceImport] of [
  ['web', '../lib/payment-reference.ts', '../components/payment-details.tsx', '@/lib/payment-reference'],
  ['mobile', '../../mobile/src/payment-reference.ts', '../../mobile/src/payment-details.tsx', './payment-reference'],
]) {
  const validator = load(path.join(__dirname, reference));
  const { paymentError } = load(path.join(__dirname, details), { [referenceImport]: validator });
  test(`${app} accepts supported UPI and bank references and rejects malformed values`, () => {
    for (const utr of ['123456789012', 'HDFC123456789012', 'hdfcr52026111612345678']) assert.equal(validator.validPaymentReference(utr), true, utr);
    for (const utr of ['000000000000', '1234567890123456', '213434242354354353234234', 'ABC-12345678']) assert.equal(validator.validPaymentReference(utr), false, utr);
  });
  test(`${app} blocks opening balances and deposits without a screenshot`, () => {
    const draft = { payeeAccountId: 'payee', payerName: 'Trader', utr: '123456789012', paidOn: '2020-01-01' };
    assert.match(paymentError(draft), /screenshot/);
    assert.equal(paymentError({ ...draft, proof: 'image-data' }), '');
    assert.match(paymentError({ ...draft, proof: 'image-data', utr: '123' }), /UPI|UTR/);
  });
}
