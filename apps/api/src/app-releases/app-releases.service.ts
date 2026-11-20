import { isPlatformAdmin } from '../common/roles';
import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { and, desc, eq, isNull, ne, or } from 'drizzle-orm';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { createWriteStream, promises as fs } from 'node:fs';
import path from 'node:path';
import type { Readable } from 'node:stream';
import type { Actor } from '../common/context';
import { AppError, badInput, notFound } from '../common/errors';
import { env } from '../config/env';
import { AuditService } from '../audit/audit.service';
import { DbService } from '../db/db';
import { appReleases, type AppReleaseRow } from '../db/schema';

const LINK_TTL_SEC = 15 * 60; // time to start a (large) upload
const KEEP_APKS = 3; // older APK files are removed from the disk; their history rows stay
const VERSION_RE = /^[0-9A-Za-z][0-9A-Za-z.+_ ()-]{0,39}$/;

interface UploadClaims { sub: string; role: string; version: string; notes?: string; abi?: string; purpose: 'apk-upload' }
/** Who is publishing: a Super Admin (signed link) or the CI build (token). */
type Publisher = { role?: Actor['role']; userId: string | null; version: string; notes?: string; source: 'admin' | 'github-actions'; abi?: string };

/**
 * App downloads page. Android: a Super Admin uploads the APK through a short-lived signed link (the file streams
 * straight to APP_FILES_DIR, never through GraphQL or memory). iOS: a TestFlight or App Store link. Anyone with the
 * page link can download the latest APK or open the iOS link; every change is in the audit trail.
 */
@Injectable()
export class AppReleasesService {
  private readonly jwt = new JwtService({});
  private readonly log = new Logger('AppReleases');

  constructor(private readonly dbs: DbService, private readonly audit: AuditService) {}

  get filesDir(): string | undefined {
    return env().APP_FILES_DIR;
  }

  /** A plain reason for an unexpected upload failure (storage or database), safe to show to the uploader. */
  explainFailure(e: unknown): string {
    const err = e as { code?: string; message?: string; cause?: { code?: string; message?: string } };
    const code = err?.code ?? err?.cause?.code;
    const dir = this.filesDir ?? '(not set)';
    switch (code) {
      case 'EACCES': case 'EPERM': case 'EROFS':
        return `The server cannot write APK files to APP_FILES_DIR (${dir}): no permission or read-only. Attach a persistent disk mounted at that path, or point APP_FILES_DIR to a writable folder.`;
      case 'ENOENT':
        return `APP_FILES_DIR (${dir}) does not exist on the server and could not be created. Attach the disk or fix the path.`;
      case 'ENOSPC':
        return `The disk for APP_FILES_DIR (${dir}) is full. Remove old APKs or enlarge the disk.`;
    }
    if (code && /^[0-9A-Z]{5}$/.test(code)) return `Database error ${code} while recording the release (${(err.cause?.message ?? err.message ?? '').slice(0, 160)}). Check that migrations ran on the current DATABASE_URL.`;
    return `Unexpected error while saving the APK: ${(err?.message ?? String(e)).slice(0, 200)}`;
  }

  async latest(platform: 'ANDROID' | 'IOS', abi?: 'armeabi-v7a'): Promise<AppReleaseRow | undefined> {
    const [r] = await this.dbs.db.select().from(appReleases)
      .where(and(eq(appReleases.platform, platform), eq(appReleases.active, true), platform === 'ANDROID' ? abi ? eq(appReleases.abi, abi) : or(isNull(appReleases.abi), ne(appReleases.abi, 'armeabi-v7a')) : undefined))
      .orderBy(desc(appReleases.createdAt)).limit(1);
    return r;
  }

  history(limit = 30) {
    return this.dbs.db.select().from(appReleases).orderBy(desc(appReleases.createdAt)).limit(Math.min(Math.max(limit, 1), 100));
  }

