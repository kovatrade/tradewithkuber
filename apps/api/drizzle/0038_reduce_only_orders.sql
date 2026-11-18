ALTER TABLE "orders" ADD COLUMN "requested_quantity" integer;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "reduce_only" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- A fresh database applies 0004 and this migration in the same transaction. Compare as
-- text so PostgreSQL 16 does not try to use the new enum values before they are committed.
UPDATE "orders" SET "reduce_only" = true WHERE "type"::text IN ('STOP_LOSS', 'TAKE_PROFIT');
--> statement-breakpoint
-- Before short entries were enabled, every accepted SELL limit was an exit from a long.
UPDATE "orders" SET "reduce_only" = true WHERE "type" = 'LIMIT' AND "side" = 'SELL' AND "status" = 'OPEN';
