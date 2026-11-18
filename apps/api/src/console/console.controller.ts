import { isPlatformAdmin } from '../common/roles';
import { Controller, Get, NotFoundException, Res } from '@nestjs/common';
import type { Response } from 'express';
import { env } from '../config/env';

/**
 * API console at "/": GraphiQL (every query and mutation, with docs and autocomplete) plus a sign-in bar, so real
 * flows can be tried against this server: password, authenticator code, "sign out other device", step-up for
 * sensitive actions. Tokens live only in this page's memory and are sent only to this API's /graphql.
 *
 * On unless NODE_ENV=production; there, set API_CONSOLE=true to turn it on. Every operation still goes through the
 * normal authentication, roles, step-up, rate limits and audit log, so the console grants nothing by itself.
 */
const CDN = 'https://cdn.jsdelivr.net/npm';

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>The K · API console</title>
<link rel="stylesheet" href="${CDN}/graphiql@3.7.1/graphiql.min.css">
<style>
  html, body { margin: 0; height: 100%; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
  body { display: flex; flex-direction: column; }
  #bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 12px; background: #0b3d2e; color: #fff; }
  #bar b { font-size: 15px; margin-right: 8px; }
  #bar input { height: 30px; border-radius: 6px; border: 0; padding: 0 8px; font-size: 14px; }
  #bar button { height: 30px; border-radius: 6px; border: 0; padding: 0 12px; font-weight: 600; cursor: pointer; background: #08a77b; color: #fff; }
  #bar button.ghost { background: transparent; border: 1px solid #ffffff66; }
  #who { margin-left: auto; font-size: 13px; opacity: .9; }
  #msg { font-size: 13px; color: #ffd27a; }
  #graphiql { flex: 1; min-height: 0; }
  .hide { display: none !important; }
  #gate { flex: 1; display: flex; align-items: center; justify-content: center; background: #f4f7f6; padding: 16px; }
  #card { width: 100%; max-width: 360px; background: #fff; border-radius: 14px; box-shadow: 0 6px 30px #0b3d2e22; padding: 28px 24px; display: flex; flex-direction: column; gap: 12px; }
  #card h1 { margin: 0; font-size: 20px; color: #0b3d2e; }
  #card p { margin: 0 0 4px; font-size: 13px; color: #5b6b66; }
  #card input { height: 40px; border: 1px solid #cfd8d5; border-radius: 8px; padding: 0 12px; font-size: 15px; }
  #card button { height: 40px; border: 0; border-radius: 8px; font-weight: 600; font-size: 15px; cursor: pointer; background: #08a77b; color: #fff; }
  #card .step { display: flex; flex-direction: column; gap: 12px; }
  #gmsg { min-height: 18px; font-size: 13px; color: #b3261e; }
</style>
</head>
<body>
<div id="gate">
  <form id="card" onsubmit="return false">
    <h1>The K · API console</h1>
    <p>For developers. Sign in with your account to explore and test the API.</p>
    <div id="out" class="step">
      <input id="u" placeholder="Username" autocomplete="username" autofocus>
      <input id="p" type="password" placeholder="Password" autocomplete="current-password">
      <button id="login" type="submit">Sign in</button>
    </div>
    <div id="mfa" class="step hide">
      <input id="code" inputmode="numeric" maxlength="6" placeholder="6-digit authenticator code" autocomplete="one-time-code">
      <button id="mfaGo" type="submit">Verify</button>
    </div>
    <div id="conf" class="step hide">
      <p>You're signed in on another device.</p>
      <button id="force" type="button">Sign that device out and continue</button>
    </div>
    <div id="gmsg"></div>
  </form>
</div>
<div id="bar" class="hide">
  <b>The K · API console</b>
  <span id="in">
    <button id="step" title="Sensitive actions (approvals, payments, deletes) need this; valid for 5 minutes">Step-up</button>
    <button id="logout" class="ghost">Sign out</button>
  </span>
  <span id="msg"></span>
  <span id="who">Not signed in</span>
</div>
<div id="graphiql" class="hide"></div>
<script crossorigin src="${CDN}/react@18.3.1/umd/react.production.min.js"></script>
<script crossorigin src="${CDN}/react-dom@18.3.1/umd/react-dom.production.min.js"></script>
<script src="${CDN}/graphiql@3.7.1/graphiql.min.js"></script>
<script>
(function () {
  var token = null, stepUp = null, stepUpUntil = 0, mfaToken = null, conflictToken = null, me = null;
  var $ = function (id) { return document.getElementById(id); };
  var DEVICE = 'API console';
  function post(query, variables) {
    var h = { 'content-type': 'application/json', 'apollo-require-preflight': 'true' };
    if (token) h.authorization = 'Bearer ' + token;
    if (stepUp && Date.now() < stepUpUntil) h['x-step-up'] = stepUp;
    return fetch('/graphql', { method: 'POST', headers: h, credentials: 'same-origin', body: JSON.stringify({ query: query, variables: variables || {} }) })
      .then(function (r) { return r.json(); });
  }
  var signedIn = false, rendered = false;
  function msg(t) { $(signedIn ? 'msg' : 'gmsg').textContent = t || ''; }
  function show(state) {
    signedIn = state === 'in';
    $('out').classList.toggle('hide', state !== 'out');
    $('mfa').classList.toggle('hide', state !== 'mfa');
    $('conf').classList.toggle('hide', state !== 'conf');
    // Login page until signed in; then the toolbar and GraphiQL.
    $('gate').classList.toggle('hide', signedIn);
    $('bar').classList.toggle('hide', !signedIn);
    $('graphiql').classList.toggle('hide', !signedIn);
    $('who').textContent = me ? (me.username + ' · ' + me.role + (stepUp && Date.now() < stepUpUntil ? ' · step-up on' : '')) : 'Not signed in';
    if (signedIn && !rendered) {
      rendered = true;
      try { renderGraphiql(); } catch (e) { rendered = false; msg('The query editor did not load (check the connection to cdn.jsdelivr.net) — reload the page.'); }
    }
  }
  var FIELDS = 'accessToken mfaRequired mfaToken sessionConflict conflictToken user { username role }';
  function handle(d) {
    var e = d.errors && d.errors[0];
    if (e) { msg(e.message); return; }
    var r = d.data[Object.keys(d.data)[0]];
    if (r.sessionConflict) { conflictToken = r.conflictToken; show('conf'); msg(''); return; }
    if (r.mfaRequired) { mfaToken = r.mfaToken; show('mfa'); $('code').focus(); msg(''); return; }
    token = r.accessToken; me = r.user; $('p').value = ''; $('gmsg').textContent = ''; show('in');
    msg(isPlatformAdmin(me.role) ? 'Signed in. Super Admins without an authenticator must set one up first (beginMfaEnrollment).' : 'Signed in.');
  }
  $('login').onclick = function () {
    msg('Signing in…');
    post('mutation($u:String!,$p:String!,$d:String){ login(username:$u,password:$p,deviceName:$d){ ' + FIELDS + ' } }', { u: $('u').value, p: $('p').value, d: DEVICE }).then(handle);
  };
  $('mfaGo').onclick = function () {
    post('mutation($t:String!,$c:String!,$d:String){ completeMfaLogin(mfaToken:$t, code:$c, deviceName:$d){ ' + FIELDS + ' } }', { t: mfaToken, c: $('code').value, d: DEVICE }).then(function (d) { $('code').value = ''; handle(d); });
  };
  $('force').onclick = function () {
    post('mutation($t:String!,$d:String){ forceLogin(conflictToken:$t, deviceName:$d){ ' + FIELDS + ' } }', { t: conflictToken, d: DEVICE }).then(handle);
  };
  $('step').onclick = function () {
    var v = prompt('Your password:');
    if (!v) return;
    post('mutation($p:String!){ stepUp(password:$p){ token } }', { p: v }).then(function (d) {
      if (d.errors) { msg(d.errors[0].message); return; }
      stepUp = d.data.stepUp.token; stepUpUntil = Date.now() + 4.5 * 60 * 1000; show('in'); msg('Step-up on for 5 minutes.');
    });
  };
  $('logout').onclick = function () {
    post('mutation{ logout }').finally(function () { token = null; me = null; stepUp = null; show('out'); msg('Signed out.'); $('u').focus(); });
  };
  var fetcher = function (params) { return post(params.query, params.variables); };
  var start = '# The K API console\\n#\\n# 1. Press the Docs button (top-left) to browse every query and mutation.\\n# 2. Approvals, payments and deletes need "Step-up" first.\\n#\\n# Example: your account and balance\\nquery Me {\\n  me { id username displayName role mfaEnabled }\\n}\\n';
  function renderGraphiql() { ReactDOM.createRoot($('graphiql')).render(React.createElement(GraphiQL, { fetcher: fetcher, defaultQuery: start, defaultEditorToolsVisibility: true })); }
  show('out');
})();
</script>
</body>
</html>`;

@Controller()
export class ConsoleController {
  /** "/" when the API runs on its own; "/api-console" when web and API share one address (single-service deploy). */
  @Get(['', 'api-console'])
  page(@Res() res: Response) {
    const e = env();
    const on = e.API_CONSOLE ?? e.NODE_ENV !== 'production';
    if (!on) throw new NotFoundException();
    // The page loads React and GraphiQL from jsDelivr; everything else stays same-origin.
    res.setHeader('Content-Security-Policy', [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net`,
      `style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net`,
      "img-src 'self' data: https://cdn.jsdelivr.net",
      "font-src 'self' data: https://cdn.jsdelivr.net",
      "connect-src 'self'",
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
    ].join('; '));
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(PAGE);
  }
}
