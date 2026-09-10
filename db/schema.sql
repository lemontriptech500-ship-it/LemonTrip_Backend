CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(30),
<<<<<<< HEAD
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

=======
  password_hash TEXT,
  google_id VARCHAR(255) UNIQUE,
  avatar TEXT,
  provider VARCHAR(20) NOT NULL DEFAULT 'local' CHECK (provider IN ('local', 'google')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_google_id ON users (google_id);

-- Safe to re-run: adds Google auth columns if this schema.sql already ran
-- before without them (e.g. on an existing local/production database).
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider VARCHAR(20) NOT NULL DEFAULT 'local';

>>>>>>> dev
CREATE TABLE IF NOT EXISTS flights (
  id VARCHAR(80) PRIMARY KEY,
  origin VARCHAR(10) NOT NULL,
  destination VARCHAR(10) NOT NULL,
  departure_date DATE NOT NULL,
  departure_time TIMESTAMPTZ NOT NULL,
  arrival_time TIMESTAMPTZ NOT NULL,
  price NUMERIC(12, 2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'INR'
);
