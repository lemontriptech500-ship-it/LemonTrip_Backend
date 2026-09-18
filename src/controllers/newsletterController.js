import { pool } from '../config/db.js'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { sendNewsletter, sendTestNewsletter } from '../services/newsletterService.js'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function normalizedEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function validateEmail(value) {
  const email = normalizedEmail(value)
  return email.length <= 255 && emailPattern.test(email) ? email : null
}

export async function subscribe(request, response, next) {
  try {
    const email = validateEmail(request.body?.email)
    if (!email) {
      return response.status(400).json({ success: false, error: { message: 'Enter a valid email address.' } })
    }

    const result = await pool.query(`
      INSERT INTO newsletter_subscribers (email, source, active, subscribed_at, unsubscribed_at)
      VALUES ($1, $2, TRUE, NOW(), NULL)
      ON CONFLICT (email) DO UPDATE SET
        active = TRUE,
        source = EXCLUDED.source,
        subscribed_at = CASE WHEN newsletter_subscribers.active THEN newsletter_subscribers.subscribed_at ELSE NOW() END,
        unsubscribed_at = NULL
      RETURNING (xmax = 0) AS created
    `, [email, typeof request.body?.source === 'string' ? request.body.source.trim().slice(0, 80) || 'website-footer' : 'website-footer'])

    return response.status(result.rows[0]?.created ? 201 : 200).json({
      success: true,
      data: { message: 'You are subscribed to LemonTrip travel updates.' },
    })
  } catch (error) {
    return next(error)
  }
}

export async function unsubscribe(request, response, next) {
  try {
    const email = validateEmail(request.body?.email)
    if (!email) {
      return response.status(400).json({ success: false, error: { message: 'Enter a valid email address.' } })
    }

    await pool.query(
      'UPDATE newsletter_subscribers SET active = FALSE, unsubscribed_at = NOW() WHERE email = $1 AND active = TRUE',
      [email],
    )

    return response.json({ success: true, data: { message: 'You have been unsubscribed from LemonTrip updates.' } })
  } catch (error) {
    return next(error)
  }
}

export async function unsubscribeByToken(request, response) {
  try {
    const payload = jwt.verify(request.query.token, env.jwtSecret)
    if (payload.purpose !== 'newsletter-unsubscribe' || typeof payload.subscriberId !== 'string') throw new Error('Invalid token')
    await pool.query(
      'UPDATE newsletter_subscribers SET active = FALSE, unsubscribed_at = NOW() WHERE id = $1 AND active = TRUE',
      [payload.subscriberId],
    )
    return response.type('html').send('<!doctype html><html><body style="font-family:Arial,sans-serif;padding:40px"><h1>You are unsubscribed</h1><p>You will no longer receive LemonTrip newsletters.</p></body></html>')
  } catch {
    return response.status(400).type('html').send('<!doctype html><html><body style="font-family:Arial,sans-serif;padding:40px"><h1>Unsubscribe link expired</h1><p>This link is invalid or has expired.</p></body></html>')
  }
}

export async function send(request, response, next) {
  try {
    const subject = typeof request.body?.subject === 'string' ? request.body.subject.trim() : ''
    const content = typeof request.body?.content === 'string' ? request.body.content.trim() : ''
    if (!subject || subject.length > 200 || !content || content.length > 100_000) {
      return response.status(400).json({ success: false, error: { message: 'Subject and newsletter content are required. Subject must be 200 characters or fewer.' } })
    }
    const result = await sendNewsletter({ subject, content })
    return response.json({ success: true, data: { message: `Newsletter sent to ${result.sent} active subscriber(s).`, ...result } })
  } catch (error) {
    return next(error)
  }
}

export async function sendTest(request, response, next) {
  try {
    const subject = typeof request.body?.subject === 'string' ? request.body.subject.trim() : ''
    const content = typeof request.body?.content === 'string' ? request.body.content.trim() : ''
    if (!subject || subject.length > 200 || !content || content.length > 100_000) {
      return response.status(400).json({ success: false, error: { message: 'Subject and newsletter content are required. Subject must be 200 characters or fewer.' } })
    }
    const result = await sendTestNewsletter({ subject, content })
    return response.json({ success: true, data: { message: 'Test newsletter sent to the configured test recipient.', ...result } })
  } catch (error) {
    return next(error)
  }
}
