-- Keep the default 64-bit APK separate from the compatibility APK for 32-bit phones.
-- Existing releases remain valid universal/unspecified downloads.
ALTER TABLE app_releases ADD COLUMN IF NOT EXISTS abi varchar(16);
ALTER TABLE app_releases ADD CONSTRAINT app_releases_abi_check
  CHECK (abi IS NULL OR (platform = 'ANDROID' AND abi IN ('arm64-v8a', 'armeabi-v7a', 'universal')));
CREATE INDEX IF NOT EXISTS app_releases_abi_latest_idx ON app_releases(platform, abi, active, created_at DESC);
