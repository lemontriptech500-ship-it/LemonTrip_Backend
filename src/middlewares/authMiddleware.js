import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { pool } from '../config/db.js'

export async function requireAuth(request, response, next) {
  const authorization = request.headers.authorization
  const token = authorization?.startsWith('Bearer ')
    ? authorization.slice(7)
    : null

  if (!token) {
    return response.status(401).json({ success: false, error: { message: 'Authentication required' } })
  }

  let payload
  try {
    payload = jwt.verify(token, env.jwtSecret)
  } catch {
    return response.status(401).json({ success: false, error: { message: 'Invalid or expired token' } })
  }
  if (!payload || typeof payload !== 'object') {
    return response.status(401).json({ success: false, error: { message: 'Invalid token' } })
  }
  // The shared mobile auth service issues `sub`; website legacy tokens use `id`.
  const userId = typeof payload.id === 'string' ? payload.id : payload.sub
  if (typeof userId !== 'string') {
    return response.status(401).json({ success: false, error: { message: 'Invalid token' } })
  }
  try {
    if (payload.sid !== undefined) {
      if (typeof payload.sid !== 'string') {
        return response.status(401).json({ success: false, error: { message: 'Invalid token' } })
      }
      const session = await pool.query(
        'SELECT id FROM user_sessions WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL AND expires_at > now()',
        [payload.sid, userId],
      )
      if (!session.rowCount) {
        return response.status(401).json({ success: false, error: { message: 'Session expired or revoked' } })
      }
    }
    request.user = { ...payload, id: userId }
    return next()
  } catch (error) {
    return next(error)
  }
}

export function requireAdmin(request, response, next) {
  if (!env.adminPanelEmails.includes(String(request.user?.email || '').toLowerCase())) {
    return response.status(403).json({ success: false, error: { message: 'Administrator access required' } })
  }
  return next()
}
