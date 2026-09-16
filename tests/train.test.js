import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkAvailability, getPNRStatus, setRailProviderOverride } from '../src/services/railProvider.js'
import { confirmTrainWithSupplier } from '../src/services/trainBookingService.js'

function fakeClient() {
  const queries = []
  return {
    queries,
    async query(sql, values) {
      queries.push({ sql, values })
      return { rows: [] }
    },
  }
}

test('rail provider returns 501 when no authorized provider is configured', async () => {
  await assert.rejects(() => checkAvailability({ trainId: 'train-1' }), (error) => error.status === 501)
  await assert.rejects(() => getPNRStatus('PNR123'), (error) => error.status === 501)
})

test('supplier success transitions a paid train booking to CONFIRMED and persists PNR', async () => {
  const client = fakeClient()
  const result = await confirmTrainWithSupplier(client, { id: 'booking-1', bookingReference: 'LT-TR-1', details: { passengers: [] } }, async () => ({ bookingReference: 'SUP-1', pnr: 'PNR-1', fare: 1200, currency: 'INR' }))
  assert.deepEqual(result, { supplierReference: 'SUP-1', pnr: 'PNR-1', status: 'CONFIRMED' })
  assert.match(client.queries[0].sql, /BOOKING_IN_PROGRESS/)
  assert.match(client.queries[1].sql, /CONFIRMED/)
  assert.deepEqual(client.queries[1].values.slice(0, 4), ['SUP-1', 'PNR-1', 1200, 'INR'])
})

test('supplier failure transitions a paid train booking to BOOKING_FAILED', async () => {
  const client = fakeClient()
  await assert.rejects(
    () => confirmTrainWithSupplier(client, { id: 'booking-2', bookingReference: 'LT-TR-2', details: {} }, async () => { throw Object.assign(new Error('provider unavailable'), { status: 501 }) }),
    (error) => error.status === 501,
  )
  assert.match(client.queries.at(-1).sql, /BOOKING_FAILED/)
})

test('rail provider override is isolated to tests', async (t) => {
  setRailProviderOverride({ checkAvailability: async () => ({ available: 2, fare: 900, currency: 'INR' }) })
  t.after(() => setRailProviderOverride(null))
  assert.deepEqual(await checkAvailability({ trainId: 'train-1' }), { available: 2, fare: 900, currency: 'INR' })
})
