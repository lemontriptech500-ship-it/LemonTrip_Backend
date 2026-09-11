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

INSERT INTO blog_posts (id, category, title, excerpt, content, image_fallback_color, image_url, published_at, read_time)
VALUES
  ('blog-1', 'Travel Tips', '10 Essential Items to Pack for a Beach Vacation', 'Don''t let a forgotten item ruin your sunny getaway. Here is our ultimate packing list for the perfect beach trip.', 'A thoughtful packing list keeps a beach holiday relaxed from the first morning to the last sunset. Pack light layers, sun protection, swimwear, comfortable footwear, a reusable water bottle, and a small dry bag for your essentials.', 'bg-[var(--color-primary-soft)]', 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=900&q=85', '2023-10-12', '5 min read'),
  ('blog-2', 'Destinations', 'Hidden Gems in Europe You Need to Visit', 'Skip the crowded tourist traps and explore these beautiful, lesser-known European destinations on your next trip.', 'Europe rewards travelers who leave room for detours. Look beyond the headline cities for quiet coastal towns, historic villages, and local food markets where a slower itinerary creates the best memories.', 'bg-[var(--color-secondary-soft)]', 'https://images.unsplash.com/photo-1500534623283-312aade485b7?w=900&q=85', '2023-11-05', '8 min read'),
  ('blog-3', 'Visa Guide', 'Navigating the Schengen Visa Process', 'A comprehensive, step-by-step guide to applying for a Schengen visa for your upcoming European adventure.', 'Start your Schengen application early and keep your documents consistent. Check the consulate requirements for your main destination, prepare proof of accommodation and travel insurance, and allow time for an appointment and processing.', 'bg-[var(--color-accent-soft)]', 'https://images.unsplash.com/photo-1526772662000-3f88f10405ff?w=900&q=85', '2024-01-20', '10 min read'),
  ('blog-4', 'Budget Travel', 'How to Travel India on ₹500 a Day', 'Smart budgeting tips for exploring India without breaking the bank. From street food to budget stays.', 'A flexible daily budget can take you a long way in India. Use local transport, choose regional food, book simple stays, and keep a small reserve for experiences that are worth the extra rupees.', 'bg-[var(--color-primary-soft)]', 'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=900&q=85', '2024-02-14', '7 min read'),
  ('blog-5', 'Travel Tips', 'Business Travel: Packing Light for Short Trips', 'Master the art of minimalist packing for business trips. Look sharp with just a carry-on bag.', 'The easiest business trip to manage is the one that fits in a carry-on. Build a small capsule wardrobe around versatile pieces, keep chargers together, and leave space for anything you may bring home.', 'bg-[var(--color-secondary-soft)]', 'https://images.unsplash.com/photo-1553877522-43269d4ea984?w=900&q=85', '2024-03-08', '4 min read'),
  ('blog-6', 'Destinations', 'Best Hill Stations to Visit in India This Summer', 'Escape the heat with these stunning hill stations across India. From Shimla to Munnar, plan your perfect getaway.', 'India''s hill stations offer very different landscapes and rhythms. Compare weather, travel time, and local activities before choosing between a quiet mountain retreat, a tea-growing region, or a lively heritage town.', 'bg-[var(--color-accent-soft)]', 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=900&q=85', '2024-04-22', '6 min read')
ON CONFLICT (id) DO NOTHING;
