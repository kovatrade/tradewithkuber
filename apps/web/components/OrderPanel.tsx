'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { QUOTE_FIELDS, useLiveQuotes, useSummary, type Instrument } from '@/components/trading';
import { Chips, Confirm, Dialog, ErrorState, SkeletonRows, useToast } from '@/components/ui';
import { gql, newKey, pollingPaused } from '@/lib/api';
import { inr, scriptTitle } from '@/lib/format';
import { ScriptName } from '@/components/ScriptName';
import { useMutation, useQuery } from '@/lib/hooks';
import { playTone, usePrefs } from '@/lib/prefs';

/** Buy / sell ticket for one instrument (used on the instrument page and from Positions). */
export type Side = 'BUY' | 'SELL';
interface Preview { price: string; value: string; intradayMargin: string; carryForwardMargin: string; brokerage: string }

type OType = 'MARKET' | 'LIMIT' | 'STOP_LOSS';
interface Rules { minQty: number; maxQtyPerOrder: number; maxQtyPerInstrument: number; brokeragePerLot?: string; brokeragePerMegaLot?: string; marketHoursEnforced: boolean; sessions: { exchange: string; open: string; close: string; isOpen: boolean; message?: string }[] }
const TYPE_LABEL: Record<OType, string> = { MARKET: 'Market', LIMIT: 'Limit', STOP_LOSS: 'Stop-loss' };
const isTrig = (t: OType) => t === 'STOP_LOSS';
/** Does the trigger fire when the LTP falls to it (else when it rises)? Mirrors the API. */
const firesOnFall = (t: OType, s: Side) => t === 'STOP_LOSS' && s === 'SELL';

function roundToTick(v: number, tick: number) {
  const t = Math.round(tick * 100);
  return (Math.max(t, Math.round((v * 100) / t) * t) / 100).toFixed(2);
}

