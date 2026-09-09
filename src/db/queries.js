import { pool } from '../config/db.js'

export async function findUserByEmail(email) {
  const result = await pool.query(
    'SELECT id, name, email, phone, password_hash FROM users WHERE email = $1 LIMIT 1',
    [email.toLowerCase()],
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
