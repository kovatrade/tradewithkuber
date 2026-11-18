'use client';
import { isPlatformAdmin } from '../../../lib/roles';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useAuth } from '@/lib/auth';

/** Broker preview pages: only a signed-in Super Admin sees them. */
export function AdminGate({ children }: { children: ReactNode }) {
  const { me, loading } = useAuth();
  if (loading) return null;
  if (!isPlatformAdmin(me?.role)) {
    return (
      <div className="ws"><div className="ws-wrap ws-narrow ws-gate"><h1>Page not available</h1><p>This page is not public. <Link href="/">Go to the home page</Link>.</p></div></div>
    );
  }
  return <>{children}</>;
}

export function PreviewBanner({ mode }: { mode: string }) {
  return (
    <div className="ws-preview" role="note">
      <b>Preview, visible only to Super Admins.</b> Broker website mode: {mode}. Go live under Configuration → site.broker after SEBI registration (needs the registration details). <Link href="/preview/broker">Home</Link> · <Link href="/preview/broker/open-account">Open account</Link>
    </div>
  );
}
