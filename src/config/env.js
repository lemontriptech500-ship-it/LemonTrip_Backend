import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const configDirectory = path.dirname(fileURLToPath(import.meta.url))
const loadedEnv = dotenv.config({ path: path.resolve(configDirectory, '../../.env') }).parsed || {}

function getEnv(name) {
  return process.env[name] || loadedEnv[name] || ''
}

const requiredInProduction = [
  'DATABASE_URL',
  'JWT_SECRET',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_S3_BUCKET',
]
const configuredGoogleClientId = getEnv('GOOGLE_CLIENT_ID')

if (getEnv('NODE_ENV') === 'production') {
  const missing = requiredInProduction.filter((key) => !getEnv(key))
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
}

export const env = {
  nodeEnv: getEnv('NODE_ENV') || 'development',
  port: Number(getEnv('PORT') || 5000),
  databaseUrl: getEnv('DATABASE_URL'),
  jwtSecret: getEnv('JWT_SECRET') || 'development-only-secret',
  googleClientId: configuredGoogleClientId.startsWith('replace-with-') ? '' : configuredGoogleClientId,
  razorpayKeyId: getEnv('RAZORPAY_KEY_ID'),
  razorpayKeySecret: getEnv('RAZORPAY_KEY_SECRET'),
  frontendUrls: [
    getEnv('FRONTEND_URL') || 'http://localhost:3000',
    getEnv('VERCEL_FRONTEND_URL') || 'https://lemon-trip-frontend-2563.vercel.app',
  ],
  awsRegion: getEnv('AWS_REGION') || 'eu-north-1',
  awsAccessKeyId: getEnv('AWS_ACCESS_KEY_ID'),
  awsSecretAccessKey: getEnv('AWS_SECRET_ACCESS_KEY'),
  awsS3Bucket: getEnv('AWS_S3_BUCKET'),
}

if (env.nodeEnv !== 'test' && (!env.razorpayKeyId || !env.razorpayKeySecret)) {
  console.warn('Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in backendLemonTrip/.env before using payments.')
}

if (env.nodeEnv !== 'test' && (!env.awsAccessKeyId || !env.awsSecretAccessKey || !env.awsS3Bucket)) {
  console.warn('AWS S3 is not configured. Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_S3_BUCKET in backendLemonTrip/.env before submitting visa applications.')
}