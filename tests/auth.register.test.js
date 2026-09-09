import { test } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import app from '../src/app.js'
import { pool } from '../src/config/db.js'

const API = '/api/v1/auth'

test('POST /auth/register creates a new account and returns user + token', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    if (sql.startsWith('SELECT')) return { rows: [] } // no existing user
    return {
      rows: [{ id: 'user-1', name: 'Rahul Sharma', email: 'rahul@example.com', phone: '9876543210' }],
    }
  })

  const res = await request(app).post(`${API}/register`).send({
    name: 'Rahul Sharma',
    email: 'Rahul@Example.com',
    phone: '9876543210',
    password: 'secret1',
  })

  assert.equal(res.status, 201)
  assert.equal(res.body.success, true)
  assert.equal(res.body.data.user.email, 'rahul@example.com')
  assert.equal(typeof res.body.data.token, 'string')
})

test('POST /auth/register rejects a duplicate email with 409', async (t) => {
  t.mock.method(pool, 'query', async () => ({
    rows: [{ id: 'existing-1', email: 'rahul@example.com' }],
  }))

  const res = await request(app).post(`${API}/register`).send({
    name: 'Rahul Sharma',
    email: 'rahul@example.com',
    phone: '9876543210',
    password: 'secret1',
  })

  assert.equal(res.status, 409)
  assert.equal(res.body.success, false)
  assert.match(res.body.error.message, /already registered/i)
})

test('POST /auth/register rejects a short password with 400', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }))

  const res = await request(app).post(`${API}/register`).send({
    name: 'Rahul Sharma',
    email: 'rahul@example.com',
    phone: '9876543210',
    password: '123',
  })

  assert.equal(res.status, 400)
  assert.equal(res.body.success, false)
})

test('POST /auth/register never leaks password_hash back to the client', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    if (sql.startsWith('SELECT')) return { rows: [] }
    return { rows: [{ id: 'user-1', name: 'Rahul Sharma', email: 'rahul@example.com', phone: '9876543210' }] }
  })

  const res = await request(app).post(`${API}/register`).send({
    name: 'Rahul Sharma',
    email: 'rahul@example.com',
    phone: '9876543210',
    password: 'secret1',
  })

  assert.equal(res.body.data.user.password_hash, undefined)
})
