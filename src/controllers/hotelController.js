import { searchHotels } from '../services/hotelbedsService.js'
import { pool } from '../config/db.js'

export async function catalog(request, response, next) {
  try {
    const { rows } = await pool.query(`
      SELECT id, name, city, area, property_type AS "propertyType",
             star_rating AS "starRating", guest_rating AS "guestRating",
             guest_review_count AS "guestReviewCount", starting_price AS "startingPrice",
             currency, description, catalog
      FROM hotels WHERE active = TRUE ORDER BY guest_rating DESC, name LIMIT 100
    `)
    const hotels = rows.map((row) => ({
      ...row.catalog,
      id: row.id,
      name: row.name,
      location: { ...(row.catalog?.location || {}), city: row.city, area: row.area },
      propertyType: row.propertyType,
      starRating: Number(row.starRating),
      guestRating: Number(row.guestRating),
      guestReviewCount: Number(row.guestReviewCount),
      startingPrice: Number(row.startingPrice),
      currency: row.currency,
      description: row.description,
      images: row.catalog?.images || [],
      amenities: row.catalog?.amenities || [],
      rooms: row.catalog?.rooms || [],
      supplier: 'CATALOG',
    }))
    const prices = hotels.map((hotel) => hotel.startingPrice).filter((price) => price > 0)
    return response.json({ success: true, data: { hotels, total: hotels.length, filters: {
      propertyTypes: [...new Set(hotels.map((hotel) => hotel.propertyType))],
      amenities: [...new Set(hotels.flatMap((hotel) => hotel.amenities))],
      minPrice: prices.length ? Math.min(...prices) : 0,
      maxPrice: prices.length ? Math.max(...prices) : 0,
    } } })
  } catch (error) {
    return next(error)
  }
}

export async function search(request, response, next) {
  try {
    const { destination, checkIn, checkOut, rooms = 1, adults = 2, children = 0, childAges = '', nationality = 'IN', currency = 'INR' } = request.query
    if (!destination || !checkIn || !checkOut) return response.status(400).json({ success: false, error: { message: 'Destination, check-in, and check-out are required.' } })
    const data = await searchHotels({ destination, checkIn, checkOut, rooms, adults, children, childAges: String(childAges).split(',').filter(Boolean), nationality, currency })
    const hotels = data.hotels?.hotels || []
    const prices = hotels.map((hotel) => Number(hotel.startingPrice)).filter(Boolean)
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
    const { destination, checkIn, checkOut, rooms = 1, adults = 2, children = 0, childAges = '', nationality = 'IN', currency = 'INR' } = request.query
    if (!destination || !checkIn || !checkOut) return response.status(400).json({ success: false, error: { message: 'Destination, check-in, and check-out are required to load hotel rates.' } })
    const data = await searchHotels({ destination, hotelCode: request.params.hotelId, checkIn, checkOut, rooms, adults, children, childAges: String(childAges).split(',').filter(Boolean), nationality, currency })
    const hotel = (data.hotels?.hotels || []).find((item) => item.id === request.params.hotelId)
    if (!hotel) return response.status(404).json({ success: false, error: { message: 'Hotel not found or unavailable for these dates.' } })
    return response.json({ success: true, data: hotel })
  } catch (error) {
    return next(error)
  }
}
