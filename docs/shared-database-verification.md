# LemonTrip shared PostgreSQL verification and reconciliation

This runbook is for an authorized operator. It does not authorize production
access or migration. Use a staging database copied from the intended schema
for write-path testing; use a separate read-only role for metadata review.

## Render configuration review

In the Render dashboard, inspect the Environment settings for the website and
mobile backend services. Confirm that each `DATABASE_URL` references the same
Render PostgreSQL resource and database name. Do not paste either value into a
ticket, terminal transcript, or audit report. Compare SSL settings and any
connection options as well. The local `.env` files matched when this runbook
was prepared, but that does not verify Render service configuration.

Use a DBA-approved role with `NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`,
`default_transaction_read_only=on`, and a short `statement_timeout`. Grant
`CONNECT` on the intended database and `USAGE` on `public`. Do not grant broad
table reads for this metadata review. Grant `SELECT` only on the migration
ledger tables that exist, when ledger versions need to be inspected. An
authorized DBA can provision and revoke this role through Render's supported
database access path; this repository does not create it.

Example operator-only `psql` setup (run connected to the intended database as
an authorized database administrator; substitute no credential into a saved
script or shell history):

```sql
\prompt -s 'Enter a one-time audit-role password from the approved secret store: ' audit_password
CREATE ROLE lemontrip_shared_audit LOGIN PASSWORD :'audit_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
ALTER ROLE lemontrip_shared_audit SET default_transaction_read_only = on;
ALTER ROLE lemontrip_shared_audit SET statement_timeout = '30s';
GRANT CONNECT ON DATABASE "REPLACE_WITH_RENDER_DATABASE_NAME" TO lemontrip_shared_audit;
GRANT USAGE ON SCHEMA public TO lemontrip_shared_audit;
\unset audit_password
```

Replace the quoted database identifier with the exact database name shown in
Render. For each existing ledger, grant `SELECT` on that ledger only, for
example after checking `to_regclass`:

```sql
SELECT format('GRANT SELECT ON TABLE %s TO lemontrip_shared_audit', ledger)
FROM (VALUES
  (to_regclass('public.lemontrip_website_schema_migrations')),
  (to_regclass('public.lemontrip_mobile_schema_migrations')),
  (to_regclass('public.schema_migrations'))
) AS ledgers(ledger)
WHERE ledger IS NOT NULL
\gexec
```

Revoke the role after verification.

Connect without echoing the connection string, for example with the managed
secret held in `LEMONTRIP_AUDIT_DATABASE_URL`:

```sh
psql "$LEMONTRIP_AUDIT_DATABASE_URL" --set=ON_ERROR_STOP=1
```

Do not run `\conninfo` or print the environment variable. Run only read-only
metadata queries:

```sql
BEGIN READ ONLY;

SELECT current_database() AS database_name,
       current_schema() AS current_schema,
       current_schemas(true) AS effective_search_path;

SELECT n.nspname AS schema_name,
       c.relname AS table_name,
       a.attnum AS ordinal_position,
       a.attname AS column_name,
       format_type(a.atttypid, a.atttypmod) AS column_type,
       a.attnotnull AS not_null,
       pg_get_expr(d.adbin, d.adrelid) AS default_expression
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY c.relname, a.attnum;

SELECT conrelid::regclass AS table_name, conname AS constraint_name,
       contype AS constraint_type, pg_get_constraintdef(oid) AS definition,
       convalidated AS validated
FROM pg_catalog.pg_constraint
WHERE connamespace = 'public'::regnamespace
ORDER BY conrelid::regclass::text, conname;

SELECT tablename, indexname, indexdef
FROM pg_catalog.pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

SELECT c.relname AS table_name, t.tgname AS trigger_name,
       pg_get_triggerdef(t.oid, true) AS definition
FROM pg_catalog.pg_trigger t
JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal
ORDER BY c.relname, t.tgname;

SELECT to_regclass('public.lemontrip_website_schema_migrations') AS website_ledger,
       to_regclass('public.lemontrip_mobile_schema_migrations') AS mobile_ledger,
       to_regclass('public.schema_migrations') AS legacy_ledger;

SELECT format('SELECT version, applied_at FROM %s ORDER BY version', ledger)
FROM (VALUES
  (to_regclass('public.lemontrip_website_schema_migrations')),
  (to_regclass('public.lemontrip_mobile_schema_migrations')),
  (to_regclass('public.schema_migrations'))
) AS ledgers(ledger)
WHERE ledger IS NOT NULL
\gexec

COMMIT;
```

