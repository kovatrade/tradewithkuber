import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { and, desc, eq } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
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
const VERSION_RE = /^[0-9A-Za-z][0-9A-Za-z.+_ -]{0,39}$/;

interface UploadClaims { sub: string; role: string; version: string; notes?: string; purpose: 'apk-upload' }

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

  async latest(platform: 'ANDROID' | 'IOS'): Promise<AppReleaseRow | undefined> {
    const [r] = await this.dbs.db.select().from(appReleases)
      .where(and(eq(appReleases.platform, platform), eq(appReleases.active, true)))
      .orderBy(desc(appReleases.createdAt)).limit(1);
    return r;
  }

  history(limit = 30) {
    return this.dbs.db.select().from(appReleases).orderBy(desc(appReleases.createdAt)).limit(Math.min(Math.max(limit, 1), 100));
  }

  /** Step 1 of an APK upload: a signed one-off link the admin's browser POSTs the file to. */
  async createUploadLink(actor: Actor, version: string, notes: string | undefined, ip: string) {
    if (!this.filesDir) throw badInput('APK upload is not set up on this server: add a persistent disk and set APP_FILES_DIR.');
    const v = version.trim();
    if (!VERSION_RE.test(v)) throw badInput('Version: up to 40 characters, e.g. 1.4.2 or 1.4.2 (build 37).');
    const n = notes?.trim().slice(0, 500) || undefined;
    const claims: UploadClaims = { sub: actor.userId, role: actor.role, version: v, notes: n, purpose: 'apk-upload' };
    const token = this.jwt.sign(claims, { secret: env().JWT_STEPUP_SECRET, expiresIn: LINK_TTL_SEC, algorithm: 'HS256', issuer: 'tradedesk', audience: 'apk-upload' });
    await this.audit.recordStandalone({ actor, action: 'app_release.upload_link_created', entityType: 'app_release', entityId: actor.userId, outcome: 'SUCCESS', ip, metadata: { version: v } });
    return { path: `/app-files/upload?token=${encodeURIComponent(token)}`, expiresIn: LINK_TTL_SEC, maxBytes: env().APK_MAX_MB * 1024 * 1024 };
  }

  verifyUpload(token: string): UploadClaims {
    try {
      const c = this.jwt.verify<UploadClaims>(token, { secret: env().JWT_STEPUP_SECRET, algorithms: ['HS256'], issuer: 'tradedesk', audience: 'apk-upload' });
      if (c.purpose !== 'apk-upload' || c.role !== 'SUPER_ADMIN') throw new Error('bad purpose');
      return c;
    } catch {
      throw new AppError('UNAUTHENTICATED', 'This upload link has expired. Start the upload again.');
    }
  }

  /** Step 2: stream the request body to disk, check it is an APK (zip), record it. */
  async receiveApk(claims: UploadClaims, body: Readable, declaredLength: number | undefined, ip: string) {
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
    const fileName = `TheK-${claims.version.replace(/[^0-9A-Za-z.]+/g, '-')}.apk`;
    const actor: Pick<Actor, 'userId' | 'role'> = { userId: claims.sub, role: 'SUPER_ADMIN' };
    const row = await this.dbs.db.transaction(async (tx) => {
      const [r] = await tx.insert(appReleases).values({ platform: 'ANDROID', version: claims.version, notes: claims.notes, fileName, fileSize: size, sha256, storageKey: key, createdById: claims.sub }).returning();
      await this.audit.record(tx, { actor, action: 'app_release.android_uploaded', entityType: 'app_release', entityId: r.id, outcome: 'SUCCESS', ip, metadata: { version: claims.version, size, sha256 } });
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
    for (const r of rows.slice(KEEP_APKS)) {
      if (!r.storageKey) continue;
      await fs.rm(path.join(dir, path.basename(r.storageKey)), { force: true });
      await this.dbs.db.update(appReleases).set({ storageKey: null, active: false }).where(eq(appReleases.id, r.id));
    }
  }

  /** Absolute path of the latest APK, for the public download. */
  async latestApkFile() {
    const r = await this.latest('ANDROID');
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
