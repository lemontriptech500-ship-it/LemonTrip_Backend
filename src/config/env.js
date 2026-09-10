import 'dotenv/config'

const requiredInProduction = ['DATABASE_URL', 'JWT_SECRET']

if (process.env.NODE_ENV === 'production') {
  const missing = requiredInProduction.filter((key) => !process.env[key])
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 5000),
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecret: process.env.JWT_SECRET || 'development-only-secret',
<<<<<<< HEAD
=======
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
>>>>>>> dev
  frontendUrls: [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    process.env.VERCEL_FRONTEND_URL || 'https://lemon-trip-frontend-2563.vercel.app',
  ],
}
