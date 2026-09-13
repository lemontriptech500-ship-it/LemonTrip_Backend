import { hotelBedsRequest } from './hotelbedsClient.js'
import { env } from '../config/env.js'

const hotelCache = new Map()
const destinationCache = new Map()

export function isHotelBedsConfigured() {
  return Boolean(env.hotelbedsApiKey && env.hotelbedsApiSecret)
}

function date(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? value : null
}

function nights(checkIn, checkOut) {
  return Math.max(1, Math.round((Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86400000))
}

async function resolveDestination(value) {
  const query = String(value || '').trim().toLowerCase()
  if (/^[a-z]{3}$/i.test(query)) return query.toUpperCase()
  if (destinationCache.has(query)) return destinationCache.get(query)
  const payload = await hotelBedsRequest('/locations/destinations?language=ENG&from=1&to=1000', { contentApi: true })
  const destinations = payload.destinations || payload.content?.destinations || []
  const match = destinations.find((item) => String(item.name || '').toLowerCase().includes(query) || String(item.code || '').toLowerCase() === query)
  const code = match?.code || null
  destinationCache.set(query, code)
  return code
}

function mapRate(rate, stayNights, hotelCode) {
  const total = Number(rate.net || rate.sellingRate || rate.hotelSellingRate || 0)
  return {
    id: rate.rateKey,
    name: `${rate.boardName || 'Room Only'}${rate.rateType ? ` · ${rate.rateType}` : ''}`,
    pricePerNight: total / stayNights,
    currency: rate.currency || rate.clientCurrency || 'EUR',
    mealPlan: rate.boardCode === 'BB' ? 'breakfast' : rate.boardCode === 'HB' ? 'half_board' : rate.boardCode === 'FB' ? 'full_board' : 'room_only',
    refundable: rate.rateClass !== 'NRF',
    cancellationPolicy: rate.cancellationPolicies?.length ? 'See Hotelbeds cancellation policy' : 'Non-refundable',
    benefits: rate.boardName ? [`${rate.boardName} board`] : [],
    availableQuantity: Number(rate.allotment || 1),
    hotelbeds: { hotelCode, roomCode: rate.roomCode, rateKey: rate.rateKey, paymentType: rate.paymentType || 'AT_HOTEL' },
  }
}

function mapHotel(hotel, stayNights) {
  const rooms = (hotel.rooms || []).map((room) => ({
    id: `hb-${hotel.code}-${room.code}`,
    name: room.name || 'Available room',
    type: 'standard',
    description: room.name || 'Live availability from Hotelbeds.',
    maxOccupancy: { maxAdults: Number(room.adults || 9), maxChildren: Number(room.children || 9), maxTotal: 9 },
    bedType: room.name || 'As assigned by hotel',
    amenities: [],
    images: [],
    rates: (room.rates || []).map((rate) => mapRate({ ...rate, roomCode: room.code }, stayNights, hotel.code)),
    availableQuantity: Number(room.rates?.[0]?.allotment || 1),
  })).filter((room) => room.rates.length)
  const rates = rooms.flatMap((room) => room.rates)
  return {
    id: `hb-${hotel.code}`,
    name: hotel.name || `Hotel ${hotel.code}`,
    location: { city: hotel.destinationName || '', area: hotel.zoneName || hotel.destinationName || '', address: hotel.address || hotel.destinationName || '' },
    starRating: Math.max(1, Math.min(5, Number.parseInt(hotel.categoryCode, 10) || 3)),
    guestRating: 0,
    guestReviewCount: 0,
    description: hotel.description || 'Live availability provided by Hotelbeds.',
    propertyType: 'hotel',
    images: (hotel.images || []).map((image) => ({ url: image.path || image.url, alt: hotel.name || 'Hotel' })),
    amenities: [],
    checkInTime: '15:00',
    checkOutTime: '12:00',
    rooms,
    currency: rates[0]?.currency || 'EUR',
    startingPrice: rates.length ? Math.min(...rates.map((rate) => rate.pricePerNight)) : 0,
    provider: 'hotelbeds',
    hotelbeds: { hotelCode: hotel.code, destinationCode: hotel.destinationCode || '', stayNights },
  }
}

export async function searchHotelBeds({ destination, checkIn, checkOut, rooms = 1, adults = 1, children = 0 }) {
  const destinationCode = await resolveDestination(destination)
  if (!destinationCode) return { hotels: [], total: 0, filters: { propertyTypes: [], amenities: [], minPrice: 0, maxPrice: 0 } }
  const stayNights = nights(checkIn, checkOut)
  const payload = await hotelBedsRequest('/hotels', {
    method: 'POST',
    body: {
      stay: { checkIn: date(checkIn), checkOut: date(checkOut) },
      occupancies: [{ rooms: Number(rooms), adults: Number(adults), children: Number(children) }],
      destination: { code: destinationCode },
      filter: {
        maxHotels: 50,
        maxRatesPerRoom: 8,
        ...(env.hotelbedsPaymentType ? { paymentType: env.hotelbedsPaymentType } : {}),
      },
      language: 'ENG',
    },
  })
  const availableHotels = payload.hotels?.hotels || []
  const codes = availableHotels.map((hotel) => hotel.code).filter(Boolean).join(',')
  let contentHotels = []
  if (codes) {
    try {
      const content = await hotelBedsRequest(`/hotels/${codes}?fields=all&language=ENG`, { contentApi: true })
      contentHotels = content.hotels || content.content?.hotels || []
    } catch {
      contentHotels = []
    }
  }
  const contentByCode = new Map(contentHotels.map((hotel) => [hotel.code, hotel]))
  const hotels = availableHotels.map((hotel) => mapHotel({ ...contentByCode.get(hotel.code), ...hotel, images: contentByCode.get(hotel.code)?.images || hotel.images }, stayNights)).filter((hotel) => hotel.rooms.length)
  hotels.forEach((hotel) => hotelCache.set(hotel.id, hotel))
  const prices = hotels.map((hotel) => hotel.startingPrice)
  return { hotels, total: hotels.length, filters: { propertyTypes: [...new Set(hotels.map((hotel) => hotel.propertyType))], amenities: [], minPrice: prices.length ? Math.min(...prices) : 0, maxPrice: prices.length ? Math.max(...prices) : 0 } }
}

export function getHotelBedsHotel(id) {
  return hotelCache.get(id) || null
}

export async function checkHotelBedsAvailability(hotel, details) {
  const selections = details.selections || []
  const rateKeys = selections.flatMap((selection) => {
    const rate = hotel.rooms.flatMap((room) => room.rates).find((candidate) => candidate.id === selection.rateId)
    return Array(Number(selection.quantity) || 0).fill(rate?.hotelbeds?.rateKey)
  })
  if (!rateKeys.length || rateKeys.some((key) => !key)) return null
  const result = await hotelBedsRequest('/checkrates', { method: 'POST', body: { rooms: rateKeys.map((rateKey) => ({ rateKey })) } })
  const available = result.hotels?.hotels?.[0]?.rooms?.flatMap((room) => room.rates || []) || []
  const byKey = new Map(available.map((rate) => [rate.rateKey, rate]))
  return rateKeys.every((key) => byKey.has(key)) ? { rateKeys, rates: rateKeys.map((key) => byKey.get(key)) } : null
}

export async function confirmHotelBedsBooking(booking) {
  const details = booking.details || {}
  const hotel = getHotelBedsHotel(details.itemId || `hb-${details.hotelCode}`) || details.providerSnapshot
  if (!hotel) throw Object.assign(new Error('Hotel availability has expired. Search again before paying.'), { status: 409 })
  const availability = await checkHotelBedsAvailability(hotel, details)
  if (!availability) throw Object.assign(new Error('The selected hotel room is no longer available.'), { status: 409 })
  const guest = details.guests?.[0] || {}
  const payload = await hotelBedsRequest('/bookings', {
    method: 'POST',
    body: {
      holder: { name: guest.firstName || 'LemonTrip', surname: guest.lastName || 'Guest' },
      rooms: availability.rateKeys.map((rateKey, index) => ({ rateKey, paxes: [{ roomId: index + 1, type: 'AD', name: guest.firstName || 'LemonTrip', surname: guest.lastName || 'Guest' }] })),
      clientReference: String(booking.booking_reference).slice(0, 20),
      remark: 'LemonTrip Hotelbeds test booking',
      language: 'ENG',
    },
  })
  return payload.booking || payload
}
