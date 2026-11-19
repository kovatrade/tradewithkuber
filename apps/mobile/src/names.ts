/** Readable script names (same rules as the web portal's lib/format.ts fullName). */
const COMMODITY_NAMES: Record<string, string> = {
  GOLD: 'Gold',
  GOLDM: 'Gold Mini',
  GOLDPETAL: 'Gold Petal',
  GOLDGUINEA: 'Gold Guinea',
  GOLDTEN: 'Gold Ten',
  SILVER: 'Silver',
  SILVERM: 'Silver Mini',
  SILVERMIC: 'Silver Micro',
  CRUDEOIL: 'Crude Oil',
  CRUDEOILM: 'Crude Oil Mini',
  NATURALGAS: 'Natural Gas',
  NATGASMINI: 'Natural Gas Mini',
  COPPER: 'Copper',
  COPPERM: 'Copper Mini',
  ZINC: 'Zinc',
  ZINCMINI: 'Zinc Mini',
  LEAD: 'Lead',
  LEADMINI: 'Lead Mini',
  ALUMINIUM: 'Aluminium',
  ALUMINI: 'Aluminium Mini',
  KAPAS: 'Kapas (Cotton)',
  MENTHAOIL: 'Mentha Oil',
  COTTONCNDY: 'Cotton Candy',
  RUBBER: 'Rubber',
  'NG-COMEX': 'Natural Gas',
  'GC-COMEX': 'Gold (COMEX)',
  'SI-COMEX': 'Silver (COMEX)',
  'CL-COMEX': 'Crude Oil WTI',
  'HG-COMEX': 'Copper (COMEX)',
  BTCUSD: 'Bitcoin',
  ETHUSD: 'Ethereum',
  SOLUSD: 'Solana',
  XRPUSD: 'XRP (Ripple)',
  BNBUSD: 'BNB',
  DOGEUSD: 'Dogecoin',
  AAPL: 'Apple Inc.',
  MSFT: 'Microsoft Corporation',
  NVDA: 'Nvidia Corporation',
  TSLA: 'Tesla Inc.',
  AMZN: 'Amazon.com Inc.',
  GOOGL: 'Alphabet Inc. (Google)',
  META: 'Meta Platforms Inc.',
  SPX: 'S&P 500 Index',
  NDX: 'Nasdaq 100 Index',
  DJI: 'Dow Jones Industrial Average',
  RUT: 'Russell 2000 Index',
  'USDINR-FUT': 'US Dollar / Indian Rupee',
  'EURINR-FUT': 'Euro / Indian Rupee',
  'GBPINR-FUT': 'British Pound / Indian Rupee',
  'JPYINR-FUT': 'Japanese Yen / Indian Rupee',
  EURUSD: 'Euro / US Dollar',
  GBPUSD: 'British Pound / US Dollar',
  USDJPY: 'US Dollar / Japanese Yen',
  NIFTY: 'Nifty 50 Index',
  BANKNIFTY: 'Nifty Bank Index',
  FINNIFTY: 'Nifty Financial Services',
};

const baseSym = (s: string) => (/^[A-Z&]+/.exec(s.toUpperCase())?.[0] ?? s.toUpperCase());
const OPTION_RE = /^([A-Z]+?)(\d+)(CE|PE)$/;

export function fullName(inst?: { symbol?: string; name?: string } | null): string {
  if (!inst) return '';
  const sym = (inst.symbol ?? '').toUpperCase();
  if (COMMODITY_NAMES[sym]) return COMMODITY_NAMES[sym];

  const opt = OPTION_RE.exec(sym);
  if (opt) {
    const under = COMMODITY_NAMES[opt[1]]?.replace(/ Index$/, '') || opt[1];
    return `${under} ${opt[2]} ${opt[3] === 'CE' ? 'Call' : 'Put'}`;
  }

  const b = baseSym(sym);
  if (COMMODITY_NAMES[b]) return COMMODITY_NAMES[b];
  if (inst.name) {
    let n = inst.name.replace(/\s*\((MCX|NSE|BSE)\)\s*/gi, '').trim();
    n = n.replace(/\s*—\s*.*$/, '').trim(); // "ABB India — Nov 26 FUT 10" → "ABB India" (expiry is shown on its own)
    n = n.replace(/\s+(NOV|DEC|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT)\s+FUT$/gi, '').trim();
    if (n && n !== sym && !/^[A-Z0-9_\-]+$/.test(n)) return n;
  }
  return inst.name || inst.symbol || '';
}

/** Expiry as shown next to a script name, e.g. 24 Nov 26 (IST). */
export const expiryLabel = (d?: string | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'Asia/Kolkata' }) : '');

/** The market badge next to a script name: MCX, NSE, FOREX, CRYPTO ... */
export const marketOf = (i?: { exchange?: string; category?: string } | null) =>
  !i ? '' : i.category === 'CRYPTO' ? 'CRYPTO' : i.category === 'FOREX' ? 'FOREX' : i.exchange ?? '';

/** One-line text form of a script (for sheet titles, toasts): "GOLD MINI 04 Dec 26". */
export const scriptTitle = (i?: { symbol?: string; name?: string; expiry?: string | null } | null) =>
  !i ? '—' : [fullName(i).toUpperCase(), expiryLabel(i.expiry)].filter(Boolean).join(' ');
