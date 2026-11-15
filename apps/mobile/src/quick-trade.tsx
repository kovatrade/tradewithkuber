/**
 * Marketwatch-style trading on mobile (as in the client's reference app):
 *  - QuickTradeSheet: tap an instrument row → bid/ask with low/high, Market/Limit/SL, lots, SELL/BUY,
 *    Chart / Market Depth / Info, OHLC and the contract numbers.
 *  - TradeBook: the "Trade" list with Success / Pending / Rejected, search, deal P&L and how long it was held;
 *    tap a trade for its details and "Repeat order".
 * Every figure shown comes from the server; nothing is filled in with sample numbers.
 */
import { router } from 'expo-router';
import { memo, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { gql, newKey } from './api';
import { tradeFeedback } from './prefs';
import { useLiveQuotes, type Quote } from './screens';
import { inr, ohlcTone, R, S, shortSymbol, toneOfValue, useTheme } from './theme';
import { Badge, Button, Chips, DateField, Empty, ErrorState, Field, Flash, LotStepper, Notice, Row, SearchBox, Sheet, Skeleton, Spread, T, Tabs, tap, toast, useQuery, VList } from './ui';
import { Icon } from './icons';

type Side = 'BUY' | 'SELL';
type OType = 'MARKET' | 'LIMIT' | 'STOP_LOSS';
interface Inst { id: string; symbol: string; name: string; exchange: string; segment: string; expiry?: string; lotSize: number; tickSize: string; lotClass?: string; lotLabel?: string; category?: string }
interface Rules { minQty: number; maxQtyPerOrder: number; maxQtyPerInstrument: number; brokeragePerLot?: string; brokeragePerMegaLot?: string; sessions: { exchange: string; isOpen: boolean; message?: string }[] }
interface Extra { open?: string; close?: string; volume?: string; avgPrice?: string }

/** "Gold Mini Dec 04": the instrument name with its expiry, like the reference app. */
export const titleOf = (i: { name: string; symbol: string; expiry?: string }) =>
  `${i.name.replace(/ — .*/, '').replace(/\s*\(.*\)\s*$/, '') || shortSymbol(i.symbol)}${i.expiry ? ` ${new Date(i.expiry).toLocaleDateString('en-IN', { month: 'short', day: '2-digit' })}` : ''}`;
const clock = (d?: string | Date) => (d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }) : '—');
const val = (v?: string | number | null) => (v === undefined || v === null || v === '' ? '—' : String(v));

