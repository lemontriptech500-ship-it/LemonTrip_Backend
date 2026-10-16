import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import request from 'supertest'
import { calculateBudget, COST_CATEGORIES, findPlannerPackages, generateTrip, validateItinerary, validatePreferences } from '../src/services/tripPlannerService.js'
import plannerRoutes from '../src/routes/tripPlannerRoutes.js'

const preferences = { destination: 'Manali', startingCity: 'Delhi', departureDate: '', returnDate: '', duration: 2, travellers: 2, budget: 15000, style: 'mixed', interests: '', request: '' }
const config = { groqApiKey: 'test-only', groqBaseUrl: 'https://api.groq.com/openai/v1', groqModel: 'configured-test-model', aiTimeoutMs: 1000 }
const day = (number, amount = 100) => ({ day: number, title: `Day ${number}`, morning: 'Walk', afternoon: 'Local food', evening: 'Rest', attractions: ['Market'], costs: Object.fromEntries(COST_CATEGORIES.map((key) => [key, { amount, basis: 'Rough group estimate; confirm locally.' }])) })
const itinerary = () => ({ destination: 'Manali', overview: 'A mountain escape.', days: [day(1), day(2)], tips: ['Check local weather.'] })
const emptyDatabase = { query: async () => ({ rows: [] }) }
const completion = (data) => async () => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(data) } }] }))
const dependencies = (data = itinerary()) => ({ config, database: emptyDatabase, fetcher: completion(data) })

test('validates preferences, date ranges and natural-language-only destinations', () => {
  assert.equal(validatePreferences({ ...preferences, destination: '', request: 'Suggest a trip to Goa' }).destination, '')
  const future = { ...preferences, departureDate: '2099-01-01', returnDate: '2099-01-04' }
  assert.equal(validatePreferences(future).duration, 4)
  for (const patch of [{ destination: '', request: '' }, { travellers: 0 }, { travellers: '2' }, { duration: 15 }, { budget: -1 }, { style: 'unknown' }, { destination: 'x'.repeat(121) }, { departureDate: '2099-02-30', returnDate: '2099-03-01' }, { departureDate: '2099-01-01' }, { departureDate: '2099-01-04', returnDate: '2099-01-01' }, { departureDate: '2000-01-01', returnDate: '2000-01-03' }, { departureDate: '2099-01-01', returnDate: '2099-02-01' }]) {
    assert.throws(() => validatePreferences({ ...preferences, ...patch }))
  }
})

test('validates generated data and discards model totals and package claims', async () => {
  const generated = { ...itinerary(), total: 1, packages: [{ id: 'invented' }] }
  let sent
  const result = await generateTrip({ preferences }, { ...dependencies(), fetcher: async (url, options) => { sent = { url, options, body: JSON.parse(options.body) }; return completion(generated)() } })
  assert.equal(sent.url, 'https://api.groq.com/openai/v1/chat/completions')
  assert.equal(sent.body.model, config.groqModel)
  assert.equal(sent.options.headers.Authorization, 'Bearer test-only')
  assert.equal(sent.body.response_format.type, 'json_schema')
  assert.equal(sent.body.response_format.json_schema.strict, true)
  assert.ok(sent.body.response_format.json_schema.schema.required.includes('days'))
  assert.equal(result.budget.total, 1000)
  assert.equal(result.budget.perPerson, 500)
  assert.equal(result.budget.remaining, 14000)
  assert.deepEqual(result.packages, [])
  assert.equal(result.itinerary.total, undefined)
})

test('budget rounding, over-budget and missing amounts are calculated in application logic', () => {
  const days = [day(1, 155), day(2, 200)]
  const valid = validateItinerary({ ...itinerary(), days }, 2)
  assert.equal(calculateBudget(valid.days, { ...preferences, budget: 500 }).remaining, -1500)
  valid.days[0].costs.food.amount = null
  const budget = calculateBudget(valid.days, preferences)
  assert.equal(budget.categories.food, null)
  assert.equal(budget.total, null)
  assert.equal(budget.perPerson, null)
  assert.equal(budget.remaining, null)
  assert.equal(budget.knownSubtotal, 1800)
})

test('rejects malformed, truncated, missing, negative, nonnumeric or oversized AI data', async () => {
  const cases = [null, {}, { ...itinerary(), days: [] }, { ...itinerary(), tips: [] }, { ...itinerary(), days: [day(1), day(1)] }, { ...itinerary(), overview: 'a'.repeat(1801) }]
  for (const amount of [-1, '100', 10000001]) { const invalid = itinerary(); invalid.days[0].costs.food.amount = amount; cases.push(invalid) }
  for (const invalid of cases) await assert.rejects(generateTrip({ preferences }, dependencies(invalid)), { status: 502 })
  for (const response of [new Response('not JSON'), new Response(JSON.stringify({ choices: [{ finish_reason: 'length', message: { content: '{}' } }] }))]) {
    await assert.rejects(generateTrip({ preferences }, { ...dependencies(), fetcher: async () => response }), { status: 502 })
  }
})

