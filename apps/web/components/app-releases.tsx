'use client';
import { useEffect, useState } from 'react';
import { API_URL, gql } from '@/lib/api';
import { when } from '@/lib/format';
import { useQuery } from '@/lib/hooks';
import { Icon } from './icons';
import { Empty, ErrorState, SectionHead, SkeletonRows, useToast } from './ui';

export interface AppRelease { id: string; platform: 'ANDROID' | 'IOS'; abi?: string; version: string; notes?: string; fileName?: string; fileSize?: number; sha256?: string; downloadPath?: string; url?: string; active: boolean; createdAt: string }
export const RELEASE_FIELDS = 'id platform abi version notes fileName fileSize sha256 downloadPath url active createdAt';

export const mb = (n?: number) => (n ? `${(n / 1024 / 1024).toFixed(1)} MB` : '');
export const day = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

/* ================================================================== Super Admin: App downloads */
export function AppReleasesAdmin() {
  const q = useQuery<{ appReleases: { uploadsEnabled: boolean; maxUploadMb: number; autoPublish: boolean; history: AppRelease[] } }>(`{ appReleases(limit:30){ uploadsEnabled maxUploadMb autoPublish history{ ${RELEASE_FIELDS} } } }`);
  const toast = useToast();
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);
  const link = `${origin}/download`;
  if (q.loading && !q.data) return <SkeletonRows />;
  if (q.error && !q.data) return <ErrorState error={q.error} retry={q.refetch} />;
  const d = q.data!.appReleases;
  const hide = async (r: AppRelease) => {
    try { await gql(`mutation($id:ID!){ hideAppRelease(id:$id){ id } }`, { id: r.id }); toast(`${r.platform === 'ANDROID' ? `Android${r.abi === 'armeabi-v7a' ? ' (32-bit)' : r.abi === 'arm64-v8a' ? ' (64-bit)' : ''}` : 'iOS'} ${r.version} removed from the download page`); void q.refetch(); }
    catch (e) { toast((e as Error).message, true); }
  };
  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="panel panel-pad row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div className="stack" style={{ gap: 2, minWidth: 0 }}>
          <span className="t2 sm">Share this link with users</span>
          <a className="w6" href="/download" target="_blank" rel="noreferrer" style={{ overflowWrap: 'anywhere' }}>{link}</a>
        </div>
        <button className="btn btn-sm" onClick={() => { void navigator.clipboard?.writeText(link).then(() => toast('Link copied')); }}><Icon name="file" size={16} />Copy link</button>
      </div>
      <div className={`notice ${d.autoPublish && d.uploadsEnabled ? 'ok' : 'info'}`}>
        {d.autoPublish && d.uploadsEnabled
          ? 'Automatic publishing is on: every Android build from GitHub Actions (push to main) appears here and on the download page by itself. You can still upload an APK by hand.'
          : 'Automatic publishing is off. To publish every GitHub Actions build by itself, set APP_RELEASE_CI_TOKEN on the server and the same value as the APP_RELEASE_TOKEN secret in GitHub.'}
      </div>
      <div className="fee-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))' }}>
        <AndroidUpload enabled={d.uploadsEnabled} maxMb={d.maxUploadMb} onDone={() => void q.refetch()} />
        <IosLink current={d.history.find((r) => r.platform === 'IOS' && r.active)} onDone={() => void q.refetch()} />
      </div>
      <section className="section">
        <SectionHead title="History" />
        {!d.history.length ? <Empty icon="download" title="Nothing published yet">Upload an APK or add the TestFlight link above.</Empty> : (
          <div className="panel"><div className="list list-pad">
            {d.history.map((r) => (
              <div key={r.id} className="list-row">
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="w6 sm">{r.platform === 'ANDROID' ? `Android${r.abi === 'armeabi-v7a' ? ' (32-bit)' : r.abi === 'arm64-v8a' ? ' (64-bit)' : ''}` : 'iOS'} · {r.version}</div>
                  <div className="t3 xs" style={{ overflowWrap: 'anywhere' }}>{when(r.createdAt)}{r.platform === 'ANDROID' ? (r.fileSize ? ` · ${mb(r.fileSize)}` : '') + (r.sha256 ? ` · SHA-256 ${r.sha256.slice(0, 12)}…` : '') : r.url ? ` · ${r.url}` : ''}{r.notes ? ` · ${r.notes}` : ''}</div>
                </div>
                <span className={`badge ${r.active && isLatest(d.history, r) ? 'ok' : ''}`}>{r.active ? (isLatest(d.history, r) ? 'Live' : 'Older') : 'Removed'}</span>
                {r.active && <button className="btn btn-sm btn-ghost" onClick={() => void hide(r)}>Remove</button>}
              </div>
            ))}
          </div></div>
        )}
      </section>
    </div>
  );
}

const isLatest = (all: AppRelease[], r: AppRelease) => all.find((x) => x.platform === r.platform && (x.abi === 'armeabi-v7a') === (r.abi === 'armeabi-v7a') && x.active)?.id === r.id;

