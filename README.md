# LemonTrip Backend

Beginner-friendly Express API for the LemonTrip OTA platform.

## Setup

1. Copy `.env.example` to `.env` and update `DATABASE_URL`, `JWT_SECRET`, and `GOOGLE_CLIENT_ID` (see below).
2. Install dependencies:

```bash
npm install
```

3. Create the starter database tables using `db/schema.sql` (safe to re-run — it
   `ALTER`s existing tables to add the Google auth columns if they're missing).
4. Start the development server:

```bash
npm run dev
```

The API runs at `http://localhost:5000` by default.

## Google Sign-In setup

1. Google Cloud Console → APIs & Services → Credentials → **Create OAuth
   client ID** (Web application).
2. Add your frontend origin (e.g. `http://localhost:3000`) under **Authorized
   JavaScript origins**.
3. Copy the **Client ID** into `.env` as `GOOGLE_CLIENT_ID`.
4. Copy the same Client ID into the frontend's `.env.local` as
   `NEXT_PUBLIC_GOOGLE_CLIENT_ID`:

```env
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

5. On the frontend, Google Identity Services gets a credential and posts it
   here:

```bash
curl -X POST http://localhost:5000/api/v1/auth/google \
  -H "Content-Type: application/json" \
  -d '{"idToken":"<google-id-token-from-frontend>"}'
```

The server verifies the token's signature, audience, and expiry via
`google-auth-library`. If the email already has a local (password) account,
Google gets linked to it instead of creating a duplicate user. If someone
who signed up with Google tries `/auth/login` with a password, they get a
clear "use Google Sign-In" message instead of a confusing failure.

Restart both development servers after changing either environment file.
The Google button is present but disabled while the client ID is still the
placeholder value. No redirect URI is required for this Google Identity
Services button; authorize the frontend URL under **Authorized JavaScript
origins** instead.

## Endpoints

- `GET /health`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/google`
- `GET /api/v1/auth/me` (Bearer token required)
- `GET /api/v1/flights/search`
- `GET /api/v1/flights/:flightId`
- `GET /api/v1/blog`
- `GET /api/v1/blog/:postId`
- `GET /api/v1/packages/search`
- `GET /api/v1/packages/:packageId`
- `GET /api/v1/hotels/search`
- `GET /api/v1/hotels/:hotelId`
- `GET /api/v1/buses/search`
- `GET /api/v1/buses/:busId`
- `POST /api/v1/payments/razorpay/flights/order`
- `POST /api/v1/payments/razorpay/flights/verify`

### Razorpay setup

Add Razorpay test or live credentials to the backend `.env` file:

```env
RAZORPAY_KEY_ID=rzp_test_your_key_id
RAZORPAY_KEY_SECRET=your_razorpay_secret
```

The flight payment flow creates the order on the server using the selected fare,
opens Razorpay Checkout in the frontend, verifies the returned signature on the
server, and confirms the booking only after verification. Card and UPI details
are handled by Razorpay Checkout and are not stored by LemonTrip.
- `GET /api/v1/visa/services`
- `POST /api/v1/visa/applications` (Bearer token required)
- `POST /api/v1/newsletter/subscribe`
- `POST /api/v1/newsletter/unsubscribe`
- `GET /api/v1/newsletter/unsubscribe?token=...` (signed email unsubscribe link)
- `POST /api/v1/newsletter/send` (Bearer token for an email listed in `ADMIN_EMAILS`)
- `POST /api/v1/contact`

Responses use the shared shape `{ success, data, error }`.

### Resend newsletter setup

Create a Resend account, verify the sending domain, and configure these backend
variables. Keep `RESEND_API_KEY` server-side and never add it to frontend
environment variables:

```env
RESEND_API_KEY=re_your_server_key
NEWSLETTER_FROM_EMAIL=LemonTrip <news@your-verified-domain.com>
NEWSLETTER_UNSUBSCRIBE_BASE_URL=https://api.example.com/api/v1/newsletter
ADMIN_EMAILS=admin@example.com
ADMIN_FRONTEND_URL=https://your-admin.vercel.app
```

The admin endpoint accepts `{ "subject": "...", "content": "<p>...</p>" }`.
Each active subscriber receives an individual email with a signed, expiring
unsubscribe link. Unsubscribed records are retained and excluded from future
send jobs.

For a safe one-recipient Resend smoke test, configure a dedicated inbox—not an
operator or customer address:

```env
NEWSLETTER_TEST_RECIPIENT=lemontrip-newsletter-test@example.com
```

`POST /api/v1/newsletter/send-test` requires the same admin bearer token and
body as `/send`, but accepts no recipient field. It sends exactly one email to
the environment-configured address, prefixes the subject with `[TEST]`, and
returns its signed unsubscribe URL for the authenticated admin to verify. It
never reads or sends to the active-subscriber list. The test recipient is
reactivated so clicking that signed link can verify the unsubscribe database
update; use a dedicated address because this changes that address's subscriber
state.

### Groq travel assistant setup

The chat endpoint keeps its existing `POST /api/v1/chat` request and response
shape. It uses Groq server-side and can call read-only tools for LemonTrip's
flight, bus, and package inventory in PostgreSQL, plus configured Hotelbeds and
IRCTC search services. It never sends credentials or user booking details to
the model.

```env
GROQ_API_KEY=gsk_your_server_key
# Optional; the default is openai/gpt-oss-20b on Groq.
GROQ_MODEL=openai/gpt-oss-20b
```

`GROQ_API_KEY` must stay in the backend environment only—do not use a
`NEXT_PUBLIC_` variable. When a supplier is not configured, is in mock/test
mode, or cannot return a result, the assistant says that availability is not
verified instead of making up inventory, prices, or booking details.

## Testing

```bash
npm test
```

Uses Node's built-in test runner (`node --test`, no extra test framework) +
`supertest`. The database (`pool.query`) and Google token verification
(`googleAuthService.verifyIdToken`) are mocked with `node:test`'s built-in
`t.mock`, so tests run without a real Postgres connection or network access.

Covered in `tests/`:
- `auth.register.test.js` — success, duplicate email (409), weak password (400), no password hash leaked
- `auth.login.test.js` — success, wrong password, unknown email, Google-only account guidance, missing fields
- `auth.google.test.js` — new user creation, existing Google user (no duplicate insert), linking Google to an existing local account, invalid/expired token, missing idToken
- `auth.me.test.js` — valid token, missing header, invalid token, valid token for a deleted user
- `health.test.js` — health check and 404 handling

> **Note:** this was built in a sandboxed environment without internet or
> database access, so `npm install` / `npm test` couldn't actually be run
> here. Every file was syntax-checked (`node --check`) and the tests were
> written to cover each success/error branch — please run
> `npm install && npm test` locally before merging, and ping me if anything
> needs fixing.
