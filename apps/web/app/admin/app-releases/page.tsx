'use client';
import { AppReleasesAdmin } from '@/components/app-releases';
import { PageHead } from '@/components/ui';

export default function AppReleases() {
  return (
    <div className="stack" style={{ gap: 24 }}>
      <PageHead title="App downloads" sub="Upload the Android APK and set the iPhone TestFlight link. Users get both from one download page." />
      <AppReleasesAdmin />
    </div>
  );
}
