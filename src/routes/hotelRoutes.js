import { Router } from 'express'
import { catalog, getHotel, search } from '../controllers/hotelController.js'
import { cancelHotelBooking } from '../controllers/hotelBookingController.js'
import { requireAuth } from '../middlewares/authMiddleware.js'

const router = Router()

router.get('/search', search)
router.get('/catalog', catalog)
router.post('/bookings/:bookingId/cancel', requireAuth, cancelHotelBooking)
router.get('/:hotelId', getHotel)

export default router
