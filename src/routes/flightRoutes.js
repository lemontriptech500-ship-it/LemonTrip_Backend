import { Router } from 'express'
import { getFlight, search } from '../controllers/flightController.js'

const router = Router()

router.get('/search', search)
router.get('/:flightId', getFlight)

export default router
