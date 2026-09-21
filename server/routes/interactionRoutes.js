import { Router } from 'express'
import multer from 'multer'
import { authMiddleware } from '../middleware/auth.js'
import { toggleLike, checkLike, postComment, listComments, removeComment, toggleFollow, checkFollow, followStats, listFollowers, listFollowing, uploadCommentMedia, getCreatorLiked } from '../controllers/interactionController.js'

const commentUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 * 15 } })

const router = Router()

router.get('/creator/:id/liked', getCreatorLiked)
router.post('/like', authMiddleware, toggleLike)
router.get('/like', authMiddleware, checkLike)
router.post('/comment', authMiddleware, postComment)
router.post('/comment-media', authMiddleware, commentUpload.single('media'), uploadCommentMedia)
router.get('/comments', listComments)
router.delete('/comment/:id', authMiddleware, removeComment)
router.post('/follow', authMiddleware, toggleFollow)
router.get('/follow', authMiddleware, checkFollow)
router.get('/follow-stats', followStats)
router.get('/followers', listFollowers)
router.get('/following', listFollowing)

export default router
