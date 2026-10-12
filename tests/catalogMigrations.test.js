import { test } from 'node:test'
import assert from 'node:assert/strict'
import { migrateDatabase } from '../src/db/migrate.js'

function fakeDatabase({ existingTables = [] } = {}) {
  const applied = new Set()
  let ownLedgerCreated = false
  const migrationsRun = []
  const client = {
    async query(sql, values = []) {
      const text = String(sql)
      if (text.includes("to_regclass('public.lemontrip_website_schema_migrations')")) {
        return { rows: [{ name: ownLedgerCreated ? 'lemontrip_website_schema_migrations' : null }], rowCount: 1 }
      }
      if (text.includes("to_regclass('public.schema_migrations')")) {
        return { rows: [{ name: null }], rowCount: 1 }
      }
      if (text.includes('FROM information_schema.tables')) {
        const rows = existingTables.map((table_name) => ({ table_name }))
        return { rows, rowCount: rows.length }
      }
      if (text.includes('CREATE TABLE IF NOT EXISTS lemontrip_website_schema_migrations')) {
        ownLedgerCreated = true
        return { rows: [], rowCount: 0 }
      }
      if (text.startsWith('SELECT 1 FROM lemontrip_website_schema_migrations')) {
        const rows = applied.has(values[0]) ? [{ '?column?': 1 }] : []
        return { rows, rowCount: rows.length }
      }
      if (text.startsWith('INSERT INTO lemontrip_website_schema_migrations')) {
        applied.add(values[0])
        return { rows: [], rowCount: 1 }
      }
      if (/^\d+_catalog/.test(text.trim())) migrationsRun.push(text)
      if (/CREATE TABLE IF NOT EXISTS (blog_posts|travel_packages|visa_services)/.test(text)) migrationsRun.push(text)
      return { rows: [], rowCount: 0 }
    },
    release() {},
  }
  return { applied, migrationsRun, connect: async () => client }
}

test('fresh database applies each catalog migration and records it', async () => {
  const database = fakeDatabase()
  await migrateDatabase(database)
  assert.equal(database.applied.size, 5)
  assert.match(database.migrationsRun.join('\n'), /CREATE TABLE IF NOT EXISTS blog_posts/)
  assert.match(database.migrationsRun.join('\n'), /CREATE TABLE IF NOT EXISTS travel_packages/)
  assert.match(database.migrationsRun.join('\n'), /CREATE TABLE IF NOT EXISTS visa_services/)
})

test('repeated migration run skips already applied files', async () => {
  const database = fakeDatabase()
  await migrateDatabase(database)
  const initialCount = database.migrationsRun.length
  await migrateDatabase(database)
  assert.equal(database.applied.size, 5)
  assert.equal(database.migrationsRun.length, initialCount)
})

test('existing database tables without a ledger are not automatically baselined', async () => {
  const database = fakeDatabase({ existingTables: ['users'] })
  await assert.rejects(migrateDatabase(database), /review and baseline adoption separately/)
  assert.equal(database.applied.size, 0)
})
