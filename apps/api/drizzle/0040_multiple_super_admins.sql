-- Several Super Admins may be active at once (a Developer creates them). Replaces the one-admin rule of 0024.
DROP INDEX IF EXISTS "users_one_active_super_admin";
