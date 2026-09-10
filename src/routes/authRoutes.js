import { Router } from 'express'
<<<<<<< HEAD
import { login, register } from '../controllers/authController.js'
=======
import { googleAuth, login, me, register } from '../controllers/authController.js'
import { requireAuth } from '../middlewares/authMiddleware.js'
>>>>>>> dev

const router = Router()

router.post('/register', register)
router.post('/login', login)
<<<<<<< HEAD
=======
router.post('/google', googleAuth)
router.get('/me', requireAuth, me)
>>>>>>> dev

export default router
