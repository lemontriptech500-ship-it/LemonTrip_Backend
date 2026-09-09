import { Router } from 'express'
import { googleAuth, login, me, register } from '../controllers/authController.js'
import { requireAuth } from '../middlewares/authMiddleware.js'

const router = Router()

router.post('/register', register)
router.post('/login', login)
router.post('/google', googleAuth)
router.get('/me', requireAuth, me)

export default router
