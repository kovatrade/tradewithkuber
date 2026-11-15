-- App downloads page: Android APK files (stored on a disk, APP_FILES_DIR) and iOS TestFlight / App Store links.
CREATE TABLE IF NOT EXISTS app_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform varchar(8) NOT NULL CHECK (platform IN ('ANDROID', 'IOS')),
  version varchar(40) NOT NULL,
  notes text,
  file_name text,
  file_size bigint,
  sha256 char(64),
  storage_key text,
  url text,
  active boolean NOT NULL DEFAULT true,
  created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((platform = 'ANDROID' AND storage_key IS NOT NULL) OR (platform = 'IOS' AND url IS NOT NULL) OR active = false)
);
CREATE INDEX IF NOT EXISTS app_releases_latest_idx ON app_releases(platform, active, created_at DESC);
