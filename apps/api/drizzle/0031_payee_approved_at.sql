-- Payee accounts: remember whether details were ever approved, so a Super Admin can turn disabled details back on
-- without a new approval. Only one BANK and one UPI account are ACTIVE at a time (enforced by the service).
ALTER TABLE payee_accounts ADD COLUMN IF NOT EXISTS approved_at timestamptz;
UPDATE payee_accounts SET approved_at = coalesce(decided_at, created_at) WHERE status = 'ACTIVE' AND approved_at IS NULL;
UPDATE payee_accounts p SET approved_at = a.at
  FROM (SELECT entity_id, max(created_at) AS at FROM audit_events WHERE action = 'fees.payee_approved' GROUP BY entity_id) a
  WHERE p.id::text = a.entity_id AND p.approved_at IS NULL;
