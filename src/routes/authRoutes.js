import { Router } from 'express'
import { forgotPassword, googleAuth, login, me, register, resetPassword, updateProfile } from '../controllers/authController.js'
import { requireAuth } from '../middlewares/authMiddleware.js'

const router = Router()

router.post('/register', register)
router.post('/login', login)
router.post('/google', googleAuth)
router.post('/forgot-password', forgotPassword)
router.post('/reset-password', resetPassword)
router.get('/me', requireAuth, me)
router.patch('/me', requireAuth, updateProfile)

export default router