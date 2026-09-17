import { pool } from '../config/db.js'

const packageFields = `
  id, destination, duration, description,
  starting_price AS "startingPrice",
  highlights,
  image_fallback_color AS "imageFallbackColor",
  image_url AS "imageUrl",
  category
`

export async function search(request, response, next) {
  try {
    const values = []
    const filters = []
    const destination = String(request.query.destination || '').trim()
    const category = String(request.query.category || '').trim().toLowerCase()

    if (destination) {
      values.push(`%${destination}%`)
      filters.push(`destination ILIKE $${values.length}`)
    }
    if (category && ['national', 'international'].includes(category)) {
      values.push(category)
      filters.push(`category = $${values.length}`)
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
    const result = await pool.query(`SELECT ${packageFields} FROM travel_packages ${where} ORDER BY created_at DESC`, values)
    return response.json({ success: true, data: { packages: result.rows, total: result.rowCount } })
  } catch (error) {
    return next(error)
  }
}

export async function getPackage(request, response, next) {
  try {
    const result = await pool.query(`SELECT ${packageFields} FROM travel_packages WHERE id = $1 LIMIT 1`, [request.params.packageId])
    if (!result.rows[0]) return response.status(404).json({ success: false, error: { message: 'Travel package not found' } })
    return response.json({ success: true, data: result.rows[0] })
  } catch (error) {
    return next(error)
  }
}