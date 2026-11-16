const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const crypto = require('node:crypto');

function load(file, context = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, ...context });
  return module.exports;
}
test('the web device ID is stable across account switches, reloads and module instances', () => {
  const values = new Map();
  const context = { window: {}, crypto, localStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) } };
  const file = path.join(__dirname, '../lib/login-device.ts');
  const first = load(file, context).loginDeviceId();
  const again = load(file, context).loginDeviceId();
  assert.match(first, /^[a-f0-9-]{36}$/); assert.equal(first, again);
  values.set('account', 'broker2');
  assert.equal(load(file, context).loginDeviceId(), first);
});
test('mobile device ID survives account switches and app restarts without duplicate creation', async () => {
  const values = new Map();
  const context = { require: name => {
    if (name === 'expo-crypto') return crypto;
    if (name === 'react-native') return { Platform: { OS: 'android' } };
    if (name === 'expo-secure-store') return { getItemAsync: async key => values.get(key), setItemAsync: async (key, value) => values.set(key, value) };
    throw new Error(name);
  } };
  const file = path.join(__dirname, '../../mobile/src/login-device.ts');
  const firstModule = load(file, context);
  const [first, simultaneous] = await Promise.all([firstModule.loginDeviceId(), firstModule.loginDeviceId()]);
  assert.equal(first, simultaneous); assert.match(first, /^[a-f0-9-]{36}$/);
  values.set('account', 'broker2');
  assert.equal(await load(file, context).loginDeviceId(), first);
});
