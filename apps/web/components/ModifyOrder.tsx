'use client';
import { useState } from 'react';
import { ScriptName } from '@/components/ScriptName';
import { useLiveQuotes } from '@/components/trading';
import { Dialog, useToast } from '@/components/ui';
import { gql } from '@/lib/api';
import { inr, scriptTitle } from '@/lib/format';

export interface PendingOrder {
  id: string; type: string; side: string; quantity: number; limitPrice?: string | null; triggerPrice?: string | null;
  instrumentId?: string; instrument?: { symbol: string; name?: string; expiry?: string | null; exchange?: string; category?: string } | null;
}
const KIND: Record<string, string> = { LIMIT: 'Limit', STOP_LOSS: 'Stop-loss', TAKE_PROFIT: 'Take-profit' };

/**
 * Change a waiting limit / stop-loss / take-profit order before it fills: move its price (and lots) to suit the
 * trader's plan, or cancel it. The order keeps waiting until the price reaches the new level.
 */
export function ModifyOrderDialog({ o, onClose, onDone }: { o: PendingOrder; onClose: () => void; onDone: () => void }) {
  const trig = o.type !== 'LIMIT';
  const [price, setPrice] = useState((trig ? o.triggerPrice : o.limitPrice) ?? '');
  const [qty, setQty] = useState(String(o.quantity));
  const [busy, setBusy] = useState<'save' | 'cancel' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();
  const q = useLiveQuotes(o.instrumentId ? [o.instrumentId] : [])[o.instrumentId ?? ''];
  const valid = /^\d+(\.\d{1,2})?$/.test(price) && Number(price) > 0 && /^\d+$/.test(qty) && Number(qty) > 0;
  const save = async () => {
    setBusy('save'); setErr(null);
    try {
      await gql(`mutation($o:ID!,$l:String,$tr:String,$q:Int){ modifyOrder(orderId:$o, limitPrice:$l, triggerPrice:$tr, quantity:$q){ id } }`,
        { o: o.id, l: trig ? undefined : price, tr: trig ? price : undefined, q: Number(qty) });
      toast('Order modified'); onDone();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };
  const cancel = async () => {
    setBusy('cancel'); setErr(null);
    try { await gql(`mutation($id:ID!){ cancelOrder(orderId:$id){ id } }`, { id: o.id }); toast('Order cancelled'); onDone(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };
  const fires = trig
    ? `The order fires when the LTP ${(o.side === 'SELL') === (o.type === 'STOP_LOSS') ? 'falls to' : 'rises to'} this price.`
    : `The order fills when the price is ${o.side === 'BUY' ? 'at or below' : 'at or above'} this price.`;
  return (
    <Dialog title={`Modify order · ${scriptTitle(o.instrument)}`} size="sm" onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); if (valid && !busy) void save(); }}>
        <div><ScriptName i={o.instrument} size="sm" /><div className="t3 sm">{o.side === 'BUY' ? 'Buy' : 'Sell'} · {KIND[o.type] ?? o.type} · waiting</div></div>
        {q && <div className="t2 sm num">LTP ₹{inr(q.ltp)} · Bid ₹{inr(q.bid)} · Ask ₹{inr(q.ask)}</div>}
        <div className="field">
          <label htmlFor="mo-price">{trig ? 'Trigger price' : 'Limit price'}</label>
          <input id="mo-price" className="input num" inputMode="decimal" autoFocus value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))} />
        </div>
        <div className="field">
          <label htmlFor="mo-qty">Lots</label>
          <input id="mo-qty" className="input num" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))} />
        </div>
        <p className="t3 sm">{fires}</p>
        {err && <div className="notice err" role="alert"><span>{err}</span></div>}
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn-danger grow" disabled={!!busy} onClick={() => void cancel()}>{busy === 'cancel' ? 'Cancelling…' : 'Cancel order'}</button>
          <button type="submit" className="btn btn-primary grow" disabled={!valid || !!busy}>{busy === 'save' ? 'Saving…' : 'Save changes'}</button>
        </div>
      </form>
    </Dialog>
  );
}
