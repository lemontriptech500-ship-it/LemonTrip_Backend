import crypto from 'node:crypto'
import Razorpay from 'razorpay'
import { env } from '../config/env.js'
import { pool } from '../config/db.js'
import { calculateCouponDiscount } from '../services/couponService.js'
import { checkHotelBedsAvailability, confirmHotelBedsBooking, getHotelBedsHotel } from '../services/hotelbedsService.js'
import { createBooking as createIrctcBooking, getTrain as getIrctcTrain } from '../services/irctcService.js'
import { confirmTrainWithSupplier } from '../services/trainBookingService.js'

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
    const { flightId, fareId, travellers = [], contact = {}, couponCode = '' } = request.body
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

    const subtotalPaise = Math.round(Number(fare.price) * travellers.length * 100)
    const { discountPaise } = await calculateCouponDiscount(client, couponCode, 'flight', subtotalPaise)
    const amountPaise = subtotalPaise - discountPaise
    const razorpay = getRazorpay()
    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: flight.currency || 'INR',
      receipt: makeBookingReference(),
      notes: { flightId, fareId, couponCode: couponCode || '' },
    })

    await client.query('BEGIN')
    const bookingResult = await client.query(
      `INSERT INTO flight_bookings (booking_reference, user_id, flight_id, fare_id, travellers, contact, amount_paise, coupon_code, discount_paise, currency)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, booking_reference AS "bookingReference"`,
      [makeBookingReference(), request.user?.id || null, flightId, fareId, JSON.stringify(travellers), JSON.stringify(contact), amountPaise, couponCode.trim() || null, discountPaise, flight.currency || 'INR'],
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
      data: { orderId: order.id, amount: order.amount, currency: order.currency, keyId: env.razorpayKeyId, bookingId: booking.id, bookingReference: booking.bookingReference, subtotal: subtotalPaise / 100, discount: discountPaise / 100 },
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
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, bookingId, itemType = 'travel' } = request.body
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature || !bookingId || !['bus', 'travel'].includes(itemType)) {
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
  hotel: 'SELECT id, currency, catalog FROM hotels WHERE id = $1 AND active = TRUE LIMIT 1',
  bus: 'SELECT price, currency, seats_left AS "seatsLeft" FROM bus_services WHERE id = $1 AND active = TRUE LIMIT 1',
  train: 'SELECT price_amount AS price, currency FROM train_services WHERE id = $1 AND active = TRUE LIMIT 1',
  package: 'SELECT price_amount AS price, currency FROM travel_packages WHERE id = $1 LIMIT 1',
}

