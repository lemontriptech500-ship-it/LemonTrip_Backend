import { bookTicket } from './railProvider.js'

export async function confirmTrainWithSupplier(client, booking, supplierBook = bookTicket) {
  await client.query("UPDATE travel_bookings SET status = 'BOOKING_IN_PROGRESS', supplier_status = 'BOOKING_IN_PROGRESS', updated_at = NOW() WHERE id = $1 AND status = 'PAYMENT_SUCCESS'", [booking.id])
  try {
    const supplier = await supplierBook({ bookingId: booking.id, bookingReference: booking.bookingReference, ...booking.details })
    const supplierReference = supplier?.bookingReference || supplier?.reference || null
    const pnr = supplier?.pnr || supplier?.PNR || null
    if (!supplierReference && !pnr) throw Object.assign(new Error('Rail provider returned no booking reference.'), { status: 502 })
    await client.query("UPDATE travel_bookings SET status = 'CONFIRMED', supplier_status = 'CONFIRMED', supplier_booking_reference = $1, pnr = $2, supplier_fare = $3, supplier_currency = $4, supplier_raw_response = $5, updated_at = NOW() WHERE id = $6", [supplierReference, pnr, supplier?.fare || null, supplier?.currency || null, JSON.stringify(supplier), booking.id])
    return { supplierReference, pnr, status: 'CONFIRMED' }
  } catch (error) {
    await client.query("UPDATE travel_bookings SET status = 'BOOKING_FAILED', supplier_status = 'BOOKING_FAILED', supplier_raw_response = $1, updated_at = NOW() WHERE id = $2", [JSON.stringify({ message: error.message, code: error.code || null }), booking.id])
    throw error
  }
}
