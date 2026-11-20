CREATE TABLE IF NOT EXISTS cab_services (
  id VARCHAR(80) PRIMARY KEY,
  name VARCHAR(140) NOT NULL,
  city VARCHAR(120) NOT NULL,
  category VARCHAR(40) NOT NULL,
  passenger_capacity SMALLINT NOT NULL CHECK (passenger_capacity > 0),
  luggage_capacity SMALLINT NOT NULL DEFAULT 2 CHECK (luggage_capacity >= 0),
  transmission VARCHAR(30) NOT NULL DEFAULT 'Manual',
  fuel_type VARCHAR(30) NOT NULL DEFAULT 'Petrol',
  price_per_km NUMERIC(10, 2) NOT NULL CHECK (price_per_km >= 0),
  base_fare NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (base_fare >= 0),
  included_km INTEGER NOT NULL DEFAULT 0 CHECK (included_km >= 0),
  image_url TEXT,
  features TEXT[] NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cab_services_city_category
  ON cab_services (LOWER(city), LOWER(category)) WHERE active = TRUE;
