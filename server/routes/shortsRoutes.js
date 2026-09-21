import { Router } from 'express'
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.js'
import { requireCreator } from '../middleware/creatorAuth.js'
import { rateLimit } from '../middleware/rateLimit.js'
import multer from 'multer'
import { createShort, getShorts, getShort, recordShortView, likeShort, bookmarkShort, shareShort, listShortComments, createShortComment, removeShort, getCreatorShorts } from '../controllers/shortsController.js'

const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v']
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024

function shortsFileFilter(req, file, cb) {
  if (file.fieldname === 'video') {
    if (VIDEO_TYPES.includes(file.mimetype)) return cb(null, true)
    return cb(new Error('Unsupported video type'))
  }
  if (file.fieldname === 'thumbnail') {
    if (IMAGE_TYPES.includes(file.mimetype)) return cb(null, true)
    return cb(new Error('Unsupported thumbnail type'))
  }
  return cb(null, false)
}

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: shortsFileFilter,
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 2 },
})

function uploadFields(req, res, next) {
  upload.fields([{ name: 'video', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }], (err) => {
    if (err) {
      const status = err instanceof multer.MulterError ? (err.code === 'LIMIT_FILE_SIZE' ? 413 : 400) : 400
      return res.status(status).json({ error: err.message || 'Upload failed' })
    }
    next()
  })
}

const router = Router()

router.get('/', optionalAuthMiddleware, getShorts)
router.get('/creator/:id', optionalAuthMiddleware, getCreatorShorts)
router.get('/:id', authMiddleware, getShort)
router.post('/', authMiddleware, requireCreator, rateLimit({ action: 'shorts-upload', max: 15, windowMs: 3600000 }), uploadFields, createShort)
router.post('/:id/view', optionalAuthMiddleware, rateLimit({ action: 'shorts-view', max: 60, windowMs: 60000 }), recordShortView)
router.post('/:id/like', authMiddleware, rateLimit({ action: 'shorts-like', max: 60 }), likeShort)
router.post('/:id/bookmark', authMiddleware, rateLimit({ action: 'shorts-bookmark', max: 60 }), bookmarkShort)
router.post('/:id/share', authMiddleware, rateLimit({ action: 'shorts-share', max: 10 }), shareShort)
router.get('/:id/comments', listShortComments)
router.post('/:id/comment', authMiddleware, rateLimit({ action: 'shorts-comment', max: 10 }), createShortComment)
router.delete('/:id', authMiddleware, removeShort)

export default router