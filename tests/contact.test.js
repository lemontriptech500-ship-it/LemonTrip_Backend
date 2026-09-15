import { test } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import app from '../src/app.js'
import { pool } from '../src/config/db.js'
import { setSmtpTransport } from '../src/services/smtpService.js'
import { resetContactRateLimit } from '../src/controllers/contactController.js'

const API = '/api/v1/contact'

test.after(() => resetContactRateLimit())

function validPayload() {
  return {
    name: 'Rahul Sharma',
    email: 'rahul@example.com',
    phone: '+91 98765 43210',
    subject: 'Booking help',
    message: 'I need help changing the date on my upcoming booking.',
  }
}

test('POST /contact validates required fields', async () => {
  const res = await request(app).post(API).send({ email: 'invalid' })
  assert.equal(res.status, 400)
  assert.equal(res.body.success, false)
})

test('POST /contact stores and emails a valid message', async (t) => {
  const queries = []
  t.mock.method(pool, 'query', async (sql, values) => {
    queries.push({ sql, values })
    if (sql.startsWith('INSERT')) return { rows: [{ id: 'contact-1' }] }
    return { rows: [] }
  })
  const sent = []
  setSmtpTransport({ sendMail: async (mail) => { sent.push(mail); return { messageId: 'mail-1' } } })
  t.after(() => setSmtpTransport())
  resetContactRateLimit()

  const res = await request(app).post(API).send(validPayload())

  assert.equal(res.status, 201)
  assert.equal(res.body.success, true)
  assert.equal(queries[0].values[1], 'rahul@example.com')
  assert.equal(queries[1].values[0], 'email_sent')
  assert.equal(sent[0].replyTo, 'rahul@example.com')
  assert.equal(sent[0].to, 'lemontripindia@gmail.com')
})

test('POST /contact stores the message and reports SMTP failure', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    if (sql.startsWith('INSERT')) return { rows: [{ id: 'contact-2' }] }
    return { rows: [] }
  })
  setSmtpTransport({ sendMail: async () => { throw new Error('SMTP unavailable') } })
  t.after(() => setSmtpTransport())
  resetContactRateLimit()

  const res = await request(app).post(API).send(validPayload())

  assert.equal(res.status, 502)
  assert.equal(res.body.success, false)
  assert.match(res.body.error.message, /saved/i)
})

test('POST /contact rate limits repeated requests', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    if (sql.startsWith('INSERT')) return { rows: [{ id: 'contact-3' }] }
    return { rows: [] }
  })
  setSmtpTransport({ sendMail: async () => ({ messageId: 'mail-3' }) })
  t.after(() => setSmtpTransport())
  resetContactRateLimit()

  const responses = await Promise.all(Array.from({ length: 6 }, () => request(app).post(API).send(validPayload())))
  assert.equal(responses.filter((res) => res.status === 429).length, 1)
})
