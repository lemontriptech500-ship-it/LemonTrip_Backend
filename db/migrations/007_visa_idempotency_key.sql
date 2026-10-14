ALTER TABLE visa_applications ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(120);
CREATE UNIQUE INDEX IF NOT EXISTS idx_visa_applications_user_idem
  ON visa_applications (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
