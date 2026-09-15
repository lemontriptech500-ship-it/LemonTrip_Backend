import { searchHotels } from '../services/hotelbedsService.js'

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