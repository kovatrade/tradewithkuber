import { isPlatformAdmin } from '../../src/roles';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useAuth, homeFor } from '@/auth';
import { ADMIN_SCREENS } from '@/admin-tools';
import { Button, Notice, Screen } from '@/ui';
import { router } from 'expo-router';

export default function AdminTool() {
  const { me, ready } = useAuth();
  const { tool } = useLocalSearchParams<{ tool: string }>();
  if (!ready) return null;
  if (!me) return <Redirect href="/login" />;
  if (!isPlatformAdmin(me.role)) return <Redirect href={homeFor(me.role)} />;
  if (me.role === 'SUPER_ADMIN' && !me.mfaEnabled)
    return (
      <Screen back title="Administration">
        <Notice>Set up two-step verification to manage these settings.</Notice>
        <Button title="Open profile" onPress={() => router.push('/(admin)/settings')} />
      </Screen>
    );
  const Component = Object.prototype.hasOwnProperty.call(ADMIN_SCREENS, tool) ? ADMIN_SCREENS[tool] : undefined;
  return Component ? (
    <Component />
  ) : (
    <Screen back title="Administration">
      <Notice>This administration page is unavailable.</Notice>
    </Screen>
  );
}
