import { pool } from '../config/db.js'

export async function getRecentBookings(request, response, next) {
  try {
    const result = await pool.query(
          `SELECT b.id, b.booking_reference AS "bookingReference", 'flight' AS type,
        b.status, b.created_at AS date, ROUND(b.amount_paise / 100.0, 2)::float AS amount,
        b.currency,
        CONCAT(COALESCE(f.origin, 'Unknown'), ' to ', COALESCE(f.destination, 'Unknown')) AS title,
        jsonb_build_object(
          'flightId', b.flight_id,
          'fareId', b.fare_id,
          'airline', f.airline,
          'flightNumber', f.flight_number,
          'travellers', b.travellers,
          'contact', b.contact,
          'couponCode', b.coupon_code,
          'discount', ROUND(b.discount_paise / 100.0, 2)::float
        ) AS details
      FROM flight_bookings b
      LEFT JOIN flights f ON f.id = b.flight_id
      WHERE b.user_id = $1
      UNION ALL
      SELECT b.id, b.booking_reference AS "bookingReference", b.item_type AS type,
        b.status, b.created_at AS date, ROUND(b.amount_paise / 100.0, 2)::float AS amount,
        b.currency,
        CASE
          WHEN b.item_type = 'hotel' THEN COALESCE(h.name, 'Hotel booking')
          WHEN b.item_type = 'train' THEN COALESCE(ts.name, 'Train booking')
          WHEN b.item_type = 'package' THEN COALESCE(tp.destination, 'Package booking')
          ELSE INITCAP(b.item_type) || ' booking'
        END AS title,
        b.details || jsonb_build_object('itemId', b.item_id, 'couponCode', b.coupon_code, 'discount', ROUND(b.discount_paise / 100.0, 2)::float) AS details
      FROM travel_bookings b
      LEFT JOIN hotels h ON b.item_type = 'hotel' AND h.id = b.item_id
      LEFT JOIN train_services ts ON b.item_type = 'train' AND ts.id = b.item_id
      LEFT JOIN travel_packages tp ON b.item_type = 'package' AND tp.id = b.item_id
      WHERE b.user_id = $1
       UNION ALL
      SELECT b.id, b.booking_reference AS "bookingReference", 'bus' AS type,
        b.status, b.created_at AS date, ROUND(b.amount_paise / 100.0, 2)::float AS amount,
        b.currency,
        CONCAT(COALESCE(bs.origin, 'Unknown'), ' to ', COALESCE(bs.destination, 'Unknown')) AS title,
        jsonb_build_object(
          'passengerCount', b.passenger_count,
          'busId', b.bus_id,
          'operator', bs.operator,
          'busType', bs.bus_type,
          'contact', b.contact,
          'couponCode', b.coupon_code,
          'discount', ROUND(b.discount_paise / 100.0, 2)::float
        ) AS details
      FROM bus_bookings b
      LEFT JOIN bus_services bs ON bs.id = b.bus_id
      WHERE b.user_id = $1
       ORDER BY date DESC
      LIMIT 50`,
      [request.user.id],
    )
    return response.json({ success: true, data: result.rows })
  } catch (error) {
    return next(error)
  }
}