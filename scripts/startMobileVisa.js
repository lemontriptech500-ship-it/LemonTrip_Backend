import { readFile } from 'node:fs/promises'
import dotenv from 'dotenv'

// The local Expo app signs in through the mobile account API. Its visa API
// must verify the same tokens without changing the website's own .env file.
const mobileEnvUrl = new URL('../../../lemonTripApp/LemonTrip_Mobile_app_backend/.env', import.meta.url)
const mobileEnv = dotenv.parse(await readFile(mobileEnvUrl, 'utf8'))
if (!mobileEnv.JWT_SECRET || !mobileEnv.DATABASE_URL) {
  throw new Error('Configure JWT_SECRET and DATABASE_URL in the mobile account backend .env first.')
}
process.env.JWT_SECRET = mobileEnv.JWT_SECRET
process.env.DATABASE_URL = mobileEnv.DATABASE_URL
process.env.NODE_ENV = 'development'
process.env.PORT = process.env.PORT || '5000'
await import('../src/server.js')
