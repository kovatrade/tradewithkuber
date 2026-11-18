ALTER TABLE "orders" ADD COLUMN "requested_quantity" integer;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "reduce_only" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE "orders" SET "reduce_only" = true WHERE "type" IN ('STOP_LOSS', 'TAKE_PROFIT');
--> statement-breakpoint
-- Before short entries were enabled, every accepted SELL limit was an exit from a long.
UPDATE "orders" SET "reduce_only" = true WHERE "type" = 'LIMIT' AND "side" = 'SELL' AND "status" = 'OPEN';
