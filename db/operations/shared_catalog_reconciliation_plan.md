# Shared catalogue reconciliation plan

## Status and scope

Preparation only. No database was contacted, no migration was run, and no
ledger or production configuration was changed. The migration candidate is
under `db/operations/migrations/`, outside the website runner's watched
`db/migrations/` directory. This is deliberate: adding a file to the watched
directory could make the website startup runner apply it automatically.

The inspected database environment has not been independently identified as
staging or production. Confirm the Render service/environment before running
either validation script. Start in staging with a recent restorable backup.

## Candidate migration operations and impact

Candidate: `db/operations/migrations/006_shared_catalog_reconciliation.sql`.
It runs transactionally when explicitly run as a reviewed script. Any failed
precondition aborts the transaction. It never deletes rows.

| Operation | Purpose | Possible impact |
|---|---|---|
| Initial `DO` preflight | Require the three existing tables; reject oversized visa text, missing required visa values, invalid package category/price, or unsupported blog statuses | Stops before DDL with counts/action when data needs owner review; no data changes |
| Add blog `publication_status` with `NOT NULL DEFAULT 'published'` | Preserve the old public visibility behavior for existing records and give new rows the API-compatible default | Existing rows are classified as published. Review the pre-migration ID/title list with the content owner first; the old schema cannot identify intended drafts |
| Backfill null blog statuses and add/validate check | Enforce only `draft`/`published` | Nulls become published; unexpected values abort earlier. Constraint validation scans the table and takes a lock |
| Create blog indexes | Support public published ordering and existing ordering queries | Index build takes a table lock; catalogue is expected to be small, but schedule during a quiet window |
| Narrow visa text columns to source lengths | Align `id`, `country`, `visa_type`, `processing_time`, and `starting_from` with source definitions | Preflight prevents truncation due to overlength values; dependent foreign keys can still cause PostgreSQL to reject the type change, in which case stop and plan FK coordination |
| Require visa descriptive fields | Match source NOT NULL rules for id/country/type/processing/starting price | Existing null `processing_time` or `starting_from` causes an abort. The script does not invent business values. Get owner-approved values per ID, update through a separately reviewed data repair, then rerun |
| Normalize visa `documents` and `created_at` | Replace NULL documents with an empty array; add timestamp/default if absent | NULL documents become `{}`. If `created_at` is absent, existing rows receive migration-time `NOW()`; this is a reconciliation timestamp, not historical creation time |
| Create visa country index | Match source lookup index | Brief lock/index build |
| Add/validate package checks and category default | Enforce `national`/`international` and positive price; keep the existing category default | Existing invalid rows stop the migration. No values are guessed |
| Drop package `price_amount` default | Remove the conflicting zero default while retaining positive-price integrity | Inserts omitting price fail instead of silently defaulting to invalid zero. Website admin create/update SQL explicitly supplies validated `price_amount` |
| Add/fill package `created_at` and create indexes | Match API ordering and source schema | If missing, all existing rows receive reconciliation-time `NOW()`; this is not their historical creation time. Index builds take locks |

The candidate uses `CREATE INDEX` (not `CONCURRENTLY`) because the website
migration runner wraps each migration in a transaction. Use a quiet maintenance
window. The migration is idempotent for columns, constraints, and indexes, but
it is still a one-time reviewed operation, not a substitute for ledger
reconciliation.

## Preflight decisions required

Run `pre_shared_catalog_reconciliation.sql` read-only and save its aggregate
counts and schema output. Review the blog ID/title/date list with the content
owner. Since all existing posts were public before this column existed, the
candidate defaults them to published; if any should be drafts, agree on an
ID-specific status mapping before migration and adapt the candidate explicitly.

For visa rows, resolve each missing required `processing_time` or
`starting_from` using owner-approved catalog values. NULL `documents` is
losslessly normalized to an empty list. Confirm overlength IDs/labels are
resolved without truncation. For packages, resolve invalid category or
non-positive/missing amounts from authoritative catalogue data; the migration
aborts until resolved. Do not copy example/test data into the live catalogue.

The preflight script returns IDs and catalogue fields only, not customer
records or credentials. Record the exact row counts and IDs in the change
ticket so post-verification can establish that all records remain present.

## API compatibility reviewed

| API query | Relevant SQL dependency | Expected result with candidate schema |
|---|---|---|
| Website public blogs | `blogController.js`: selects `publication_status`, filters published list and ID detail | Column/check/index exist; draft detail remains filtered from public API |
| Website admin blogs | `adminController.js`: selects/inserts/updates `publication_status` | Compatible; default preserves old create behavior |
| Mobile public blogs | `routes/content.ts`: filters `publication_status='published'`, orders by `published_at, created_at` | Compatible; missing-column 503 should no longer occur |
| Website public visa services | `visaController.js`: selects id/country/type/processing/start/image/documents; orders by country | Compatible; image remains nullable, documents becomes non-null array |
| Mobile public visa services | `routes/content.ts`: same selected fields; orders by country/type | Compatible |
| Website public packages | `packageController.js`: selects descriptive columns; orders by `created_at` | Compatible |
| Mobile public packages | `routes/content.ts`: selects category/highlights and orders by `created_at, id` | Compatible |
| Website admin packages | `adminPackageController.js`: explicitly inserts/updates category, amount, currency | Compatible with removed price default because amount is explicitly supplied and validated |
| Website AI chat / payments / wallet | `services/aiChatService.js`, `paymentController.js`, `walletController.js`: read package amount/currency | Compatible; amount remains numeric and positive |

