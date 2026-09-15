import { pool } from '../config/db.js'

const services = [
  { id: 'visa-1', country: 'United Kingdom', visaType: 'Standard Visitor Visa', processingTime: '15 to 30 working days', startingFrom: 'From INR 4,999', imageUrl: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=900&q=85', documents: ['Passport', 'Bank Statement', 'Travel Itinerary', 'Hotel Booking'] },
  { id: 'visa-2', country: 'France', visaType: 'Schengen Tourist Visa', processingTime: '15 working days', startingFrom: 'From INR 3,499', imageUrl: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=900&q=85', documents: ['Passport', 'Travel Insurance', 'Flight Booking', 'Bank Statement'] },
  { id: 'visa-3', country: 'Australia', visaType: 'Visitor Visa (Subclass 600)', processingTime: '20 to 35 working days', startingFrom: 'From INR 5,499', imageUrl: 'https://images.unsplash.com/photo-1523482580672-f109ba8cb9be?w=900&q=85', documents: ['Passport', 'Bank Statement', 'Employment Letter', 'Travel Plan'] },
  { id: 'visa-4', country: 'United States', visaType: 'B1/B2 Tourist Visa', processingTime: '3 to 6 weeks', startingFrom: 'From INR 14,999', imageUrl: 'https://images.unsplash.com/photo-1485738422979-f5c462d49f04?w=900&q=85', documents: ['Passport', 'DS-160 Confirmation', 'Photo', 'Bank Statement'] },
  { id: 'visa-5', country: 'Singapore', visaType: 'Tourist Visa', processingTime: '5 to 7 working days', startingFrom: 'From INR 2,499', imageUrl: 'https://images.unsplash.com/photo-1525625293386-3f8f99389edd?w=900&q=85', documents: ['Passport', 'Photo', 'Bank Statement', 'Flight Booking'] },
  { id: 'visa-6', country: 'Thailand', visaType: 'Tourist Visa on Arrival', processingTime: '1 to 2 working days', startingFrom: 'From INR 1,999', imageUrl: 'https://images.unsplash.com/photo-1528181304800-259b08848526?w=900&q=85', documents: ['Passport', 'Photo', 'Return Ticket', 'Hotel Booking'] },
]

async function seed() {
  for (const s of services) {
    await pool.query(
      `INSERT INTO visa_services (id, country, visa_type, processing_time, starting_from, image_url, documents)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET starting_from = EXCLUDED.starting_from`,
      [s.id, s.country, s.visaType, s.processingTime, s.startingFrom, s.imageUrl, s.documents],
    )
  }
  console.log(`Seeded ${services.length} visa services`)
  await pool.end()
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})