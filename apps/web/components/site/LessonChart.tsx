/**
 * Hero illustration: a candlestick chart marked up the way a teacher would in class (support line, a stop-loss
 * below it, an entry on the bounce). Original drawing; prices are illustrative.
 */
const C = [
  [62, 70, 55, 66], [66, 72, 60, 61], [61, 64, 50, 52], [52, 56, 44, 47], [47, 53, 43, 51], [51, 58, 49, 56],
  [56, 59, 46, 48], [48, 51, 42, 45], [45, 55, 44, 54], [54, 63, 52, 61], [61, 68, 58, 66], [66, 71, 61, 63],
  [63, 74, 62, 72], [72, 80, 70, 78],
]; // open, high, low, close (chart units, higher = up)
export function LessonChart() {
  const W = 520, H = 340, pad = 28, step = (W - pad * 2) / C.length, y = (v: number) => H - pad - ((v - 36) / (84 - 36)) * (H - pad * 2);
  return (
    <svg className="ws-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="A practice chart marked with support, stop-loss and entry, as taught in class">
      <rect x="0" y="0" width={W} height={H} rx="18" className="ws-chart-bg" />
      {[45, 55, 65, 75].map((g) => <line key={g} x1={pad} x2={W - pad} y1={y(g)} y2={y(g)} className="ws-chart-grid" />)}
      <line x1={pad} x2={W - pad} y1={y(43)} y2={y(43)} className="ws-chart-support" />
      <text x={W - pad} y={y(43) - 8} textAnchor="end" className="ws-chart-note">Support held twice</text>
      <line x1={pad + step * 7} x2={W - pad} y1={y(40)} y2={y(40)} className="ws-chart-stop" />
      <text x={W - pad} y={y(40) + 18} textAnchor="end" className="ws-chart-note ws-chart-note-stop">Stop-loss below support</text>
      {C.map(([o, h, l, c], i) => {
        const x = pad + step * i + step / 2, up = c >= o;
        return (
          <g key={i} className={up ? 'ws-up' : 'ws-down'}>
            <line x1={x} x2={x} y1={y(h)} y2={y(l)} />
            <rect x={x - step * 0.3} y={y(Math.max(o, c))} width={step * 0.6} height={Math.max(2, Math.abs(y(o) - y(c)))} rx="2" />
          </g>
        );
      })}
      <circle cx={pad + step * 8.5} cy={y(54)} r="9" className="ws-chart-entry" />
      <line x1={pad + step * 8.5 - 7} y1={y(54) - 7} x2={pad + step * 6.6} y2={y(65.5)} className="ws-chart-lead" />
      <text x={pad + step * 6.5} y={y(66)} textAnchor="end" className="ws-chart-note">Entry on the bounce</text>
    </svg>
  );
}