/* ============================================================== quick trade sheet */
export function QuickTradeSheet({ instrumentId, initialSide, initialQty, onClose }: { instrumentId: string; initialSide?: Side; initialQty?: number; onClose: () => void }) {
  const t = useTheme();
  const inst = useQuery<{ instrument: Inst }>(`query($id:ID!){ instrument(id:$id){ id symbol name exchange segment expiry lotSize tickSize lotClass lotLabel category } }`, { id: instrumentId });
  const rules = useQuery<{ tradingRules: Rules }>(`{ tradingRules { minQty maxQtyPerOrder maxQtyPerInstrument brokeragePerLot brokeragePerMegaLot sessions { exchange isOpen message } } }`);
  const extra = useQuery<{ quotes: Extra[] }>(`query($i:[ID!]!){ quotes(instrumentIds:$i){ open close volume avgPrice } }`, { i: [instrumentId] }, 5000);
  const q = useLiveQuotes([instrumentId])[instrumentId];
  const x = extra.data?.quotes[0];
  const i = inst.data?.instrument;
  const r = rules.data?.tradingRules;
  const [type, setType] = useState<OType>('MARKET');
  const [qty, setQty] = useState(String(initialQty ?? 1));
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState<Side | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [key, setKey] = useState(newKey);
  useEffect(() => { setKey(newKey()); }, [type, qty, price]);
  const n = Number(qty);
  const session = i && r ? r.sessions.find((s) => s.exchange === i.exchange) : undefined;
  const qtyErr = !qty ? 'Enter lots' : !Number.isInteger(n) || n <= 0 ? 'Whole lots only' : r && n > r.maxQtyPerOrder ? `Max ${r.maxQtyPerOrder} lots per order` : null;
  const priceErr = type === 'MARKET' ? null : !/^\d+(\.\d{1,2})?$/.test(price) ? 'Enter a price' : null;

  const place = async (side: Side) => {
    if (!i || qtyErr || priceErr) return;
    setBusy(side); setErr(null); tap();
    try {
      const d = await gql<{ placeOrder: { status: string; fillPrice?: string; rejectReason?: string } }>(
        `mutation($i:PlaceOrderInput!){ placeOrder(input:$i){ status fillPrice rejectReason } }`,
        { i: { instrumentId: i.id, side, type, quantity: n, limitPrice: type === 'LIMIT' ? price : undefined, triggerPrice: type === 'STOP_LOSS' ? price : undefined, idempotencyKey: key } },
      );
      const o = d.placeOrder;
      setKey(newKey());
      if (o.status === 'REJECTED') { tradeFeedback('reject'); setErr(o.rejectReason ?? 'Rejected'); return; }
      tradeFeedback(o.status === 'FILLED' ? 'fill' : 'placed');
      toast(o.status === 'FILLED' ? `${side === 'BUY' ? 'Bought' : 'Sold'} ${n} lot${n > 1 ? 's' : ''} at ₹${inr(o.fillPrice)}` : `${side === 'BUY' ? 'Buy' : 'Sell'} order placed`);
      onClose();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };

  const box = (side: Side) => {
    const v = side === 'BUY' ? q?.ask : q?.bid;
    return (
      <Pressable onPress={() => void place(side)} disabled={!!busy || !i} accessibilityRole="button" accessibilityLabel={`${side === 'BUY' ? 'Buy' : 'Sell'} at ${v ?? ''}`} style={{ alignItems: 'center', gap: 2 }}>
        <Flash over value={v} style={{ borderRadius: R.md, overflow: 'hidden' }}>
          <View style={{ minWidth: 92, paddingVertical: 6, paddingHorizontal: 8, backgroundColor: side === 'BUY' ? t.posSoft : t.negSoft, alignItems: 'center' }}>
            <T v="num" c={side === 'BUY' ? 'pos' : 'neg'}>{inr(v)}</T>
          </View>
        </Flash>
        <T v="xs">{side === 'BUY' ? `H: ${inr(q?.high)}` : `L: ${inr(q?.low)}`}</T>
      </Pressable>
    );
  };
  const go = (path: string) => { onClose(); router.push(path as never); };

  return (
    <Sheet visible title={i ? titleOf(i) : '…'} sub={i ? `${shortSymbol(i.symbol)} · ${i.category === 'FOREX' ? 'Forex' : i.exchange}${i.lotLabel ? ` · 1 lot = ${i.lotLabel}` : ''}` : undefined} onClose={onClose}>
      {inst.error ? <Notice tone="err">{inst.error}</Notice> : null}
      <Spread style={{ alignItems: 'center' }}>
        <View style={{ gap: 2 }}>
          <T v="numLg" c={toneOfValue(q?.change) === 'neg' ? 'neg' : 'pos'}>{inr(q?.ltp)}</T>
          <T v="sm" c={toneOfValue(q?.change) === 'neg' ? 'neg' : 'pos'}>{inr(q?.change, true)} ({inr(q?.changePct, true)}%)</T>
        </View>
        <Row gap={S[2]}>{box('SELL')}{box('BUY')}</Row>
      </Spread>

      <Chips fill value={type} onChange={(v) => { setType(v); setPrice(''); }} items={[{ k: 'MARKET', label: 'Market' }, { k: 'LIMIT', label: 'Limit' }, { k: 'STOP_LOSS', label: 'SL' }]} />
      <Row style={{ alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: 4 }}>
          <T v="sm" c="text2" w="500">Lots</T>
          <LotStepper value={qty} onChange={setQty} />
          {qtyErr ? <T v="xs" c="neg">{qtyErr}</T> : null}
        </View>
        {type !== 'MARKET' && (
          <View style={{ flex: 1 }}>
            <Field label={type === 'LIMIT' ? 'Limit price' : 'Trigger (LTP)'} prefix="₹" keyboardType="decimal-pad" value={price} placeholder={q?.ltp} onChangeText={(v) => setPrice(v.replace(/[^\d.]/g, ''))} error={price ? priceErr : null} />
          </View>
        )}
      </Row>
      {session && !session.isOpen && session.message ? <Notice tone="warn">{session.message}</Notice> : null}
      {err ? <Notice tone="err">{err}</Notice> : null}
      <Row>
        <View style={{ flex: 1 }}><Button block size="lg" kind="sell" title="SELL" busy={busy === 'SELL'} disabled={!i || !q || !!qtyErr || !!priceErr || !!busy} onPress={() => void place('SELL')} /></View>
        <View style={{ flex: 1 }}><Button block size="lg" kind="buy" title="BUY" busy={busy === 'BUY'} disabled={!i || !q || !!qtyErr || !!priceErr || !!busy} onPress={() => void place('BUY')} /></View>
      </Row>

      <Row gap={S[2]}>
        <View style={{ flex: 1 }}><Button block size="sm" icon="trend" title="Chart" onPress={() => go(`/instrument/${instrumentId}?view=chart`)} /></View>
        <View style={{ flex: 1.3 }}><Button block size="sm" title="Market Depth" onPress={() => go(`/instrument/${instrumentId}?view=depth`)} /></View>
        <View style={{ flex: 1 }}><Button block size="sm" icon="info" title="Info" onPress={() => go(`/instrument/${instrumentId}?view=details`)} /></View>
      </Row>

      <View style={{ flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: t.line, paddingVertical: S[2] }}>
        {([['Open', x?.open], ['High', q?.high], ['Low', q?.low], ['Close', x?.close]] as const).map(([k, v], idx) => (
          <View key={k} style={{ flex: 1, alignItems: 'center', borderLeftWidth: idx ? StyleSheet.hairlineWidth : 0, borderColor: t.line2 }}>
            <T v="sm" c="text2">{k}</T><T v="num" w="600" c={ohlcTone(k, v, q?.ltp, x?.close)}>{inr(v)}</T>
          </View>
        ))}
      </View>
      <Grid rows={[
        ['LTP', inr(q?.ltp), 'Time', clock(q?.ts)],
        ['Volume', val(x?.volume), 'Avg. price', x?.avgPrice ? inr(x.avgPrice) : '—'],
        ['Max lots (open)', val(r?.maxQtyPerInstrument), 'Max lots / order', val(r?.maxQtyPerOrder)],
        ['Min lots', val(r?.minQty), 'Lot step', '1'],
        ['Lot size', i ? (i.lotLabel ?? String(i.lotSize)) : '—', 'Lot type', i?.category === 'MCX' ? (i.lotClass === 'MEGA' ? 'Mega' : 'Mini') : '—'],
      ]} />
    </Sheet>
  );
}

/** Two label/value pairs per row, like the reference app's details table. */
function Grid({ rows }: { rows: [string, string, string, string][] }) {
  const t = useTheme();
  return (
    <View>
      {rows.map((r, idx) => (
        <View key={idx} style={{ flexDirection: 'row', gap: S[3], paddingVertical: S[2], backgroundColor: idx % 2 ? 'transparent' : t.bg2, paddingHorizontal: S[2], borderRadius: R.sm }}>
          <Spread style={{ flex: 1 }}><T v="sm" c="text2">{r[0]}</T><T v="sm" w="600">{r[1]}</T></Spread>
          <Spread style={{ flex: 1 }}><T v="sm" c="text2">{r[2]}</T><T v="sm" w="600">{r[3]}</T></Spread>
        </View>
      ))}
    </View>
  );
}

/* ============================================================== trade book */
interface Trade {
  id: string; side: Side; type: string; quantity: number; status: string; limitPrice?: string; triggerPrice?: string; fillPrice?: string;
  rejectReason?: string; createdAt: string; filledAt?: string; realizedPnl?: string; brokerage?: string; heldSeconds?: number; username?: string;
  instrumentId: string; instrument?: { id: string; symbol: string; name: string; expiry?: string; exchange?: string };
}
const TRADE_FIELDS = 'id side type quantity status limitPrice triggerPrice fillPrice rejectReason createdAt filledAt realizedPnl brokerage heldSeconds username instrumentId instrument{ id symbol name expiry exchange }';
const TYPE_LABEL: Record<string, string> = { MARKET: 'Market', LIMIT: 'Limit', STOP_LOSS: 'Stop-loss', TAKE_PROFIT: 'Take-profit' };
type BookTab = 'success' | 'pending' | 'rejected';
const BOOK: Record<BookTab, { label: string; s: string[] }> = { success: { label: 'Success', s: ['FILLED'] }, pending: { label: 'Pending', s: ['OPEN'] }, rejected: { label: 'Rejected', s: ['REJECTED', 'CANCELLED'] } };

/** "2 hours 12 minutes", "45 seconds". */
export function heldText(sec?: number) {
  if (sec === undefined || sec === null) return '';
  if (sec < 60) return `${sec} second${sec === 1 ? '' : 's'}`;
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  return [d ? `${d} day${d > 1 ? 's' : ''}` : '', h ? `${h} hour${h > 1 ? 's' : ''}` : '', !d && m ? `${m} minute${m > 1 ? 's' : ''}` : ''].filter(Boolean).join(' ') || '1 minute';
}
const stamp = (d: string) => new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });

