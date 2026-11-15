import { Controller, Get, HttpException, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppError } from '../common/errors';
import { clientIp, requestContext } from '../common/request-context';
import { ActivityLogService } from '../logging/activity-log.service';
import { AppReleasesService } from './app-releases.service';

/**
 * Android APK upload and download.
 *   POST /app-files/upload?token=…   raw APK body; the token comes from createApkUploadLink (Super Admin, 15 minutes)
 *   GET  /app-files/android/latest   public: the latest APK, as a download
 */
@Controller('app-files')
export class AppReleasesController {
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

  @Get('android/latest')
  async latest(@Res() res: Response) {
    try {
      const { file, row } = await this.releases.latestApkFile();
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
