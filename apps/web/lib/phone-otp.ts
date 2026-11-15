'use client';
import { useEffect, useRef, useState } from 'react';
import { RecaptchaVerifier, signInWithPhoneNumber, signOut, type ConfirmationResult } from 'firebase/auth';
import { gql } from './api';
import { phoneAuth } from './firebase';

export function usePhoneOtp() {
  const [provider, setProvider] = useState<string | null>(null);
  const confirmation = useRef<ConfirmationResult | null>(null);
  const verifier = useRef<RecaptchaVerifier | null>(null);
  const container = useRef<HTMLDivElement | null>(null);
  const proof = useRef<string | null>(null);
  const clearCaptcha = () => { verifier.current?.clear(); verifier.current = null; container.current?.remove(); container.current = null; };
  useEffect(() => {
    void gql('{ phoneOtpProvider }').then(d => setProvider(d.phoneOtpProvider)).catch(() => undefined);
    return clearCaptcha;
  }, []);
  const send = async (phone: string, selectedProvider: string) => {
    setProvider(selectedProvider); confirmation.current = null; proof.current = null;
    if (selectedProvider !== 'firebase') return;
    const digits = phone.replace(/\D/g, '');
    if (!/^(?:91)?[6-9]\d{9}$/.test(digits)) throw new Error('Enter your registered 10-digit mobile number.');
    const auth = await phoneAuth();
    await signOut(auth);
    clearCaptcha();
    const element = document.createElement('div'); document.body.appendChild(element); container.current = element;
    const captcha = new RecaptchaVerifier(auth, element, { size: 'invisible' }); verifier.current = captcha;
    try { confirmation.current = await signInWithPhoneNumber(auth, `+${digits.length === 10 ? '91' : ''}${digits}`, captcha); }
    finally { clearCaptcha(); }
  };
  const verify = async (code: string) => {
    if (provider !== 'firebase') return code;
    if (proof.current) return proof.current;
    if (!confirmation.current) throw new Error('Request a new SMS code.');
    const result = await confirmation.current.confirm(code);
    proof.current = `firebase:${await result.user.getIdToken(true)}`;
    await signOut(await phoneAuth()).catch(() => undefined);
    return proof.current;
  };
  return { provider, send, verify };
}
