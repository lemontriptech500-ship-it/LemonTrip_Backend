import { Resend } from 'resend'
import { env } from '../config/env.js'

let client

function normalizedSender(value) {
  const sender = typeof value === 'string' ? value.trim() : ''
  const match = sender.match(/^(.+?)\s+([\w.+-]+@[\w.-]+\.[A-Za-z]{2,})$/)
  return match && !sender.includes('<') ? `${match[1].trim()} <${match[2]}>` : sender
}

function getClient() {
  if (!env.resendApiKey) {
    const error = new Error('Resend is not configured. Set RESEND_API_KEY in the backend environment.')
    error.status = 503
    throw error
  }
  client ||= new Resend(env.resendApiKey)
  return client
}

export async function sendEmail({ to, subject, html }) {
  const { data, error } = await getClient().emails.send({
    from: normalizedSender(env.newsletterFromEmail),
    to,
    subject,
    html,
  })
  if (error) {
    const sendError = new Error(error.message || 'Resend failed to send the email.')
    sendError.status = 502
    throw sendError
  }
  return data
}