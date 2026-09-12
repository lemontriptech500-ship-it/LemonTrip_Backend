import { Router } from 'express'
import { getWallet, createTopupOrder, verifyTopup, debitWallet, createWalletTravelBooking, createWalletFlightBooking, getTransactions } from '../controllers/walletController.js'
import { requireAuth } from '../middlewares/authMiddleware.js'

const router = Router()

router.use(requireAuth)
router.get('/', getWallet)
router.post('/topup/order', createTopupOrder)
router.post('/topup/verify', verifyTopup)
router.post('/debit', debitWallet)
router.post('/travel-booking', createWalletTravelBooking)
router.post('/flight-booking', createWalletFlightBooking)
router.get('/transactions', getTransactions)

export default router
