import { useEffect, useRef, useState } from 'react';
import { gql } from './api';

export function usePhoneOtp() {
  const [provider, setProvider] = useState<string | null>(null);
  const confirmation = useRef<Awaited<ReturnType<typeof import('@react-native-firebase/auth').signInWithPhoneNumber>> | null>(null);
  const expectedPhone = useRef('');
  const proof = useRef<string | null>(null);
  useEffect(() => { void gql('{ phoneOtpProvider }').then(d => setProvider(d.phoneOtpProvider)).catch(() => undefined); }, []);
  const send = async (phone: string, selectedProvider: string) => {
    setProvider(selectedProvider);
    confirmation.current = null; proof.current = null;
    if (selectedProvider !== 'firebase') return;
    const { getAuth, signInWithPhoneNumber, signOut } = await import('@react-native-firebase/auth');
    const auth = getAuth();
    await signOut(auth);
    const digits = phone.replace(/\D/g, '');
    if (!/^(?:91)?[6-9]\d{9}$/.test(digits)) throw new Error('Enter your registered 10-digit mobile number.');
    expectedPhone.current = `+${digits.length === 10 ? '91' : ''}${digits}`;
    confirmation.current = await signInWithPhoneNumber(auth, expectedPhone.current);
  };
  const verify = async (code: string) => {
    if (provider !== 'firebase') return code;
    if (proof.current) return proof.current;
    if (!confirmation.current) throw new Error('Request a new SMS code.');
    const { getAuth, signOut } = await import('@react-native-firebase/auth');
    const current = getAuth().currentUser;
    const user = current?.phoneNumber === expectedPhone.current ? current : (await confirmation.current.confirm(code))?.user;
    if (!user) throw new Error('Could not verify your mobile number. Request a new code.');
    proof.current = `firebase:${await user.getIdToken(true)}`;
    await signOut(getAuth()).catch(() => undefined);
    return proof.current;
  };
  return { provider, send, verify };
}
