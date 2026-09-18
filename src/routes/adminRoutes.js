import { Router } from 'express'
import { requireAuth, requireAdmin } from '../middlewares/authMiddleware.js'
import {
  getStats,
  listUsers,
  getUser,
  listBookings,
  listCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  listBlogPostsAdmin,
  createBlogPost,
  updateBlogPost,
  deleteBlogPost,
  listVisaApplications,
  getVisaApplicationAdmin,
  updateVisaApplicationStatus,
  getVisaApplicationDocumentAdmin,
  listContactMessages,
  updateContactMessageStatus,
  listNewsletterSubscribers,
} from '../controllers/adminController.js'

const router = Router()

// Every route below requires a logged-in user whose email is in ADMIN_EMAILS
router.use(requireAuth, requireAdmin)

router.get('/stats', getStats)

router.get('/users', listUsers)
router.get('/users/:userId', getUser)

router.get('/bookings', listBookings)

router.get('/coupons', listCoupons)
router.post('/coupons', createCoupon)
router.patch('/coupons/:couponId', updateCoupon)
router.delete('/coupons/:couponId', deleteCoupon)

router.get('/blog', listBlogPostsAdmin)
router.post('/blog', createBlogPost)
router.patch('/blog/:postId', updateBlogPost)
router.delete('/blog/:postId', deleteBlogPost)

router.get('/visa-applications', listVisaApplications)
router.get('/visa-applications/:applicationId', getVisaApplicationAdmin)
router.patch('/visa-applications/:applicationId/status', updateVisaApplicationStatus)
router.get('/visa-applications/:applicationId/documents/:documentType', getVisaApplicationDocumentAdmin)

router.get('/contact-messages', listContactMessages)
router.patch('/contact-messages/:messageId/status', updateContactMessageStatus)

router.get('/newsletter-subscribers', listNewsletterSubscribers)

export default router
