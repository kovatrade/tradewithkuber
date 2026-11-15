const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const test = require('node:test');

test('production CSP permits Firebase registration and worker SDK imports without broad script or worker access', async () => {
  const previous = { NODE_ENV: process.env.NODE_ENV, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN };
  process.env.NODE_ENV = 'production';
  process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = 'tradewithkuber.firebaseapp.com';
  try {
    const config = (await import(pathToFileURL(path.join(__dirname, '../next.config.mjs')).href)).default;
    const headers = await config.headers();
    const csp = headers[0].headers.find(item => item.key === 'Content-Security-Policy').value;
    const directives = Object.fromEntries(csp.split(';').map(value => { const [key, ...values] = value.trim().split(/\s+/); return [key, values]; }));
    assert.ok(directives['script-src'].includes('https://www.gstatic.com'));
    for (const endpoint of ['https://firebaseinstallations.googleapis.com', 'https://fcmregistrations.googleapis.com', 'https://fcm.googleapis.com']) {
      assert.ok(directives['connect-src'].includes(endpoint), `Missing ${endpoint}`);
    }
    assert.ok(directives['frame-src'].includes('https://tradewithkuber.firebaseapp.com'));
    assert.deepEqual(directives['worker-src'], ["'self'"]);
    assert.ok(!directives['script-src'].includes('*'));
    assert.ok(!directives['script-src'].includes("'unsafe-eval'"));
    assert.deepEqual(directives['frame-ancestors'], ["'none'"]);
  } finally {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
