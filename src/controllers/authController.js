import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import {
  createGoogleUser,
  createUser,
  findUserByEmail,
  findUserByGoogleId,
  findUserById,
  linkGoogleAccount,
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

    // 1. Already signed up with Google before -> log straight in
    let user = await findUserByGoogleId(profile.googleId)

    if (!user) {
      // 2. An account with this email already exists (registered with a
      //    password) -> link Google to it instead of creating a duplicate
      const existingByEmail = await findUserByEmail(profile.email)
      if (existingByEmail) {
        user = await linkGoogleAccount({
          userId: existingByEmail.id,
          googleId: profile.googleId,
          avatar: profile.avatar,
        })
      } else if (mode === 'signup') {
        // 3. Brand new user signing up via Google
        user = await createGoogleUser({
          name: profile.name,
          email: profile.email,
          googleId: profile.googleId,
          avatar: profile.avatar,
        })
      } else {
        return response.status(404).json({
          success: false,
          error: { message: 'No account found for this Google account. Please create an account first.' },
        })
      }
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
