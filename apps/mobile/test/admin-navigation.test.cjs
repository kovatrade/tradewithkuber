const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

test('every web admin destination has a working native destination', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/admin-navigation.ts'), 'utf8');
  const loaded = { exports: {} };
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(js, { module: loaded, exports: loaded.exports });
  const { ADMIN_NAV } = loaded.exports;
  const web = fs.readFileSync(path.join(__dirname, '../../web/components/Shell.tsx'), 'utf8');
  const destinations = [...web.matchAll(/href: '(\/admin[^']*)'/g)].map((m) => m[1]);
  assert.deepEqual(Array.from(ADMIN_NAV, (n) => n.web).sort(), destinations.sort());
  const tools = ts.createSourceFile(
    'admin-tools.tsx',
    fs.readFileSync(path.join(__dirname, '../src/admin-tools.tsx'), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let screens;
  const walk = (node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText() === 'ADMIN_SCREENS')
      screens = new Set(node.initializer.properties.map((p) => p.name.getText()));
    ts.forEachChild(node, walk);
  };
  walk(tools);
  for (const item of ADMIN_NAV) {
    if (item.href.startsWith('/admin-tools/'))
      assert.ok(screens.has(item.href.split('/').at(-1)), `Missing screen for ${item.label}`);
    else {
      const route = item.href === '/(admin)' ? '(admin)/index' : item.href.slice(1);
      assert.ok(fs.existsSync(path.join(__dirname, '../app', route + '.tsx')), `Missing route for ${item.label}`);
    }
  }
});
