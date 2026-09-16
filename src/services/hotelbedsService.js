import crypto from 'node:crypto'
import fs from 'node:fs'
import https from 'node:https'
import { env } from '../config/env.js'

let requestOverride = null
const destinationCache = new Map()
const hotelCache = new Map()

function configurationError(message) {
  const error = new Error(message)
  error.status = 503
  return error
}

function signature(timestamp = Math.floor(Date.now() / 1000), apiKey = env.hotelbeds.apiKey, apiSecret = env.hotelbeds.apiSecret) {
  if (!apiKey || !apiSecret) throw configurationError('Hotelbeds credentials are required to generate a signature.')
  return crypto.createHash('sha256').update(apiKey + apiSecret + timestamp).digest('hex')
}

export const createSignature = signature

function fileValue(filePath) {
  return filePath ? fs.readFileSync(filePath.replace(/^file:/, '')) : undefined
}

function requestJson({ baseUrl, path, method = 'GET', body, requireMtls = false }) {
  if (requestOverride) return requestOverride({ baseUrl, path, method, body, requireMtls })
  if (!env.hotelbeds.apiKey || !env.hotelbeds.apiSecret) throw configurationError('Hotelbeds is not configured. Set HOTELBEDS_API_KEY and HOTELBEDS_API_SECRET.')
  if (requireMtls && (!env.hotelbeds.certPath || !env.hotelbeds.keyPath)) throw configurationError('Hotelbeds booking operations require mTLS files.')
  const url = new URL(path.replace(/^\//, ''), `${baseUrl.replace(/\/$/, '')}/`)
  const payload = body === undefined ? null : JSON.stringify(body)
  const options = { protocol: url.protocol, hostname: url.hostname, port: url.port || 443, path: `${url.pathname}${url.search}`, method, headers: { 'Api-key': env.hotelbeds.apiKey, 'X-Signature': signature(), Accept: 'application/json', ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}) }, timeout: env.hotelbeds.timeoutMs, ...(requireMtls ? { cert: fileValue(env.hotelbeds.certPath), key: fileValue(env.hotelbeds.keyPath), ca: fileValue(env.hotelbeds.caPath) } : {}) }
  return new Promise((resolve, reject) => {
    const request = https.request(options, (response) => {
      let raw = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => { raw += chunk })
      response.on('end', () => {
        let parsed
        try { parsed = raw ? JSON.parse(raw) : null } catch { const error = new Error(`Hotelbeds returned a non-JSON response with status ${response.statusCode}.`); error.status = 502; reject(error); return }
        if (response.statusCode < 200 || response.statusCode >= 300) { const error = new Error(parsed?.error?.message || parsed?.message || `Hotelbeds request failed with status ${response.statusCode}.`); error.status = response.statusCode >= 500 ? 502 : response.statusCode; reject(error); return }
        resolve(parsed)
      })
    })
    request.on('timeout', () => request.destroy(new Error('Hotelbeds request timed out.')))
    request.on('error', (error) => { error.status ||= 502; reject(error) })
    if (payload) request.write(payload)
    request.end()
  })
}

function normalizeCancellation(rate) {
  const policy = rate.cancellationPolicies?.[0]
  return policy ? `Cancellation fee from ${policy.from}: ${rate.currency || 'EUR'} ${policy.amount}` : 'Cancellation policy supplied by Hotelbeds.'
}

export function normalizeHotel(hotel, nights = 1) {
  const rooms = (hotel.rooms || []).map((room) => ({ id: room.code || room.roomCode || room.name, name: room.name || room.roomType || 'Room', type: 'standard', description: room.description || '', maxOccupancy: { maxAdults: 0, maxChildren: 0, maxTotal: 0 }, bedType: room.roomType || '', amenities: [], images: [], availableQuantity: Number(room.rates?.[0]?.rooms || room.rates?.[0]?.allotment || 0), rates: (room.rates || []).map((rate) => ({ id: rate.rateKey, rateKey: rate.rateKey, name: rate.boardName || rate.boardCode || 'Rate', pricePerNight: Number(rate.net || 0) / Math.max(nights, 1), totalPrice: Number(rate.net || 0), currency: rate.currency || 'EUR', mealPlan: 'room_only', refundable: Boolean(rate.cancellationPolicies?.length), rateType: rate.rateType, cancellationPolicy: normalizeCancellation(rate), benefits: [], hotelbeds: { rateKey: rate.rateKey, paymentType: rate.paymentType || 'AT_HOTEL' } })) }))
  const prices = rooms.flatMap((room) => room.rates.map((rate) => rate.pricePerNight)).filter(Boolean)
  return { id: String(hotel.code), name: hotel.name || `Hotel ${hotel.code}`, location: { city: hotel.destinationName || hotel.destinationCode || '', area: hotel.zoneName || '', address: hotel.address || '' }, starRating: Number.parseInt(hotel.categoryCode || hotel.categoryName || '0', 10) || 0, guestRating: 0, guestReviewCount: 0, description: hotel.description || '', propertyType: 'hotel', images: (hotel.images || []).map((image) => ({ url: image.path || image.url, alt: hotel.name || 'Hotel' })), amenities: [], checkInTime: '', checkOutTime: '', rooms, currency: hotel.currency || rooms[0]?.rates[0]?.currency || 'EUR', startingPrice: Math.min(...prices, 0), supplier: 'HOTELBEDS' }
}

