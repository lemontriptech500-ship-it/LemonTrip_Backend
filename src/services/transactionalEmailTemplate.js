import { env } from '../config/env.js'
import { sendEmail } from './emailService.js'

const websiteUrl = (env.frontendUrls && env.frontendUrls[0] ? env.frontendUrls[0] : 'http://localhost:3000').replace(/\/$/, '')
const supportEmail = env.contactCompanyEmail || 'support@lemontrip.in'

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function fillTemplateString(template, data = {}) {
  if (!template) return ''
  return String(template).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const value = key.split('.').reduce((current, part) => current?.[part], data)
    return value === undefined || value === null ? '' : String(value)
  })
}

const baseEmailTemplates = {
  account: {
    welcome: {
      subject: 'Welcome to LemonTrip, {{name}}! ✈️',
      title: 'Welcome to LemonTrip, {{name}}! ✈️',
      intro: 'Hi {{name}}, thanks for joining LemonTrip. Book flights, trains, buses, hotels and holiday packages all in one place, with easy payments and a wallet for faster checkout. Explore your first trip today.',
      ctaLabel: 'Explore your first trip',
      ctaHref: websiteUrl,
      sections: [
        {
          heading: 'Your account is ready',
          body: 'Book flights, trains, buses, hotels and holiday packages all in one place, with wallet support for faster checkout.',
        },
      ],
    },
    verification: {
      subject: 'Verify your email to activate your LemonTrip account',
      title: 'Verify your email to activate your LemonTrip account',
      intro: 'Hi {{name}}, please verify your email using the code {{otp}} (valid for {{expiry}} minutes) or by clicking the verification link below. This confirms it’s really you.',
      ctaLabel: 'Verify my email',
      ctaHref: '{{link}}',
      sections: [
        {
          heading: 'Verification code',
          body: 'Your code is {{otp}}. This code is valid for {{expiry}} minutes.',
        },
      ],
    },
    passwordReset: {
      subject: 'Reset your LemonTrip password',
      title: 'Reset your LemonTrip password',
      intro: 'Hi {{name}}, we received a request to reset your password. Click the link below to set a new one. This link expires in {{expiry}} minutes. If you didn’t request this, you can ignore this email.',
      ctaLabel: 'Reset my password',
      ctaHref: '{{link}}',
      sections: [
        {
          heading: 'Security note',
          body: 'If you did not request this password reset, you can ignore this email and your account remains secure.',
        },
      ],
    },
  },
  flights: {
    bookingConfirmed: {
      subject: 'Your flight booking is confirmed – {{booking_id}}',
      title: 'Your flight booking is confirmed – {{booking_id}}',
      intro: 'Hi {{name}}, your flight booking is confirmed. PNR: {{pnr}}, Airline: {{airline}}, Route: {{route}}, Departure: {{date_time}}. Your e-ticket is attached. Have a great trip!',
      ctaLabel: 'View booking',
      ctaHref: '{{bookingUrl}}',
      sections: [
        {
          heading: 'Trip details',
          body: 'Airline: {{airline}}<br>Route: {{route}}<br>Departure: {{date_time}}<br>PNR: {{pnr}}',
        },
      ],
    },
    bookingPending: {
      subject: 'We’re processing your flight booking – {{booking_id}}',
      title: 'We’re processing your flight booking – {{booking_id}}',
      intro: 'Hi {{name}}, we’ve received your payment for booking {{booking_id}} and are confirming your seat with the airline. We’ll email you as soon as it’s ticketed.',
      ctaLabel: 'Track booking',
      ctaHref: '{{bookingUrl}}',
    },
    bookingFailed: {
      subject: 'Your flight booking could not be completed – {{booking_id}}',
      title: 'Your flight booking could not be completed – {{booking_id}}',
      intro: 'Hi {{name}}, unfortunately booking {{booking_id}} could not be completed. Any amount paid will be refunded within {{days}} business days. Please try again or contact support.',
      ctaLabel: 'Try again',
      ctaHref: websiteUrl,
    },
    ticketIssued: {
      subject: 'Your e-ticket is ready – PNR {{pnr}}',
      title: 'Your e-ticket is ready – PNR {{pnr}}',
      intro: 'Hi {{name}}, your flight ticket has been issued. PNR: {{pnr}}, Airline: {{airline}}, Departure: {{date_time}}. The e-ticket PDF is attached – please carry a copy for check-in.',
      ctaLabel: 'Download ticket',
      ctaHref: '{{ticketUrl}}',
    },
    departureReminder: {
      subject: 'Reminder: your flight departs on {{date}}',
      title: 'Reminder: your flight departs on {{date}}',
      intro: 'Hi {{name}}, your flight {{flight_no}} departs on {{date}} at {{time}}. Please reach the airport at least 2 hours early and carry a valid ID.',
      ctaLabel: 'View itinerary',
      ctaHref: '{{bookingUrl}}',
    },
  },
  trains: {
    bookingConfirmed: {
      subject: 'Your train booking is confirmed – PNR {{pnr}}',
      title: 'Your train booking is confirmed – PNR {{pnr}}',
      intro: 'Hi {{name}}, your train booking {{booking_id}} is confirmed. Train: {{train_name}}, PNR: {{pnr}}, Date: {{date}}. Your ticket is attached.',
      ctaLabel: 'View ticket',
      ctaHref: '{{bookingUrl}}',
    },
    bookingPending: {
      subject: 'Processing your train booking – {{booking_id}}',
      title: 'Processing your train booking – {{booking_id}}',
      intro: 'Hi {{name}}, your train booking {{booking_id}} is being processed with the railway system. We’ll confirm shortly.',
      ctaLabel: 'Track booking',
      ctaHref: '{{bookingUrl}}',
    },
    bookingFailed: {
      subject: 'Your train booking could not be completed – {{booking_id}}',
      title: 'Your train booking could not be completed – {{booking_id}}',
      intro: 'Hi {{name}}, we’re sorry, booking {{booking_id}} could not be completed. Any amount paid will be refunded within {{days}} business days.',
      ctaLabel: 'Book again',
      ctaHref: websiteUrl,
    },
    bookingCancelled: {
      subject: 'Your train booking has been cancelled – {{booking_id}}',
      title: 'Your train booking has been cancelled – {{booking_id}}',
      intro: 'Hi {{name}}, your train booking {{booking_id}} has been cancelled as requested. Applicable refund will be processed within {{days}} business days.',
      ctaLabel: 'View account',
      ctaHref: '{{accountUrl}}',
    },
    refundProcessed: {
      subject: 'Refund processed for booking {{booking_id}}',
      title: 'Refund processed for booking {{booking_id}}',
      intro: 'Hi {{name}}, your refund of ₹{{amount}} for booking {{booking_id}} has been processed and should reflect in your account within {{days}} business days.',
      ctaLabel: 'See transactions',
      ctaHref: '{{accountUrl}}',
    },
  },
  buses: {
    bookingConfirmed: {
      subject: 'Your bus booking is confirmed – {{booking_id}}',
      title: 'Your bus booking is confirmed – {{booking_id}}',
      intro: 'Hi {{name}}, your bus booking is confirmed. Operator: {{operator}}, Seat(s): {{seats}}, Departure: {{date_time}} from {{boarding_point}}. Ticket attached.',
      ctaLabel: 'View ticket',
      ctaHref: '{{bookingUrl}}',
    },
    bookingFailed: {
      subject: 'Your bus booking could not be completed – {{booking_id}}',
      title: 'Your bus booking could not be completed – {{booking_id}}',
      intro: 'Hi {{name}}, booking {{booking_id}} could not be completed. Any amount paid will be refunded within {{days}} business days.',
      ctaLabel: 'Try again',
      ctaHref: websiteUrl,
    },
    journeyReminder: {
      subject: 'Reminder: your bus departs on {{date}}',
      title: 'Reminder: your bus departs on {{date}}',
      intro: 'Hi {{name}}, your bus with {{operator}} departs on {{date}} at {{time}} from {{boarding_point}}. Please arrive 15 minutes early.',
      ctaLabel: 'View trip',
      ctaHref: '{{bookingUrl}}',
    },
  },
  hotels: {
    bookingConfirmed: {
      subject: 'Your hotel booking is confirmed – {{hotel_name}}',
      title: 'Your hotel booking is confirmed – {{hotel_name}}',
      intro: 'Hi {{name}}, your hotel booking is confirmed. Hotel: {{hotel_name}}, Check-in: {{checkin}}, Check-out: {{checkout}}, Booking ID: {{booking_id}}. Voucher attached. Enjoy your stay!',
      ctaLabel: 'View booking',
      ctaHref: '{{bookingUrl}}',
    },
    bookingPending: {
      subject: 'Confirming your hotel booking – {{booking_id}}',
      title: 'Confirming your hotel booking – {{booking_id}}',
      intro: 'Hi {{name}}, we’re confirming your hotel booking {{booking_id}} with the property. We’ll update you shortly.',
      ctaLabel: 'Track status',
      ctaHref: '{{bookingUrl}}',
    },
    bookingFailed: {
      subject: 'Your hotel booking could not be confirmed – {{booking_id}}',
      title: 'Your hotel booking could not be confirmed – {{booking_id}}',
      intro: 'Hi {{name}}, unfortunately booking {{booking_id}} could not be confirmed. Any amount paid will be refunded within {{days}} business days.',
      ctaLabel: 'Book again',
      ctaHref: websiteUrl,
    },
    checkInReminder: {
      subject: 'Reminder: check-in tomorrow at {{hotel_name}}',
      title: 'Reminder: check-in tomorrow at {{hotel_name}}',
      intro: 'Hi {{name}}, your check-in at {{hotel_name}} is tomorrow, {{date}}. Booking ID: {{booking_id}}. We hope you have a great stay!',
      ctaLabel: 'View stay details',
      ctaHref: '{{bookingUrl}}',
    },
  },
  packages: {
    bookingConfirmed: {
      subject: 'Your package booking is confirmed – {{package_name}}',
      title: 'Your package booking is confirmed – {{package_name}}',
      intro: 'Hi {{name}}, your package booking for {{package_name}} is confirmed. Travel dates: {{dates}}, Booking ID: {{booking_id}}. Our team will share your full itinerary shortly.',
      ctaLabel: 'View package',
      ctaHref: '{{bookingUrl}}',
    },
    bookingFailed: {
      subject: 'Your package booking could not be completed – {{booking_id}}',
      title: 'Your package booking could not be completed – {{booking_id}}',
      intro: 'Hi {{name}}, booking {{booking_id}} could not be completed. Any amount paid will be refunded within {{days}} business days.',
      ctaLabel: 'Explore packages',
      ctaHref: websiteUrl,
    },
    itineraryShared: {
      subject: 'Your detailed itinerary for {{package_name}}',
      title: 'Your detailed itinerary for {{package_name}}',
      intro: 'Hi {{name}}, your detailed day-by-day itinerary for {{package_name}} (Booking ID: {{booking_id}}) is attached as a PDF. Please review it and reach out with any questions.',
      ctaLabel: 'Download itinerary',
      ctaHref: '{{itineraryUrl}}',
    },
  },
  visa: {
    applicationReceived: {
      subject: 'We’ve received your visa application – {{country}}',
      title: 'We’ve received your visa application – {{country}}',
      intro: 'Hi {{name}}, we’ve received your visa application documents for {{country}}. Our team will review them and get back to you within {{days}} business days.',
      ctaLabel: 'Track application',
      ctaHref: '{{applicationUrl}}',
    },
    applicationApproved: {
      subject: 'Your visa for {{country}} has been approved 🎉',
      title: 'Your visa for {{country}} has been approved 🎉',
      intro: 'Hi {{name}}, good news! Your visa application for {{country}} has been approved. Your visa document is attached / available in your account.',
      ctaLabel: 'View visa',
      ctaHref: '{{applicationUrl}}',
    },
    applicationRejected: {
      subject: 'Update on your visa application – {{country}}',
      title: 'Update on your visa application – {{country}}',
      intro: 'Hi {{name}}, unfortunately your visa application for {{country}} was not approved. Please contact our support team to discuss next steps.',
      ctaLabel: 'Contact support',
      ctaHref: '{{supportUrl}}',
    },
    documentRequired: {
      subject: 'Action needed: additional document for your visa application',
      title: 'Action needed: additional document for your visa application',
      intro: 'Hi {{name}}, we need an additional document ({{document}}) to continue processing your visa application for {{country}}. Please upload it at your earliest convenience.',
      ctaLabel: 'Upload document',
      ctaHref: '{{applicationUrl}}',
    },
  },
  payments: {
    receipt: {
      subject: 'Payment receipt – {{booking_id}}',
      title: 'Payment receipt – {{booking_id}}',
      intro: 'Hi {{name}}, your payment of ₹{{amount}} for booking {{booking_id}} was successful. Transaction ID: {{txn_id}}. This email serves as your receipt.',
      ctaLabel: 'View receipt',
      ctaHref: '{{bookingUrl}}',
    },
    paymentFailed: {
      subject: 'Your payment could not be processed – {{booking_id}}',
      title: 'Your payment could not be processed – {{booking_id}}',
      intro: 'Hi {{name}}, your payment of ₹{{amount}} for booking {{booking_id}} could not be processed. Please try again or use a different payment method.',
      ctaLabel: 'Retry payment',
      ctaHref: '{{paymentUrl}}',
    },
    refundInitiated: {
      subject: 'Refund initiated for booking {{booking_id}}',
      title: 'Refund initiated for booking {{booking_id}}',
      intro: 'Hi {{name}}, a refund of ₹{{amount}} for booking {{booking_id}} has been initiated and should complete within {{days}} business days.',
      ctaLabel: 'View transactions',
      ctaHref: '{{accountUrl}}',
    },
    refundCompleted: {
      subject: 'Refund completed for booking {{booking_id}}',
      title: 'Refund completed for booking {{booking_id}}',
      intro: 'Hi {{name}}, your refund of ₹{{amount}} for booking {{booking_id}} has been completed. Thank you for your patience.',
      ctaLabel: 'Check wallet',
      ctaHref: '{{accountUrl}}',
    },
    walletTopUpSuccess: {
      subject: 'Your LemonTrip wallet has been topped up',
      title: 'Your LemonTrip wallet has been topped up',
      intro: 'Hi {{name}}, your wallet has been topped up with ₹{{amount}}. Current balance: ₹{{balance}}.',
      ctaLabel: 'View wallet',
      ctaHref: '{{walletUrl}}',
    },
  },
  marketing: {
    coupon: {
      subject: '{{name}}, here’s {{discount}} off your next trip! 🎁',
      title: '{{name}}, here’s {{discount}} off your next trip! 🎁',
      intro: 'Hi {{name}}, enjoy {{discount}} off your next booking with code {{code}}. Valid till {{expiry}}. Start planning your next getaway today.',
      ctaLabel: 'Book now',
      ctaHref: websiteUrl,
    },
    newsletter: {
      subject: 'This week’s top travel deals from LemonTrip',
      title: 'This week’s top travel deals from LemonTrip',
      intro: 'Hi {{name}}, check out this week’s best deals on flights, hotels and packages, hand-picked for you. Tap below to explore and book.',
      ctaLabel: 'Explore deals',
      ctaHref: websiteUrl,
    },
    abandonedCart: {
      subject: 'You left something in your cart, {{name}}',
      title: 'You left something in your cart, {{name}}',
      intro: 'Hi {{name}}, you were checking out a booking for {{item}} but didn’t complete payment. Your selection is still saved – complete your booking before prices change.',
      ctaLabel: 'Complete booking',
      ctaHref: '{{cartUrl}}',
    },
  },
}

