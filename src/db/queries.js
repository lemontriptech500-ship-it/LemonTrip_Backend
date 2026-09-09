import { pool } from '../config/db.js'

export async function findUserByEmail(email) {
  const result = await pool.query(
    'SELECT id, name, email, phone, password_hash, google_id, avatar, provider FROM users WHERE email = $1 LIMIT 1',
    [email.toLowerCase()],
  )
  return result.rows[0] || null
}

export async function findUserById(id) {
  const result = await pool.query(
    'SELECT id, name, email, phone, avatar, provider FROM users WHERE id = $1 LIMIT 1',
    [id],
  )
  return result.rows[0] || null
}

export async function findUserByGoogleId(googleId) {
  const result = await pool.query(
    'SELECT id, name, email, phone, google_id, avatar, provider FROM users WHERE google_id = $1 LIMIT 1',
    [googleId],
  )
  return result.rows[0] || null
}

export async function createUser({ name, email, phone, passwordHash }) {
  const result = await pool.query(
    'INSERT INTO users (name, email, phone, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, name, email, phone',
    [name, email.toLowerCase(), phone, passwordHash],
  )
  return result.rows[0]
}

export async function createGoogleUser({ name, email, googleId, avatar }) {
  const result = await pool.query(
    `INSERT INTO users (name, email, google_id, avatar, provider)
     VALUES ($1, $2, $3, $4, 'google')
     RETURNING id, name, email, phone, avatar, provider`,
    [name, email.toLowerCase(), googleId, avatar],
  )
  return result.rows[0]
}

export async function linkGoogleAccount({ userId, googleId, avatar }) {
  const result = await pool.query(
    `UPDATE users
     SET google_id = $2, avatar = COALESCE(avatar, $3)
     WHERE id = $1
     RETURNING id, name, email, phone, avatar, provider`,
    [userId, googleId, avatar],
  )
  return result.rows[0]
}
