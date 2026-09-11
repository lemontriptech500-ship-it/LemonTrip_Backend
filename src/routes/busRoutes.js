import { Router } from 'express'
import { getBus, search } from '../controllers/busController.js'

const router = Router()

router.get('/search', search)
router.get('/:busId', getBus)

export default router