import { Router } from 'express'
import { generateTrip, PlannerError } from '../services/tripPlannerService.js'

const router = Router()
const windows = new Map()
const active = new Set()
router.post('/', async (request, response) => {
  const key = request.ip || 'unknown'
  const now = Date.now()
  for (const [ip, window] of windows) if (window.expires <= now) windows.delete(ip)
  const window = windows.get(key) || { count: 0, expires: now + 60000 }
  if (window.count >= 5 || active.has(key) || active.size >= 20 || windows.size >= 10000) {
    response.set('Retry-After', '60')
    return response.status(429).json({ success: false, error: { message: 'Please wait a minute before planning again.' } })
  }
  window.count += 1
  windows.set(key, window)
  active.add(key)
  try {
    const data = await generateTrip(request.body)
    response.set('Cache-Control', 'no-store')
    return response.json({ success: true, data })
  } catch (error) {
    const status = error instanceof PlannerError ? error.status : 500
    if (status === 429) response.set('Retry-After', '60')
    return response.status(status).json({ success: false, error: { message: error instanceof PlannerError ? error.message : 'Unable to plan your trip right now. Please try again.' } })
  } finally { active.delete(key) }
})
export default router
