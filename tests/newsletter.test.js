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

test('POST /newsletter/send-test sends only to the configured recipient with a signed unsubscribe link', async (t) => {
  const originalRecipient = env.newsletterTestRecipient
  env.newsletterTestRecipient = 'newsletter-test@example.com'
  t.after(() => { env.newsletterTestRecipient = originalRecipient; setNewsletterEmailSender() })
  const sent = []
  t.mock.method(pool, 'query', async () => ({ rows: [{ id: 'test-subscriber-1', email: 'newsletter-test@example.com' }] }))
  setNewsletterEmailSender(async (message) => { sent.push(message); return { id: 'resend-test-1' } })

  const res = await request(app)
    .post(`${API}/send-test`)
    .set('Authorization', `Bearer ${adminToken()}`)
    .send({ subject: 'Newsletter smoke test', content: '<p>Test content.</p>', recipient: 'ignored@example.com' })

  assert.equal(res.status, 200)
  assert.deepEqual(res.body.data, {
    message: 'Test newsletter sent to the configured test recipient.',
    sent: 1,
    total: 1,
    recipient: 'newsletter-test@example.com',
    emailId: 'resend-test-1',
    unsubscribeLink: res.body.data.unsubscribeLink,
  })
  assert.match(res.body.data.unsubscribeLink, /\/api\/v1\/newsletter\/unsubscribe\?token=/)
  assert.equal(sent.length, 1)
  assert.equal(sent[0].to, 'newsletter-test@example.com')
  assert.equal(sent[0].subject, '[TEST] Newsletter smoke test')
  assert.match(sent[0].html, /Test content/)
  assert.match(sent[0].html, /Unsubscribe from these emails/)
})

test('POST /newsletter/send-test requires an admin and cannot be aimed at another address', async (t) => {
  const sent = []
  setNewsletterEmailSender(async (message) => { sent.push(message); return { id: 'unexpected' } })
  t.after(() => setNewsletterEmailSender())
  const token = jwt.sign({ id: 'user-1', email: 'traveler@example.com' }, env.jwtSecret, { expiresIn: '7d' })
  const res = await request(app)
    .post(`${API}/send-test`)
    .set('Authorization', `Bearer ${token}`)
    .send({ subject: 'No access', content: '<p>No access</p>', recipient: 'another@example.com' })
  assert.equal(res.status, 403)
  assert.equal(sent.length, 0)
})

test('POST /newsletter/send-test reports missing dedicated test-recipient configuration', async (t) => {
  const originalRecipient = env.newsletterTestRecipient
  env.newsletterTestRecipient = ''
  t.after(() => { env.newsletterTestRecipient = originalRecipient })
  const res = await request(app)
    .post(`${API}/send-test`)
    .set('Authorization', `Bearer ${adminToken()}`)
    .send({ subject: 'Newsletter smoke test', content: '<p>Test content.</p>' })
  assert.equal(res.status, 503)
  assert.deepEqual(res.body, { success: false, error: { message: 'Newsletter test sending is not configured. Set NEWSLETTER_TEST_RECIPIENT to a dedicated test inbox.' } })
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
