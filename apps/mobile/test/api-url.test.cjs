const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const loaded = { exports: {} };
const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/api-url.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
vm.runInNewContext(source, { module: loaded, exports: loaded.exports });
const { resolveApiUrl } = loaded.exports;

test('Android emulators reach the host API without adb reverse', () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]']) {
    assert.equal(resolveApiUrl(`http://${host}:4000`, true, 'android', false), 'http://10.0.2.2:4000');
  }
  assert.equal(resolveApiUrl('http://localhost:4100/api', true, 'android', false), 'http://10.0.2.2:4100/api');
});
test('production, physical devices, iOS and web keep their configured URL', () => {
  for (const [dev, platform, physical] of [[false, 'android', false], [true, 'android', true], [true, 'ios', false], [true, 'web', false]]) {
    assert.equal(resolveApiUrl('http://localhost:4000', dev, platform, physical), 'http://localhost:4000');
  }
});
test('deployed and LAN URLs are preserved, including domains beginning with localhost', () => {
  for (const url of ['https://tradewithkuber.com', 'http://192.168.1.10:4000', 'http://localhost.example.com:4000']) {
    assert.equal(resolveApiUrl(url, true, 'android', false), url);
  }
});
