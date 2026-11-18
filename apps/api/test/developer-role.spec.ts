import 'reflect-metadata';
import { ROLES } from '../src/common/context';
import { isPlatformAdmin } from '../src/common/roles';
import { policyFor } from '../src/auth/session-policy';
import { CONFIG_REGISTRY } from '../src/config-mgmt/registry';
import { DhanIntegrationResolver } from '../src/market/dhan-integration.resolver';
import { DhanCredentialsService } from '../src/market/dhan-credentials.service';

it('recognizes Developer and Super Admin as platform administrators, retaining distinct roles', () => {
  expect(isPlatformAdmin('DEVELOPER')).toBe(true);
  expect(isPlatformAdmin('SUPER_ADMIN')).toBe(true);
  expect(isPlatformAdmin('BROKER')).toBe(false);
  expect(isPlatformAdmin('TRADER')).toBe(false);
});
it('restricts the Dhan connection mutation to Developer only', () => {
  expect(Reflect.getMetadata(ROLES, DhanIntegrationResolver.prototype.beginDhanConnection)).toEqual(['DEVELOPER']);
});
it('rejects Super Admin connections at the service boundary even with verified MFA', async () => {
  const service = new DhanCredentialsService({} as any);
  await expect(service.begin({ userId: 'admin', role: 'SUPER_ADMIN', sessionId: 'session', mfaVerified: true })).rejects.toThrow();
});
it('keeps existing session configuration valid and applies its administrator policy to Developers', () => {
  const policy = { ...CONFIG_REGISTRY['security.sessionPolicy'].default };
  const { DEVELOPER, ...legacy } = policy;
  expect(CONFIG_REGISTRY['security.sessionPolicy'].schema.safeParse(legacy).success).toBe(true);
  expect(policyFor(legacy, 'DEVELOPER')).toEqual(legacy.SUPER_ADMIN);
  expect(policyFor({ ...legacy, DEVELOPER }, 'DEVELOPER')).toEqual(DEVELOPER);
});
