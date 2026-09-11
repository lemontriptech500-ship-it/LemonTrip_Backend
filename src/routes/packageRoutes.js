import { Router } from 'express'
import { getPackage, search } from '../controllers/packageController.js'

const router = Router()

router.get('/search', search)
router.get('/:packageId', getPackage)

export default router