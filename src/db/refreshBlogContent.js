import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { env } from '../config/env.js'
import { pool } from '../config/db.js'

if (env.nodeEnv === 'production') {
  throw new Error('Refusing to run the blog refresh script with NODE_ENV=production')
}

const projectDirectory = fileURLToPath(new URL('../../', import.meta.url))
const refreshSql = await readFile(path.join(projectDirectory, 'db/migrations/009_refresh_blog_content.sql'), 'utf8')
const client = await pool.connect()

try {
  await client.query('BEGIN')
  await client.query(refreshSql)

  const migrationLedger = await client.query("SELECT to_regclass('public.lemontrip_website_schema_migrations') AS name")
  if (migrationLedger.rows[0]?.name) {
    await client.query(
      `INSERT INTO lemontrip_website_schema_migrations (version)
       VALUES ('009_refresh_blog_content.sql')
       ON CONFLICT (version) DO NOTHING`,
    )
  }

  const refreshed = await client.query(
    `SELECT count(*)::int AS count FROM blog_posts
     WHERE id = ANY($1::text[]) AND updated_at >= transaction_timestamp()`,
    [['blog-1', 'blog-2', 'blog-3', 'blog-4', 'blog-5', 'blog-6']],
  )
  if (refreshed.rows[0].count !== 6) {
    throw new Error(`Expected 6 refreshed posts; found ${refreshed.rows[0].count}`)
  }

  await client.query('COMMIT')
  console.log('Refreshed all six blog posts in the configured development database.')
} catch (error) {
  await client.query('ROLLBACK')
  throw error
} finally {
  client.release()
  await pool.end()
}