export async function createTravelOrder(request, response, next) {
  const client = await pool.connect()
  try {
    const { itemType, itemId, quantity = 1, details = {}, couponCode = '' } = request.body
    const normalizedQuantity = Number(quantity)
    const catalogQuery = Object.prototype.hasOwnProperty.call(travelCatalogQueries, itemType) ? travelCatalogQueries[itemType] : null
    if (!catalogQuery || !itemId || !Number.isInteger(normalizedQuantity) || normalizedQuantity < 1 || !details || typeof details !== 'object' || !details.email) {
      return response.status(400).json({ success: false, error: { message: 'A valid travel item, quantity, and contact email are required' } })
    }
    if (itemType === 'train' && details.idempotencyKey) {
      const existing = await client.query(
        `SELECT b.id, b.booking_reference AS "bookingReference", b.amount_paise, b.currency, p.provider_order_id
         FROM travel_bookings b JOIN travel_payments p ON p.booking_id = b.id
         WHERE b.idempotency_key = $1 AND b.user_id = $2 LIMIT 1`,
        [String(details.idempotencyKey), request.user?.id || null],
      )
      if (existing.rows[0]) {
        const booking = existing.rows[0]
        return response.status(200).json({ success: true, data: { orderId: booking.provider_order_id, amount: booking.amount_paise, currency: booking.currency, keyId: env.razorpayKeyId, bookingId: booking.id, bookingReference: booking.bookingReference } })
      }
    }

    const providerHotel = itemType === 'hotel' && itemId.startsWith('hb-') ? getHotelBedsHotel(itemId) : null
    const providerTrain = itemType === 'train' && itemId.startsWith('irctc-') ? await getIrctcTrain(itemId) : null
    const provider = itemType === 'train' ? 'irctc' : providerHotel ? 'hotelbeds' : null
    const catalogResult = providerHotel || providerTrain ? { rows: [] } : await client.query(catalogQuery, [itemId])
    const item = providerHotel || providerTrain || catalogResult.rows[0]
    if (!item) return response.status(404).json({ success: false, error: { message: 'Travel item not found' } })
    if (itemType === 'bus' && normalizedQuantity > Number(item.seatsLeft)) {
      return response.status(409).json({ success: false, error: { message: 'Not enough seats are available' } })
    }

    let amountPaise
    if (itemType === 'hotel') {
      if (!Array.isArray(details.selections) || details.selections.length === 0 || !Number.isInteger(normalizedQuantity)) {
        return response.status(400).json({ success: false, error: { message: 'Hotel room selections and nights are required' } })
      }

      const catalogRooms = providerHotel ? item.rooms : item.catalog?.rooms || []
      const roomTotal = details.selections.reduce((total, selection) => {
        const room = catalogRooms.find((candidate) => candidate.id === selection.roomId)
        const rate = room?.rates?.find((candidate) => candidate.id === selection.rateId)
        const roomQuantity = Number(selection.quantity)
        if (!room || !rate || !Number.isInteger(roomQuantity) || roomQuantity < 1 || roomQuantity > Number(room.availableQuantity || 0)) {
          return Number.NaN
        }
        return total + Number(rate.pricePerNight) * roomQuantity
      }, 0)
      if (providerHotel && !await checkHotelBedsAvailability(providerHotel, details)) {
        return response.status(409).json({ success: false, error: { message: 'The selected hotel room is no longer available' } })
      }
      if (providerHotel && details.selections.some((selection) => {
        const rate = providerHotel.rooms.flatMap((room) => room.rates).find((candidate) => candidate.id === selection.rateId)
        return rate?.hotelbeds?.paymentType === 'AT_WEB'
      })) {
        return response.status(409).json({ success: false, error: { message: 'This Hotelbeds TEST rate requires supplier payment and cannot use Razorpay. Select an AT_HOTEL rate.' } })
      }
      amountPaise = Math.round(roomTotal * normalizedQuantity * 100)
    } else {
      amountPaise = Math.round(Number(item.priceAmount || item.price) * 100 * normalizedQuantity)
    }
    if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
      return response.status(400).json({ success: false, error: { message: 'Travel item price is invalid' } })
    }

    const subtotalPaise = amountPaise
    const { discountPaise } = await calculateCouponDiscount(client, couponCode, itemType, subtotalPaise)
    amountPaise -= discountPaise

    await client.query('BEGIN')
    if (itemType === 'bus') {
      const seatResult = await client.query(
        `UPDATE bus_services SET seats_left = seats_left - $1, updated_at = NOW()
         WHERE id = $2 AND active = TRUE AND seats_left >= $1
         RETURNING id`,
        [normalizedQuantity, itemId],
      )
      if (!seatResult.rows[0]) {
        await client.query('ROLLBACK')
        return response.status(409).json({ success: false, error: { message: 'Not enough seats are available' } })
      }
    }

    const razorpay = getRazorpay()
    const bookingReference = makeBookingReference()
    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: item.currency || 'INR',
      receipt: bookingReference,
      notes: { itemType, itemId, quantity: String(normalizedQuantity), couponCode: couponCode || '' },
    })

    if (itemType === 'bus') {
      const bookingResult = await client.query(
        `INSERT INTO bus_bookings (booking_reference, user_id, bus_id, passenger_count, contact, amount_paise, coupon_code, discount_paise, currency)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, booking_reference AS "bookingReference"`,
          [bookingReference, request.user?.id || null, itemId, normalizedQuantity, JSON.stringify(details), amountPaise, couponCode.trim() || null, discountPaise, item.currency || 'INR'],
      )
      const booking = bookingResult.rows[0]
      await client.query(
        `INSERT INTO bus_payments (booking_id, provider_order_id, amount_paise, currency)
         VALUES ($1, $2, $3, $4)`,
        [booking.id, order.id, amountPaise, item.currency || 'INR'],
      )
      await client.query('COMMIT')
      return response.status(201).json({
        success: true,
        data: { orderId: order.id, amount: order.amount, currency: order.currency, keyId: env.razorpayKeyId, bookingId: booking.id, bookingReference: booking.bookingReference, subtotal: subtotalPaise / 100, discount: discountPaise / 100 },
      })
    }

    const bookingResult = await client.query(
      `INSERT INTO travel_bookings (booking_reference, user_id, item_type, item_id, details, amount_paise, coupon_code, discount_paise, currency, status, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id, booking_reference AS "bookingReference"`,
      [bookingReference, request.user?.id || null, itemType, itemId, JSON.stringify({ ...details, itemId, quantity: normalizedQuantity, ...(providerHotel ? { providerSnapshot: providerHotel } : {}) }), amountPaise, couponCode.trim() || null, discountPaise, item.currency || 'INR', itemType === 'train' ? 'PENDING_PAYMENT' : 'pending', itemType === 'train' ? (details.idempotencyKey || null) : null],
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
      data: { orderId: order.id, amount: order.amount, currency: order.currency, keyId: env.razorpayKeyId, bookingId: booking.id, bookingReference: booking.bookingReference, subtotal: subtotalPaise / 100, discount: discountPaise / 100 },
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
    const paymentTable = request.body.itemType === 'bus' ? 'bus_payments' : 'travel_payments'
    const paymentResult = await client.query(
      `UPDATE ${paymentTable} SET provider_payment_id = $1, signature = $2, status = 'paid', paid_at = NOW()
       WHERE booking_id = $3 AND provider_order_id = $4 AND status = 'created' RETURNING id`,
      [razorpayPaymentId, razorpaySignature, bookingId, razorpayOrderId],
    )
    if (!paymentResult.rows[0]) {
      await client.query('ROLLBACK')
      return response.status(409).json({ success: false, error: { message: 'Payment is already processed or booking is invalid' } })
    }
    if (request.body.itemType === 'train') {
      const trainResult = await client.query(
        `SELECT id, booking_reference AS "bookingReference", details FROM travel_bookings WHERE id = $1 AND item_type = 'train' LIMIT 1`,
        [bookingId],
      )
      if (!trainResult.rows[0]) {
        await client.query('ROLLBACK')
        return response.status(404).json({ success: false, error: { message: 'Train booking not found' } })
      }
      await client.query("UPDATE travel_bookings SET status = 'PAYMENT_SUCCESS', supplier_status = 'PAYMENT_SUCCESS', updated_at = NOW() WHERE id = $1", [bookingId])
      await client.query('COMMIT')
      try {
        const confirmed = await confirmTrainWithSupplier(client, { id: bookingId, bookingReference: trainResult.rows[0].bookingReference, details: trainResult.rows[0].details })
        return response.json({ success: true, data: { bookingReference: trainResult.rows[0].bookingReference, ...confirmed } })
      } catch (error) {
        return response.status(error.status || 502).json({ success: false, error: { message: error.status === 501 ? 'Payment succeeded, but no authorized rail provider is configured. The train ticket is not confirmed.' : 'Payment succeeded, but the rail provider could not confirm the ticket.' } })
      }
    }
    const bookingTable = request.body.itemType === 'bus' ? 'bus_bookings' : 'travel_bookings'
    const bookingResult = request.body.itemType === 'bus'
      ? await client.query(
        `UPDATE bus_bookings SET status = 'confirmed', updated_at = NOW()
         WHERE id = $1 RETURNING booking_reference AS "bookingReference"`,
        [bookingId],
      )
      : await client.query(
        `UPDATE travel_bookings SET status = 'confirmed', updated_at = NOW()
         WHERE id = $1 RETURNING booking_reference AS "bookingReference", item_type AS "itemType", item_id AS "itemId", details, provider`,
        [bookingId],
      )
    await client.query('COMMIT')

    if (bookingResult.rows[0]?.provider === 'hotelbeds') {
      try {
        const providerResponse = await confirmHotelBedsBooking({
          booking_reference: bookingResult.rows[0].bookingReference,
          user_id: request.user?.id || null,
          details: bookingResult.rows[0].details,
        })
        await client.query(
          `UPDATE travel_bookings SET provider_booking_reference = $1, provider_response = $2, status = 'confirmed', updated_at = NOW() WHERE id = $3`,
          [providerResponse.reference || providerResponse.booking?.reference, JSON.stringify(providerResponse), bookingId],
        )
        return response.json({ success: true, data: { bookingReference: bookingResult.rows[0].bookingReference, providerBookingReference: providerResponse.reference || providerResponse.booking?.reference || null, status: 'confirmed' } })
      } catch (providerError) {
        await client.query(`UPDATE travel_bookings SET status = 'failed', updated_at = NOW() WHERE id = $1`, [bookingId])
        return next(providerError)
      }
    }
    if (bookingResult.rows[0]?.provider === 'irctc') {
      try {
        const details = bookingResult.rows[0].details || {}
        const providerResponse = await createIrctcBooking({
          bookingReference: bookingResult.rows[0].bookingReference,
          train: { trainId: bookingResult.rows[0].itemId, journeyDate: details.journeyDate, trainClass: details.trainClass },
          passengers: details.passengers?.length ? details.passengers : [{ name: details.email, age: 0, gender: 'U' }],
          contact: { email: details.email, phone: details.phone },
        })
        await client.query(
          `INSERT INTO irctc_bookings (travel_booking_id, pnr, ticket_number, provider_reference, passenger_details, ticket_details, provider_response, status)
           SELECT id, $1, $2, $3, $4, $5, $6, $7 FROM travel_bookings WHERE id = $8
           ON CONFLICT (travel_booking_id) DO UPDATE SET pnr = EXCLUDED.pnr, ticket_number = EXCLUDED.ticket_number, provider_reference = EXCLUDED.provider_reference, passenger_details = EXCLUDED.passenger_details, ticket_details = EXCLUDED.ticket_details, provider_response = EXCLUDED.provider_response, status = EXCLUDED.status, updated_at = NOW()`,
          [providerResponse.pnr || null, providerResponse.ticketNumber || null, providerResponse.providerReference || providerResponse.pnr || null, JSON.stringify(providerResponse.passengers || details.passengers || []), JSON.stringify(providerResponse), JSON.stringify(providerResponse), providerResponse.status || 'CONFIRMED', bookingId],
        )
        await client.query(`UPDATE travel_bookings SET provider_booking_reference = $1, provider_response = $2, updated_at = NOW() WHERE id = $3`, [providerResponse.pnr || providerResponse.ticketNumber, JSON.stringify(providerResponse), bookingId])
        return response.json({ success: true, data: { bookingReference: bookingResult.rows[0].bookingReference, pnr: providerResponse.pnr || null, ticketNumber: providerResponse.ticketNumber || null, status: providerResponse.status || 'CONFIRMED' } })
      } catch (providerError) {
        await client.query(`UPDATE travel_bookings SET status = 'failed', updated_at = NOW() WHERE id = $1`, [bookingId])
        return next(providerError)
      }
    }
    return response.json({ success: true, data: { bookingReference: bookingResult.rows[0]?.bookingReference || null, status: 'confirmed' } })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    return next(error)
  } finally {
    client.release()
  }
}