import { Router } from 'express'
import { availability, bookingStatus, cancelBooking, getTrain, pnrStatus, providerStatus, search } from '../controllers/trainController.js'
import { requireAuth } from '../middlewares/authMiddleware.js'

const router = Router()

router.get('/search', search)
router.post('/availability', availability)
router.get('/provider-status', providerStatus)
router.get('/pnr/:pnr', requireAuth, pnrStatus)
router.get('/bookings/:id/status', requireAuth, bookingStatus)
router.post('/bookings/:id/cancel', requireAuth, cancelBooking)
router.get('/:trainId', getTrain)

export default router
