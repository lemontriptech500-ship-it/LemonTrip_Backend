import { pool } from '../config/db.js'

const cabFields = `
  id, name, city, category,
  passenger_capacity AS "passengerCapacity",
  luggage_capacity AS "luggageCapacity",
  transmission, fuel_type AS "fuelType",
  price_per_km AS "pricePerKm", base_fare AS "baseFare",
  included_km AS "includedKm", image_url AS "imageUrl", features
`

export async function search(request, response, next) {
  try {
    const values = []
    const filters = ['active = TRUE']
    const city = String(request.query.city || '').trim()
    const category = String(request.query.category || '').trim()

    if (city) {
      values.push(`%${city}%`)
      filters.push(`city ILIKE $${values.length}`)
    }
    if (category) {
      values.push(category)
      filters.push(`category ILIKE $${values.length}`)
    }

    const result = await pool.query(
      `SELECT ${cabFields}
       FROM cab_services
       WHERE ${filters.join(' AND ')}
       ORDER BY city, base_fare, name`,
      values,
    )

    return response.json({ success: true, data: { cabs: result.rows, total: result.rowCount } })
  } catch (error) {
    return next(error)
  }
}

export async function getCab(request, response, next) {
  try {
    const result = await pool.query(`SELECT ${cabFields} FROM cab_services WHERE id = $1 AND active = TRUE LIMIT 1`, [request.params.cabId])
    if (!result.rows[0]) return response.status(404).json({ success: false, error: { message: 'Cab not found' } })
    return response.json({ success: true, data: result.rows[0] })
  } catch (error) {
    return next(error)
  }
}
