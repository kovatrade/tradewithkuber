'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { API_URL } from '@/lib/api';
import { useQuery } from '@/lib/hooks';
import { Icon, Logo } from '@/components/icons';
import { ErrorState } from '@/components/ui';
import { day, mb, RELEASE_FIELDS, type AppRelease } from '@/components/app-releases';

/** Public: download the Android app (APK) or join the iPhone TestFlight. No sign-in needed. */
export default function Download() {
  const q = useQuery<{ appDownloads: { android?: AppRelease; ios?: AppRelease } }>(`{ appDownloads { android { ${RELEASE_FIELDS} } ios { ${RELEASE_FIELDS} } } }`);
  const [os, setOs] = useState<'android' | 'ios' | 'other'>('other');
  useEffect(() => {
    const ua = navigator.userAgent;
    setOs(/android/i.test(ua) ? 'android' : /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1) ? 'ios' : 'other');
  }, []);
  const a = q.data?.appDownloads.android;
  const i = q.data?.appDownloads.ios;
  const android = (
    <div key="a" className={`panel dl-card${os === 'android' ? ' dl-mine' : ''}`}>
      <div className="dl-top"><span className="dl-ico"><Icon name="device" size={22} /></span><div><div className="w6">Android</div><div className="t3 xs">{a ? `Version ${a.version} · ${mb(a.fileSize)} · ${day(a.createdAt)}` : 'Coming soon'}</div></div>{os === 'android' && <span className="badge ok">Your phone</span>}</div>
      {a?.notes && <p className="sm t2" style={{ margin: 0 }}>{a.notes}</p>}
      {a?.downloadPath ? <a className="btn btn-primary btn-lg dl-btn" href={API_URL + a.downloadPath} download><Icon name="download" size={18} />Download APK</a> : <button className="btn btn-lg dl-btn" disabled>Not available yet</button>}
      <ol className="dl-steps">
        <li>Tap <b>Download APK</b> and open the file when it finishes.</li>
        <li>If asked, allow <b>Install unknown apps</b> for your browser or Files app.</li>
        <li>Tap <b>Install</b>, then open The K and sign in.</li>
      </ol>
      {a?.sha256 && <span className="t3 xs" style={{ overflowWrap: 'anywhere' }}>SHA-256: {a.sha256}</span>}
    </div>
  );
  const ios = (
    <div key="i" className={`panel dl-card${os === 'ios' ? ' dl-mine' : ''}`}>
      <div className="dl-top"><span className="dl-ico"><Icon name="device" size={22} /></span><div><div className="w6">iPhone</div><div className="t3 xs">{i ? `Version ${i.version} · ${day(i.createdAt)}` : 'Coming soon'}</div></div>{os === 'ios' && <span className="badge ok">Your phone</span>}</div>
      {i?.notes && <p className="sm t2" style={{ margin: 0 }}>{i.notes}</p>}
      {i?.url ? <a className="btn btn-primary btn-lg dl-btn" href={i.url} target="_blank" rel="noreferrer"><Icon name="external" size={18} />{i.url.includes('testflight') ? 'Open in TestFlight' : 'Open in App Store'}</a> : <button className="btn btn-lg dl-btn" disabled>Not available yet</button>}
      {i?.url?.includes('testflight') ? (
        <ol className="dl-steps">
          <li>Install Apple’s free <b>TestFlight</b> app from the App Store.</li>
          <li>Come back here and tap <b>Open in TestFlight</b>, then <b>Accept</b> and <b>Install</b>.</li>
          <li>Open The K and sign in.</li>
        </ol>
      ) : <ol className="dl-steps"><li>Tap the button and install from the App Store.</li><li>Open The K and sign in.</li></ol>}
    </div>
  );
  return (
    <main className="auth" style={{ justifyContent: 'flex-start' }}>
      <div className="dl-wrap">
        <div className="auth-brand"><Logo size={36} /><span className="w6" style={{ fontSize: 20 }}>The K</span></div>
        <h1 className="dl-title">Get the app</h1>
        <p className="t2" style={{ margin: 0 }}>Download The K for your phone. Use the same username and password as on the web.</p>
        {q.error && !q.data ? <ErrorState error={q.error} retry={q.refetch} /> : !q.data ? <div className="dl-grid"><div className="panel dl-card skeleton" style={{ height: 260 }} /><div className="panel dl-card skeleton" style={{ height: 260 }} /></div> : (
          <div className="dl-grid">{os === 'ios' ? [ios, android] : [android, ios]}</div>
        )}
        <p className="t3 sm" style={{ margin: 0 }}>Prefer the browser? <Link href="/login">Sign in on the web</Link>.</p>
      </div>
    </main>
  );
}
