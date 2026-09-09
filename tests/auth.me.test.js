import { test } from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import app from '../src/app.js'
import { pool } from '../src/config/db.js'
import { env } from '../src/config/env.js'

const API = '/api/v1/auth'

function tokenFor(id, email) {
  return jwt.sign({ id, email }, env.jwtSecret, { expiresIn: '7d' })
}

test('GET /auth/me returns the current user for a valid bearer token', async (t) => {
  t.mock.method(pool, 'query', async () => ({
    rows: [{ id: 'user-1', name: 'Rahul Sharma', email: 'rahul@example.com', phone: '9876543210' }],
  }))

  const token = tokenFor('user-1', 'rahul@example.com')
  const res = await request(app).get(`${API}/me`).set('Authorization', `Bearer ${token}`)

  assert.equal(res.status, 200)
  assert.equal(res.body.data.user.email, 'rahul@example.com')
})

test('GET /auth/me rejects a request with no Authorization header', async () => {
  const res = await request(app).get(`${API}/me`)
  assert.equal(res.status, 401)
})

test('GET /auth/me rejects an invalid/tampered token', async () => {
  const res = await request(app).get(`${API}/me`).set('Authorization', 'Bearer not-a-real-token')
  assert.equal(res.status, 401)
})

test('GET /auth/me returns 404 when the token is valid but the user no longer exists', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }))

  const token = tokenFor('ghost-user', 'ghost@example.com')
  const res = await request(app).get(`${API}/me`).set('Authorization', `Bearer ${token}`)

  assert.equal(res.status, 404)
})
