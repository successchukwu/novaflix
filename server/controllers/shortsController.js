import { v4 as uuidv4 } from 'uuid'
import { addShort, getShortsFeed, getShortsCount, getShortById, incrementShortViews, toggleShortLike, toggleShortBookmark, incrementShortShares, getShortComments, addShortComment, hasUserLikedShort, deleteShort } from '../db.js'
import { uploadFile, deleteFile } from '../lib/r2.js'
import { broadcastFeed } from '../services/realtime.js'
import pool from '../config/database.js'

const ALLOWED_VIDEO_EXT = new Set(['mp4', 'mov', 'webm', 'm4v'])
const ALLOWED_IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp'])
const MAX_DURATION_SECONDS = 300
const MAX_COMMENT_LENGTH = 600

const safeExt = (name = '') => (name.split('.').pop() || '').toLowerCase()

export async function createShort(req, res) {
  let uploadedKeys = []
  try {
    const { title, description, durationSeconds } = req.body
    if (!title) return res.status(400).json({ error: 'Title required' })

    const videoFile = req.files?.video?.[0]
    if (!videoFile) return res.status(400).json({ error: 'Video file required' })

    const ext = safeExt(videoFile.originalname)
    if (!ALLOWED_VIDEO_EXT.has(ext)) {
      return res.status(400).json({ error: `Unsupported video type .${ext}` })
    }
    const duration = parseInt(durationSeconds, 10)
    if (!duration || duration < 1 || duration > MAX_DURATION_SECONDS) {
      return res.status(400).json({ error: `durationSeconds must be between 1 and ${MAX_DURATION_SECONDS}` })
    }

    const id = uuidv4()
    const videoKey = `shorts/${req.userId}/${id}.${ext}`
    const result = await uploadFile({ buffer: videoFile.buffer, key: videoKey, contentType: videoFile.mimetype })
    if (!result.success) return res.status(500).json({ error: 'Video upload failed' })
    uploadedKeys.push(videoKey)

    let thumbnailUrl = ''
    let thumbnailKey = ''
    const thumbFile = req.files?.thumbnail?.[0]
    if (thumbFile) {
      const thumbExt = safeExt(thumbFile.originalname)
      if (ALLOWED_IMAGE_EXT.has(thumbExt)) {
        thumbnailKey = `shorts/${req.userId}/${id}-thumb.${thumbExt}`
        const tRes = await uploadFile({ buffer: thumbFile.buffer, key: thumbnailKey, contentType: thumbFile.mimetype })
        if (tRes.success) {
          thumbnailUrl = tRes.url
          uploadedKeys.push(thumbnailKey)
        }
      }
    }

    const short = {
      id,
      userId: req.userId,
      title,
      description: description || '',
      videoUrl: result.url,
      thumbnailUrl,
      durationSeconds: duration,
      status: 'active',
      videoKey,
      thumbnailKey,
    }
    const created = await addShort(short)
    broadcastFeed({
      type: 'shorts:new',
      short: { ...created, creator_name: req.user?.name || null, creator_avatar: req.user?.avatar || null },
    })
    res.json({ success: true, short: created })
  } catch (err) {
    for (const key of uploadedKeys) {
      try { await deleteFile(key) } catch {}
    }
    res.status(500).json({ error: err.message })
  }
}