const TradeRow = memo(function TradeRow({ o, onPress }: { o: Trade; onPress: (o: Trade) => void }) {
  const t = useTheme();
  const px = o.fillPrice ?? o.limitPrice ?? o.triggerPrice;
  return (
    <Pressable onPress={() => onPress(o)} accessibilityRole="button" accessibilityLabel={`${o.side} ${o.quantity} ${o.instrument?.symbol ?? ''}`} style={({ pressed }) => ({ paddingVertical: S[3], gap: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.line, backgroundColor: pressed ? t.bg2 : 'transparent' })}>
      <Spread><T w="700" numberOfLines={1} style={{ flex: 1 }}>{o.instrument ? titleOf(o.instrument) : '—'}</T><T v="num" c={o.side === 'BUY' ? 'pos' : 'neg'}>{inr(px)}</T></Spread>
      <Spread>
        <Row gap={6}><Badge text={o.side} tone={o.side === 'BUY' ? 'ok' : 'bad'} /><T v="sm" c="text2">{o.quantity} lot{o.quantity > 1 ? 's' : ''}</T>{o.type !== 'MARKET' ? <T v="xs">{TYPE_LABEL[o.type]}</T> : null}</Row>
        <T v="xs">{stamp(o.filledAt ?? o.createdAt)}</T>
      </Spread>
      {o.username ? <T v="xs">{o.username}</T> : null}
      {o.realizedPnl ? (
        <Spread>
          <Row gap={4}><T v="sm" c="text2">Deals:</T><T v="num" c={toneOfValue(o.realizedPnl) === 'neg' ? 'neg' : 'pos'}>{inr(o.realizedPnl, true)}</T></Row>
          {o.heldSeconds !== undefined ? <T v="xs" style={{ textDecorationLine: 'underline' }}>{heldText(o.heldSeconds)}</T> : null}
        </Spread>
      ) : null}
      {o.status === 'REJECTED' && o.rejectReason ? <T v="xs" c="neg">{o.rejectReason}</T> : null}
    </Pressable>
  );
});

