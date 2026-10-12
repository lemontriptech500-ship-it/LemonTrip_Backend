-- Run in the same psql session as 00 and 01 to compare the temp snapshot.
-- PASS/FAIL rows below are the postflight result. No row contents are emitted.
WITH checks(name,ok) AS (VALUES
 ('blog_posts.publication_status exists', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='blog_posts' AND column_name='publication_status')),
 ('blog_posts statuses are non-NULL and allowed', NOT EXISTS(SELECT 1 FROM blog_posts WHERE publication_status IS NULL OR publication_status NOT IN ('draft','published'))),
 ('blog status check exists and validated', EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.blog_posts'::regclass AND contype='c' AND convalidated AND pg_get_expr(conbin,conrelid) ILIKE '%publication_status%')),
 ('visa required fields are NOT NULL', (SELECT count(*)=5 FROM information_schema.columns WHERE table_schema='public' AND table_name='visa_services' AND column_name IN ('id','country','visa_type','processing_time','starting_from') AND is_nullable='NO')),
 ('visa required fields reject blank values', (SELECT count(*)=5 FROM pg_constraint WHERE conrelid='public.visa_services'::regclass AND contype='c' AND convalidated AND conname IN ('visa_services_id_nonblank_check','visa_services_country_nonblank_check','visa_services_visa_type_nonblank_check','visa_services_processing_time_nonblank_check','visa_services_starting_from_nonblank_check'))),
 ('visa documents and created_at are NOT NULL', (SELECT count(*)=2 FROM information_schema.columns WHERE table_schema='public' AND table_name='visa_services' AND column_name IN ('documents','created_at') AND is_nullable='NO')),
 ('visa defaults are present', (SELECT count(*)=2 FROM information_schema.columns WHERE table_schema='public' AND table_name='visa_services' AND ((column_name='documents' AND column_default LIKE '%{}%') OR (column_name='created_at' AND column_default ILIKE '%now()%')))),
 ('visa processing and fee have no invented defaults', (SELECT count(*)=2 FROM information_schema.columns WHERE table_schema='public' AND table_name='visa_services' AND column_name IN ('processing_time','starting_from') AND column_default IS NULL)),
 ('visa has no invalid required values', NOT EXISTS(SELECT 1 FROM visa_services WHERE id IS NULL OR btrim(id::text)='' OR country IS NULL OR btrim(country::text)='' OR visa_type IS NULL OR btrim(visa_type::text)='' OR processing_time IS NULL OR btrim(processing_time::text)='' OR starting_from IS NULL OR btrim(starting_from::text)='' OR documents IS NULL OR created_at IS NULL)),
 ('package category constraint exists and validated', EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.travel_packages'::regclass AND contype='c' AND convalidated AND pg_get_constraintdef(oid) ILIKE '%category%' AND pg_get_constraintdef(oid) ILIKE '%national%' AND pg_get_constraintdef(oid) ILIKE '%international%')),
 ('exactly one positive price constraint exists', (SELECT count(*)=1 FROM pg_constraint WHERE conrelid='public.travel_packages'::regclass AND contype='c' AND convalidated AND replace(replace(regexp_replace(lower(pg_get_expr(conbin,conrelid)),'[[:space:]()"]','','g'),'::numeric',''),'::integer','') IN ('price_amount>0','0<price_amount'))),
 ('package price has no default', (SELECT column_default IS NULL FROM information_schema.columns WHERE table_schema='public' AND table_name='travel_packages' AND column_name='price_amount')),
 ('package created_at is NOT NULL with default', (SELECT is_nullable='NO' AND column_default ILIKE '%now()%' FROM information_schema.columns WHERE table_schema='public' AND table_name='travel_packages' AND column_name='created_at')),
 ('package currency is NOT NULL with INR default', (SELECT is_nullable='NO' AND column_default ILIKE '%INR%' FROM information_schema.columns WHERE table_schema='public' AND table_name='travel_packages' AND column_name='currency')),
 ('package currency rejects blank values', EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.travel_packages'::regclass AND conname='travel_packages_currency_nonblank_check' AND convalidated AND pg_get_constraintdef(oid) ILIKE '%btrim%currency%')),
 ('package rows valid', NOT EXISTS(SELECT 1 FROM travel_packages WHERE category IS NULL OR category NOT IN ('national','international') OR price_amount IS NULL OR price_amount<=0 OR created_at IS NULL OR currency IS NULL OR btrim(currency::text)=''))
)
SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result,name FROM checks ORDER BY name;

-- Verify index semantics; an equivalent differently named index is accepted.
WITH required(table_name,index_name,keys,descending,predicate) AS (VALUES
 ('blog_posts','idx_blog_posts_published_at',ARRAY['published_at'],ARRAY[true],NULL::text),
 ('blog_posts','idx_blog_posts_published_public',ARRAY['published_at','created_at'],ARRAY[true,true],'publication_status = ''published'''),
 ('visa_services','idx_visa_services_country',ARRAY['country'],ARRAY[false],NULL::text),
 ('travel_packages','idx_travel_packages_created_at',ARRAY['created_at'],ARRAY[true],NULL::text),
 ('travel_packages','idx_travel_packages_category',ARRAY['category'],ARRAY[false],NULL::text)
)
SELECT CASE WHEN pg_temp.catalog_index_matches(r.table_name,r.keys,r.descending,r.predicate) THEN 'PASS' ELSE 'FAIL' END result,
       r.table_name||'.'||r.index_name AS intended_index
FROM required r
ORDER BY r.table_name,r.index_name;

-- Counts and primary-key sets are compared with the baseline captured by 00.
SELECT CASE WHEN b.row_count=a.row_count AND b.primary_keys=a.primary_keys AND b.data_profile=a.data_profile THEN 'PASS' ELSE 'FAIL' END AS result,
       b.table_name,b.row_count AS before_rows,a.row_count AS after_rows,
       b.primary_keys=a.primary_keys AS primary_keys_preserved,
       b.data_profile=a.data_profile AS nulls_and_distributions_preserved
FROM pg_temp.catalog_reconciliation_before b
CROSS JOIN LATERAL (
 SELECT CASE b.table_name
   WHEN 'blog_posts' THEN (SELECT count(*) FROM blog_posts)
   WHEN 'visa_services' THEN (SELECT count(*) FROM visa_services)
   WHEN 'travel_packages' THEN (SELECT count(*) FROM travel_packages)
 END row_count,
 CASE b.table_name
   WHEN 'blog_posts' THEN (SELECT coalesce(jsonb_agg(to_jsonb(id) ORDER BY id),'[]'::jsonb) FROM blog_posts)
   WHEN 'visa_services' THEN (SELECT coalesce(jsonb_agg(to_jsonb(id) ORDER BY id),'[]'::jsonb) FROM visa_services)
   WHEN 'travel_packages' THEN (SELECT coalesce(jsonb_agg(to_jsonb(id) ORDER BY id),'[]'::jsonb) FROM travel_packages)
 END primary_keys,
 pg_temp.catalog_reconciliation_state(b.table_name) data_profile
) a ORDER BY b.table_name;

SELECT CASE WHEN count(*)=0 THEN 'PASS' ELSE 'FAIL' END AS result,
       'no invalid catalogue rows remain' AS name,
       count(*) AS invalid_rows
FROM (
 SELECT id FROM blog_posts WHERE publication_status IS NULL OR publication_status NOT IN ('draft','published')
 UNION ALL SELECT id FROM visa_services WHERE id IS NULL OR btrim(id::text)='' OR country IS NULL OR btrim(country::text)='' OR visa_type IS NULL OR btrim(visa_type::text)='' OR processing_time IS NULL OR btrim(processing_time::text)='' OR starting_from IS NULL OR btrim(starting_from::text)='' OR documents IS NULL OR created_at IS NULL
 UNION ALL SELECT id FROM travel_packages WHERE category IS NULL OR category NOT IN ('national','international') OR price_amount IS NULL OR price_amount<=0 OR created_at IS NULL OR currency IS NULL OR btrim(currency::text)=''
) bad;
