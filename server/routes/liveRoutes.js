import { Router } from 'express'
import { optionalAuthMiddleware } from '../middleware/auth.js'
import * as live from '../controllers/liveStreamController.js'

const router = Router()

// Public viewer-facing live endpoints (optional auth so guests can watch)
router.get('/live', optionalAuthMiddleware, live.listLiveStreamsHandler)
router.get('/:id', optionalAuthMiddleware, live.getLiveStreamHandler)
router.post('/:id/chat', optionalAuthMiddleware, live.postLiveChat)

export default router
