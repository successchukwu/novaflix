import { Router } from 'express'
import { authMiddleware } from '../middleware/auth.js'
import { requireCreator } from '../middleware/creatorAuth.js'
import * as creatorController from '../controllers/creatorController.js'
import * as youtubeController from '../controllers/youtubeController.js'
import * as tools from '../controllers/creatorToolsController.js'
import * as liveStream from '../controllers/liveStreamController.js'
import { getMyEarnings } from '../controllers/creatorEarningsController.js'
import multer from 'multer'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 * 1024 } })

const router = Router()

// Public routes — no auth required
router.get('/public', creatorController.getPublicCreators)
router.get('/search', creatorController.searchCreators)

// Creator-only routes — require auth + creator role
router.post('/upload', authMiddleware, requireCreator, upload.fields([{ name: 'video', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }]), creatorController.addUploadHandler)
router.post('/youtube/preview', authMiddleware, requireCreator, youtubeController.youtubePreview)
router.post('/youtube/import', authMiddleware, requireCreator, youtubeController.youtubeImport)
router.get('/youtube/imports/:jobId', authMiddleware, requireCreator, youtubeController.youtubeImportStatus)
router.get('/uploads', authMiddleware, requireCreator, creatorController.getUploads)
router.put('/uploads/:id', authMiddleware, requireCreator, upload.single('thumbnail'), creatorController.updateUploadHandler)
router.get('/stats', authMiddleware, requireCreator, creatorController.getStats)
router.get('/dashboard', authMiddleware, requireCreator, creatorController.getDashboard)
router.get('/comments', authMiddleware, requireCreator, creatorController.getCreatorComments)
router.get('/graph', authMiddleware, requireCreator, creatorController.getGraph)
router.get('/earnings', authMiddleware, requireCreator, getMyEarnings)

// Creator tools: PPM config, stream keys, onboarding, stream lifecycle
router.get('/ppm/config', authMiddleware, requireCreator, tools.getPpmConfig)
router.put('/ppm/config', authMiddleware, requireCreator, tools.savePpmConfig)
router.get('/stream/key', authMiddleware, requireCreator, tools.getStreamKey)
router.post('/stream/key/regenerate', authMiddleware, requireCreator, tools.regenerateStreamKey)
router.get('/stream/status', authMiddleware, requireCreator, tools.getStreamStatus)
router.get('/stream/info', authMiddleware, requireCreator, liveStream.getCreatorStreamInfo)
router.post('/stream/start', authMiddleware, requireCreator, tools.startStream)
router.post('/stream/end', authMiddleware, requireCreator, tools.endStream)
router.get('/onboarding', authMiddleware, requireCreator, tools.getOnboarding)
router.post('/onboarding', authMiddleware, requireCreator, tools.saveOnboarding)
router.delete('/uploads/:id', authMiddleware, requireCreator, tools.deleteUpload)

export default router
