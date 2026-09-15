import pg from 'pg'
import { env } from './env.js'

const { Pool } = pg

export const pool = new Pool({
  connectionString: env.databaseUrl || undefined,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
  ssl: env.databaseUrl && env.databaseUrl.includes('localhost')
    ? false
    : { rejectUnauthorized: false },
})

export async function connectDatabase() {
  if (!env.databaseUrl) {
    console.warn('DATABASE_URL is not configured. Database queries will be unavailable.')
    return false
  }

  const client = await pool.connect()
  try {
    await client.query('SELECT 1')
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        messages JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await client.query('CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_updated ON chat_conversations (user_id, updated_at DESC)')
    await client.query(`
      CREATE TABLE IF NOT EXISTS newsletter_subscribers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        source VARCHAR(80) NOT NULL DEFAULT 'website-footer',
        subscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        unsubscribed_at TIMESTAMPTZ
      )
    `)
    await client.query('CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_active ON newsletter_subscribers (active)')
    await client.query(`
      CREATE TABLE IF NOT EXISTS contact_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(120) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(30) NOT NULL,
        subject VARCHAR(200) NOT NULL,
        message TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'email_sent', 'email_failed')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await client.query('CREATE INDEX IF NOT EXISTS idx_contact_messages_created_at ON contact_messages (created_at DESC)')
    await client.query('ALTER TABLE travel_bookings DROP CONSTRAINT IF EXISTS travel_bookings_status_check')
    await client.query("ALTER TABLE travel_bookings ADD CONSTRAINT travel_bookings_status_check CHECK (status IN ('pending', 'confirmed', 'failed', 'cancelled', 'PENDING_PAYMENT', 'PAYMENT_SUCCESS', 'BOOKING_IN_PROGRESS', 'CONFIRMED', 'BOOKING_FAILED', 'CANCELLED', 'REFUND_PENDING', 'REFUNDED'))")
    await client.query('ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS supplier VARCHAR(40)')
    await client.query('ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS supplier_hotel_code VARCHAR(80)')
    await client.query('ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS supplier_rate_key TEXT')
    await client.query('ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS supplier_booking_reference VARCHAR(120)')
    await client.query('ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS supplier_confirmation_number VARCHAR(120)')
    await client.query('ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS supplier_amount NUMERIC(12, 2)')
    await client.query('ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS supplier_currency CHAR(3)')
    await client.query('ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS cancellation_policy TEXT')
    await client.query('ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS check_in DATE')
    await client.query('ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS check_out DATE')
    await client.query("ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS supplier_metadata JSONB NOT NULL DEFAULT '{}'::jsonb")
    await client.query('ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS pnr VARCHAR(40)')
    await client.query('ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS supplier_status VARCHAR(40)')
    await client.query('ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS supplier_fare NUMERIC(12, 2)')
    await client.query('ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS supplier_currency CHAR(3)')
    await client.query('ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS cancellation_status VARCHAR(40)')
    await client.query('ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS refund_status VARCHAR(40)')
    await client.query('ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS refund_amount_paise INTEGER')
    await client.query('ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(120)')
    await client.query('ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS supplier_raw_response JSONB')
    await client.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_travel_bookings_idempotency_key ON travel_bookings (idempotency_key) WHERE idempotency_key IS NOT NULL')
    console.log('PostgreSQL connected')
    return true
  } finally {
    client.release()
  }
}

export async function closeDatabase() {
  await pool.end()
}
