import { test } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import app from '../src/app.js'
import { pool } from '../src/config/db.js'
import { googleAuthService } from '../src/services/googleAuthService.js'

const API = '/api/v1/auth'

const profile = {
  googleId: 'google-sub-123',
  email: 'rahul@example.com',
  name: 'Rahul Sharma',
  avatar: 'https://lh3.googleusercontent.com/a/avatar.jpg',
}

test('POST /auth/google creates a brand-new user on first Google sign-in', async (t) => {
  t.mock.method(googleAuthService, 'verifyIdToken', async () => profile)
  t.mock.method(pool, 'query', async (sql) => {
    if (sql.includes('google_id = $1')) return { rows: [] } // findUserByGoogleId -> none yet
    if (sql.includes('email = $1')) return { rows: [] } // findUserByEmail -> none yet
    return {
      rows: [{ id: 'user-new', name: profile.name, email: profile.email, phone: null, avatar: profile.avatar, provider: 'google' }],
    } // createGoogleUser
  })

  const res = await request(app).post(`${API}/google`).send({ idToken: 'valid-google-id-token', mode: 'signup' })

  assert.equal(res.status, 200)
  assert.equal(res.body.success, true)
  assert.equal(res.body.data.user.email, 'rahul@example.com')
  assert.equal(res.body.data.user.provider, 'google')
  assert.equal(typeof res.body.data.token, 'string')
})

test('POST /auth/google logs in an existing Google user without creating a duplicate', async (t) => {
  t.mock.method(googleAuthService, 'verifyIdToken', async () => profile)
  let insertCalled = false
  t.mock.method(pool, 'query', async (sql) => {
    if (sql.includes('INSERT')) insertCalled = true
    if (sql.includes('google_id = $1')) {
      return { rows: [{ id: 'user-existing', name: profile.name, email: profile.email, avatar: profile.avatar, provider: 'google' }] }
    }
    return { rows: [] }
  })

  const res = await request(app).post(`${API}/google`).send({ idToken: 'valid-google-id-token' })

  assert.equal(res.status, 200)
  assert.equal(res.body.data.user.id, 'user-existing')
  assert.equal(insertCalled, false)
})

test('POST /auth/google links Google to an existing local account with the same email', async (t) => {
  t.mock.method(googleAuthService, 'verifyIdToken', async () => profile)
  let linkCalled = false
  t.mock.method(pool, 'query', async (sql) => {
    if (sql.includes('google_id = $1')) return { rows: [] } // no google user yet
    if (sql.startsWith('SELECT') && sql.includes('email = $1')) {
      return { rows: [{ id: 'user-local', name: 'Rahul Sharma', email: profile.email, provider: 'local' }] }
    }
    if (sql.startsWith('UPDATE')) {
      linkCalled = true
      return { rows: [{ id: 'user-local', name: 'Rahul Sharma', email: profile.email, avatar: profile.avatar, provider: 'local' }] }
    }
    return { rows: [] }
  })

  const res = await request(app).post(`${API}/google`).send({ idToken: 'valid-google-id-token' })

  assert.equal(res.status, 200)
  assert.equal(res.body.data.user.id, 'user-local')
  assert.equal(linkCalled, true)
})

test('POST /auth/google rejects an unknown account during Google sign-in', async (t) => {
  t.mock.method(googleAuthService, 'verifyIdToken', async () => profile)
  t.mock.method(pool, 'query', async () => ({ rows: [] }))

  const res = await request(app).post(`${API}/google`).send({ idToken: 'valid-google-id-token', mode: 'signin' })

  assert.equal(res.status, 404)
  assert.match(res.body.error.message, /create an account first/i)
})

test('POST /auth/google rejects an invalid/expired Google token with 401', async (t) => {
  t.mock.method(googleAuthService, 'verifyIdToken', async () => {
    const error = new Error('Invalid or expired Google token')
    error.status = 401
    throw error
  })

  const res = await request(app).post(`${API}/google`).send({ idToken: 'garbage-token' })

  assert.equal(res.status, 401)
  assert.match(res.body.error.message, /invalid or expired google token/i)
})

test('POST /auth/google returns 400 when idToken is missing', async () => {
  const res = await request(app).post(`${API}/google`).send({})
  assert.equal(res.status, 400)
})
