import { Router } from 'express'
import { getCab, search } from '../controllers/cabController.js'

const router = Router()

router.get('/search', search)
router.get('/:cabId', getCab)

export default router