For each ledger reported as present, select only `version` and `applied_at`.
Compare its versions to the corresponding migration filenames in:

- `db/migrations/` for the website backend.
- `../LemonTrip_Mobile_app_backend/migrations/` for the mobile backend.

The current source inventories are website `001`–`005` and mobile `001`–`006`.
These are source files, not a claim that any version is applied. Check the
expected tables explicitly: `users`, `travel_packages`, `blog_posts`,
`visa_services`, `visa_applications`, `bookings`, `travel_bookings`,
`flight_bookings`, `bus_bookings`, `user_sessions`, `oauth_accounts`,
`otp_verifications`, and `email_verifications`. Report metadata and aggregate
counts only. Never select names, emails, phone numbers, passport fields,
document paths, tokens, or document contents.

If before/after data-preservation counts are needed in staging, capture only
`count(*)` per relevant table and aggregate orphan counts after schema
validation. Do not use those counts as a substitute for key/relationship
checks.

## Source migration reconciliation

The runners use separate ledgers (`lemontrip_website_schema_migrations` and
`lemontrip_mobile_schema_migrations`) and the same advisory lock. The lock
serializes runners; it does not make their histories equivalent. Both runners
stop when they find an existing schema without their own ledger unless an
adoption override is passed. Do not use that override to bypass inspection.

Source overlap and risks:

- Website `001_catalog_tables.sql` and mobile `006_shared_website_catalog_auth.sql`
  both define `blog_posts`, `travel_packages`, and `visa_services`, plus their
  indexes. `IF NOT EXISTS` skips creation; it does not reconcile drifted
  columns, nullability, or constraints.
- Website schema bootstrap and mobile `001`/`002`/`005`/`006` all affect
  `users`. The mobile history adds normalized email/phone uniqueness, profile
  and verification fields, account status, platform, OAuth/session tables,
  website Google fields, and the name synchronization trigger.
- Website `003_visa_applications.sql` references `visa_services` and `users`;
  it is absent from the mobile runner. Mobile bookings use a separate `bookings`
  shape, while website booking/payment tables are declared in its legacy
  `db/schema.sql` bootstrap.
- Mobile `003_catalog_content.sql` and `004_dynamic_catalog.sql` insert demo
  content. Do not replay those migrations against production as a seeding step.
- Website `db/schema.sql` has many unversioned `CREATE`/`ALTER` statements,
  sample rows, and constraint replacement operations. It must be reconciled
  separately from the versioned website runner.
- The mobile shared-catalog migration tests and backend tests use PGlite/mocks;
  they do not show what exists in Render.

### Numbered reconciliation plan

1. Retain every existing table, key, row, ID, trigger, and relationship. Export
   metadata and record aggregate counts from a protected staging clone before
   preparing DDL. Do not alter production during this step.
2. Compare both ledgers with their files and compare every shared object's
   columns, constraints, indexes, defaults, and triggers with source. Resolve
   missing objects and drift in staging with additive changes. Preserve
   website `users`, mobile auth/session tables, normalized catalog tables,
   visa applications, and both booking models where present.
3. Resolve definitions before adopting a baseline. In particular, reconcile
   the two `users` histories, confirm catalog definitions and visa foreign
   keys, and decide whether the legacy `content_items` records remain as
   inactive compatibility data. Keep development/demo content out of future
   production migrations.
