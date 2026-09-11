import { pool } from '../config/db.js'

const flightFields = `
  id, origin, destination, price, currency,
  airline, airline_code AS "airlineCode",
  flight_number AS "flightNumber",
  duration_minutes AS "durationMinutes",
  stops,
  stop_locations AS "stopLocations",
  travel_class AS "travelClass",
  refundable,
  baggage_allowance AS "baggageAllowance",
  departure_time AS "departureTime",
  arrival_time AS "arrivalTime",
  segments,
  fare_options AS "fareOptions"
`

export async function search(request, response, next) {
  try {
    const { origin, destination, departureDate } = request.query
    const filters = []
    const values = []

    if (origin) {
      values.push(origin)
      filters.push(`origin = $${values.length}`)
    }
    if (destination) {
      values.push(destination)
      filters.push(`destination = $${values.length}`)
    }
    if (departureDate) {
      values.push(departureDate)
      filters.push(`departure_date = $${values.length}`)
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''

    const result = await pool.query(
      `SELECT ${flightFields} FROM flights ${where} ORDER BY departure_time LIMIT 50`,
      values,
    )

    const airlines = [...new Set(result.rows.map((f) => f.airline))]
    const prices = result.rows.map((f) => Number(f.price))

    return response.json({
      success: true,
      data: {
        flights: result.rows,
        total: result.rowCount,
        filters: {
          airlines,
          minPrice: prices.length ? Math.min(...prices) : 0,
          maxPrice: prices.length ? Math.max(...prices) : 0,
        },
      },
    })
  } catch (error) {
    return next(error)
  }
}

export async function getFlight(request, response, next) {
  try {
    const result = await pool.query(
      `SELECT ${flightFields} FROM flights WHERE id = $1 LIMIT 1`,
      [request.params.flightId],
    )
    if (!result.rows[0]) return response.status(404).json({ success: false, error: { message: 'Flight not found' } })
    return response.json({ success: true, data: result.rows[0] })
  } catch (error) {
    return next(error)
  }
}