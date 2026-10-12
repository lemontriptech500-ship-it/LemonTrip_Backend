-- READ-ONLY post-migration verification. Compare counts with the recorded
-- pre-migration counts; expected counts must not decrease (no rows are deleted).

SELECT current_database() AS database_name,
       current_schema() AS schema_name,
       current_setting('transaction_read_only') AS transaction_read_only,
       version() AS server_version;

SELECT 'blog_posts' AS table_name, count(*) AS row_count FROM blog_posts
UNION ALL SELECT 'visa_services', count(*) FROM visa_services
UNION ALL SELECT 'travel_packages', count(*) FROM travel_packages;

SELECT table_name, column_name, data_type, character_maximum_length,
       is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('blog_posts', 'visa_services', 'travel_packages')
ORDER BY table_name, ordinal_position;

SELECT c.relname AS table_name, con.conname AS constraint_name,
       pg_get_constraintdef(con.oid) AS definition, con.convalidated AS validated
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('blog_posts', 'visa_services', 'travel_packages')
ORDER BY c.relname, con.conname;

SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('blog_posts', 'visa_services', 'travel_packages')
ORDER BY tablename, indexname;

-- These should all return zero after the migration.
SELECT 'blog_status_invalid_or_null' AS check_name, count(*) AS violations
FROM blog_posts WHERE publication_status IS NULL OR publication_status NOT IN ('draft', 'published')
UNION ALL SELECT 'visa_required_nulls', count(*) FROM visa_services
 WHERE id IS NULL OR country IS NULL OR visa_type IS NULL
    OR processing_time IS NULL OR starting_from IS NULL OR documents IS NULL OR created_at IS NULL
UNION ALL SELECT 'package_invalid_category_or_price', count(*) FROM travel_packages
 WHERE category IS NULL OR category NOT IN ('national', 'international')
    OR price_amount IS NULL OR price_amount <= 0 OR created_at IS NULL;

-- Public blog query contract: no draft rows should be returned.
SELECT id, publication_status FROM blog_posts
WHERE publication_status = 'published'
ORDER BY published_at DESC, created_at DESC;

-- Verify the price default is absent so omitted prices fail clearly instead of
-- silently becoming zero; website admin SQL explicitly provides price_amount.
SELECT column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'travel_packages'
  AND column_name = 'price_amount';
