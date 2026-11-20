ALTER TABLE visa_applications ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE visa_applications ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(160);
CREATE UNIQUE INDEX IF NOT EXISTS visa_applications_user_idempotency
  ON visa_applications (user_id, idempotency_key);
