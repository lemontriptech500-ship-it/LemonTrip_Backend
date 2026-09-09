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
    console.log('PostgreSQL connected')
    return true
  } finally {
    client.release()
  }
}

export async function closeDatabase() {
  await pool.end()
}