export const emailTemplates = baseEmailTemplates

export function resolveTransactionalTemplate(templateName, data = {}) {
  if (!templateName || typeof templateName !== 'string') {
    return null
  }

  const normalized = templateName.trim()
  if (!normalized) return null

  const [category, key] = normalized.split('.')
  const categoryTemplates = baseEmailTemplates[category]
  if (!categoryTemplates || !key) {
    return null
  }

  const resolved = categoryTemplates[key]
  if (!resolved) {
    return null
  }

  return {
    ...resolved,
    __meta: { category, key },
    data,
  }
}

export function renderTransactionalEmail({
  subject,
  title,
  intro,
  sections = [],
  ctaLabel,
  ctaHref,
  supportEmail: overrideSupportEmail,
  footerText = 'Need help? Contact us at ' + supportEmail + ' or reply to this email.',
}) {
  const finalSubject = fillTemplateString(subject || title || 'LemonTrip update', {})
  const finalTitle = fillTemplateString(title || 'LemonTrip update', {})
  const finalIntro = fillTemplateString(intro || '', {})
  const finalCtaLabel = fillTemplateString(ctaLabel || 'Learn more', {})
  const finalCtaHref = fillTemplateString(ctaHref || websiteUrl, {})
  const safeSupport = fillTemplateString(overrideSupportEmail || supportEmail, {})
  const safeFooter = fillTemplateString(footerText, { supportEmail: safeSupport })

  const sectionHtml = sections.map((section) => {
    const heading = escapeHtml(fillTemplateString(section.heading || '', {}))
    const body = escapeHtml(fillTemplateString(section.body || '', {})).replace(/\n/g, '<br>')
    return `
      <div style="margin-top:18px;padding:18px 20px;border:1px solid #e7efe8;border-radius:12px;background:#fafcf9;">
        ${heading ? `<h3 style="margin:0 0 8px;font-size:18px;color:#123224;">${heading}</h3>` : ''}
        <p style="margin:0;color:#355047;line-height:1.7;font-size:15px;">${body}</p>
      </div>
    `
  }).join('')

  const html = `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${escapeHtml(finalTitle)}</title>
      <style>
        body { margin:0; background:#f5f7f4; color:#173326; font-family:Arial,Helvetica,sans-serif; }
        a { color:#1d6b4a; text-decoration:none; }
        @media (max-width: 600px) {
          .container { padding: 16px !important; }
          .card { border-radius: 10px !important; }
        }
      </style>
    </head>
    <body style="margin:0;background:#f5f7f4;color:#173326;font-family:Arial,Helvetica,sans-serif;line-height:1.6;">
      <div class="container" style="padding:32px 16px;">
        <div class="card" style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e7efe8;border-radius:16px;overflow:hidden;">
          <div style="padding:24px 28px;background:linear-gradient(135deg,#10231a,#1d6b4a);color:#ffffff;">
            <a href="${websiteUrl}" style="font-size:26px;font-weight:700;color:#ffd21a;text-decoration:none;">LemonTrip</a>
          </div>

          <div style="padding:28px 28px 20px;">
            <h1 style="margin:0 0 12px;font-size:30px;line-height:1.3;color:#0f1d1a;">${escapeHtml(finalTitle)}</h1>
            <p style="margin:0 0 20px;color:#34534b;font-size:16px;line-height:1.75;">${escapeHtml(finalIntro)}</p>

            ${sectionHtml}

            ${ctaLabel ? `
              <div style="margin-top:24px; text-align:center;">
                <a href="${escapeHtml(finalCtaHref)}" style="display:inline-block;padding:14px 24px;background:#0f922f;color:#ffffff;border-radius:999px;font-weight:700;font-size:15px;">${escapeHtml(finalCtaLabel)}</a>
              </div>
            ` : ''}
          </div>

          <div style="padding:20px 28px;border-top:1px solid #e7efe8;background:#fbfcfa;color:#5a6d63;font-size:12px;line-height:1.7;">
            <p style="margin:0;">${escapeHtml(safeFooter)}</p>
            <p style="margin:10px 0 0;">
              <a href="${websiteUrl}" style="color:#1d6b4a;">LemonTrip</a> · <a href="mailto:${escapeHtml(safeSupport)}" style="color:#1d6b4a;">${escapeHtml(safeSupport)}</a>
            </p>
          </div>
        </div>
      </div>
    </body>
  </html>`

  return {
    subject: fillTemplateString(subject || title || 'LemonTrip update', {
      supportEmail: safeSupport,
      websiteUrl,
    }),
    html,
  }
}

