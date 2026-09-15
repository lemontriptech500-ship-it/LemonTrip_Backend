import { pool } from '../config/db.js'
import { sendEmail } from './emailService.js'
import { renderNewsletter, unsubscribeUrl } from './newsletterTemplate.js'

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