export function setHotelbedsRequestOverride(override) { requestOverride = override }
export function isHotelBedsConfigured() { return Boolean(env.hotelbeds.apiKey && env.hotelbeds.apiSecret) }

async function resolveDestination(destination) {
  const value = String(destination || '').trim()
  if (/^[A-Z0-9]{2,5}$/.test(value)) return value.toUpperCase()
  const key = value.toLowerCase()
  if (destinationCache.has(key)) return destinationCache.get(key)
  const response = await requestJson({ baseUrl: env.hotelbeds.contentBaseUrl, path: '/locations/destinations?fields=all&language=ENG&from=1&to=10000&useSecondaryLanguage=false' })
  const match = (response.destinations || []).find((item) => item.name?.content?.toLowerCase?.().includes(key) || item.name?.toLowerCase?.().includes(key))
  if (!match?.code) { const error = new Error('Hotelbeds has no destination matching that search.'); error.status = 400; throw error }
  destinationCache.set(key, match.code)
  return match.code
}

export async function searchHotels({ destination, hotelCode, checkIn, checkOut, rooms = 1, adults = 2, children = 0, childAges = [], nationality = 'IN', currency = 'INR' }) {
  const destinationCode = await resolveDestination(destination)
  const response = await requestJson({ baseUrl: env.hotelbeds.baseUrl, path: '/hotels', method: 'POST', body: { stay: { checkIn, checkOut }, occupancies: [{ rooms: Number(rooms), adults: Number(adults), children: Number(children), paxes: childAges.map((age) => ({ type: 'CH', age: Number(age) })) }], destinations: [{ code: destinationCode }], ...(hotelCode ? { hotels: { codes: [String(hotelCode)] } } : {}), sourceMarket: nationality, language: 'ENG', currency } })
  const nights = Math.max(1, Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000))
  const hotels = (response.hotels?.hotels || []).map((hotel) => normalizeHotel(hotel, nights))
  hotels.forEach((hotel) => hotelCache.set(hotel.id, hotel))
  return { ...response, hotels: { ...response.hotels, hotels } }
}

export async function searchHotelBeds(options) {
  const result = await searchHotels(options)
  return { hotels: result.hotels.hotels, total: result.hotels.hotels.length, filters: { propertyTypes: ['hotel'], amenities: [], minPrice: 0, maxPrice: 0 } }
}

export function getHotelBedsHotel(id) { return hotelCache.get(String(id).replace(/^hb-/, '')) || null }
export async function checkRate(rateKeys) { return requestJson({ baseUrl: env.hotelbeds.baseUrl, path: '/checkrates', method: 'POST', body: { rooms: rateKeys.map((rateKey) => ({ rateKey })) }, requireMtls: true }) }
export async function bookHotel(payload) { return requestJson({ baseUrl: env.hotelbeds.baseUrl, path: '/bookings', method: 'POST', body: payload, requireMtls: true }) }
export async function cancelHotel(bookingReference) { return requestJson({ baseUrl: env.hotelbeds.baseUrl, path: `/bookings/${encodeURIComponent(bookingReference)}`, method: 'DELETE', requireMtls: true }) }

export async function checkHotelBedsAvailability(hotel, details) {
  const rateKeys = (details.selections || []).flatMap((selection) => Array(Number(selection.quantity) || 0).fill(hotel.rooms.flatMap((room) => room.rates).find((rate) => rate.id === selection.rateId)?.rateKey))
  if (!rateKeys.length || rateKeys.some((key) => !key)) return null
  const result = await checkRate(rateKeys)
  const rates = result.hotels?.hotels?.[0]?.rooms?.flatMap((room) => room.rates || []) || []
  const available = new Map(rates.map((rate) => [rate.rateKey, rate]))
  return rateKeys.every((key) => available.has(key)) ? { rateKeys, rates: rateKeys.map((key) => available.get(key)) } : null
}

export async function confirmHotelBedsBooking(booking) {
  const details = booking.details || {}
  const hotel = getHotelBedsHotel(details.itemId) || details.providerSnapshot
  if (!hotel) throw Object.assign(new Error('Hotel availability has expired. Search again before paying.'), { status: 409 })
  const availability = await checkHotelBedsAvailability(hotel, details)
  if (!availability) throw Object.assign(new Error('The selected hotel room is no longer available.'), { status: 409 })
  const guest = details.guests?.[0] || {}
  return bookHotel({ holder: { name: guest.firstName || 'LemonTrip', surname: guest.lastName || 'Guest' }, rooms: availability.rateKeys.map((rateKey, index) => ({ rateKey, paxes: [{ roomId: index + 1, type: 'AD', name: guest.firstName || 'LemonTrip', surname: guest.lastName || 'Guest' }] })), clientReference: String(booking.booking_reference).slice(0, 20), remark: 'LemonTrip Hotelbeds test booking', language: 'ENG' })
}
