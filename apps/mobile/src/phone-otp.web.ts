import { useEffect, useState } from 'react';
import { gql } from './api';

/** Native phone auth requires a compiled app. The Next.js portal supports browser OTP. */
export function usePhoneOtp() {
  const [provider, setProvider] = useState<string | null>(null);
  useEffect(() => { void gql('{ phoneOtpProvider }').then(d => setProvider(d.phoneOtpProvider)).catch(() => undefined); }, []);
  return {
    provider,
    send: async (_phone: string, value: string) => { setProvider(value); if (value === 'firebase') throw new Error('Use the installed app or the website to receive a verification code.'); },
    verify: async (code: string) => code,
  };
}
