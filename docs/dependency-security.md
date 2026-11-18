# Production dependency security review — 18 November 2026

## UUID: fixed

The API overrides transitive `uuid` dependencies to **11.1.1**, the patched CommonJS-compatible version for GHSA-w5hq-g745-h8pq. ExcelJS and the installed Google clients call the supported `v4` API. Firebase Admin already uses 11.1.1. Keep their existing major versions rather than following npm's proposed ExcelJS downgrade or Firebase major upgrade. The lockfile records the complete resolution.

## Picomatch: temporary exception, not a security fix

GHSA-fc5q-39xc-vjpf has no patched published picomatch release as of this review. Both NestJS GraphQL 13.4.5 (tinyglobby) and 13.4.4 (fast-glob) pull affected versions, so the proposed downgrade does not resolve it. Keep NestJS 13.4.5 and the existing GraphQL-tools override.

This application uses code-first GraphQL (`autoSchemaFile: true`). It has no `typePaths` configuration and does not import glob-matching packages in application code. The affected NestJS path loads schema files using developer-specified patterns; GraphQL requests do not supply these patterns. This is the basis for accepting this particular currently unreachable dependency finding temporarily. It does not mean picomatch itself is patched or safe for untrusted patterns.

`npm run audit:prod` runs the actual production npm audit and applies only this exception:

- exact advisory URL GHSA-fc5q-39xc-vjpf;
- only the reviewed picomatch/fdir/tinyglobby/NestJS dependency chain;
- reviewed NestJS 13.4.5 and installed picomatch 4.0.7;
- code-first schema configuration with no `typePaths` or application imports of the affected glob libraries;
- expiry **2 December 2026, 00:00 UTC**.

Other high/critical findings fail CI. A different advisory, critical severity, expired review, changed loader usage or failed audit request also fails. CI prints the unresolved finding and exception instead of claiming zero vulnerabilities. The high-severity blocking threshold is unchanged; moderate findings remain reported.

Before expiry, check for an upstream fix, remove the exception when a patched compatible dependency can be installed, and run the audit and tests again. If the application starts accepting file patterns, do not extend the exception based on this review.

References:
- https://github.com/advisories/GHSA-fc5q-39xc-vjpf
- https://github.com/advisories/GHSA-w5hq-g745-h8pq
