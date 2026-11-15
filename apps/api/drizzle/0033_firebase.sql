CREATE TABLE firebase_phone_uses (
  assertion_hash char(64) PRIMARY KEY,
  purpose varchar(12) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE push_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  installation_id varchar(100) NOT NULL UNIQUE,
  token_hash char(64) NOT NULL UNIQUE,
  token_enc text NOT NULL,
  platform varchar(12) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE push_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES push_devices(id) ON DELETE CASCADE,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  last_error varchar(100)
);
--> statement-breakpoint
CREATE INDEX push_deliveries_due_idx ON push_deliveries(next_attempt_at) WHERE finished_at IS NULL;