export function OrderPanel({ allowAdvanced, instrument: i, q, initialSide, initialQty }: { allowAdvanced: boolean; instrument: Instrument; q?: { bid?: string; ask?: string; ltp: string }; initialSide: Side; initialQty: string }) {
  const demo = useAuth().me?.isDemo === true;
  const toast = useToast();
  const { prefs } = usePrefs();
  const sum = useSummary();
  const rules = useQuery<{ tradingRules: Rules }>(`{ tradingRules { minQty maxQtyPerOrder maxQtyPerInstrument brokeragePerLot brokeragePerMegaLot marketHoursEnforced sessions { exchange open close isOpen message } } }`, undefined, { pollMs: 60_000 });
  const pos = useQuery<{ positions: { instrumentId: string; netQty: number }[] }>(`{ positions { instrumentId netQty } }`, undefined, { pollMs: 5000 });
  const [side, setSide] = useState<Side>(initialSide);
  const [type, setType] = useState<OType>('MARKET');
  const [qty, setQty] = useState(initialQty);
  const [price, setPrice] = useState('');
  useEffect(() => { if (!allowAdvanced) { setType('MARKET'); setPrice(''); } }, [allowAdvanced]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [idem, setIdem] = useState(newKey);
  const place = useMutation(`mutation($i:PlaceOrderInput!){ placeOrder(input:$i){ id status fillPrice rejectReason } }`);

  const r = rules.data?.tradingRules;
  const session = r?.sessions.find((x) => x.exchange === i.exchange);
  const held = pos.data?.positions.find((p) => p.instrumentId === i.id)?.netQty ?? 0;
  const ltp = Number(q?.ltp ?? 0);
  const n = Number(qty);
  const needsPrice = type !== 'MARKET';
  const qtyErr = !qty ? 'Enter a quantity' : !Number.isInteger(n) || n <= 0 ? 'Quantity must be a whole number above 0'
    : r && n < r.minQty ? `Minimum ${r.minQty}` : r && n > r.maxQtyPerOrder ? `Maximum ${r.maxQtyPerOrder} per order` : null;
  const priceFmt = /^\d{1,10}(\.\d{1,2})?$/.test(price);
  const priceErr = !needsPrice ? null : !priceFmt ? 'Enter a valid price'
    : Math.round(Number(price) * 100) % Math.round(Number(i.tickSize) * 100) !== 0 ? `Price must be a multiple of ₹${i.tickSize}`
    : isTrig(type) && ltp && (firesOnFall(type, side) ? Number(price) >= ltp : Number(price) <= ltp)
      ? `Trigger must be ${firesOnFall(type, side) ? 'below' : 'above'} the LTP (₹${inr(q?.ltp)})` : null;
  const closed = session && !session.isOpen;
  const valid = !qtyErr && !priceErr && !!q;

  // live margin preview (read-only query)
  const [previewTick, setPreviewTick] = useState(0);
  useEffect(() => {
    if (type !== 'MARKET' || !valid) return;
    const t = setInterval(() => { if (!document.hidden && !pollingPaused()) setPreviewTick((n) => n + 1); }, 10_000);
    return () => clearInterval(t);
  }, [type, valid]);
  useEffect(() => {
    if (!valid) { setPreview(null); return; }
    const h = setTimeout(() => {
      gql<{ orderPreview: Preview }>(`query($i:ID!,$s:OrderSide!,$q:Int!,$l:String,$t:String){ orderPreview(instrumentId:$i, side:$s, quantity:$q, limitPrice:$l, triggerPrice:$t){ price value intradayMargin carryForwardMargin brokerage } }`, { i: i.id, s: side, q: n, l: type === 'LIMIT' ? price : undefined, t: isTrig(type) ? price : undefined })
        .then((d) => setPreview(d.orderPreview)).catch(() => setPreview(null));
    }, 250);
    return () => clearTimeout(h);
    // Market orders: refresh the estimate every 10 s (not on every tick: that alone was ~60 requests a minute).
  }, [i.id, side, n, type, price, valid, type === 'MARKET' ? previewTick : 0]);


  const handleTradeClick = () => {
    if (closed) {
      toast(session?.message ?? 'Market is closed as per timing rules.');
      return;
    }
    place.setError(null);
    setConfirm(true);
  };

  const submit = async () => {
    const res = await place.run({ i: { instrumentId: i.id, side, type, quantity: n, limitPrice: type === 'LIMIT' ? price : undefined, triggerPrice: isTrig(type) ? price : undefined, idempotencyKey: idem } });
    if (!res) return;
    const o = res.placeOrder;
    setConfirm(false);
    setIdem(newKey()); // a retry of this order reuses the old key; the next order gets a new one
    void sum.refetch();
    void pos.refetch();
    if (o.status === 'REJECTED') { playTone('reject', prefs.sounds); toast(`Order rejected: ${o.rejectReason}`, true); }
    else if (o.status === 'FILLED') { playTone('fill', prefs.sounds); toast(`${side === 'BUY' ? 'Bought' : 'Sold'} ${n} ${scriptTitle(i)} at ₹${inr(o.fillPrice)}`); }
    else { playTone('placed', prefs.sounds); toast(isTrig(type) ? `${TYPE_LABEL[type]} set. It fills at the LTP when the price reaches ₹${inr(price)}.` : 'Limit order placed. It executes when the price reaches your limit.'); }
  };

  useEffect(() => {
    const h = (e: Event) => setSide((e as CustomEvent<Side>).detail);
    window.addEventListener('td:side', h);
    return () => window.removeEventListener('td:side', h);
  }, []);

  // Quick prices: limit orders step away from the touch; triggers step away from the LTP.
  const ref = type === 'LIMIT' ? Number(side === 'BUY' ? q?.ask : q?.bid) : ltp;
  const down = type === 'LIMIT' ? side === 'BUY' : firesOnFall(type, side);
  const steps = type === 'LIMIT' ? [10, 25, 50] : [1, 2, 5];
  const refLabel = type === 'LIMIT' ? (side === 'BUY' ? 'Below ask' : 'Above bid') : down ? 'Below LTP' : 'Above LTP';

  return (
    <section className="order-panel" aria-label="Order panel">
      <div className="order-tabs" role="tablist" aria-label="Side">
        <button role="tab" className="buy" aria-selected={side === 'BUY'} onClick={() => setSide('BUY')}>Buy</button>
        <button role="tab" className="sell" aria-selected={side === 'SELL'} onClick={() => setSide('SELL')}>Sell</button>
      </div>
      <div className="order-body">
        <div className="spread">
          <ScriptName i={i} size="sm" />
          <span className="t2 sm num">{side === 'BUY' ? 'Ask' : 'Bid'} ₹{inr(side === 'BUY' ? q?.ask : q?.bid)}</span>
        </div>
        {session && (
          <div className={`session ${session.isOpen ? '' : 'closed'}`} role="status">
            <span className="dot" aria-hidden />
            {session.isOpen ? `${i.exchange} open · ${session.open}–${session.close} IST` : session.message}
          </div>
        )}
        <div className="order-types"><Chips label="Order type" value={type} onChange={(t) => { setType(t); setPrice(''); }} items={((allowAdvanced ? ['MARKET', 'LIMIT', 'STOP_LOSS'] : ['MARKET']) as OType[]).map((t) => ({ v: t, label: t === 'STOP_LOSS' ? 'SL' : TYPE_LABEL[t], title: TYPE_LABEL[t] }))} /></div>
        <div className="field">
          <label htmlFor="qty">Quantity (lots)</label>
          <div className="lot-step">
            <button type="button" aria-label="Decrease quantity" onClick={() => setQty(String(Math.max(1, (n || 1) - 1)))}>−</button>
            <input id="qty" className="num" inputMode="numeric" value={qty} aria-invalid={!!qtyErr} aria-describedby="qty-limits" onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))} />
            <button type="button" aria-label="Increase quantity" onClick={() => setQty(String((n || 0) + 1))}>+</button>
          </div>
          {qtyErr && <span className="err">{qtyErr}</span>}
          {i.lotLabel && <span className="t3 xs">1 lot = {i.lotLabel}{n > 1 ? ` · ${n} lots` : ''}</span>}
          {r && (
            <div className="qty-chips" id="qty-limits">
              <button type="button" className="badge" title="Maximum quantity in one order" onClick={() => setQty(String(r.maxQtyPerOrder))}>Punch qty: {r.maxQtyPerOrder}</button>
              <span className="badge" title="Maximum open quantity for this instrument">Total qty: {r.maxQtyPerInstrument}</span>
              <span className="badge" title="Minimum quantity per order">Min qty: {r.minQty}</span>
              {held !== 0 && <button type="button" className="badge info" title="Your open position" onClick={() => { setQty(String(Math.abs(held))); setSide(held > 0 ? 'SELL' : 'BUY'); }}>Holding: {held}</button>}
            </div>
          )}
        </div>
        <div className="field">
          <label htmlFor="lp">{type === 'MARKET' ? 'Price' : type === 'LIMIT' ? 'Limit price' : 'Trigger price (LTP)'}</label>
          {type === 'MARKET' ? (
            <input id="lp" className="input" disabled value="At market price" />
          ) : (
            <>
              <input id="lp" className="input num" inputMode="decimal" placeholder={q?.ltp} value={price} aria-invalid={!!priceErr && !!price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))} />
              {ref > 0 && (
                <div className="chips" role="group" aria-label={`Quick price, ${refLabel}`}>
                  <span className="t3 xs" style={{ alignSelf: 'center' }}>{refLabel}</span>
                  {steps.map((p) => {
                    const v = roundToTick(ref * (1 + ((down ? -1 : 1) * p) / 100), Number(i.tickSize));
                    return <button type="button" key={p} className="chip" aria-pressed={price === v} onClick={() => setPrice(v)}>{down ? '−' : '+'}{p}%</button>;
                  })}
                </div>
              )}
              {price && priceErr ? <span className="err">{priceErr}</span> : (
                <span className="hint">
                  {type === 'LIMIT' ? 'Executes only at this price or better' : `${TYPE_LABEL[type]}: when the LTP ${firesOnFall(type, side) ? 'falls to' : 'rises to'} this price, the order is filled at the LTP.`}
                </span>
              )}
            </>
          )}
        </div>
      </div>
      <div className="order-foot">
        <div className="kv"><span className="k">Market price</span><span className="num">{q ? `₹${inr(q.ltp)}` : '—'}</span></div>
        <div className="kv"><span className="k">Order value</span><span className="num">{preview ? `₹${inr(preview.value)}` : '—'}</span></div>
        <div className="kv"><span className="k">Intraday margin</span><span className="num w6">{preview ? `₹${inr(preview.intradayMargin)}` : '—'}</span></div>
        <div className="kv"><span className="k">C/F margin</span><span className="num">{preview ? `₹${inr(preview.carryForwardMargin)}` : '—'}</span></div>

        <button className={`btn btn-lg btn-block ${side === 'BUY' ? 'btn-buy' : 'btn-sell'}`} disabled={!!closed || !valid || !preview} onClick={handleTradeClick}>
          {side === 'BUY' ? 'Buy' : 'Sell'}{valid && preview ? ` ${n} @ ${type === 'MARKET' ? inr(side === 'BUY' ? q?.ask : q?.bid) : inr(price)}` : ''}
        </button>
        {demo && <p className="t3" style={{ textAlign: 'center' }}>Simulated order. Never sent to an exchange.</p>}
      </div>
      {confirm && preview && (
        <Confirm
          title={`${side === 'BUY' ? 'Buy' : 'Sell'} ${scriptTitle(i)}`}
          sub="Review your order"
          lines={[
            ['Order type', TYPE_LABEL[type]],
            ['Quantity', n],
            [type === 'MARKET' ? 'Estimated price' : type === 'LIMIT' ? 'Limit price' : 'Trigger (LTP)', `₹${inr(preview.price)}`],
            ['Order value', `₹${inr(preview.value)}`],
            ['Margin required', `₹${inr(preview.intradayMargin)}`],
            ['Carry-forward margin', `₹${inr(preview.carryForwardMargin)}`],
          ]}
          warning={type === 'MARKET' ? demo ? 'Market orders execute at the best available simulated price, which can differ slightly from the estimate.' : 'Market orders execute at the best available price, which can differ slightly from the estimate.' : isTrig(type) ? 'When triggered, this order is filled at the last traded price, which can be worse than your trigger in a fast market.' : undefined}
          confirmLabel={`Confirm ${side === 'BUY' ? 'buy' : 'sell'}`}
          tone={side === 'BUY' ? 'buy' : 'sell'}
          pending={place.pending}
          error={place.error}
          onClose={() => setConfirm(false)}
          onConfirm={() => void submit()}
        />
      )}

    </section>
  );
}

/** The buy / sell ticket in a dialog, opened from a position (set to exit it; Buy/Sell and quantity can be changed). */
export function PositionTradeDialog({ instrumentId, side, qty, onClose }: { instrumentId: string; side: Side; qty: string; onClose: () => void }) {
  const inst = useQuery<{ instrument: Instrument }>(`query($id:ID!){ instrument(id:$id){ id symbol name exchange segment expiry lotSize tickSize lotClass lotLabel category quote{ ${QUOTE_FIELDS} } } }`, { id: instrumentId });
  const q = useLiveQuotes([instrumentId])[instrumentId] ?? inst.data?.instrument.quote;
  const i = inst.data?.instrument;
  return (
    <Dialog title={i ? scriptTitle(i) : 'Trade'} onClose={onClose}>
      {inst.error ? <ErrorState error={inst.error} retry={inst.refetch} /> : !i ? <SkeletonRows rows={4} /> : <OrderPanel allowAdvanced instrument={i} q={q} initialSide={side} initialQty={qty} />}
    </Dialog>
  );
}
