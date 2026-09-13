import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'

export function optionalAuth(request, _response, next) {
  const authorization = request.headers.authorization
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null
  if (token) {
    try {
      request.user = jwt.verify(token, env.jwtSecret)
    } catch {
      request.user = null
    }
  }
  return next()
}