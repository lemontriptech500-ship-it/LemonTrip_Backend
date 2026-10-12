-- Read-only catalogue inspection plus TEMP-session preservation snapshot.
-- Run with psql -v ON_ERROR_STOP=1 and keep this same psql session open for
-- 01 and 02 so the temporary before-snapshot remains available to postflight.
SELECT current_database() AS database_name,
       current_setting('server_version') AS server_version,
       current_setting('transaction_read_only') AS transaction_read_only;

WITH required(table_name) AS (VALUES ('blog_posts'),('visa_services'),('travel_packages'))
SELECT CASE WHEN to_regclass('public.'||table_name) IS NULL THEN 'FAIL' ELSE 'PASS' END AS result,
       table_name || ' table exists' AS prerequisite
FROM required ORDER BY table_name;

DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM (VALUES ('blog_posts'),('visa_services'),('travel_packages')) t(n)
   WHERE to_regclass('public.'||t.n) IS NULL) THEN
   RAISE EXCEPTION 'Preflight FAIL: one or more required catalogue tables are missing';
 END IF;
END $$;

WITH required(table_name,column_name,compatible_types) AS (VALUES
 ('blog_posts','id','character varying,text'),('blog_posts','published_at','date,timestamp without time zone'),('blog_posts','created_at','timestamp with time zone,timestamp without time zone'),
 ('visa_services','id','character varying,text'),('visa_services','country','character varying,text'),('visa_services','visa_type','character varying,text'),
 ('visa_services','processing_time','character varying,text'),('visa_services','starting_from','character varying,text'),('visa_services','documents','ARRAY'),('visa_services','created_at','timestamp with time zone,timestamp without time zone'),
 ('travel_packages','id','character varying,text'),('travel_packages','category','character varying,text'),('travel_packages','price_amount','numeric'),('travel_packages','currency','character'),('travel_packages','created_at','timestamp with time zone,timestamp without time zone')
), actual AS (
 SELECT r.*, c.data_type, c.udt_name FROM required r LEFT JOIN information_schema.columns c
   ON c.table_schema='public' AND c.table_name=r.table_name AND c.column_name=r.column_name
)
SELECT CASE WHEN data_type IS NULL OR position(data_type in compatible_types)=0 THEN 'FAIL' ELSE 'PASS' END AS result,
       table_name||'.'||column_name||' type='||coalesce(data_type,'MISSING')||' udt='||coalesce(udt_name,'MISSING') AS prerequisite
FROM actual ORDER BY table_name,column_name;

DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM (VALUES
   ('blog_posts','id','character varying,text'),('blog_posts','published_at','date,timestamp without time zone'),('blog_posts','created_at','timestamp with time zone,timestamp without time zone'),
   ('visa_services','id','character varying,text'),('visa_services','country','character varying,text'),('visa_services','visa_type','character varying,text'),('visa_services','processing_time','character varying,text'),('visa_services','starting_from','character varying,text'),('visa_services','documents','ARRAY'),('visa_services','created_at','timestamp with time zone,timestamp without time zone'),
   ('travel_packages','id','character varying,text'),('travel_packages','category','character varying,text'),('travel_packages','price_amount','numeric'),('travel_packages','currency','character'),('travel_packages','created_at','timestamp with time zone,timestamp without time zone')
 ) r(t,c,types) JOIN information_schema.columns x ON x.table_schema='public' AND x.table_name=r.t AND x.column_name=r.c
   WHERE position(x.data_type in r.types)=0) THEN
   RAISE EXCEPTION 'Preflight FAIL: incompatible source column types';
 END IF;
 IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='visa_services' AND column_name='documents' AND udt_name<>'_text') THEN
   RAISE EXCEPTION 'Preflight FAIL: visa_services.documents must be text[]';
 END IF;
 IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='travel_packages' AND column_name='currency' AND character_maximum_length<>3) THEN
   RAISE EXCEPTION 'Preflight FAIL: travel_packages.currency must be CHAR(3)';
 END IF;
END $$;

DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM (VALUES
   ('blog_posts','id'),('blog_posts','published_at'),('blog_posts','created_at'),
   ('visa_services','id'),('visa_services','country'),('visa_services','visa_type'),('visa_services','processing_time'),('visa_services','starting_from'),('visa_services','documents'),('visa_services','created_at'),
   ('travel_packages','id'),('travel_packages','category'),('travel_packages','price_amount'),('travel_packages','currency'),('travel_packages','created_at')
 ) r(t,c) WHERE NOT EXISTS
   (SELECT 1 FROM information_schema.columns x WHERE x.table_schema='public' AND x.table_name=r.t AND x.column_name=r.c)) THEN
   RAISE EXCEPTION 'Preflight FAIL: required source columns are missing';
 END IF;
END $$;

