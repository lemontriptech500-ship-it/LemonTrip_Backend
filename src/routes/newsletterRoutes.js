import { Router } from 'express'
import { subscribe, unsubscribe, unsubscribeByToken, send, sendTest } from '../controllers/newsletterController.js'
import { requireAuth, requireAdmin } from '../middlewares/authMiddleware.js'

const router = Router()

router.post('/subscribe', subscribe)
router.post('/unsubscribe', unsubscribe)
router.get('/unsubscribe', unsubscribeByToken)
router.post('/send', requireAuth, requireAdmin, send)
router.post('/send-test', requireAuth, requireAdmin, sendTest)

export default router
