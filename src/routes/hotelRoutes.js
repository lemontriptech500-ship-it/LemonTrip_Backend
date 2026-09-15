import { Router } from 'express'
import { getHotel, search } from '../controllers/hotelController.js'
import { cancelHotelBooking } from '../controllers/hotelBookingController.js'
import { requireAuth } from '../middlewares/authMiddleware.js'

const router = Router()

router.get('/search', search)
router.post('/bookings/:bookingId/cancel', requireAuth, cancelHotelBooking)
router.get('/:hotelId', getHotel)

export default router