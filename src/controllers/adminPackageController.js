import { pool } from '../config/db.js'

const packageFields = `
  id, destination, duration, description,
  starting_price AS "startingPrice",
  highlights,
  image_fallback_color AS "imageFallbackColor",
  image_url AS "imageUrl",
  category,
  price_amount AS "priceAmount",
  currency
`

function text(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function normalizePayload(body = {}) {
  const category = text(body.category, 20).toLowerCase()
  const priceAmount = Number(body.priceAmount)
  const highlights = Array.isArray(body.highlights)
    ? body.highlights.map((item) => text(item, 120)).filter(Boolean).slice(0, 12)
    : text(body.highlights, 1200).split('\n').map((item) => item.trim()).filter(Boolean).slice(0, 12)

  return {
    destination: text(body.destination, 160),
    duration: text(body.duration, 80),
    description: text(body.description, 5000),
    startingPrice: text(body.startingPrice, 80),
    highlights,
    imageFallbackColor: text(body.imageFallbackColor, 120) || 'bg-[var(--color-secondary-soft)]',
    imageUrl: text(body.imageUrl, 2000) || null,
    category,
    priceAmount,
    currency: text(body.currency, 3).toUpperCase() || 'INR',
  }
}

function validatePayload(payload) {
  if (!payload.destination || !payload.duration || !payload.description || !payload.startingPrice) return 'Destination, duration, description, and starting price are required.'
  if (!['national', 'international'].includes(payload.category)) return 'Category must be national or international.'
  if (!Number.isFinite(payload.priceAmount) || payload.priceAmount <= 0) return 'Price amount must be greater than zero.'
  if (!/^[A-Z]{3}$/.test(payload.currency)) return 'Currency must be a three-letter code.'
  if (!payload.highlights.length) return 'At least one highlight is required.'
  return null
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'package'
}

export async function listPackages(_request, response, next) {
  try {
    const result = await pool.query(`SELECT ${packageFields} FROM travel_packages ORDER BY created_at DESC`)
    return response.json({ success: true, data: result.rows, total: result.rowCount })
  } catch (error) {
    return next(error)
  }
}

export async function createPackage(request, response, next) {
  try {
    const payload = normalizePayload(request.body)
    const validationError = validatePayload(payload)
    if (validationError) return response.status(400).json({ success: false, error: { message: validationError } })

    const id = `pkg-${slug(payload.destination)}-${Date.now().toString(36)}`
    const result = await pool.query(`
      INSERT INTO travel_packages (id, destination, duration, description, starting_price, highlights, image_fallback_color, image_url, category, price_amount, currency)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING ${packageFields}
    `, [id, payload.destination, payload.duration, payload.description, payload.startingPrice, payload.highlights, payload.imageFallbackColor, payload.imageUrl, payload.category, payload.priceAmount, payload.currency])
    return response.status(201).json({ success: true, data: result.rows[0] })
  } catch (error) {
    return next(error)
  }
}

export async function updatePackage(request, response, next) {
  try {
    const payload = normalizePayload(request.body)
    const validationError = validatePayload(payload)
    if (validationError) return response.status(400).json({ success: false, error: { message: validationError } })

    const result = await pool.query(`
      UPDATE travel_packages
      SET destination = $1, duration = $2, description = $3, starting_price = $4,
          highlights = $5, image_fallback_color = $6, image_url = $7, category = $8,
          price_amount = $9, currency = $10
      WHERE id = $11
      RETURNING ${packageFields}
    `, [payload.destination, payload.duration, payload.description, payload.startingPrice, payload.highlights, payload.imageFallbackColor, payload.imageUrl, payload.category, payload.priceAmount, payload.currency, request.params.packageId])
    if (!result.rows[0]) return response.status(404).json({ success: false, error: { message: 'Travel package not found.' } })
    return response.json({ success: true, data: result.rows[0] })
  } catch (error) {
    return next(error)
  }
}

export async function deletePackage(request, response, next) {
  try {
    const result = await pool.query('DELETE FROM travel_packages WHERE id = $1 RETURNING id', [request.params.packageId])
    if (!result.rows[0]) return response.status(404).json({ success: false, error: { message: 'Travel package not found.' } })
    return response.json({ success: true, data: { id: result.rows[0].id } })
  } catch (error) {
    return next(error)
  }
}
