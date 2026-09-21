import { v4 as uuidv4 } from 'uuid'
import fs from 'fs'
import pool from '../config/database.js'
import { addUpload, getUploadsByUserId, getTipsForCreator, getCommentsForCreator, getTotalLikesForCreator, getCreatorDashboardStats, updateUpload, getUploadById } from '../db.js'
import { uploadFile, uploadStream } from '../lib/r2.js'

function cleanupFiles(files) {
  for (const f of files || []) {
    if (!f?.path) continue
    fs.unlink(f.path, () => {})
  }
}

export async function addUploadHandler(req, res) {
  const toCleanup = []
  // Abort cleanup: if client disconnects, remove temp files
  req.on('close', () => {
    if (!res.writableFinished) cleanupFiles(toCleanup)
  })
  try {
    const { title, description, genre } = req.body
    if (!title || !genre) {
      cleanupFiles([...(req.files?.video || []), ...(req.files?.thumbnail || [])])
      return res.status(400).json({ error: 'Title and genre required' })
    }

    const videoFile = req.files?.video?.[0]
    const thumbFile = req.files?.thumbnail?.[0]
    if (videoFile) toCleanup.push(videoFile)
    if (thumbFile) toCleanup.push(thumbFile)
    const ext = videoFile ? videoFile.originalname.split('.').pop() || 'mp4' : 'mp4'
    const id = uuidv4()
    const videoKey = `movies/${req.userId}/${id}.${ext}`
    let videoUrl = ''

    if (videoFile) {
      const filePath = videoFile.path
      const result = filePath
        ? await uploadStream({ filePath, key: videoKey, contentType: videoFile.mimetype, fileSize: videoFile.size })
        : await uploadFile({ buffer: videoFile.buffer, key: videoKey, contentType: videoFile.mimetype })
      if (!result.success) {
        cleanupFiles(toCleanup)
        return res.status(500).json({ error: 'Video upload failed' })
      }
      videoUrl = result.url
    }

    let thumbnailUrl = ''
    if (thumbFile) {
      const thumbKey = `movies/${req.userId}/${id}-thumb.jpg`
      const thumbPath = thumbFile.path
      const result = thumbPath
        ? await uploadStream({ filePath: thumbPath, key: thumbKey, contentType: thumbFile.mimetype, fileSize: thumbFile.size })
        : await uploadFile({ buffer: thumbFile.buffer, key: thumbKey, contentType: thumbFile.mimetype })
      if (result.success) thumbnailUrl = result.url
    }

    const upload = {
      id,
      userId: req.userId,
      title,
      description: description || '',
      genre,
      filename: videoUrl,
      thumbnailUrl,
      filesize: videoFile?.size || 0,
      status: 'active',
      views: 0,
      minutesWatched: 0,
      revenue: 0,
    }
    await addUpload(upload)
    cleanupFiles(toCleanup)
    res.json({ success: true, upload })
  } catch (err) {
    cleanupFiles(toCleanup)
    res.status(500).json({ error: err.message })
  }
}

