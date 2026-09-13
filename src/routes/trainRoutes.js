import { Router } from 'express'
import { availability, cancel, getTrain, pnrStatus, search } from '../controllers/trainController.js'

const router = Router()

router.get('/search', search)
router.post('/availability', availability)
router.get('/pnr/:pnr', pnrStatus)
router.post('/bookings/:providerReference/cancel', cancel)
router.get('/:trainId', getTrain)

export default router
