import { pool } from '../config/db.js'
import { sendEmail } from './emailService.js'
import { renderNewsletter, unsubscribeUrl } from './newsletterTemplate.js'
import { env } from '../config/env.js'

let emailSender = sendEmail

export function setNewsletterEmailSender(sender = sendEmail) {
  emailSender = sender
}

export async function sendNewsletter({ subject, content }) {
  const result = await pool.query('SELECT id, email FROM newsletter_subscribers WHERE active = TRUE ORDER BY subscribed_at ASC')
  const outcomes = await Promise.allSettled(result.rows.map(({ id, email }) => emailSender({
    to: email,
    subject,
    html: renderNewsletter({ content, unsubscribeLink: unsubscribeUrl(id) }),
  })))
  const sent = outcomes.filter((outcome) => outcome.status === 'fulfilled').length
  const failed = outcomes.length - sent
  if (failed > 0) {
    const error = new Error(`Newsletter delivery failed for ${failed} of ${outcomes.length} subscribers.`)
    error.status = 502
    throw error
  }
  return { sent, total: outcomes.length }
}

export async function sendTestNewsletter({ subject, content }) {
  const email = env.newsletterTestRecipient
  if (!email) {
    const error = new Error('Newsletter test sending is not configured. Set NEWSLETTER_TEST_RECIPIENT to a dedicated test inbox.')
    error.status = 503
    throw error
  }

  // This address is intentionally environment-owned: callers can never supply
  // a recipient, so this path cannot turn into a broadcast or arbitrary mailer.
  const subscriber = await pool.query(`
    INSERT INTO newsletter_subscribers (email, source, active, subscribed_at, unsubscribed_at)
    VALUES ($1, 'newsletter-test', TRUE, NOW(), NULL)
    ON CONFLICT (email) DO UPDATE SET
      active = TRUE,
      unsubscribed_at = NULL
    RETURNING id, email
  `, [email])
  const recipient = subscriber.rows[0]
  const unsubscribeLink = unsubscribeUrl(recipient.id)
  const result = await emailSender({
    to: recipient.email,
    subject: `[TEST] ${subject}`,
    html: renderNewsletter({ content, unsubscribeLink }),
  })

  return { sent: 1, total: 1, recipient: recipient.email, emailId: result?.id || null, unsubscribeLink }
}
