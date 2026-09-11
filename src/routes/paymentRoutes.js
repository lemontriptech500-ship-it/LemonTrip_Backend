import { Router } from 'express'
import { createFlightOrder, verifyFlightPayment, createTravelOrder, verifyTravelPayment } from '../controllers/paymentController.js'

const router = Router()

router.post('/razorpay/flights/order', createFlightOrder)
router.post('/razorpay/flights/verify', verifyFlightPayment)
router.post('/razorpay/travel/order', createTravelOrder)
router.post('/razorpay/travel/verify', verifyTravelPayment)

export default router