4. After an operator-reviewed exact-object comparison, record verified applied
   website migration versions in the canonical ledger with original/approved
   timestamps. Keep the mobile ledger as audit evidence; do not mark a file
   applied merely because its filename exists. Add checksums to future ledger
   entries as part of the consolidation work.
5. Choose the website backend migration runner as the canonical owner only
   after steps 1–4 pass in staging. Move the mobile auth/session DDL and
   required mobile booking DDL into that canonical history, then disable the
   mobile migration command in deployment. The mobile service should use the
   shared schema, not independently evolve it.
6. Apply one ordered migration stream to a fresh staging database, then to a
   staging copy of the existing schema. Verify identity, ledger versions,
   table/column metadata, constraints, indexes, triggers, aggregate counts,
   and foreign-key orphan counts before and after. Production deployment
   requires a backup and separate explicit authorization.
7. If deployment fails, roll back application versions first and leave additive
   schema in place where safe. Restore the verified pre-migration snapshot
   only under the approved recovery plan; then verify IDs and relationships
   before reopening traffic. Avoid hand-written reverse DDL for populated
   tables.

### Blog publication migration prepared

`005_blog_publication_status.sql` is additive and is not applied here. Existing
posts default to `published`, preserving the current public behavior; an
operator/content owner should review that classification in staging and
identify any known drafts before production rollout. New and edited posts can
be explicitly saved as drafts in admin. Both public APIs filter drafts. Apply
the schema migration before deploying code that selects the new column.

## Authentication findings and staging rollout

Both services use `jsonwebtoken` with the default HMAC SHA-256 signing
algorithm. Website legacy tokens contain `id` and `email` and last seven days;
they have no `sid` and cannot be revoked centrally. Mobile access tokens use
`sub`, `sid`, and `platform`, last 15 minutes, and are backed by revocable
`user_sessions`; refresh credentials are stored as hashes. Middleware now
maps `id`/`sub` to the shared UUID and validates `sid` when present. A token
is only cross-verifiable if both services use the exact same secret. The local
backend configuration values were checked without printing them and do not
match. Website admin authorization remains an email allowlist; mobile-issued
tokens do not carry an admin email claim and do not grant admin access.

Staging rollout: configure a shared secret through each service's secret
manager, confirm the same algorithm and intended issuer/audience policy, and
test both token formats before enabling cross-service calls. Do not replace
the current website secret in place: preserve the old verification key during
a bounded transition (dual verification or session re-authentication), set a
short cutoff for legacy tokens, and revoke/expire them only after user impact
and rollback are reviewed. Legacy website tokens remain non-revocable until
they are replaced by shared sessions.

## Staging integration test plan

No isolated staging PostgreSQL endpoint was identified, so these tests are
prepared but not run. Use unique disposable IDs and clean up only rows created
by the test after recording pass/fail; never run this against production.

1. Register/log in through each client; assert one shared UUID and consistent
   normalized email/profile. Verify duplicate normalized email/phone handling.
2. Verify each backend accepts the other backend's test JWT, maps `id`/`sub` to
   the same UUID, rejects expired tokens, and rejects revoked `sid` sessions.
   Confirm legacy website tokens are handled only during the planned window.
3. Create/update a package through admin; compare website detail and mobile
   content responses, including numeric and formatted pricing.
4. Create a draft blog through admin; assert it is absent from website and
   mobile public lists/details. Publish it and assert consistent visibility.
5. Compare visa service IDs and optional image, fee, and document fields from
   both client APIs.
6. Submit a visa application through mobile, fetch history and tracking as its
   owner, and verify another user's history/tracking/document URL requests are
   denied. Verify authorized admin review/document access separately.
7. Run the canonical migration stream on a fresh disposable database and a
   staging copy of the existing schema. Verify ledgers, schema metadata, and
   aggregate counts; compare primary-key and foreign-key relationships before
   and after to confirm records and IDs remain intact.