export async function sendTransactionalEmail({
  to,
  template,
  data = {},
  sender = async ({ to: recipient, subject, html }) => sendEmail({ to: recipient, subject, html }),
}) {
  const templateConfig = resolveTransactionalTemplate(template, data)
  if (!templateConfig) {
    throw new Error(`Unknown transactional email template: ${template}`)
  }

  const subject = fillTemplateString(templateConfig.subject || templateConfig.title || 'LemonTrip update', data)
  const title = fillTemplateString(templateConfig.title || templateConfig.subject || 'LemonTrip update', data)
  const intro = fillTemplateString(templateConfig.intro || '', data)
  const ctaLabel = fillTemplateString(templateConfig.ctaLabel || '', data)
  const ctaHref = fillTemplateString(templateConfig.ctaHref || websiteUrl, data)
  const safeSections = (templateConfig.sections || []).map((section) => ({
    heading: fillTemplateString(section.heading || '', data),
    body: fillTemplateString(section.body || '', data),
  }))

  const payload = renderTransactionalEmail({
    subject,
    title,
    intro,
    sections: safeSections,
    ctaLabel,
    ctaHref,
    supportEmail,
  })

  return sender({ to, subject: payload.subject, html: payload.html })
}

export default {
  emailTemplates,
  resolveTransactionalTemplate,
  renderTransactionalEmail,
  sendTransactionalEmail,
}
