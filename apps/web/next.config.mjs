import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const isDev = process.env.NODE_ENV !== 'production';
// Empty in a production build = web and API share one address ('self' covers it, wss included).
const api = process.env.NEXT_PUBLIC_API_URL || (isDev ? 'http://localhost:4000' : '');
const ws = api.replace(/^http/, 'ws');
const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim();
const authOrigin = authDomain && /^[a-zA-Z0-9.-]+$/.test(authDomain) ? `https://${authDomain}` : '';

/** Firebase client configuration is public. Admin SDK credentials stay on the API. */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://www.gstatic.com https://www.google.com/recaptcha/ https://www.recaptcha.net/recaptcha/`,
  "worker-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  `connect-src 'self'${api ? ` ${api} ${ws}` : ''} https://firebaseinstallations.googleapis.com https://fcmregistrations.googleapis.com https://fcm.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://recaptchaenterprise.googleapis.com https://www.google.com/recaptcha/ https://www.recaptcha.net/recaptcha/${authOrigin ? ` ${authOrigin}` : ''}`,
  `frame-src 'self' https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/ https://www.recaptcha.net/recaptcha/${authOrigin ? ` ${authOrigin}` : ''}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

export default {
  reactStrictMode: true,
  // Bound build workers on laptops and small hosted builders.
  experimental: { cpus: 2 },
  poweredByHeader: false,
  env: { NEXT_PUBLIC_APP_VERSION: pkg.version },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          ...(isDev ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' }]),
        ],
      },
    ];
  },
};
