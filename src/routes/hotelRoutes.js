import { Router } from 'express'
import { getHotel, search } from '../controllers/hotelController.js'

const router = Router()

router.get('/search', search)
router.get('/:hotelId', getHotel)

export default router