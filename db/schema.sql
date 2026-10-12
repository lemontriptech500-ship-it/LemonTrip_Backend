CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  source VARCHAR(80) NOT NULL DEFAULT 'website-footer',
  subscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unsubscribed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_active ON newsletter_subscribers (active);

CREATE TABLE IF NOT EXISTS contact_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  subject VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'email_sent', 'email_failed', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_messages_created_at ON contact_messages (created_at DESC);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(30),
  password_hash TEXT,
  google_id VARCHAR(255) UNIQUE,
  avatar TEXT,
  provider VARCHAR(20) NOT NULL DEFAULT 'local' CHECK (provider IN ('local', 'google')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_google_id ON users (google_id);

CREATE TABLE IF NOT EXISTS chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_updated ON chat_conversations (user_id, updated_at DESC);

-- Safe to re-run: adds Google auth columns if this schema.sql already ran
-- before without them (e.g. on an existing local/production database).
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider VARCHAR(20) NOT NULL DEFAULT 'local';

CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  balance_paise BIGINT NOT NULL DEFAULT 0 CHECK (balance_paise >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  transaction_reference VARCHAR(80) NOT NULL UNIQUE,
  type VARCHAR(10) NOT NULL CHECK (type IN ('CREDIT', 'DEBIT')),
  source VARCHAR(20) NOT NULL CHECK (source IN ('TOPUP', 'BOOKING', 'REFUND', 'ADJUSTMENT')),
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  balance_before_paise BIGINT NOT NULL CHECK (balance_before_paise >= 0),
  balance_after_paise BIGINT NOT NULL CHECK (balance_after_paise >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'SUCCESS' CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED', 'REVERSED')),
  description VARCHAR(255) NOT NULL,
  booking_reference VARCHAR(80),
  payment_reference VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallet_topups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  topup_reference VARCHAR(80) NOT NULL UNIQUE,
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  razorpay_order_id VARCHAR(100) NOT NULL UNIQUE,
  razorpay_payment_id VARCHAR(100) UNIQUE,
  razorpay_signature TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED', 'REVERSED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_date ON wallet_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet_date ON wallet_transactions (wallet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_topups_user_date ON wallet_topups (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_topups_payment_id ON wallet_topups (razorpay_payment_id) WHERE razorpay_payment_id IS NOT NULL;

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

CREATE TABLE IF NOT EXISTS flight_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_reference VARCHAR(32) UNIQUE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  flight_id VARCHAR(80) NOT NULL,
  fare_id VARCHAR(80) NOT NULL,
  travellers JSONB NOT NULL DEFAULT '[]'::jsonb,
  contact JSONB NOT NULL DEFAULT '{}'::jsonb,
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  coupon_code VARCHAR(40),
  discount_paise INTEGER NOT NULL DEFAULT 0 CHECK (discount_paise >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS flight_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES flight_bookings(id) ON DELETE CASCADE,
  provider VARCHAR(30) NOT NULL DEFAULT 'razorpay',
  provider_order_id VARCHAR(100) UNIQUE NOT NULL,
  provider_payment_id VARCHAR(100) UNIQUE,
  signature TEXT,
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  status VARCHAR(20) NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'paid', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_flight_bookings_user ON flight_bookings (user_id);
CREATE INDEX IF NOT EXISTS idx_flight_payments_booking ON flight_payments (booking_id);

CREATE TABLE IF NOT EXISTS coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(40) UNIQUE NOT NULL,
  discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('percentage', 'flat')),
  discount_value NUMERIC(12, 2) NOT NULL CHECK (discount_value > 0),
  min_order_paise INTEGER NOT NULL DEFAULT 0 CHECK (min_order_paise >= 0),
  max_discount_paise INTEGER NOT NULL CHECK (max_discount_paise > 0),
  valid_until DATE NOT NULL,
  applicable_on TEXT[] NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons (UPPER(code));

ALTER TABLE flights
  ADD COLUMN IF NOT EXISTS airline           text,
  ADD COLUMN IF NOT EXISTS airline_code      text,
  ADD COLUMN IF NOT EXISTS flight_number     text,
  ADD COLUMN IF NOT EXISTS duration_minutes  integer,
  ADD COLUMN IF NOT EXISTS stops             integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stop_locations    text[],
  ADD COLUMN IF NOT EXISTS travel_class      text DEFAULT 'economy',
  ADD COLUMN IF NOT EXISTS refundable        boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS baggage_allowance text,
  ADD COLUMN IF NOT EXISTS segments          jsonb,
  ADD COLUMN IF NOT EXISTS fare_options      jsonb;
  

CREATE TABLE IF NOT EXISTS bus_services (
  id VARCHAR(80) PRIMARY KEY,
  operator VARCHAR(140) NOT NULL,
  origin VARCHAR(120) NOT NULL,
  destination VARCHAR(120) NOT NULL,
  departure_time TIME NOT NULL,
  arrival_time TIME NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  duration_label VARCHAR(40) NOT NULL,
  bus_type VARCHAR(100) NOT NULL,
  price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  seats_left INTEGER NOT NULL DEFAULT 0 CHECK (seats_left >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bus_services_route ON bus_services (LOWER(origin), LOWER(destination));
CREATE INDEX IF NOT EXISTS idx_bus_services_departure ON bus_services (departure_time);
CREATE INDEX IF NOT EXISTS idx_bus_services_metadata ON bus_services USING GIN (metadata);

CREATE TABLE IF NOT EXISTS train_services (
  id VARCHAR(80) PRIMARY KEY,
  train_number VARCHAR(30) NOT NULL,
  name VARCHAR(160) NOT NULL,
  origin VARCHAR(120) NOT NULL,
  destination VARCHAR(120) NOT NULL,
  departure_time TIME NOT NULL,
  arrival_time TIME NOT NULL,
  duration_label VARCHAR(40) NOT NULL,
  classes TEXT[] NOT NULL DEFAULT '{}',
  price_amount NUMERIC(12, 2) NOT NULL CHECK (price_amount > 0),
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS travel_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_reference VARCHAR(32) UNIQUE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  item_type VARCHAR(20) NOT NULL CHECK (item_type IN ('hotel', 'bus', 'train', 'package')),
  item_id VARCHAR(80) NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  coupon_code VARCHAR(40),
  discount_paise INTEGER NOT NULL DEFAULT 0 CHECK (discount_paise >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS provider VARCHAR(30);
ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS provider_booking_reference VARCHAR(120);
ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS provider_response JSONB;
CREATE UNIQUE INDEX IF NOT EXISTS idx_travel_bookings_provider_reference ON travel_bookings (provider_booking_reference) WHERE provider_booking_reference IS NOT NULL;

ALTER TABLE travel_bookings DROP CONSTRAINT IF EXISTS travel_bookings_item_type_check;
ALTER TABLE travel_bookings ADD CONSTRAINT travel_bookings_item_type_check CHECK (item_type IN ('hotel', 'bus', 'train', 'package'));
ALTER TABLE travel_bookings DROP CONSTRAINT IF EXISTS travel_bookings_status_check;
ALTER TABLE travel_bookings ADD CONSTRAINT travel_bookings_status_check CHECK (status IN ('pending', 'confirmed', 'failed', 'cancelled', 'PENDING_PAYMENT', 'PAYMENT_SUCCESS', 'BOOKING_IN_PROGRESS', 'CONFIRMED', 'BOOKING_FAILED', 'CANCELLED', 'REFUND_PENDING', 'REFUNDED'));
ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS supplier VARCHAR(40);
ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS supplier_hotel_code VARCHAR(80);
ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS supplier_rate_key TEXT;
ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS supplier_booking_reference VARCHAR(120);
ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS supplier_confirmation_number VARCHAR(120);
ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS supplier_amount NUMERIC(12, 2);
ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS supplier_currency CHAR(3);
ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS cancellation_policy TEXT;
ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS check_in DATE;
ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS check_out DATE;
ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS supplier_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS pnr VARCHAR(40);
ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS supplier_status VARCHAR(40);
ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS supplier_fare NUMERIC(12, 2);
ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS supplier_currency CHAR(3);
ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS cancellation_status VARCHAR(40);
ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS refund_status VARCHAR(40);
ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS refund_amount_paise INTEGER;
ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(120);
ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS supplier_raw_response JSONB;
CREATE UNIQUE INDEX IF NOT EXISTS idx_travel_bookings_idempotency_key ON travel_bookings (idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS travel_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES travel_bookings(id) ON DELETE CASCADE,
  provider VARCHAR(30) NOT NULL DEFAULT 'razorpay',
  provider_order_id VARCHAR(100) UNIQUE NOT NULL,
  provider_payment_id VARCHAR(100) UNIQUE,
  signature TEXT,
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  status VARCHAR(20) NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'paid', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_travel_bookings_user ON travel_bookings (user_id);
CREATE INDEX IF NOT EXISTS idx_travel_payments_booking ON travel_payments (booking_id);

CREATE TABLE IF NOT EXISTS irctc_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  travel_booking_id UUID NOT NULL UNIQUE REFERENCES travel_bookings(id) ON DELETE CASCADE,
  provider VARCHAR(30) NOT NULL DEFAULT 'irctc',
  pnr VARCHAR(30),
  ticket_number VARCHAR(80),
  provider_reference VARCHAR(120),
  passenger_details JSONB NOT NULL DEFAULT '[]'::jsonb,
  ticket_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider_response JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONFIRMED', 'CANCELLED', 'FAILED')),
  refund_amount_paise INTEGER NOT NULL DEFAULT 0 CHECK (refund_amount_paise >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_irctc_bookings_pnr ON irctc_bookings (pnr) WHERE pnr IS NOT NULL;

CREATE TABLE IF NOT EXISTS bus_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_reference VARCHAR(32) UNIQUE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  bus_id VARCHAR(80) NOT NULL REFERENCES bus_services(id),
  passenger_count INTEGER NOT NULL CHECK (passenger_count > 0),
  contact JSONB NOT NULL DEFAULT '{}'::jsonb,
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  coupon_code VARCHAR(40),
  discount_paise INTEGER NOT NULL DEFAULT 0 CHECK (discount_paise >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bus_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bus_bookings(id) ON DELETE CASCADE,
  provider VARCHAR(30) NOT NULL DEFAULT 'razorpay',
  provider_order_id VARCHAR(100) UNIQUE NOT NULL,
  provider_payment_id VARCHAR(100) UNIQUE,
  signature TEXT,
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  status VARCHAR(20) NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'paid', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_bus_bookings_user ON bus_bookings (user_id);
CREATE INDEX IF NOT EXISTS idx_bus_payments_booking ON bus_payments (booking_id);

CREATE TABLE IF NOT EXISTS hotels (
  id VARCHAR(80) PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  city VARCHAR(100) NOT NULL,
  area VARCHAR(120) NOT NULL,
  property_type VARCHAR(30) NOT NULL,
  star_rating SMALLINT NOT NULL CHECK (star_rating BETWEEN 1 AND 5),
  guest_rating NUMERIC(2, 1) NOT NULL DEFAULT 0,
  guest_review_count INTEGER NOT NULL DEFAULT 0,
  starting_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  description TEXT NOT NULL,
  catalog JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hotels_city ON hotels (LOWER(city));
CREATE INDEX IF NOT EXISTS idx_hotels_property_type ON hotels (property_type);
CREATE INDEX IF NOT EXISTS idx_hotels_starting_price ON hotels (starting_price);
CREATE INDEX IF NOT EXISTS idx_hotels_catalog ON hotels USING GIN (catalog);

