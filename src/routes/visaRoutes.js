import { Router } from 'express'
import {
  createApplication,
  getApplicationDocument,
  listApplications,
  getService,
  listServices,
  trackApplication,
} from '../controllers/visaController.js'
import { requireAuth } from '../middlewares/authMiddleware.js'
import { uploadVisaDocuments } from '../middlewares/upload.js'

const router = Router()

router.get('/services', listServices)
router.get('/services/:serviceId', getService)
router.post('/applications', requireAuth, uploadVisaDocuments, createApplication)
router.get('/applications', requireAuth, listApplications)
router.get('/applications/:applicationId', requireAuth, trackApplication)
router.get('/applications/:applicationId/documents/:documentType', requireAuth, getApplicationDocument)

export default router
