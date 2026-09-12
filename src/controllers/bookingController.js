import { pool } from '../config/db.js'

export async function getRecentBookings(request, response, next) {
  try {
    const result = await pool.query(
      `SELECT id, booking_reference AS "bookingReference", item_type AS type,
              status, created_at AS date, ROUND(amount_paise / 100.0, 2)::float AS amount,
              currency, details
       FROM travel_bookings
       WHERE user_id = $1
       UNION ALL
       SELECT id, booking_reference AS "bookingReference", 'bus' AS type,
              status, created_at AS date, ROUND(amount_paise / 100.0, 2)::float AS amount,
              currency, jsonb_build_object('passengerCount', passenger_count, 'busId', bus_id) AS details
       FROM bus_bookings
       WHERE user_id = $1
       ORDER BY date DESC
       LIMIT 10`,
      [request.user.id],
    )
    return response.json({ success: true, data: result.rows })
  } catch (error) {
    return next(error)
  }
}