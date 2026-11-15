'use client';
import { getApps, initializeApp } from 'firebase/app';
import { getAuth, inMemoryPersistence, setPersistence } from 'firebase/auth';

export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
export const missingFirebaseConfig = Object.entries(firebaseConfig).filter(([, value]) => !value?.trim()).map(([key]) => key);
export const firebaseConfigured = missingFirebaseConfig.length === 0;
export function firebaseApp() {
  if (!firebaseConfigured) throw new Error('Firebase is not configured for this website. Contact support.');
  return getApps().find(a => a.name === 'tradedesk') ?? initializeApp(firebaseConfig, 'tradedesk');
}
let authReady: ReturnType<typeof setPersistence> | undefined;
export async function phoneAuth() {
  const auth = getAuth(firebaseApp());
  await (authReady ??= setPersistence(auth, inMemoryPersistence));
  return auth;
}