export async function getShorts(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1)
    const limit = 30
    const offset = (page - 1) * limit
    const [shorts, total] = await Promise.all([getShortsFeed(limit, offset, req.userId || null), getShortsCount()])
    res.json({ success: true, shorts, total, page, nextPage: offset + shorts.length < total ? page + 1 : undefined })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function getShort(req, res) {
  try {
    const short = await getShortById(req.params.id)
    if (!short) return res.status(404).json({ error: 'Short not found' })
    if (req.userId) short.liked = await hasUserLikedShort(short.id, req.userId)
    res.json({ success: true, short })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function recordShortView(req, res) {
  try {
    const updated = await incrementShortViews(req.params.id, req.userId || null)
    if (!updated) return res.status(404).json({ error: 'Short not found' })
    broadcastFeed({ type: 'shorts:view', shortId: req.params.id, views: updated.views })
    if (updated.user_id && !updated.alreadyViewed) {
      broadcastFeed({ type: 'view', contentType: 'creator', contentId: updated.user_id })
    }
    res.json({ success: true, views: updated.views, alreadyViewed: updated.alreadyViewed })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function likeShort(req, res) {
  try {
    if (!(await getShortById(req.params.id))) return res.status(404).json({ error: 'Short not found' })
    const result = await toggleShortLike(req.params.id, req.userId)
    broadcastFeed({ type: 'shorts:like', shortId: req.params.id, likes: result.likes })
    if (result.creator_id) {
      broadcastFeed({ type: 'like', contentType: 'creator', contentId: result.creator_id, liked: result.liked })
    }
    res.json({ success: true, ...result })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function bookmarkShort(req, res) {
  try {
    if (!(await getShortById(req.params.id))) return res.status(404).json({ error: 'Short not found' })
    const result = await toggleShortBookmark(req.params.id, req.userId)
    broadcastFeed({ type: 'shorts:bookmark', shortId: req.params.id, bookmarks: result.bookmarks })
    res.json({ success: true, ...result })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function shareShort(req, res) {
  try {
    if (!(await getShortById(req.params.id))) return res.status(404).json({ error: 'Short not found' })
    const result = await incrementShortShares(req.params.id, req.userId || null)
    broadcastFeed({ type: 'shorts:share', shortId: req.params.id, shares: result.shares })
    res.json({ success: true, ...result })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function listShortComments(req, res) {
  try {
    const { comments, total } = await getShortComments(req.params.id, req.query.page, req.query.limit)
    res.json({ success: true, comments, total })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function createShortComment(req, res) {
  try {
    const text = (req.body.text || '').trim()
    if (!text) return res.status(400).json({ error: 'Comment text required' })
    if (text.length > MAX_COMMENT_LENGTH) {
      return res.status(400).json({ error: `Comment exceeds ${MAX_COMMENT_LENGTH} characters` })
    }
    const comment = await addShortComment(req.params.id, req.userId, text)
    if (!comment) return res.status(404).json({ error: 'Short not found' })
    broadcastFeed({ type: 'shorts:comment', shortId: req.params.id, comment })
    res.json({ success: true, comment })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function removeShort(req, res) {
  try {
    const short = await getShortById(req.params.id)
    if (!short) return res.status(404).json({ error: 'Short not found' })
    if (short.user_id !== req.userId && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' })
    }
    const keys = [short.video_key, short.thumbnail_key].filter(Boolean)
    if (!short.video_key && short.video_url?.includes('shorts/')) {
      const parts = short.video_url.split('/').slice(-2).join('/')
      if (parts) keys.push(`shorts/${parts}`)
    }
    await deleteShort(short.id)
    await Promise.allSettled(keys.filter(Boolean).map((key) => deleteFile(key)))
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function getCreatorShorts(req, res) {
  try {
    const creatorId = req.params.id
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1)
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50)
    const offset = (page - 1) * limit
    
    const { rows, total } = await pool.query(
      `SELECT s.*, u.name as creator_name, u.avatar as creator_avatar
       FROM shorts s
       LEFT JOIN users u ON u.id = s.user_id
       WHERE s.user_id = $1 AND s.status = 'active'
       ORDER BY s.created_at DESC
       LIMIT $2 OFFSET $3`,
      [creatorId, limit, offset]
    )
    
    const totalRes = await pool.query(`SELECT COUNT(*) as count FROM shorts WHERE user_id = $1 AND status = 'active'`, [creatorId])
    const totalCount = parseInt(totalRes.rows[0].count, 10)
    
    // Mark pinned: highest viewed short gets pinned badge
    const maxViews = Math.max(...rows.map(r => r.views || 0), 0)
    const shortsWithPinned = rows.map(r => ({
      ...r,
      is_pinned: r.views === maxViews && maxViews > 0
    }))
    
    res.json({
      success: true,
      shorts: shortsWithPinned,
      total: totalCount,
      page,
      nextPage: offset + rows.length < totalCount ? page + 1 : undefined
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}