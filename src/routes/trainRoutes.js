import { Router } from 'express'
import { getTrain, search } from '../controllers/trainController.js'

const router = Router()

router.get('/search', search)
router.get('/:trainId', getTrain)

export default router