/* ---------------------------------------------------------------- Trade tab: one list + filters */
const ymdIst = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const timeOnly = (d: string) => new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
/** "03h 02m" for how long a closed trade was held. */
const heldShort = (sec?: number) => (sec === undefined || sec === null ? '' : `${String(Math.floor(sec / 3600)).padStart(2, '0')}h ${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}m`);
interface TradeFilter { from: string; to: string; exchange: string; script: string }

/** One trade row like the reference app: name · price / time · side qty / P&L · held time. */
const TradeLine = memo(function TradeLine({ o, onPress }: { o: Trade; onPress: (o: Trade) => void }) {
  const t = useTheme();
  const px = o.fillPrice ?? o.limitPrice ?? o.triggerPrice;
  const sideTone = o.side === 'BUY' ? 'pos' : 'neg';
  const kind = o.type === 'STOP_LOSS' ? ' SL' : o.type === 'TAKE_PROFIT' ? ' TP' : o.type === 'LIMIT' && o.status === 'OPEN' ? ' LMT' : '';
  return (
    <Pressable onPress={() => onPress(o)} accessibilityRole="button" accessibilityLabel={`${o.side} ${o.quantity} ${o.instrument?.symbol ?? ''}`} style={({ pressed }) => ({ paddingVertical: 10, gap: 3, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.line, backgroundColor: pressed ? t.bg2 : 'transparent' })}>
      <Spread>
        <T w="600" numberOfLines={1} style={{ flex: 1, fontSize: 15 }}>{o.instrument ? titleOf(o.instrument) : '—'}</T>
        <T v="num" c={sideTone} style={{ fontSize: 15 }}>{inr(px)}</T>
      </Spread>
      <Spread>
        <Row gap={4} style={{ flex: 1 }}><Icon name="clock" size={13} color={t.text3} /><T v="xs" c="text2">{timeOnly(o.filledAt ?? o.createdAt)}</T>{o.status === 'OPEN' ? <Badge text="Pending" tone="warn" /> : null}</Row>
        <T v="num" c={sideTone} style={{ fontSize: 13 }}>{o.side}{kind} {o.quantity.toFixed(1)}</T>
      </Spread>
      {o.realizedPnl ? (
        <Spread>
          <Row gap={4}><Icon name="briefcase" size={13} color={t.text3} /><T v="num" c={toneOfValue(o.realizedPnl) === 'neg' ? 'neg' : 'pos'} style={{ fontSize: 13 }}>{`${Number(o.realizedPnl) > 0 ? '+' : ''}${inr(o.realizedPnl)}`}</T></Row>
          {o.heldSeconds !== undefined ? <T v="xs" c="text2" style={{ textDecorationLine: 'underline' }}>{heldShort(o.heldSeconds)}</T> : null}
        </Spread>
      ) : null}
    </Pressable>
  );
});

