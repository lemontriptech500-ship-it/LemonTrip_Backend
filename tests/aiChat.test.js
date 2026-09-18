import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { pool } from '../src/config/db.js'
import { env } from '../src/config/env.js'
import { answerChat, setGroqFetchOverride } from '../src/services/aiChatService.js'

const original = {
  groqApiKey: env.groqApiKey,
  groqBaseUrl: env.groqBaseUrl,
  groqModel: env.groqModel,
  irctcEnvironment: env.irctcEnvironment,
}

afterEach(() => {
  Object.assign(env, original)
  setGroqFetchOverride(null)
})

test('Groq receives PostgreSQL flight lookup results before producing a travel answer', async (t) => {
  env.groqApiKey = 'test-key'
  env.groqBaseUrl = 'https://groq.test/openai/v1'
  env.groqModel = 'test-groq-model'
  const requests = []
  t.mock.method(pool, 'query', async () => ({ rows: [{ id: 'flight-1', origin: 'DEL', destination: 'BOM', departureDate: '2026-10-01', airline: 'Lemon Air', price: '4999', currency: 'INR' }] }))
  setGroqFetchOverride(async (_url, options) => {
    requests.push(JSON.parse(options.body))
    if (requests.length === 1) return { ok: true, json: async () => ({ choices: [{ message: { role: 'assistant', tool_calls: [{ id: 'call-flight', type: 'function', function: { name: 'search_flights', arguments: '{"origin":"DEL","destination":"BOM","departureDate":"2026-10-01"}' } }] } }] }) }
    return { ok: true, json: async () => ({ choices: [{ message: { role: 'assistant', content: 'I found one LemonTrip database flight: Lemon Air from DEL to BOM at INR 4,999.' } }] }) }
  })

  const result = await answerChat({ message: 'Find a flight from DEL to BOM on 2026-10-01.' })

  assert.match(result.answer, /LemonTrip database flight/)
  assert.equal(requests.length, 2)
  assert.equal(requests[0].model, 'test-groq-model')
  assert.equal(requests[0].tools.some((tool) => tool.function.name === 'search_flights'), true)
  const toolMessage = requests[1].messages.find((message) => message.role === 'tool')
  assert.deepEqual(JSON.parse(toolMessage.content), {
    available: true,
    source: 'LemonTrip PostgreSQL inventory',
    resultCount: 1,
    flights: [{ id: 'flight-1', origin: 'DEL', destination: 'BOM', departureDate: '2026-10-01', airline: 'Lemon Air', price: '4999', currency: 'INR' }],
  })
})

test('mock train data is withheld from Groq as unverified travel availability', async () => {
  env.groqApiKey = 'test-key'
  env.irctcEnvironment = 'mock'
  const requests = []
  setGroqFetchOverride(async (_url, options) => {
    requests.push(JSON.parse(options.body))
    if (requests.length === 1) return { ok: true, json: async () => ({ choices: [{ message: { role: 'assistant', tool_calls: [{ id: 'call-train', type: 'function', function: { name: 'search_trains', arguments: '{"from":"Delhi","to":"Bhopal","date":"2026-10-01"}' } }] } }] }) }
    return { ok: true, json: async () => ({ choices: [{ message: { role: 'assistant', content: 'Train availability is not verified because the live provider is not configured.' } }] }) }
  })

  const result = await answerChat({ message: 'Find a train from Delhi to Bhopal on 2026-10-01.' })

  assert.match(result.answer, /not verified/)
  const toolMessage = requests[1].messages.find((message) => message.role === 'tool')
  assert.deepEqual(JSON.parse(toolMessage.content), {
    available: false,
    source: 'IRCTC-compatible provider',
    reason: 'A live train provider is not configured. Mock train data is not presented as live availability.',
  })
})

test('chat remains safe when Groq is not configured', async () => {
  env.groqApiKey = ''
  const result = await answerChat({ message: 'What is the cheapest flight today?' })
  assert.match(result.answer, /do not have verified live availability/i)
})
