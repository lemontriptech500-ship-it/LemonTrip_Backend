import { Router } from 'express'
import { chat } from '../controllers/chatController.js'
import { optionalAuth } from '../middlewares/optionalAuthMiddleware.js'

const router = Router()
router.post('/', optionalAuth, chat)
export default router