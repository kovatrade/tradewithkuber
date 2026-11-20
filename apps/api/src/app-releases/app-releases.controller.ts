import { Controller, Get, HttpException, Logger, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppError } from '../common/errors';
import { clientIp, requestContext } from '../common/request-context';
import { ActivityLogService } from '../logging/activity-log.service';
import { AppReleasesService } from './app-releases.service';

/**
 * Android APK upload and download.
 *   POST /app-files/upload?token=…   raw APK body; the token comes from createApkUploadLink (Super Admin, 15 minutes)
 *   POST /app-files/ci-upload?version=…&notes=…   raw APK body; Authorization: Bearer APP_RELEASE_CI_TOKEN (GitHub Actions)
 *   GET  /app-files/android/latest   public: the latest APK, as a download
 */
@Controller('app-files')
export class AppReleasesController {
  private readonly log = new Logger('AppReleases');
  constructor(private readonly releases: AppReleasesService, private readonly activity: ActivityLogService) {}

  @Post('upload')
  async upload(@Query('token') token: string, @Req() req: Request, @Res() res: Response) {
    const rc = requestContext.get();
    let outcome: 'OK' | 'ERROR' = 'ERROR';
    let errorCode: string | null = null;
    let userId: string | undefined;
    res.on('finish', () => {
      if (rc) this.activity.record({ rc, userId, opType: 'http', opName: 'app-files.upload', fields: 'POST /app-files/upload', variables: null, outcome, errorCode, durationMs: Date.now() - rc.startedAt });
    });
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (typeof token !== 'string' || token.length > 4000) throw new AppError('UNAUTHENTICATED', 'This upload link has expired. Start the upload again.');
      const claims = this.releases.verifyUpload(token);
      userId = claims.sub;
      const len = Number(req.headers['content-length']);
      const r = await this.releases.receiveApk(claims, req, Number.isFinite(len) ? len : undefined, rc?.ip ?? clientIp(req));
      outcome = 'OK';
      res.status(201).json({ id: r.id, version: r.version, fileName: r.fileName, size: r.fileSize, sha256: r.sha256 });
    } catch (e) {
      const unauth = e instanceof AppError && e.extensions.code === 'UNAUTHENTICATED';
      if (!unauth && !(e instanceof HttpException) && !(e instanceof AppError)) throw e;
      errorCode = unauth ? 'UNAUTHENTICATED' : 'BAD_USER_INPUT';
      if (!req.complete) req.resume(); // drain the rest so the client gets the answer
      res.status(unauth ? 401 : 400).json({ message: (e as Error).message });
    }
  }

  @Post(['ci-upload', 'ci-upload/variant'])
  async ciUpload(@Query('version') version: string, @Query('notes') notes: string | undefined, @Req() req: Request, @Res() res: Response, @Query('abi') abi?: string) {
    const rc = requestContext.get();
    let outcome: 'OK' | 'ERROR' = 'ERROR';
    let errorCode: string | null = null;
    res.on('finish', () => {
      if (rc) this.activity.record({ rc, opType: 'http', opName: 'app-files.ci-upload', fields: 'POST /app-files/ci-upload', variables: null, outcome, errorCode, durationMs: Date.now() - rc.startedAt });
    });
    res.setHeader('Cache-Control', 'no-store');
    try {
      this.releases.verifyCiToken(req.headers.authorization);
      if (typeof version !== 'string' || (notes !== undefined && typeof notes !== 'string')) throw new AppError('BAD_USER_INPUT', 'version is required.');
      const len = Number(req.headers['content-length']);
      const r = await this.releases.receiveFromCi(version, notes, req, Number.isFinite(len) ? len : undefined, rc?.ip ?? clientIp(req), abi);
      outcome = 'OK';
      res.status(201).json({ id: r.id, version: r.version, fileName: r.fileName, size: r.fileSize, sha256: r.sha256 });
    } catch (e) {
      const unauth = e instanceof AppError && e.extensions.code === 'UNAUTHENTICATED';
      if (!req.complete) req.resume();
      if (!unauth && !(e instanceof HttpException) && !(e instanceof AppError)) {
        // Say what went wrong (shown in the GitHub Actions log) instead of a bare "Internal server error".
        const why = this.releases.explainFailure(e);
        this.log.error(`CI APK upload failed: ${why}`, (e as Error).stack);
        errorCode = 'INTERNAL';
        res.status(500).json({ message: why });
        return;
      }
      errorCode = unauth ? 'UNAUTHENTICATED' : 'BAD_USER_INPUT';
      res.status(unauth ? 401 : 400).json({ message: (e as Error).message });
    }
  }

  @Get('android/latest')
  async latest(@Res() res: Response) {
    return this.download(res);
  }

  @Get('android/32-bit/latest')
  async latest32(@Res() res: Response) {
    return this.download(res, 'armeabi-v7a');
  }

  private async download(res: Response, abi?: 'armeabi-v7a') {
    try {
      const { file, row } = await this.releases.latestApkFile(abi);
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (row.sha256) res.setHeader('X-Checksum-SHA256', row.sha256.trim());
      res.type('application/vnd.android.package-archive');
      res.download(file, row.fileName ?? 'TheK.apk', { dotfiles: 'deny', headers: { 'Content-Type': 'application/vnd.android.package-archive' } });
    } catch (e) {
      if (!(e instanceof AppError)) throw e;
      res.status(404).type('text/plain').send('The Android app is not available yet.');
    }
  }
}
