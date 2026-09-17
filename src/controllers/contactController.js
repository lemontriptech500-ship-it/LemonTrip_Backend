import { pool } from '../config/db.js'
import { sendContactEmail } from '../services/smtpService.js'
import { sendEmail } from '../services/emailService.js'
import { env } from '../config/env.js'

const windows = new Map()
const WINDOW_MS = 60_000
const MAX_REQUESTS = 5
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const phonePattern = /^[+\d][\d\s().-]{6,29}$/

function text(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function validate(body = {}) {
  const data = {
    name: text(body.name, 120),
    email: text(body.email, 255).toLowerCase(),
    phone: text(body.phone, 30),
    subject: text(body.subject, 200),
    message: text(body.message, 5000),
  }
  if (!data.name || data.name.length < 2) return { error: 'Enter your name.' }
  if (!emailPattern.test(data.email)) return { error: 'Enter a valid email address.' }
  if (!phonePattern.test(data.phone)) return { error: 'Enter a valid phone number.' }
  if (!data.subject || data.subject.length < 3) return { error: 'Enter a subject.' }
  if (!data.message || data.message.length < 10) return { error: 'Message must be at least 10 characters.' }
  return { data }
}

function allowed(request) {
  const key = request.ip || 'unknown'
  const now = Date.now()
  const current = windows.get(key)
  if (!current || now - current.startedAt >= WINDOW_MS) {
    windows.set(key, { startedAt: now, count: 1 })
    return true
  }
  current.count += 1
  return current.count <= MAX_REQUESTS
}

export function resetContactRateLimit() {
  windows.clear()
}

function buildContactHtml({ name, email, phone, subject, message }) {
  return `<h2>New LemonTrip contact message</h2><p><strong>Name:</strong> ${name}</p><p><strong>Email:</strong> ${email}</p><p><strong>Phone:</strong> ${phone}</p><p><strong>Subject:</strong> ${subject}</p><hr><p>${message.replaceAll('\n', '<br>')}</p>`
}

// Resend talks HTTPS (port 443), which works reliably on Render/Heroku/etc.
// Raw SMTP (port 587/465) is frequently blocked or throttled on those platforms,
// which is why SMTP alone can hang in production while working fine locally.
// We try Resend first, and only fall back to SMTP if Resend isn't configured
// or fails for some reason.
async function deliverContactEmail(data) {
  const html = buildContactHtml(data)
  const errors = []

  if (env.resendApiKey) {
    try {
      await sendEmail({
        to: env.contactCompanyEmail,
        subject: `[LemonTrip Contact] ${data.subject}`,
        html,
      })
      return { provider: 'resend' }
    } catch (error) {
      errors.push({ provider: 'resend', message: error.message })
    }
  }

  try {
    await sendContactEmail(data)
    return { provider: 'smtp' }
  } catch (error) {
    errors.push({ provider: 'smtp', message: error.message })
    const combinedError = new Error('Both Resend and SMTP failed to deliver the contact email.')
    combinedError.status = 502
    combinedError.details = errors
    throw combinedError
  }
}

export async function submitContact(request, response, next) {
  try {
    if (!allowed(request)) return response.status(429).json({ success: false, error: { message: 'Too many messages. Please try again shortly.' } })
    const result = validate(request.body)
    if (result.error) return response.status(400).json({ success: false, error: { message: result.error } })

    const { name, email, phone, subject, message } = result.data
    const saved = await pool.query(
      `INSERT INTO contact_messages (name, email, phone, subject, message) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [name, email, phone, subject, message],
    )
    try {
      const { provider } = await deliverContactEmail(result.data)
      console.log(`Contact email delivered via ${provider}`, { id: saved.rows[0].id })
      await pool.query('UPDATE contact_messages SET status = $1 WHERE id = $2', ['email_sent', saved.rows[0].id])
    } catch (error) {
      await pool.query('UPDATE contact_messages SET status = $1 WHERE id = $2', ['email_failed', saved.rows[0].id])
      console.error('Contact email delivery failed', {
        message: error.message,
        details: error.details,
        resendConfigured: Boolean(env.resendApiKey),
        smtpHostConfigured: Boolean(env.smtpHost),
        smtpUserConfigured: Boolean(env.smtpUser),
        smtpPasswordConfigured: Boolean(env.smtpPassword),
        contactFromConfigured: Boolean(env.contactFromEmail),
        contactRecipientConfigured: Boolean(env.contactCompanyEmail),
      })
      return response.status(error.status || 502).json({ success: false, error: { message: 'Your message was saved, but we could not notify the LemonTrip team. Please try again later.' } })
    }
    return response.status(201).json({ success: true, data: { message: 'Thanks for reaching out. The LemonTrip team will get back to you soon.' } })
  } catch (error) {
    return next(error)
  }
}