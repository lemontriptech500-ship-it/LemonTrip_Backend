import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool } from '../config/db.js'

const migrationsDirectory = fileURLToPath(new URL('../../db/migrations/', import.meta.url))
const ledgerTable = 'lemontrip_website_schema_migrations'
const migrationLock = 72416031
const allowReviewedExistingSchema = process.argv.includes('--allow-existing-schema-reviewed')

export async function migrateDatabase(database = pool) {
  const client = await database.connect()
  try {
    await client.query('SELECT pg_advisory_lock($1)', [migrationLock])
    const ownLedger = await client.query(`SELECT to_regclass('public.${ledgerTable}') AS name`)
    const files = (await readdir(migrationsDirectory))
      .filter((name) => /^\d+_[a-z0-9_]+\.sql$/.test(name))
      .sort()

    if (!ownLedger.rows[0]?.name) {
      const legacyLedger = await client.query("SELECT to_regclass('public.schema_migrations') AS name")
      let recordedHere = []
      if (legacyLedger.rows[0]?.name) {
        const result = await client.query('SELECT version FROM schema_migrations')
        const recorded = new Set(result.rows.map((row) => row.version))
        recordedHere = files.filter((file) => recorded.has(file))
      }
      if (!recordedHere.length && !allowReviewedExistingSchema) {
        const existing = await client.query(
          `SELECT table_name FROM information_schema.tables
           WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
             AND table_name NOT IN ('schema_migrations')`,
        )
        if (existing.rowCount) {
          throw new Error(`Existing database tables found without recorded website migrations (${existing.rows.map((r) => r.table_name).join(', ')}). Migration stopped; review and baseline adoption separately.`)
        }
      }

      await client.query(`CREATE TABLE IF NOT EXISTS ${ledgerTable} (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`)
      if (recordedHere.length) {
        await client.query(
          `INSERT INTO ${ledgerTable} (version, applied_at)
           SELECT version, applied_at FROM schema_migrations WHERE version = ANY($1::text[])
           ON CONFLICT (version) DO NOTHING`,
          [recordedHere],
        )
      }
    }

    for (const file of files) {
      const applied = await client.query(`SELECT 1 FROM ${ledgerTable} WHERE version = $1`, [file])
      if (applied.rowCount) continue
      const sql = await readFile(path.join(migrationsDirectory, file), 'utf8')
      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query(`INSERT INTO ${ledgerTable} (version) VALUES ($1)`, [file])
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
      console.log(`Applied migration ${file}`)
    }
  } finally {
    try { await client.query('SELECT pg_advisory_unlock($1)', [migrationLock]) } finally { client.release() }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  migrateDatabase().then(() => pool.end()).catch(async (error) => {
    console.error(`Migration failed: ${error.message}`)
    await pool.end()
    process.exitCode = 1
  })
}
