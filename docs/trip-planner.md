# LemonTrip AI Smart Trip Planner

The existing Next.js frontend serves `/trip-planner`. It calls the existing Express backend at `POST /api/v1/trip-planner` through `NEXT_PUBLIC_API_BASE_URL`. Entry points are the holiday packages page, desktop navigation's More menu, and mobile navigation.

## Configuration

Reuse server-only `GROQ_API_KEY`, `GROQ_MODEL`, optional `GROQ_BASE_URL`, and `AI_TIMEOUT_MS` from `src/config/env.js`. No new secrets or model defaults are introduced. The existing model configuration is `openai/gpt-oss-20b` unless overridden. Prefer explicitly setting `GROQ_MODEL` in the deployment environment. Request timeout is bounded to 1–90 seconds (existing default: 45 seconds).

Groq's [strict structured outputs](https://console.groq.com/docs/structured-outputs) supports the existing configurable model. If changing `GROQ_MODEL`, choose a Groq model supporting `json_schema` with `strict: true`. The service additionally validates every field before returning it; JSON syntax alone is insufficient. Itinerary responses require a completed response, sequential days, morning/afternoon/evening plans, attractions, cost categories and travel tips. Unexpected model totals or package records are discarded. The browser renders text through React, without raw HTML.

Malformed or schema-invalid output gets at most one repair attempt within the same overall timeout. Provider outages, truncated completions, rate limits and timeouts are not automatically retried.

Database access reuses server-only `DATABASE_URL` and the existing PostgreSQL pool for Supabase. The service performs only SELECTs against `travel_packages` using the existing fields: `id`, `destination`, `location`, `duration`, `description`, `image_url`, `price_amount`, `starting_price`, `currency`, `highlights`, `best_for`, `created_at`. Destination/region terms select candidates through bound parameters. Duration, indicative price per traveller and style rank candidates. Occupancy and inclusions vary, so these are recommendations, not guaranteed budget matches. No sample-package fallback, migration, RLS or catalogue changes are added. Existing detail pages use `/packages/:id`.

## Request and response

```json
{
  "preferences": {
    "destination": "Manali", "startingCity": "Delhi",
    "departureDate": "", "returnDate": "", "duration": 4,
    "travellers": 2, "budget": 15000, "style": "adventure",
    "interests": "Local food", "request": "Scenic walks and gentle adventure"
  }
}
```

Trips support 1–14 days, 1–20 travellers, whole-rupee group budgets of INR 500–10,000,000. Supply both dates or neither; inclusive dates override duration. A destination or a natural-language request is required. Explicit form values take precedence over prose; natural-language-only requests use the form defaults for duration, travellers and budget. Destination is inferred by Groq when left blank.

For single-day regeneration additionally send `dayNumber` and the previous `itinerary`; the entire previous itinerary is revalidated. Only that day is replaced. Other days, overview and tips remain unchanged; budget totals are recalculated and packages refreshed.

Response follows `{ success: true, data: { preferences, itinerary, budget, packages, packageStatus } }`. See frontend `src/services/tripPlannerService.ts` for the response contract. Errors follow the existing `{ success: false, error: { message } }` envelope, with 400/429/502/503/504 statuses as appropriate. Error details and secrets are never sent to the client. Catalogue failures preserve a valid itinerary with `packageStatus: "unavailable"`; empty results use `"available"` with no records.

Cost estimates are model suggestions with explicit assumptions, rounded to INR 100. They are unverified planning estimates, not live supplier prices. Application logic sums the five categories across days, divides by traveller count, and computes remaining/over budget. A null amount means unavailable; incomplete totals, per-person costs and remaining budget stay null. A known subtotal remains available. Catalogue prices are shown separately and never added to estimated costs. No fabricated precise fallback is used.

## Actions and limits

Full/day regeneration, edits, copy, native sharing (clipboard fallback), and a downloadable text itinerary are supported. No compatible saved-itinerary store exists, so account-based saving is not added. Downloads save only on the user's device. Enquiries reuse the real `/contact` workflow via a prefilled `ContactForm`, not the mock lead service. The user reviews and submits the enquiry; no booking is created. Long enquiry messages are capped at the contact form's existing limit; the full itinerary remains downloadable.

Planner requests are limited to five per minute per IP, one concurrent request per IP and 20 concurrent requests per process. Expired rate entries are removed. These limits are in-memory; a shared limiter and correctly configured trusted proxy are needed for consistent per-client limits across multiple instances behind a proxy. No authentication, payments, wallet or chatbot flows change.

## Verification

Run backend `node --test tests/tripPlanner.test.js` and `npm test`. In the frontend run `npx tsc --noEmit --incremental false`, `npm run lint`, and `npm run build`. A live check requires network access and configured Groq/Supabase credentials; do not call `connectDatabase()` for verification because existing startup code performs unrelated schema writes. Use the pool directly for read-only checks.

Manual browser checks: open `/trip-planner` at 375px, 768px and desktop widths; generate; regenerate a day; verify other days and preferences remain; edit and regenerate; expand daily costs; copy/share/download; follow package links; verify missing images; open enquiry and review the prefilled text. Do not submit a test enquiry against production without authorisation.

### Implementation verification

- Focused planner suite: **10/10 passed**. Includes validation, response schema, budget arithmetic, single-day preservation, bounded schema repair, catalogue empty/failure cases, rate limits, provider failures and timeout handling.
- Full backend suite: **75/79 passed**. Four unrelated failures remain: Google linking an existing local account, the unknown-Google-identity error wording, and two migration tests expecting six queries where nine occur. The relevant authentication and migration implementation was not changed by this feature.
- Frontend TypeScript check and production build passed. Whole-project lint passed with 11 warnings in existing blog/hotel/offer files; lint on changed files passed without warnings.
- Live HTTP checks passed for a four-day itinerary, budget arithmetic, one-day regeneration preserving the other days, and real Supabase matching. The catalogue schema and count (13 packages) were verified read-only.
- Installed headless Chrome: checked forms and generated results at **375px, 768px and 1440px**, with no horizontal overflow. Browser-driven generation/regeneration, package detail links, prefilled enquiry and absence of runtime exceptions were checked. During local browser checks, the frontend's planner request was forwarded to the local Express app using CDP interception; the app used live Groq and Supabase. This does not verify deployed CORS/proxy configuration. The enquiry was not submitted. Native share/clipboard permissions and actual download completion were not automated.
- No deployment, schema changes, catalogue writes or real booking/enquiry submission were performed.

### Feature files

Backend paths relative to `website/backendLemonTrip`:

- `src/app.js` — register the endpoint.
- `src/routes/tripPlannerRoutes.js` — HTTP envelope, request/concurrency limits and safe errors.
- `src/services/tripPlannerService.js` — validation, Groq generation, budget arithmetic and catalogue matching.
- `tests/tripPlanner.test.js` — ten focused tests.
- `docs/trip-planner.md` — configuration, API contract and verification notes.

Frontend paths relative to `website/frontendLemonTrip`:

- `src/app/trip-planner/page.tsx` — route and metadata.
- `src/components/planner/TripPlanner.tsx` — preference form, results and actions.
- `src/services/tripPlannerService.ts` — request/response types and itinerary export.
- `src/components/contact/ContactForm.tsx` — optional initial subject/message for enquiries.
- `src/components/layout/DesktopNavigation.tsx` — desktop entry.
- `src/constants/index.ts` — mobile navigation entry.
- `src/app/packages/page.tsx` — holiday-page entry.

The build also refreshed the already-modified frontend `tsconfig.tsbuildinfo` cache. Existing unrelated working-tree changes were retained.
