// Single-service router: one public port in front of the API and the web server running in the same container.
// No dependencies (plain node:http / node:net), streams bodies, and passes WebSocket upgrades straight through.
//
//   /graphql (HTTP + WebSocket), /health, /statement.pdf, /integrations/*, /api-console  → API  (127.0.0.1:API_PORT)
//   everything else                                                         → web  (127.0.0.1:WEB_PORT)
//
// X-Forwarded-For is passed on unchanged: the API (TRUST_PROXY=true) takes its right-most entry, which is the
// browser address added by Render's load balancer. Headers a client could use to impersonate the web relay are dropped.
import http from 'node:http';
import net from 'node:net';

const PORT = Number(process.env.PORT || 10000);
const API = { host: '127.0.0.1', port: Number(process.env.API_PORT || 4000) };
const WEB = { host: '127.0.0.1', port: Number(process.env.WEB_PORT || 3000) };
const DROP = ['x-k-proxy-secret', 'x-k-client-ip'];

function targetFor(url = '/') {
  const path = url.split('?')[0];
  if (path === '/graphql' || path.startsWith('/graphql/') || path === '/health' || path === '/statement.pdf' || path.startsWith('/integrations/') || path === '/api-console') return API;
  return WEB;
}

function cleanHeaders(h) {
  const out = { ...h };
  for (const k of DROP) delete out[k];
  return out;
}

const server = http.createServer((req, res) => {
  const t = targetFor(req.url);
  const up = http.request({ ...t, method: req.method, path: req.url, headers: cleanHeaders(req.headers) }, (r) => {
    res.writeHead(r.statusCode ?? 502, r.rawHeaders.length ? rawToObject(r.rawHeaders) : r.headers);
    r.pipe(res);
  });
  up.on('error', () => {
    if (res.headersSent) return res.destroy();
    const starting = req.url === '/health' ? 'starting' : 'The server is starting. Please try again in a few seconds.';
    res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8', 'retry-after': '5', 'cache-control': 'no-store' });
    res.end(starting);
  });
  req.pipe(up);
});

// Keep repeated headers (e.g. several Set-Cookie lines) intact.
function rawToObject(raw) {
  const o = {};
  for (let i = 0; i < raw.length; i += 2) {
    const k = raw[i].toLowerCase(), v = raw[i + 1];
    if (o[k] === undefined) o[k] = v;
    else o[k] = Array.isArray(o[k]) ? [...o[k], v] : [o[k], v];
  }
  return o;
}

// WebSocket (and any other Upgrade): open a TCP connection to the target, replay the request head, then pipe both ways.
server.on('upgrade', (req, socket, head) => {
  const t = targetFor(req.url);
  const up = net.connect(t.port, t.host, () => {
    const h = cleanHeaders(req.headers);
    let line = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`;
    for (const [k, v] of Object.entries(h)) for (const x of Array.isArray(v) ? v : [v]) line += `${k}: ${x}\r\n`;
    up.write(line + '\r\n');
    if (head?.length) up.write(head);
    up.pipe(socket);
    socket.pipe(up);
  });
  const close = () => { socket.destroy(); up.destroy(); };
  up.on('error', close);
  socket.on('error', close);
  up.setNoDelay(true);
  socket.setNoDelay(true);
});

// Long-lived connections (Render's load balancer keeps them open); don't cut slow uploads.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
server.requestTimeout = 0;
server.listen(PORT, '0.0.0.0', () => console.log(`[router] :${PORT} → API :${API.port}, web :${WEB.port}`));

for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => server.close(() => process.exit(0)));