No mobile or website API SQL requires `visa_services.created_at`; it is added
to match the source schema and future use. Review migration dependencies before
changing `visa_services.id` if a live visa-application foreign key references
it; PostgreSQL may reject the type change, safely aborting rather than
silently breaking the relationship.

## Migration ownership recommendation

Make the website backend the sole owner of shared catalogue schema migrations
(`blog_posts`, `visa_services`, `travel_packages`) and the corresponding
authoritative ledger. The mobile backend should consume these tables through
its API/database role but must not create or evolve their schema. Its existing
`006_shared_website_catalog_auth.sql` overlaps these definitions; do not run
it as a shared-catalog migration. Before adopting this policy, separately
review its auth changes and split/retire its catalogue DDL without rewriting
applied history. Keep mobile-owned user/auth tables under a separately agreed
ownership boundary. Do not merge or rewrite either ledger automatically.

The website runner currently auto-applies every file found in
`db/migrations/` and creates a website-specific ledger. Keep this candidate out
of that directory until the team approves the owner, environment, migration
procedure, and ledger/baseline plan. The database currently has a legacy
`schema_migrations` ledger; reconciliation of its relationship to the
namespaced ledgers is a separate reviewed change, not part of this SQL.

## Data preservation report

- Candidate operations contain no `DELETE`, `TRUNCATE`, table recreation, or
  primary-key rewrite; all existing rows remain in place.
- Expected pre-migration aggregate counts from the earlier read-only audit
  were blog posts 7, visa services 6, and packages 10. Re-run preflight and
  treat its counts as the baseline because that earlier observation may be
  stale.
- Blog existing records become `published` by default to preserve old public
  behavior. This cannot recover draft intent that was not represented in the
  old schema; content-owner review is required.
- Visa missing required business values are not backfilled with guessed text;
  the migration aborts until approved values are supplied.
- NULL visa `documents` becomes an empty array. Missing `created_at` values
  use migration time and must not be represented as historical timestamps.
- Package rows with invalid category or non-positive price cause the migration
  to abort. No price/category values are invented.
- Compare pre/post counts and IDs from the saved validation output. The
  post-script checks constraints, indexes, defaults, and zero invalid rows.

## Rollback / compensation

Do not use a destructive down migration. The migration adds status and may
backfill NULLs/timestamps/documents; dropping these fields would lose state or
erase new draft assignments. If staging reveals a problem before commit,
transaction rollback leaves the schema unchanged. If a committed migration
needs reversal, pause affected writes and prepare a separately reviewed
forward compensation: remove or adjust only the offending constraint/index,
restore the previous `price_amount` default only if the application behavior
can tolerate it, and keep all new columns/data. Do not drop `publication_status`
or delete/rewrite catalogue rows. Restore from backup only under an approved
incident recovery plan.

## Staging test plan

1. Confirm Render service identity and staging environment; verify connection
   points to the staging DB. Take/verify a restorable snapshot.
2. Run the preflight SQL read-only. Resolve and document every returned
   violation and review blog legacy visibility with the content owner.
3. Apply the candidate manually in a staging transaction using a controlled
   migration account. Do not run the mobile migration runner.
4. Run the post-verification SQL and compare all three counts and saved IDs.
5. Exercise website public blog list/detail for published and draft IDs; verify
   drafts are absent and published response envelopes are unchanged. Exercise
   admin create/update with both publication states.
6. Exercise both clients' visa and package list/detail APIs, including NULL
   image, empty documents/highlights, category filters, and ordering.
7. Exercise website package admin create/update with valid positive amount;
   verify omitted/zero amount fails validation and no row is created.
8. Verify app and website point to the same staging service and each query
   reflects the same catalogue edits. Check logs for SQL errors and latency.
9. Rehearse the compensation plan on staging and retain before/after counts,
   IDs, query output, and approval records. Only after sign-off should a
   separate production change be proposed.

## Prepared / tested / executed

- **Prepared:** candidate SQL migration, read-only preflight, read-only
  post-verification, this plan, data-preservation and compensation guidance.
- **Reviewed:** source migration definitions and the affected API query text.
- **Tested:** no database execution or integration test was authorized/performed
  for this preparation task. SQL has received static review only.
- **Executed:** no database connection, migration, write, ledger change, or
  production configuration change.
