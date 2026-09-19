import { Router } from 'express'
import { requireAdmin, requireAuth } from '../middlewares/authMiddleware.js'
import { createPackage, deletePackage, listPackages, updatePackage } from '../controllers/adminPackageController.js'

const router = Router()
router.use(requireAuth, requireAdmin)
router.get('/', listPackages)
router.post('/', createPackage)
router.patch('/:packageId', updatePackage)
router.delete('/:packageId', deletePackage)

export default router
