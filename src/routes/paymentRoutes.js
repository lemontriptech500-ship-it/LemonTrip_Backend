import { Router } from 'express'
import { createFlightOrder, verifyFlightPayment, createTravelOrder, verifyTravelPayment } from '../controllers/paymentController.js'
import { createHotelOrder, verifyHotelPayment } from '../controllers/hotelBookingController.js'
import { requireAuth } from '../middlewares/authMiddleware.js'

const router = Router()

router.post('/razorpay/flights/order', createFlightOrder)
router.post('/razorpay/flights/verify', verifyFlightPayment)
router.post('/razorpay/travel/order', createTravelOrder)
router.post('/razorpay/travel/verify', verifyTravelPayment)
router.post('/razorpay/hotels/order', requireAuth, createHotelOrder)
router.post('/razorpay/hotels/verify', requireAuth, verifyHotelPayment)

export default router