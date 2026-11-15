/** "Everything in one place" picture: what a student gets, arranged around the learner. Original drawing. */
const ITEMS: [string, string, number, number][] = [
  ['Live classes', 'Learn', 50, 4],
  ['Practice app', 'Paper trading', 86, 30],
  ['Mentor reviews', 'Weekly', 80, 74],
  ['Class recordings', 'Watch again', 44, 92],
  ['MCX market data', 'Live prices', 6, 66],
  ['Charts', 'Practice reading', 10, 20],
];
export function Orbit() {
  return (
    <div className="ws-orbit" aria-label="A course includes live classes, the practice app, mentor reviews, class recordings, MCX market data and charts" role="img">
      <span className="ws-orbit-ring r1" /><span className="ws-orbit-ring r2" /><span className="ws-orbit-ring r3" />
      <div className="ws-orbit-core">You</div>
      {ITEMS.map(([t, s, x, y]) => (
        <div key={t} className="ws-orbit-card" style={{ left: `${x}%`, top: `${y}%` }}><small>{s}</small><b>{t}</b></div>
      ))}
    </div>
  );
}
