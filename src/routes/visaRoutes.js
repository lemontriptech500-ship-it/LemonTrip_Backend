import { Router } from 'express'
import { createApplication, listServices } from '../controllers/visaController.js'
import { requireAuth } from '../middlewares/authMiddleware.js'

const router = Router()

router.get('/services', listServices)
router.post('/applications', requireAuth, createApplication)

export default router
