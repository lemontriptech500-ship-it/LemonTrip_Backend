import { answerChat } from '../services/aiChatService.js'

const windows = new Map()
const WINDOW_MS = 60_000
const MAX_REQUESTS = 20

function enforceRateLimit(request) {
  const key = request.user?.id ? `user:${request.user.id}` : `ip:${request.ip || 'unknown'}`
  const now = Date.now()
  const current = windows.get(key)
  if (!current || now - current.startedAt >= WINDOW_MS) {
    windows.set(key, { startedAt: now, count: 1 })
    return true
  }
  current.count += 1
  return current.count <= MAX_REQUESTS
}

export async function chat(request, response, next) {
  try {
    if (!enforceRateLimit(request)) return response.status(429).json({ success: false, error: { message: 'Chat limit reached. Please try again shortly.' } })
    const { message, history = [], conversationId = null, liveContext = null } = request.body || {}
    if (typeof message !== 'string' || !message.trim() || message.length > 1200) {
      return response.status(400).json({ success: false, error: { message: 'A message up to 1200 characters is required.' } })
    }
    const data = await answerChat({ message: message.trim(), history, conversationId, userId: request.user?.id || null, liveContext })
    return response.json({ success: true, data: { answer: data.answer, conversationId: data.conversationId } })
  } catch (error) {
    return next(error)
  }
}