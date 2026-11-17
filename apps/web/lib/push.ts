'use client';
import { useEffect } from 'react';
import { getMessaging, getToken, deleteToken, isSupported, onMessage } from 'firebase/messaging';
import { gql } from './api';
import { firebaseApp, firebaseConfigured } from './firebase';

const INSTALLATION = 'td.push.installation';
export const BROWSER_PUSH_ERROR_EVENT = 'td:push-registration-error';
let registering: Promise<void> | null = null;
let tokenCleanup: Promise<void> = Promise.resolve();

export function browserPushSetupMessage() {
  if (!firebaseConfigured || !process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY?.trim()) return 'Browser notifications are not configured for this website yet. Contact support.';
  return null;
}
function installationId() {
  let id = localStorage.getItem(INSTALLATION);
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(INSTALLATION, id); }
  return id;
}
async function registration() {
  const setupError = browserPushSetupMessage();
  if (setupError) throw new Error(setupError);
  if (!(await isSupported())) throw new Error('This browser does not support push notifications.');
  const worker = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  // Wait for this worker, rather than another service worker registered on the origin.
  if (!worker.active) await new Promise<void>((resolve, reject) => {
    const installing = worker.installing ?? worker.waiting;
    if (!installing) { reject(new Error('Notification worker could not start.')); return; }
    const cleanup = () => { clearTimeout(timeout); installing.removeEventListener('statechange', changed); };
    const changed = () => {
      if (installing.state === 'activated') { cleanup(); resolve(); }
      if (installing.state === 'redundant') { cleanup(); reject(new Error('Notification worker could not start.')); }
    };
    const timeout = setTimeout(() => { cleanup(); reject(new Error('Notification worker took too long to start.')); }, 15000);
    installing.addEventListener('statechange', changed);
    changed();
  });
  return worker;
}
export async function registerBrowserPush(ask = false) {
  await tokenCleanup;
  if (!('Notification' in window)) throw new Error('Notifications are not supported by this browser.');
  const setupError = browserPushSetupMessage();
  if (setupError) throw new Error(setupError);
  if (ask && Notification.permission === 'default') await Notification.requestPermission();
  if (Notification.permission !== 'granted') { if (ask) throw new Error('Allow notifications in your browser site settings.'); return; }
  if (!registering) registering = (async () => {
    const worker = await registration();
    const token = await getToken(getMessaging(firebaseApp()), { vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY, serviceWorkerRegistration: worker });
    if (!token) throw new Error('The browser could not register for notifications. Reload the page and try again.');
    const result = await gql('mutation($token:String!,$platform:String!,$installationId:String!){ registerPushToken(token:$token, platform:$platform, installationId:$installationId) }', { token, platform: 'web', installationId: installationId() });
    if (!result.registerPushToken) throw new Error('Push delivery has not been enabled on the server yet.');
  })().finally(() => { registering = null; });
  await registering;
}
export async function sendBrowserTestNotification() {
  // Permission alone is insufficient: bind this token to the current API session first.
  await registerBrowserPush(true);
  await gql('mutation { sendTestNotification }');
}
export async function unregisterBrowserPush() {
  const id = localStorage.getItem(INSTALLATION);
  if (id) await gql('mutation($installationId:String!){ unregisterPushToken(installationId:$installationId) }', { installationId: id }).catch(() => undefined);
  const worker = await navigator.serviceWorker?.getRegistration('/firebase-messaging-sw.js');
  for (const notification of await worker?.getNotifications() ?? []) notification.close();
}
export const canUseSystemPush = (role?: string, isDemo?: boolean) => isDemo !== true && (role === 'SUPER_ADMIN' || role === 'BROKER');
export function useBrowserPush(userId?: string, role?: string, isDemo?: boolean) {
  useEffect(() => {
    if (userId && !canUseSystemPush(role, isDemo)) {
      const pendingRegistration = registering;
      tokenCleanup = tokenCleanup.then(async () => {
        await pendingRegistration?.catch(() => undefined);
        await unregisterBrowserPush();
        if (firebaseConfigured && await isSupported()) await deleteToken(getMessaging(firebaseApp()));
      }).catch(() => undefined);
      return;
    }
    if (!userId || !('Notification' in window)) return;
    let stop: (() => void) | undefined, disposed = false;
    const refresh = () => { void registerBrowserPush().catch(error => {
      if (!disposed) window.dispatchEvent(new CustomEvent(BROWSER_PUSH_ERROR_EVENT, { detail: (error as Error).message }));
    }); };
    refresh();
    window.addEventListener('focus', refresh);
    const timer = setInterval(refresh, 3600000);
    void isSupported().then(supported => {
      if (!supported || disposed || !firebaseConfigured) return;
      stop = onMessage(getMessaging(firebaseApp()), async message => {
        if (disposed || message.data?.userId !== userId || !message.notification || Notification.permission !== 'granted') return;
        const worker = await registration();
        await worker.showNotification(message.notification.title ?? 'The K', { body: message.notification.body, tag: message.data.notificationId, data: { ...message.data, FCM_MSG: { fcmOptions: { link: new URL(message.data.href ?? '/notifications', location.origin).href } } } });
        window.dispatchEvent(new Event('td:notification'));
      });
    }).catch(() => undefined);
    return () => { disposed = true; stop?.(); clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [userId, role, isDemo]);
}
