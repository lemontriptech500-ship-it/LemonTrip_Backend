import { pool } from '../config/db.js'

const busFields = `
  id, operator, origin AS "from", destination AS "to",
  TO_CHAR(departure_time, 'HH24:MI') AS departure,
  TO_CHAR(arrival_time, 'HH24:MI') AS arrival,
  duration_label AS duration, bus_type AS "busType",
  CONCAT('From ', currency, ' ', TO_CHAR(price, 'FM9999999990.##')) AS price,
  seats_left AS "seatsLeft", currency, metadata
`

export async function search(request, response, next) {
  try {
    const values = []
    const filters = ['active = TRUE']
    const from = String(request.query.from || '').trim()
    const to = String(request.query.to || '').trim()

    if (from) {
      values.push(`%${from}%`)
      filters.push(`origin ILIKE $${values.length}`)
    }
    if (to) {
      values.push(`%${to}%`)
      filters.push(`destination ILIKE $${values.length}`)
    }

    const result = await pool.query(`SELECT ${busFields} FROM bus_services WHERE ${filters.join(' AND ')} ORDER BY departure_time`, values)
    return response.json({ success: true, data: { buses: result.rows, total: result.rowCount } })
  } catch (error) {
    return next(error)
  }
}

export async function getBus(request, response, next) {
  try {
    const result = await pool.query(`SELECT ${busFields} FROM bus_services WHERE id = $1 AND active = TRUE LIMIT 1`, [request.params.busId])
    if (!result.rows[0]) return response.status(404).json({ success: false, error: { message: 'Bus service not found' } })
    return response.json({ success: true, data: result.rows[0] })
  } catch (error) {
    return next(error)
  }
}