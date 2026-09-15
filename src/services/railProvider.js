import { env } from '../config/env.js'

export const RAIL_BOOKING_STATUSES = Object.freeze({
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  PAYMENT_SUCCESS: 'PAYMENT_SUCCESS',
  BOOKING_IN_PROGRESS: 'BOOKING_IN_PROGRESS',
  CONFIRMED: 'CONFIRMED',
  BOOKING_FAILED: 'BOOKING_FAILED',
  CANCEL_REQUESTED: 'CANCEL_REQUESTED',
  CANCELLED: 'CANCELLED',
  REFUND_PENDING: 'REFUND_PENDING',
  REFUNDED: 'REFUNDED',
  REFUND_FAILED: 'REFUND_FAILED',
})

let providerOverride = null

function notConfigured(operation) {
  const error = new Error(`Rail provider is not configured for ${operation}. Configure RAIL_PROVIDER with an authorized railway provider before using this operation.`)
  error.status = 501
  error.code = 'RAIL_PROVIDER_NOT_CONFIGURED'
  return error
}

function configuredProvider() {
  return env.railProvider && env.railProvider !== 'none' && env.railProvider !== 'mock'
}

function operation(name) {
  if (providerOverride?.[name]) return providerOverride[name]
  if (!configuredProvider()) return async () => { throw notConfigured(name) }
  return async () => { throw notConfigured(name) }
}

export function setRailProviderOverride(override) {
  providerOverride = override
}

export function railProviderStatus() {
  return {
    configured: configuredProvider(),
    provider: env.railProvider,
    baseUrlConfigured: Boolean(env.railApiBaseUrl),
  }
}

export const searchTrains = (criteria) => operation('searchTrains')(criteria)
export const checkAvailability = (criteria) => operation('checkAvailability')(criteria)
export const getFare = (criteria) => operation('getFare')(criteria)
export const validateBooking = (input) => operation('validateBooking')(input)
export const bookTicket = (input) => operation('bookTicket')(input)
export const getBookingStatus = (reference) => operation('getBookingStatus')(reference)
export const getPNRStatus = (pnr) => operation('getPNRStatus')(pnr)
export const cancelTicket = (reference) => operation('cancelTicket')(reference)
export const getRefundStatus = (reference) => operation('getRefundStatus')(reference)
