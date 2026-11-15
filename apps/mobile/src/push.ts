import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { gql } from './api';
import type { Me } from './auth';

const enabled = Constants.expoConfig?.extra?.[Platform.OS === 'android' ? 'firebaseAndroidEnabled' : 'firebaseIosEnabled'] === true;
const INSTALLATION = 'td.push.installation';
let pending: Record<string, string> | null = null;
let activeUser: Me | null = null;
const seen = new Set<string>();

Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }) });

async function installationId() {
  const existing = await SecureStore.getItemAsync(INSTALLATION);
  if (existing) return existing;
  const id = Crypto.randomUUID(); await SecureStore.setItemAsync(INSTALLATION, id); return id;
}

function open(data: Record<string, string>) {
  pending = data;
  if (!activeUser || data.userId !== activeUser.id) return;
  pending = null;
  const href = data.href ?? '/notifications';
  const role = activeUser.role === 'SUPER_ADMIN' ? 'admin' : activeUser.role === 'BROKER' ? 'broker' : 'trader';
  if (!['/account', '/notifications'].includes(href) && !href.startsWith(`/${role}/`)) return;
  // The phone has its own route names. /notifications is a safe fallback for any new server destination.
  const routes: Record<string, string> = {
    '/notifications': '/notifications', '/account': '/(trader)/settings',
    '/trader/orders': '/(trader)/orders', '/trader/positions': '/(trader)/positions',
    '/trader/funds': '/funds', '/trader/watchlist': '/(trader)/watchlist',
    '/admin/users': '/(admin)/users', '/admin/payments': '/(admin)/payments', '/admin/fees': '/admin-fees',
    '/admin/reset': '/admin-reset', '/admin/logins': '/logins', '/admin/activity': '/activity',
    '/broker/traders': '/(broker)/traders', '/broker/requests': '/(broker)/requests', '/broker/commissions': '/commissions',
  };
  const target = href === '/account' ? (role === 'trader' ? '/(trader)/settings' : role === 'broker' ? '/(broker)/settings' : '/(admin)/settings') : routes[href] ?? '/notifications';
  router.push(target as never);
}

export async function unregisterPush() {
  if (!enabled) return;
  const id = await SecureStore.getItemAsync(INSTALLATION);
  if (id) await gql('mutation($installationId:String!){ unregisterPushToken(installationId:$installationId) }', { installationId: id }).catch(() => undefined);
  await Notifications.dismissAllNotificationsAsync().catch(() => undefined);
  pending = null;
}

export function usePushNotifications(me: Me | null, locked: boolean) {
  useEffect(() => {
    activeUser = locked ? null : me;
    if (activeUser && pending) open(pending);
    return () => { activeUser = null; };
  }, [me, locked]);

  useEffect(() => {
    if (!enabled || !me) return;
    let stopped = false;
    const cleanup: (() => void)[] = [];
    const initialize = async () => {
      const { getMessaging, getToken, onMessage, onTokenRefresh, onNotificationOpenedApp, getInitialNotification, registerDeviceForRemoteMessages } = await import('@react-native-firebase/messaging');
      if (stopped) return;
      const messaging = getMessaging();
      const register = async (token?: string) => {
        const permissions = await Notifications.getPermissionsAsync();
        if (!permissions.granted) { await unregisterPush(); return; }
        if (stopped) return;
        if (Platform.OS === 'ios' && !messaging.isDeviceRegisteredForRemoteMessages) await registerDeviceForRemoteMessages(messaging);
        const value = token ?? await getToken(messaging);
        if (stopped) return;
        await gql('mutation($token:String!,$platform:String!,$installationId:String!){ registerPushToken(token:$token, platform:$platform, installationId:$installationId) }', { token: value, platform: Platform.OS, installationId: await installationId() });
      };
      const setup = async () => {
        if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('activity', { name: 'Account and trading updates', importance: Notifications.AndroidImportance.HIGH, sound: 'default', vibrationPattern: [0, 250, 150, 250], lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE });
        await Notifications.requestPermissionsAsync();
        await register();
      };
      void setup().catch(() => { if (__DEV__) console.warn('Push registration failed; it will retry when the app becomes active.'); });
      const received = onMessage(messaging, async message => {
        if (!message.notification || message.data?.userId !== me.id) return;
        const id = String(message.data?.notificationId ?? message.messageId ?? '');
        if (id && seen.has(id)) return;
        if (id) { seen.add(id); if (seen.size > 200) seen.delete(seen.values().next().value!); }
        await Notifications.scheduleNotificationAsync({ identifier: id || undefined, content: { title: message.notification.title, body: message.notification.body, data: message.data, sound: 'default' }, trigger: Platform.OS === 'android' ? { channelId: 'activity' } : null }).catch(() => undefined);
      });
      const tokenChanged = onTokenRefresh(messaging, token => { void register(token).catch(() => undefined); });
      const opened = onNotificationOpenedApp(messaging, message => open(message.data as Record<string, string> ?? {}));
      void getInitialNotification(messaging).then(message => { if (message) open(message.data as Record<string, string> ?? {}); }).catch(() => undefined);
      const response = Notifications.addNotificationResponseReceivedListener(event => open(event.notification.request.content.data as Record<string, string>));
      void Notifications.getLastNotificationResponseAsync().then(event => { if (event) { open(event.notification.request.content.data as Record<string, string>); void Notifications.clearLastNotificationResponseAsync(); } }).catch(() => undefined);
      const state = AppState.addEventListener('change', state => { if (state === 'active') void register().catch(() => undefined); });
      cleanup.push(received, tokenChanged, opened, () => response.remove(), () => state.remove());
    };
    void initialize().catch(() => { if (__DEV__) console.warn('Push notifications are unavailable in this build.'); });
    return () => { stopped = true; cleanup.forEach(stop => stop()); };
  }, [me?.id]);
}
