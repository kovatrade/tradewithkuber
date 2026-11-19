import { useState } from 'react';
import { View } from 'react-native';
import { gql } from './api';
import { scriptTitle } from './names';
import { useLiveQuotes } from './screens';
import { ScriptName } from './script-name';
import { inr } from './theme';
import { Button, Field, LotStepper, Notice, Row, Sheet, Spread, T, toast } from './ui';

export interface PendingOrder {
  id: string; type: string; side: string; quantity: number; limitPrice?: string | null; triggerPrice?: string | null;
  instrumentId?: string; instrument?: { symbol: string; name?: string; expiry?: string | null; exchange?: string } | null;
}

const KIND: Record<string, string> = { LIMIT: 'Limit', STOP_LOSS: 'Stop-loss', TAKE_PROFIT: 'Take-profit' };

/**
 * Change a pending limit / stop-loss / take-profit order before it fills: move its price (and lots) to suit the
 * trader's plan, or cancel it. The order keeps waiting until the price reaches the new level.
 */
export function ModifyOrderSheet({ o, onClose, onDone }: { o: PendingOrder; onClose: () => void; onDone: () => void }) {
  const trig = o.type !== 'LIMIT';
  const [price, setPrice] = useState((trig ? o.triggerPrice : o.limitPrice) ?? '');
  const [qty, setQty] = useState(String(o.quantity));
  const [busy, setBusy] = useState<'save' | 'cancel' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const q = useLiveQuotes(o.instrumentId ? [o.instrumentId] : [])[o.instrumentId ?? ''];
  const label = trig ? 'Trigger price' : 'Limit price';
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
  return (
    <Sheet visible title={`Modify ${scriptTitle(o.instrument)}`} titleNode={<View style={{ gap: 4 }}><T v="h2" w="800">Modify order</T><ScriptName i={o.instrument} /></View>}
      sub={`${o.side === 'BUY' ? 'Buy' : 'Sell'} · ${KIND[o.type] ?? o.type} · waiting`} onClose={onClose}>
      {q && <Spread><T v="sm" c="text2">Now</T><T v="num">LTP ₹{inr(q.ltp)} · Bid ₹{inr(q.bid)} · Ask ₹{inr(q.ask)}</T></Spread>}
      <Field label={label} prefix="₹" keyboardType="decimal-pad" value={price} onChangeText={(v) => setPrice(v.replace(/[^\d.]/g, ''))} />
      <LotStepper value={qty} onChange={setQty} />
      <T v="xs" c="text2">{trig
        ? `The order fires when the LTP ${o.side === 'SELL' ? (o.type === 'STOP_LOSS' ? 'falls to' : 'rises to') : (o.type === 'STOP_LOSS' ? 'rises to' : 'falls to')} this price.`
        : `The order fills when the price ${o.side === 'BUY' ? 'is at or below' : 'is at or above'} this price.`}</T>
      {err && <Notice tone="err">{err}</Notice>}
      <Row>
        <Button block kind="sell" title="Cancel order" busy={busy === 'cancel'} disabled={!!busy} onPress={() => void cancel()} />
        <Button block kind="primary" title="Save changes" busy={busy === 'save'} disabled={!valid || !!busy} onPress={() => void save()} />
      </Row>
    </Sheet>
  );
}
