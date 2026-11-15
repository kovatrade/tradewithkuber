'use client';
import Link from 'next/link';
import { homeFor, useAuth } from '@/lib/auth';

/** Header link into the trading portal: "Log in", or "Open portal" when already signed in. */
export function PortalLink() {
  const { me } = useAuth();
  return me ? <Link href={homeFor(me.role)} className="ws-btn ws-btn-line ws-btn-sm">Open portal</Link> : <Link href="/login" className="ws-link-quiet">Log in</Link>;
}
