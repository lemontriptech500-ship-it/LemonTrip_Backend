import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  emailTemplates,
  renderTransactionalEmail,
  sendTransactionalEmail,
} from '../src/services/transactionalEmailTemplate.js'

test('email template registry includes all customer touchpoints from the approved list', () => {
  assert.ok(emailTemplates.account?.welcome)
  assert.ok(emailTemplates.account?.verification)
  assert.ok(emailTemplates.account?.passwordReset)
  assert.ok(emailTemplates.flights?.bookingConfirmed)
  assert.ok(emailTemplates.trains?.bookingConfirmed)
  assert.ok(emailTemplates.buses?.bookingConfirmed)
  assert.ok(emailTemplates.hotels?.bookingConfirmed)
  assert.ok(emailTemplates.packages?.bookingConfirmed)
  assert.ok(emailTemplates.visa?.applicationReceived)
  assert.ok(emailTemplates.payments?.receipt)
  assert.ok(emailTemplates.marketing?.coupon)
})

test('renderTransactionalEmail produces branded HTML with passed dynamic values', () => {
  const result = renderTransactionalEmail({
    title: 'Welcome to LemonTrip, Rahul! ✈️',
    intro: 'Hi Rahul, thanks for joining LemonTrip.',
    sections: [
      { heading: 'Your account is ready', body: 'Book flights, trains, buses, hotels and holiday packages all in one place.' },
    ],
    ctaLabel: 'Explore your first trip',
    ctaHref: 'https://example.com',
    supportEmail: 'support@lemontrip.in',
  })

  assert.match(result.subject, /Welcome to LemonTrip/i)
  assert.match(result.html, /LemonTrip/i)
  assert.match(result.html, /Rahul/i)
  assert.match(result.html, /Explore your first trip/i)
  assert.match(result.html, /support@lemontrip.in/i)
})

test('sendTransactionalEmail resolves to a template and uses the sender wrapper', async (t) => {
  let called = false
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true }))

  const result = await sendTransactionalEmail({
    to: 'rahul@example.com',
    template: 'account.welcome',
    data: { name: 'Rahul' },
    sender: async ({ to, subject, html }) => {
      called = true
      assert.equal(to, 'rahul@example.com')
      assert.match(subject, /Welcome to LemonTrip/i)
      assert.match(html, /Rahul/i)
      return { id: 'mail-123' }
    },
  })

  assert.equal(called, true)
  assert.equal(result.id, 'mail-123')
})
