import { Router } from 'express'
import { getWallet, createTopupOrder, verifyTopup, getTransactions } from '../controllers/walletController.js'
import { requireAuth } from '../middlewares/authMiddleware.js'

const router = Router()

router.use(requireAuth)
router.get('/', getWallet)
router.post('/topup/order', createTopupOrder)
router.post('/topup/verify', verifyTopup)
router.get('/transactions', getTransactions)

export default router
