-- READ-ONLY pre-migration review. Run against the intended staging database
-- first, then production only after environment identity is independently
-- confirmed. This script does not expose customer data and performs no writes.

SELECT current_database() AS database_name,
       current_schema() AS schema_name,
       current_setting('transaction_read_only') AS transaction_read_only,
       version() AS server_version;

SELECT table_name, column_name, data_type, character_maximum_length,
       is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('blog_posts', 'visa_services', 'travel_packages')
ORDER BY table_name, ordinal_position;

SELECT c.relname AS table_name, con.conname AS constraint_name,
       con.contype AS constraint_type, pg_get_constraintdef(con.oid) AS definition,
       con.convalidated AS validated
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

-- Record these aggregate counts and compare them after migration.
SELECT 'blog_posts' AS table_name, count(*) AS row_count FROM blog_posts
UNION ALL SELECT 'visa_services', count(*) FROM visa_services
UNION ALL SELECT 'travel_packages', count(*) FROM travel_packages;

-- Review current visibility before the legacy rows receive publication_status.
-- The migration preserves pre-migration public behavior by marking these rows
-- published. Have the content owner confirm this list contains no intended drafts.
SELECT id, title, category, published_at
FROM blog_posts
ORDER BY published_at DESC, id;

-- Resolve these rows with owner-approved values before migration; the migration
-- deliberately aborts rather than inventing required visa descriptions/prices.
SELECT id, country, visa_type,
       (processing_time IS NULL) AS missing_processing_time,
       (starting_from IS NULL) AS missing_starting_from,
       (documents IS NULL) AS documents_will_become_empty_array
FROM visa_services
WHERE processing_time IS NULL OR starting_from IS NULL OR documents IS NULL
   OR length(id) > 80 OR length(country) > 120 OR length(visa_type) > 160
   OR (processing_time IS NOT NULL AND length(processing_time) > 120)
   OR (starting_from IS NOT NULL AND length(starting_from) > 80)
ORDER BY id;

-- Rows violating proposed package checks require owner-approved correction.
SELECT id, category, price_amount
FROM travel_packages
WHERE category IS NULL OR category NOT IN ('national', 'international')
   OR price_amount IS NULL OR price_amount <= 0
ORDER BY id;

-- The shared schema_migrations table is inspected only; do not edit or merge it.
SELECT to_regclass('public.schema_migrations') AS legacy_ledger,
       to_regclass('public.lemontrip_website_schema_migrations') AS website_ledger,
       to_regclass('public.lemontrip_mobile_schema_migrations') AS mobile_ledger;
