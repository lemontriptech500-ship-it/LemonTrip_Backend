import crypto from 'node:crypto'
import Razorpay from 'razorpay'
import { env } from '../config/env.js'
import { pool } from '../config/db.js'

function getRazorpay() {
  if (!env.razorpayKeyId || !env.razorpayKeySecret) {
    const error = new Error('Razorpay is not configured on the server')
    error.status = 503
    throw error
  }
  return new Razorpay({ key_id: env.razorpayKeyId, key_secret: env.razorpayKeySecret })
}

function makeBookingReference() {
  return `LT-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
}

export async function createFlightOrder(request, response, next) {
  const client = await pool.connect()
  try {
    const { flightId, fareId, travellers = [], contact = {} } = request.body
    if (!flightId || !fareId || !Array.isArray(travellers) || travellers.length === 0 || !contact.email) {
      return response.status(400).json({ success: false, error: { message: 'Flight, fare, traveller, and contact details are required' } })
    }

    const flightResult = await client.query('SELECT id, currency, fare_options FROM flights WHERE id = $1 LIMIT 1', [flightId])
    const flight = flightResult.rows[0]
    if (!flight) return response.status(404).json({ success: false, error: { message: 'Flight not found' } })

    const fare = (flight.fare_options || []).find((option) => option.id === fareId)
    if (!fare || !Number.isFinite(Number(fare.price)) || Number(fare.price) <= 0) {
      return response.status(400).json({ success: false, error: { message: 'Selected fare is invalid or unavailable' } })
    }

    const amountPaise = Math.round(Number(fare.price) * 100)
    const razorpay = getRazorpay()
    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: flight.currency || 'INR',
      receipt: makeBookingReference(),
      notes: { flightId, fareId },
    })

    await client.query('BEGIN')
    const bookingResult = await client.query(
      `INSERT INTO flight_bookings (booking_reference, user_id, flight_id, fare_id, travellers, contact, amount_paise, currency)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, booking_reference AS "bookingReference"`,
      [makeBookingReference(), request.user?.id || null, flightId, fareId, JSON.stringify(travellers), JSON.stringify(contact), amountPaise, flight.currency || 'INR'],
    )
    const booking = bookingResult.rows[0]
    await client.query(
      `INSERT INTO flight_payments (booking_id, provider_order_id, amount_paise, currency)
       VALUES ($1, $2, $3, $4)`,
      [booking.id, order.id, amountPaise, flight.currency || 'INR'],
    )
    await client.query('COMMIT')

    return response.status(201).json({
      success: true,
      data: { orderId: order.id, amount: order.amount, currency: order.currency, keyId: env.razorpayKeyId, bookingId: booking.id, bookingReference: booking.bookingReference },
    })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    return next(error)
  } finally {
    client.release()
  }
}

export async function verifyFlightPayment(request, response, next) {
  const client = await pool.connect()
  try {
    if (!env.razorpayKeySecret) {
      const error = new Error('Razorpay is not configured on the server')
      error.status = 503
      throw error
    }
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, bookingId } = request.body
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature || !bookingId) {
      return response.status(400).json({ success: false, error: { message: 'Payment verification details are required' } })
    }

    const expectedSignature = crypto
      .createHmac('sha256', env.razorpayKeySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex')
    const signaturesMatch = expectedSignature.length === razorpaySignature.length && crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(razorpaySignature))
    if (!signaturesMatch) return response.status(400).json({ success: false, error: { message: 'Invalid payment signature' } })

    await client.query('BEGIN')
    const paymentResult = await client.query(
      `UPDATE flight_payments SET provider_payment_id = $1, signature = $2, status = 'paid', paid_at = NOW()
       WHERE booking_id = $3 AND provider_order_id = $4 AND status = 'created'
       RETURNING id`,
      [razorpayPaymentId, razorpaySignature, bookingId, razorpayOrderId],
    )
    if (!paymentResult.rows[0]) {
      await client.query('ROLLBACK')
      return response.status(409).json({ success: false, error: { message: 'Payment is already processed or booking is invalid' } })
    }
    const bookingResult = await client.query(
      `UPDATE flight_bookings SET status = 'confirmed', updated_at = NOW()
       WHERE id = $1 RETURNING booking_reference AS "bookingReference"`,
      [bookingId],
    )
    await client.query('COMMIT')
    return response.json({ success: true, data: { bookingReference: bookingResult.rows[0]?.bookingReference || null, status: 'confirmed' } })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    return next(error)
  } finally {
    client.release()
  }
}

const travelCatalogQueries = {
  bus: 'SELECT price, currency, seats_left AS "seatsLeft" FROM bus_services WHERE id = $1 AND active = TRUE LIMIT 1',
  train: 'SELECT price_amount AS price, currency FROM train_services WHERE id = $1 AND active = TRUE LIMIT 1',
  package: 'SELECT price_amount AS price, currency FROM travel_packages WHERE id = $1 LIMIT 1',
}

export async function createTravelOrder(request, response, next) {
  const client = await pool.connect()
  try {
    const { itemType, itemId, quantity = 1, details = {} } = request.body
    const normalizedQuantity = Number(quantity)
    const catalogQuery = Object.prototype.hasOwnProperty.call(travelCatalogQueries, itemType) ? travelCatalogQueries[itemType] : null
    if (!catalogQuery || !itemId || !Number.isInteger(normalizedQuantity) || normalizedQuantity < 1 || !details || typeof details !== 'object' || !details.email) {
      return response.status(400).json({ success: false, error: { message: 'A valid travel item, quantity, and contact email are required' } })
    }

    const catalogResult = await client.query(catalogQuery, [itemId])
    const item = catalogResult.rows[0]
    if (!item) return response.status(404).json({ success: false, error: { message: 'Travel item not found' } })
    if (itemType === 'bus' && normalizedQuantity > Number(item.seatsLeft)) {
      return response.status(409).json({ success: false, error: { message: 'Not enough seats are available' } })
    }

    const amountPaise = Math.round(Number(item.price) * 100 * normalizedQuantity)
    if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
      return response.status(400).json({ success: false, error: { message: 'Travel item price is invalid' } })
    }

    const razorpay = getRazorpay()
    const bookingReference = makeBookingReference()
    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: item.currency || 'INR',
      receipt: bookingReference,
      notes: { itemType, itemId, quantity: String(normalizedQuantity) },
    })

    await client.query('BEGIN')
    const bookingResult = await client.query(
      `INSERT INTO travel_bookings (booking_reference, user_id, item_type, item_id, details, amount_paise, currency)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, booking_reference AS "bookingReference"`,
      [bookingReference, request.user?.id || null, itemType, itemId, JSON.stringify({ ...details, quantity: normalizedQuantity }), amountPaise, item.currency || 'INR'],
    )
    const booking = bookingResult.rows[0]
    await client.query(
      `INSERT INTO travel_payments (booking_id, provider_order_id, amount_paise, currency)
       VALUES ($1, $2, $3, $4)`,
      [booking.id, order.id, amountPaise, item.currency || 'INR'],
    )
    await client.query('COMMIT')

    return response.status(201).json({
      success: true,
      data: { orderId: order.id, amount: order.amount, currency: order.currency, keyId: env.razorpayKeyId, bookingId: booking.id, bookingReference: booking.bookingReference },
    })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    return next(error)
  } finally {
    client.release()
  }
}

export async function verifyTravelPayment(request, response, next) {
  const client = await pool.connect()
  try {
    if (!env.razorpayKeySecret) {
      const error = new Error('Razorpay is not configured on the server')
      error.status = 503
      throw error
    }
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, bookingId } = request.body
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature || !bookingId) {
      return response.status(400).json({ success: false, error: { message: 'Payment verification details are required' } })
    }

    const expectedSignature = crypto.createHmac('sha256', env.razorpayKeySecret).update(`${razorpayOrderId}|${razorpayPaymentId}`).digest('hex')
    const signaturesMatch = expectedSignature.length === razorpaySignature.length && crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(razorpaySignature))
    if (!signaturesMatch) return response.status(400).json({ success: false, error: { message: 'Invalid payment signature' } })

    await client.query('BEGIN')
    const paymentResult = await client.query(
      `UPDATE travel_payments SET provider_payment_id = $1, signature = $2, status = 'paid', paid_at = NOW()
       WHERE booking_id = $3 AND provider_order_id = $4 AND status = 'created' RETURNING id`,
      [razorpayPaymentId, razorpaySignature, bookingId, razorpayOrderId],
    )
    if (!paymentResult.rows[0]) {
      await client.query('ROLLBACK')
      return response.status(409).json({ success: false, error: { message: 'Payment is already processed or booking is invalid' } })
    }
    const bookingResult = await client.query(
      `UPDATE travel_bookings SET status = 'confirmed', updated_at = NOW()
       WHERE id = $1 RETURNING booking_reference AS "bookingReference"`,
      [bookingId],
    )
    await client.query('COMMIT')
    return response.json({ success: true, data: { bookingReference: bookingResult.rows[0]?.bookingReference || null, status: 'confirmed' } })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    return next(error)
  } finally {
    client.release()
  }
}