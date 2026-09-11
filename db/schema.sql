CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(30),
  password_hash TEXT,
  google_id VARCHAR(255) UNIQUE,
  avatar TEXT,
  provider VARCHAR(20) NOT NULL DEFAULT 'local' CHECK (provider IN ('local', 'google')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_google_id ON users (google_id);

-- Safe to re-run: adds Google auth columns if this schema.sql already ran
-- before without them (e.g. on an existing local/production database).
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider VARCHAR(20) NOT NULL DEFAULT 'local';

CREATE TABLE IF NOT EXISTS flights (
  id VARCHAR(80) PRIMARY KEY,
  origin VARCHAR(10) NOT NULL,
  destination VARCHAR(10) NOT NULL,
  departure_date DATE NOT NULL,
  departure_time TIMESTAMPTZ NOT NULL,
  arrival_time TIMESTAMPTZ NOT NULL,
  price NUMERIC(12, 2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'INR'
);

CREATE TABLE IF NOT EXISTS blog_posts (
  id VARCHAR(80) PRIMARY KEY,
  category VARCHAR(80) NOT NULL,
  title VARCHAR(255) NOT NULL,
  excerpt TEXT NOT NULL,
  content TEXT NOT NULL,
  image_fallback_color VARCHAR(120) NOT NULL,
  image_url TEXT,
  published_at DATE NOT NULL,
  read_time VARCHAR(40),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE flights
  ADD COLUMN IF NOT EXISTS airline           text,
  ADD COLUMN IF NOT EXISTS airline_code      text,
  ADD COLUMN IF NOT EXISTS flight_number     text,
  ADD COLUMN IF NOT EXISTS duration_minutes  integer,
  ADD COLUMN IF NOT EXISTS stops             integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stop_locations    text[],
  ADD COLUMN IF NOT EXISTS travel_class      text DEFAULT 'economy',
  ADD COLUMN IF NOT EXISTS refundable        boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS baggage_allowance text,
  ADD COLUMN IF NOT EXISTS segments          jsonb,
  ADD COLUMN IF NOT EXISTS fare_options      jsonb;
  

INSERT INTO blog_posts (id, category, title, excerpt, content, image_fallback_color, image_url, published_at, read_time)
VALUES
  ('blog-1', 'Travel Tips', '10 Essential Items to Pack for a Beach Vacation', 'Don''t let a forgotten item ruin your sunny getaway. Here is our ultimate packing list for the perfect beach trip.', 'A thoughtful packing list keeps a beach holiday relaxed from the first morning to the last sunset. Pack light layers, sun protection, swimwear, comfortable footwear, a reusable water bottle, and a small dry bag for your essentials.', 'bg-[var(--color-primary-soft)]', 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=900&q=85', '2023-10-12', '5 min read'),
  ('blog-2', 'Destinations', 'Hidden Gems in Europe You Need to Visit', 'Skip the crowded tourist traps and explore these beautiful, lesser-known European destinations on your next trip.', 'Europe rewards travelers who leave room for detours. Look beyond the headline cities for quiet coastal towns, historic villages, and local food markets where a slower itinerary creates the best memories.', 'bg-[var(--color-secondary-soft)]', 'https://images.unsplash.com/photo-1500534623283-312aade485b7?w=900&q=85', '2023-11-05', '8 min read'),
  ('blog-3', 'Visa Guide', 'Navigating the Schengen Visa Process', 'A comprehensive, step-by-step guide to applying for a Schengen visa for your upcoming European adventure.', 'Start your Schengen application early and keep your documents consistent. Check the consulate requirements for your main destination, prepare proof of accommodation and travel insurance, and allow time for an appointment and processing.', 'bg-[var(--color-accent-soft)]', 'https://images.unsplash.com/photo-1526772662000-3f88f10405ff?w=900&q=85', '2024-01-20', '10 min read'),
  ('blog-4', 'Budget Travel', 'How to Travel India on ₹500 a Day', 'Smart budgeting tips for exploring India without breaking the bank. From street food to budget stays.', 'A flexible daily budget can take you a long way in India. Use local transport, choose regional food, book simple stays, and keep a small reserve for experiences that are worth the extra rupees.', 'bg-[var(--color-primary-soft)]', 'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=900&q=85', '2024-02-14', '7 min read'),
  ('blog-5', 'Travel Tips', 'Business Travel: Packing Light for Short Trips', 'Master the art of minimalist packing for business trips. Look sharp with just a carry-on bag.', 'The easiest business trip to manage is the one that fits in a carry-on. Build a small capsule wardrobe around versatile pieces, keep chargers together, and leave space for anything you may bring home.', 'bg-[var(--color-secondary-soft)]', 'https://images.unsplash.com/photo-1553877522-43269d4ea984?w=900&q=85', '2024-03-08', '4 min read'),
  ('blog-6', 'Destinations', 'Best Hill Stations to Visit in India This Summer', 'Escape the heat with these stunning hill stations across India. From Shimla to Munnar, plan your perfect getaway.', 'India''s hill stations offer very different landscapes and rhythms. Compare weather, travel time, and local activities before choosing between a quiet mountain retreat, a tea-growing region, or a lively heritage town.', 'bg-[var(--color-accent-soft)]', 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=900&q=85', '2024-04-22', '6 min read')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS bus_services (
  id VARCHAR(80) PRIMARY KEY,
  operator VARCHAR(140) NOT NULL,
  origin VARCHAR(120) NOT NULL,
  destination VARCHAR(120) NOT NULL,
  departure_time TIME NOT NULL,
  arrival_time TIME NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  duration_label VARCHAR(40) NOT NULL,
  bus_type VARCHAR(100) NOT NULL,
  price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  seats_left INTEGER NOT NULL DEFAULT 0 CHECK (seats_left >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bus_services_route ON bus_services (LOWER(origin), LOWER(destination));
CREATE INDEX IF NOT EXISTS idx_bus_services_departure ON bus_services (departure_time);
CREATE INDEX IF NOT EXISTS idx_bus_services_metadata ON bus_services USING GIN (metadata);

INSERT INTO bus_services (id, operator, origin, destination, departure_time, arrival_time, duration_minutes, duration_label, bus_type, price, seats_left, metadata)
VALUES
  ('bus-1', 'LemonLine Express', 'Delhi', 'Jaipur', '06:30', '11:15', 285, '4h 45m', 'Volvo AC Sleeper', 899, 8, '{"amenities":["wifi","charging","blanket"],"boardingPoints":["Kashmere Gate ISBT"],"dropPoints":["Sindhi Camp"],"cancellation":"Free cancellation up to 6 hours before departure."}'::jsonb),
  ('bus-2', 'CityRide', 'Mumbai', 'Pune', '08:00', '11:30', 210, '3h 30m', 'AC Seater', 549, 14, '{"amenities":["wifi","charging"],"boardingPoints":["Dadar","Borivali"],"dropPoints":["Shivajinagar"],"cancellation":"Free cancellation up to 6 hours before departure."}'::jsonb),
  ('bus-3', 'Coastal Connect', 'Bengaluru', 'Goa', '21:15', '07:00', 585, '9h 45m', 'Premium Sleeper', 1299, 5, '{"amenities":["wifi","charging","blanket","water"],"boardingPoints":["Electronic City"],"dropPoints":["Panaji"],"cancellation":"Partial refund up to 12 hours before departure."}'::jsonb)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS travel_packages (
  id VARCHAR(80) PRIMARY KEY,
  destination VARCHAR(160) NOT NULL,
  duration VARCHAR(80) NOT NULL,
  description TEXT NOT NULL,
  starting_price VARCHAR(80) NOT NULL,
  highlights TEXT[] NOT NULL DEFAULT '{}',
  image_fallback_color VARCHAR(120) NOT NULL,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO travel_packages (id, destination, duration, description, starting_price, highlights, image_fallback_color, image_url)
VALUES
  ('pkg-1', 'Swiss Alps Explorer', '7 Days, 6 Nights', 'Experience the breathtaking beauty of the Swiss Alps with scenic train rides and cozy stays.', 'From $1,299 (Sample)', ARRAY['Scenic Train Rides', 'Mountain Tours', 'Breakfast Included'], 'bg-[var(--color-secondary-soft)]', 'https://images.unsplash.com/photo-1530789253388-582c481c54b0?w=1200&q=85'),
  ('pkg-2', 'Tropical Maldives', '5 Days, 4 Nights', 'Relax in overwater villas and enjoy the crystal-clear waters of the Indian Ocean.', 'From $899 (Sample)', ARRAY['Overwater Villa', 'Snorkeling', 'All-Inclusive'], 'bg-[var(--color-accent-soft)]', 'https://images.unsplash.com/photo-1514282401047-d79a71a590e8?w=1200&q=85'),
  ('pkg-3', 'Cultural Japan', '10 Days, 9 Nights', 'Discover the perfect blend of ancient traditions and modern technology in Japan.', 'From $1,899 (Sample)', ARRAY['Tokyo City Tour', 'Kyoto Temples', 'Bullet Train Pass'], 'bg-[var(--color-primary-soft)]', 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=1200&q=85')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS hotels (
  id VARCHAR(80) PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  city VARCHAR(100) NOT NULL,
  area VARCHAR(120) NOT NULL,
  property_type VARCHAR(30) NOT NULL,
  star_rating SMALLINT NOT NULL CHECK (star_rating BETWEEN 1 AND 5),
  guest_rating NUMERIC(2, 1) NOT NULL DEFAULT 0,
  guest_review_count INTEGER NOT NULL DEFAULT 0,
  starting_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  description TEXT NOT NULL,
  catalog JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hotels_city ON hotels (LOWER(city));
CREATE INDEX IF NOT EXISTS idx_hotels_property_type ON hotels (property_type);
CREATE INDEX IF NOT EXISTS idx_hotels_starting_price ON hotels (starting_price);
CREATE INDEX IF NOT EXISTS idx_hotels_catalog ON hotels USING GIN (catalog);

INSERT INTO hotels (id, name, city, area, property_type, star_rating, guest_rating, guest_review_count, starting_price, description, catalog)
VALUES
  ('h1', 'The Grand Imperial', 'Delhi', 'Connaught Place', 'hotel', 5, 4.6, 2340, 8500,
   'A landmark heritage property in the heart of New Delhi, blending colonial grandeur with contemporary luxury. Elegant rooms, award-winning dining, and a rooftop pool overlooking the city skyline.',
   $$ {
     "location": {"city":"Delhi","area":"Connaught Place","address":"12 Barakhamba Road, Connaught Place","landmark":"Near Rajiv Chowk Metro"},
     "images": [{"url":"https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800","alt":"Hotel exterior at dusk","category":"exterior"},{"url":"https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800","alt":"Luxury suite bedroom","category":"room"}],
     "amenities": ["wifi","pool","gym","spa","restaurant","bar","parking","room_service","laundry","business_center","ac"],
     "checkInTime":"14:00","checkOutTime":"12:00",
     "rooms": [{"id":"h1-r1","name":"Superior Room","type":"standard","description":"Well-appointed room with city views, marble bathroom, and premium bedding.","maxOccupancy":{"maxAdults":2,"maxChildren":1,"maxTotal":3},"bedType":"1 King Bed","amenities":["minibar","safe","work desk","rain shower"],"images":[],"availableQuantity":5,"rates":[{"id":"h1-r1-ro","name":"Room Only","pricePerNight":8500,"currency":"INR","mealPlan":"room_only","refundable":false,"cancellationPolicy":"Non-refundable. No cancellation allowed.","benefits":[]},{"id":"h1-r1-bb","name":"Bed & Breakfast","pricePerNight":9100,"currency":"INR","mealPlan":"breakfast","refundable":true,"cancellationPolicy":"Free cancellation up to 24 hours before check-in.","benefits":["Buffet breakfast included"]}]},
              {"id":"h1-r2","name":"Deluxe Room","type":"deluxe","description":"Spacious room with panoramic views, walk-in closet, and a sitting area.","maxOccupancy":{"maxAdults":2,"maxChildren":2,"maxTotal":4},"bedType":"1 King Bed or 2 Twin Beds","amenities":["minibar","safe","work desk","bathtub","balcony"],"images":[],"availableQuantity":5,"rates":[{"id":"h1-r2-bb","name":"Bed & Breakfast","pricePerNight":11200,"currency":"INR","mealPlan":"breakfast","refundable":true,"cancellationPolicy":"Free cancellation up to 24 hours before check-in.","benefits":["Buffet breakfast included"]}]}]
   } $$::jsonb),
  ('h2', 'Seaside Breeze Resort', 'Goa', 'Calangute', 'resort', 4, 4.3, 1870, 5200,
   'A vibrant beachfront resort with tropical gardens, multiple pools, and direct access to Calangute beach. Perfect for families and couples seeking a sun-soaked getaway.',
   $$ {
     "location": {"city":"Goa","area":"Calangute","address":"Beach Road, Calangute","landmark":"Direct beach access"},
     "images": [{"url":"https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800","alt":"Resort pool with ocean view","category":"pool"},{"url":"https://images.unsplash.com/photo-1590490360182-c33d955bc27d?w=800","alt":"Beach facing room","category":"room"}],
     "amenities": ["wifi","pool","gym","spa","restaurant","bar","parking","room_service","ac","breakfast"],
     "checkInTime":"15:00","checkOutTime":"11:00",
     "rooms": [{"id":"h2-r1","name":"Garden View Room","type":"standard","description":"Comfortable room overlooking the tropical gardens with modern amenities.","maxOccupancy":{"maxAdults":2,"maxChildren":1,"maxTotal":3},"bedType":"1 Queen Bed","amenities":["minibar","safe","garden view"],"images":[],"availableQuantity":5,"rates":[{"id":"h2-r1-ro","name":"Room Only","pricePerNight":5200,"currency":"INR","mealPlan":"room_only","refundable":false,"cancellationPolicy":"Non-refundable. No cancellation allowed.","benefits":[]},{"id":"h2-r1-bb","name":"Bed & Breakfast","pricePerNight":5800,"currency":"INR","mealPlan":"breakfast","refundable":true,"cancellationPolicy":"Free cancellation up to 24 hours before check-in.","benefits":["Buffet breakfast included"]}]},
              {"id":"h2-r2","name":"Sea View Deluxe","type":"deluxe","description":"Bright room with a private balcony facing the Arabian Sea.","maxOccupancy":{"maxAdults":2,"maxChildren":2,"maxTotal":4},"bedType":"1 King Bed","amenities":["minibar","balcony","sea view","safe"],"images":[],"availableQuantity":5,"rates":[{"id":"h2-r2-bb","name":"Bed & Breakfast","pricePerNight":7800,"currency":"INR","mealPlan":"breakfast","refundable":true,"cancellationPolicy":"Free cancellation up to 24 hours before check-in.","benefits":["Buffet breakfast included"]}]}]
   } $$::jsonb),
  ('h3', 'Mountain Trail Lodge', 'Manali', 'Old Manali', 'boutique', 3, 4.1, 920, 2800,
   'A cozy mountain lodge surrounded by pine forests, offering stunning valley views, a crackling fireplace lounge, and easy access to hiking trails and adventure activities.',
   $$ {
     "location": {"city":"Manali","area":"Old Manali","address":"Hadimba Road, Old Manali","landmark":"Near Hadimba Temple"},
     "images": [{"url":"https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800","alt":"Lodge exterior in the mountains","category":"exterior"},{"url":"https://images.unsplash.com/photo-1596394516093-501ba68a0ba6?w=800","alt":"Cozy room with mountain view","category":"room"}],
     "amenities": ["wifi","restaurant","parking","room_service","laundry"],
     "checkInTime":"13:00","checkOutTime":"11:00",
     "rooms": [{"id":"h3-r1","name":"Valley View Room","type":"standard","description":"Simple, warm room with a window overlooking the Kullu valley.","maxOccupancy":{"maxAdults":2,"maxChildren":1,"maxTotal":3},"bedType":"1 Double Bed","amenities":["heater","hot water","valley view"],"images":[],"availableQuantity":5,"rates":[{"id":"h3-r1-ro","name":"Room Only","pricePerNight":2800,"currency":"INR","mealPlan":"room_only","refundable":false,"cancellationPolicy":"Non-refundable. No cancellation allowed.","benefits":[]},{"id":"h3-r1-bb","name":"Bed & Breakfast","pricePerNight":3400,"currency":"INR","mealPlan":"breakfast","refundable":true,"cancellationPolicy":"Free cancellation up to 24 hours before check-in.","benefits":["Breakfast included"]}]},
              {"id":"h3-r2","name":"Pine Deluxe Room","type":"deluxe","description":"Larger room with wooden interiors, a writing desk, and forest views.","maxOccupancy":{"maxAdults":2,"maxChildren":2,"maxTotal":4},"bedType":"1 King Bed","amenities":["heater","hot water","forest view","work desk","sitting area"],"images":[],"availableQuantity":5,"rates":[{"id":"h3-r2-bb","name":"Bed & Breakfast","pricePerNight":4200,"currency":"INR","mealPlan":"breakfast","refundable":true,"cancellationPolicy":"Free cancellation up to 24 hours before check-in.","benefits":["Breakfast included"]}]}]
   } $$::jsonb)
ON CONFLICT (id) DO NOTHING;
