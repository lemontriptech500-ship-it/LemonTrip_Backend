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
- `GET /api/v1/visa/services`
- `POST /api/v1/visa/applications` (Bearer token required)

Responses use the shared shape `{ success, data, error }`.

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
