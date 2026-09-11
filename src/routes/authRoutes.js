import { Router } from 'express'
import { googleAuth, login, me, register, updateProfile } from '../controllers/authController.js'
import { requireAuth } from '../middlewares/authMiddleware.js'

const router = Router()

router.post('/register', register)
router.post('/login', login)
router.post('/google', googleAuth)
router.get('/me', requireAuth, me)
router.patch('/me', requireAuth, updateProfile)

export default router