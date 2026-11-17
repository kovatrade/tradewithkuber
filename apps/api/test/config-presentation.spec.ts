import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { CONFIG_REGISTRY } from '../src/config-mgmt/registry';
import { SETTING_TEXT, settingDisplay, settingEditor, type SettingField } from '../src/config-mgmt/presentation';

for (const app of ['web/lib', 'mobile/src']) {
  const source = readFileSync(resolve(__dirname, `../../${app}/configuration.ts`), 'utf8');
  const exports: any = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports });
  const encode = exports.settingValue as (f: SettingField) => unknown;
  describe(`${app} configuration controls`, () => {
    it.each(Object.entries(CONFIG_REGISTRY))('preserves the stored value and units for %s', (key, def) => {
      const field = settingEditor(key, def.default);
      expect(encode(field)).toEqual(def.default);
      expect(def.schema.safeParse(encode(field)).success).toBe(true);
      const inspect = (f: SettingField) => {
        expect(f.label).not.toMatch(/\.|Bps|Minor|PerMiniLot|PerMegaLot/);
        f.fields?.forEach(x => inspect(x.field)); f.items?.forEach(inspect);
      };
      inspect(field);
    });
    it('converts rupees and percentages without changing the storage contract', () => {
      const money = settingEditor('demo.initialBalanceMinor', '50000000');
      expect(money.value).toBe('500000.00');
      expect(encode({ ...money, value: '50000.50' })).toBe('5000050');
      const pct = settingEditor('trading.intradayMarginBps', 20);
      expect(pct.value).toBe('0.20');
      expect(encode({ ...pct, value: '0.25' })).toBe(25);
      expect(() => encode({ ...pct, value: '0.251' })).toThrow(/two decimal/);
    });
    it('distinguishes percentage fallback from an explicit zero fixed margin', () => {
      const fixed = settingEditor('trading.carryForwardMarginPerMiniLot', null);
      expect(encode(fixed)).toBe(null);
      expect(encode({ ...fixed, value: '0' })).toBe(0);
    });
  });
}

it('provides plain language for names, values and nested device rules', () => {
  expect(Object.keys(SETTING_TEXT)).toEqual(Object.keys(CONFIG_REGISTRY));
  expect(settingDisplay('demo.enabled', true)).toBe('Enabled');
  expect(settingDisplay('demo.initialBalanceMinor', '50000000')).toBe('\u20b95,00,000.00');
  expect(settingDisplay('trading.intradayMarginBps', 20)).toBe('0.2%');
  expect(settingDisplay('trading.carryForwardMarginPerMiniLot', null)).toBe('Use percentage margin');
  expect(settingDisplay('security.sessionPolicy', CONFIG_REGISTRY['security.sessionPolicy'].default)).toContain('Ask before signing out another device');
});
