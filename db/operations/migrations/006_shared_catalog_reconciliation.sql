-- Reconcile shared catalogue tables with the current website/mobile API contract.
-- This migration is transaction-safe and preserves all catalogue rows.
-- The approved production decision is to publish the seven existing posts and
-- use migration-time timestamps for visa rows when created_at is absent/null.

DO $$
DECLARE
  bad_count bigint;
  has_publication_status boolean;
  has_invalid_publication_status boolean;
BEGIN
  IF to_regclass('public.blog_posts') IS NULL
     OR to_regclass('public.visa_services') IS NULL
     OR to_regclass('public.travel_packages') IS NULL THEN
    RAISE EXCEPTION 'Shared catalogue reconciliation requires blog_posts, visa_services, and travel_packages to exist';
  END IF;

  -- Do not truncate data while narrowing source text fields to varchar limits.
  SELECT count(*) INTO bad_count FROM visa_services
   WHERE length(id) > 80 OR length(country) > 120 OR length(visa_type) > 160
      OR (processing_time IS NOT NULL AND length(processing_time) > 120)
      OR (starting_from IS NOT NULL AND length(starting_from) > 80);
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'visa_services has % values longer than the source column limits; review and correct explicitly before retrying', bad_count;
  END IF;

  SELECT count(*) INTO bad_count FROM visa_services
   WHERE id IS NULL OR btrim(id::text) = ''
      OR country IS NULL OR btrim(country::text) = ''
      OR visa_type IS NULL OR btrim(visa_type::text) = ''
      OR processing_time IS NULL OR btrim(processing_time::text) = ''
      OR starting_from IS NULL OR btrim(starting_from::text) = ''
      OR documents IS NULL;
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'visa_services has % rows with invalid required catalogue fields; obtain approved per-record values before retrying', bad_count;
  END IF;

  SELECT count(*) INTO bad_count FROM travel_packages
   WHERE category IS NULL OR category NOT IN ('national', 'international');
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'travel_packages has % rows with invalid category; review and correct explicitly before retrying', bad_count;
  END IF;

  SELECT count(*) INTO bad_count FROM travel_packages
   WHERE price_amount IS NULL OR price_amount <= 0;
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'travel_packages has % rows with non-positive price_amount; obtain approved prices before retrying', bad_count;
  END IF;

  SELECT count(*) INTO bad_count FROM travel_packages
   WHERE currency IS NULL OR btrim(currency::text) = '' OR created_at IS NULL;
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'travel_packages has % rows with missing currency or created_at', bad_count;
  END IF;

  -- Do not silently reinterpret an unexpected pre-existing publication value.
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'blog_posts'
       AND column_name = 'publication_status'
  ) INTO has_publication_status;
  IF has_publication_status THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM blog_posts WHERE publication_status IS NOT NULL AND publication_status NOT IN (''draft'', ''published''))'
      INTO has_invalid_publication_status;
  ELSE
    has_invalid_publication_status := false;
  END IF;
  IF has_invalid_publication_status THEN
    RAISE EXCEPTION 'blog_posts has an unsupported publication_status value; review before retrying';
  END IF;
END $$;

-- Apply the explicitly approved classification to legacy rows. The NULL-only
-- update makes repeat execution preserve any later draft decisions.
ALTER TABLE blog_posts
  ADD COLUMN IF NOT EXISTS publication_status VARCHAR(20) DEFAULT 'published';
UPDATE blog_posts SET publication_status = 'published' WHERE publication_status IS NULL;
ALTER TABLE blog_posts ALTER COLUMN publication_status SET DEFAULT 'published';
ALTER TABLE blog_posts ALTER COLUMN publication_status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.blog_posts'::regclass
       AND conname = 'blog_posts_publication_status_check'
  ) THEN
    ALTER TABLE blog_posts
      ADD CONSTRAINT blog_posts_publication_status_check
      CHECK (publication_status IN ('draft', 'published')) NOT VALID;
  END IF;
END $$;
ALTER TABLE blog_posts VALIDATE CONSTRAINT blog_posts_publication_status_check;