export async function getUploads(req, res) {
  try {
    const uploads = await getUploadsByUserId(req.userId)
    res.json({ success: true, uploads })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function updateUploadHandler(req, res) {
  const toCleanup = req.file ? [req.file] : []
  req.on('close', () => { if (!res.writableFinished) cleanupFiles(toCleanup) })
  try {
    const { id } = req.params
    const { title, description, genre } = req.body

    const thumbFile = req.file

    let thumbnailUrl
    if (thumbFile) {
      const thumbKey = `movies/${req.userId}/${id}-thumb.jpg`
      const thumbPath = thumbFile.path
      const result = thumbPath
        ? await uploadStream({ filePath: thumbPath, key: thumbKey, contentType: thumbFile.mimetype, fileSize: thumbFile.size })
        : await uploadFile({ buffer: thumbFile.buffer, key: thumbKey, contentType: thumbFile.mimetype })
      if (result.success) thumbnailUrl = result.url
    }

    const fields = {}
    if (title) fields.title = title
    if (description !== undefined) fields.description = description
    if (genre) fields.genre = genre
    if (thumbnailUrl) fields.thumbnail_url = thumbnailUrl

    if (Object.keys(fields).length === 0) {
      cleanupFiles(toCleanup)
      return res.status(400).json({ error: 'Nothing to update' })
    }

    const updated = await updateUpload(id, fields)
    cleanupFiles(toCleanup)
    res.json({ success: true, upload: updated })
  } catch (err) {
    cleanupFiles(toCleanup)
    res.status(500).json({ error: err.message })
  }
}

export async function getStats(req, res) {
  try {
    const [uploads, tips] = await Promise.all([
      getUploadsByUserId(req.userId),
      getTipsForCreator(req.userId),
    ])
    const totalViews = uploads.reduce((acc, u) => acc + (u.views || 0), 0)
    const totalMinutes = uploads.reduce((acc, u) => acc + (u.minutes_watched || 0), 0)
    const totalRevenue = uploads.reduce((acc, u) => acc + parseFloat(u.revenue || 0), 0)
    const tipTotal = tips.reduce((acc, t) => acc + parseFloat(t.amount || 0), 0)

    res.json({
      success: true,
      stats: {
        totalUploads: uploads.length,
        totalViews,
        totalMinutesWatched: totalMinutes,
        revenue: totalRevenue + tipTotal,
        tipRevenue: tipTotal,
        uploads,
        recentTips: tips.slice(-5),
      },
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function getDashboard(req, res) {
  try {
    const [uploads, tips, stats, comments, likesCount] = await Promise.all([
      getUploadsByUserId(req.userId),
      getTipsForCreator(req.userId),
      getCreatorDashboardStats(req.userId),
      getCommentsForCreator(req.userId, 10),
      getTotalLikesForCreator(req.userId),
    ])
    const totalViews = uploads.reduce((acc, u) => acc + (u.views || 0), 0)
    const totalMinutes = uploads.reduce((acc, u) => acc + (u.minutes_watched || 0), 0)
    const totalRevenue = uploads.reduce((acc, u) => acc + parseFloat(u.revenue || 0), 0)
    const tipTotal = tips.reduce((acc, t) => acc + parseFloat(t.amount || 0), 0)

    res.json({
      success: true,
      dashboard: {
        totalUploads: uploads.length,
        totalViews,
        totalMinutesWatched: totalMinutes,
        revenue: totalRevenue + tipTotal,
        tipRevenue: tipTotal,
        totalLikes: likesCount,
        totalComments: stats.totalComments,
        uploads,
        recentComments: comments,
        recentTips: tips.slice(-5),
        stats,
      },
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function getCreatorComments(req, res) {
  try {
    const comments = await getCommentsForCreator(req.userId)
    res.json({ success: true, comments })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function getPublicCreators(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.avatar, u.bio,
              cp.known_for_department,
              (SELECT COUNT(*)::int FROM uploads WHERE user_id = u.id AND status = 'active') as film_count,
              (SELECT COALESCE(SUM(views), 0)::bigint FROM uploads WHERE user_id = u.id AND status = 'active') as total_views,
              (SELECT COUNT(*)::int FROM likes WHERE creator_id = u.id) as total_likes,
              (SELECT COUNT(*)::int FROM followers WHERE following_id = u.id) as followers_count
       FROM users u
       LEFT JOIN creator_profiles cp ON cp.user_id = u.id
       WHERE u.role = 'creator'
       ORDER BY followers_count DESC, u.created_at DESC
       LIMIT 20`
    )
    res.json({ success: true, creators: rows })
  } catch (err) {
    console.error('[creator] public list failed:', err.message)
    res.status(500).json({ success: false, error: 'Could not load creators' })
  }
}

export async function getGraph(req, res) {
  try {
    const { getArtistGraph } = await import('../db.js')
    const edges = await getArtistGraph(req.userId)
    res.json({ success: true, edges })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function searchCreators(req, res) {
  try {
    const { q } = req.query
    if (!q || q.trim().length < 2) {
      return res.json({ success: true, creators: [] })
    }
    const query = `%${q.trim()}%`
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.avatar, u.bio, u.verified,
              cp.known_for_department, cp.tmdb_person_id,
              (SELECT COUNT(*) FROM uploads WHERE user_id = u.id AND status = 'active') as film_count,
              (SELECT COALESCE(SUM(views), 0) FROM uploads WHERE user_id = u.id AND status = 'active') as total_views,
              (SELECT COUNT(*) FROM likes WHERE creator_id = u.id) as total_likes,
              (SELECT COUNT(*) FROM followers WHERE following_id = u.id) as followers_count
       FROM users u
       JOIN creator_profiles cp ON cp.user_id = u.id
       WHERE u.role = 'creator'
         AND (u.name ILIKE $1 OR cp.display_name ILIKE $1 OR u.bio ILIKE $1)
       ORDER BY total_likes DESC
       LIMIT 20`,
      [query]
    )
    res.json({ success: true, creators: rows })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function getCreatorByTmdbId(req, res) {
  try {
    const tmdbId = parseInt(req.params.tmdbId, 10);
    if (!tmdbId || isNaN(tmdbId)) return res.status(400).json({ error: 'tmdbId required' });
    const { rows } = await pool.query(
      `SELECT u.id as user_id, u.name, u.avatar, u.bio, cp.tmdb_person_id, cp.display_name, cp.known_for_department,
              (SELECT COUNT(*)::int FROM uploads WHERE user_id = u.id AND status='active') as film_count,
              (SELECT COALESCE(SUM(views),0)::bigint FROM uploads WHERE user_id = u.id AND status='active') as total_views,
              (SELECT COUNT(*)::int FROM followers WHERE following_id = u.id) as followers_count
       FROM creator_profiles cp
       JOIN users u ON u.id = cp.user_id
       WHERE cp.tmdb_person_id = $1
       LIMIT 1`,
      [tmdbId]
    );
    if (rows.length === 0) return res.json({ success: false, error: 'Creator not found for tmdbId' });
    res.json({ success: true, creator: rows[0] });
  } catch (err) {
    console.error('[creator] by-tmdb failed:', err.message);
    res.status(500).json({ error: err.message });
  }
}

export async function getPublicUploadsByCreator(req, res) {
  try {
    const creatorId = req.params.id
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(creatorId)) {
      return res.json({ success: true, uploads: [], total: 0, page: 1 })
    }
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1)
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50)
    const offset = (page - 1) * limit
    const { rows } = await pool.query(
      `SELECT id, title, description, genre, filename, thumbnail_url, views, duration_seconds, created_at
       FROM uploads WHERE user_id = $1 AND status = 'active'
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [creatorId, limit, offset]
    )
    const { rows: [{ total }] } = await pool.query(
      `SELECT COUNT(*)::int AS total FROM uploads WHERE user_id = $1 AND status = 'active'`,
      [creatorId]
    )
    res.json({ success: true, uploads: rows, total, page, nextPage: rows.length === limit ? page + 1 : undefined })
  } catch (err) {
    console.error('[creator] public uploads failed:', err.message)
    res.status(500).json({ error: err.message })
  }
}
