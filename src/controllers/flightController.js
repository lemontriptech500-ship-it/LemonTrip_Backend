import { pool } from '../config/db.js'

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
    const result = await pool.query(`SELECT * FROM flights ${where} ORDER BY departure_time LIMIT 50`, values)
    return response.json({ success: true, data: { flights: result.rows, total: result.rowCount } })
  } catch (error) {
    return next(error)
  }
}

export async function getFlight(request, response, next) {
  try {
    const result = await pool.query('SELECT * FROM flights WHERE id = $1 LIMIT 1', [request.params.flightId])
    if (!result.rows[0]) return response.status(404).json({ success: false, error: { message: 'Flight not found' } })
    return response.json({ success: true, data: result.rows[0] })
  } catch (error) {
    return next(error)
  }
}