test('regenerates exactly one day, preserves all other content and recomputes budget', async () => {
  const prior = itinerary()
  const result = await generateTrip({ preferences, itinerary: prior, dayNumber: 2 }, dependencies(day(2, 300)))
  assert.deepEqual(result.itinerary.days[0], prior.days[0])
  assert.deepEqual(result.itinerary.days[1], day(2, 300))
  assert.equal(result.itinerary.overview, prior.overview)
  assert.equal(result.budget.total, 2000)
  await assert.rejects(generateTrip({ preferences, dayNumber: 3, itinerary: prior }, dependencies()), { status: 400 })
  await assert.rejects(generateTrip({ preferences, dayNumber: 1 }, dependencies()), { status: 400 })
  await assert.rejects(generateTrip({ preferences, dayNumber: 2, itinerary: prior }, dependencies(day(1))), { status: 502 })
})

test('repairs schema-invalid output at most once and does not retry provider outages', async () => {
  let calls = 0
  const result = await generateTrip({ preferences }, { ...dependencies(), fetcher: async () => {
    calls++
    return calls === 1 ? new Response(JSON.stringify({ error: { code: 'json_validate_failed' } }), { status: 400 }) : completion(itinerary())()
  } })
  assert.equal(calls, 2)
  assert.equal(result.itinerary.days.length, 2)
  calls = 0
  await assert.rejects(generateTrip({ preferences }, { ...dependencies(), fetcher: async () => { calls++; return completion({})() } }), { status: 502 })
  assert.equal(calls, 2)
  calls = 0
  await assert.rejects(generateTrip({ preferences }, { ...dependencies(), fetcher: async () => { calls++; return new Response('{}', { status: 500 }) } }), { status: 502 })
  assert.equal(calls, 1)
})

test('retrieves database packages with bound SQL, ranks matches, handles missing prices and excludes unsafe images', async () => {
  let query
  const database = { query: async (q) => { query = q; return { rows: [
    { id: 'long', destination: 'Manali', duration: '12 Days', priceAmount: '40000', currency: 'INR', highlights: [], bestFor: '', imageUrl: 'javascript:alert(1)' },
    { id: 'match', destination: 'Manali', duration: '2 Days, 1 Night', priceAmount: '5000', currency: 'INR', highlights: [], bestFor: 'mixed', imageUrl: 'https://example.com/photo.jpg' },
    { id: 'unknown', destination: 'Manali', duration: '', priceAmount: '0', currency: 'INR', highlights: [] },
  ] } } }
  const result = await findPlannerPackages(preferences, 'Manali', database)
  assert.equal(result[0].id, 'match')
  assert.equal(result.find((p) => p.id === 'unknown').priceAmount, null)
  assert.equal(result.find((p) => p.id === 'long').imageUrl, null)
  assert.match(query.text, /FROM travel_packages/)
  assert.ok(!query.text.includes('Manali'))
  assert.deepEqual(query.values, [['%Manali%']])
})

test('catalogue failures retain the itinerary and use a distinct unavailable status', async () => {
  const result = await generateTrip({ preferences }, { ...dependencies(), database: { query: async () => { throw new Error('private database details') } } })
  assert.equal(result.packageStatus, 'unavailable')
  assert.deepEqual(result.packages, [])
  assert.equal(result.itinerary.days.length, 2)
})

test('handles missing configuration, rate limits, provider failures and timeouts safely', async () => {
  await assert.rejects(generateTrip({ preferences }, { ...dependencies(), config: { ...config, groqApiKey: '' } }), { status: 503 })
  for (const status of [429, 401, 500]) {
    await assert.rejects(generateTrip({ preferences }, { ...dependencies(), fetcher: async () => new Response('private provider details', { status }) }), { status: status === 429 ? 429 : 502 })
  }
  await assert.rejects(generateTrip({ preferences }, { ...dependencies(), fetcher: async () => { throw new Error('secret network details') } }), (error) => error.status === 502 && !error.message.includes('secret'))
  const timeout = generateTrip({ preferences }, { ...dependencies(), fetcher: (_url, { signal }) => new Promise((_resolve, reject) => {
    const timer = setTimeout(() => {}, 1100)
    signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason) }, { once: true })
  }) })
  await assert.rejects(timeout, { status: 504 })
})

test('HTTP endpoint rejects invalid input and limits repeated requests without leaking errors', async () => {
  const app = express(); app.use(express.json()); app.use('/planner', plannerRoutes)
  for (let index = 0; index < 5; index++) {
    const response = await request(app).post('/planner').send({ preferences: {} })
    assert.equal(response.status, 400)
    assert.equal(response.body.success, false)
    assert.ok(response.body.error.message)
  }
  const response = await request(app).post('/planner').send({ preferences })
  assert.equal(response.status, 429)
  assert.equal(response.headers['retry-after'], '60')
})
