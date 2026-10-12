import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { pool } from '../config/db.js'
import { sendEmail } from '../services/emailService.js'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import {
  createGoogleUser,
  createUser,
  findUserByEmail,
  findUserByGoogleId,
  findUserById,
  linkGoogleAccount,
  updateUserProfile,
} from '../db/queries.js'
import { googleAuthService } from '../services/googleAuthService.js'

function createToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, env.jwtSecret, { expiresIn: '7d' })
}

export async function register(request, response, next) {
  try {
    const { name, email, phone = '', password } = request.body
    const normalizedName = typeof name === 'string' ? name.trim() : ''
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
    const normalizedPhone = typeof phone === 'string' ? phone.trim() : ''
    if (!normalizedName || !normalizedEmail || !password || password.length < 6) {
      return response.status(400).json({ success: false, error: { message: 'Name, email, and a password of at least 6 characters are required' } })
    }

    const existingUser = await findUserByEmail(normalizedEmail)
    if (existingUser) {
      return response.status(409).json({ success: false, error: { message: 'Email is already registered' } })
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const user = await createUser({ name: normalizedName, email: normalizedEmail, phone: normalizedPhone, passwordHash })
    return response.status(201).json({ success: true, data: { user, token: createToken(user) } })
  } catch (error) {
    return next(error)
  }
}

export async function login(request, response, next) {
  try {
    const { email, password } = request.body
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
    if (!normalizedEmail || !password) {
      return response.status(400).json({ success: false, error: { message: 'Email and password are required' } })
    }

    const user = await findUserByEmail(normalizedEmail)
    if (user && !user.password_hash) {
      return response
        .status(401)
        .json({ success: false, error: { message: 'This account uses Google Sign-In. Please continue with Google.' } })
    }

    const validPassword = user && (await bcrypt.compare(password, user.password_hash))
    if (!validPassword) {
      return response.status(401).json({ success: false, error: { message: 'Invalid email or password' } })
    }

    const { password_hash: _passwordHash, google_id: _googleId, ...safeUser } = user
    return response.json({ success: true, data: { user: safeUser, token: createToken(safeUser) } })
  } catch (error) {
    return next(error)
  }
}

export async function googleAuth(request, response, next) {
  try {
    const { idToken, mode = 'signin' } = request.body
    if (!idToken) {
      return response.status(400).json({ success: false, error: { message: 'idToken is required' } })
    }

    const profile = await googleAuthService.verifyIdToken(idToken)

    if (mode !== 'signup' && mode !== 'signin') {
      return response.status(400).json({ success: false, error: { message: 'Invalid mode' } })
    }
    const existingGoogle = await findUserByGoogleId(profile.googleId)
    const existingEmail = await findUserByEmail(profile.email)
    let user
    if (mode === 'signup') {
      if (existingGoogle || existingEmail) {
        return response.status(409).json({ success: false, error: { code: 'ACCOUNT_ALREADY_EXISTS', message: 'Account already exists. Please proceed to Login.' } })
      }
      user = await createGoogleUser({ name: profile.name, email: profile.email, googleId: profile.googleId, avatar: profile.avatar })
    } else {
      if (!existingGoogle) {
        return response.status(404).json({ success: false, error: { code: 'ACCOUNT_NOT_FOUND', message: 'No Google account found. Please use your existing sign-in method or sign up first.' } })
      }
      user = existingGoogle
    }

    const { password_hash: _passwordHash, google_id: _googleId, ...safeUser } = user
    return response.json({ success: true, data: { user: safeUser, token: createToken(safeUser) } })
  } catch (error) {
    return next(error)
  }
}

export async function me(request, response, next) {
  try {
    const user = await findUserById(request.user.id)
    if (!user) {
      return response.status(404).json({ success: false, error: { message: 'User not found' } })
    }
    return response.json({ success: true, data: { user } })
  } catch (error) {
    return next(error)
  }
}

export async function updateProfile(request, response, next) {
  try {
    const name = typeof request.body.name === 'string' ? request.body.name.trim() : ''
    const phone = typeof request.body.phone === 'string' ? request.body.phone.trim() : ''
    if (!name) {
      return response.status(400).json({ success: false, error: { message: 'Name is required' } })
    }
    if (phone && !/^[+\d][\d\s()-]{6,19}$/.test(phone)) {
      return response.status(400).json({ success: false, error: { message: 'Enter a valid phone number' } })
    }

    const user = await updateUserProfile({ id: request.user.id, name, phone })
    if (!user) return response.status(404).json({ success: false, error: { message: 'User not found' } })
    return response.json({ success: true, data: { user } })
  } catch (error) {
    return next(error)
  }
}
const RESET_MESSAGE = 'If this email has a password-based LemonTrip account, a reset link will be sent shortly.'
const RESET_TTL_MINUTES = 20

export async function forgotPassword(request, response, next) {
  try {
    const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : ''
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return response.status(400).json({ success: false, error: { message: 'Enter a valid email address.' } })
    }
    const user = await findUserByEmail(email)
    if (user?.password_hash) {
      const token = crypto.randomBytes(32).toString('hex')
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
      await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [user.id])
      await pool.query(`INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
        VALUES ($1, $2, NOW() + INTERVAL '20 minutes')`, [user.id, tokenHash])
      const base = env.frontendUrls[0]?.replace(/\/$/, '') || 'http://localhost:3000'
      const link = `${base}/reset-password?token=${encodeURIComponent(token)}`
      try {
        await sendEmail({
          to: email,
          subject: 'Reset your LemonTrip password',
          html: `<p>We received a request to reset your LemonTrip password.</p><p><a href="${link}">Reset your password</a></p><p>This link expires in 20 minutes. If you did not request it, ignore this email.</p>`,
        })
      } catch (sendError) {
        await pool.query('DELETE FROM password_reset_tokens WHERE token_hash = $1', [tokenHash])
        throw sendError
      }
    }
    return response.json({ success: true, data: { message: RESET_MESSAGE } })
  } catch (error) { return next(error) }
}

export async function resetPassword(request, response, next) {
  try {
    const { token, password } = request.body || {}
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token) || typeof password !== 'string' || password.length < 8 || password.length > 128) {
      return response.status(400).json({ success: false, error: { message: 'Valid reset token and password of 8–128 characters required.' } })
    }
    const hash = crypto.createHash('sha256').update(token).digest('hex')
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const result = await client.query(`SELECT user_id FROM password_reset_tokens WHERE token_hash = $1 AND expires_at > NOW() AND used_at IS NULL FOR UPDATE`, [hash])
      if (!result.rows.length) {
        await client.query('ROLLBACK')
        return response.status(400).json({ success: false, error: { message: 'This reset link is invalid or expired. Please request a new one.' } })
      }
      const passwordHash = await bcrypt.hash(password, 12)
      await client.query('UPDATE users SET password_hash = $1 WHERE id = $2 AND password_hash IS NOT NULL', [passwordHash, result.rows[0].user_id])
      await client.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [result.rows[0].user_id])
      await client.query('COMMIT')
      return response.json({ success: true, data: { message: 'Password updated. Please sign in.' } })
    } catch (error) { await client.query('ROLLBACK'); throw error }
    finally { client.release() }
  } catch (error) { return next(error) }
}
