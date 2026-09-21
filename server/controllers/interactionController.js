import { v4 as uuidv4 } from 'uuid'
import { uploadFile } from '../lib/r2.js'
import { addLike, removeLike, getContentLikes, hasUserLiked, addComment, getContentComments, getContentCommentCount, deleteComment, getCommentsForCreator, addFollower, removeFollower, isFollowing, getFollowerCount, getFollowingCount, getFollowers, getFollowing, findUserById, checkAndAwardAchievements, addXp, recordFanEngagement, createNotification } from '../db.js'
import { notifyUser, broadcastFeed } from '../services/realtime.js'
import { notifyCreator } from '../services/creatorRealtime.js'
import pool from '../config/database.js'

function emitCreatorEngagement(creatorId, payload) {
  notifyCreator(creatorId, 'engagement', payload)
}

export async function uploadCommentMedia(req, res) {
  try {
    const file = req.file
    if (!file) return res.status(400).json({ error: 'media file required' })
    const ext = (file.originalname || '').split('.').pop() || (file.mimetype.startsWith('audio') ? 'webm' : 'mp4')
    const id = uuidv4()
    const key = `comment-media/${req.userId}/${id}.${ext}`
    const result = await uploadFile({ buffer: file.buffer, key, contentType: file.mimetype })
    if (!result.success) return res.status(500).json({ error: 'Media upload failed' })
    const mediaType = file.mimetype.startsWith('audio') ? 'voice' : 'video'
    res.json({ success: true, mediaUrl: result.url, mediaType })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function toggleLike(req, res) {
  try {
    const { contentId, contentType, creatorId } = req.body
    if (!contentId || !contentType) return res.status(400).json({ error: 'contentId and contentType required' })

    const liked = await hasUserLiked(req.userId, contentId, contentType)
    if (liked) {
      await removeLike(req.userId, contentId, contentType)
    } else {
      await addLike(req.userId, contentId, contentType, creatorId)
      addXp(req.userId, 2).catch(() => {})
      if (creatorId) await recordFanEngagement(req.userId, creatorId, 'like')
    }

    const count = await getContentLikes(contentId, contentType)
    checkAndAwardAchievements(req.userId).catch(() => {})
    broadcastFeed({ type: 'like', contentId, contentType, count, liked: !liked })
    if (creatorId) {
      emitCreatorEngagement(creatorId, { type: 'like', contentId, contentType, count, liked: !liked, at: Date.now() })
    }
    res.json({ success: true, liked: !liked, count })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function checkLike(req, res) {
  try {
    const { contentId, contentType } = req.query
    const liked = await hasUserLiked(req.userId, contentId, contentType)
    const count = await getContentLikes(contentId, contentType)
    res.json({ success: true, liked, count })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function postComment(req, res) {
  try {
    const { contentId, contentType, text, creatorId, parentId, mediaUrl, mediaType, durationSeconds, unlockAt, milestoneUnlock } = req.body
    if (!contentId || !contentType) return res.status(400).json({ error: 'contentId and contentType required' })
    if (!text && !mediaUrl) return res.status(400).json({ error: 'text or media required' })

    if (parentId) {
      const parent = await getContentComments(contentId, contentType, 1, 0)
      if (!parent.length) return res.status(404).json({ error: 'Parent comment not found' })
    }

    const comment = await addComment(req.userId, contentId, contentType, text || '', creatorId, {
      parentId,
      mediaUrl,
      mediaType,
      durationSeconds: durationSeconds ? parseInt(durationSeconds, 10) : null,
      unlockAt: unlockAt ? new Date(unlockAt) : null,
      milestoneUnlock,
    })
    addXp(req.userId, 3).catch(() => {})
    if (creatorId) await recordFanEngagement(req.userId, creatorId, 'comment')
    checkAndAwardAchievements(req.userId).catch(() => {})
    broadcastFeed({ type: 'comment', contentId, contentType, comment })
    if (creatorId && creatorId !== req.userId) {
      const [commenter] = await Promise.all([findUserById(req.userId).catch(() => null)])
      const notification = await createNotification({
        userId: creatorId,
        type: 'comment',
        title: `${commenter?.name || 'Someone'} commented on your content`,
        body: text ? text.slice(0, 140) : 'A commenter left a message.',
        link: `/${contentType}/${contentId}`,
        actorId: req.userId,
      }).catch(() => null)
      if (notification) notifyUser(creatorId, { type: 'notification', notification })
      emitCreatorEngagement(creatorId, { type: 'comment', contentId, contentType, at: Date.now() })
    }
    res.json({ success: true, comment })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

async function evaluateMilestoneUnlocks(comments, req) {
  const out = []
  for (const c of comments) {
    let row = c
    if (c.milestone_unlock && !c.locked) {
      let unlocked = false
      if (c.unlock_at && new Date(c.unlock_at).getTime() <= Date.now()) {
        unlocked = true
      } else {
        const likeCount = await getContentLikes(c.content_id, c.content_type)
        let followerCount = 0
        if (c.creator_id) followerCount = await getFollowerCount(c.creator_id)
        const m = c.milestone_unlock
        if (m === '100_likes') unlocked = likeCount >= 100
        else if (m === '500_likes') unlocked = likeCount >= 500
        else if (m === '1k_likes') unlocked = likeCount >= 1000
        else if (m === '1k_followers') unlocked = followerCount >= 1000
        else if (m === '10k_followers') unlocked = followerCount >= 10000
      }
      if (!unlocked && (!req.userId || c.user_id !== req.userId)) {
        row = { ...c, text: null, media_url: null, media_type: null, locked: true, unlockMilestone: c.milestone_unlock }
      } else {
        row = { ...c, locked: false }
      }
    }
    out.push(row)
  }
  return out
}

export async function listComments(req, res) {
  try {
    const { contentId, contentType } = req.query
    if (!contentId || !contentType) return res.status(400).json({ error: 'contentId and contentType required' })

    let comments = await getContentComments(contentId, contentType, 50, 0, req.userId || null)
    comments = await evaluateMilestoneUnlocks(comments, req)
    const total = await getContentCommentCount(contentId, contentType)
    res.json({ success: true, comments, total })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function removeComment(req, res) {
  try {
    const { id } = req.params
    const deleted = await deleteComment(id, req.userId)
    if (!deleted) return res.status(404).json({ error: 'Comment not found' })
    res.json({ success: true, message: 'Comment deleted' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function toggleFollow(req, res) {
  try {
    const { followingId } = req.body
    if (!followingId) return res.status(400).json({ error: 'followingId required' })
    if (req.userId === followingId) return res.status(400).json({ error: 'Cannot follow yourself' })

    const following = await isFollowing(req.userId, followingId)
    if (following) {
      await removeFollower(req.userId, followingId)
    } else {
      await addFollower(req.userId, followingId)
      addXp(req.userId, 2).catch(() => {})
      const [user] = await Promise.all([
        findUserById(req.userId).catch(() => null),
      ])
      const notification = await createNotification({
        userId: followingId,
        type: 'follow',
        title: `${user?.name || 'Someone'} followed you`,
        body: 'Tap to see your new follower.',
        link: `/profile/${req.userId}`,
        actorId: req.userId,
      }).catch(() => null)
      if (notification) notifyUser(followingId, { type: 'notification', notification })
    }

    const count = await getFollowerCount(followingId)
    checkAndAwardAchievements(req.userId).catch(() => {})
    res.json({ success: true, following: !following, count })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function checkFollow(req, res) {
  try {
    const { followingId } = req.query
    if (!followingId) return res.status(400).json({ error: 'followingId required' })

    const following = await isFollowing(req.userId, followingId)
    const count = await getFollowerCount(followingId)
    res.json({ success: true, following, count })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function followStats(req, res) {
  try {
    const { userId } = req.query
    if (!userId) return res.status(400).json({ error: 'userId required' })

    const profile = await findUserById(userId)
    if (!profile) return res.status(404).json({ error: 'User not found' })

    const [followers, following] = await Promise.all([
      getFollowerCount(userId),
      getFollowingCount(userId),
    ])
    let isFollow = false
    if (req.userId && req.userId !== userId) {
      isFollow = await isFollowing(req.userId, userId)
    }
    res.json({
      success: true,
      profile: { id: profile.id, name: profile.name, avatar: profile.avatar, bio: profile.bio, plan: profile.plan },
      followers,
      following,
      isFollowing: isFollow,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function listFollowers(req, res) {
  try {
    const { userId } = req.query
    if (!userId) return res.status(400).json({ error: 'userId required' })

    const users = await getFollowers(userId)
    const result = []
    for (const u of users) {
      let isFollow = false
      if (req.userId && req.userId !== u.id) {
        isFollow = await isFollowing(req.userId, u.id)
      }
      result.push({ ...u, isFollowing: isFollow })
    }
    res.json({ success: true, users: result })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function listFollowing(req, res) {
  try {
    const { userId } = req.query
    if (!userId) return res.status(400).json({ error: 'userId required' })

    const users = await getFollowing(userId)
    const result = []
    for (const u of users) {
      let isFollow = false
      if (req.userId && req.userId !== u.id) {
        isFollow = await isFollowing(req.userId, u.id)
      }
      result.push({ ...u, isFollowing: isFollow })
    }
    res.json({ success: true, users: result })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function getCreatorLiked(req, res) {
  try {
    const creatorId = req.params.id
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1)
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50)
    const offset = (page - 1) * limit
    
    // Get liked shorts
    const likedShorts = await pool.query(
      `SELECT s.id, s.title, s.description, s.video_url, s.thumbnail_url, s.duration_seconds, s.views, s.likes, s.created_at,
              u.name as creator_name, u.avatar as creator_avatar
       FROM short_likes sl
       JOIN shorts s ON s.id = sl.short_id
       LEFT JOIN users u ON u.id = s.user_id
       WHERE sl.user_id = $1 AND s.status = 'active'
       ORDER BY sl.created_at DESC
       LIMIT $2 OFFSET $3`,
      [creatorId, limit, offset]
    )
    
// Get liked uploads (movies/videos) - safe regex guard prevents crash on non-UUID content_id
    const likedUploads = await pool.query(
      `SELECT u.id, u.title, u.description, u.filename as video_url, u.thumbnail_url, u.duration_seconds, u.views, 0 as likes, u.created_at,
              cr.name as creator_name, cr.avatar as creator_avatar
       FROM likes l
       JOIN uploads u ON u.id = l.content_id::uuid
       LEFT JOIN users cr ON cr.id = u.user_id
       WHERE l.content_type = 'upload' AND u.status = 'active'
       AND l.content_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       AND l.user_id = $1::uuid
       ORDER BY l.created_at DESC
       LIMIT $2 OFFSET $3`,
      [creatorId, limit, offset]
    )
    
    // Combine and sort by like date (we'd need a unified query for proper pagination, but for now merge)
    const shorts = likedShorts.rows.map(r => ({ ...r, type: 'short' }))
    const uploads = likedUploads.rows.map(r => ({ ...r, type: 'upload' }))
    
    const combined = [...shorts, ...uploads]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit)
    
    res.json({
      success: true,
      videos: combined,
      total: likedShorts.rows.length + likedUploads.rows.length,
      page,
      nextPage: combined.length === limit ? page + 1 : undefined
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
