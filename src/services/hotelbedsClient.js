import crypto from 'node:crypto'
import fs from 'node:fs'
import https from 'node:https'
import zlib from 'node:zlib'
import { env } from '../config/env.js'

function readCredential(value, label) {
  if (!value) return ''
  if (value.startsWith('file:')) {
    const filePath = value.slice(5)
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : ''
  }
  return value
}

function getTlsOptions() {
  const cert = readCredential(env.hotelbedsMtlsCert, 'HotelBeds client certificate')
  const key = readCredential(env.hotelbedsMtlsKey, 'HotelBeds client private key')
  const ca = readCredential(env.hotelbedsMtlsCa, 'HotelBeds CA certificate')

  if (!cert || !key) {
    if (env.hotelbedsEnvironment === 'test') return {}
    const error = new Error('HotelBeds mTLS certificate and private key are required')
    error.status = 503
    throw error
  }

  const tls = {
    cert: Buffer.from(cert),
    key: Buffer.from(key),
  }
  if (ca) tls.ca = Buffer.from(ca)
  return tls
}

function getBaseUrl(contentApi = false) {
  const configuredBaseUrl = contentApi ? env.hotelbedsContentBaseUrl : env.hotelbedsBaseUrl
  const defaultBaseUrl = contentApi
    ? (env.hotelbedsEnvironment === 'production' ? 'https://api-mtls.hotelbeds.com/hotel-content-api/1.0' : 'https://api-mtls.test.hotelbeds.com/hotel-content-api/1.0')
    : (env.hotelbedsEnvironment === 'production' ? 'https://api-mtls.hotelbeds.com/hotel-api/1.0' : 'https://api-mtls.test.hotelbeds.com/hotel-api/1.0')
  const baseUrl = configuredBaseUrl || defaultBaseUrl

  const hasClientCertificate = Boolean(readCredential(env.hotelbedsMtlsCert, 'HotelBeds client certificate') && readCredential(env.hotelbedsMtlsKey, 'HotelBeds client private key'))
  if (env.hotelbedsEnvironment === 'test' && !hasClientCertificate) {
    return baseUrl.replace('api-mtls.test.hotelbeds.com', 'api.test.hotelbeds.com')
  }

  return baseUrl
}

function parseResponsePayload(payload) {
  if (!payload) return {}
  try {
    return JSON.parse(payload)
  } catch {
    return { raw: payload }
  }
}

function createHotelBedsError(status, payload) {
  const errorData = payload?.error || payload
  const message = typeof errorData?.message === 'string'
    ? errorData.message
    : `HotelBeds request failed with status ${status}`
  const error = new Error(message)
  error.status = status === 400 || status === 409 || status === 422 ? 400 : status === 401 || status === 403 ? 403 : status === 429 ? 429 : 502
  error.code = errorData?.code || `HOTELBEDS_${status}`
  error.provider = 'hotelbeds'
  error.retryable = status === 429 || status >= 500
  error.response = payload
  return error
}

function requestHttps({ baseUrl, path, method = 'GET', body, timeoutMs = env.hotelbedsTimeoutMs }) {
  const apiKey = env.hotelbedsApiKey
  const secret = env.hotelbedsApiSecret
  if (!apiKey || !secret) {
    const error = new Error('HotelBeds API key and secret are required')
    error.status = 503
    error.code = 'HOTELBEDS_NOT_CONFIGURED'
    error.provider = 'hotelbeds'
    throw error
  }

  const timestamp = Math.floor(Date.now() / 1000)
  const signature = crypto
    .createHash('sha256')
    .update(`${apiKey}${secret}${timestamp}`)
    .digest('hex')
  const headers = {
    Accept: 'application/json',
    'Accept-Encoding': 'gzip',
    'Api-key': apiKey,
    'X-Signature': signature,
    Authorization: `Basic ${Buffer.from(`${apiKey}:${secret}`).toString('base64')}`,
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const url = new URL(`${baseUrl.replace(/\/$/, '')}/${String(path).replace(/^\//, '')}`)
  return new Promise((resolve, reject) => {
    const request = https.request(url, {
      method,
      headers,
      timeout: timeoutMs,
      ...getTlsOptions(),
    }, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => {
        const compressed = Buffer.concat(chunks)
        const payload = response.headers['content-encoding'] === 'gzip'
          ? zlib.gunzipSync(compressed).toString('utf8')
          : compressed.toString('utf8')
        const parsed = parseResponsePayload(payload)

        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
          reject(createHotelBedsError(response.statusCode, parsed))
          return
        }
        resolve(parsed)
      })
    })

    request.on('timeout', () => request.destroy(new Error(`HotelBeds request timed out after ${timeoutMs}ms`)))
    request.on('error', (error) => {
      if (error.code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
        const wrapped = new Error('HotelBeds mTLS certificate validation failed')
        wrapped.status = 503
        wrapped.code = 'HOTELBEDS_MTLS_FAILED'
        wrapped.cause = error
        reject(wrapped)
        return
      }
      const wrapped = new Error(error.message || 'HotelBeds request failed')
      wrapped.status = 502
      wrapped.code = 'HOTELBEDS_NETWORK_ERROR'
      wrapped.cause = error
      reject(wrapped)
    })

    if (body !== undefined) request.write(JSON.stringify(body))
    request.end()
  })
}

export async function hotelBedsRequest(path, options = {}) {
  return requestHttps({ baseUrl: getBaseUrl(options.contentApi), path, ...options })
}

export function createHotelBedsSignature(apiKey, secret, timestamp = Math.floor(Date.now() / 1000)) {
  return crypto.createHash('sha256').update(`${apiKey}${secret}${timestamp}`).digest('hex')
}
