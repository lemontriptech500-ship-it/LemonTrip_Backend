import { test } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import request from 'supertest'
import app from '../src/app.js'
import { pool } from '../src/config/db.js'

const API = '/api/v1/auth'

test('POST /auth/login succeeds with correct credentials', async (t) => {
  const passwordHash = await bcrypt.hash('secret1', 12)
  t.mock.method(pool, 'query', async () => ({
    rows: [
      {
        id: 'user-1',
        name: 'Rahul Sharma',
        email: 'rahul@example.com',
        phone: '9876543210',
        password_hash: passwordHash,
        provider: 'local',
      },
    ],
  }))

  const res = await request(app).post(`${API}/login`).send({ email: 'rahul@example.com', password: 'secret1' })

  assert.equal(res.status, 200)
  assert.equal(res.body.success, true)
  assert.equal(res.body.data.user.email, 'rahul@example.com')
  assert.equal(res.body.data.user.password_hash, undefined)
  assert.equal(typeof res.body.data.token, 'string')
})

test('POST /auth/login rejects an unknown email with 401', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }))

  const res = await request(app).post(`${API}/login`).send({ email: 'nobody@example.com', password: 'secret1' })

  assert.equal(res.status, 401)
  assert.match(res.body.error.message, /invalid email or password/i)
})

test('POST /auth/login rejects a wrong password with 401', async (t) => {
  const passwordHash = await bcrypt.hash('secret1', 12)
  t.mock.method(pool, 'query', async () => ({
    rows: [{ id: 'user-1', email: 'rahul@example.com', password_hash: passwordHash }],
  }))

  const res = await request(app).post(`${API}/login`).send({ email: 'rahul@example.com', password: 'wrong-pass' })

  assert.equal(res.status, 401)
  assert.match(res.body.error.message, /invalid email or password/i)
})

test('POST /auth/login tells a Google-only account to use Google Sign-In', async (t) => {
  t.mock.method(pool, 'query', async () => ({
    rows: [{ id: 'user-2', email: 'google.user@example.com', password_hash: null, provider: 'google' }],
  }))

  const res = await request(app)
    .post(`${API}/login`)
    .send({ email: 'google.user@example.com', password: 'anything1' })

  assert.equal(res.status, 401)
  assert.match(res.body.error.message, /google sign-in/i)
})

test('POST /auth/login rejects a missing password with 400', async () => {
  const res = await request(app).post(`${API}/login`).send({ email: 'rahul@example.com' })
  assert.equal(res.status, 400)
})
