/**
 * How instruments are grouped and described in the apps.
 *
 * The 8 standard categories:
 * - FUTURES: Indian Equity & Index futures
 * - MCX: MCX Commodity futures
 * - OPTIONS: Index and Equity Call/Put options
 * - FOREX: Currency futures & pairs (USDINR, EURUSD, etc.)
 * - CRYPTO: Major cryptocurrencies (BTC, ETH, etc.)
 * - US_STOCK: US equities (AAPL, TSLA, NVDA, etc.)
 * - COMEX: COMEX commodities (Gold, Silver, Crude Oil)
 * - US_INDEX: US market indices (S&P 500, Nasdaq 100, Dow Jones)
 *
 * Lot label: what one lot is, in words ("100 g", "5 kg", "10 barrels", "1 BTC"), shown next to every instrument.
 */
export type Category =
  | 'FUTURES'
  | 'MCX'
  | 'OPTIONS'
  | 'FOREX'
  | 'CRYPTO'
  | 'US_STOCK'
  | 'COMEX'
  | 'US_INDEX';

export function categoryOf(exchange: string, segment: string, symbol?: string): Category {
  const ex = (exchange ?? '').toUpperCase();
  const seg = (segment ?? '').toUpperCase();
  const sym = (symbol ?? '').toUpperCase();

  if (ex === 'MCX') return 'MCX';
  if (ex === 'COMEX') return 'COMEX';
  if (ex === 'CRYPTO') return 'CRYPTO';
  if (ex === 'NASDAQ' || ex === 'NYSE' || ex === 'US_STOCK' || seg === 'US_STOCK') return 'US_STOCK';
  if (ex === 'US_INDEX' || seg === 'US_INDEX') return 'US_INDEX';
  if (ex === 'CDS' || ex === 'FOREX' || seg === 'CUR' || seg === 'FX') return 'FOREX';
  if (seg !== 'EQ' && (seg === 'OPT' || seg === 'OPTIONS' || seg === 'CE' || seg === 'PE' || /\d+(CE|PE)$/i.test(sym))) return 'OPTIONS';
  return 'FUTURES';
}

/** The underlying: the leading letters of the symbol (GOLDM-05Dec2026-FUT, GOLDM26NOVFUT → GOLDM). */
export const baseSymbol = (symbol: string) => (/^[A-Z&]+/.exec(symbol.toUpperCase())?.[0] ?? symbol.toUpperCase());

/**
 * The MCX scripts listed under "MCX" in Add script: 7 commodities, each as its full-size (Mega) and mini contract.
 * Value = the commodity it belongs to; the order here is the order shown.
 */
export const MCX_LISTED: Record<string, string> = {
  SILVER: 'SILVER', SILVERM: 'SILVER', GOLD: 'GOLD', GOLDM: 'GOLD', CRUDEOIL: 'CRUDEOIL', CRUDEOILM: 'CRUDEOIL',
  COPPER: 'COPPER', COPPERM: 'COPPER', LEAD: 'LEAD', LEADMINI: 'LEAD', ZINC: 'ZINC', ZINCMINI: 'ZINC', NATURALGAS: 'NATURALGAS', NATGASMINI: 'NATURALGAS',
};
const MCX_ORDER = ['SILVER', 'GOLD', 'CRUDEOIL', 'COPPER', 'LEAD', 'ZINC', 'NATURALGAS'];
/**
 * One contract per listed MCX script and lot class: the nearest expiry that is still open (rows must come sorted by
 * expiry, then symbol). Other MCX contracts are left out of the MCX list.
 */
export function uniqueMcx<T extends { symbol: string }>(rows: T[], lotClass?: string | null): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    const base = baseSymbol(r.symbol);
    if (!MCX_LISTED[base]) continue;
    // Mini or Mega comes from the contract itself (GOLD = Mega, GOLDM = Mini), not from a per-row setting, so the
    // nearest GOLD contract is always the one listed under Mega.
    if ((lotClass === 'MINI' || lotClass === 'MEGA') && defaultLotClass('MCX', base) !== lotClass) continue;
    if (seen.has(base)) continue;
    seen.add(base);
    out.push(r);
  }
  return out.sort((a, b) => MCX_ORDER.indexOf(MCX_LISTED[baseSymbol(a.symbol)]) - MCX_ORDER.indexOf(MCX_LISTED[baseSymbol(b.symbol)]));
}

/** MCX mini/micro versions are MINI; full-size MCX contracts are MEGA; everything else is MINI. */
const MCX_MINI = /^(GOLDM|GOLDPETAL|GOLDGUINEA|GOLDTEN|SILVERM|SILVERMIC|CRUDEOILM|NATGASMINI|ZINCMINI|LEADMINI|ALUMINI|COPPERM)$/;
export function defaultLotClass(exchange: string, symbol: string): 'MINI' | 'MEGA' {
  if (exchange !== 'MCX') return 'MINI';
  return MCX_MINI.test(baseSymbol(symbol)) ? 'MINI' : 'MEGA';
}

/** Contract size per lot, as published by MCX / NSE / exchanges. Unknown → empty. */
const LOT_LABEL: Record<string, string> = {
  GOLD: '1 kg', GOLDM: '100 g', GOLDGUINEA: '8 g', GOLDPETAL: '1 g',
  SILVER: '30 kg', SILVERM: '5 kg', SILVERMIC: '1 kg',
  CRUDEOIL: '100 barrels', CRUDEOILM: '10 barrels',
  NATURALGAS: '1,250 mmBtu', NATGASMINI: '250 mmBtu',
  COPPER: '2,500 kg', LEAD: '5 tonnes', ZINC: '5 tonnes',
  ZINCMINI: '1 tonne', LEADMINI: '1 tonne', ALUMINI: '1 tonne',
  USDINR: '1,000 USD', EURINR: '1,000 EUR', GBPINR: '1,000 GBP', JPYINR: '1,00,000 JPY',
  BTCUSD: '1 BTC', ETHUSD: '1 ETH', SOLUSD: '1 SOL',
  AAPL: '1 share', MSFT: '1 share', NVDA: '1 share', TSLA: '1 share', AMZN: '1 share',
  SPX: '1 unit', NDX: '1 unit', DJI: '1 unit',
};
export function defaultLotLabel(symbol: string): string | null {
  return LOT_LABEL[baseSymbol(symbol)] ?? null;
}

/**
 * MCX prices are quoted per unit (gold per 10 g, silver per kg, crude per barrel ...), while one lot is bigger, so
 * order value and P/L = price × multiplier × lots. GOLD (Mega, 1 kg, quoted per 10 g) = 100; GOLDM (Mini, 100 g) = 10;
 * SILVER (Mega, 30 kg, per kg) = 30; SILVERM (Mini, 5 kg) = 5. Everything else (non-MCX, unknown) = 1.
 */
const MCX_MULTIPLIER: Record<string, number> = {
  GOLD: 100, GOLDM: 10, GOLDGUINEA: 1, GOLDPETAL: 1, GOLDTEN: 1,
  SILVER: 30, SILVERM: 5, SILVERMIC: 1,
  CRUDEOIL: 100, CRUDEOILM: 10,
  NATURALGAS: 1250, NATGASMINI: 250,
  COPPER: 2500, LEAD: 5000, LEADMINI: 1000, ZINC: 5000, ZINCMINI: 1000, ALUMINIUM: 5000, ALUMINI: 1000,
};
export function priceMultiplier(exchange: string | null | undefined, symbol: string | null | undefined): number {
  if (exchange !== 'MCX' || !symbol) return 1;
  return MCX_MULTIPLIER[baseSymbol(symbol)] ?? 1;
}
