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
    console.log('PostgreSQL connected')
    return true
  } finally {
    client.release()
  }
}

export async function closeDatabase() {
  await pool.end()
}
