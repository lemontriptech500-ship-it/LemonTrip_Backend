import crypto from 'node:crypto'
import https from 'node:https'
import { env } from '../config/env.js'

function mockEnabled() {
  return env.irctcEnvironment === 'mock' || !env.irctcBaseUrl || !env.irctcApiKey
}

function request(path, { method = 'GET', body } = {}) {
  if (mockEnabled()) return Promise.reject(Object.assign(new Error('IRCTC mock mode is enabled'), { code: 'IRCTC_MOCK_MODE' }))
  const headers = { Accept: 'application/json', 'Content-Type': 'application/json', 'X-API-Key': env.irctcApiKey, 'X-API-Secret': env.irctcApiSecret || '' }
  const payload = body === undefined ? null : JSON.stringify(body)
  const url = new URL(`${env.irctcBaseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`)
  return new Promise((resolve, reject) => {
    const requestInstance = https.request(url, { method, headers, timeout: env.irctcTimeoutMs }, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => {
        let parsed
        try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') } catch { parsed = {} }
        if (response.statusCode < 200 || response.statusCode >= 300) return reject(Object.assign(new Error(parsed.message || `IRCTC request failed with status ${response.statusCode}`), { status: 502, providerResponse: parsed }))
        resolve(parsed)
      })
    })
    requestInstance.on('timeout', () => requestInstance.destroy(Object.assign(new Error('IRCTC request timed out'), { code: 'IRCTC_TIMEOUT' })))
    requestInstance.on('error', (error) => reject(Object.assign(new Error(error.message || 'IRCTC request failed'), { status: 502, code: error.code || 'IRCTC_NETWORK_ERROR' })))
    if (payload) requestInstance.write(payload)
    requestInstance.end()
  })
}

function mockTrains({ from = '', to = '', date = '' } = {}) {
  const routes = [
    { id: 'irctc-12951', number: '12951', name: 'Mumbai Rajdhani', from: 'Mumbai', to: 'Delhi', departure: '17:00', arrival: '08:35', duration: '15h 35m', classes: ['1A', '2A', '3A'], price: 'From INR 2,450', priceAmount: 2450 },
    { id: 'irctc-12002', number: '12002', name: 'Bhopal Shatabdi', from: 'New Delhi', to: 'Bhopal', departure: '06:00', arrival: '14:40', duration: '8h 40m', classes: ['CC', 'EC'], price: 'From INR 1,280', priceAmount: 1280 },
    { id: 'irctc-22691', number: '22691', name: 'Rajdhani Express', from: 'Bengaluru', to: 'New Delhi', departure: '20:20', arrival: '05:55', duration: '33h 35m', classes: ['2A', '3A'], price: 'From INR 2,150', priceAmount: 2150 },
  ]
  const filtered = routes.filter((train) => (!from || train.from.toLowerCase().includes(from.toLowerCase())) && (!to || train.to.toLowerCase().includes(to.toLowerCase())))
  return filtered.map((train) => ({ ...train, provider: 'mock-irctc', journeyDate: date || null }))
}

export async function searchTrains(query) {
  if (mockEnabled()) { const trains = mockTrains(query); return { trains, total: trains.length, provider: 'mock-irctc' } }
  return request('/trains/search', { method: 'POST', body: query })
}

export async function getTrain(trainId) {
  if (mockEnabled()) return mockTrains({}).find((train) => train.id === trainId) || null
  return request(`/trains/${encodeURIComponent(trainId)}`)
}

export async function checkAvailability({ trainId, journeyDate, trainClass, passengers = 1 }) {
  if (mockEnabled()) return { trainId, journeyDate, trainClass, available: 42, fare: 2450, currency: 'INR', provider: 'mock-irctc' }
  return request('/trains/availability', { method: 'POST', body: { trainId, journeyDate, trainClass, passengers } })
}

export async function createBooking({ bookingReference, train, passengers, contact }) {
  if (mockEnabled()) {
    const pnr = `IR${crypto.randomInt(1000000000, 9999999999)}`
    return { pnr, ticketNumber: `LT-${bookingReference}`, status: 'CONFIRMED', train, passengers, contact, provider: 'mock-irctc' }
  }
  return request('/bookings', { method: 'POST', body: { clientReference: bookingReference, train, passengers, contact } })
}

export async function getPnrStatus(pnr) {
  if (mockEnabled()) return { pnr, status: 'CONFIRMED', passengers: [], provider: 'mock-irctc' }
  return request(`/bookings/pnr/${encodeURIComponent(pnr)}`)
}

export async function cancelBooking(providerReference) {
  if (mockEnabled()) return { providerReference, status: 'CANCELLED', refundAmount: 0, provider: 'mock-irctc' }
  return request(`/bookings/${encodeURIComponent(providerReference)}/cancel`, { method: 'POST' })
}