import { pool } from '../config/db.js'
import { cancelTicket, checkAvailability, getBookingStatus, getPNRStatus, railProviderStatus } from '../services/railProvider.js'

const trainFields = `
  id, train_number AS number, name, origin AS "from", destination AS "to",
  TO_CHAR(departure_time, 'HH24:MI') AS departure,
  TO_CHAR(arrival_time, 'HH24:MI') AS arrival,
  duration_label AS duration, classes,
  CONCAT('From ', currency, ' ', TO_CHAR(price_amount, 'FM9999999990.##')) AS price
`

export async function search(request, response, next) {
  try {
    const values = []
    const filters = ['active = TRUE']
    const from = String(request.query.from || '').trim()
    const to = String(request.query.to || '').trim()
    const journeyDate = String(request.query.date || '').trim()
    const trainClass = String(request.query.trainClass || '').trim()
    const quota = String(request.query.quota || '').trim()

    if (from) {
      values.push(`%${from}%`)
      filters.push(`origin ILIKE $${values.length}`)
    }
    if (to) {
      values.push(`%${to}%`)
      filters.push(`destination ILIKE $${values.length}`)
    }

    const result = await pool.query(`SELECT ${trainFields} FROM train_services WHERE ${filters.join(' AND ')} ORDER BY departure_time`, values)
    return response.json({ success: true, data: { trains: result.rows, total: result.rowCount, source: 'catalog', availability: 'not_supplier_verified', requested: { journeyDate, trainClass, quota } } })
  } catch (error) {
    return next(error)
  }
}

export async function availability(request, response, next) {
  try {
    const result = await checkAvailability(request.body || {})
    return response.json({ success: true, data: result })
  } catch (error) {
    return next(error)
  }
}

export async function pnrStatus(request, response, next) {
  try {
    const result = await getPNRStatus(request.params.pnr)
    return response.json({ success: true, data: result })
  } catch (error) {
    return next(error)
  }
}

export async function bookingStatus(request, response, next) {
  try {
    const local = await pool.query('SELECT id, booking_reference AS "bookingReference", status, pnr, supplier_status AS "supplierStatus", supplier_booking_reference AS "supplierBookingReference", refund_status AS "refundStatus" FROM travel_bookings WHERE id = $1 AND user_id = $2 AND item_type = \'train\' LIMIT 1', [request.params.id, request.user.id])
    if (!local.rows[0]) return response.status(404).json({ success: false, error: { message: 'Train booking not found' } })
    const booking = local.rows[0]
    if (booking.supplierBookingReference) {
      const supplier = await getBookingStatus(booking.supplierBookingReference)
      return response.json({ success: true, data: { ...booking, supplier } })
    }
    return response.json({ success: true, data: booking })
  } catch (error) {
    return next(error)
  }
}

export async function cancelBooking(request, response, next) {
  try {
    const local = await pool.query('SELECT id, supplier_booking_reference AS "supplierBookingReference", status FROM travel_bookings WHERE id = $1 AND user_id = $2 AND item_type = \'train\' LIMIT 1', [request.params.id, request.user.id])
    const booking = local.rows[0]
    if (!booking) return response.status(404).json({ success: false, error: { message: 'Train booking not found' } })
    if (booking.status !== 'CONFIRMED' || !booking.supplierBookingReference) return response.status(409).json({ success: false, error: { message: 'This train booking is not supplier-confirmed or cannot be cancelled.' } })
    await pool.query("UPDATE travel_bookings SET status = 'CANCEL_REQUESTED', cancellation_status = 'REQUESTED', updated_at = NOW() WHERE id = $1", [booking.id])
    const result = await cancelTicket(booking.supplierBookingReference)
    await pool.query("UPDATE travel_bookings SET status = 'CANCELLED', cancellation_status = 'CANCELLED', refund_status = 'PENDING', updated_at = NOW(), supplier_raw_response = $1 WHERE id = $2", [JSON.stringify(result), booking.id])
    return response.json({ success: true, data: { status: 'CANCELLED', refundStatus: 'PENDING' } })
  } catch (error) {
    return next(error)
  }
}

export function providerStatus(_request, response) {
  return response.json({ success: true, data: railProviderStatus() })
}

export async function getTrain(request, response, next) {
  try {
    const result = await pool.query(`SELECT ${trainFields} FROM train_services WHERE id = $1 AND active = TRUE LIMIT 1`, [request.params.trainId])
    if (!result.rows[0]) return response.status(404).json({ success: false, error: { message: 'Train service not found' } })
    return response.json({ success: true, data: result.rows[0] })
  } catch (error) {
    return next(error)
  }
}