function AndroidUpload({ enabled, maxMb, onDone }: { enabled: boolean; maxMb: number; onDone: () => void }) {
  const toast = useToast();
  const [abi, setAbi] = useState('arm64-v8a');
  const [version, setVersion] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const tooBig = !!file && file.size > maxMb * 1024 * 1024;
  const ok = enabled && version.trim().length > 0 && !!file && !tooBig && pct === null;
  const upload = async () => {
    if (!file) return;
    setErr(null); setPct(0);
    try {
      const { createApkUploadLink: l } = await gql<{ createApkUploadLink: { path: string } }>(`mutation($v:String!,$n:String,$a:String){ createApkUploadLink(version:$v, notes:$n, abi:$a){ path } }`, { v: version.trim(), n: notes.trim() || null, a: abi });
      await new Promise<void>((resolve, reject) => {
        const x = new XMLHttpRequest();
        x.open('POST', API_URL + l.path);
        x.setRequestHeader('Content-Type', 'application/vnd.android.package-archive');
        x.upload.onprogress = (e) => { if (e.lengthComputable) setPct(Math.round((e.loaded / e.total) * 100)); };
        x.onload = () => { if (x.status >= 200 && x.status < 300) resolve(); else { let m = 'Upload failed.'; try { m = JSON.parse(x.responseText).message ?? m; } catch {} reject(new Error(m)); } };
        x.onerror = () => reject(new Error('Upload failed: check the connection and try again.'));
        x.send(file);
      });
      toast(`Android ${version.trim()} is live on the download page`);
      setVersion(''); setNotes(''); setFile(null); onDone();
    } catch (e) { setErr((e as Error).message); } finally { setPct(null); }
  };
  return (
    <div className="panel panel-pad stack" style={{ gap: 12 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}><span className="w6">Android APK</span><span className="badge">Upload</span></div>
      {!enabled && <div className="notice warn">Uploads aren’t set up on this server yet. Attach a persistent disk to the service and set <b>APP_FILES_DIR</b> (for example /var/data/app-files).</div>}
      <div className="row" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="field" style={{ flex: '1 1 120px' }}><label htmlFor="apk-v">Version</label><input id="apk-v" className="input" maxLength={40} placeholder="e.g. 1.4.2" value={version} onChange={(e) => setVersion(e.target.value)} disabled={!enabled} /></div>
        <div className="field" style={{ flex: '2 1 180px' }}><label htmlFor="apk-n">What’s new (optional)</label><input id="apk-n" className="input" maxLength={500} placeholder="Shown on the download page" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!enabled} /></div>
      </div>
      <div className="field"><label htmlFor="apk-abi">APK version</label><select id="apk-abi" className="input" value={abi} onChange={e => setAbi(e.target.value)} disabled={!enabled || pct !== null}><option value="arm64-v8a">Main download (64-bit)</option><option value="armeabi-v7a">Older phones (32-bit)</option><option value="universal">Universal APK</option></select></div>
      <label htmlFor="apk-f" className={`proof-drop${!enabled ? ' busy' : ''}`} style={{ padding: 14 }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (enabled) setFile(e.dataTransfer.files[0] ?? null); }}>
        <Icon name="download" size={20} /><span className="w6">{file ? file.name : 'Choose the .apk file'}</span>
        <span className={`xs ${tooBig ? 'err' : 't3'}`}>{file ? `${mb(file.size)}${tooBig ? ` · larger than ${maxMb} MB` : ''}` : `Up to ${maxMb} MB`}</span>
      </label>
      <input id="apk-f" type="file" accept=".apk,application/vnd.android.package-archive" className="sr-only" disabled={!enabled} onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
      {pct !== null && <div className="stack" style={{ gap: 4 }}><div style={{ height: 6, borderRadius: 3, background: 'var(--bg-3)', overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', background: 'var(--brand)', transition: 'width .2s' }} /></div><span className="t3 xs">Uploading… {pct}%</span></div>}
      {err && <div className="notice err">{err}</div>}
      <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn btn-primary" disabled={!ok} onClick={() => void upload()}>{pct !== null ? 'Uploading…' : 'Upload and publish'}</button></div>
      <span className="t3 xs">Publishing asks for your password once (step-up). The newest upload is what users download; the last 3 files are kept.</span>
    </div>
  );
}

function IosLink({ current, onDone }: { current?: AppRelease; onDone: () => void }) {
  const toast = useToast();
  const [url, setUrl] = useState(current?.url ?? '');
  const [version, setVersion] = useState(current?.version ?? '');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const valid = /^https:\/\/(testflight|apps)\.apple\.com\//.test(url.trim()) && version.trim().length > 0;
  return (
    <form className="panel panel-pad stack" style={{ gap: 12 }} onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setErr(null);
      try { await gql(`mutation($u:String!,$v:String!,$n:String){ setIosRelease(url:$u, version:$v, notes:$n){ id } }`, { u: url.trim(), v: version.trim(), n: notes.trim() || null }); toast(`iOS ${version.trim()} link is live on the download page`); setNotes(''); onDone(); }
      catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
    }}>
      <div className="row" style={{ justifyContent: 'space-between' }}><span className="w6">iPhone (iOS)</span><span className="badge">TestFlight link</span></div>
      <div className="field"><label htmlFor="ios-u">TestFlight or App Store link</label><input id="ios-u" className="input" inputMode="url" placeholder="https://testflight.apple.com/join/…" value={url} onChange={(e) => setUrl(e.target.value)} /></div>
      <div className="row" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="field" style={{ flex: '1 1 120px' }}><label htmlFor="ios-v">Version</label><input id="ios-v" className="input" maxLength={40} placeholder="e.g. 1.4.2" value={version} onChange={(e) => setVersion(e.target.value)} /></div>
        <div className="field" style={{ flex: '2 1 180px' }}><label htmlFor="ios-n">What’s new (optional)</label><input id="ios-n" className="input" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      </div>
      {err && <div className="notice err">{err}</div>}
      <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn btn-primary" type="submit" disabled={!valid || busy}>{busy ? 'Saving…' : 'Publish link'}</button></div>
      <span className="t3 xs">Use the public TestFlight link from App Store Connect → TestFlight → External Testing → Public Link.</span>
    </form>
  );
}
