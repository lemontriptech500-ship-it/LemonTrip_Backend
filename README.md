# LemonTrip Backend

Beginner-friendly Express API for the LemonTrip OTA platform.

## Setup

1. Copy `.env.example` to `.env` and update `DATABASE_URL` and `JWT_SECRET`.
2. Install dependencies:

```bash
npm install
```

3. Create the starter database tables using `db/schema.sql`.
4. Start the development server:

```bash
npm run dev
```

The API runs at `http://localhost:5000` by default.

## Endpoints

- `GET /health`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `GET /api/v1/flights/search`
- `GET /api/v1/flights/:flightId`
- `GET /api/v1/visa/services`
- `POST /api/v1/visa/applications` (Bearer token required)

Responses use the shared shape `{ success, data, error }`.
