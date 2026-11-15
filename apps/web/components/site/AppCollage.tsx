/**
 * Hero picture: an original collage of the practice app (watchlist, account, chart and positions), drawn in HTML so
 * it stays sharp. Figures are illustrative.
 */
const ROWS: [string, string, string, boolean][] = [
  ['GOLD MINI', '1,21,412', '+0.42%', true],
  ['SILVER MINI', '1,46,880', '+0.18%', true],
  ['CRUDE OIL', '5,302', '−0.61%', false],
  ['NATURAL GAS', '284.6', '+1.12%', true],
  ['COPPER', '903.4', '−0.22%', false],
];
const LINE = [40, 46, 43, 52, 49, 58, 55, 63, 60, 68, 66, 74, 71, 78];

export function AppCollage({ compact }: { compact?: boolean } = {}) {
  const pts = LINE.map((v, i) => `${(i / (LINE.length - 1)) * 300},${100 - v}`).join(' ');
  return (
    <div className={`ws-collage${compact ? ' ws-collage-compact' : ''}`} aria-hidden="true">
      <div className="ws-shot ws-shot-side">
        <p className="ws-shot-title">Watchlist</p>
        {ROWS.map(([n, p, c, up]) => (
          <div key={n} className="ws-shot-row"><span>{n}</span><span className={up ? 'ws-pos' : 'ws-neg'}>{p}<small>{c}</small></span></div>
        ))}
      </div>
      <div className="ws-shot ws-shot-main">
        <div className="ws-shot-bar"><span className="ws-shot-dot" /><span>Practice account</span><span className="ws-shot-tag">Virtual money</span></div>
        <div className="ws-shot-stats">
          <div><small>Balance</small><b>4,96,476</b></div>
          <div><small>Live P/L</small><b className="ws-pos">+2,140</b></div>
          <div><small>Booked</small><b className="ws-pos">+860</b></div>
        </div>
        <svg viewBox="0 0 300 70" className="ws-shot-line" preserveAspectRatio="none"><polyline points={pts} transform="translate(0,-30)" /></svg>
        <div className="ws-shot-bars">{[38, 22, 14, 16, 10].map((w, i) => <span key={i} style={{ width: `${w}%` }} />)}</div>
      </div>
      <div className="ws-shot ws-shot-phone">
        <p className="ws-shot-title">Positions</p>
        <div className="ws-shot-pos"><b>GOLD</b><span className="ws-pos">+285</span></div>
        <div className="ws-shot-pos"><b>CRUDE OIL</b><span className="ws-neg">−42</span></div>
        <div className="ws-shot-cf"><span>Carry Forward</span><i /></div>
        <div className="ws-shot-btns"><span className="ws-neg-b">Sell</span><span className="ws-pos-b">Buy</span></div>
      </div>
      <div className="ws-shot ws-shot-right">
        <p className="ws-shot-title">Course progress</p>
        <div className="ws-ring"><span>3/5</span></div>
        <p className="ws-shot-sub">Modules done</p>
      </div>
    </div>
  );
}
