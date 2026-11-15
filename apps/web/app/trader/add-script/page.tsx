'use client';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Watchlist } from '@/components/trading';
import { Icon } from '@/components/icons';

/** Full-page "Add script": search every market, add or remove scripts, then Done returns to the dashboard. */
export default function AddScriptPage() {
  return <Suspense fallback={null}><AddScript /></Suspense>;
}

function AddScript() {
  const router = useRouter();
  const list = useSearchParams().get('list') === '1' ? 1 : 0;
  const done = () => (window.history.length > 1 ? router.back() : router.push('/trader/watchlist'));
  return (
    <div className="stack home" style={{ gap: 16 }}>
      <div className="spread" style={{ alignItems: 'center' }}>
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <button className="btn btn-sm btn-ghost" aria-label="Back" onClick={done}><Icon name="chevronLeft" size={18} /></button>
          <h1 className="home-hi">Add script <span className="t3" style={{ fontWeight: 500 }}>· Watchlist {list + 1}</span></h1>
        </div>
        <button className="btn btn-primary" onClick={done}>Done</button>
      </div>
      <Watchlist mode="add" list={list} />
    </div>
  );
}
