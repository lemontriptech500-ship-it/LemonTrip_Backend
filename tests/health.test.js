import { test } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import app from '../src/app.js'

test('GET /health returns ok status', async () => {
  const res = await request(app).get('/health')
  assert.equal(res.status, 200)
  assert.equal(res.body.success, true)
  assert.equal(res.body.data.status, 'ok')
})

test('unknown routes return a 404 JSON error', async () => {
  const res = await request(app).get('/api/v1/does-not-exist')
  assert.equal(res.status, 404)
  assert.equal(res.body.success, false)
})
