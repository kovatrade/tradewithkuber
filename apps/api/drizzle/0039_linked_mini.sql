-- A Mini script priced from its Mega contract (SILVERM-04Dec2026-LNK follows SILVER-04Dec2026-FUT).
ALTER TABLE "instruments" ADD COLUMN "price_source_id" uuid REFERENCES "instruments"("id");
