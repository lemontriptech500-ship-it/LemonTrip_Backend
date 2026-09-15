import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const configDirectory = path.dirname(fileURLToPath(import.meta.url))
const loadedEnv = dotenv.config({ path: path.resolve(configDirectory, '../../.env') }).parsed || {}

function getEnv(name) {
  return process.env[name] || loadedEnv[name] || ''
}

const requiredInProduction = ['DATABASE_URL', 'JWT_SECRET', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET']
const configuredGoogleClientId = getEnv('GOOGLE_CLIENT_ID')
const configuredAdminEmails = getEnv('ADMIN_EMAILS')

if (getEnv('NODE_ENV') === 'production') {
  const missing = requiredInProduction.filter((key) => !getEnv(key))
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
}

export const env = {
  nodeEnv: getEnv('NODE_ENV') || 'development',
  port: Number(getEnv('PORT') || 5000),
  newsletterUnsubscribeBaseUrl: getEnv('NEWSLETTER_UNSUBSCRIBE_BASE_URL') || `http://localhost:${Number(getEnv('PORT') || 5000)}/api/v1/newsletter`,
  databaseUrl: getEnv('DATABASE_URL'),
  jwtSecret: getEnv('JWT_SECRET') || 'development-only-secret',
  googleClientId: configuredGoogleClientId.startsWith('replace-with-') ? '' : configuredGoogleClientId,
  razorpayKeyId: getEnv('RAZORPAY_KEY_ID'),
  razorpayKeySecret: getEnv('RAZORPAY_KEY_SECRET'),
  aiApiKey: getEnv('AI_API_KEY'),
  aiBaseUrl: getEnv('AI_BASE_URL') || 'https://api.openai.com/v1',
  aiModel: getEnv('AI_MODEL') || 'gpt-4o-mini',
  aiTimeoutMs: Number(getEnv('AI_TIMEOUT_MS') || 45000),
  hotelbedsApiKey: getEnv('HOTELBEDS_API_KEY'),
  hotelbedsApiSecret: getEnv('HOTELBEDS_API_SECRET'),
  hotelbedsEnvironment: getEnv('HOTELBEDS_ENVIRONMENT') || 'test',
  hotelbedsBaseUrl: getEnv('HOTELBEDS_BASE_URL'),
  hotelbedsContentBaseUrl: getEnv('HOTELBEDS_CONTENT_BASE_URL'),
  hotelbedsMtlsCert: getEnv('HOTELBEDS_MTLS_CERT'),
  hotelbedsMtlsKey: getEnv('HOTELBEDS_MTLS_KEY'),
  hotelbedsMtlsCa: getEnv('HOTELBEDS_MTLS_CA'),
  hotelbedsTimeoutMs: Number(getEnv('HOTELBEDS_TIMEOUT_MS') || 15000),
  hotelbedsPaymentType: getEnv('HOTELBEDS_PAYMENT_TYPE'),
  irctcApiKey: getEnv('IRCTC_API_KEY'),
  irctcApiSecret: getEnv('IRCTC_API_SECRET'),
  irctcBaseUrl: getEnv('IRCTC_BASE_URL'),
  irctcEnvironment: getEnv('IRCTC_ENVIRONMENT') || 'mock',
  irctcTimeoutMs: Number(getEnv('IRCTC_TIMEOUT_MS') || 10000),
  resendApiKey: getEnv('RESEND_API_KEY'),
  newsletterFromEmail: getEnv('NEWSLETTER_FROM_EMAIL') || 'LemonTrip <onboarding@resend.dev>',
  adminEmails: configuredAdminEmails.split(',').map((email) => email.trim().toLowerCase()).filter(Boolean),
  smtpHost: getEnv('SMTP_HOST'),
  smtpPort: Number(getEnv('SMTP_PORT') || 587),
  smtpSecure: getEnv('SMTP_SECURE') === 'true',
  smtpUser: getEnv('SMTP_USER'),
  smtpPassword: getEnv('SMTP_PASSWORD'),
  contactCompanyEmail: getEnv('CONTACT_COMPANY_EMAIL') || 'lemontripindia@gmail.com',
  contactFromEmail: getEnv('CONTACT_FROM_EMAIL') || getEnv('SMTP_USER'),
  frontendUrls: [
    getEnv('FRONTEND_URL') || 'http://localhost:3000',
    getEnv('VERCEL_FRONTEND_URL') || 'https://lemon-trip-frontend-2563.vercel.app',
  ],
}

if (env.nodeEnv !== 'test' && (!env.razorpayKeyId || !env.razorpayKeySecret)) {
  console.warn('Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in backendLemonTrip/.env before using payments.')
}
