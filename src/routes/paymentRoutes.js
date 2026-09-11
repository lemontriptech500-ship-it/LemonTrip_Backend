import { Router } from 'express'
import { createFlightOrder, verifyFlightPayment } from '../controllers/paymentController.js'

const router = Router()

router.post('/razorpay/flights/order', createFlightOrder)
router.post('/razorpay/flights/verify', verifyFlightPayment)

export default router