-- Explicit data prerequisites. WARN means a business decision/remediation is
-- needed before migration; FAIL means an invalid value exists.
SELECT CASE WHEN count(*) FILTER (WHERE to_jsonb(b)->>'publication_status' IS NULL)=0 THEN 'PASS' ELSE 'WARN' END AS result,
       'blog_posts rows without publication_status column or value' AS prerequisite,
       count(*) FILTER (WHERE to_jsonb(b)->>'publication_status' IS NULL) AS affected_rows,
       count(*) FILTER (WHERE to_jsonb(b)->>'publication_status' NOT IN ('draft','published')) AS invalid_values
FROM public.blog_posts b;

SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='blog_posts' AND column_name='publication_status')
       THEN CASE WHEN (SELECT count(*) FROM blog_posts)=0 THEN 'PASS' ELSE 'WARN' END
       WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='blog_posts' AND column_name='publication_status' AND data_type='character varying' AND character_maximum_length<=20) THEN 'PASS'
       ELSE 'FAIL' END AS result,'blog_posts.publication_status type/length' AS prerequisite;

SELECT field, null_rows, blank_rows,
       CASE WHEN null_rows=0 AND blank_rows=0 THEN 'PASS' ELSE 'WARN' END AS result
FROM (
 SELECT 'id' field, count(*) FILTER(WHERE id IS NULL) null_rows, count(*) FILTER(WHERE id IS NOT NULL AND btrim(id::text)='') blank_rows FROM visa_services
 UNION ALL SELECT 'country',count(*) FILTER(WHERE country IS NULL),count(*) FILTER(WHERE country IS NOT NULL AND btrim(country::text)='') FROM visa_services
 UNION ALL SELECT 'visa_type',count(*) FILTER(WHERE visa_type IS NULL),count(*) FILTER(WHERE visa_type IS NOT NULL AND btrim(visa_type::text)='') FROM visa_services
 UNION ALL SELECT 'processing_time',count(*) FILTER(WHERE processing_time IS NULL),count(*) FILTER(WHERE processing_time IS NOT NULL AND btrim(processing_time::text)='') FROM visa_services
 UNION ALL SELECT 'starting_from',count(*) FILTER(WHERE starting_from IS NULL),count(*) FILTER(WHERE starting_from IS NOT NULL AND btrim(starting_from::text)='') FROM visa_services
 UNION ALL SELECT 'documents',count(*) FILTER(WHERE documents IS NULL),0 FROM visa_services
 UNION ALL SELECT 'created_at',count(*) FILTER(WHERE created_at IS NULL),0 FROM visa_services
) q ORDER BY field;

SELECT count(*) FILTER(WHERE length(id::text)>80 OR length(country::text)>120 OR length(visa_type::text)>160 OR length(processing_time::text)>120 OR length(starting_from::text)>80) AS over_width_rows,
       CASE WHEN count(*) FILTER(WHERE length(id::text)>80 OR length(country::text)>120 OR length(visa_type::text)>160 OR length(processing_time::text)>120 OR length(starting_from::text)>80)=0 THEN 'PASS' ELSE 'FAIL' END AS result
FROM visa_services;

SELECT count(*) AS rows,
       count(*) FILTER(WHERE category IS NULL OR category NOT IN ('national','international')) AS invalid_category,
       count(*) FILTER(WHERE price_amount IS NULL OR price_amount<=0) AS invalid_price,
       count(*) FILTER(WHERE created_at IS NULL) AS null_created_at,
       count(*) FILTER(WHERE currency IS NULL OR btrim(currency::text)='') AS null_or_blank_currency,
       CASE WHEN count(*) FILTER(WHERE category IS NULL OR category NOT IN ('national','international') OR price_amount IS NULL OR price_amount<=0 OR created_at IS NULL OR currency IS NULL OR btrim(currency::text)='')=0 THEN 'PASS' ELSE 'FAIL' END AS result
FROM travel_packages;

-- Report constraint names/definitions and classify positive-price rule.
SELECT conname, pg_get_constraintdef(oid) AS definition,
       CASE WHEN pg_get_expr(conbin,conrelid) ILIKE '%price_amount%'
          AND replace(replace(regexp_replace(lower(pg_get_expr(conbin,conrelid)),'[[:space:]()"]','','g'),'::numeric',''),'::integer','') IN ('price_amount>0','0<price_amount')
         THEN 'PASS' WHEN pg_get_expr(conbin,conrelid) ILIKE '%price_amount%' THEN 'FAIL: incompatible price check'
         ELSE 'PASS' END AS result
FROM pg_constraint WHERE conrelid='public.travel_packages'::regclass AND contype='c'
UNION ALL SELECT 'price_amount positive check count',count(*)::text,
       CASE WHEN count(*)=1 THEN 'PASS' WHEN count(*)=0 THEN 'WARN: migration will add' ELSE 'FAIL: duplicate equivalent checks' END
