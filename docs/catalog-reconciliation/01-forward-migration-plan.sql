-- FORWARD ONLY. Apply only to an explicitly confirmed staging database.
-- This script performs no catalogue row-value backfills and deletes no data.
-- It intentionally aborts until all reported business decisions have been
-- resolved explicitly in staging. Run with psql -v ON_ERROR_STOP=1.
BEGIN;

-- Refuse an incomplete source schema before any DDL is committed.
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(required.table_name || '.' || required.column_name, ', ')
    INTO missing
  FROM (VALUES
    ('blog_posts','id'), ('blog_posts','published_at'), ('blog_posts','created_at'),
    ('visa_services','id'), ('visa_services','country'), ('visa_services','visa_type'),
    ('visa_services','processing_time'), ('visa_services','starting_from'),
    ('visa_services','documents'), ('visa_services','created_at'),
    ('travel_packages','id'), ('travel_packages','category'),
    ('travel_packages','price_amount'), ('travel_packages','currency'),
    ('travel_packages','created_at')
  ) AS required(table_name, column_name)
  WHERE to_regclass('public.' || required.table_name) IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns c
       WHERE c.table_schema='public' AND c.table_name=required.table_name
         AND c.column_name=required.column_name);
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Unsafe source schema; missing required tables/columns: %', missing;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM (VALUES
    ('blog_posts','id','character varying,text'),('blog_posts','published_at','date,timestamp without time zone'),('blog_posts','created_at','timestamp with time zone,timestamp without time zone'),
    ('visa_services','id','character varying,text'),('visa_services','country','character varying,text'),('visa_services','visa_type','character varying,text'),('visa_services','processing_time','character varying,text'),('visa_services','starting_from','character varying,text'),('visa_services','documents','ARRAY'),('visa_services','created_at','timestamp with time zone,timestamp without time zone'),
    ('travel_packages','id','character varying,text'),('travel_packages','category','character varying,text'),('travel_packages','price_amount','numeric'),('travel_packages','currency','character'),('travel_packages','created_at','timestamp with time zone,timestamp without time zone')
  ) r(t,c,types) JOIN information_schema.columns x ON x.table_schema='public' AND x.table_name=r.t AND x.column_name=r.c
    WHERE position(x.data_type in r.types)=0) THEN
    RAISE EXCEPTION 'Unsafe source schema: incompatible catalogue column type';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='visa_services' AND column_name='documents' AND udt_name<>'_text') THEN
    RAISE EXCEPTION 'Unsafe source schema: visa_services.documents must be text[]';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='travel_packages' AND column_name='currency' AND character_maximum_length<>3) THEN
    RAISE EXCEPTION 'Unsafe source schema: travel_packages.currency must be CHAR(3)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='blog_posts' AND column_name='publication_status' AND (data_type<>'character varying' OR character_maximum_length>20)) THEN
    RAISE EXCEPTION 'Unsafe source schema: blog_posts.publication_status must be varchar(20) or narrower';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.catalog_index_matches(
  p_table text, p_keys text[], p_descending boolean[], p_predicate text DEFAULT NULL,
  p_index_name text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE idx record; pos integer; actual_key text; actual_predicate text; keys_match boolean;
BEGIN
  FOR idx IN SELECT i.* FROM pg_index i
    JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace
    JOIN pg_class ic ON ic.oid=i.indexrelid JOIN pg_am am ON am.oid=ic.relam
    WHERE n.nspname='public' AND t.relname=p_table AND am.amname='btree'
      AND (p_index_name IS NULL OR ic.relname=p_index_name)
      AND i.indisvalid AND NOT i.indisunique AND i.indnkeyatts=cardinality(p_keys)
  LOOP
    IF (idx.indpred IS NULL) <> (p_predicate IS NULL) THEN CONTINUE; END IF;
    actual_predicate := regexp_replace(lower(coalesce(pg_get_expr(idx.indpred,idx.indrelid),'')), '[[:space:]()"]','','g');
    actual_predicate := replace(replace(actual_predicate,'::character varying',''),'::text','');
    IF p_predicate IS NOT NULL AND actual_predicate <> regexp_replace(lower(p_predicate),'[[:space:]()"]','','g') THEN CONTINUE; END IF;
    keys_match := true;
    FOR pos IN 1..cardinality(p_keys) LOOP
      actual_key := regexp_replace(lower(pg_get_indexdef(idx.indexrelid,pos,true)), '[[:space:]"]','','g');
      IF actual_key <> lower(p_keys[pos]) THEN keys_match := false; EXIT; END IF;
      IF p_descending[pos] <> ((idx.indoption[pos-1] & 1)=1) THEN keys_match := false; EXIT; END IF;
    END LOOP;
    IF keys_match THEN RETURN true; END IF;
  END LOOP;
  RETURN false;
END $$;

-- A statusless blog row has no reliable legacy draft/publication marker.
-- Do not infer or assign a status: require an owner decision for every row.
DO $$
DECLARE missing_status_column boolean;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='blog_posts'
      AND column_name='publication_status') INTO missing_status_column;
  IF missing_status_column AND EXISTS (SELECT 1 FROM public.blog_posts) THEN
    RAISE EXCEPTION 'Business decision required: % blog_posts rows have no publication_status column; classify each row explicitly before migration',
      (SELECT count(*) FROM public.blog_posts);
  END IF;
  IF NOT missing_status_column AND EXISTS (SELECT 1 FROM public.blog_posts
       WHERE publication_status IS NULL OR publication_status NOT IN ('draft','published')) THEN
    RAISE EXCEPTION 'Business decision required: classify all NULL/invalid blog publication_status values before migration';
  END IF;
