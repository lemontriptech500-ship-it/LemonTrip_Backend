import { pool } from '../config/db.js'

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

    if (from) {
      values.push(`%${from}%`)
      filters.push(`origin ILIKE $${values.length}`)
    }
    if (to) {
      values.push(`%${to}%`)
      filters.push(`destination ILIKE $${values.length}`)
    }

    const result = await pool.query(`SELECT ${trainFields} FROM train_services WHERE ${filters.join(' AND ')} ORDER BY departure_time`, values)
    return response.json({ success: true, data: { trains: result.rows, total: result.rowCount } })
  } catch (error) {
    return next(error)
  }
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
