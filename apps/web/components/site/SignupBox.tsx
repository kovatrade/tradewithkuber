'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { gql } from '@/lib/api';

/** Start sign-up with a mobile number; the code is sent on the portal's sign-up screen. */
export function SignupBox({ more }: { more?: ReactNode } = {}) {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [smsComingSoon, setSmsComingSoon] = useState(false);
  useEffect(() => {
    void gql<{ phoneOtpProvider: string }>('{ phoneOtpProvider }')
      .then(data => setSmsComingSoon(data.phoneOtpProvider === 'dev')).catch(() => undefined);
  }, []);
  return (
    <form className="ws-signup" onSubmit={(e) => {
      e.preventDefault();
      const d = phone.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
      if (!/^[6-9]\d{9}$/.test(d)) { setErr('Enter a valid 10-digit mobile number.'); return; }
      router.push(`/login?mode=signup&phone=${d}`);
    }}>
      <h2>Sign up now</h2>
      <p className="ws-signup-sub">Or <Link href="/login">log in</Link> if you already have an account</p>
      <label htmlFor="su-phone" className="ws-sr">Mobile number</label>
      <div className="ws-phone">
        <span>+91</span>
        <input id="su-phone" inputMode="numeric" autoComplete="tel-national" maxLength={14} placeholder="Enter your mobile number" value={phone} onChange={(e) => { setPhone(e.target.value); setErr(null); }} aria-invalid={!!err} aria-describedby={err ? 'su-err' : undefined} />
      </div>
      {err && <p id="su-err" className="ws-err" role="alert">{err}</p>}
      {smsComingSoon && <p className="ws-signup-more" role="status">SMS OTP verification will be available soon. Existing users can <Link href="/login">sign in with their username and password</Link>.</p>}
      <button className="ws-btn ws-btn-main">Continue</button>
      <p className="ws-fine">By continuing you agree to the <Link href="/terms">terms of use</Link> and <Link href="/privacy">privacy policy</Link>.</p>
      {more && <p className="ws-signup-more">{more}</p>}
    </form>
  );
}
