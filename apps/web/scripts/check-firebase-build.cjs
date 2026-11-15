const fs = require('node:fs');
const path = require('node:path');

const fields = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
  'NEXT_PUBLIC_FIREBASE_VAPID_KEY',
];

function check() {
  const missing = fields.filter(name => !process.env[name]?.trim());
  if (missing.length) throw new Error(`Missing Firebase web BUILD settings: ${missing.join(', ')}. Set them on the Render Docker service; the Dockerfile must declare their ARG and ENV before next build.`);
  console.log('Firebase web build configuration: all 6 public settings are available.');
  if (!process.argv.includes('--verify-bundle')) return;
  const folder = path.resolve('.next/static');
  const chunks = fs.readdirSync(folder, { recursive: true }).filter(file => file.endsWith('.js') && fs.statSync(path.join(folder, file)).isFile());
  const scripts = chunks.map(file => fs.readFileSync(path.join(folder, file), 'utf8'));
  const absent = fields.filter(name => !scripts.some(source => source.includes(process.env[name]) || source.includes(JSON.stringify(process.env[name]))));
  if (absent.length) throw new Error(`Firebase settings were not embedded in the browser bundle: ${absent.join(', ')}. Rebuild with those public settings available to next build.`);
  console.log('Firebase web browser bundle verified: all 6 public settings are embedded.');
}
try { check(); } catch (error) { console.error(error.message); process.exitCode = 1; }
