import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import app from '../src/app.js'
import { pool } from '../src/config/db.js'
import { env } from '../src/config/env.js'

const API = '/api/v1/admin/packages'

function token(email = env.adminEmails[0] || 'admin@example.com') {
  return jwt.sign({ id: 'admin-1', email }, env.jwtSecret, { expiresIn: '7d' })
}

const payload = {
  destination: 'Kerala Backwaters Escape',
  duration: '5 Days, 4 Nights',
  description: 'A peaceful journey through Kerala backwaters and hill country.',
  startingPrice: 'From INR 39,900',
  priceAmount: 39900,
  currency: 'INR',
  category: 'national',
  highlights: ['Houseboat stay', 'Local food tour'],
  imageFallbackColor: 'bg-[var(--color-secondary-soft)]',
  imageUrl: 'https://images.example.com/kerala.jpg',
}

afterEach(() => {})

test('admin package list requires admin access', async () => {
  const res = await request(app).get(API)
  assert.equal(res.status, 401)
})

test('admin can create a package', async (t) => {
  let queryText
  t.mock.method(pool, 'query', async (sql) => {
    queryText = sql
    return { rows: [{ id: 'pkg-kerala-test', ...payload }], rowCount: 1 }
  })

  const res = await request(app).post(API).set('Authorization', `Bearer ${token()}`).send(payload)
  assert.equal(res.status, 201)
  assert.equal(res.body.success, true)
  assert.equal(res.body.data.destination, payload.destination)
  assert.match(queryText, /INSERT INTO travel_packages/)
})

test('admin cannot create an invalid package', async () => {
  const res = await request(app).post(API).set('Authorization', `Bearer ${token()}`).send({ ...payload, priceAmount: 0 })
  assert.equal(res.status, 400)
  assert.match(res.body.error.message, /Price amount/)
})
