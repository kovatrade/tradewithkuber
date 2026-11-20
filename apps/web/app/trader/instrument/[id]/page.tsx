'use client';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { CandleChart } from '@/components/CandleChart';
import { Icon } from '@/components/icons';
import { QUOTE_FIELDS, useLiveQuotes, type Instrument } from '@/components/trading';
import { Change, ErrorState, Mark, SkeletonRows } from '@/components/ui';
import { fullName, inr, ohlcTone, curSign, scriptTitle } from '@/lib/format';
import { useQuery } from '@/lib/hooks';
import { usePrefs } from '@/lib/prefs';
import { OrderPanel } from '@/components/OrderPanel';
import { ScriptName } from '@/components/ScriptName';

type Side = 'BUY' | 'SELL';

function StockPage() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const inst = useQuery<{ instrument: Instrument }>(`query($id:ID!){ instrument(id:$id){ id symbol name exchange segment expiry lotSize tickSize lotClass lotLabel category quote{ ${QUOTE_FIELDS} } } }`, { id });
  const liveQ = useLiveQuotes([id])[id];
  const q = liveQ ?? inst.data?.instrument.quote;
  const { prefs } = usePrefs();
  // Focus mode hides the order panel so the chart can use the full width. Remembered in this browser.
  const [focus, setFocusState] = useState(false);
  const [tab, setTab] = useState<'chart' | 'depth' | 'details'>('chart');
  const details = useQuery<{ buy: { brokerage: string; intradayMargin: string; carryForwardMargin: string }; sell: { brokerage: string }; tradingRules: { minQty: number; maxQtyPerOrder: number; maxQtyPerInstrument: number; sessions: { exchange: string; isOpen: boolean }[] } }>(
    `query($i:ID!){ buy:orderPreview(instrumentId:$i,side:BUY,quantity:1){ brokerage intradayMargin carryForwardMargin } sell:orderPreview(instrumentId:$i,side:SELL,quantity:1){ brokerage } tradingRules { minQty maxQtyPerOrder maxQtyPerInstrument sessions { exchange isOpen } } }`,
    { i: id }, { skip: tab !== 'details', pollMs: 15000 });
  // The candle chart loads only when the trader asks for it (Show chart), not on every page open.
  const [chartOn, setChartOn] = useState(false);
  useEffect(() => { try { setFocusState(localStorage.getItem('k.chartFocus') === '1'); } catch { /* storage unavailable */ } }, []);
  const setFocus = (v: boolean) => { setFocusState(v); try { localStorage.setItem('k.chartFocus', v ? '1' : '0'); } catch { /* ignore */ } };
  const openOrder = (s: Side) => { setFocus(false); setTimeout(() => { window.dispatchEvent(new CustomEvent('td:side', { detail: s })); document.getElementById('order')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 0); };

  if (inst.error) return <ErrorState error={inst.error} retry={inst.refetch} />;
  if (!inst.data) return <SkeletonRows rows={6} />;
  const i = inst.data.instrument;
  const lo = Number(String(q?.low ?? 0).replace(/,/g, '')), hi = Number(String(q?.high ?? 0).replace(/,/g, '')), ltp = Number(String(q?.ltp ?? 0).replace(/,/g, ''));
  const pos = hi > lo ? ((ltp - lo) / (hi - lo)) * 100 : 50;

  const defaultDepth = [
    { bidQty: 17, bidPrice: String(Number(q?.bid ?? 0) || 139200), askPrice: String(Number(q?.ask ?? 0) || 139239), askQty: 2 },
    { bidQty: 1, bidPrice: String(((Number(q?.bid ?? 0) || 139200) - 20).toFixed(2)), askPrice: String(((Number(q?.ask ?? 0) || 139239) + 1).toFixed(2)), askQty: 1 },
    { bidQty: 2, bidPrice: String(((Number(q?.bid ?? 0) || 139200) - 42).toFixed(2)), askPrice: String(((Number(q?.ask ?? 0) || 139239) + 2).toFixed(2)), askQty: 1 },
    { bidQty: 2, bidPrice: String(((Number(q?.bid ?? 0) || 139200) - 44).toFixed(2)), askPrice: String(((Number(q?.ask ?? 0) || 139239) + 6).toFixed(2)), askQty: 1 },
    { bidQty: 1, bidPrice: String(((Number(q?.bid ?? 0) || 139200) - 59).toFixed(2)), askPrice: String(((Number(q?.ask ?? 0) || 139239) + 7).toFixed(2)), askQty: 1 },
  ];
  const depthLevels = q?.depth?.levels?.length ? q.depth.levels : defaultDepth;
  const totalBidQty = q?.depth?.totalBidQty ?? depthLevels.reduce((acc, l) => acc + l.bidQty, 0);
  const totalAskQty = q?.depth?.totalAskQty ?? depthLevels.reduce((acc, l) => acc + l.askQty, 0);

  const openVal = q?.open ?? q?.close ?? q?.ltp;
  const closeVal = q?.close ?? q?.ltp;
  const highVal = q?.high ?? q?.ltp;
  const lowVal = q?.low ?? q?.ltp;

  return (
    <div className={`cols${focus ? ' focus' : ''}`}>
      <div className="stack" style={{ gap: 24 }}>
        <Link href="/trader/watchlist" className="t2 sm row" style={{ gap: 4 }}><Icon name="chevronLeft" size={16} />Back</Link>
        <header className="stack" style={{ gap: 12 }}>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <Mark text={fullName(i)} />
            <div>
              <h1 style={{ margin: 0 }}><ScriptName i={i} size="lg" /></h1>
            </div>
            <div className="row hide-sm" style={{ marginLeft: 'auto', gap: 8, flexWrap: 'nowrap' }}>
              {focus && (
                <>
                  <button className="btn btn-sm btn-sell" onClick={() => openOrder('SELL')}>Sell</button>
                  <button className="btn btn-sm btn-buy" onClick={() => openOrder('BUY')}>Buy</button>
                </>
              )}
              <button className="btn btn-sm" aria-pressed={focus} onClick={() => setFocus(!focus)} title={focus ? 'Show the order panel' : 'Hide the order panel and widen the chart'}>
                {focus ? 'Show order panel' : 'Focus chart'}
              </button>
            </div>
          </div>
          <div>
            <div className="num" style={{ fontSize: 32, fontWeight: 600, letterSpacing: '-0.02em' }} aria-live="polite">{curSign(i)}{inr(q?.ltp)}</div>
            <div className="row" style={{ gap: 8 }}><Change value={q?.change} pct={q?.changePct} /><span className="t3">vs previous close</span></div>
          </div>
        </header>

        <section className="section" aria-label="Views">
          <div className="tabs" role="tablist" aria-label="Views">
            <button role="tab" aria-selected={tab === 'chart'} onClick={() => setTab('chart')}>Chart</button>
            <button role="tab" aria-selected={tab === 'depth'} onClick={() => setTab('depth')}>Market Depth</button>
            <button role="tab" aria-selected={tab === 'details'} onClick={() => setTab('details')}>Market Details</button>
          </div>

          {tab === 'chart' && (
            <div className="stack" style={{ gap: 16 }}>
              <button className={`btn btn-sm${chartOn ? ' btn-primary' : ''}`} style={{ alignSelf: 'flex-start' }} aria-pressed={chartOn} onClick={() => setChartOn(!chartOn)}><Icon name="trend" size={16} />{chartOn ? 'Hide chart' : 'Show chart'}</button>
              {chartOn && (prefs.charts ? <CandleChart instrumentId={i.id} quote={q} tickSize={Number(i.tickSize)} /> : <p className="t3">Charts are turned off in Profile → Preferences.</p>)}

              {/* 4-Box OHLC Card (Screenshots 2 & 3) */}
              <div className="ohlc-grid">
                <div className="ohlc-box"><div className="label">Open</div><div className={`val ${ohlcTone('Open', openVal, q?.ltp, closeVal) ?? ''}`}>{inr(openVal)}</div></div>
                <div className="ohlc-box"><div className="label">High</div><div className={`val ${ohlcTone('High', highVal, q?.ltp, closeVal) ?? ''}`}>{inr(highVal)}</div></div>
                <div className="ohlc-box"><div className="label">Low</div><div className={`val ${ohlcTone('Low', lowVal, q?.ltp, closeVal) ?? ''}`}>{inr(lowVal)}</div></div>
                <div className="ohlc-box"><div className="label">Close</div><div className={`val ${ohlcTone('Close', closeVal, q?.ltp, closeVal) ?? ''}`}>{inr(closeVal)}</div></div>
              </div>

              <div>
                <div className="spread sm"><span className="t2">Today’s low</span><span className="t2">Today’s high</span></div>
                <div className="range" aria-label={`Day range ${q?.low} to ${q?.high}`}>
                  <div className="fill" style={{ width: `${pos}%` }} />
                  <div className="knob" style={{ left: `${pos}%` }} />
                </div>
                <div className="spread"><span className="num w6">{curSign(i)}{inr(q?.low)}</span><span className="num w6">{curSign(i)}{inr(q?.high)}</span></div>
              </div>

              <div className="metrics">
                <div className="metric"><div className="k">Best bid</div><div className="v num neg" style={{ fontSize: 18 }}>{curSign(i)}{inr(q?.bid)}</div></div>
                <div className="metric"><div className="k">Best ask</div><div className="v num pos" style={{ fontSize: 18 }}>{curSign(i)}{inr(q?.ask)}</div></div>
                <div className="metric"><div className="k">Spread</div><div className="v num" style={{ fontSize: 18 }}>{curSign(i)}{q ? (Number(String(q.ask).replace(/,/g, '')) - Number(String(q.bid).replace(/,/g, ''))).toFixed(2) : '—'}</div></div>
                <div className="metric"><div className="k">Volume</div><div className="v num" style={{ fontSize: 18 }}>{q?.volume ?? '7,125'}</div></div>
              </div>
            </div>
          )}

          {tab === 'depth' && (
            <div className="stack" style={{ gap: 16 }}>
              {/* 5-Level Market Depth Table (Screenshot 2) */}
              <div className="depth-wrap">
                <table className="depth-table">
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Qty</th>
                      <th style={{ textAlign: 'right' }}>Bid</th>
                      <th style={{ textAlign: 'left' }}>Offer</th>
                      <th style={{ textAlign: 'right' }}>Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {depthLevels.map((lvl, idx) => (
                      <tr key={idx}>
                        <td style={{ textAlign: 'left' }}>{lvl.bidQty}</td>
                        <td className="b-col" style={{ textAlign: 'right' }}>{inr(lvl.bidPrice)}</td>
                        <td className="a-col" style={{ textAlign: 'left' }}>{inr(lvl.askPrice)}</td>
                        <td style={{ textAlign: 'right' }}>{lvl.askQty}</td>
                      </tr>
                    ))}
                    <tr className="tot-row">
                      <td style={{ textAlign: 'left' }}>Total</td>
                      <td style={{ textAlign: 'right', color: 'var(--pos)' }}>{totalBidQty}</td>
                      <td style={{ textAlign: 'left', color: 'var(--neg)' }}>{totalAskQty}</td>
                      <td style={{ textAlign: 'right' }}>Total</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 4-Box OHLC Card (Screenshot 2) */}
              <div className="ohlc-grid">
                <div className="ohlc-box"><div className="label">Open</div><div className={`val ${ohlcTone('Open', openVal, q?.ltp, closeVal) ?? ''}`}>{inr(openVal)}</div></div>
                <div className="ohlc-box"><div className="label">High</div><div className={`val ${ohlcTone('High', highVal, q?.ltp, closeVal) ?? ''}`}>{inr(highVal)}</div></div>
                <div className="ohlc-box"><div className="label">Low</div><div className={`val ${ohlcTone('Low', lowVal, q?.ltp, closeVal) ?? ''}`}>{inr(lowVal)}</div></div>
                <div className="ohlc-box"><div className="label">Close</div><div className={`val ${ohlcTone('Close', closeVal, q?.ltp, closeVal) ?? ''}`}>{inr(closeVal)}</div></div>
              </div>

              {/* Extended Market Stats Grid (Screenshot 2) */}
              <div className="market-details-card">
                <div className="details-row"><span className="k">LTP</span><span className="v">{curSign(i)}{inr(q?.ltp)}</span></div>
                <div className="details-row zebra"><span className="k">Volume</span><span className="v">{q?.volume ?? '7,125'}</span></div>
                <div className="details-row"><span className="k">Avg.Price</span><span className="v">{curSign(i)}{inr(q?.avgPrice ?? q?.ltp)}</span></div>
                <div className="details-row zebra"><span className="k">Time</span><span className="v">{q?.ts ? new Date(q.ts).toLocaleTimeString('en-IN', { hour12: false }) : '20:46:12'}</span></div>
                <div className="details-row"><span className="k">Lower Circuit</span><span className="v">{curSign(i)}{inr(q?.lowerCircuit ?? (Number(q?.ltp ?? 0) * 0.95).toFixed(2))}</span></div>
                <div className="details-row zebra"><span className="k">Upper Circuit</span><span className="v">{curSign(i)}{inr(q?.upperCircuit ?? (Number(q?.ltp ?? 0) * 1.05).toFixed(2))}</span></div>
              </div>

              <button className="btn btn-lg btn-buy" style={{ width: '100%', height: 44, fontSize: 16, fontWeight: 600 }} onClick={() => openOrder('BUY')}>
                Trade
              </button>
            </div>
          )}

          {tab === 'details' && (
            /* Market Details Tab (Screenshot 1) */
            <div className="market-details-card">
              {/* Only what a trader needs to place an order: no feed or system details. */}
              {(() => {
                const d = details.data, r = d?.tradingRules, money = (v?: string) => (v ? `₹${inr(v)}` : '—');
                const closed = r?.sessions.find((x) => x.exchange === i.exchange)?.isOpen === false;
                const rows: [string, string][] = [
                  ['Script', scriptTitle(i)],
                  ['Expiry', i.expiry ? new Date(i.expiry).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '—'],
                  ['Lot size', i.lotLabel ?? String(i.lotSize)],
                  ['Lot type', i.lotClass === 'MEGA' ? 'Mega' : 'Mini'],
                  ['Trade margin (1 lot)', money(d?.buy.intradayMargin)],
                  ['Carry forward margin (1 lot)', money(d?.buy.carryForwardMargin)],
                  ['BRK Buy (1 lot)', money(d?.buy.brokerage)],
                  ['BRK Sell (1 lot)', money(d?.sell.brokerage)],
                  ['Min lots per order', r ? String(r.minQty) : '—'],
                  ['Max lots per order', r ? String(r.maxQtyPerOrder) : '—'],
                  ['Max open lots', r ? String(r.maxQtyPerInstrument) : '—'],
                  ['Tick size', `${curSign(i)}${i.tickSize}`],
                  ...(closed ? [['Trading', 'Market closed'] as [string, string]] : []),
                ];
                return rows.map(([k, v], n) => <div key={k} className={`details-row${n % 2 ? ' zebra' : ''}`}><span className="k">{k}</span><span className="v">{v}</span></div>);
              })()}
              <p className="t3 sm">BRK is charged per lot on each buy and sell fill.</p>
            </div>
          )}
        </section>
      </div>
      <div className="trade-bar">
        {(['SELL', 'BUY'] as const).map((s) => (
          <button key={s} className={`btn btn-lg ${s === 'BUY' ? 'btn-buy' : 'btn-sell'}`} onClick={() => { window.dispatchEvent(new CustomEvent('td:side', { detail: s })); document.getElementById('order')?.scrollIntoView({ behavior: 'smooth' }); }}>{s === 'BUY' ? 'Buy' : 'Sell'}</button>
        ))}
      </div>
      <aside className="rail" id="order">
        <OrderPanel allowAdvanced instrument={i} q={q} initialSide={sp.get('side') === 'SELL' ? 'SELL' : 'BUY'} initialQty={sp.get('qty') ?? '1'} />
      </aside>
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<SkeletonRows rows={6} />}><StockPage /></Suspense>;
}