END $$;

-- Visa required values must be reviewed, not replaced with invented labels.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.visa_services WHERE
       id IS NULL OR btrim(id::text)='' OR country IS NULL OR btrim(country::text)=''
       OR visa_type IS NULL OR btrim(visa_type::text)=''
       OR processing_time IS NULL OR btrim(processing_time::text)=''
       OR starting_from IS NULL OR btrim(starting_from::text)=''
       OR documents IS NULL OR created_at IS NULL) THEN
    RAISE EXCEPTION 'Business decision required: visa_services has NULL/blank required fields; inspect aggregate preflight, approve row-level remediation, then rerun';
  END IF;
  IF EXISTS (SELECT 1 FROM public.visa_services WHERE length(id::text)>80 OR length(country::text)>120 OR length(visa_type::text)>160 OR length(processing_time::text)>120 OR length(starting_from::text)>80) THEN
    RAISE EXCEPTION 'Unsafe visa_services values exceed intended varchar widths; inspect preflight and remediate explicitly';
  END IF;
END $$;

-- NULL package timestamps/currency have no safe historical inference.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.travel_packages WHERE created_at IS NULL) THEN
    RAISE EXCEPTION 'Business decision required: travel_packages has NULL created_at; approve a documented timestamp rule and remediate before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM public.travel_packages WHERE currency IS NULL OR btrim(currency::text)='') THEN
    RAISE EXCEPTION 'Business decision required: travel_packages has NULL/blank currency; approve currency values and remediate before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM public.travel_packages WHERE category IS NULL OR category NOT IN ('national','international')) THEN
    RAISE EXCEPTION 'Invalid travel_packages category; resolve with the catalogue owner before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM public.travel_packages WHERE price_amount IS NULL OR price_amount <= 0) THEN
    RAISE EXCEPTION 'Invalid travel_packages price_amount; approve positive prices before migration';
  END IF;
END $$;

-- Reject checks that claim to constrain publication/category but do not
-- express the complete allowed set. Avoid stacking a required rule onto an
-- incompatible legacy check.
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname,pg_get_constraintdef(oid) definition FROM pg_constraint
    WHERE conrelid='public.blog_posts'::regclass AND contype='c'
      AND pg_get_constraintdef(oid) ILIKE '%publication_status%'
  LOOP
    IF c.definition NOT ILIKE '%draft%' OR c.definition NOT ILIKE '%published%' THEN
      RAISE EXCEPTION 'Incompatible blog publication_status constraint: %',c.conname;
    END IF;
  END LOOP;
  FOR c IN SELECT conname,pg_get_constraintdef(oid) definition FROM pg_constraint
    WHERE conrelid='public.travel_packages'::regclass AND contype='c'
      AND pg_get_constraintdef(oid) ILIKE '%category%'
  LOOP
    IF c.definition NOT ILIKE '%national%' OR c.definition NOT ILIKE '%international%' THEN
      RAISE EXCEPTION 'Incompatible package category constraint: %',c.conname;
    END IF;
  END LOOP;
END $$;

-- Validate the existing intended price rule semantically, independent of its
-- name. Any other CHECK involving price_amount is considered incompatible.
DO $$
DECLARE equivalent_count integer; price_check_count integer; normalized text;
BEGIN
  SELECT count(*) INTO price_check_count FROM pg_constraint
    WHERE conrelid='public.travel_packages'::regclass AND contype='c'
      AND pg_get_expr(conbin, conrelid) ILIKE '%price_amount%';
  SELECT count(*) INTO equivalent_count FROM pg_constraint
    WHERE conrelid='public.travel_packages'::regclass AND contype='c'
      AND replace(replace(regexp_replace(lower(pg_get_expr(conbin, conrelid)), '[[:space:]()"]', '', 'g'), '::numeric',''), '::integer','')
          IN ('price_amount>0','0<price_amount');
  IF price_check_count > equivalent_count THEN
    RAISE EXCEPTION 'Incompatible price_amount CHECK exists; review constraints before migration';
  END IF;
  IF equivalent_count > 1 THEN
    RAISE EXCEPTION 'Duplicate equivalent positive price_amount CHECK constraints exist; reconcile them manually before migration';
  END IF;
