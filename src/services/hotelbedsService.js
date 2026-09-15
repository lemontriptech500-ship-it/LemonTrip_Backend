import crypto from 'node:crypto'
import fs from 'node:fs'
import https from 'node:https'
import { env } from '../config/env.js'

let requestOverride = null
const destinationCache = new Map()

function configurationError(message) {
  const error = new Error(message)
  error.status = 503
  return error
}

function requireCredentials() {
  if (!env.hotelbeds.apiKey || !env.hotelbeds.apiSecret) {
    throw configurationError('Hotelbeds is not configured. Set HOTELBEDS_API_KEY and HOTELBEDS_API_SECRET.')
  }
}

function signature() {
  return crypto.createHash('sha256')
    .update(env.hotelbeds.apiKey + env.hotelbeds.apiSecret + Math.floor(Date.now() / 1000))
    .digest('hex')
}

function fileValue(filePath) {
  if (!filePath) return undefined
  return fs.readFileSync(filePath.replace(/^file:/, ''))
}

function requestJson({ baseUrl, path, method = 'GET', body, requireMtls = false }) {
  if (requestOverride) return requestOverride({ baseUrl, path, method, body, requireMtls })
  requireCredentials()
  if (requireMtls && (!env.hotelbeds.certPath || !env.hotelbeds.keyPath)) {
    throw configurationError('Hotelbeds booking operations require HOTELBEDS_CERT_PATH and HOTELBEDS_KEY_PATH mTLS files.')
  }
  const url = new URL(path.replace(/^\//, ''), `${baseUrl.replace(/\/$/, '')}/`)
  const payload = body === undefined ? null : JSON.stringify(body)
  const requestOptions = {
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port || 443,
    path: `${url.pathname}${url.search}`,
    method,
    headers: {
      'Api-key': env.hotelbeds.apiKey,
      'X-Signature': signature(),
      Accept: 'application/json',
      ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
    },
    timeout: env.hotelbeds.timeoutMs,
    ...(requireMtls ? { cert: fileValue(env.hotelbeds.certPath), key: fileValue(env.hotelbeds.keyPath), ca: fileValue(env.hotelbeds.caPath) } : {}),
  }

  return new Promise((resolve, reject) => {
    const request = https.request(requestOptions, (response) => {
      let raw = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => { raw += chunk })
      response.on('end', () => {
        let parsed = null
        try {
          parsed = raw ? JSON.parse(raw) : null
        } catch {
          const error = new Error(`Hotelbeds returned a non-JSON response with status ${response.statusCode}.`)
          error.status = response.statusCode >= 500 ? 502 : response.statusCode
          reject(error)
          return
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const error = new Error(parsed?.error?.message || parsed?.message || `Hotelbeds request failed with status ${response.statusCode}.`)
          error.status = response.statusCode >= 500 ? 502 : response.statusCode
          reject(error)
          return
        }
        resolve(parsed)
      })
    })
    request.on('timeout', () => request.destroy(new Error('Hotelbeds request timed out.')))
    request.on('error', (error) => {
      error.status ||= 502
      reject(error)
    })
    if (payload) request.write(payload)
    request.end()
  })
}

function normalizeCancellation(rate) {
  const policy = rate.cancellationPolicies?.[0]
  return policy ? `Cancellation fee from ${policy.from}: ${rate.currency || 'EUR'} ${policy.amount}` : 'Cancellation policy supplied by Hotelbeds.'
}

function normalizeHotel(hotel, nights = 1) {
  const rooms = (hotel.rooms || []).map((room) => ({
    id: room.code || room.roomCode || room.name,
    name: room.name || room.roomType || 'Room',
    type: 'standard',
    description: room.description || '',
    maxOccupancy: { maxAdults: 0, maxChildren: 0, maxTotal: 0 },
    bedType: room.roomType || '',
    amenities: [],
    images: [],
    availableQuantity: Number(room.rates?.[0]?.rooms || room.rates?.[0]?.allotment || 0),
    rates: (room.rates || []).map((rate) => ({
      id: rate.rateKey,
      rateKey: rate.rateKey,
      name: rate.boardName || rate.boardCode || 'Rate',
      pricePerNight: Number(rate.net || 0) / Math.max(nights, 1),
      totalPrice: Number(rate.net || 0),
      currency: rate.currency || 'EUR',
      mealPlan: 'room_only',
      refundable: Boolean(rate.cancellationPolicies?.length),
      rateType: rate.rateType,
      cancellationPolicy: normalizeCancellation(rate),
      benefits: [],
    })),
  }))
  const prices = rooms.flatMap((room) => room.rates.map((rate) => rate.pricePerNight)).filter(Boolean)
  return {
    id: String(hotel.code),
    name: hotel.name || `Hotel ${hotel.code}`,
    location: { city: hotel.destinationName || hotel.destinationCode || '', area: hotel.zoneName || '', address: hotel.address || '' },
    starRating: Number.parseInt(hotel.categoryCode || hotel.categoryName || '0', 10) || 0,
    guestRating: 0,
    guestReviewCount: 0,
    description: hotel.description || '',
    propertyType: 'hotel',
    images: (hotel.images || []).map((image) => ({ url: image.path || image.url, alt: hotel.name || 'Hotel' })),
    amenities: [],
    checkInTime: '',
    checkOutTime: '',
    rooms,
    currency: hotel.currency || rooms[0]?.rates[0]?.currency || 'EUR',
    startingPrice: Math.min(...prices, 0),
    supplier: 'HOTELBEDS',
  }
}

export function setHotelbedsRequestOverride(override) {
  requestOverride = override
}

export function createSignature(timestamp = Math.floor(Date.now() / 1000), apiKey = env.hotelbeds.apiKey, apiSecret = env.hotelbeds.apiSecret) {
  if (!apiKey || !apiSecret) throw configurationError('Hotelbeds credentials are required to generate a signature.')
  return crypto.createHash('sha256').update(apiKey + apiSecret + timestamp).digest('hex')
}

async function resolveDestination(destination) {
  const value = String(destination || '').trim()
  if (/^[A-Z0-9]{2,5}$/.test(value)) return value.toUpperCase()
  const cached = destinationCache.get(value.toLowerCase())
  if (cached) return cached
  let match
  for (let from = 1; from <= 10_000 && !match; from += 1_000) {
    const response = await requestJson({ baseUrl: env.hotelbeds.contentBaseUrl, path: `/locations/destinations?fields=all&language=ENG&from=${from}&to=${from + 999}&useSecondaryLanguage=false` })
    match = (response.destinations || []).find((item) => item.name?.content?.toLowerCase() === value.toLowerCase() || item.name?.content?.toLowerCase().includes(value.toLowerCase()))
    if ((response.destinations || []).length < 1_000) break
  }
  if (!match?.code) {
    const error = new Error('Hotelbeds has no destination matching that search.')
    error.status = 400
    throw error
  }
  destinationCache.set(value.toLowerCase(), match.code)
  return match.code
}

export async function searchHotels({ destination, checkIn, checkOut, rooms, adults, children = 0, childAges = [], nationality = 'IN', currency = 'INR' }) {
  const destinationCode = await resolveDestination(destination)
  const response = await requestJson({
    baseUrl: env.hotelbeds.baseUrl,
    path: '/hotels',
    method: 'POST',
    body: {
      stay: { checkIn, checkOut },
      occupancies: [{ rooms: Number(rooms), adults: Number(adults), children: Number(children), paxes: childAges.map((age) => ({ type: 'CH', age: Number(age) })) }],
      destinations: [{ code: destinationCode }],
      sourceMarket: nationality,
      language: 'ENG',
      currency,
    },
  })
  const nights = Math.max(1, Math.round((new Date(checkOut) - new Date(checkIn)) / 86_400_000))
  return { ...response, hotels: { ...response.hotels, hotels: (response.hotels?.hotels || []).map((hotel) => normalizeHotel(hotel, nights)) } }
}

export async function checkRate(rateKeys) {
  return requestJson({ baseUrl: env.hotelbeds.baseUrl, path: '/checkrates', method: 'POST', body: { rooms: rateKeys.map((rateKey) => ({ rateKey })) }, requireMtls: true })
}

export async function bookHotel(payload) {
  return requestJson({ baseUrl: env.hotelbeds.baseUrl, path: '/bookings', method: 'POST', body: payload, requireMtls: true })
}

export async function cancelHotel(bookingReference) {
  return requestJson({ baseUrl: env.hotelbeds.baseUrl, path: `/bookings/${encodeURIComponent(bookingReference)}`, method: 'DELETE', requireMtls: true })
}

export { normalizeHotel }