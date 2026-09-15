import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSignature, normalizeHotel, searchHotels, setHotelbedsRequestOverride } from '../src/services/hotelbedsService.js'

test('Hotelbeds signature is a SHA-256 digest', () => {
  const value = createSignature(1700000000, 'test-key', 'test-secret')
  assert.match(value, /^[a-f0-9]{64}$/)
})

test('Hotelbeds availability is normalized for the LemonTrip hotel UI', () => {
  const hotel = normalizeHotel({
    code: '123',
    name: 'Test Hotel',
    destinationName: 'Delhi',
    rooms: [{ code: 'R1', name: 'Deluxe Room', rates: [{ rateKey: 'rate-1', net: '120.00', currency: 'EUR', boardName: 'Breakfast', rateType: 'BOOKABLE', rooms: 2 }] }],
  }, 2)
  assert.equal(hotel.id, '123')
  assert.equal(hotel.rooms[0].rates[0].rateKey, 'rate-1')
  assert.equal(hotel.rooms[0].rates[0].totalPrice, 120)
  assert.equal(hotel.rooms[0].rates[0].pricePerNight, 60)
})

test('Hotelbeds search formats availability input and never calls the network in tests', async (t) => {
  let request
  setHotelbedsRequestOverride(async (input) => {
    request = input
    if (input.path.startsWith('/locations')) return { destinations: [{ code: 'DEL', name: { content: 'Delhi' } }] }
    return { hotels: { hotels: [{ code: '123', name: 'Test Hotel', destinationName: 'Delhi', rooms: [] }] } }
  })
  t.after(() => setHotelbedsRequestOverride(null))
  const result = await searchHotels({ destination: 'Delhi', hotelCode: '123', checkIn: '2026-10-01', checkOut: '2026-10-03', rooms: 1, adults: 2 })
  assert.equal(request.method, 'POST')
  assert.equal(request.path, '/hotels')
  assert.deepEqual(request.body.stay, { checkIn: '2026-10-01', checkOut: '2026-10-03' })
  assert.deepEqual(request.body.hotels, { codes: ['123'] })
  assert.equal(result.hotels.hotels[0].supplier, 'HOTELBEDS')
})