import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { pool } from '../config/db.js'

async function seedDevelopment() {
  const sql = await readFile(fileURLToPath(new URL('../../db/seeds/development.sql', import.meta.url)), 'utf8')
  await pool.query(sql)
  console.log('Development sample catalog seeded (existing rows were preserved)')
  await pool.end()
}

seedDevelopment().catch(async (error) => {
  console.error(`Development seed failed: ${error.message}`)
  await pool.end()
  process.exit(1)
})
