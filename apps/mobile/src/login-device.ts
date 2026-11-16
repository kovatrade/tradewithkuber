import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

let pending: Promise<string> | undefined;
/** Installation identifier, separate from account/session data; retained across logout. */
export function loginDeviceId() {
  return pending ??= (async () => {
    const key = 'td.login.device';
    if (Platform.OS === 'web') {
      try {
        const saved = localStorage.getItem(key);
        if (saved) return saved;
        const id = Crypto.randomUUID(); localStorage.setItem(key, id); return id;
      } catch { return Crypto.randomUUID(); }
    }
    const saved = await SecureStore.getItemAsync(key);
    if (saved) return saved;
    const id = Crypto.randomUUID();
    await SecureStore.setItemAsync(key, id);
    return id;
  })().catch(error => { pending = undefined; throw error; });
}