  /** Step 1 of an APK upload: a signed one-off link the admin's browser POSTs the file to. */
  async createUploadLink(actor: Actor, version: string, notes: string | undefined, ip: string, abi?: string) {
    if (!this.filesDir) throw badInput('APK upload is not set up on this server: add a persistent disk and set APP_FILES_DIR.');
    const v = version.trim();
    if (!VERSION_RE.test(v)) throw badInput('Version: up to 40 characters, e.g. 1.4.2 or 1.4.2 (build 37).');
    const n = notes?.trim().slice(0, 500) || undefined;
    if (abi !== undefined && !['arm64-v8a', 'armeabi-v7a', 'universal'].includes(abi)) throw badInput('Unsupported Android architecture.');
    const claims: UploadClaims = { sub: actor.userId, role: actor.role, version: v, notes: n, abi, purpose: 'apk-upload' };
    const token = this.jwt.sign(claims, { secret: env().JWT_STEPUP_SECRET, expiresIn: LINK_TTL_SEC, algorithm: 'HS256', issuer: 'tradedesk', audience: 'apk-upload' });
    await this.audit.recordStandalone({ actor, action: 'app_release.upload_link_created', entityType: 'app_release', entityId: actor.userId, outcome: 'SUCCESS', ip, metadata: { version: v } });
    return { path: `/app-files/upload?token=${encodeURIComponent(token)}`, expiresIn: LINK_TTL_SEC, maxBytes: env().APK_MAX_MB * 1024 * 1024 };
  }

  verifyUpload(token: string): UploadClaims {
    try {
      const c = this.jwt.verify<UploadClaims>(token, { secret: env().JWT_STEPUP_SECRET, algorithms: ['HS256'], issuer: 'tradedesk', audience: 'apk-upload' });
      if (c.purpose !== 'apk-upload' || !isPlatformAdmin(c.role)) throw new Error('bad purpose');
      return c;
    } catch {
      throw new AppError('UNAUTHENTICATED', 'This upload link has expired. Start the upload again.');
    }
  }

  /** CI publishing: the build pipeline sends the APK with APP_RELEASE_CI_TOKEN (constant-time compared). */
  verifyCiToken(header: string | undefined) {
    const want = env().APP_RELEASE_CI_TOKEN;
    const got = (header ?? '').replace(/^Bearer\s+/i, '');
    if (!want) throw new AppError('UNAUTHENTICATED', 'Automatic publishing is not set up: APP_RELEASE_CI_TOKEN is missing on the server.');
    const a = Buffer.from(createHash('sha256').update(got).digest('hex'));
    const b = Buffer.from(createHash('sha256').update(want).digest('hex'));
    if (!got || !timingSafeEqual(a, b)) throw new AppError('UNAUTHENTICATED', 'Invalid publishing token.');
  }

  receiveFromCi(version: string, notes: string | undefined, body: Readable, declaredLength: number | undefined, ip: string, abi?: string) {
    const v = version.trim();
    if (!VERSION_RE.test(v)) throw badInput('Version: up to 40 characters, e.g. 1.4.2 (build 37).');
    if (abi !== undefined && !['arm64-v8a', 'armeabi-v7a', 'universal'].includes(abi)) throw badInput('Unsupported Android architecture.');
    return this.store({ userId: null, version: v, notes: notes?.trim().slice(0, 500) || undefined, source: 'github-actions', abi }, body, declaredLength, ip);
  }

  /** Step 2 of an admin upload: stream the request body to disk, check it is an APK (zip), record it. */
  receiveApk(claims: UploadClaims, body: Readable, declaredLength: number | undefined, ip: string) {
    return this.store({ role: claims.role as Actor['role'], userId: claims.sub, version: claims.version, notes: claims.notes, abi: claims.abi, source: 'admin' }, body, declaredLength, ip);
  }

