CREATE INDEX IF NOT EXISTS idx_blog_posts_published_at ON blog_posts (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_travel_packages_created_at ON travel_packages (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_travel_packages_category ON travel_packages (category);
CREATE INDEX IF NOT EXISTS idx_visa_services_country ON visa_services (country);
