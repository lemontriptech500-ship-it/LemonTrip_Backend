import { test } from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import app from '../src/app.js'
import { pool } from '../src/config/db.js'
import { env } from '../src/config/env.js'
import { createUnsubscribeToken } from '../src/services/newsletterTemplate.js'
import { setNewsletterEmailSender } from '../src/services/newsletterService.js'

const API = '/api/v1/newsletter'

function adminToken() {
  return jwt.sign({ id: 'admin-1', email: env.adminEmails[0] || 'admin@example.com' }, env.jwtSecret, { expiresIn: '7d' })
}

test('POST /newsletter/subscribe creates a subscriber', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [{ created: true }] }))
  const res = await request(app).post(`${API}/subscribe`).send({ email: 'Traveler@Example.com' })
  assert.equal(res.status, 201)
  assert.equal(res.body.success, true)
})

test('POST /newsletter/subscribe handles a duplicate subscriber', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [{ created: false }] }))
  const res = await request(app).post(`${API}/subscribe`).send({ email: 'traveler@example.com' })
  assert.equal(res.status, 200)
  assert.equal(res.body.success, true)
})

test('POST /newsletter/unsubscribe deactivates a subscriber', async (t) => {
  let query
  t.mock.method(pool, 'query', async (sql, values) => {
    query = { sql, values }
    return { rows: [] }
  })
  const res = await request(app).post(`${API}/unsubscribe`).send({ email: 'traveler@example.com' })
  assert.equal(res.status, 200)
  assert.match(query.sql, /active = FALSE/)
  assert.deepEqual(query.values, ['traveler@example.com'])
})

test('POST /newsletter/send sends only active subscribers', async (t) => {
  const sent = []
  t.mock.method(pool, 'query', async () => ({ rows: [{ id: 'subscriber-1', email: 'active@example.com' }] }))
  setNewsletterEmailSender(async (message) => { sent.push(message); return { id: 'email-1' } })
  t.after(() => setNewsletterEmailSender())
  const res = await request(app)
    .post(`${API}/send`)
    .set('Authorization', `Bearer ${adminToken()}`)
    .send({ subject: 'Fresh routes', content: '<p>New travel ideas.</p>' })
  assert.equal(res.status, 200)
  assert.equal(res.body.data.sent, 1)
  assert.equal(sent.length, 1)
  assert.equal(sent[0].to, 'active@example.com')
  assert.match(sent[0].html, /Unsubscribe from these emails/)
})

test('POST /newsletter/send returns a provider failure', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [{ id: 'subscriber-1', email: 'active@example.com' }] }))
  setNewsletterEmailSender(async () => { throw new Error('Resend unavailable') })
  t.after(() => setNewsletterEmailSender())
  const res = await request(app)
    .post(`${API}/send`)
    .set('Authorization', `Bearer ${adminToken()}`)
    .send({ subject: 'Fresh routes', content: '<p>New travel ideas.</p>' })
  assert.equal(res.status, 502)
  assert.match(res.body.error.message, /delivery failed/i)
})

test('POST /newsletter/send rejects invalid newsletter content', async () => {
  const res = await request(app)
    .post(`${API}/send`)
    .set('Authorization', `Bearer ${adminToken()}`)
    .send({ subject: '', content: '' })
  assert.equal(res.status, 400)
})

test('POST /newsletter/send rejects unauthorized administrators', async () => {
  const token = jwt.sign({ id: 'user-1', email: 'traveler@example.com' }, env.jwtSecret, { expiresIn: '7d' })
  const res = await request(app)
    .post(`${API}/send`)
    .set('Authorization', `Bearer ${token}`)
    .send({ subject: 'Fresh routes', content: '<p>New travel ideas.</p>' })
  assert.equal(res.status, 403)
})

test('GET /newsletter/unsubscribe deactivates the subscriber from a signed link', async (t) => {
  let query
  t.mock.method(pool, 'query', async (sql, values) => {
    query = { sql, values }
    return { rows: [] }
  })
  const token = createUnsubscribeToken('subscriber-1')
  const res = await request(app).get(`${API}/unsubscribe?token=${encodeURIComponent(token)}`)
  assert.equal(res.status, 200)
  assert.match(res.text, /You are unsubscribed/)
  assert.deepEqual(query.values, ['subscriber-1'])
})

test('GET /newsletter/unsubscribe rejects an invalid link without database access', async (t) => {
  let called = false
  t.mock.method(pool, 'query', async () => { called = true; return { rows: [] } })
  const res = await request(app).get(`${API}/unsubscribe?token=invalid`)
  assert.equal(res.status, 400)
  assert.equal(called, false)
})
