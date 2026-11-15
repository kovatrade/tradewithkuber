-- Carry forward: the IST trading day for which a trader carried an open position to the next day (after the
-- carry-forward margin check). Cleared whenever the position's quantity changes.
ALTER TABLE positions ADD COLUMN IF NOT EXISTS cf_date date;
