import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pool } from '../src/config/db.js'
import { createApplication, trackApplication } from '../src/controllers/visaController.js'

const applicant = () => ({
  user: { id: 'user-1' },
  body: { serviceId: 'visa-1', personalDetails: JSON.stringify({ fullName: 'Test Traveller', email: 'test@example.com', dateOfBirth: '1990-04-15' }), passportDetails: JSON.stringify({ passportNumber: 'P123456' }), travelDetails: JSON.stringify({ intendedEntryDate: '2030-05-01' }) },
  files: Object.fromEntries(['passportFront', 'passportBack', 'photograph'].map(key => [key, [{ location: `https://example.com/${key}` }]])),
  get: () => 'visa-retry-key',
})
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } })
const fail = error => { throw error }

test('application saves date of birth, all uploads, and retry key and returns stored application ID', async t => {
  let insert
  t.mock.method(pool, 'query', async (sql, values) => {
    if (sql.includes('INSERT')) { insert = { sql, values }; return { rows: [{ id: 'LT-VISA-STORED', status: 'submitted' }] } }
    return { rows: [{ id: 'visa-1' }] }
  })
  const result = response()
  await createApplication(applicant(), result, fail)
  assert.equal(result.statusCode, 201)
  assert.equal(result.body.data.applicationId, 'LT-VISA-STORED')
  assert.equal(insert.values[10], '1990-04-15')
  assert.equal(insert.values[11], 'visa-retry-key')
  assert.deepEqual(insert.values.slice(7, 10), ['https://example.com/passportFront', 'https://example.com/passportBack', 'https://example.com/photograph'])
  assert.match(insert.sql, /ON CONFLICT \(user_id, idempotency_key\)/)
})

test('malformed JSON, invalid dates, missing files, and invalid retry keys return readable 400 errors', async t => {
  t.mock.method(pool, 'query', async () => { throw new Error('Validation must run before database writes') })
  for (const mutate of [
    request => { request.body.personalDetails = '{' },
    request => { request.body.personalDetails = JSON.stringify({ fullName: 'Test', email: 'bad' }) },
    request => { request.body.personalDetails = JSON.stringify({ fullName: 'Test', email: 'test@example.com', dateOfBirth: '2000-02-30' }) },
    request => { request.body.travelDetails = JSON.stringify({ intendedEntryDate: '2030-02-30' }) },
    request => { delete request.files.photograph },
    request => { request.get = () => 'invalid key' },
  ]) {
    const request = applicant(); mutate(request)
    const result = response(); await createApplication(request, result, fail)
    assert.equal(result.statusCode, 400)
    assert.equal(typeof result.body.error.message, 'string')
  }
})

test('tracking scopes application details and uploaded document flags to the authenticated owner', async t => {
  t.mock.method(pool, 'query', async (sql, values) => {
    assert.match(sql, /a\.user_id = \$2/)
    assert.deepEqual(values, ['LT-VISA-1', 'owner'])
    assert.match(sql, /date_of_birth/)
    return { rows: [{ id: 'LT-VISA-1', applicantName: 'Test', status: 'submitted', dateOfBirth: '1990-04-15', passportFront: true, passportBack: true, applicantPhoto: true }] }
  })
  const result = response()
  await trackApplication({ params: { applicationId: 'LT-VISA-1' }, user: { id: 'owner' } }, result, fail)
  assert.deepEqual(result.body.data.uploadedDocuments, { passportFront: true, passportBack: true, applicantPhoto: true })
  assert.equal(result.body.data.dateOfBirth, '1990-04-15')
})

test('tracking cannot expose another account application', async t => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }))
  const result = response()
  await trackApplication({ params: { applicationId: 'private' }, user: { id: 'other-user' } }, result, fail)
  assert.equal(result.statusCode, 404)
})