FROM pg_constraint WHERE conrelid='public.travel_packages'::regclass AND contype='c'
 AND replace(replace(regexp_replace(lower(pg_get_expr(conbin,conrelid)),'[[:space:]()"]','','g'),'::numeric',''),'::integer','') IN ('price_amount>0','0<price_amount');

WITH wanted(table_name,constraint_name) AS (VALUES
 ('blog_posts','blog_posts_publication_status_check'),
 ('visa_services','visa_services_id_nonblank_check'),('visa_services','visa_services_country_nonblank_check'),
 ('visa_services','visa_services_visa_type_nonblank_check'),('visa_services','visa_services_processing_time_nonblank_check'),
 ('visa_services','visa_services_starting_from_nonblank_check'),
 ('travel_packages','travel_packages_category_check'),('travel_packages','travel_packages_currency_nonblank_check')
)
SELECT CASE WHEN c.conname IS NULL THEN 'WARN: migration will add'
            WHEN w.table_name='blog_posts' AND (pg_get_constraintdef(c.oid) NOT ILIKE '%draft%' OR pg_get_constraintdef(c.oid) NOT ILIKE '%published%') THEN 'FAIL: incompatible constraint'
            WHEN w.table_name='visa_services' AND (pg_get_constraintdef(c.oid) NOT ILIKE '%btrim%' OR pg_get_constraintdef(c.oid) NOT ILIKE '%'||split_part(w.constraint_name,'_nonblank_check',1)||'%') THEN 'FAIL: incompatible constraint'
            WHEN w.table_name='travel_packages' AND w.constraint_name='travel_packages_category_check' AND (pg_get_constraintdef(c.oid) NOT ILIKE '%national%' OR pg_get_constraintdef(c.oid) NOT ILIKE '%international%') THEN 'FAIL: incompatible constraint'
            WHEN w.constraint_name='travel_packages_currency_nonblank_check' AND (pg_get_constraintdef(c.oid) NOT ILIKE '%btrim%' OR pg_get_constraintdef(c.oid) NOT ILIKE '%currency%') THEN 'FAIL: incompatible constraint'
            WHEN c.convalidated THEN 'PASS' ELSE 'WARN: existing check is not validated' END result,
       w.table_name||'.'||w.constraint_name AS prerequisite,pg_get_constraintdef(c.oid) definition
FROM wanted w LEFT JOIN pg_constraint c ON c.conrelid=to_regclass('public.'||w.table_name) AND c.conname=w.constraint_name
ORDER BY w.table_name,w.constraint_name;

-- Index metadata is reviewed by migration; flag collisions by the required names.
WITH required(table_name,index_name,key_fragment,predicate) AS (VALUES
 ('blog_posts','idx_blog_posts_published_at','USING btree (published_at DESC)',NULL::text),
 ('blog_posts','idx_blog_posts_published_public','USING btree (published_at DESC, created_at DESC)','publication_status'),
 ('visa_services','idx_visa_services_country','USING btree (country)',NULL::text),
 ('travel_packages','idx_travel_packages_created_at','USING btree (created_at DESC)',NULL::text),
 ('travel_packages','idx_travel_packages_category','USING btree (category)',NULL::text)
)
SELECT CASE
 WHEN i.indexname IS NOT NULL AND (i.indexdef NOT ILIKE '%'||r.key_fragment||'%'
   OR (r.predicate IS NOT NULL AND (i.indexdef NOT ILIKE '%'||r.predicate||'%'
      OR i.indexdef NOT ILIKE '%published%'))) THEN 'FAIL: conflicting named index'
 WHEN EXISTS(SELECT 1 FROM pg_indexes e WHERE e.schemaname='public' AND e.tablename=r.table_name
   AND e.indexdef ILIKE '%'||r.key_fragment||'%'
   AND (r.predicate IS NULL OR (e.indexdef ILIKE '%'||r.predicate||'%' AND e.indexdef ILIKE '%published%'))) THEN 'PASS'
 ELSE 'WARN: missing; migration will add'
 END AS result,
       r.table_name||'.'||r.index_name AS prerequisite, i.indexdef AS named_index_definition
FROM required r LEFT JOIN pg_indexes i ON i.schemaname='public' AND i.tablename=r.table_name AND i.indexname=r.index_name
ORDER BY r.table_name,r.index_name;

