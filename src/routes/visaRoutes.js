import { Router } from 'express'
import { createApplication, getService, listServices, trackApplication } from '../controllers/visaController.js'
import { requireAuth } from '../middlewares/authMiddleware.js'
import { uploadVisaDocuments } from '../middlewares/upload.js'

const router = Router()

router.get('/services', listServices)
router.get('/services/:serviceId', getService)
router.post('/applications', requireAuth, uploadVisaDocuments, createApplication)
router.get('/applications/:applicationId', requireAuth, trackApplication)

export default router