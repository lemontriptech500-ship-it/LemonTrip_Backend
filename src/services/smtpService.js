import nodemailer from 'nodemailer'
import { env } from '../config/env.js'

let transport

function getTransport() {
  if (transport) return transport
  if (!env.smtpHost || !env.smtpUser || !env.smtpPassword || !env.contactFromEmail) {
    const error = new Error('SMTP is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD, and CONTACT_FROM_EMAIL.')
    error.status = 503
    throw error
  }
  transport = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    auth: { user: env.smtpUser, pass: env.smtpPassword },
  })
  return transport
}

export function setSmtpTransport(nextTransport) {
  transport = nextTransport
}

export async function sendContactEmail({ name, email, phone, subject, message }) {
  return getTransport().sendMail({
    from: env.contactFromEmail,
    to: env.contactCompanyEmail,
    replyTo: email,
    subject: `[LemonTrip Contact] ${subject}`,
    text: `Name: ${name}\nEmail: ${email}\nPhone: ${phone}\n\n${message}`,
    html: `<h2>New LemonTrip contact message</h2><p><strong>Name:</strong> ${name}</p><p><strong>Email:</strong> ${email}</p><p><strong>Phone:</strong> ${phone}</p><p><strong>Subject:</strong> ${subject}</p><hr><p>${message.replaceAll('\n', '<br>')}</p>`,
  })
}