-- Required columns/tables gate subsequent row-level checks and snapshot.
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM (VALUES
   ('blog_posts','id'),('blog_posts','published_at'),('blog_posts','created_at'),
   ('visa_services','id'),('visa_services','country'),('visa_services','visa_type'),('visa_services','processing_time'),('visa_services','starting_from'),('visa_services','documents'),('visa_services','created_at'),
   ('travel_packages','id'),('travel_packages','category'),('travel_packages','price_amount'),('travel_packages','currency'),('travel_packages','created_at')
 ) r(t,c) WHERE to_regclass('public.'||r.t) IS NULL OR NOT EXISTS
   (SELECT 1 FROM information_schema.columns x WHERE x.table_schema='public' AND x.table_name=r.t AND x.column_name=r.c)) THEN
   RAISE EXCEPTION 'Preflight FAIL: required source tables/columns are missing; see results above';
 END IF;
END $$;

-- Session-local preservation baseline. Contains catalogue primary keys only.
DROP TABLE IF EXISTS pg_temp.catalog_reconciliation_before;
CREATE OR REPLACE FUNCTION pg_temp.catalog_reconciliation_state(p_table text) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE state jsonb;
BEGIN
 IF p_table='blog_posts' THEN
   IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='blog_posts' AND column_name='publication_status') THEN
     SELECT jsonb_build_object('null_status',count(*),'statuses',CASE WHEN count(*)=0 THEN '{}'::jsonb ELSE jsonb_build_object('<NULL>',count(*)) END) INTO state FROM blog_posts;
   ELSE
     SELECT jsonb_build_object('null_status',count(*) FILTER(WHERE publication_status IS NULL),
       'statuses',coalesce((SELECT jsonb_object_agg(coalesce(publication_status,'<NULL>'),n) FROM
         (SELECT publication_status,count(*) n FROM blog_posts GROUP BY publication_status) s),'{}'::jsonb)) INTO state FROM blog_posts;
   END IF;
 ELSIF p_table='visa_services' THEN
   SELECT jsonb_build_object('nulls',jsonb_build_object(
     'id',count(*) FILTER(WHERE id IS NULL),'country',count(*) FILTER(WHERE country IS NULL),
     'visa_type',count(*) FILTER(WHERE visa_type IS NULL),'processing_time',count(*) FILTER(WHERE processing_time IS NULL),
     'starting_from',count(*) FILTER(WHERE starting_from IS NULL),'documents',count(*) FILTER(WHERE documents IS NULL),
     'created_at',count(*) FILTER(WHERE created_at IS NULL))) INTO state FROM visa_services;
 ELSIF p_table='travel_packages' THEN
   SELECT jsonb_build_object('nulls',jsonb_build_object(
     'category',count(*) FILTER(WHERE category IS NULL),'price_amount',count(*) FILTER(WHERE price_amount IS NULL),
     'currency',count(*) FILTER(WHERE currency IS NULL),'created_at',count(*) FILTER(WHERE created_at IS NULL)),
     'categories',coalesce((SELECT jsonb_object_agg(coalesce(category,'<NULL>'),n) FROM
       (SELECT category,count(*) n FROM travel_packages GROUP BY category) s),'{}'::jsonb)) INTO state FROM travel_packages;
 ELSE RAISE EXCEPTION 'Unknown catalogue table: %',p_table;
 END IF;
 RETURN state;
END $$;

CREATE TEMP TABLE catalog_reconciliation_before ON COMMIT PRESERVE ROWS AS
SELECT 'blog_posts'::text table_name,count(*) row_count,coalesce(jsonb_agg(to_jsonb(id) ORDER BY id),'[]'::jsonb) primary_keys,pg_temp.catalog_reconciliation_state('blog_posts') data_profile FROM blog_posts
UNION ALL SELECT 'visa_services',count(*),coalesce(jsonb_agg(to_jsonb(id) ORDER BY id),'[]'::jsonb),pg_temp.catalog_reconciliation_state('visa_services') FROM visa_services
UNION ALL SELECT 'travel_packages',count(*),coalesce(jsonb_agg(to_jsonb(id) ORDER BY id),'[]'::jsonb),pg_temp.catalog_reconciliation_state('travel_packages') FROM travel_packages;
SELECT table_name,row_count,primary_keys,data_profile FROM catalog_reconciliation_before ORDER BY table_name;

SELECT 'blog_posts' table_name,
       count(*) total_rows,
       count(*) FILTER(WHERE to_jsonb(b)->>'publication_status' IS NULL) statusless,
       count(*) FILTER(WHERE to_jsonb(b)->>'publication_status'='published') published,
       count(*) FILTER(WHERE to_jsonb(b)->>'publication_status'='draft') drafts
FROM blog_posts b
UNION ALL SELECT 'visa_services',count(*),count(*) FILTER(WHERE processing_time IS NULL OR starting_from IS NULL OR documents IS NULL OR created_at IS NULL),0,0 FROM visa_services
UNION ALL SELECT 'travel_packages',count(*),count(*) FILTER(WHERE category IS NULL OR price_amount IS NULL OR created_at IS NULL OR currency IS NULL),0,0 FROM travel_packages;
