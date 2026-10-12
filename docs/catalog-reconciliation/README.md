# Catalogue reconciliation artifacts

These files are reviewed staging artifacts. They are not a production deployment, and nothing here authorizes or performs a Render production change. Use a disposable/staging PostgreSQL database only. Run all three scripts in one `psql` session with `ON_ERROR_STOP` so the temporary preservation snapshot remains available:

```sh
psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f 00-pre-migration-validation.sql \
  -f 01-forward-migration-plan.sql \
  -f 02-post-migration-verification.sql
```

## Business decisions and data policy

### Blog visibility

The legacy `blog_posts` schema has no publication-status column or other dependable field that distinguishes a draft from a published post. Earlier website behavior queried every row publicly, but that is not evidence that every current row is approved for public display. Therefore **the migration never classifies existing rows automatically**. Preflight reports statusless rows; migration stops if any exist. A content owner must classify each row explicitly as `draft` or `published` in staging after review, then rerun. Do not infer status from title, date, or legacy public-query behavior. On an empty blog table the new-column default is `published` for future application inserts; admin code should provide explicit status.

### Visa values

No visa row values are fabricated or overwritten. Preflight reports NULL and blank counts for `id`, `country`, `visa_type`, `processing_time`, and `starting_from`, as well as NULL `documents` and `created_at`. Migration stops if any required value is NULL/blank, if documents or creation time is NULL, or if required strings exceed target widths. Resolve values with the data owner before applying. Do not use `Not specified`, an empty array, or the current timestamp as an automatic substitute. `image_url` is optional and may remain NULL. The migration adds nonblank checks for the five required text fields.

### Package timestamp and currency

`created_at` and `currency` are treated as required by the reconciled schema. Preflight reports affected rows; migration stops if either is NULL/blank. A data owner must approve and apply any value remediation first. Historical creation times must not be guessed. The migration sets defaults for future inserts only, enforces NOT NULL, and rejects blank currency values. `price_amount` has no default after migration because zero violates its positive-price rule; admin APIs already provide an explicit positive amount.

### Intentional schema changes

There are no catalogue data backfills in the forward migration. Schema-only changes are: add `publication_status` (without assigning existing-row values), set its future-insert default to `published`, narrow visa text columns after value checks, enforce visa/package nullability and nonblank/status/category/price checks, set safe defaults for future inserts, remove the contradictory package zero-price default, and reconcile indexes. No primary key or existing meaningful value is changed by the script.

## Running and interpreting validation

`00-pre-migration-validation.sql` prints explicit PASS/WARN/FAIL prerequisites, source types, aggregate NULL/blank/invalid counts, constraint and index metadata, row counts, and primary-key sets. It creates only a session-local temporary baseline table. A WARN for statusless blogs, visa data, or package NULLs is a stop condition until an owner decision/remediation has been recorded. A missing source table/column or incompatible type is FAIL.

`01-forward-migration-plan.sql` is one transaction and raises an exception before committed schema changes for unresolved business data, missing columns, invalid prices/categories, conflicting price checks, or same-name conflicting indexes. Apply only after reviewing preflight and recording approved manual remediation. The positive-price check is detected by its expression, regardless of constraint name; a duplicate or incompatible price check stops the migration.

`02-post-migration-verification.sql` prints PASS/FAIL checks for schema constraints/defaults, data validity, indexes, row counts, and primary-key equality. Any FAIL blocks release. It must run in the same `psql` session as preflight so it can compare the temporary snapshot.

The indexes required by website/mobile queries are blog `published_at DESC` and the published partial ordering index, visa `country`, package `created_at DESC`, and package `category`. API compatibility still requires running the website and mobile catalogue endpoints against the migrated staging database, including admin package creation and blog publication/filtering.

## Staging sequence

1. Create an isolated disposable PostgreSQL database from a schema/data snapshot with personal data excluded, or construct a synthetic fixture. Confirm the connection target is staging before connecting.
2. Run preflight and retain its PASS/WARN/FAIL output. Resolve each WARN through explicit content/data-owner decisions; never include sensitive row values in reports.
3. Run migration and postflight in the same `psql` session. Record statements, timing, output, counts, and PK preservation results.
4. Exercise negative writes for invalid blog status, visa blank required values, invalid package category, and nonpositive package price. Exercise website admin package creation and blog status update/filtering, website list/detail endpoints, and mobile blog/visa/package reads.
5. Reconcile the website/mobile/legacy migration ledgers separately. These artifacts do not alter or adopt a ledger. Keep one canonical owner for shared catalogue DDL.

No production database is claimed to be fixed. Production readiness requires successful staging validation, API smoke tests, explicit business decisions for all reported existing data, and separate release approval.
