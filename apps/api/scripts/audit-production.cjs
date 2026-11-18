const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ADVISORY = 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf';
const EXPIRES = '2026-12-02T00:00:00Z';
const REVIEWED = new Set(['picomatch', 'fdir', 'tinyglobby', '@nestjs/graphql']);

function evaluate(report, { now = new Date(), codeFirstOnly = false } = {}) {
  if (!report || report.error || !report.vulnerabilities || typeof report.vulnerabilities !== 'object' || Array.isArray(report.vulnerabilities) || !report.metadata?.vulnerabilities)
    throw new Error('Audit failed or returned an invalid report; refusing to pass.');
  const vulnerabilities = report.vulnerabilities;
  const reviewedOnly = (name, seen = new Set()) => {
    if (!REVIEWED.has(name) || seen.has(name)) return false;
    const node = vulnerabilities[name];
    if (!node || !Array.isArray(node.via) || !node.via.length) return false;
    const visited = new Set([...seen, name]);
    return node.via.every(v => typeof v === 'string' ? reviewedOnly(v, visited) : v.url === ADVISORY && v.name === 'picomatch');
  };
  const blocked = [], excepted = [];
  for (const [name, vulnerability] of Object.entries(vulnerabilities)) {
    if (!vulnerability || !['info', 'low', 'moderate', 'high', 'critical'].includes(vulnerability.severity) || !Array.isArray(vulnerability.via))
      throw new Error(`Invalid vulnerability entry: ${name}; refusing to pass.`);
    if (!['high', 'critical'].includes(vulnerability.severity)) continue;
    if (vulnerability.severity === 'high' && codeFirstOnly && now < new Date(EXPIRES) && reviewedOnly(name)) excepted.push(name);
    else blocked.push(name);
  }
  return { blocked, excepted };
}

function codeFirstOnly(root) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  // Only these exact reviewed dependency versions qualify. Reassess upgrades rather than inheriting the exception.
  if (pkg.dependencies['@nestjs/graphql'] !== '13.4.5' || lock.packages?.['node_modules/picomatch']?.version !== '4.0.7') return false;
  const app = fs.readFileSync(path.join(root, 'src/app.module.ts'), 'utf8');
  if (!/autoSchemaFile:\s*true\b/.test(app)) return false;
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).every(entry => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(file);
    if (!file.endsWith('.ts')) return true;
    const source = fs.readFileSync(file, 'utf8');
    return !/\btypePaths\s*[:=]|(?:from\s*|require\s*\(\s*|import\s*\(\s*)['"](?:picomatch|micromatch|tinyglobby|fast-glob|fdir)['"]/.test(source);
  });
  return walk(path.join(root, 'src'));
}

function main() {
  const root = path.resolve(__dirname, '..');
  if (!process.env.npm_execpath) throw new Error('Run via npm run audit:prod.');
  const result = spawnSync(process.execPath, [process.env.npm_execpath, 'audit', '--omit=dev', '--json'], {
    cwd: root, encoding: 'utf8', timeout: 60000, maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error || result.signal || ![0, 1].includes(result.status)) throw new Error('npm audit could not complete; refusing to pass.');
  const report = JSON.parse(result.stdout);
  const { blocked, excepted } = evaluate(report, { codeFirstOnly: codeFirstOnly(root) });
  console.log('Production dependency audit:', report.metadata.vulnerabilities);
  if (excepted.length) console.warn(`TEMPORARY EXCEPTION until ${EXPIRES}: ${ADVISORY}. No upstream patch; code-first GraphQL has no request-controlled file globs. Affected chain: ${excepted.join(', ')}. See docs/dependency-security.md.`);
  if (blocked.length) {
    console.error('Unexcepted high/critical vulnerabilities:', blocked.join(', '));
    process.exitCode = 1;
  } else console.log('Production audit policy passed. Exceptions, if any, remain listed above.');
}

module.exports = { evaluate, codeFirstOnly, ADVISORY, EXPIRES };
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
