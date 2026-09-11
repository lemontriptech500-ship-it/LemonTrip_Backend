import { Router } from 'express'
import { getPost, listPosts } from '../controllers/blogController.js'

const router = Router()

router.get('/', listPosts)
router.get('/:postId', getPost)

export default router