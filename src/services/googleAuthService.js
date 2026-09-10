import { OAuth2Client } from 'google-auth-library'
import { env } from '../config/env.js'

const client = new OAuth2Client(env.googleClientId)

// Exported as an object (not a bare function) so tests can swap
// `googleAuthService.verifyIdToken` with a fake using node:test's
// `t.mock.method(...)` without needing a module-mocking library.
export const googleAuthService = {
  async verifyIdToken(idToken) {
    if (!env.googleClientId) {
      const error = new Error('Google Sign-In is not configured on the server')
      error.status = 500
      throw error
    }

    let ticket
    try {
      ticket = await client.verifyIdToken({ idToken, audience: env.googleClientId })
    } catch {
      const error = new Error('Invalid or expired Google token')
      error.status = 401
      throw error
    }

    const payload = ticket.getPayload()
    if (!payload || !payload.sub || !payload.email) {
      const error = new Error('Google account could not be verified')
      error.status = 401
      throw error
    }
    if (!payload.email_verified) {
      const error = new Error('Google email is not verified')
      error.status = 401
      throw error
    }

    return {
      googleId: payload.sub,
      email: payload.email.toLowerCase(),
      name: payload.name || payload.email.split('@')[0],
      avatar: payload.picture || null,
    }
  },
}
