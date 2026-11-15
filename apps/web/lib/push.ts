'use client';
import { useEffect } from 'react';
import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import { gql } from './api';
import { firebaseApp, firebaseConfigured } from './firebase';

const INSTALLATION = 'td.push.installation';
function installationId() {
  let id = localStorage.getItem(INSTALLATION);
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(INSTALLATION, id); }
  return id;
}
async function registration() {
  if (!firebaseConfigured || !process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY) throw new Error('Browser notifications are not configured yet.');
  if (!(await isSupported())) throw new Error('This browser does not support push notifications.');
  const worker = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  // Wait for this worker, rather than another service worker registered on the origin.
  if (!worker.active) await new Promise<void>((resolve, reject) => {
    const installing = worker.installing ?? worker.waiting;
    if (!installing) { reject(new Error('Notification worker could not start.')); return; }
    const timeout = setTimeout(() => reject(new Error('Notification worker took too long to start.')), 15000);
    installing.addEventListener('statechange', () => {
      if (installing.state === 'activated') { clearTimeout(timeout); resolve(); }
      if (installing.state === 'redundant') { clearTimeout(timeout); reject(new Error('Notification worker could not start.')); }
    });
  });
  return worker;
}
export async function registerBrowserPush(ask = false) {
  if (!('Notification' in window)) throw new Error('Notifications are not supported by this browser.');
  if (ask && Notification.permission === 'default') await Notification.requestPermission();
  if (Notification.permission !== 'granted') { if (ask) throw new Error('Allow notifications in your browser site settings.'); return; }
  const worker = await registration();
  const token = await getToken(getMessaging(firebaseApp()), { vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY, serviceWorkerRegistration: worker });
  const result = await gql('mutation($token:String!,$platform:String!,$installationId:String!){ registerPushToken(token:$token, platform:$platform, installationId:$installationId) }', { token, platform: 'web', installationId: installationId() });
  if (!result.registerPushToken) throw new Error('Push delivery has not been enabled on the server yet.');
}
export async function unregisterBrowserPush() {
  const id = localStorage.getItem(INSTALLATION);
  if (id) await gql('mutation($installationId:String!){ unregisterPushToken(installationId:$installationId) }', { installationId: id }).catch(() => undefined);
  const worker = await navigator.serviceWorker?.getRegistration('/firebase-messaging-sw.js');
  for (const notification of await worker?.getNotifications() ?? []) notification.close();
}
export function useBrowserPush(userId?: string) {
  useEffect(() => {
    if (!userId || !firebaseConfigured || !('Notification' in window)) return;
    let stop: (() => void) | undefined, disposed = false;
    const refresh = () => { void registerBrowserPush().catch(() => undefined); };
    refresh();
    window.addEventListener('focus', refresh);
    const timer = setInterval(refresh, 3600000);
    void isSupported().then(supported => {
      if (!supported || disposed) return;
      stop = onMessage(getMessaging(firebaseApp()), async message => {
        if (message.data?.userId !== userId || !message.notification || Notification.permission !== 'granted') return;
        const worker = await registration();
        await worker.showNotification(message.notification.title ?? 'The K', { body: message.notification.body, tag: message.data.notificationId, data: { ...message.data, FCM_MSG: { fcmOptions: { link: new URL(message.data.href ?? '/notifications', location.origin).href } } } });
        window.dispatchEvent(new Event('td:notification'));
      });
    }).catch(() => undefined);
    return () => { disposed = true; stop?.(); clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [userId]);
}