/**
 * Trade tab: executed and pending trades in one list (no Success / Pending tabs), newest first, with a search box
 * and a filter sheet (date range, exchange, script).
 */
export function TradeList() {
  const t = useTheme();
  const today = ymdIst(new Date());
  const empty0: TradeFilter = { from: ymdIst(new Date(Date.now() - 30 * 86_400_000)), to: today, exchange: '', script: '' };
  const [q, setQ] = useState('');
  const [f, setF] = useState<TradeFilter>(empty0);
  const [draft, setDraft] = useState<TradeFilter | null>(null);
  const { data, error, loading, refetch } = useQuery<{ orders: Trade[] }>(`query($s:[OrderStatus!]){ orders(status:$s, limit:300){ ${TRADE_FIELDS} } }`, { s: ['FILLED', 'OPEN'] }, 5000);
  const [open, setOpen] = useState<Trade | null>(null);
  const [repeat, setRepeat] = useState<Trade | null>(null);
  const all = data?.orders ?? [];
  const exchanges = useMemo(() => [...new Set(all.map((o) => o.instrument?.exchange).filter(Boolean) as string[])].sort(), [all]);
  const scripts = useMemo(() => [...new Set(all.filter((o) => !draft?.exchange || o.instrument?.exchange === draft.exchange).map((o) => shortSymbol(o.instrument?.symbol ?? '')).filter(Boolean))].sort(), [all, draft?.exchange]);
  const list = useMemo(() => all
    .filter((o) => {
      const day = ymdIst(new Date(o.filledAt ?? o.createdAt));
      if (f.from && day < f.from) return false;
      if (f.to && day > f.to) return false;
      if (f.exchange && o.instrument?.exchange !== f.exchange) return false;
      if (f.script && shortSymbol(o.instrument?.symbol ?? '') !== f.script) return false;
      const s = q.trim().toLowerCase();
      return !s || `${o.instrument?.symbol ?? ''} ${o.instrument?.name ?? ''}`.toLowerCase().includes(s);
    })
    .sort((a, b) => new Date(b.filledAt ?? b.createdAt).getTime() - new Date(a.filledAt ?? a.createdAt).getTime()), [all, f, q]);
  const active = f.exchange || f.script || f.from !== empty0.from || f.to !== empty0.to;
  const top = (
    <Row gap={8} style={{ alignItems: 'center', marginBottom: 4 }}>
      <View style={{ flex: 1 }}><SearchBox value={q} onChangeText={setQ} placeholder="Search trades" /></View>
      <Pressable onPress={() => setDraft(f)} accessibilityRole="button" accessibilityLabel={`Filter trades${active ? ', filters on' : ''}`} hitSlop={6}
        style={({ pressed }) => ({ width: 44, height: 44, borderRadius: R.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: active ? t.brand : t.line2, backgroundColor: pressed ? t.bg3 : active ? t.brandSoft : t.bg })}>
        <Icon name="sliders" size={20} color={active ? t.brand : t.text} />
        {active ? <View style={{ position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: 4, backgroundColor: t.brand }} /> : null}
      </Pressable>
    </Row>
  );
  const empty = loading && !data ? <Skeleton /> : error && !data ? <ErrorState error={error} retry={refetch} />
    : <Empty icon="list" title={all.length ? 'No trades match' : 'No trades yet'}>{all.length ? 'Change the filter or search.' : 'Your executed and pending trades show up here.'}</Empty>;
  return (
    <>
      <VList data={list} keyOf={(o) => o.id} header={top} empty={empty} render={(o) => <TradeLine o={o} onPress={setOpen} />} />
      {draft && (
        <Sheet visible title="Filter trades" onClose={() => setDraft(null)}>
          <T v="sm" c="text2" w="600">Date range</T>
          <Row style={{ alignItems: 'flex-start' }}>
            <DateField label="From" value={draft.from} max={draft.to || today} onChange={(v) => setDraft({ ...draft, from: v })} />
            <DateField label="To" value={draft.to} min={draft.from} max={today} onChange={(v) => setDraft({ ...draft, to: v })} />
          </Row>
          <T v="sm" c="text2" w="600">Exchange</T>
          <Chips value={draft.exchange} onChange={(v) => setDraft({ ...draft, exchange: v, script: '' })} items={[{ k: '', label: 'All' }, ...exchanges.map((e) => ({ k: e, label: e }))]} />
          <T v="sm" c="text2" w="600">Script</T>
          {scripts.length ? <Chips value={draft.script} onChange={(v) => setDraft({ ...draft, script: v })} items={[{ k: '', label: 'All' }, ...scripts.map((s) => ({ k: s, label: s }))]} /> : <T v="xs">No scripts in your trades yet.</T>}
          <Row>
            <Button block icon="refresh" title="Reset" onPress={() => { setF(empty0); setDraft(null); }} />
            <Button block kind="primary" icon="check" title="Done" onPress={() => { setF(draft); setDraft(null); }} />
          </Row>
        </Sheet>
      )}
      {open && <TradeDetail o={open} onClose={() => setOpen(null)} onRepeat={() => { setRepeat(open); setOpen(null); }} onCancelled={() => { setOpen(null); void refetch(); }} />}
      {repeat && <QuickTradeSheet instrumentId={repeat.instrumentId} initialSide={repeat.side} initialQty={repeat.quantity} onClose={() => { setRepeat(null); void refetch(); }} />}
    </>
  );
}

