import { pool } from '../config/db.js'
import { getHotelBedsHotel, isHotelBedsConfigured, searchHotelBeds } from '../services/hotelbedsService.js'

const hotelFields = `
  id, name,
  catalog->'location' AS location,
  star_rating::integer AS "starRating",
  guest_rating::double precision AS "guestRating",
  guest_review_count AS "guestReviewCount",
  description, property_type AS "propertyType",
  catalog->'images' AS images,
  catalog->'amenities' AS amenities,
  catalog->>'checkInTime' AS "checkInTime",
  catalog->>'checkOutTime' AS "checkOutTime",
  catalog->'rooms' AS rooms,
  currency, starting_price::double precision AS "startingPrice"
`

export async function search(request, response, next) {
  try {
    const { checkIn, checkOut, rooms, adults, children } = request.query
    if (isHotelBedsConfigured() && checkIn && checkOut) {
      return response.json({ success: true, data: await searchHotelBeds({ destination: request.query.destination, checkIn, checkOut, rooms, adults, children }) })
    }
    const values = []
    const filters = ['active = TRUE']
    const destination = String(request.query.destination || '').trim()

    if (destination) {
      values.push(`%${destination}%`)
      filters.push(`(name ILIKE $${values.length} OR city ILIKE $${values.length} OR area ILIKE $${values.length})`)
    }

    const result = await pool.query(`SELECT ${hotelFields} FROM hotels WHERE ${filters.join(' AND ')} ORDER BY guest_rating DESC, guest_review_count DESC`, values)
    const hotels = result.rows
    const prices = hotels.map((hotel) => Number(hotel.startingPrice))
    const propertyTypes = [...new Set(hotels.map((hotel) => hotel.propertyType))]
    const amenities = [...new Set(hotels.flatMap((hotel) => hotel.amenities || []))]
    return response.json({
      success: true,
      data: { hotels, total: hotels.length, filters: { propertyTypes, amenities, minPrice: Math.min(...prices, 0), maxPrice: Math.max(...prices, 0) } },
    })
  } catch (error) {
    return next(error)
  }
}

export async function getHotel(request, response, next) {
  try {
    if (request.params.hotelId.startsWith('hb-')) {
      const hotel = getHotelBedsHotel(request.params.hotelId)
      if (!hotel) return response.status(404).json({ success: false, error: { message: 'Hotel availability has expired. Search again.' } })
      return response.json({ success: true, data: hotel })
    }
    const result = await pool.query(`SELECT ${hotelFields} FROM hotels WHERE id = $1 AND active = TRUE LIMIT 1`, [request.params.hotelId])
    if (!result.rows[0]) return response.status(404).json({ success: false, error: { message: 'Hotel not found' } })
    return response.json({ success: true, data: result.rows[0] })
  } catch (error) {
    return next(error)
  }
}