END $$;

-- Ensure each required index name, if present, has the intended definition.
-- An equivalent differently named index is accepted by the structural checks.
DO $$
DECLARE ix record; present boolean;
BEGIN
  FOR ix IN SELECT * FROM (VALUES
    ('blog_posts','idx_blog_posts_published_at',ARRAY['published_at'],ARRAY[true],NULL::text),
    ('blog_posts','idx_blog_posts_published_public',ARRAY['published_at','created_at'],ARRAY[true,true],'publication_status = ''published'''),
    ('visa_services','idx_visa_services_country',ARRAY['country'],ARRAY[false],NULL::text),
    ('travel_packages','idx_travel_packages_created_at',ARRAY['created_at'],ARRAY[true],NULL::text),
    ('travel_packages','idx_travel_packages_category',ARRAY['category'],ARRAY[false],NULL::text)
  ) v(table_name,index_name,key_spec,descending,predicate)
  LOOP
    SELECT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=ix.index_name) INTO present;
    IF present AND NOT pg_temp.catalog_index_matches(ix.table_name,ix.key_spec,ix.descending,ix.predicate,ix.index_name) THEN
      RAISE EXCEPTION 'Conflicting index definition for public.%', ix.index_name;
    END IF;
  END LOOP;
END $$;

-- BLOG: only empty tables may receive the default without a classification
-- decision. Existing rows must already have explicit valid statuses.
ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS publication_status varchar(20);
ALTER TABLE public.blog_posts
  ALTER COLUMN publication_status SET DEFAULT 'published';
ALTER TABLE public.blog_posts
  ALTER COLUMN publication_status SET NOT NULL;
DO $$
DECLARE found_constraint oid; definition text;
BEGIN
  SELECT oid,pg_get_constraintdef(oid) INTO found_constraint,definition FROM pg_constraint
    WHERE conrelid='public.blog_posts'::regclass AND conname='blog_posts_publication_status_check';
  IF found_constraint IS NOT NULL AND (definition NOT ILIKE '%publication_status%' OR definition NOT ILIKE '%draft%' OR definition NOT ILIKE '%published%') THEN
    RAISE EXCEPTION 'Conflicting blog publication status constraint definition';
  END IF;
  IF found_constraint IS NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint
      WHERE conrelid='public.blog_posts'::regclass AND contype='c'
        AND pg_get_constraintdef(oid) ILIKE '%publication_status%'
        AND pg_get_constraintdef(oid) ILIKE '%draft%'
        AND pg_get_constraintdef(oid) ILIKE '%published%') THEN
    ALTER TABLE public.blog_posts ADD CONSTRAINT blog_posts_publication_status_check
      CHECK (publication_status IN ('draft','published')) NOT VALID;
  END IF;
END $$;
DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='public.blog_posts'::regclass
    AND contype='c' AND pg_get_expr(conbin,conrelid) ILIKE '%publication_status%'
  LOOP EXECUTE format('ALTER TABLE public.blog_posts VALIDATE CONSTRAINT %I',c.conname); END LOOP;
END $$;

-- VISA: retain existing values. Convert text widths only after preflight has
-- reported compatibility; enforce nonblank required fields at the database.
ALTER TABLE public.visa_services
  ALTER COLUMN id TYPE varchar(80) USING id::text,
  ALTER COLUMN country TYPE varchar(120) USING country::text,
  ALTER COLUMN visa_type TYPE varchar(160) USING visa_type::text,
  ALTER COLUMN processing_time TYPE varchar(120) USING processing_time::text,
  ALTER COLUMN starting_from TYPE varchar(80) USING starting_from::text,
  ALTER COLUMN id SET NOT NULL, ALTER COLUMN country SET NOT NULL,
  ALTER COLUMN visa_type SET NOT NULL, ALTER COLUMN processing_time SET NOT NULL,
  ALTER COLUMN starting_from SET NOT NULL,
  ALTER COLUMN documents SET NOT NULL, ALTER COLUMN created_at SET NOT NULL;