  private async store(who: Publisher, body: Readable, declaredLength: number | undefined, ip: string) {
    const dir = this.filesDir;
    if (!dir) throw badInput('APK upload is not set up on this server.');
    const max = env().APK_MAX_MB * 1024 * 1024;
    if (declaredLength !== undefined && declaredLength > max) throw badInput(`The file is larger than ${env().APK_MAX_MB} MB.`);
    await fs.mkdir(dir, { recursive: true });
    const key = `android-${new Date().toISOString().slice(0, 10)}-${randomUUID()}.apk`;
    const tmp = path.join(dir, `.${key}.part`);
    const hash = createHash('sha256');
    let size = 0;
    let head = Buffer.alloc(0);
    try {
      await new Promise<void>((resolve, reject) => {
        const out = createWriteStream(tmp, { flags: 'wx', mode: 0o640 });
        body.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (head.length < 4) head = Buffer.concat([head, chunk.subarray(0, 4 - head.length)]);
          if (size > max) { body.destroy(); out.destroy(); reject(badInput(`The file is larger than ${env().APK_MAX_MB} MB.`)); return; }
          hash.update(chunk);
          if (!out.write(chunk)) { body.pause(); out.once('drain', () => body.resume()); }
        });
        body.on('end', () => out.end());
        body.on('error', reject);
        out.on('finish', resolve);
        out.on('error', reject);
      });
      // An APK is a zip file: it starts with "PK\x03\x04".
      if (size < 1024 || head.length < 4 || head[0] !== 0x50 || head[1] !== 0x4b || head[2] !== 0x03 || head[3] !== 0x04) throw badInput('That file is not an Android APK.');
      await fs.rename(tmp, path.join(dir, key));
    } catch (e) {
      await fs.rm(tmp, { force: true }).catch(() => undefined);
      throw e;
    }
    const sha256 = hash.digest('hex');
    const suffix = who.abi === 'arm64-v8a' ? '-64-bit' : who.abi === 'armeabi-v7a' ? '-32-bit' : '';
    const fileName = `TheK-${who.version.replace(/[^0-9A-Za-z.]+/g, '-').replace(/-+$/, '')}${suffix}.apk`;
    const actor: Pick<Actor, 'userId' | 'role'> | null = who.userId ? { userId: who.userId, role: who.role ?? 'SUPER_ADMIN' } : null;
    const row = await this.dbs.db.transaction(async (tx) => {
      const [r] = await tx.insert(appReleases).values({ platform: 'ANDROID', abi: who.abi, version: who.version, notes: who.notes, fileName, fileSize: size, sha256, storageKey: key, createdById: who.userId }).returning();
      await this.audit.record(tx, { actor, action: 'app_release.android_uploaded', entityType: 'app_release', entityId: r.id, outcome: 'SUCCESS', ip, metadata: { version: who.version, abi: who.abi, size, sha256, source: who.source } });
      return r;
    });
    void this.prune().catch((e) => this.log.warn(`Could not remove old APK files: ${(e as Error).message}`));
    return row;
  }

  /** Keep the newest KEEP_APKS files on disk; older releases stay in history without a file. */
  private async prune() {
    const dir = this.filesDir;
    if (!dir) return;
    const rows = await this.dbs.db.select().from(appReleases).where(eq(appReleases.platform, 'ANDROID')).orderBy(desc(appReleases.createdAt));
    const kept = new Map<string, number>();
    for (const r of rows) {
      const variant = r.abi ?? 'universal';
      kept.set(variant, (kept.get(variant) ?? 0) + 1);
      if (kept.get(variant)! <= KEEP_APKS) continue;
      if (!r.storageKey) continue;
      await fs.rm(path.join(dir, path.basename(r.storageKey)), { force: true });
      await this.dbs.db.update(appReleases).set({ storageKey: null, active: false }).where(eq(appReleases.id, r.id));
    }
  }

  /** Absolute path of the latest APK, for the public download. */
  async latestApkFile(abi?: 'armeabi-v7a') {
    const r = await this.latest('ANDROID', abi);
    if (!r?.storageKey || !this.filesDir) throw notFound('Android app');
    const file = path.join(this.filesDir, path.basename(r.storageKey));
    try { await fs.access(file); } catch { throw notFound('Android app file'); }
    return { file, row: r };
  }

  async setIos(actor: Actor, url: string, version: string, notes: string | undefined, ip: string) {
    const v = version.trim();
    if (!VERSION_RE.test(v)) throw badInput('Version: up to 40 characters, e.g. 1.4.2.');
    let u: URL;
    try { u = new URL(url.trim()); } catch { throw badInput('Enter the full TestFlight or App Store link, starting with https://'); }
    if (u.protocol !== 'https:' || !['testflight.apple.com', 'apps.apple.com'].includes(u.hostname)) throw badInput('Use a TestFlight (testflight.apple.com) or App Store (apps.apple.com) link.');
    return this.dbs.db.transaction(async (tx) => {
      const [r] = await tx.insert(appReleases).values({ platform: 'IOS', version: v, notes: notes?.trim().slice(0, 500) || null, url: u.toString(), createdById: actor.userId }).returning();
      await this.audit.record(tx, { actor, action: 'app_release.ios_link_set', entityType: 'app_release', entityId: r.id, outcome: 'SUCCESS', ip, metadata: { version: v, host: u.hostname } });
      return r;
    });
  }

  /** Take a release off the download page (it stays in history). */
  async hide(actor: Actor, id: string, ip: string) {
    return this.dbs.db.transaction(async (tx) => {
      const [r] = await tx.update(appReleases).set({ active: false }).where(eq(appReleases.id, id)).returning();
      if (!r) throw notFound('Release');
      await this.audit.record(tx, { actor, action: 'app_release.hidden', entityType: 'app_release', entityId: id, outcome: 'SUCCESS', ip, metadata: { platform: r.platform, version: r.version } });
      return r;
    });
  }
}
