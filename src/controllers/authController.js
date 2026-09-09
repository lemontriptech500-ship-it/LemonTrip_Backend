import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { createUser, findUserByEmail } from '../db/queries.js'

function createToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, env.jwtSecret, { expiresIn: '7d' })
}

export async function register(request, response, next) {
  try {
    const { name, email, phone = '', password } = request.body
    if (!name || !email || !password || password.length < 6) {
      return response.status(400).json({ success: false, error: { message: 'Name, email, and a password of at least 6 characters are required' } })
    }

    const existingUser = await findUserByEmail(email)
    if (existingUser) {
      return response.status(409).json({ success: false, error: { message: 'Email is already registered' } })
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const user = await createUser({ name, email, phone, passwordHash })
    return response.status(201).json({ success: true, data: { user, token: createToken(user) } })
  } catch (error) {
    return next(error)
  }
}

export async function login(request, response, next) {
  try {
    const { email, password } = request.body
    if (!email || !password) {
      return response.status(400).json({ success: false, error: { message: 'Email and password are required' } })
    }

    const user = await findUserByEmail(email)
    const validPassword = user && await bcrypt.compare(password, user.password_hash)
    if (!validPassword) {
      return response.status(401).json({ success: false, error: { message: 'Invalid email or password' } })
    }

    const { password_hash: _passwordHash, ...safeUser } = user
    return response.json({ success: true, data: { user: safeUser, token: createToken(safeUser) } })
  } catch (error) {
    return next(error)
  }
}