DO $$
DECLARE col text; con text;
BEGIN
  FOREACH col IN ARRAY ARRAY['id','country','visa_type','processing_time','starting_from'] LOOP
    con := 'visa_services_' || col || '_nonblank_check';
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.visa_services'::regclass AND conname=con
      AND (pg_get_constraintdef(oid) NOT ILIKE '%btrim%' OR pg_get_constraintdef(oid) NOT ILIKE '%'||col||'%')) THEN
      RAISE EXCEPTION 'Conflicting visa required-field check: %',con;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.visa_services'::regclass AND conname=con) THEN
      EXECUTE format('ALTER TABLE public.visa_services ADD CONSTRAINT %I CHECK (btrim(%I::text) <> '''') NOT VALID', con, col);
    END IF;
    EXECUTE format('ALTER TABLE public.visa_services VALIDATE CONSTRAINT %I', con);
  END LOOP;
END $$;
ALTER TABLE public.visa_services ALTER COLUMN documents SET DEFAULT '{}'::text[];
ALTER TABLE public.visa_services ALTER COLUMN created_at SET DEFAULT now();

-- PACKAGES: never provide a fabricated price; remove the contradictory zero
-- default. Enforce the intended required fields after NULL preconditions pass.
ALTER TABLE public.travel_packages
  ALTER COLUMN category SET DEFAULT 'international',
  ALTER COLUMN category SET NOT NULL,
  ALTER COLUMN price_amount DROP DEFAULT,
  ALTER COLUMN price_amount SET NOT NULL,
  ALTER COLUMN currency SET DEFAULT 'INR',
  ALTER COLUMN currency SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN created_at SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.travel_packages'::regclass
      AND contype='c' AND replace(replace(regexp_replace(lower(pg_get_expr(conbin, conrelid)), '[[:space:]()"]', '', 'g'), '::numeric',''), '::integer','')
        IN ('price_amount>0','0<price_amount')) THEN
    ALTER TABLE public.travel_packages ADD CONSTRAINT travel_packages_price_amount_positive_check
      CHECK (price_amount > 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.travel_packages'::regclass
      AND contype='c' AND pg_get_expr(conbin, conrelid) ILIKE '%category%') THEN
    ALTER TABLE public.travel_packages ADD CONSTRAINT travel_packages_category_check
      CHECK (category IN ('national','international')) NOT VALID;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.travel_packages'::regclass
      AND conname='travel_packages_currency_nonblank_check'
      AND pg_get_constraintdef(oid) NOT ILIKE '%btrim%currency%') THEN
    RAISE EXCEPTION 'Conflicting package currency nonblank constraint';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.travel_packages'::regclass
      AND conname='travel_packages_currency_nonblank_check') THEN
    ALTER TABLE public.travel_packages ADD CONSTRAINT travel_packages_currency_nonblank_check
      CHECK (btrim(currency::text) <> '') NOT VALID;
  END IF;
END $$;
DO $$ DECLARE c record; normalized text; BEGIN
  FOR c IN SELECT conname,pg_get_expr(conbin,conrelid) expr FROM pg_constraint
    WHERE conrelid='public.travel_packages'::regclass AND contype='c'
  LOOP
    normalized := replace(replace(regexp_replace(lower(c.expr),'[[:space:]()"]','','g'),'::numeric',''),'::integer','');
    IF normalized IN ('price_amount>0','0<price_amount') OR c.expr ILIKE '%category%' OR c.conname='travel_packages_currency_nonblank_check' THEN
      EXECUTE format('ALTER TABLE public.travel_packages VALIDATE CONSTRAINT %I',c.conname);
    END IF;
  END LOOP;
END $$;

-- Create indexes only when the named index is absent. The pre-migration check
-- rejects a conflicting same-name definition; equivalent indexes under other
-- names are retained, so no duplicate is created in that case.
DO $$ BEGIN
  IF NOT pg_temp.catalog_index_matches('blog_posts',ARRAY['published_at'],ARRAY[true],NULL) THEN
    CREATE INDEX idx_blog_posts_published_at ON public.blog_posts (published_at DESC);
  END IF;
  IF NOT pg_temp.catalog_index_matches('blog_posts',ARRAY['published_at','created_at'],ARRAY[true,true],'publication_status = ''published''') THEN
    CREATE INDEX idx_blog_posts_published_public ON public.blog_posts (published_at DESC,created_at DESC) WHERE publication_status='published';
  END IF;
  IF NOT pg_temp.catalog_index_matches('visa_services',ARRAY['country'],ARRAY[false],NULL) THEN
    CREATE INDEX idx_visa_services_country ON public.visa_services (country);
  END IF;
  IF NOT pg_temp.catalog_index_matches('travel_packages',ARRAY['created_at'],ARRAY[true],NULL) THEN
    CREATE INDEX idx_travel_packages_created_at ON public.travel_packages (created_at DESC);
  END IF;
  IF NOT pg_temp.catalog_index_matches('travel_packages',ARRAY['category'],ARRAY[false],NULL) THEN
    CREATE INDEX idx_travel_packages_category ON public.travel_packages (category);
  END IF;
END $$;

COMMIT;
