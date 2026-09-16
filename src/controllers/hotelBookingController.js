import crypto from 'node:crypto'
import Razorpay from 'razorpay'
import { env } from '../config/env.js'
import { pool } from '../config/db.js'
import { calculateCouponDiscount } from '../services/couponService.js'
import { bookHotel, cancelHotel, checkRate } from '../services/hotelbedsService.js'

function getRazorpay() {
  if (!env.razorpayKeyId || !env.razorpayKeySecret) {
    const error = new Error('Razorpay is not configured on the server')
    error.status = 503
    throw error
  }
  return new Razorpay({ key_id: env.razorpayKeyId, key_secret: env.razorpayKeySecret })
}

function reference() {
  return `LT-HB-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
}

function checkedRates(response) {
  return (response?.hotel?.rooms || response?.hotels?.hotels?.[0]?.rooms || []).flatMap((room) => room.rates || [])
}

function normalizeSelections(selections) {
  return Array.isArray(selections) ? selections.map((selection) => ({
    rateKey: typeof selection.rateKey === 'string' ? selection.rateKey : typeof selection.rateId === 'string' ? selection.rateId : '',
    quantity: Number(selection.quantity),
    roomId: selection.roomId || null,
    roomName: selection.roomName || null,
    rateName: selection.rateName || null,
  })).filter((selection) => selection.rateKey && Number.isInteger(selection.quantity) && selection.quantity > 0) : []
}

function validateRequest(body) {
  const selections = normalizeSelections(body?.selections)
  const details = body?.details && typeof body.details === 'object' ? body.details : {}
  if (!body?.hotelId || !body?.checkIn || !body?.checkOut || !selections.length || !details.email) {
    const error = new Error('Hotel, stay dates, room rates, and contact email are required')
    error.status = 400
    throw error
  }
  return { hotelId: String(body.hotelId), checkIn: String(body.checkIn), checkOut: String(body.checkOut), selections, details, couponCode: typeof body.couponCode === 'string' ? body.couponCode.trim() : '' }
}

function calculateSupplierTotal(response, selections) {
  const rates = checkedRates(response)
  return selections.reduce((total, selection) => {
    const rate = rates.find((candidate) => candidate.rateKey === selection.rateKey)
    if (!rate || !Number.isFinite(Number(rate.net)) || Number(rate.net) <= 0) return Number.NaN
    return total + Number(rate.net) * selection.quantity
  }, 0)
}

export async function createHotelOrder(request, response, next) {
  const client = await pool.connect()
  try {
    const input = validateRequest(request.body)
    const rateResponse = await checkRate(input.selections.map((selection) => selection.rateKey))
    const supplierTotal = calculateSupplierTotal(rateResponse, input.selections)
    if (!Number.isFinite(supplierTotal) || supplierTotal <= 0) {
      const error = new Error('The selected hotel rate is no longer available. Please select a new rate.')
      error.status = 409
      throw error
    }

    const currency = rateResponse?.hotel?.currency || rateResponse?.hotels?.hotels?.[0]?.currency || 'EUR'
    const subtotalPaise = Math.round(supplierTotal * 100)
    const { discountPaise } = await calculateCouponDiscount(client, input.couponCode, 'hotel', subtotalPaise)
    const amountPaise = subtotalPaise - discountPaise
    if (amountPaise <= 0) {
      const error = new Error('The hotel booking amount is invalid after discounts.')
      error.status = 400
      throw error
    }

    const bookingReference = reference()
    const razorpay = getRazorpay()
    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency,
      receipt: bookingReference,
      notes: { itemType: 'hotel', hotelId: input.hotelId, rateKeys: input.selections.map((selection) => selection.rateKey).join(',') },
    })

    await client.query('BEGIN')
    const bookingResult = await client.query(
      `INSERT INTO travel_bookings (
        booking_reference, user_id, item_type, item_id, details, amount_paise,
        coupon_code, discount_paise, currency, status, supplier, supplier_hotel_code,
        supplier_rate_key, supplier_amount, supplier_currency, check_in, check_out,
        supplier_metadata
      ) VALUES ($1, $2, 'hotel', $3, $4, $5, $6, $7, $8, 'PENDING_PAYMENT', 'HOTELBEDS', $3, $9, $10, $8, $11, $12, $13)
      RETURNING id, booking_reference AS "bookingReference"`,
      [
        bookingReference,
        request.user.id,
        input.hotelId,
        JSON.stringify({ ...input.details, selections: input.selections, checkIn: input.checkIn, checkOut: input.checkOut }),
        amountPaise,
        input.couponCode || null,
        discountPaise,
        currency,
        input.selections.map((selection) => selection.rateKey).join(','),
        supplierTotal,
        input.checkIn,
        input.checkOut,
        JSON.stringify({ rateResponse }),
      ],
    )
    const booking = bookingResult.rows[0]
    await client.query(
      `INSERT INTO travel_payments (booking_id, provider_order_id, amount_paise, currency) VALUES ($1, $2, $3, $4)`,
      [booking.id, order.id, amountPaise, currency],
    )
    await client.query('COMMIT')
    return response.status(201).json({
      success: true,
      data: { orderId: order.id, amount: order.amount, currency: order.currency, keyId: env.razorpayKeyId, bookingId: booking.id, bookingReference: booking.bookingReference, subtotal: subtotalPaise / 100, discount: discountPaise / 100, supplier: 'HOTELBEDS' },
    })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    return next(error)
  } finally {
    client.release()
  }
}

function signatureMatches(orderId, paymentId, signature) {
  const expected = crypto.createHmac('sha256', env.razorpayKeySecret).update(`${orderId}|${paymentId}`).digest('hex')
  return expected.length === signature.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
}

function bookingPayload(booking) {
  const details = booking.details || {}
  const primaryGuest = details.guests?.[0] || {}
  const surname = primaryGuest.lastName || 'Guest'
  const rooms = (details.selections || []).map((selection, index) => ({
    rateKey: selection.rateKey,
    paxes: [{ roomId: index + 1, type: 'AD', name: primaryGuest.firstName || 'Guest', surname }],
  }))
  return {
    holder: { name: primaryGuest.firstName || 'Guest', surname },
    rooms,
    clientReference: booking.booking_reference,
    remark: 'LemonTrip hotel booking',
    language: 'ENG',
  }
}

export async function verifyHotelPayment(request, response, next) {
  const client = await pool.connect()
  try {
    if (!env.razorpayKeySecret) {
      const error = new Error('Razorpay is not configured on the server')
      error.status = 503
      throw error
    }
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, bookingId } = request.body || {}
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature || !bookingId) return response.status(400).json({ success: false, error: { message: 'Hotel payment verification details are required' } })
    if (!signatureMatches(razorpayOrderId, razorpayPaymentId, razorpaySignature)) return response.status(400).json({ success: false, error: { message: 'Invalid payment signature' } })

    const bookingResult = await client.query(
      `SELECT b.*, p.provider_order_id, p.status AS payment_status
       FROM travel_bookings b JOIN travel_payments p ON p.booking_id = b.id
       WHERE b.id = $1 AND b.user_id = $2 AND b.item_type = 'hotel' AND p.provider_order_id = $3
       LIMIT 1`,
      [bookingId, request.user.id, razorpayOrderId],
    )
    const booking = bookingResult.rows[0]
    if (!booking || booking.payment_status !== 'created') return response.status(409).json({ success: false, error: { message: 'Hotel payment is already processed or booking is invalid' } })

    await client.query('BEGIN')
    await client.query(`UPDATE travel_payments SET provider_payment_id = $1, signature = $2, status = 'paid', paid_at = NOW() WHERE booking_id = $3 AND provider_order_id = $4`, [razorpayPaymentId, razorpaySignature, bookingId, razorpayOrderId])
    await client.query(`UPDATE travel_bookings SET status = 'PAYMENT_SUCCESS', updated_at = NOW() WHERE id = $1`, [bookingId])
    await client.query('COMMIT')

    await client.query(`UPDATE travel_bookings SET status = 'BOOKING_IN_PROGRESS', updated_at = NOW() WHERE id = $1`, [bookingId])
    let supplierResponse
    try {
      supplierResponse = await bookHotel(bookingPayload(booking))
    } catch (error) {
      await client.query(`UPDATE travel_bookings SET status = 'BOOKING_FAILED', updated_at = NOW(), supplier_metadata = supplier_metadata || $1 WHERE id = $2`, [JSON.stringify({ bookingError: error.message }), bookingId])
      return response.status(error.status || 502).json({ success: false, error: { message: 'Payment succeeded, but Hotelbeds could not confirm the reservation. Support must review this booking.' } })
    }

    const supplierBooking = supplierResponse?.booking || supplierResponse
    const supplierReference = supplierBooking?.reference || supplierBooking?.bookingReference || supplierBooking?.confirmationNumber
    if (!supplierReference) {
      await client.query(`UPDATE travel_bookings SET status = 'BOOKING_FAILED', updated_at = NOW(), supplier_metadata = supplier_metadata || $1 WHERE id = $2`, [JSON.stringify({ supplierResponse }), bookingId])
      return response.status(502).json({ success: false, error: { message: 'Hotelbeds returned no reservation reference after payment.' } })
    }
    await client.query(`UPDATE travel_bookings SET status = 'CONFIRMED', supplier_booking_reference = $1, supplier_confirmation_number = $2, supplier_metadata = supplier_metadata || $3, updated_at = NOW() WHERE id = $4`, [supplierReference, supplierBooking.confirmationNumber || supplierReference, JSON.stringify({ supplierResponse }), bookingId])
    return response.json({ success: true, data: { bookingReference: booking.booking_reference, supplierReference, status: 'CONFIRMED' } })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    return next(error)
  } finally {
    client.release()
  }
}

export async function cancelHotelBooking(request, response, next) {
  const client = await pool.connect()
  try {
    const result = await client.query(`SELECT * FROM travel_bookings WHERE id = $1 AND user_id = $2 AND item_type = 'hotel' LIMIT 1`, [request.params.bookingId, request.user.id])
    const booking = result.rows[0]
    if (!booking) return response.status(404).json({ success: false, error: { message: 'Hotel booking not found' } })
    if (!['CONFIRMED', 'confirmed'].includes(booking.status) || !booking.supplier_booking_reference) return response.status(409).json({ success: false, error: { message: 'This hotel booking cannot be cancelled.' } })
    const cancellation = await cancelHotel(booking.supplier_booking_reference)
    await client.query(`UPDATE travel_bookings SET status = 'CANCELLED', updated_at = NOW(), supplier_metadata = supplier_metadata || $1 WHERE id = $2`, [JSON.stringify({ cancellation }), booking.id])
    return response.json({ success: true, data: { status: 'CANCELLED', refundStatus: 'REQUIRES_REVIEW' } })
  } catch (error) {
    return next(error)
  } finally {
    client.release()
  }
}
