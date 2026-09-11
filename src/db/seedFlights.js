import { pool } from '../config/db.js'

const createDate = (daysAhead, hours, minutes) => {
  const d = new Date()
  d.setDate(d.getDate() + daysAhead)
  d.setHours(hours, minutes, 0, 0)
  return d
}

const generateFares = (basePrice, cabinClass) => [
  {
    id: 'saver', name: 'Saver', price: basePrice, currency: 'INR',
    cabinClass, refundable: false, baggageAllowance: '15kg Check-in, 7kg Cabin',
    cancellationPolicy: 'Non-refundable. Cancellation fee applies.',
    changePolicy: 'Change fee applies. Fare difference applicable.',
    benefits: ['Standard seat', 'Web check-in required'],
  },
  {
    id: 'flex', name: 'Flex', price: basePrice + 1200, currency: 'INR',
    cabinClass, refundable: true, baggageAllowance: '15kg Check-in, 7kg Cabin',
    cancellationPolicy: 'Refundable with nominal cancellation fee.',
    changePolicy: 'No change fee. Fare difference applicable.',
    benefits: ['Free seat selection', 'Complimentary meal', 'Priority boarding'],
  },
  {
    id: 'premium', name: 'Premium', price: basePrice + 3500, currency: 'INR',
    cabinClass, refundable: true, baggageAllowance: '25kg Check-in, 10kg Cabin',
    cancellationPolicy: 'Fully refundable.',
    changePolicy: 'Free date change.',
    benefits: ['Premium seating', 'Hot meal included', 'Extra baggage', 'Lounge access where available'],
  },
]

const raw = [
  { id: 'f1', airline: 'IndiGo', airlineCode: '6E', flightNumber: '6E-201', origin: 'DEL', destination: 'BOM', dep: [1, 6, 30], arr: [1, 8, 45], duration: 135, stops: 0, price: 4500, travelClass: 'economy', refundable: false, baggage: '15kg Check-in, 7kg Cabin' },
  { id: 'f2', airline: 'Air India', airlineCode: 'AI', flightNumber: 'AI-101', origin: 'DEL', destination: 'BOM', dep: [1, 7, 0], arr: [1, 9, 15], duration: 135, stops: 0, price: 5200, travelClass: 'economy', refundable: true, baggage: '20kg Check-in, 7kg Cabin' },
  { id: 'f3', airline: 'Vistara', airlineCode: 'UK', flightNumber: 'UK-994', origin: 'DEL', destination: 'BOM', dep: [1, 10, 0], arr: [1, 12, 10], duration: 130, stops: 0, price: 6100, travelClass: 'economy', refundable: true, baggage: '15kg Check-in, 7kg Cabin' },
  { id: 'f4', airline: 'SpiceJet', airlineCode: 'SG', flightNumber: 'SG-819', origin: 'DEL', destination: 'BOM', dep: [1, 15, 45], arr: [1, 19, 30], duration: 225, stops: 1, stopLocations: ['AMD'], price: 3800, travelClass: 'economy', refundable: false, baggage: '15kg Check-in, 7kg Cabin' },
  { id: 'f5', airline: 'Vistara', airlineCode: 'UK', flightNumber: 'UK-899', origin: 'DEL', destination: 'BOM', dep: [1, 18, 30], arr: [1, 20, 45], duration: 135, stops: 0, price: 12500, travelClass: 'business', refundable: true, baggage: '30kg Check-in, 12kg Cabin' },
  { id: 'f6', airline: 'Air India', airlineCode: 'AI', flightNumber: 'AI-404', origin: 'DEL', destination: 'BOM', dep: [1, 22, 15], arr: [2, 0, 30], duration: 135, stops: 0, price: 4900, travelClass: 'economy', refundable: false, baggage: '20kg Check-in, 7kg Cabin' },
  { id: 'f7', airline: 'Akasa Air', airlineCode: 'QP', flightNumber: 'QP-1120', origin: 'DEL', destination: 'BOM', dep: [1, 9, 30], arr: [1, 11, 40], duration: 130, stops: 0, price: 4200, travelClass: 'economy', refundable: true, baggage: '15kg Check-in, 7kg Cabin' },
  { id: 'f8', airline: 'IndiGo', airlineCode: '6E', flightNumber: '6E-455', origin: 'DEL', destination: 'BOM', dep: [1, 13, 10], arr: [1, 18, 50], duration: 340, stops: 1, stopLocations: ['JAI'], price: 4100, travelClass: 'economy', refundable: false, baggage: '15kg Check-in, 7kg Cabin' },
  { id: 'f9', airline: 'Air India', airlineCode: 'AI', flightNumber: 'AI-888', origin: 'DEL', destination: 'BOM', dep: [1, 5, 0], arr: [1, 7, 10], duration: 130, stops: 0, price: 5500, travelClass: 'economy', refundable: true, baggage: '20kg Check-in, 7kg Cabin' },
  { id: 'f10', airline: 'Vistara', airlineCode: 'UK', flightNumber: 'UK-902', origin: 'DEL', destination: 'BOM', dep: [1, 8, 30], arr: [1, 10, 45], duration: 135, stops: 0, price: 6800, travelClass: 'economy', refundable: true, baggage: '15kg Check-in, 7kg Cabin' },
  { id: 'f11', airline: 'IndiGo', airlineCode: '6E', flightNumber: '6E-771', origin: 'DEL', destination: 'BOM', dep: [1, 20, 0], arr: [1, 23, 45], duration: 225, stops: 1, stopLocations: ['GOI'], price: 3900, travelClass: 'economy', refundable: false, baggage: '15kg Check-in, 7kg Cabin' },
  { id: 'f12', airline: 'Air India Express', airlineCode: 'IX', flightNumber: 'IX-221', origin: 'DEL', destination: 'BOM', dep: [1, 14, 20], arr: [1, 16, 40], duration: 140, stops: 0, price: 4300, travelClass: 'economy', refundable: false, baggage: '15kg Check-in, 7kg Cabin' },
]

async function seed() {
  for (const f of raw) {
    const departureTime = createDate(...f.dep)
    const arrivalTime = createDate(...f.arr)
    const departureDate = departureTime.toISOString().slice(0, 10)

    const segments = f.segments || [{
      origin: f.origin,
      destination: f.destination,
      departureTime: departureTime.toISOString(),
      arrivalTime: arrivalTime.toISOString(),
      durationMinutes: f.duration,
      flightNumber: f.flightNumber,
      airline: f.airline,
      airlineCode: f.airlineCode,
    }]

    const fareOptions = generateFares(f.price, f.travelClass)

    await pool.query(
      `INSERT INTO flights (
        id, origin, destination, departure_date, departure_time, arrival_time,
        price, currency, airline, airline_code, flight_number, duration_minutes,
        stops, stop_locations, travel_class, refundable, baggage_allowance,
        segments, fare_options
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      ON CONFLICT (id) DO UPDATE SET
        departure_time = EXCLUDED.departure_time,
        arrival_time = EXCLUDED.arrival_time,
        departure_date = EXCLUDED.departure_date`,
      [
        f.id, f.origin, f.destination, departureDate, departureTime.toISOString(), arrivalTime.toISOString(),
        f.price, 'INR', f.airline, f.airlineCode, f.flightNumber, f.duration,
        f.stops, f.stopLocations || null, f.travelClass, f.refundable, f.baggage,
        JSON.stringify(segments), JSON.stringify(fareOptions),
      ],
    )
  }
  console.log(`Seeded ${raw.length} flights`)
  await pool.end()
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})