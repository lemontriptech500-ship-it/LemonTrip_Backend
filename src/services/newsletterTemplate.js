import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'

const websiteUrl = env.frontendUrls[0].replace(/\/$/, '')

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export function createUnsubscribeToken(subscriberId) {
  return jwt.sign({ subscriberId, purpose: 'newsletter-unsubscribe' }, env.jwtSecret, { expiresIn: '30d' })
}

export function unsubscribeUrl(subscriberId) {
  const token = encodeURIComponent(createUnsubscribeToken(subscriberId))
  return `${env.newsletterUnsubscribeBaseUrl.replace(/\/$/, '')}/unsubscribe?token=${token}`
}

export function renderNewsletter({ content, unsubscribeLink }) {
  const safeContent = typeof content === 'string' ? content : ''
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>LemonTrip Newsletter</title></head>
<body style="margin:0;background:#f5f8f4;color:#173326;font-family:Arial,Helvetica,sans-serif;line-height:1.6">
  <div style="padding:32px 16px">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e1ebe4;border-radius:12px;overflow:hidden">
      <div style="padding:24px 28px;background:#10231a;color:#ffffff"><a href="${websiteUrl}" style="color:#ffd21a;font-size:24px;font-weight:700;text-decoration:none">LemonTrip</a></div>
      <main style="padding:28px">${safeContent}</main>
      <footer style="padding:20px 28px;border-top:1px solid #e1ebe4;color:#64756a;font-size:12px"><a href="${websiteUrl}" style="color:#267d4b">Visit LemonTrip</a><br><br><a href="${escapeHtml(unsubscribeLink)}" style="color:#64756a">Unsubscribe from these emails</a></footer>
    </div>
  </div>
</body></html>`
}