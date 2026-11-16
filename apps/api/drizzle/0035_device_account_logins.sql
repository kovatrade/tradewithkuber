CREATE TABLE "device_account_logins" (
  "device_hash" char(64) NOT NULL,
  "user_id" uuid NOT NULL CONSTRAINT "device_account_logins_user_id_users_id_fk" REFERENCES "users"("id") ON DELETE CASCADE,
  "first_login_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_login_at" timestamp with time zone DEFAULT now() NOT NULL,
  "device_name" varchar(120),
  "user_agent" varchar(400),
  "ip" varchar(64)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "device_account_logins_pair" ON "device_account_logins" ("device_hash", "user_id");
