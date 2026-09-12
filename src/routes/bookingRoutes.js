import { Router } from 'express'
import { getRecentBookings } from '../controllers/bookingController.js'
import { requireAuth } from '../middlewares/authMiddleware.js'

const router = Router()

router.get('/recent', requireAuth, getRecentBookings)

export default router