import { useEffect, useState } from 'react';
import { AppState, Linking } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Button, Notice } from './ui';

export function PushPermission() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    const refresh = () => { void Notifications.getPermissionsAsync().then(p => setAllowed(p.granted)).catch(() => undefined); };
    refresh(); const listener = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    return () => listener.remove();
  }, []);
  if (allowed !== false || !(Constants.expoConfig?.extra?.firebaseAndroidEnabled || Constants.expoConfig?.extra?.firebaseIosEnabled)) return null;
  return <><Notice>Allow notifications to receive account and trading alerts when the app is closed.</Notice><Button title="Open notification settings" kind="ghost" onPress={() => { void Linking.openSettings(); }} /></>;
}