export function TradeBook({ header }: { header?: React.ReactNode }) {
  const [tab, setTab] = useState<BookTab>('success');
  const [q, setQ] = useState('');
  const [side, setSide] = useState<'' | Side>('');
  const { data, error, loading, refetch } = useQuery<{ orders: Trade[] }>(`query($s:[OrderStatus!]){ orders(status:$s, limit:200){ ${TRADE_FIELDS} } }`, { s: BOOK[tab].s }, tab === 'pending' ? 3000 : 8000);
  const [open, setOpen] = useState<Trade | null>(null);
  const [repeat, setRepeat] = useState<Trade | null>(null);
  const list = useMemo(() => (data?.orders ?? []).filter((o) => (!side || o.side === side) && (!q.trim() || `${o.instrument?.symbol ?? ''} ${o.instrument?.name ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()))), [data, q, side]);
  const top = (
    <View style={{ gap: S[3] }}>
      {header}
      <Tabs value={tab} onChange={setTab} items={(Object.keys(BOOK) as BookTab[]).map((k) => ({ k, label: BOOK[k].label }))} />
      <SearchBox value={q} onChangeText={setQ} placeholder="Search" />
      <Chips value={side} onChange={setSide} items={[{ k: '', label: 'All' }, { k: 'BUY', label: 'Buy' }, { k: 'SELL', label: 'Sell' }]} />
    </View>
  );
  const empty = loading && !data ? <Skeleton /> : error && !data ? <ErrorState error={error} retry={refetch} />
    : <Empty icon="list" title={tab === 'success' ? 'No trades yet' : tab === 'pending' ? 'No pending orders' : 'Nothing rejected'}>{tab === 'pending' ? 'Limit and stop-loss orders wait here until the price reaches them.' : 'Your executed trades show up here.'}</Empty>;
  return (
    <>
      <VList data={list} keyOf={(o) => o.id} header={top} empty={empty} render={(o) => <TradeRow o={o} onPress={setOpen} />} />
      {open && <TradeDetail o={open} onClose={() => setOpen(null)} onRepeat={() => { setRepeat(open); setOpen(null); }} onCancelled={() => { setOpen(null); void refetch(); }} />}
      {repeat && <QuickTradeSheet instrumentId={repeat.instrumentId} initialSide={repeat.side} initialQty={repeat.quantity} onClose={() => { setRepeat(null); void refetch(); }} />}
    </>
  );
}

function TradeDetail({ o, onClose, onRepeat, onCancelled }: { o: Trade; onClose: () => void; onRepeat: () => void; onCancelled: () => void }) {
  const [busy, setBusy] = useState(false);
  const cancel = async () => {
    setBusy(true);
    try { await gql(`mutation($id:ID!){ cancelOrder(orderId:$id){ id } }`, { id: o.id }); toast('Order cancelled'); onCancelled(); }
    catch (e) { toast((e as Error).message, true); } finally { setBusy(false); }
  };
  const rows: [string, string][] = [
    ['UserName', o.username ?? '—'],
    ['Order time', stamp(o.createdAt)],
    ...(o.filledAt ? [['Executed', stamp(o.filledAt)] as [string, string]] : []),
    ['Symbol', o.instrument ? shortSymbol(o.instrument.symbol) : '—'],
    ['Order type', TYPE_LABEL[o.type] ?? o.type],
    ['Side', o.side === 'BUY' ? 'Buy' : 'Sell'],
    ['Deals (P&L)', o.realizedPnl ? `₹${inr(o.realizedPnl, true)}` : '—'],
    ['Quantity', `${o.quantity} lot${o.quantity > 1 ? 's' : ''}`],
    ['Price', o.fillPrice ? `₹${inr(o.fillPrice)}` : '—'],
    ['Ref price', `₹${inr(o.limitPrice ?? o.triggerPrice ?? o.fillPrice)}`],
    ...(o.heldSeconds !== undefined ? [['Held for', heldText(o.heldSeconds)] as [string, string]] : []),
    ['Status', o.status === 'FILLED' ? 'Executed' : o.status.charAt(0) + o.status.slice(1).toLowerCase()],
  ];
  const t = useTheme();
  return (
    <Sheet visible title={o.instrument ? titleOf(o.instrument) : 'Order'} sub={`${o.side} ${o.quantity} · ${stamp(o.filledAt ?? o.createdAt)}`} onClose={onClose}>
      <Button block size="lg" kind="buy" title="Repeat order" onPress={onRepeat} />
      {o.status === 'OPEN' ? <Button block kind="sell" title="Cancel order" busy={busy} onPress={() => void cancel()} /> : null}
      <View>
        {rows.map(([k, v], idx) => (
          <Spread key={k} style={{ paddingVertical: S[2], paddingHorizontal: S[2], backgroundColor: idx % 2 ? 'transparent' : t.bg2, borderRadius: R.sm }}>
            <T v="sm" c="text2">{k}</T><T v="sm" w="600">{v}</T>
          </Spread>
        ))}
      </View>
      {o.rejectReason ? <Notice tone="err">{o.rejectReason}</Notice> : null}
    </Sheet>
  );
}

export type { Quote };