-- Required lookup/order indexes used by the public APIs and admin lists.
CREATE INDEX IF NOT EXISTS idx_blog_posts_published_at ON blog_posts (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_blog_posts_published_public
  ON blog_posts (published_at DESC, created_at DESC)
  WHERE publication_status = 'published';

-- The six-field public visa API tolerates null image_url but expects these
-- descriptive fields to be present. No guessed values are written for them.
ALTER TABLE visa_services ALTER COLUMN id TYPE VARCHAR(80) USING id::VARCHAR(80);
ALTER TABLE visa_services ALTER COLUMN country TYPE VARCHAR(120) USING country::VARCHAR(120);
ALTER TABLE visa_services ALTER COLUMN visa_type TYPE VARCHAR(160) USING visa_type::VARCHAR(160);
ALTER TABLE visa_services ALTER COLUMN processing_time TYPE VARCHAR(120) USING processing_time::VARCHAR(120);
ALTER TABLE visa_services ALTER COLUMN starting_from TYPE VARCHAR(80) USING starting_from::VARCHAR(80);
ALTER TABLE visa_services ALTER COLUMN id SET NOT NULL;
ALTER TABLE visa_services ALTER COLUMN country SET NOT NULL;
ALTER TABLE visa_services ALTER COLUMN visa_type SET NOT NULL;
ALTER TABLE visa_services ALTER COLUMN processing_time SET NOT NULL;
ALTER TABLE visa_services ALTER COLUMN starting_from SET NOT NULL;
UPDATE visa_services SET documents = '{}'::TEXT[] WHERE documents IS NULL;
ALTER TABLE visa_services ALTER COLUMN documents SET DEFAULT '{}'::TEXT[];
ALTER TABLE visa_services ALTER COLUMN documents SET NOT NULL;
ALTER TABLE visa_services ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
UPDATE visa_services SET created_at = NOW() WHERE created_at IS NULL;
ALTER TABLE visa_services ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE visa_services ALTER COLUMN created_at SET NOT NULL;
DO $$
DECLARE col text; con text;
BEGIN
  FOREACH col IN ARRAY ARRAY['id','country','visa_type','processing_time','starting_from'] LOOP
    con := 'visa_services_' || col || '_nonblank_check';
    IF EXISTS (SELECT 1 FROM pg_constraint
      WHERE conrelid='public.visa_services'::regclass AND conname=con
        AND (pg_get_constraintdef(oid) NOT ILIKE '%btrim%' OR pg_get_constraintdef(oid) NOT ILIKE '%'||col||'%')) THEN
      RAISE EXCEPTION 'Conflicting visa required-field check: %', con;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
      WHERE conrelid='public.visa_services'::regclass AND conname=con) THEN
      EXECUTE format('ALTER TABLE public.visa_services ADD CONSTRAINT %I CHECK (btrim(%I::text) <> %L) NOT VALID', con, col, '');
    END IF;
    EXECUTE format('ALTER TABLE public.visa_services VALIDATE CONSTRAINT %I', con);
  END LOOP;
END $$;
CREATE INDEX IF NOT EXISTS idx_visa_services_country ON visa_services (country);

-- Preserve existing package values, enforce the website domain rules, and
-- remove the contradictory zero default. Admin create/update already supplies
-- a validated positive price_amount; incomplete future inserts must specify it.
ALTER TABLE travel_packages ALTER COLUMN category SET DEFAULT 'international';
ALTER TABLE travel_packages ALTER COLUMN category SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.travel_packages'::regclass
       AND conname = 'travel_packages_category_check'
  ) THEN
    ALTER TABLE travel_packages
      ADD CONSTRAINT travel_packages_category_check
      CHECK (category IN ('national', 'international')) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.travel_packages'::regclass
       AND conname = 'travel_packages_price_amount_check'
  ) THEN
    ALTER TABLE travel_packages
      ADD CONSTRAINT travel_packages_price_amount_check
      CHECK (price_amount > 0) NOT VALID;
  END IF;
END $$;
ALTER TABLE travel_packages VALIDATE CONSTRAINT travel_packages_category_check;
ALTER TABLE travel_packages VALIDATE CONSTRAINT travel_packages_price_amount_check;
ALTER TABLE travel_packages ALTER COLUMN price_amount DROP DEFAULT;
ALTER TABLE travel_packages ALTER COLUMN currency SET DEFAULT 'INR';
ALTER TABLE travel_packages ALTER COLUMN currency SET NOT NULL;
ALTER TABLE travel_packages ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
UPDATE travel_packages SET created_at = NOW() WHERE created_at IS NULL;
ALTER TABLE travel_packages ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE travel_packages ALTER COLUMN created_at SET NOT NULL;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
      WHERE conrelid='public.travel_packages'::regclass
        AND conname='travel_packages_currency_nonblank_check'
        AND pg_get_constraintdef(oid) NOT ILIKE '%btrim%currency%') THEN
    RAISE EXCEPTION 'Conflicting package currency nonblank constraint';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
      WHERE conrelid='public.travel_packages'::regclass
        AND conname='travel_packages_currency_nonblank_check') THEN
    ALTER TABLE public.travel_packages
      ADD CONSTRAINT travel_packages_currency_nonblank_check
      CHECK (btrim(currency::text) <> '') NOT VALID;
  END IF;
END $$;
ALTER TABLE travel_packages VALIDATE CONSTRAINT travel_packages_currency_nonblank_check;
CREATE INDEX IF NOT EXISTS idx_travel_packages_created_at ON travel_packages (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_travel_packages_category ON travel_packages (category);
