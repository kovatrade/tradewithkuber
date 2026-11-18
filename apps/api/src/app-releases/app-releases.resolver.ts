import { Args, Field, Float, ID, Int, Mutation, ObjectType, Query, Resolver } from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';
import type { Actor, GqlContext } from '../common/context';
import { Ctx, CurrentActor, lim, Public, RequireStepUp, Roles } from '../common/context';
import type { AppReleaseRow } from '../db/schema';
import { env } from '../config/env';
import { AppReleasesService } from './app-releases.service';

@ObjectType()
class AppRelease {
  @Field(() => ID) id: string;
  @Field({ description: 'ANDROID or IOS' }) platform: string;
  @Field({ nullable: true, description: 'Android CPU architecture; absent on older releases.' }) abi?: string;
  @Field() version: string;
  @Field({ nullable: true }) notes?: string;
  @Field({ nullable: true, description: 'Android: file name the phone saves.' }) fileName?: string;
  @Field(() => Float, { nullable: true, description: 'Android: size in bytes.' }) fileSize?: number;
  @Field({ nullable: true, description: 'Android: SHA-256 of the APK.' }) sha256?: string;
  @Field({ nullable: true, description: 'Android: download path on this server (relative), when the file is available.' }) downloadPath?: string;
  @Field({ nullable: true, description: 'iOS: TestFlight or App Store link.' }) url?: string;
  @Field() active: boolean;
  @Field() createdAt: Date;
}

@ObjectType()
class AppDownloads {
  @Field(() => AppRelease, { nullable: true }) android?: AppRelease;
  @Field(() => AppRelease, { nullable: true }) android32?: AppRelease;
  @Field(() => AppRelease, { nullable: true }) ios?: AppRelease;
}

@ObjectType()
class AppReleaseAdmin {
  @Field({ description: 'False until a persistent disk is attached and APP_FILES_DIR is set.' }) uploadsEnabled: boolean;
  @Field(() => Int) maxUploadMb: number;
  @Field({ description: 'True when GitHub Actions can publish new APKs automatically (APP_RELEASE_CI_TOKEN is set).' }) autoPublish: boolean;
  @Field(() => [AppRelease]) history: AppRelease[];
}

@ObjectType()
class UploadLink {
  @Field({ description: 'POST the APK file (raw body) to this path on the API host.' }) path: string;
  @Field(() => Int) expiresIn: number;
  @Field(() => Float) maxBytes: number;
}

const toRelease = (r: AppReleaseRow): AppRelease => ({
  id: r.id, platform: r.platform, abi: r.abi ?? undefined, version: r.version, notes: r.notes ?? undefined, fileName: r.fileName ?? undefined,
  fileSize: r.fileSize ?? undefined, sha256: r.sha256?.trim() ?? undefined,
  downloadPath: r.platform === 'ANDROID' && r.storageKey && r.active ? r.abi === 'armeabi-v7a' ? '/app-files/android/32-bit/latest' : '/app-files/android/latest' : undefined,
  url: r.url ?? undefined, active: r.active, createdAt: r.createdAt,
});

@Resolver()
export class AppReleasesResolver {
  constructor(private readonly releases: AppReleasesService) {}

  @Public()
  @Query(() => AppDownloads, { description: 'Public: the latest Android APK and iOS link for the download page.' })
  async appDownloads(): Promise<AppDownloads> {
    const [android, android32, ios] = await Promise.all([this.releases.latest('ANDROID'), this.releases.latest('ANDROID', 'armeabi-v7a'), this.releases.latest('IOS')]);
    return { android: android ? toRelease(android) : undefined, android32: android32 ? toRelease(android32) : undefined, ios: ios ? toRelease(ios) : undefined };
  }

  @Roles('SUPER_ADMIN', 'DEVELOPER')
  @Query(() => AppReleaseAdmin, { description: 'Super Admin: release history and whether uploads are set up.' })
  async appReleases(@Args('limit', { type: () => Int, nullable: true }) limit?: number): Promise<AppReleaseAdmin> {
    return { uploadsEnabled: !!this.releases.filesDir, maxUploadMb: env().APK_MAX_MB, autoPublish: !!env().APP_RELEASE_CI_TOKEN, history: (await this.releases.history(limit ?? 30)).map(toRelease) };
  }

  @Roles('SUPER_ADMIN', 'DEVELOPER')
  @RequireStepUp()
  @Throttle({ default: { limit: lim(10), ttl: 60_000 } })
  @Mutation(() => UploadLink, { description: 'Super Admin: a 15-minute link to upload a new Android APK.' })
  createApkUploadLink(@CurrentActor() a: Actor, @Args('version') version: string, @Args('notes', { type: () => String, nullable: true }) notes: string | undefined, @Ctx() c: GqlContext, @Args('abi', { type: () => String, nullable: true }) abi?: string) {
    return this.releases.createUploadLink(a, version, notes, c.ip, abi);
  }

  @Roles('SUPER_ADMIN', 'DEVELOPER')
  @RequireStepUp()
  @Mutation(() => AppRelease, { description: 'Super Admin: publish the iOS TestFlight or App Store link.' })
  async setIosRelease(@CurrentActor() a: Actor, @Args('url') url: string, @Args('version') version: string, @Args('notes', { type: () => String, nullable: true }) notes: string | undefined, @Ctx() c: GqlContext) {
    return toRelease(await this.releases.setIos(a, url, version, notes, c.ip));
  }

  @Roles('SUPER_ADMIN', 'DEVELOPER')
  @RequireStepUp()
  @Mutation(() => AppRelease, { description: 'Super Admin: take a release off the download page (it stays in history).' })
  async hideAppRelease(@CurrentActor() a: Actor, @Args('id', { type: () => ID }) id: string, @Ctx() c: GqlContext) {
    return toRelease(await this.releases.hide(a, id, c.ip));
  }
}
