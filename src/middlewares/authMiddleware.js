import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'

export function requireAuth(request, response, next) {
  const authorization = request.headers.authorization
  const token = authorization?.startsWith('Bearer ')
    ? authorization.slice(7)
    : null

  if (!token) {
    return response.status(401).json({ success: false, error: { message: 'Authentication required' } })
  }

  try {
    request.user = jwt.verify(token, env.jwtSecret)
    return next()
  } catch {
    return response.status(401).json({ success: false, error: { message: 'Invalid or expired token' } })
  }
}

export function requireAdmin(request, response, next) {
  if (!env.adminEmails.includes(String(request.user?.email || '').toLowerCase())) {
    return response.status(403).json({ success: false, error: { message: 'Administrator access required' } })
  }
  return next()
}
