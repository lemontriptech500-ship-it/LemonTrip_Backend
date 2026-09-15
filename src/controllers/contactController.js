import { pool } from '../config/db.js'
import { sendContactEmail } from '../services/smtpService.js'

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
      await sendContactEmail(result.data)
      await pool.query('UPDATE contact_messages SET status = $1 WHERE id = $2', ['email_sent', saved.rows[0].id])
    } catch (error) {
      await pool.query('UPDATE contact_messages SET status = $1 WHERE id = $2', ['email_failed', saved.rows[0].id])
      return response.status(error.status || 502).json({ success: false, error: { message: 'Your message was saved, but we could not notify the LemonTrip team. Please try again later.' } })
    }
    return response.status(201).json({ success: true, data: { message: 'Thanks for reaching out. The LemonTrip team will get back to you soon.' } })
  } catch (error) {
    return next(error)
  }
}