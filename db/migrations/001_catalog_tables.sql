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

CREATE TABLE IF NOT EXISTS travel_packages (
  id VARCHAR(80) PRIMARY KEY,
  destination VARCHAR(160) NOT NULL,
  duration VARCHAR(80) NOT NULL,
  description TEXT NOT NULL,
  starting_price VARCHAR(80) NOT NULL,
  highlights TEXT[] NOT NULL DEFAULT '{}',
  image_fallback_color VARCHAR(120) NOT NULL,
  image_url TEXT,
  category VARCHAR(20) NOT NULL DEFAULT 'international' CHECK (category IN ('national', 'international')),
  price_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (price_amount > 0),
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The former schema.sql and seed script both used these columns; schema.sql
-- did not contain a visa_services definition. TEXT[] matches the seed's JS array.
CREATE TABLE IF NOT EXISTS visa_services (
  id VARCHAR(80) PRIMARY KEY,
  country VARCHAR(120) NOT NULL,
  visa_type VARCHAR(160) NOT NULL,
  processing_time VARCHAR(120) NOT NULL,
  starting_from VARCHAR(80) NOT NULL,
  image_url TEXT,
  documents TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
