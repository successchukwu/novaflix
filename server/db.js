import pool from './config/database.js'

function rowToUser(row) {
  if (!row) return null
  return {
    id: row.id,
    email: row.email,
    password: row.password,
    name: row.name,
    role: row.role,
    plan: row.plan,
    avatar: row.avatar,
    bio: row.bio || '',
    email_verified: row.email_verified,
    google_id: row.google_id,
    facebook_id: row.facebook_id,
    instagram_id: row.instagram_id,
    tiktok_id: row.tiktok_id,
    twitter_id: row.twitter_id,
    youtube_id: row.youtube_id,
    twitch_id: row.twitch_id,
    discord_id: row.discord_id,
    last_login_at: row.last_login_at,
    createdAt: row.created_at,
    verified: row.verified,
    suspended_until: row.suspended_until,
    suspension_reason: row.suspension_reason,
    banned_reason: row.banned_reason,
    banned_at: row.banned_at,
    admin_role_id: row.admin_role_id,
  }
}

function sanitizeUser(user) {
  if (!user) return null
  const { password, ...safe } = user
  return safe
}

export async function findUserByEmail(email) {
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email])
  return rowToUser(rows[0])
}

export async function findUserById(id) {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id])
  return rowToUser(rows[0])
}

export async function findUserByGoogleId(googleId) {
  const { rows } = await pool.query('SELECT * FROM users WHERE google_id = $1', [googleId])
  return rowToUser(rows[0])
}

const SOCIAL_ID_COLUMNS = {
  google: 'google_id',
  facebook: 'facebook_id',
  instagram: 'instagram_id',
  tiktok: 'tiktok_id',
  twitter: 'twitter_id',
  youtube: 'youtube_id',
  twitch: 'twitch_id',
  discord: 'discord_id',
}

export function socialIdColumn(provider) {
  return SOCIAL_ID_COLUMNS[provider] || null
}

export async function findUserBySocialId(provider, socialId) {
  const col = socialIdColumn(provider)
  if (!col) return null
  const { rows } = await pool.query(`SELECT * FROM users WHERE ${col} = $1`, [socialId])
  return rowToUser(rows[0])
}

export async function createUser(user) {
  const cols = ['id', 'email', 'password', 'name', 'role', 'plan', 'avatar', 'bio', 'email_verified', 'google_id']
  const mapped = [user.id, user.email, user.password, user.name, user.role || 'user', user.plan || 'free', user.avatar, user.bio || '', user.email_verified || false, user.google_id || null]
  for (const [provider, col] of Object.entries(SOCIAL_ID_COLUMNS)) {
    if (col === 'google_id') continue
    const val = user[col]
    if (val) { cols.push(col); mapped.push(val) }
  }
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ')
  const { rows } = await pool.query(
    `INSERT INTO users (${cols.join(', ')}) VALUES (${placeholders}) RETURNING *`,
    mapped
  )
  return rowToUser(rows[0])
}

export async function updateUser(id, updates) {
  const fields = []
  const values = []
  let idx = 1
  for (const [key, val] of Object.entries(updates)) {
    const col = key.replace(/([A-Z])/g, '_$1').toLowerCase()
    fields.push(`${col} = $${idx}`)
    values.push(val)
    idx++
  }
  if (fields.length === 0) return findUserById(id)
  values.push(id)
  const { rows } = await pool.query(
    `UPDATE users SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
    values
  )
  return rowToUser(rows[0])
}

export async function getUserSettings(id) {
  const { rows } = await pool.query('SELECT settings FROM users WHERE id = $1', [id])
  if (!rows[0]) return null
  return rows[0].settings || {}
}

export async function updateUserSettings(id, settings) {
  const { rows } = await pool.query(
    `UPDATE users SET settings = $2, updated_at = NOW() WHERE id = $1 RETURNING settings`,
    [id, JSON.stringify(settings)]
  )
  if (!rows[0]) return null
  return rows[0].settings || {}
}

export async function addUpload(upload) {
  const { rows } = await pool.query(
    `INSERT INTO uploads (id, user_id, title, description, genre, filename, thumbnail_url, filesize, status, views, minutes_watched, revenue, source_type, youtube_id, youtube_url, quality, duration_seconds)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING *`,
    [upload.id, upload.userId, upload.title, upload.description || '', upload.genre, upload.filename, upload.thumbnailUrl || '', upload.filesize, upload.status || 'pending', upload.views || 0, upload.minutesWatched || 0, upload.revenue || 0, upload.sourceType || 'file', upload.youtubeId || '', upload.youtubeUrl || '', upload.quality || '', upload.durationSeconds || 0]
  )
  return rows[0]
}

export async function updateUpload(id, fields) {
  const allowed = ['title', 'description', 'genre', 'thumbnail_url', 'filename', 'status', 'quality']
  const cols = []
  const vals = []
  let i = 1
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      cols.push(`${key} = $${i++}`)
      vals.push(fields[key])
    }
  }
  if (cols.length === 0) return null
  vals.push(id)
  const { rows } = await pool.query(
    `UPDATE uploads SET ${cols.join(', ')} WHERE id = $${i} RETURNING *`,
    vals
  )
  return rows[0] || null
}

export async function getUploadsByUserId(userId) {
  const { rows } = await pool.query('SELECT * FROM uploads WHERE user_id = $1 ORDER BY created_at DESC', [userId])
  return rows
}

export async function getAllUploads() {
  const { rows } = await pool.query('SELECT * FROM uploads ORDER BY created_at DESC')
  return rows
}

export async function addWatchEntry(entry) {
  const { rows } = await pool.query(
    `INSERT INTO watch_history (id, user_id, content_id, title, type, minutes, season, episode, position_seconds, duration_seconds, poster, watched_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
     ON CONFLICT (user_id, content_id, type, COALESCE(season, -1), COALESCE(episode, -1))
     DO UPDATE SET
       title = EXCLUDED.title,
       minutes = EXCLUDED.minutes,
       position_seconds = EXCLUDED.position_seconds,
       duration_seconds = EXCLUDED.duration_seconds,
       poster = COALESCE(EXCLUDED.poster, watch_history.poster),
       watched_at = NOW(),
       updated_at = NOW()
     RETURNING *`,
    [entry.id, entry.userId, entry.contentId, entry.title, entry.type, entry.minutes || 0, entry.season || null, entry.episode || null, entry.positionSeconds || 0, entry.durationSeconds || 0, entry.poster || null]
  )
  bumpUploadViewMinutes(entry.contentId, entry.minutes || 0).catch(() => {})
  return rows[0]
}

export async function getContinueWatching(userId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (content_id, type) *
     FROM watch_history
     WHERE user_id = $1
       AND (duration_seconds IS NULL OR duration_seconds = 0 OR position_seconds < duration_seconds * 0.95)
     ORDER BY content_id, type, updated_at DESC`,
    [userId]
  )
  return rows
}

export async function getWatchHistory(userId) {
  const { rows } = await pool.query('SELECT * FROM watch_history WHERE user_id = $1 ORDER BY watched_at DESC', [userId])
  return rows
}

export async function addToWatchlist(entry) {
  const { rows } = await pool.query(
    `INSERT INTO watchlist (id, user_id, content_id, content_type, title, poster, year)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, content_id) DO NOTHING RETURNING *`,
    [entry.id, entry.userId, entry.contentId, entry.contentType, entry.title, entry.poster || null, entry.year || null]
  )
  return rows[0] || null
}

export async function getWatchlistByUserId(userId) {
  const { rows } = await pool.query('SELECT * FROM watchlist WHERE user_id = $1 ORDER BY added_at DESC', [userId])
  return rows
}

export async function removeFromWatchlist(userId, contentId) {
  const { rowCount } = await pool.query('DELETE FROM watchlist WHERE user_id = $1 AND content_id = $2', [userId, contentId])
  return rowCount > 0
}

export async function isInWatchlist(userId, contentId) {
  const { rows } = await pool.query('SELECT id FROM watchlist WHERE user_id = $1 AND content_id = $2', [userId, contentId])
  return rows.length > 0
}

export async function getWatchlistCount(userId) {
  const { rows } = await pool.query('SELECT COUNT(*)::int as count FROM watchlist WHERE user_id = $1', [userId])
  return rows[0]?.count ?? 0
}

export async function listPlans() {
  const { rows } = await pool.query('SELECT * FROM plans WHERE active = TRUE ORDER BY sort_order ASC')
  return rows
}

export async function getPlanBySlug(slug) {
  const { rows } = await pool.query('SELECT * FROM plans WHERE slug = $1 AND active = TRUE', [slug])
  return rows[0] || null
}

export async function addSubscription(sub) {
  const { rows } = await pool.query(
    `INSERT INTO subscriptions (id, user_id, plan, active, started_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [sub.id, sub.userId, sub.plan, sub.active !== false, sub.startedAt || new Date().toISOString(), sub.expiresAt || null]
  )
  return rows[0]
}

export async function getUserSubscription(userId) {
  const { rows } = await pool.query(
    'SELECT * FROM subscriptions WHERE user_id = $1 AND active = true ORDER BY started_at DESC LIMIT 1',
    [userId]
  )
  return rows[0] || null
}

export async function addTip(tip) {
  const { rows } = await pool.query(
    `INSERT INTO tips (id, user_id, creator_id, amount, message)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [tip.id, tip.userId, tip.creatorId, tip.amount, tip.message || '']
  )
  return rows[0]
}

export async function addGlowGift(gift) {
  const { rows } = await pool.query(
    `INSERT INTO glow_gifts (id, sender_id, creator_id, amount, fee, net_amount, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [gift.id, gift.senderId, gift.creatorId, gift.amount, gift.fee, gift.netAmount, gift.note || '']
  )
  return rows[0]
}

export async function getGlowGiftsForCreator(creatorId) {
  const { rows } = await pool.query(
    `SELECT g.*, u.username AS sender_name FROM glow_gifts g
     LEFT JOIN users u ON u.id = g.sender_id
     WHERE g.creator_id = $1 ORDER BY g.created_at DESC`,
    [creatorId]
  )
  return rows
}

export async function getGlowGiftsTotals(creatorId) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(amount),0) AS gross, COALESCE(SUM(net_amount),0) AS net, COALESCE(SUM(fee),0) AS fee
     FROM glow_gifts WHERE creator_id = $1`,
    [creatorId]
  )
  const r = rows[0] || {}
  return { gross: parseFloat(r.gross) || 0, net: parseFloat(r.net) || 0, fee: parseFloat(r.fee) || 0 }
}

export async function getTipsForCreator(creatorId) {
  const { rows } = await pool.query(
    'SELECT * FROM tips WHERE creator_id = $1 ORDER BY created_at DESC',
    [creatorId]
  )
  return rows
}

export async function getTotalMinutesWatched(userId) {
  const { rows } = await pool.query(
    'SELECT COALESCE(SUM(minutes), 0) as total FROM watch_history WHERE user_id = $1',
    [userId]
  )
  return parseInt(rows[0].total) || 0
}

export async function getTotalViewsForUpload(uploadId) {
  const { rows } = await pool.query(
    'SELECT COUNT(*) as count FROM watch_history WHERE content_id = $1',
    [uploadId]
  )
  return parseInt(rows[0].count) || 0
}

export async function updateLastLogin(userId) {
  await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [userId])
}

export async function findDevice(userId, deviceId) {
  const { rows } = await pool.query(
    'SELECT * FROM user_devices WHERE user_id = $1 AND device_id = $2',
    [userId, deviceId]
  )
  return rows[0] || null
}

export async function upsertDevice(userId, deviceId, ipAddress, userAgent) {
  const { rows } = await pool.query(
    `INSERT INTO user_devices (user_id, device_id, ip_address, user_agent)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, device_id) DO UPDATE SET
       last_seen_at = NOW(),
       ip_address = EXCLUDED.ip_address,
       user_agent = EXCLUDED.user_agent
     RETURNING *`,
    [userId, deviceId, ipAddress || null, userAgent || null]
  )
  return rows[0]
}

export async function findKnownLocation(userId, lat, lng, radiusKm = 150) {
  const { rows } = await pool.query(
    `SELECT *,
       (6371 * acos(
         LEAST(1, GREATEST(-1,
           cos(radians($2)) * cos(radians(lat)) * cos(radians(lng) - radians($3))
           + sin(radians($2)) * sin(radians(lat))
         ))
       )) AS distance_km
     FROM user_locations
     WHERE user_id = $1
       AND (6371 * acos(
         LEAST(1, GREATEST(-1,
           cos(radians($2)) * cos(radians(lat)) * cos(radians(lng) - radians($3))
           + sin(radians($2)) * sin(radians(lat))
         ))
       )) <= $4
     ORDER BY last_seen_at DESC
     LIMIT 1`,
    [userId, lat, lng, radiusKm]
  )
  return rows[0] || null
}

export async function recordLocation(userId, lat, lng, accuracy, source, ipAddress, userAgent) {
  const { rows } = await pool.query(
    `INSERT INTO user_locations (user_id, lat, lng, accuracy, source, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, lat, lng) DO UPDATE SET
       last_seen_at = NOW(),
       accuracy = EXCLUDED.accuracy,
       source = EXCLUDED.source,
       ip_address = EXCLUDED.ip_address,
       user_agent = EXCLUDED.user_agent
     RETURNING *`,
    [userId, lat, lng, accuracy || 0, source || 'geolocation', ipAddress || null, userAgent || null]
  )
  return rows[0]
}

export async function saveVerificationCode(userId, code) {
  await pool.query(
    `INSERT INTO email_verifications (user_id, code, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '15 minutes')`,
    [userId, code]
  )
}

export async function verifyCode(userId, code) {
  const { rows } = await pool.query(
    `SELECT * FROM email_verifications
     WHERE user_id = $1 AND code = $2 AND used = false AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [userId, code]
  )
  if (rows[0]) {
    await pool.query('UPDATE email_verifications SET used = true WHERE id = $1', [rows[0].id])
    return true
  }
  return false
}

export async function getUsersByRole(role) {
  const { rows } = await pool.query('SELECT * FROM users WHERE role = $1 ORDER BY created_at DESC', [role])
  return rows.map(rowToUser)
}

export async function getAllUsers() {
  const { rows } = await pool.query('SELECT * FROM users ORDER BY created_at DESC')
  return rows.map(rowToUser)
}

export async function getPlatformStats() {
  const { rows: userCount } = await pool.query('SELECT COUNT(*) as count FROM users')
  const { rows: uploadCount } = await pool.query('SELECT COUNT(*) as count FROM uploads')
  const { rows: watchCount } = await pool.query('SELECT COALESCE(SUM(minutes), 0) as total FROM watch_history')
  const { rows: tipTotal } = await pool.query('SELECT COALESCE(SUM(amount), 0) as total FROM tips')
  const { rows: subCount } = await pool.query('SELECT COUNT(*) as count FROM subscriptions WHERE active = true')
  return {
    totalUsers: parseInt(userCount[0].count),
    totalUploads: parseInt(uploadCount[0].count),
    totalMinutesWatched: parseInt(watchCount[0].total),
    totalTips: parseFloat(tipTotal[0].total),
    activeSubscriptions: parseInt(subCount[0].count),
  }
}

export async function newsletterSubscribe(email) {
  const { rows } = await pool.query(
    `INSERT INTO newsletter_emails (email) VALUES ($1)
     ON CONFLICT (email) DO UPDATE SET status = 'active'
     RETURNING *`,
    [email]
  )
  return rows[0]
}

export async function newsletterUnsubscribe(email) {
  const { rows } = await pool.query(
    'UPDATE newsletter_emails SET status = $1 WHERE email = $2 RETURNING *',
    ['unsubscribed', email]
  )
  return rows[0]
}

export async function findUserByTmdbPersonId(tmdbPersonId) {
  const { rows } = await pool.query(
    `SELECT u.* FROM users u
     JOIN creator_profiles cp ON cp.user_id = u.id
     WHERE cp.tmdb_person_id = $1`,
    [tmdbPersonId]
  )
  return rowToUser(rows[0])
}

export async function getAllNewsletterEmails() {
  const { rows } = await pool.query('SELECT * FROM newsletter_emails WHERE status = $1 ORDER BY subscribed_at DESC', ['active'])
  return rows
}

// Likes
export async function addLike(userId, contentId, contentType, creatorId) {
  const { rows } = await pool.query(
    `INSERT INTO likes (user_id, content_id, content_type, creator_id)
     VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, content_id, content_type) DO NOTHING RETURNING *`,
    [userId, contentId, contentType, creatorId || null]
  )
  return rows[0] || null
}

export async function removeLike(userId, contentId, contentType) {
  const { rows } = await pool.query(
    'DELETE FROM likes WHERE user_id = $1 AND content_id = $2 AND content_type = $3 RETURNING *',
    [userId, contentId, contentType]
  )
  return rows[0] || null
}

export async function getContentLikes(contentId, contentType) {
  const { rows } = await pool.query(
    'SELECT COUNT(*) as count FROM likes WHERE content_id = $1 AND content_type = $2',
    [contentId, contentType]
  )
  return parseInt(rows[0].count) || 0
}

export async function hasUserLiked(userId, contentId, contentType) {
  const { rows } = await pool.query(
    'SELECT 1 FROM likes WHERE user_id = $1 AND content_id = $2 AND content_type = $3 LIMIT 1',
    [userId, contentId, contentType]
  )
  return rows.length > 0
}

export async function getTotalLikesForCreator(creatorId) {
  const { rows } = await pool.query(
    'SELECT COUNT(*) as count FROM likes WHERE creator_id = $1',
    [creatorId]
  )
  return parseInt(rows[0].count) || 0
}

export async function getCreatorMerchRevenue(creatorId) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(oi.price * oi.quantity),0) AS gross, COUNT(DISTINCT o.id) AS orders
     FROM order_items oi
     JOIN products p ON p.id = oi.product_id
     JOIN orders o ON o.id = oi.order_id
     WHERE p.creator_id = $1 AND o.status IN ('paid','shipped','delivered')`,
    [creatorId]
  )
  const r = rows[0] || {}
  const gross = parseFloat(r.gross) || 0
  return { gross, fee: +(gross * 0.15).toFixed(2), net: +(gross * 0.85).toFixed(2), orders: parseInt(r.orders) || 0 }
}

// Comments
export async function addComment(userId, contentId, contentType, text, creatorId, opts = {}) {
  const { rows } = await pool.query(
    `INSERT INTO comments (user_id, content_id, content_type, text, creator_id, parent_id, media_url, media_type, duration_seconds, unlock_at, milestone_unlock)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [
      userId,
      contentId,
      contentType,
      text || '',
      creatorId || null,
      opts.parentId || null,
      opts.mediaUrl || null,
      opts.mediaType || null,
      opts.durationSeconds || null,
      opts.unlockAt || null,
      opts.milestoneUnlock || null,
    ]
  )
  return rows[0]
}

export async function getContentComments(contentId, contentType, limit = 20, offset = 0, viewerId = null) {
  const { rows } = await pool.query(
    `SELECT c.*, u.name as user_name, u.avatar as user_avatar
     FROM comments c JOIN users u ON u.id = c.user_id
     WHERE c.content_id = $1 AND c.content_type = $2
     ORDER BY c.created_at DESC LIMIT $3 OFFSET $4`,
    [contentId, contentType, limit, offset]
  )
  const now = Date.now()
  return rows.map((c) => {
    const locked =
      (c.unlock_at && new Date(c.unlock_at).getTime() > now) &&
      (!viewerId || c.user_id !== viewerId)
    if (locked) {
      return { ...c, text: null, media_url: null, media_type: null, locked: true }
    }
    return { ...c, locked: false }
  })
}

export async function getContentCommentCount(contentId, contentType) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM comments WHERE content_id = $1 AND content_type = $2`,
    [contentId, contentType]
  )
  return rows[0]?.count ?? 0
}

export async function getCommentsForCreator(creatorId, limit = 20, offset = 0) {
  const { rows } = await pool.query(
    `SELECT c.*, u.name as user_name, u.avatar as user_avatar
     FROM comments c JOIN users u ON u.id = c.user_id
     WHERE c.creator_id = $1
     ORDER BY c.created_at DESC LIMIT $2 OFFSET $3`,
    [creatorId, limit, offset]
  )
  return rows
}

export async function deleteComment(id, userId) {
  const { rows } = await pool.query(
    'DELETE FROM comments WHERE id = $1 AND user_id = $2 RETURNING *',
    [id, userId]
  )
  return rows[0] || null
}

// Followers
export async function addFollower(followerId, followingId) {
  const { rows } = await pool.query(
    'INSERT INTO followers (follower_id, following_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *',
    [followerId, followingId]
  )
  return rows[0] || null
}

export async function removeFollower(followerId, followingId) {
  const { rows } = await pool.query(
    'DELETE FROM followers WHERE follower_id = $1 AND following_id = $2 RETURNING *',
    [followerId, followingId]
  )
  return rows[0] || null
}

export async function isFollowing(followerId, followingId) {
  const { rows } = await pool.query(
    'SELECT 1 FROM followers WHERE follower_id = $1 AND following_id = $2 LIMIT 1',
    [followerId, followingId]
  )
  return rows.length > 0
}

export async function getFollowerCount(userId) {
  const { rows } = await pool.query(
    'SELECT COUNT(*) as count FROM followers WHERE following_id = $1',
    [userId]
  )
  return parseInt(rows[0].count) || 0
}

export async function getFollowingCount(userId) {
  const { rows } = await pool.query(
    'SELECT COUNT(*) as count FROM followers WHERE follower_id = $1',
    [userId]
  )
  return parseInt(rows[0].count) || 0
}

export async function getFollowers(userId) {
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.avatar
     FROM followers f JOIN users u ON u.id = f.follower_id
     WHERE f.following_id = $1 ORDER BY f.created_at DESC`,
    [userId]
  )
  return rows
}

export async function getFollowing(userId) {
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.avatar
     FROM followers f JOIN users u ON u.id = f.following_id
     WHERE f.follower_id = $1 ORDER BY f.created_at DESC`,
    [userId]
  )
  return rows
}

export async function saveMessage(room, userId, userName, message) {
  const { rows } = await pool.query(
    `INSERT INTO messages (room, user_id, user_name, message) VALUES ($1, $2, $3, $4) RETURNING id, room, user_id, user_name, message, created_at`,
    [room, userId, userName, message]
  )
  return rows[0] || null
}

export async function getRoomMessages(room, limit = 50) {
  const { rows } = await pool.query(
    `SELECT id, room, user_id, user_name, message, created_at
     FROM messages WHERE room = $1 ORDER BY created_at DESC LIMIT $2`,
    [room, limit]
  )
  return rows.reverse()
}

// Artist Graph
export async function addGraphEdge(personAId, personBId, movieId, movieTitle, roleA, roleB) {
  const { rows } = await pool.query(
    `INSERT INTO artist_graph (person_a_id, person_b_id, movie_id, movie_title, role_a, role_b)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (person_a_id, person_b_id, movie_id)
     DO UPDATE SET weight = artist_graph.weight + 1
     RETURNING *`,
    [personAId, personBId, movieId, movieTitle, roleA, roleB]
  )
  return rows[0]
}

export async function getArtistGraph(userId) {
  const { rows } = await pool.query(
    `SELECT g.*, u.name as collab_name, u.avatar as collab_avatar, u.id as collab_id
     FROM artist_graph g JOIN users u ON u.id = g.person_b_id
     WHERE g.person_a_id = $1
     ORDER BY g.weight DESC LIMIT 50`,
    [userId]
  )
  return rows
}

// Transactions
export async function createTransaction(tx) {
  const { rows } = await pool.query(
    `INSERT INTO transactions (user_id, reference, type, plan, creator_id, amount, status, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [tx.userId, tx.reference, tx.type, tx.plan || null, tx.creatorId || null, tx.amount, tx.status || 'pending', tx.metadata ? JSON.stringify(tx.metadata) : null]
  )
  return rows[0]
}

export async function getTransactionByReference(reference) {
  const { rows } = await pool.query('SELECT * FROM transactions WHERE reference = $1', [reference])
  return rows[0] || null
}

export async function updateTransactionByReference(reference, updates) {
  const fields = []
  const values = []
  let idx = 1
  for (const [key, val] of Object.entries(updates)) {
    const col = key.replace(/([A-Z])/g, '_$1').toLowerCase()
    fields.push(`${col} = $${idx}`)
    values.push(val)
    idx++
  }
  if (fields.length === 0) return null
  values.push(reference)
  const { rows } = await pool.query(
    `UPDATE transactions SET ${fields.join(', ')} WHERE reference = $${idx} RETURNING *`,
    values
  )
  return rows[0] || null
}

// Active session management
export async function createActiveSession(userId, deviceId, ipAddress) {
  await pool.query('DELETE FROM active_sessions WHERE user_id = $1 AND device_id = $2', [userId, deviceId])
  const { rows } = await pool.query(
    `INSERT INTO active_sessions (user_id, device_id, ip_address)
     VALUES ($1, $2, $3) RETURNING *`,
    [userId, deviceId || null, ipAddress || null]
  )
  return rows[0]
}

export async function getActiveSessionCount(userId) {
  const { rows } = await pool.query(
    'SELECT COUNT(*) as count FROM active_sessions WHERE user_id = $1 AND last_heartbeat > NOW() - INTERVAL \'2 minutes\'',
    [userId]
  )
  return parseInt(rows[0].count) || 0
}

export async function heartbeatSession(userId, deviceId) {
  const { rows } = await pool.query(
    'UPDATE active_sessions SET last_heartbeat = NOW() WHERE user_id = $1 AND device_id = $2 RETURNING *',
    [userId, deviceId]
  )
  return rows[0] || null
}

export async function endSession(userId, deviceId) {
  await pool.query(
    'DELETE FROM active_sessions WHERE user_id = $1 AND device_id = $2',
    [userId, deviceId]
  )
}

export async function cleanupStaleSessions() {
  const { rows } = await pool.query(
    'DELETE FROM active_sessions WHERE last_heartbeat < NOW() - INTERVAL \'3 minutes\' RETURNING *'
  )
  return rows.length
}

export async function listActiveSessions(userId) {
  const { rows } = await pool.query(
    `SELECT id, user_id, device_id, ip_address, last_heartbeat
     FROM active_sessions
     WHERE user_id = $1 AND last_heartbeat > NOW() - INTERVAL '2 minutes'
     ORDER BY last_heartbeat DESC`,
    [userId]
  )
  return rows
}

// Download device registry (per-plan caps)
export async function ensureDownloadDevice(userId, deviceId, deviceName, platform, maxDevices) {
  const { rows: existing } = await pool.query(
    'SELECT * FROM download_devices WHERE user_id = $1 AND device_id = $2',
    [userId, deviceId]
  )
  if (existing[0]) {
    await pool.query('UPDATE download_devices SET last_used_at = NOW() WHERE id = $1', [existing[0].id])
    return { ok: true }
  }
  if (!maxDevices || maxDevices <= 0) {
    return { ok: false, limit: 0, devices: [] }
  }
  const { rows } = await pool.query(
    'SELECT * FROM download_devices WHERE user_id = $1 ORDER BY last_used_at ASC',
    [userId]
  )
  if (rows.length >= maxDevices) {
    return { ok: false, limit: maxDevices, devices: rows }
  }
  const { rows: inserted } = await pool.query(
    `INSERT INTO download_devices (user_id, device_id, device_name, platform)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, device_id) DO UPDATE SET last_used_at = NOW()
     RETURNING *`,
    [userId, deviceId, deviceName || null, platform || null]
  )
  return { ok: true, device: inserted[0] }
}

export async function getDownloadDevices(userId) {
  const { rows } = await pool.query(
    'SELECT * FROM download_devices WHERE user_id = $1 ORDER BY last_used_at DESC',
    [userId]
  )
  return rows
}

export async function removeDownloadDevice(userId, deviceId) {
  const { rowCount } = await pool.query(
    'DELETE FROM download_devices WHERE user_id = $1 AND device_id = $2',
    [userId, deviceId]
  )
  return rowCount > 0
}

export async function getUserTransactions(userId) {
  const { rows } = await pool.query('SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC', [userId])
  return rows
}

// Creator stats with likes/comments
export async function getCreatorDashboardStats(creatorId) {
  const { rows: likes } = await pool.query('SELECT COUNT(*) as count FROM likes WHERE creator_id = $1', [creatorId])
  const { rows: comments } = await pool.query('SELECT COUNT(*) as count FROM comments WHERE creator_id = $1', [creatorId])
  const { rows: tips } = await pool.query('SELECT COALESCE(SUM(amount), 0) as total FROM tips WHERE creator_id = $1', [creatorId])
  const { rows: minutes } = await pool.query('SELECT COALESCE(SUM(minutes), 0) as total FROM watch_history WHERE content_id IN (SELECT content_id FROM comments WHERE creator_id = $1)', [creatorId])
  return {
    totalLikes: parseInt(likes[0].count) || 0,
    totalComments: parseInt(comments[0].count) || 0,
    totalTips: parseFloat(tips[0].total) || 0,
    totalMinutesWatched: parseInt(minutes[0].total) || 0,
  }
}

// Membership tiers
export async function createMembershipTier(tier) {
  const { rows } = await pool.query(
    `INSERT INTO creator_membership_tiers (id, creator_id, name, description, price, benefits)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [tier.id, tier.creatorId, tier.name, tier.description || '', tier.price, tier.benefits ? JSON.stringify(tier.benefits) : '[]']
  )
  return rows[0]
}

export async function updateMembershipTier(id, creatorId, updates) {
  const fields = []
  const values = []
  let idx = 1
  for (const [key, val] of Object.entries(updates)) {
    const col = key.replace(/([A-Z])/g, '_$1').toLowerCase()
    fields.push(`${col} = $${idx}`)
    values.push(val)
    idx++
  }
  if (fields.length === 0) return null
  values.push(id, creatorId)
  const { rows } = await pool.query(
    `UPDATE creator_membership_tiers SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${idx} AND creator_id = $${idx + 1} RETURNING *`,
    values
  )
  return rows[0] || null
}

export async function getMembershipTiersByCreator(creatorId) {
  const { rows } = await pool.query(
    'SELECT * FROM creator_membership_tiers WHERE creator_id = $1 ORDER BY price ASC',
    [creatorId]
  )
  return rows
}

export async function getMembershipTierById(id) {
  const { rows } = await pool.query(
    'SELECT * FROM creator_membership_tiers WHERE id = $1',
    [id]
  )
  return rows[0] || null
}

// Memberships (user subscriptions to creator tiers)
export async function createMembership(membership) {
  const { rows } = await pool.query(
    `INSERT INTO creator_memberships (id, user_id, tier_id, creator_id, status, started_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [membership.id, membership.userId, membership.tierId, membership.creatorId, membership.status || 'active', membership.startedAt || new Date().toISOString(), membership.expiresAt || null]
  )
  return rows[0]
}

export async function getUserMemberships(userId) {
  const { rows } = await pool.query(
    `SELECT cm.*, cmt.name as tier_name, cmt.price as tier_price, cmt.benefits, u.name as creator_name, u.avatar as creator_avatar
     FROM creator_memberships cm
     JOIN creator_membership_tiers cmt ON cmt.id = cm.tier_id
     JOIN users u ON u.id = cm.creator_id
     WHERE cm.user_id = $1 AND cm.status = 'active'
     ORDER BY cm.started_at DESC`,
    [userId]
  )
  return rows
}

export async function getCreatorSubscribers(creatorId) {
  const { rows } = await pool.query(
    `SELECT cm.*, cmt.name as tier_name, cmt.price as tier_price, u.name as user_name, u.avatar as user_avatar
     FROM creator_memberships cm
     JOIN creator_membership_tiers cmt ON cmt.id = cm.tier_id
     JOIN users u ON u.id = cm.user_id
     WHERE cm.creator_id = $1 AND cm.status = 'active'
     ORDER BY cm.started_at DESC`,
    [creatorId]
  )
  return rows
}

export async function getActiveMembershipForUserAndTier(userId, tierId) {
  const { rows } = await pool.query(
    `SELECT * FROM creator_memberships WHERE user_id = $1 AND tier_id = $2 AND status = 'active' LIMIT 1`,
    [userId, tierId]
  )
  return rows[0] || null
}

export async function cancelMembership(id, userId) {
  const { rows } = await pool.query(
    `UPDATE creator_memberships SET status = 'cancelled', cancelled_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, userId]
  )
  return rows[0] || null
}

export async function getCreatorMembershipStats(creatorId) {
  const { rows: subscriberCount } = await pool.query(
    'SELECT COUNT(*) as count FROM creator_memberships WHERE creator_id = $1 AND status = $2',
    [creatorId, 'active']
  )
  const { rows: revenue } = await pool.query(
    `SELECT COALESCE(SUM(cmt.price), 0) as total FROM creator_memberships cm
     JOIN creator_membership_tiers cmt ON cmt.id = cm.tier_id
     WHERE cm.creator_id = $1 AND cm.status = 'active'`,
    [creatorId]
  )
  return {
    totalSubscribers: parseInt(subscriberCount[0].count) || 0,
    monthlyRevenue: parseFloat(revenue[0].total) || 0,
  }
}

// Live events
export async function createLiveEvent(event) {
  const { rows } = await pool.query(
    `INSERT INTO live_events (id, creator_id, title, description, event_date, ticket_price, total_tickets, available_tickets, poster_url, stream_url, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [event.id, event.creatorId, event.title, event.description || '', event.eventDate, event.ticketPrice || 0, event.totalTickets || 0, event.totalTickets || 0, event.posterUrl || '', event.streamUrl || '', event.status || 'scheduled']
  )
  return rows[0]
}

export async function updateLiveEvent(id, creatorId, updates) {
  const fields = []
  const values = []
  let idx = 1
  for (const [key, val] of Object.entries(updates)) {
    const col = key.replace(/([A-Z])/g, '_$1').toLowerCase()
    fields.push(`${col} = $${idx}`)
    values.push(val)
    idx++
  }
  if (fields.length === 0) return null
  values.push(id, creatorId)
  const { rows } = await pool.query(
    `UPDATE live_events SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${idx} AND creator_id = $${idx + 1} RETURNING *`,
    values
  )
  return rows[0] || null
}

export async function getLiveEvents(includePast = false) {
  let query = 'SELECT le.*, u.name as creator_name, u.avatar as creator_avatar FROM live_events le JOIN users u ON u.id = le.creator_id'
  if (!includePast) query += " WHERE le.event_date > NOW() AND le.status != 'cancelled'"
  query += ' ORDER BY le.event_date ASC'
  const { rows } = await pool.query(query)
  return rows
}

export async function getLiveEventById(id) {
  const { rows } = await pool.query(
    `SELECT le.*, u.name as creator_name, u.avatar as creator_avatar
     FROM live_events le JOIN users u ON u.id = le.creator_id
     WHERE le.id = $1`,
    [id]
  )
  return rows[0] || null
}

export async function getLiveEventsByCreator(creatorId) {
  const { rows } = await pool.query(
    'SELECT * FROM live_events WHERE creator_id = $1 ORDER BY event_date DESC',
    [creatorId]
  )
  return rows
}

// Event tickets
export async function purchaseEventTicket(ticket) {
  const { rows } = await pool.query(
    `INSERT INTO event_tickets (id, event_id, user_id, transaction_id, status)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [ticket.id, ticket.eventId, ticket.userId, ticket.transactionId || null, ticket.status || 'active']
  )
  await pool.query(
    'UPDATE live_events SET available_tickets = available_tickets - 1 WHERE id = $1 AND available_tickets > 0',
    [ticket.eventId]
  )
  return rows[0]
}

export async function getUserTickets(userId) {
  const { rows } = await pool.query(
    `SELECT et.*, le.title as event_title, le.event_date, le.poster_url, le.stream_url, le.status as event_status,
            u.name as creator_name, le.creator_id
     FROM event_tickets et
     JOIN live_events le ON le.id = et.event_id
     JOIN users u ON u.id = le.creator_id
     WHERE et.user_id = $1
     ORDER BY et.purchased_at DESC`,
    [userId]
  )
  return rows
}

export async function getEventTicketCount(eventId) {
  const { rows } = await pool.query(
    'SELECT COUNT(*) as count FROM event_tickets WHERE event_id = $1 AND status = $2',
    [eventId, 'active']
  )
  return parseInt(rows[0].count) || 0
}

// Seeding helpers
export async function createCreatorProfile(userId, displayName, tmdbPersonId, department, bio, avatar) {
  const { rows } = await pool.query(
    `INSERT INTO creator_profiles (user_id, display_name, bio, avatar, tmdb_person_id, known_for_department)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id) DO UPDATE SET display_name = $2, bio = $3, avatar = $4, tmdb_person_id = $5, known_for_department = $6
     RETURNING *`,
    [userId, displayName, bio || '', avatar, tmdbPersonId, department]
  )
  return rows[0]
}

// Products
export async function createProduct(product) {
  const { rows } = await pool.query(
    `INSERT INTO products (id, creator_id, title, description, price, image_url, category, popular)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [product.id, product.creatorId || null, product.title, product.description || '', product.price, product.imageUrl || '', product.category || 'general', product.popular || false]
  )
  return rows[0]
}

export async function updateProduct(id, creatorId, updates) {
  const fields = []; const values = []; let idx = 1
  for (const [key, val] of Object.entries(updates)) {
    const col = key.replace(/([A-Z])/g, '_$1').toLowerCase()
    fields.push(`${col} = $${idx}`); values.push(val); idx++
  }
  if (fields.length === 0) return null
  values.push(id, creatorId)
  const { rows } = await pool.query(
    `UPDATE products SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${idx} AND creator_id = $${idx + 1} RETURNING *`, values
  )
  return rows[0] || null
}

export async function getProducts(category) {
  let query = 'SELECT p.*, u.name as creator_name FROM products p LEFT JOIN users u ON u.id = p.creator_id WHERE p.active = true'
  const params = []
  if (category && category !== 'all') { params.push(category); query += ` AND p.category = $1` }
  query += ' ORDER BY p.popular DESC, p.created_at DESC'
  const { rows } = await pool.query(query, params)
  return rows
}

export async function getProductById(id) {
  const { rows } = await pool.query(
    'SELECT p.*, u.name as creator_name FROM products p LEFT JOIN users u ON u.id = p.creator_id WHERE p.id = $1', [id]
  )
  return rows[0] || null
}

export async function getProductsByCreator(creatorId) {
  const { rows } = await pool.query('SELECT * FROM products WHERE creator_id = $1 ORDER BY created_at DESC', [creatorId])
  return rows
}

// Orders
export async function createOrder(order) {
  const { rows } = await pool.query(
    `INSERT INTO orders (id, user_id, total, status, reference)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [order.id, order.userId, order.total, order.status || 'pending', order.reference || null]
  )
  return rows[0]
}

export async function addOrderItem(item) {
  const { rows } = await pool.query(
    `INSERT INTO order_items (id, order_id, product_id, quantity, price)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [item.id, item.orderId, item.productId, item.quantity || 1, item.price]
  )
  return rows[0]
}

export async function getOrderByReference(reference) {
  const { rows } = await pool.query('SELECT * FROM orders WHERE reference = $1', [reference])
  return rows[0] || null
}

export async function updateOrder(reference, updates) {
  const fields = []; const values = []; let idx = 1
  for (const [key, val] of Object.entries(updates)) {
    const col = key.replace(/([A-Z])/g, '_$1').toLowerCase()
    fields.push(`${col} = $${idx}`); values.push(val); idx++
  }
  if (fields.length === 0) return null
  values.push(reference)
  const { rows } = await pool.query(`UPDATE orders SET ${fields.join(', ')} WHERE reference = $${idx} RETURNING *`, values)
  return rows[0] || null
}

export async function getUserOrders(userId) {
  const { rows } = await pool.query(
    `SELECT o.*, json_agg(json_build_object('id', oi.id, 'product_id', oi.product_id, 'quantity', oi.quantity, 'price', oi.price, 'title', p.title, 'image_url', p.image_url)) as items
     FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id LEFT JOIN products p ON p.id = oi.product_id
     WHERE o.user_id = $1 GROUP BY o.id ORDER BY o.created_at DESC`,
    [userId]
  )
  return rows
}

// Courses
export async function createCourse(course) {
  const { rows } = await pool.query(
    `INSERT INTO courses (id, creator_id, title, description, price, image_url, category, duration, lessons_count, rating)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [course.id, course.creatorId, course.title, course.description || '', course.price, course.imageUrl || '', course.category || 'general', course.duration || '', course.lessonsCount || 0, course.rating || 0]
  )
  return rows[0]
}

export async function updateCourse(id, creatorId, updates) {
  const fields = []; const values = []; let idx = 1
  for (const [key, val] of Object.entries(updates)) {
    const col = key.replace(/([A-Z])/g, '_$1').toLowerCase()
    fields.push(`${col} = $${idx}`); values.push(val); idx++
  }
  if (fields.length === 0) return null
  values.push(id, creatorId)
  const { rows } = await pool.query(
    `UPDATE courses SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${idx} AND creator_id = $${idx + 1} RETURNING *`, values
  )
  return rows[0] || null
}

export async function getCourses(category) {
  let query = 'SELECT c.*, u.name as creator_name, u.avatar as creator_avatar FROM courses c JOIN users u ON u.id = c.creator_id WHERE c.active = true'
  const params = []
  if (category && category !== 'all') { params.push(category); query += ` AND c.category = $1` }
  query += ' ORDER BY c.students_count DESC, c.created_at DESC'
  const { rows } = await pool.query(query, params)
  return rows
}

export async function getCourseById(id) {
  const { rows } = await pool.query(
    'SELECT c.*, u.name as creator_name, u.avatar as creator_avatar FROM courses c JOIN users u ON u.id = c.creator_id WHERE c.id = $1', [id]
  )
  return rows[0] || null
}

export async function getCoursesByCreator(creatorId) {
  const { rows } = await pool.query('SELECT * FROM courses WHERE creator_id = $1 ORDER BY created_at DESC', [creatorId])
  return rows
}

export async function getCategories() {
  const { rows: productCats } = await pool.query('SELECT DISTINCT category FROM products WHERE active = true ORDER BY category')
  const { rows: courseCats } = await pool.query('SELECT DISTINCT category FROM courses WHERE active = true ORDER BY category')
  return { productCategories: productCats.map(r => r.category), courseCategories: courseCats.map(r => r.category) }
}

// Enrollments
export async function createEnrollment(enrollment) {
  const { rows } = await pool.query(
    `INSERT INTO enrollments (id, user_id, course_id, transaction_id, progress, completed)
     VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (user_id, course_id) DO NOTHING RETURNING *`,
    [enrollment.id, enrollment.userId, enrollment.courseId, enrollment.transactionId || null, enrollment.progress || 0, enrollment.completed || false]
  )
  if (rows[0]) {
    await pool.query('UPDATE courses SET students_count = students_count + 1 WHERE id = $1', [enrollment.courseId])
  }
  return rows[0] || null
}

export async function getUserEnrollments(userId) {
  const { rows } = await pool.query(
    `SELECT e.*, c.title as course_title, c.description, c.price, c.image_url, c.duration, c.lessons_count, c.rating, c.category,
            u.name as creator_name, u.avatar as creator_avatar, c.creator_id
     FROM enrollments e JOIN courses c ON c.id = e.course_id JOIN users u ON u.id = c.creator_id
     WHERE e.user_id = $1 ORDER BY e.enrolled_at DESC`,
    [userId]
  )
  return rows
}

export async function getEnrollment(userId, courseId) {
  const { rows } = await pool.query(
    'SELECT * FROM enrollments WHERE user_id = $1 AND course_id = $2', [userId, courseId]
  )
  return rows[0] || null
}

export async function updateEnrollmentProgress(userId, courseId, progress) {
  const { rows } = await pool.query(
    `UPDATE enrollments SET progress = $1, completed = CASE WHEN $1 >= 100 THEN true ELSE completed END
     WHERE user_id = $2 AND course_id = $3 RETURNING *`,
    [progress, userId, courseId]
  )
  return rows[0] || null
}

// Archives
export async function createArchiveItem(item) {
  const { rows } = await pool.query(
    `INSERT INTO archive_items (id, title, description, content_type, media_url, poster_url, year, genre, min_plan)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [item.id, item.title, item.description || '', item.contentType || 'video', item.mediaUrl || '', item.posterUrl || '', item.year || '', item.genre || '', item.minPlan || 'free']
  )
  return rows[0]
}

export async function updateArchiveItem(id, updates) {
  const fields = []; const values = []; let idx = 1
  for (const [key, val] of Object.entries(updates)) {
    const col = key.replace(/([A-Z])/g, '_$1').toLowerCase()
    fields.push(`${col} = $${idx}`); values.push(val); idx++
  }
  if (fields.length === 0) return null
  values.push(id)
  const { rows } = await pool.query(
    `UPDATE archive_items SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`, values
  )
  return rows[0] || null
}

export async function getArchiveItems(minPlanRank = 0) {
  const PLAN_RANK = { free: 0, student: 1, basic: 2, standard: 3, premium: 4 }
  const allowed = Object.entries(PLAN_RANK).filter(([, rank]) => rank <= minPlanRank).map(([p]) => p)
  const placeholders = allowed.map((_, i) => `$${i + 1}`).join(',')
  const { rows } = await pool.query(
    `SELECT * FROM archive_items WHERE active = true AND min_plan IN (${placeholders}) ORDER BY created_at DESC`,
    allowed
  )
  return rows
}

export async function getArchiveItemById(id) {
  const { rows } = await pool.query('SELECT * FROM archive_items WHERE id = $1', [id])
  return rows[0] || null
}

export async function logArchiveAccess(userId, archiveId) {
  const { rows } = await pool.query(
    `INSERT INTO archive_access_logs (user_id, archive_id) VALUES ($1, $2) RETURNING *`,
    [userId, archiveId]
  )
  return rows[0]
}

export async function getAllArchiveItems() {
  const { rows } = await pool.query('SELECT * FROM archive_items ORDER BY created_at DESC')
  return rows
}

// Communities
export async function createCommunity(community) {
  const { rows } = await pool.query(
    `INSERT INTO communities (id, name, description, avatar, creator_id, member_count)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [community.id, community.name, community.description || '', community.avatar || null, community.creatorId, community.memberCount || 1]
  )
  return rows[0]
}

export async function getCommunities(search) {
  let query = `SELECT c.*, u.name as creator_name, u.avatar as creator_avatar
               FROM communities c JOIN users u ON u.id = c.creator_id`
  const params = []
  if (search) {
    params.push(`%${search}%`)
    query += ` WHERE c.name ILIKE $1 OR c.description ILIKE $1`
  }
  query += ' ORDER BY c.member_count DESC, c.created_at DESC'
  const { rows } = await pool.query(query, params)
  return rows
}

export async function getCommunityById(id) {
  const { rows } = await pool.query(
    `SELECT c.*, u.name as creator_name, u.avatar as creator_avatar
     FROM communities c JOIN users u ON u.id = c.creator_id
     WHERE c.id = $1`,
    [id]
  )
  return rows[0] || null
}

export async function joinCommunity(communityId, userId) {
  const { rows } = await pool.query(
    `INSERT INTO community_members (community_id, user_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING RETURNING *`,
    [communityId, userId]
  )
  if (rows[0]) {
    await pool.query(
      'UPDATE communities SET member_count = member_count + 1 WHERE id = $1',
      [communityId]
    )
  }
  return rows[0] || null
}

export async function leaveCommunity(communityId, userId) {
  const { rows } = await pool.query(
    'DELETE FROM community_members WHERE community_id = $1 AND user_id = $2 RETURNING *',
    [communityId, userId]
  )
  if (rows[0]) {
    await pool.query(
      'UPDATE communities SET member_count = GREATEST(member_count - 1, 0) WHERE id = $1',
      [communityId]
    )
  }
  return rows[0] || null
}

export async function getMyCommunities(userId) {
  const { rows } = await pool.query(
    `SELECT c.*, u.name as creator_name, u.avatar as creator_avatar
     FROM communities c JOIN users u ON u.id = c.creator_id
     JOIN community_members cm ON cm.community_id = c.id
     WHERE cm.user_id = $1
     ORDER BY c.member_count DESC`,
    [userId]
  )
  return rows
}

export async function isCommunityMember(communityId, userId) {
  const { rows } = await pool.query(
    'SELECT 1 FROM community_members WHERE community_id = $1 AND user_id = $2 LIMIT 1',
    [communityId, userId]
  )
  return rows.length > 0
}

export async function createPost(post) {
  const { rows } = await pool.query(
    `INSERT INTO community_posts (id, community_id, user_id, content)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [post.id, post.communityId, post.userId, post.content]
  )
  return rows[0]
}

export async function getPosts(communityId, userId = null) {
  const { rows } = await pool.query(
    `SELECT p.*, u.name as user_name, u.avatar as user_avatar,
       (SELECT COUNT(*) FROM community_post_likes l WHERE l.post_id = p.id) AS like_count,
       ${userId ? 'EXISTS(SELECT 1 FROM community_post_likes l2 WHERE l2.post_id = p.id AND l2.user_id = $2) AS liked' : 'false AS liked'}
     FROM community_posts p JOIN users u ON u.id = p.user_id
     WHERE p.community_id = $1
     ORDER BY p.created_at DESC`,
    userId ? [communityId, userId] : [communityId]
  )
  return rows
}

export async function deletePost(id, userId) {
  const { rows } = await pool.query(
    'DELETE FROM community_posts WHERE id = $1 AND user_id = $2 RETURNING *',
    [id, userId]
  )
  return rows[0] || null
}

export async function getPostById(postId, userId = null) {
  const { rows } = await pool.query(
    `SELECT p.*, u.name as user_name, u.avatar as user_avatar,
       (SELECT COUNT(*) FROM community_post_likes l WHERE l.post_id = p.id) AS like_count,
       ${userId ? 'EXISTS(SELECT 1 FROM community_post_likes l2 WHERE l2.post_id = p.id AND l2.user_id = $2) AS liked' : 'false AS liked'}
     FROM community_posts p JOIN users u ON u.id = p.user_id
     WHERE p.id = $1`,
    userId ? [postId, userId] : [postId]
  )
  return rows[0] || null
}

export async function getCommunityMembers(communityId) {
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.avatar, cm.joined_at
     FROM community_members cm JOIN users u ON u.id = cm.user_id
     WHERE cm.community_id = $1
     ORDER BY cm.joined_at ASC`,
    [communityId]
  )
  return rows
}

export async function hasUserLikedPost(postId, userId) {
  if (!userId) return false
  const { rows } = await pool.query(
    'SELECT 1 FROM community_post_likes WHERE post_id = $1 AND user_id = $2 LIMIT 1',
    [postId, userId]
  )
  return rows.length > 0
}

export async function togglePostLike(postId, userId) {
  const exists = await hasUserLikedPost(postId, userId)
  if (exists) {
    await pool.query('DELETE FROM community_post_likes WHERE post_id = $1 AND user_id = $2', [postId, userId])
  } else {
    await pool.query('INSERT INTO community_post_likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [postId, userId])
  }
  const { rows } = await pool.query('SELECT COUNT(*) as count FROM community_post_likes WHERE post_id = $1', [postId])
  return { liked: !exists, likeCount: parseInt(rows[0].count) || 0 }
}

// ============ POSTS (User-generated content) ============

export async function createUserPost(post) {
  const { rows } = await pool.query(
    `INSERT INTO posts (id, user_id, content, media_urls, visibility, created_at)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [post.id, post.userId, post.content, JSON.stringify(post.mediaUrls || []), post.visibility, post.createdAt]
  )
  return rows[0]
}

export async function getUserPostsById(userId, limit, offset) {
  const { rows } = await pool.query(
    `SELECT p.*, u.name as author_name, u.avatar as author_avatar,
           (SELECT COUNT(*) FROM post_likes WHERE post_id = p.id) as likes_count,
           (SELECT COUNT(*) FROM post_comments WHERE post_id = p.id) as comments_count
     FROM posts p
     JOIN users u ON u.id = p.user_id
     WHERE p.user_id = $1
     ORDER BY p.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  )
  return rows.map(r => ({ ...r, mediaUrls: JSON.parse(r.media_urls || '[]') }))
}

export async function getPostsFeed(userId, limit, offset) {
  const { rows } = await pool.query(
    `SELECT p.*, u.name as author_name, u.avatar as author_avatar,
           (SELECT COUNT(*) FROM post_likes WHERE post_id = p.id) as likes_count,
           (SELECT COUNT(*) FROM post_comments WHERE post_id = p.id) as comments_count,
           ${userId ? 'EXISTS(SELECT 1 FROM post_likes WHERE post_id = p.id AND user_id = $1) as liked' : 'false as liked'}
    FROM posts p
    JOIN users u ON u.id = p.user_id
    WHERE p.visibility = 'public' OR p.user_id = $1
    ORDER BY p.created_at DESC
    LIMIT $2 OFFSET $3`,
    [userId || '00000000-0000-0000-0000-000000000000', limit, offset]
  )
  return rows.map(r => ({
    ...r,
    mediaUrls: JSON.parse(r.media_urls || '[]'),
  }))
}

export async function addPostLike(userId, postId) {
  await pool.query(
    'INSERT INTO post_likes (user_id, post_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [userId, postId]
  )
}

export async function removePostLike(userId, postId) {
  await pool.query(
    'DELETE FROM post_likes WHERE user_id = $1 AND post_id = $2',
    [userId, postId]
  )
}

export async function getPostLikes(postId) {
  const { rows } = await pool.query('SELECT COUNT(*) as count FROM post_likes WHERE post_id = $1', [postId])
  return parseInt(rows[0].count) || 0
}

export async function hasLikedPost(userId, postId) {
  const { rows } = await pool.query('SELECT 1 FROM post_likes WHERE user_id = $1 AND post_id = $2 LIMIT 1', [userId, postId])
  return rows.length > 0
}

export async function getPostComments(postId, limit, offset, viewerId = null) {
  const { rows } = await pool.query(
    `SELECT c.*, u.name as user_name, u.avatar as user_avatar
     FROM post_comments c
     JOIN users u ON u.id = c.user_id
     WHERE c.post_id = $1 AND c.parent_id IS NULL
     ORDER BY c.created_at DESC
     LIMIT $2 OFFSET $3`,
    [postId, limit, offset]
  )
  return rows
}

export async function addPostComment(userId, postId, text, options = {}) {
  const { v4: uuidv4 } = await import('uuid')
  const id = uuidv4()
  const { rows } = await pool.query(
    `INSERT INTO post_comments (id, user_id, post_id, text, parent_id, media_url, media_type, duration_seconds, unlock_at, milestone_unlock)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [id, userId, postId, text, options.parentId || null, options.mediaUrl || null, options.mediaType || null, options.durationSeconds || null, options.unlockAt || null, options.milestoneUnlock || null]
  )
  return rows[0]
}

export async function deleteUserPost(postId, userId) {
  const { rows } = await pool.query(
    'DELETE FROM posts WHERE id = $1 AND user_id = $2 RETURNING *',
    [postId, userId]
  )
  return rows[0] || null
}

// Actors
export async function upsertActor(actor) {
  const { rows } = await pool.query(
    `INSERT INTO actors (tmdb_id, name, avatar, biography, known_for_department, popularity)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (tmdb_id) DO UPDATE SET
       name = EXCLUDED.name,
       avatar = EXCLUDED.avatar,
       biography = EXCLUDED.biography,
       known_for_department = EXCLUDED.known_for_department,
       popularity = EXCLUDED.popularity
     RETURNING *`,
    [actor.tmdbId, actor.name, actor.avatar || null, actor.biography || '', actor.knownForDepartment || '', actor.popularity || 0]
  )
  return rows[0]
}

export async function getActors(limit = 50, offset = 0) {
  const { rows } = await pool.query(
    'SELECT * FROM actors ORDER BY popularity DESC LIMIT $1 OFFSET $2',
    [limit, offset]
  )
  return rows
}

export async function getActorCount() {
  const { rows } = await pool.query('SELECT COUNT(*) as count FROM actors')
  return parseInt(rows[0].count) || 0
}

// Achievements
const ACHIEVEMENT_DEFS = [
  { key: 'first_watch', name: 'Film Buff', description: 'Watch your first movie', icon: 'star', criteria: { type: 'watch_count', threshold: 1 } },
  { key: 'watch_10', name: 'Movie Marathoner', description: 'Watch 10 movies', icon: 'play_circle', criteria: { type: 'watch_count', threshold: 10 } },
  { key: 'first_watchlist', name: 'Collector', description: 'Add your first title to watchlist', icon: 'bookmark', criteria: { type: 'watchlist_count', threshold: 1 } },
  { key: 'watchlist_5', name: 'Trend Setter', description: 'Add 5 titles to your watchlist', icon: 'trending_up', criteria: { type: 'watchlist_count', threshold: 5 } },
  { key: 'night_owl', name: 'Night Owl', description: 'Watch content after midnight', icon: 'schedule', criteria: { type: 'night_watch', threshold: 1 } },
  { key: 'genre_explorer', name: 'Explorer', description: 'Explore 5 different genres', icon: 'explore', criteria: { type: 'genre_count', threshold: 5 } },
  { key: 'social_follower', name: 'Social Butterfly', description: 'Follow 3 creators', icon: 'diversity_3', criteria: { type: 'follow_count', threshold: 3 } },
  { key: 'first_follow', name: 'Making Friends', description: 'Follow your first creator', icon: 'person_add', criteria: { type: 'follow_count', threshold: 1 } },
  { key: 'first_comment', name: 'Trending Topic', description: 'Post your first comment', icon: 'forum', criteria: { type: 'comment_count', threshold: 1 } },
  { key: 'first_like', name: 'Sealed With A Like', description: 'Like your first title', icon: 'thumb_up', criteria: { type: 'like_count', threshold: 1 } },
  { key: 'premium_member', name: 'Premium Life', description: 'Upgrade to a paid plan', icon: 'workspace_premium', criteria: { type: 'premium_member', threshold: 1 } },
]

export async function seedAchievements() {
  for (const a of ACHIEVEMENT_DEFS) {
    await pool.query(
      `INSERT INTO achievements (key, name, description, icon, criteria)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (key) DO NOTHING`,
      [a.key, a.name, a.description, a.icon, JSON.stringify(a.criteria)]
    )
  }
}

export async function getAllAchievements() {
  const { rows } = await pool.query('SELECT * FROM achievements ORDER BY key')
  return rows
}

export async function getUserAchievements(userId) {
  const { rows } = await pool.query(
    `SELECT a.*, ua.earned_at
     FROM achievements a
     LEFT JOIN user_achievements ua ON ua.achievement_id = a.id AND ua.user_id = $1
     ORDER BY a.key`,
    [userId]
  )
  return rows
}

export async function awardAchievement(userId, achievementKey) {
  const { rows } = await pool.query(
    `INSERT INTO user_achievements (user_id, achievement_id)
     SELECT $1, id FROM achievements WHERE key = $2
     ON CONFLICT DO NOTHING RETURNING *`,
    [userId, achievementKey]
  )
  return rows[0] || null
}

export async function checkAndAwardAchievements(userId) {
  const [{ rows: userAchievements }] = await Promise.all([
    pool.query('SELECT a.key FROM user_achievements ua JOIN achievements a ON a.id = ua.achievement_id WHERE ua.user_id = $1', [userId]),
  ])
  const earned = new Set(userAchievements.map((r) => r.key))

  const [watchRes, watchlistRes, followRes, commentRes, likeRes, nightRes, userRes] = await Promise.all([
    pool.query('SELECT COUNT(*) as count FROM watch_history WHERE user_id = $1', [userId]),
    pool.query('SELECT COUNT(*) as count FROM watchlist WHERE user_id = $1', [userId]),
    pool.query('SELECT COUNT(*) as count FROM followers WHERE follower_id = $1', [userId]),
    pool.query('SELECT COUNT(*) as count FROM comments WHERE user_id = $1', [userId]),
    pool.query('SELECT COUNT(*) as count FROM likes WHERE user_id = $1', [userId]),
    pool.query("SELECT COUNT(*) as count FROM watch_history WHERE user_id = $1 AND EXTRACT(HOUR FROM watched_at) BETWEEN 0 AND 4", [userId]),
    pool.query('SELECT plan FROM users WHERE id = $1', [userId]),
  ])

  const watchCount = parseInt(watchRes.rows[0].count) || 0
  const watchlistCount = parseInt(watchlistRes.rows[0].count) || 0
  const followCount = parseInt(followRes.rows[0].count) || 0
  const commentCount = parseInt(commentRes.rows[0].count) || 0
  const likeCount = parseInt(likeRes.rows[0].count) || 0
  const nightCount = parseInt(nightRes.rows[0].count) || 0
  const plan = userRes.rows[0]?.plan || 'free'

  const awards = []
  const checks = [
    { key: 'first_watch', ok: watchCount >= 1 },
    { key: 'watch_10', ok: watchCount >= 10 },
    { key: 'first_watchlist', ok: watchlistCount >= 1 },
    { key: 'watchlist_5', ok: watchlistCount >= 5 },
    { key: 'social_follower', ok: followCount >= 3 },
    { key: 'first_follow', ok: followCount >= 1 },
    { key: 'first_comment', ok: commentCount >= 1 },
    { key: 'first_like', ok: likeCount >= 1 },
    { key: 'night_owl', ok: nightCount >= 1 },
    { key: 'premium_member', ok: plan !== 'free' },
  ]

  for (const c of checks) {
    if (c.ok && !earned.has(c.key)) {
      const awarded = await awardAchievement(userId, c.key)
      if (awarded) awards.push(c.key)
    }
  }

  return awards
}

function xpForLevel(level) {
  return (level - 1) * 100
}

export async function addXp(userId, amount) {
  if (!userId || !amount) return null
  const { rows } = await pool.query(
    `UPDATE users SET xp = xp + $2,
       level = GREATEST(1, FLOOR((xp + $2) / 100) + 1)
     WHERE id = $1 RETURNING xp, level`,
    [userId, amount]
  )
  return rows[0] || null
}

export async function getGamification(userId) {
  const [{ rows }] = await Promise.all([
    pool.query('SELECT xp, level FROM users WHERE id = $1', [userId]),
  ])
  const user = rows[0]
  if (!user) return null
  const level = user.level || 1
  const xp = user.xp || 0
  const baseXp = xpForLevel(level)
  const nextXp = xpForLevel(level + 1)
  return {
    xp,
    level,
    currentLevelXp: xp - baseXp,
    nextLevelXp: nextXp - baseXp,
    progressPct: Math.min(100, Math.round(((xp - baseXp) / (nextXp - baseXp)) * 100)),
  }
}

export async function getLeaderboard(limit = 20) {
  const { rows } = await pool.query(
    `SELECT id, name, avatar, xp, level, plan
     FROM users ORDER BY xp DESC, level DESC LIMIT $1`,
    [limit]
  )
  return rows
}

export async function addShort(short) {
  const { rows } = await pool.query(
    `INSERT INTO shorts (id, user_id, title, description, video_url, thumbnail_url, duration_seconds, status, trailer_url, media_id, media_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [short.id, short.userId, short.title, short.description, short.videoUrl, short.thumbnailUrl, short.durationSeconds || 0, short.status || 'active', short.trailerUrl || '', short.mediaId || null, short.mediaType || null]
  )
  return rows[0]
}

export async function getShortsFeed(limit = 30, offset = 0, viewerId = null) {
  const { rows } = await pool.query(
    `SELECT s.*, u.name as creator_name, u.avatar as creator_avatar
     FROM shorts s
     LEFT JOIN users u ON u.id = s.user_id
     WHERE s.status = 'active'
     ORDER BY s.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  )
  if (viewerId && rows.length) {
    const ids = rows.map(r => r.id)
    const [likesRes, bookmarksRes, followsRes] = await Promise.all([
      pool.query(`SELECT short_id FROM short_likes WHERE user_id = $1 AND short_id = ANY($2::uuid[])`, [viewerId, ids]),
      pool.query(`SELECT short_id FROM short_bookmarks WHERE user_id = $1 AND short_id = ANY($2::uuid[])`, [viewerId, ids]),
      pool.query(`SELECT following_id FROM followers WHERE follower_id = $1`, [viewerId]),
    ])
    const likedSet = new Set(likesRes.rows.map(r => r.short_id))
    const bookmarkedSet = new Set(bookmarksRes.rows.map(r => r.short_id))
    const followingSet = new Set(followsRes.rows.map(r => r.following_id))
    for (const row of rows) {
      row.liked = likedSet.has(row.id)
      row.bookmarked = bookmarkedSet.has(row.id)
      row.isFollowingCreator = followingSet.has(row.user_id)
    }
  }
  return rows
}

export async function getShortsCount() {
  const { rows } = await pool.query(`SELECT COUNT(*) as count FROM shorts WHERE status = 'active'`)
  return parseInt(rows[0].count) || 0
}

export async function getShortById(id) {
  const { rows } = await pool.query(
    `SELECT s.*, u.name as creator_name, u.avatar as creator_avatar
     FROM shorts s
     LEFT JOIN users u ON u.id = s.user_id
     WHERE s.id = $1`,
    [id]
  )
  return rows[0] || null
}

export async function incrementShortViews(id) {
  const { rows } = await pool.query(
    `UPDATE shorts SET views = views + 1 WHERE id = $1 RETURNING views, user_id`,
    [id]
  )
  return rows[0] || null
}

export async function hasUserLikedShort(shortId, userId) {
  if (!userId) return false
  const { rows } = await pool.query(
    `SELECT 1 FROM short_likes WHERE short_id = $1 AND user_id = $2`,
    [shortId, userId]
  )
  return rows.length > 0
}

export async function toggleShortLike(shortId, userId) {
  const exists = await hasUserLikedShort(shortId, userId)
  if (exists) {
    await pool.query(`DELETE FROM short_likes WHERE short_id = $1 AND user_id = $2`, [shortId, userId])
    const { rows } = await pool.query(`UPDATE shorts SET likes = GREATEST(likes - 1, 0) WHERE id = $1 RETURNING likes, user_id`, [shortId])
    return { liked: false, likes: rows[0].likes, creator_id: rows[0].user_id }
  }
  await pool.query(`INSERT INTO short_likes (short_id, user_id) VALUES ($1, $2)`, [shortId, userId])
  const { rows } = await pool.query(`UPDATE shorts SET likes = likes + 1 WHERE id = $1 RETURNING likes, user_id`, [shortId])
  return { liked: true, likes: rows[0].likes, creator_id: rows[0].user_id }
}

export async function hasUserBookmarkedShort(shortId, userId) {
  if (!userId) return false
  const { rows } = await pool.query(
    `SELECT 1 FROM short_bookmarks WHERE short_id = $1 AND user_id = $2`,
    [shortId, userId]
  )
  return rows.length > 0
}

export async function toggleShortBookmark(shortId, userId) {
  const exists = await hasUserBookmarkedShort(shortId, userId)
  if (exists) {
    await pool.query(`DELETE FROM short_bookmarks WHERE short_id = $1 AND user_id = $2`, [shortId, userId])
    const { rows } = await pool.query(`UPDATE shorts SET bookmarks = GREATEST(bookmarks - 1, 0) WHERE id = $1 RETURNING bookmarks`, [shortId])
    return { bookmarked: false, bookmarks: rows[0].bookmarks }
  }
  await pool.query(`INSERT INTO short_bookmarks (short_id, user_id) VALUES ($1, $2)`, [shortId, userId])
  const { rows } = await pool.query(`UPDATE shorts SET bookmarks = bookmarks + 1 WHERE id = $1 RETURNING bookmarks`, [shortId])
  return { bookmarked: true, bookmarks: rows[0].bookmarks }
}

export async function incrementShortShares(shortId) {
  const { rows } = await pool.query(`UPDATE shorts SET shares = shares + 1 WHERE id = $1 RETURNING shares`, [shortId])
  return rows[0] ? { shares: rows[0].shares } : null
}

export async function getShortComments(shortId) {
  const { rows } = await pool.query(
    `SELECT c.*, u.name as user_name, u.avatar as user_avatar
     FROM short_comments c
     LEFT JOIN users u ON u.id = c.user_id
     WHERE c.short_id = $1
     ORDER BY c.created_at DESC`,
    [shortId]
  )
  return rows
}

export async function addShortComment(shortId, userId, text) {
  const { rows } = await pool.query(
    `INSERT INTO short_comments (short_id, user_id, text) VALUES ($1, $2, $3) RETURNING *`,
    [shortId, userId, text]
  )
  const comment = rows[0]
  if (!comment) return null
  await pool.query(`UPDATE shorts SET comments = comments + 1 WHERE id = $1`, [shortId])
  const user = await pool.query(`SELECT name, avatar FROM users WHERE id = $1`, [userId]).then(r => r.rows[0] || {})
  return { ...comment, user_name: user.name, user_avatar: user.avatar }
}

export async function deleteShort(id) {
  const { rows } = await pool.query(`DELETE FROM shorts WHERE id = $1 RETURNING id`, [id])
  return rows[0] || null
}

// ============ SHARE DEEP-LINKS ============
export function genShareCode() {
  return Math.random().toString(36).slice(2, 10).toUpperCase()
}

export async function createShareLink({ code, contentId, contentType, creatorId, createdBy }) {
  const { rows } = await pool.query(
    `INSERT INTO share_links (code, content_id, content_type, creator_id, created_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (code) DO NOTHING RETURNING *`,
    [code, contentId, contentType, creatorId || null, createdBy || null]
  )
  return rows[0] || null
}

export async function getShareLinkByContent(createdBy, contentId, contentType) {
  const { rows } = await pool.query(
    `SELECT * FROM share_links WHERE created_by = $1 AND content_id = $2 AND content_type = $3 ORDER BY created_at DESC LIMIT 1`,
    [createdBy, contentId, contentType]
  )
  return rows[0] || null
}

export async function getShareLinkByCode(code) {
  const { rows } = await pool.query(`SELECT * FROM share_links WHERE code = $1`, [code])
  return rows[0] || null
}

export async function incrementShareClicks(code) {
  const { rows } = await pool.query(
    `UPDATE share_links SET clicks = clicks + 1 WHERE code = $1 RETURNING *`,
    [code]
  )
  return rows[0] || null
}

export async function getShareLinkStats(contentId, contentType) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(clicks), 0)::int as total_clicks, COUNT(*)::int as total_links
     FROM share_links WHERE content_id = $1 AND content_type = $2`,
    [contentId, contentType]
  )
  return { totalClicks: rows[0]?.total_clicks || 0, totalLinks: rows[0]?.total_links || 0 }
}

// ============ DIRECT MESSAGING ============
export function dmRoom(a, b) {
  return a < b ? `dm:${a}:${b}` : `dm:${b}:${a}`
}

export async function getConversations(userId, limit = 50) {
  const { rows } = await pool.query(
    `SELECT m.room, m.message, m.user_id, m.user_name, m.created_at
     FROM messages m
     WHERE m.room LIKE $1
       AND m.created_at = (SELECT MAX(m2.created_at) FROM messages m2 WHERE m2.room = m.room)
     ORDER BY m.created_at DESC
     LIMIT $2`,
    [`dm:%${userId}%`, limit]
  )
  const convos = []
  for (const r of rows) {
    const parts = r.room.split(':')
    const otherId = parts[1] === userId ? parts[2] : parts[1]
    const other = await findUserById(otherId)
    if (!other) continue
    convos.push({
      room: r.room,
      otherUser: { id: other.id, name: other.name, avatar: other.avatar },
      lastMessage: r.message,
      lastUserId: r.user_id,
      lastAt: new Date(r.created_at).getTime(),
    })
  }
  return convos
}

export async function getDirectMessages(userId, otherUserId, limit = 50) {
  const room = dmRoom(userId, otherUserId)
  const { rows } = await pool.query(
    `SELECT id, room, user_id, user_name, message, created_at
     FROM messages WHERE room = $1 ORDER BY created_at DESC LIMIT $2`,
    [room, limit]
  )
  return rows.reverse()
}

// ============ FAN ENGAGEMENT / SUPERFAN ============
export async function recordFanEngagement(userId, creatorId, kind, delta = 1) {
  if (!creatorId || userId === creatorId) return null
  const col = kind === 'like' ? 'likes' : kind === 'comment' ? 'comments' : kind === 'share' ? 'shares' : 'watch_minutes'
  const { rows } = await pool.query(
    `INSERT INTO fan_engagement (user_id, creator_id, ${col})
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, creator_id)
     DO UPDATE SET ${col} = fan_engagement.${col} + EXCLUDED.${col}, updated_at = NOW()
     RETURNING *`,
    [userId, creatorId, delta]
  )
  return rows[0]
}

export function superfanBadge(points) {
  if (points >= 1000) return { tier: 'Diamond', color: '#67e8f9', points, threshold: 1000 }
  if (points >= 400) return { tier: 'Platinum', color: '#a5f3fc', points, threshold: 400 }
  if (points >= 150) return { tier: 'Gold', color: '#fbbf24', points, threshold: 150 }
  if (points >= 50) return { tier: 'Silver', color: '#cbd5e1', points, threshold: 50 }
  if (points >= 10) return { tier: 'Bronze', color: '#d97706', points, threshold: 10 }
  return { tier: 'Rising Fan', color: '#94a3b8', points, threshold: 0 }
}

export function superfanPoints(e) {
  return (e?.likes || 0) * 2 + (e?.comments || 0) * 3 + (e?.shares || 0) * 1 + Math.floor((e?.watch_minutes || 0) / 30)
}

export async function getFanLeaderboard(creatorId, limit = 20) {
  const { rows } = await pool.query(
    `SELECT fe.user_id, u.name, u.avatar,
            fe.likes, fe.comments, fe.shares, fe.watch_minutes,
            (fe.likes * 2 + fe.comments * 3 + fe.shares * 1 + FLOOR(fe.watch_minutes / 30)) AS points
     FROM fan_engagement fe JOIN users u ON u.id = fe.user_id
     WHERE fe.creator_id = $1
     ORDER BY points DESC
     LIMIT $2`,
    [creatorId, limit]
  )
  return rows.map((r) => ({ ...r, badge: superfanBadge(r.points) }))
}

export async function getFanStatus(userId, creatorId) {
  if (!creatorId || userId === creatorId) {
    return { engaged: false, points: 0, badge: superfanBadge(0), rank: null }
  }
  const { rows } = await pool.query(
    `SELECT fe.*, (
       SELECT COUNT(*) FROM fan_engagement fe2
       WHERE fe2.creator_id = $2 AND (fe2.likes * 2 + fe2.comments * 3 + fe2.shares * 1 + FLOOR(fe2.watch_minutes / 30)) >= (fe.likes * 2 + fe.comments * 3 + fe.shares * 1 + FLOOR(fe.watch_minutes / 30))
     )::int as rank
     FROM fan_engagement fe WHERE fe.user_id = $1 AND fe.creator_id = $2`,
    [userId, creatorId]
  )
  const e = rows[0]
  if (!e) return { engaged: false, points: 0, badge: superfanBadge(0), rank: null }
  return { engaged: true, points: superfanPoints(e), badge: superfanBadge(superfanPoints(e)), rank: e.rank, detail: e }
}

// ============ HOT-TAKE FORUM ============
export async function createForumTopic({ id, title, category, content, authorId }) {
  const { rows } = await pool.query(
    `INSERT INTO forum_topics (id, title, category, content, author_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [id, title, category || 'general', content, authorId]
  )
  return rows[0]
}

export async function getForumTopics(category = null, limit = 30, offset = 0, sort = 'new') {
  const params = []
  let where = ''
  if (category && category !== 'all') {
    params.push(category)
    where = 'WHERE t.category = $1'
  }
  params.push(limit, offset)
  const orderBy = sort === 'hot'
    ? 'ORDER BY (t.upvotes - t.downvotes) DESC, t.created_at DESC'
    : 'ORDER BY t.created_at DESC'
  const { rows } = await pool.query(
    `SELECT t.*, u.name as author_name, u.avatar as author_avatar,
       (SELECT COUNT(*) FROM forum_replies r WHERE r.topic_id = t.id) as reply_count
     FROM forum_topics t JOIN users u ON u.id = t.author_id
     ${where}
     ${orderBy} LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  )
  return rows
}

export async function getForumTopicById(id) {
  const { rows } = await pool.query(
    `SELECT t.*, u.name as author_name, u.avatar as author_avatar
     FROM forum_topics t JOIN users u ON u.id = t.author_id
     WHERE t.id = $1`,
    [id]
  )
  return rows[0] || null
}

export async function getForumReplies(topicId) {
  const { rows } = await pool.query(
    `SELECT r.*, u.name as author_name, u.avatar as author_avatar
     FROM forum_replies r JOIN users u ON u.id = r.author_id
     WHERE r.topic_id = $1
     ORDER BY r.created_at ASC`,
    [topicId]
  )
  return rows
}

export async function getForumReplyById(id) {
  const { rows } = await pool.query(
    `SELECT r.*, u.name as author_name, u.avatar as author_avatar
     FROM forum_replies r JOIN users u ON u.id = r.author_id
     WHERE r.id = $1`,
    [id]
  )
  return rows[0] || null
}

async function getReplyDepth(client, replyId) {
  let depth = 0
  let currentId = replyId
  for (let i = 0; i < 32; i++) {
    const { rows } = await client.query(`SELECT parent_id FROM forum_replies WHERE id = $1`, [currentId])
    if (rows.length === 0 || !rows[0].parent_id) break
    depth++
    currentId = rows[0].parent_id
  }
  return depth
}

export async function createForumReply({ id, topicId, parentId, authorId, content }) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    if (parentId) {
      const depth = await getReplyDepth(client, parentId)
      if (depth >= 6) {
        await client.query('ROLLBACK')
        const err = new Error('Reply chain is too deep (max 6 levels).')
        err.statusCode = 400
        throw err
      }
    }
    const { rows } = await client.query(
      `INSERT INTO forum_replies (id, topic_id, parent_id, author_id, content)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id, topicId, parentId || null, authorId, content]
    )
    await client.query('COMMIT')
    return rows[0]
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

export async function castForumVote({ targetType, targetId, userId, vote }) {
  const table = targetType === 'reply' ? 'forum_replies' : 'forum_topics'
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const existing = await client.query(
      `SELECT id, vote FROM forum_votes WHERE target_type = $1 AND target_id = $2 AND user_id = $3 FOR UPDATE`,
      [targetType, targetId, userId]
    )
    let myVote = 0
    if (existing.rows.length > 0) {
      const prev = existing.rows[0].vote
      if (vote === 0 || prev === vote) {
        await client.query(`DELETE FROM forum_votes WHERE id = $1`, [existing.rows[0].id])
        await client.query(
          `UPDATE ${table} SET ${prev > 0 ? 'upvotes = GREATEST(upvotes - 1, 0)' : 'downvotes = GREATEST(downvotes - 1, 0)'} WHERE id = $1`,
          [targetId]
        )
        myVote = 0
      } else {
        await client.query(`UPDATE forum_votes SET vote = $1 WHERE id = $2`, [vote, existing.rows[0].id])
        await client.query(
          `UPDATE ${table} SET upvotes = upvotes + $1, downvotes = downvotes + $2 WHERE id = $3`,
          [vote > 0 ? 1 : -1, vote > 0 ? -1 : 1, targetId]
        )
        myVote = vote
      }
    } else if (vote !== 0) {
      await client.query(
        `INSERT INTO forum_votes (target_type, target_id, user_id, vote) VALUES ($1, $2, $3, $4)`,
        [targetType, targetId, userId, vote]
      )
      await client.query(
        `UPDATE ${table} SET ${vote > 0 ? 'upvotes = upvotes + 1' : 'downvotes = downvotes + 1'} WHERE id = $1`,
        [targetId]
      )
      myVote = vote
    }
    const { rows } = await client.query(`SELECT upvotes, downvotes FROM ${table} WHERE id = $1`, [targetId])
    await client.query('COMMIT')
    return { ...rows[0], myVote }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

export async function getUserForumVotes(userId, targetIds) {
  if (!targetIds.length) return {}
  const { rows } = await pool.query(
    `SELECT target_id, vote FROM forum_votes WHERE user_id = $1 AND target_id = ANY($2::uuid[])`,
    [userId, targetIds]
  )
  const map = {}
  for (const r of rows) map[r.target_id] = r.vote
  return map
}

// ============ TRIVIA / GAMIFICATION ============
export async function addCoins(userId, amount) {
  const { rows } = await pool.query(
    `UPDATE users SET coins = coins + $2 WHERE id = $1 RETURNING coins`,
    [userId, amount]
  )
  return rows[0]?.coins || 0
}

export async function getCoins(userId) {
  const { rows } = await pool.query(`SELECT coins FROM users WHERE id = $1`, [userId])
  return rows[0]?.coins || 0
}

export async function insertTriviaQuestion(q) {
  // Idempotent per day+movie: ux_trivia_questions_date_movie backs this
  // conflict target, so regenerating the same daily set never 500s.
  // Bank rows (movie_id NULL) are exempt — Postgres treats NULLs as distinct.
  const { rows } = await pool.query(
    `INSERT INTO trivia_questions (game_type, date_key, question, options, answer_index, answer_text, movie_id, movie_title, difficulty, clue, image_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (date_key, movie_id) DO NOTHING RETURNING *`,
    [q.game_type || 'trivia', q.date_key, q.question, q.options ? JSON.stringify(q.options) : null, q.answer_index ?? null, q.answer_text || null, q.movie_id || null, q.movie_title || null, q.difficulty || 'easy', q.clue || null, q.image_url || null]
  )
  return rows[0]
}

export async function getTriviaForDate(dateKey) {
  const { rows } = await pool.query(
    `SELECT * FROM trivia_questions WHERE game_type = 'trivia' AND date_key = $1 ORDER BY created_at ASC`,
    [dateKey]
  )
  return rows
}

export async function getTriviaQuestion(id) {
  const { rows } = await pool.query(`SELECT * FROM trivia_questions WHERE id = $1`, [id])
  return rows[0] || null
}

export async function getRandomGuessQuestion() {
  const { rows } = await pool.query(
    `SELECT * FROM trivia_questions WHERE game_type = 'guess' ORDER BY RANDOM() LIMIT 1`
  )
  return rows[0] || null
}

export async function recordTriviaAttempt({ userId, questionId, gameType, correct, points }) {
  const { rows } = await pool.query(
    `INSERT INTO trivia_attempts (user_id, question_id, game_type, correct, points_awarded)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [userId, questionId, gameType, correct, points]
  )
  return rows[0]
}

export async function updateTriviaStreak(userId, dateKey, correct) {
  const existing = await pool.query(`SELECT * FROM trivia_streaks WHERE user_id = $1`, [userId])
  let streak = 0
  let best = 0
  if (correct) {
    // Pure-UTC "yesterday" — dateKey() values are UTC strings, so the
    // comparison must not depend on the host's local timezone.
    const yStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    if (existing.rows[0] && existing.rows[0].last_date === yStr) {
      streak = existing.rows[0].streak + 1
      best = Math.max(existing.rows[0].best_streak, streak)
    } else {
      streak = existing.rows[0] && existing.rows[0].last_date === dateKey ? existing.rows[0].streak : 1
      best = existing.rows[0] ? Math.max(existing.rows[0].best_streak, streak) : streak
    }
  } else {
    streak = existing.rows[0]?.streak || 0
    best = existing.rows[0]?.best_streak || 0
  }
  const { rows } = await pool.query(
    `INSERT INTO trivia_streaks (user_id, streak, best_streak, last_date, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (user_id) DO UPDATE SET streak = $2, best_streak = $3, last_date = $4, updated_at = NOW()
     RETURNING *`,
    [userId, streak, best, correct ? dateKey : (existing.rows[0]?.last_date || dateKey)]
  )
  return rows[0]
}

export async function getTriviaStreak(userId) {
  const { rows } = await pool.query(`SELECT * FROM trivia_streaks WHERE user_id = $1`, [userId])
  return rows[0] || { streak: 0, best_streak: 0 }
}

export async function getTriviaLeaderboard(limit = 20) {
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.avatar,
       SUM(CASE WHEN ta.correct THEN 1 ELSE 0 END)::int as total_correct,
       COUNT(*)::int as total_answered,
       SUM(ta.points_awarded)::int as total_points,
       COALESCE(s.streak, 0) as streak
    FROM trivia_attempts ta 
    JOIN users u ON u.id = ta.user_id
    LEFT JOIN trivia_streaks s ON s.user_id = u.id
    GROUP BY u.id, u.name, u.avatar, s.streak
    ORDER BY total_points DESC, total_correct DESC, total_answered ASC
    LIMIT $1`,
    [limit]
  )
  return rows
}

export async function getCosmeticsCatalog() {
  const { rows } = await pool.query(
    `SELECT * FROM cosmetics WHERE active = TRUE
     ORDER BY CASE rarity WHEN 'common' THEN 0 WHEN 'rare' THEN 1 WHEN 'epic' THEN 2 ELSE 3 END, price ASC`
  )
  return rows
}

export async function getUserCosmetics(userId) {
  const { rows } = await pool.query(
    `SELECT c.*, uc.equipped, uc.purchased_at
     FROM user_cosmetics uc JOIN cosmetics c ON c.id = uc.cosmetic_id
     WHERE uc.user_id = $1 ORDER BY uc.purchased_at DESC`,
    [userId]
  )
  return rows
}

export async function purchaseCosmetic(userId, cosmeticId) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    
    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cosmeticId)) {
      await client.query('ROLLBACK')
      return { error: 'Invalid cosmetic ID format' }
    }
    
    const cosmeticResult = await client.query(`SELECT * FROM cosmetics WHERE id = $1 AND active = TRUE`, [cosmeticId])
    if (!cosmeticResult.rows[0]) {
      await client.query('ROLLBACK')
      return { error: 'Cosmetic not found' }
    }
    
    const owned = await client.query(`SELECT 1 FROM user_cosmetics WHERE user_id = $1 AND cosmetic_id = $2`, [userId, cosmeticId])
    if (owned.rows.length) {
      await client.query('ROLLBACK')
      return { error: 'Already owned' }
    }
    
    const coins = await getCoins(userId)
    const price = cosmeticResult.rows[0].price
    if (coins < price) {
      await client.query('ROLLBACK')
      return { error: 'Not enough coins' }
    }
    
    await client.query(`UPDATE users SET coins = coins - $1 WHERE id = $2 AND coins >= $1`, [price, userId])
    
    await client.query(
      `INSERT INTO user_cosmetics (user_id, cosmetic_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, cosmeticId]
    )
    
    await client.query('COMMIT')
    return { success: true, cosmetic: cosmetic.rows[0] }
  } catch (err) {
    await client.query('ROLLBACK')
    return { error: err.message }
  } finally {
    client.release()
  }
}

export async function equipCosmetic(userId, cosmeticId, equipped) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    
    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cosmeticId)) {
      await client.query('ROLLBACK')
      return { error: 'Invalid cosmetic ID format' }
    }
    
    // Check if user owns this cosmetic
    const owned = await client.query(
      `SELECT c.kind FROM user_cosmetics uc JOIN cosmetics c ON c.id = uc.cosmetic_id 
       WHERE uc.user_id = $1 AND uc.cosmetic_id = $2`,
      [userId, cosmeticId]
    )
    if (!owned.rows.length) {
      await client.query('ROLLBACK')
      return { error: 'Cosmetic not owned' }
    }
    
    const kind = owned.rows[0].kind
    
    if (equipped) {
      // Unequip all other cosmetics of the same kind
      await client.query(
        `UPDATE user_cosmetics uc 
         SET equipped = FALSE 
         FROM cosmetics c 
         WHERE uc.cosmetic_id = c.id 
         AND uc.user_id = $1 
         AND c.kind = $2 
         AND uc.cosmetic_id != $3`,
        [userId, kind, cosmeticId]
      )
      // Equip the selected cosmetic
      await client.query(
        `UPDATE user_cosmetics SET equipped = TRUE 
         WHERE user_id = $1 AND cosmetic_id = $2`,
        [userId, cosmeticId]
      )
    } else {
      await client.query(
        `UPDATE user_cosmetics SET equipped = FALSE 
         WHERE user_id = $1 AND cosmetic_id = $2`,
        [userId, cosmeticId]
      )
    }
    
    const { rows } = await client.query(
      `SELECT * FROM user_cosmetics WHERE user_id = $1 AND equipped = TRUE`,
      [userId]
    )
    
    await client.query('COMMIT')
    return { success: true, equipped: rows[0] || null }
  } catch (err) {
    await client.query('ROLLBACK')
    return { error: err.message }
  } finally {
    client.release()
  }
}

// ============ EASTER-EGG DIGITAL KEYS ============
export async function getDigitalKeysByContent(contentId) {
  const { rows } = await pool.query(
    `SELECT id, content_id, ts_seconds, pos_x, pos_y, radius, hint, reward_type
     FROM digital_keys
     WHERE content_id = $1 AND active = TRUE
     ORDER BY ts_seconds ASC`,
    [contentId]
  )
  return rows
}

export async function getDigitalKeyById(id) {
  const { rows } = await pool.query(`SELECT * FROM digital_keys WHERE id = $1`, [id])
  return rows[0] || null
}

export async function getCollectedKeyIds(userId, contentId) {
  const { rows } = await pool.query(
    `SELECT k.id FROM collected_keys ck
     JOIN digital_keys k ON k.id = ck.key_id
     WHERE ck.user_id = $1 AND k.content_id = $2`,
    [userId, contentId]
  )
  return rows.map(r => r.id)
}

export async function getKeyForSecretRoom(roomId) {
  const { rows } = await pool.query(`SELECT key_id FROM secret_rooms WHERE id = $1`, [roomId])
  return rows[0] ? rows[0].key_id : null
}

export async function hasSecretRoomAccess(userId, roomId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM secret_rooms sr
     JOIN collected_keys ck ON ck.key_id = sr.key_id
     WHERE sr.id = $1 AND ck.user_id = $2`,
    [roomId, userId]
  )
  return rows.length > 0
}

export async function getSecretRoom(roomId) {
  const { rows } = await pool.query(
    `SELECT sr.*, k.content_id, k.ts_seconds FROM secret_rooms sr
     JOIN digital_keys k ON k.id = sr.key_id
     WHERE sr.id = $1`,
    [roomId]
  )
  return rows[0] || null
}

export async function getUserCollectedKeys(userId) {
  const { rows } = await pool.query(
    `SELECT ck.collected_at, k.id AS key_id, k.content_id, k.ts_seconds, k.hint, k.reward_type,
       k.reward_ref,
       sr.id AS room_id, sr.name AS room_name,
       c.name AS badge_name, c.icon AS badge_icon
     FROM collected_keys ck
     JOIN digital_keys k ON k.id = ck.key_id
     LEFT JOIN secret_rooms sr ON sr.key_id = k.id
     LEFT JOIN cosmetics c ON c.id = k.reward_ref AND k.reward_type = 'badge'
     WHERE ck.user_id = $1
     ORDER BY ck.collected_at DESC`,
    [userId]
  )
  return rows
}

export async function collectKey(userId, keyId) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const keyRes = await client.query(
      `SELECT k.*, sr.id AS room_id, sr.name AS room_name,
        c.id AS cosmetic_id, c.name AS cosmetic_name, c.icon AS cosmetic_icon
       FROM digital_keys k
       LEFT JOIN secret_rooms sr ON sr.key_id = k.id
       LEFT JOIN cosmetics c ON c.id = k.reward_ref AND k.reward_type = 'badge'
       WHERE k.id = $1 AND k.active = TRUE`,
      [keyId]
    )
    const key = keyRes.rows[0]
    if (!key) {
      await client.query('ROLLBACK')
      return { collected: false, already: false, error: 'key_not_found' }
    }
    const cached = await client.query(
      `INSERT INTO collected_keys (user_id, key_id) VALUES ($1, $2) ON CONFLICT (user_id, key_id) DO NOTHING`,
      [userId, keyId]
    )
    if (cached.rowCount === 0) {
      await client.query('ROLLBACK')
      return { collected: true, already: true, reward: null, alreadyCollected: true }
    }
    let reward = null
    if (key.reward_type === 'badge' && key.cosmetic_id) {
      await client.query(
        `INSERT INTO user_cosmetics (user_id, cosmetic_id) VALUES ($1, $2)
         ON CONFLICT (user_id, cosmetic_id) DO NOTHING`,
        [userId, key.cosmetic_id]
      )
      reward = { type: 'badge', id: key.cosmetic_id, name: key.cosmetic_name, icon: key.cosmetic_icon }
    } else if (key.reward_type === 'secret_room' && key.room_id) {
      reward = { type: 'secret_room', id: key.room_id, name: key.room_name }
    }
    await client.query(
      `UPDATE users SET coins = coins + 50, xp = xp + 25 WHERE id = $1`,
      [userId]
    )
    await client.query('COMMIT')
    return { collected: true, already: false, reward }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

export async function createDigitalKey({ contentId, creatorId, code, ts, x, y, radius, hint, rewardType, rewardRef }) {
  const { rows } = await pool.query(
    `INSERT INTO digital_keys
       (content_id, creator_id, code, ts_seconds, pos_x, pos_y, radius, hint, reward_type, reward_ref)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [contentId, creatorId, code, ts, x, y, radius, hint, rewardType, rewardRef]
  )
  return rows[0]
}

export async function createSecretRoom({ keyId, name, description }) {
  const { rows } = await pool.query(
    `INSERT INTO secret_rooms (key_id, name, description) VALUES ($1, $2, $3)
     ON CONFLICT (key_id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description
     RETURNING *`,
    [keyId, name, description]
  )
  return rows[0]
}

export async function getUploadById(id) {
  const { rows } = await pool.query(
    `SELECT * FROM uploads WHERE id::text = $1`,
    [id]
  )
  return rows[0] || null
}

export async function getCosmeticById(id) {
  const { rows } = await pool.query(`SELECT * FROM cosmetics WHERE id = $1 AND active = TRUE`, [id])
  return rows[0] || null
}

export async function getDefaultEggBadge() {
  const { rows } = await pool.query(
    `SELECT * FROM cosmetics WHERE kind = 'badge' AND active = TRUE
     ORDER BY (name = 'Easter Egg Hunter') DESC, price ASC
     LIMIT 1`
  )
  return rows[0] || null
}

// ============ CREATOR REVENUE / DUAL-POOL VPM ============
export async function bumpUploadViewMinutes(contentId, minutes) {
  if (!minutes || minutes <= 0) return
  await pool.query(
    `UPDATE uploads SET minutes_watched = COALESCE(minutes_watched,0) + $2
     WHERE id::text = $1`,
    [contentId, minutes]
  )
}

export async function getNetSubscriptionRevenue() {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(amount),0) AS total FROM transactions
     WHERE type = 'subscription' AND status = 'success'`
  )
  return parseFloat(rows[0].total) || 0
}

export async function getMovieMinutesByCreator() {
  const { rows } = await pool.query(
    `SELECT user_id AS creator_id, COALESCE(SUM(minutes_watched),0) AS minutes
     FROM uploads
     WHERE status IN ('active','published')
     GROUP BY user_id`
  )
  return rows
}

export async function getShortMinutesByCreator() {
  const { rows } = await pool.query(
    `SELECT s.user_id AS creator_id,
            COALESCE(SUM(COALESCE(s.views,0) * COALESCE(s.duration_seconds,0)) / 60.0,0) AS minutes
     FROM shorts s
     WHERE s.status = 'active'
     GROUP BY s.user_id`
  )
  return rows
}

export async function settleDualPool(period) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('DELETE FROM creator_earnings WHERE period = $1', [period])

    const netRevenue = parseFloat((await client.query(
      `SELECT COALESCE(SUM(amount),0) AS total FROM transactions
       WHERE type='subscription' AND status='success'
         AND to_char(created_at,'YYYY-MM') = $1`, [period]
    )).rows[0].total) || 0

    const corporate = netRevenue * 0.40
    const creative = netRevenue * 0.60
    const moviePool = creative * 0.80
    const shortPool = creative * 0.20

    const movies = (await client.query(
      `SELECT user_id AS creator_id, SUM(minutes_watched) AS minutes FROM uploads
       WHERE status IN ('active','published') GROUP BY user_id`
    )).rows
    const shorts = (await client.query(
      `SELECT s.user_id AS creator_id, SUM(COALESCE(s.views,0)*COALESCE(s.duration_seconds,0))/60.0 AS minutes
       FROM shorts s WHERE s.status='active' GROUP BY s.user_id`
    )).rows

    const movieMinutes = movies.reduce((s, r) => s + parseFloat(r.minutes || 0), 0)
    const shortMinutes = shorts.reduce((s, r) => s + parseFloat(r.minutes || 0), 0)
    const movieVpm = movieMinutes > 0 ? moviePool / movieMinutes : 0
    const shortVpm = shortMinutes > 0 ? shortPool / shortMinutes : 0

const rows = []
    for (const m of movies) {
      const amount = (parseFloat(m.minutes || 0) * movieVpm).toFixed(2)
      if (parseFloat(amount) > 0) {
        await client.query(
          `INSERT INTO creator_earnings (period, creator_id, pool_type, minutes, vpm, amount)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (period, creator_id, pool_type) DO UPDATE
           SET minutes=EXCLUDED.minutes, vpm=EXCLUDED.vpm, amount=EXCLUDED.amount`,
          [period, m.creator_id, 'movie', m.minutes, movieVpm.toFixed(5), amount]
        )
        rows.push({ period, creator_id: m.creator_id, pool_type: 'movie', minutes: m.minutes, vpm: movieVpm.toFixed(5), amount })
      }
    }
    for (const s of shorts) {
      const amount = (parseFloat(s.minutes || 0) * shortVpm).toFixed(2)
      if (parseFloat(amount) > 0) {
        await client.query(
          `INSERT INTO creator_earnings (period, creator_id, pool_type, minutes, vpm, amount)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (period, creator_id, pool_type) DO UPDATE
           SET minutes=EXCLUDED.minutes, vpm=EXCLUDED.vpm, amount=EXCLUDED.amount`,
          [period, s.creator_id, 'short', s.minutes, shortVpm.toFixed(5), amount]
        )
        rows.push({ period, creator_id: s.creator_id, pool_type: 'short', minutes: s.minutes, vpm: shortVpm.toFixed(5), amount })
      }
    }

    await client.query('COMMIT')
    return {
      period,
      netRevenue,
      corporate: +corporate.toFixed(2),
      creative: +creative.toFixed(2),
      moviePool: +moviePool.toFixed(2),
      shortPool: +shortPool.toFixed(2),
      movieMinutes: +movieMinutes.toFixed(1),
      shortMinutes: +shortMinutes.toFixed(1),
      movieVpm: +movieVpm.toFixed(5),
      shortVpm: +shortVpm.toFixed(5),
      entries: rows.length,
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

export async function getCreatorEarnings(creatorId) {
  const { rows } = await pool.query(
    `SELECT period, pool_type, minutes, vpm, amount, settled_at
     FROM creator_earnings WHERE creator_id = $1 ORDER BY period DESC, pool_type ASC`,
    [creatorId]
  )
  return rows
}

export async function getCreatorEarningsSummary(creatorId) {
  const { rows } = await pool.query(
    `SELECT pool_type, COALESCE(SUM(amount),0) AS total, COALESCE(SUM(minutes),0) AS minutes
     FROM creator_earnings WHERE creator_id = $1 GROUP BY pool_type`,
    [creatorId]
  )
  const movie = rows.find(r => r.pool_type === 'movie') || { total: 0, minutes: 0 }
  const short = rows.find(r => r.pool_type === 'short') || { total: 0, minutes: 0 }
  const grandTotal = parseFloat(movie.total) + parseFloat(short.total)
  return { movie: parseFloat(movie.total), short: parseFloat(short.total), total: grandTotal, minutes: parseFloat(movie.minutes) + parseFloat(short.minutes) }
}

// ============ NOTIFICATIONS ============
export async function createNotification({ userId, type = 'system', title, body = '', link = '', actorId = null }) {
  if (!userId) return null
  const { rows } = await pool.query(
    `INSERT INTO notifications (user_id, type, title, body, link, actor_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [userId, type, title, body, link, actorId]
  )
  return rows[0]
}

export async function createNotificationsBulk(recipients, { type = 'system', title, body = '', link = '', actorId = null }) {
  if (!recipients || recipients.length === 0) return []
  const userIds = recipients.map((r) => r.id)
  const types = recipients.map(() => type)
  const titles = recipients.map(() => title)
  const bodies = recipients.map(() => body)
  const links = recipients.map(() => link)
  const actorIds = recipients.map(() => actorId)
  const { rows } = await pool.query(
    `INSERT INTO notifications (user_id, type, title, body, link, actor_id)
     SELECT * FROM unnest($1::uuid[], $2::text[], $3::text[], $4::text[], $5::text[], $6::uuid[])
     RETURNING id, user_id, type, title, body, link, is_read, created_at, actor_id`,
    [userIds, types, titles, bodies, links, actorIds]
  )
  return rows
}

export async function getNotifications(userId, limit = 30, offset = 0) {
  const { rows } = await pool.query(
    `SELECT n.id, n.type, n.title, n.body, n.link, n.is_read, n.created_at,
            u.name AS actor_name, u.avatar AS actor_avatar
     FROM notifications n
     LEFT JOIN users u ON u.id = n.actor_id
     WHERE n.user_id = $1
     ORDER BY n.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, Math.min(parseInt(limit, 10) || 30, 50), Math.max(parseInt(offset, 10) || 0, 0)]
  )
  return rows
}

export async function getUnreadCount(userId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS count FROM notifications WHERE user_id = $1 AND is_read = FALSE`,
    [userId]
  )
  return parseInt(rows[0].count, 10) || 0
}

export async function markNotificationRead(id, userId) {
  const { rows } = await pool.query(
    `UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, userId]
  )
  return rows[0] || null
}

export async function markAllNotificationsRead(userId) {
  const { rows } = await pool.query(
    `UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE RETURNING id`,
    [userId]
  )
  return rows.length
}

export async function savePushSubscription({ userId, endpoint, p256dh, auth, plan = 'free' }) {
  if (!userId || !endpoint || !p256dh || !auth) return null
  const { rows } = await pool.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, plan)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       p256dh = EXCLUDED.p256dh,
       auth = EXCLUDED.auth,
       plan = EXCLUDED.plan,
       updated_at = NOW()
     RETURNING *`,
    [userId, endpoint, p256dh, auth, plan]
  )
  return rows[0]
}

export async function getPushSubscriptionsForUsers(userIds) {
  if (!userIds || userIds.length === 0) return []
  const { rows } = await pool.query(
    `SELECT user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ANY($1)`,
    [userIds]
  )
  return rows
}

export async function deletePushSubscription(endpoint) {
  if (!endpoint) return
  await pool.query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [endpoint])
}

export async function getUsersByPlans(plans) {
  if (!plans || plans.length === 0) return []
  const { rows } = await pool.query(
    `SELECT id, email, name, plan, role, email_verified FROM users WHERE plan = ANY($1) AND role != 'banned'`,
    [plans]
  )
  return rows
}

export async function getUsersByRoles(roles) {
  if (!roles || roles.length === 0) return []
  const { rows } = await pool.query(
    `SELECT id, email, name, plan, role, email_verified FROM users WHERE role = ANY($1)`,
    [roles]
  )
  return rows
}

export { pool }

// ============ Admin Platform ============

export async function logAdminAudit({ actorId, action, entity, entityId, meta = {} }) {
  if (!actorId) return
  await pool.query(
    `INSERT INTO admin_audit_log (actor_id, action, entity, entity_id, meta) VALUES ($1,$2,$3,$4,$5)`,
    [actorId, action, entity, entityId || null, meta]
  ).catch(() => {})
}

export async function getRecentAdminActivity(limit = 15) {
  const { rows } = await pool.query(
    `SELECT a.id, a.action, a.entity, a.entity_id, a.meta, a.created_at, u.name AS actor_name
     FROM admin_audit_log a LEFT JOIN users u ON u.id = a.actor_id
     ORDER BY a.created_at DESC LIMIT $1`,
    [limit]
  )
  return rows
}

export async function getOverview() {
  const [allUsers, allTime, minutes, activeSubs, revenue, tips, shorts, reports, sockets] = await Promise.all([
    pool.query('SELECT COUNT(*) AS n FROM users'),
    pool.query('SELECT COUNT(*) AS n FROM uploads'),
    pool.query('SELECT COALESCE(SUM(minutes),0) AS n FROM watch_history'),
    pool.query('SELECT COUNT(*) AS n FROM subscriptions WHERE active = true'),
    pool.query('SELECT COALESCE(SUM(amount),0) AS n FROM transactions WHERE type IN ($1,$2)', ['subscription', 'renewal']),
    pool.query('SELECT COALESCE(SUM(amount),0) AS n FROM tips'),
    pool.query('SELECT COUNT(*) AS n FROM shorts'),
    pool.query('SELECT COUNT(*) AS n FROM reports WHERE status = \'open\''),
  ])
  return {
    totalUsers: allUsers.rows[0].n,
    totalUploads: allTime.rows[0].n,
    totalMinutesWatched: allTime.rows[0].n,
    activeSubscriptions: activeSubs.rows[0].n,
    revenue: revenue.rows[0].n,
    tips: tips.rows[0].n,
    totalShorts: shorts.rows[0].n,
    openReports: reports.rows[0].n,
  }
}

export async function getRevenueTimeSeries(days = 30) {
  const { rows } = await pool.query(
    `SELECT to_char(created_at, 'YYYY-MM-DD') AS day,
            SUM(amount) AS revenue,
            COUNT(*) AS txns
     FROM transactions
     WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day')
     GROUP BY day ORDER BY day`,
    [days]
  )
  return rows.map(r => ({ day: r.day, revenue: Number(r.revenue || 0), txns: Number(r.txns) }))
}

export async function getSignupsByDay(days = 30) {
  const { rows } = await pool.query(
    `SELECT to_char(created_at, 'YYYY-MM-DD') AS day, COUNT(*) AS n
     FROM users WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day')
     GROUP BY day ORDER BY day`,
    [days]
  )
  return rows.map(r => ({ day: r.day, n: Number(r.n) }))
}

export async function getWatchMinutesByDay(days = 30) {
  const { rows } = await pool.query(
    `SELECT to_char(watched_at, 'YYYY-MM-DD') AS day, COALESCE(SUM(minutes),0) AS n
     FROM watch_history WHERE watched_at >= NOW() - ($1::int * INTERVAL '1 day')
     GROUP BY day ORDER BY day`,
    [days]
  )
  return rows.map(r => ({ day: r.day, n: Number(r.n) }))
}

export async function getRevenueByType(limit = 20) {
  const { rows } = await pool.query(
    `SELECT type, COUNT(*) AS n, COALESCE(SUM(amount),0) AS total
     FROM transactions GROUP BY type ORDER BY total DESC LIMIT $1`,
    [limit]
  )
  return rows
}

export async function getSubscriberPlanBreakdown() {
  const { rows } = await pool.query(
    `SELECT plan, COUNT(*) AS n FROM subscriptions WHERE active = true GROUP BY plan`
  )
  return rows
}

export async function getChurnStats() {
  const { rows } = await pool.query(
    `SELECT
      (SELECT COUNT(*) FROM subscriptions WHERE active = false) AS churned,
      (SELECT COUNT(*) FROM subscriptions WHERE active = true) AS active`
  )
  return rows[0]
}

export async function getPlanCounts() {
  const { rows } = await pool.query(`SELECT plan, COUNT(*) AS n FROM users GROUP BY plan`)
  return rows
}

export async function getTopContent(limit = 10) {
  const [uploads, shorts] = await Promise.all([
    pool.query(
      `SELECT 'upload' AS content_type, id, title, views, minutes_watched AS minutes, revenue
       FROM uploads ORDER BY views DESC LIMIT $1`, [limit]
    ),
    pool.query(
      `SELECT 'short' AS content_type, id, title, views, 0 AS minutes, 0 AS revenue
       FROM shorts ORDER BY views DESC LIMIT $1`, [limit]
    ),
  ])
  return [...shorts.rows, ...uploads.rows].sort((a, b) => b.views - a.views).slice(0, limit)
}

export async function getAdminSessionsCount() {
  const { rows } = await pool.query('SELECT COUNT(*) AS n FROM active_sessions WHERE last_heartbeat > NOW() - INTERVAL \'5 minutes\'')
  return Number(rows[0].n)
}

export async function adminListUploads({ search = '', status, limit = 100, offset = 0 }) {
  const conds = []
  const params = []
  if (search) { params.push(`%${search}%`); conds.push(`(title ILIKE $${params.length} OR description ILIKE $${params.length})`) }
  if (status) { params.push(status); conds.push(`status = $${params.length}`) }
  params.push(limit)
  params.push(offset)
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : ''
  const { rows } = await pool.query(
    `SELECT uploads.*, u.name AS owner_name FROM uploads
     JOIN users u ON u.id = uploads.user_id
     ${where} ORDER BY uploads.created_at DESC LIMIT $${params.length-1} OFFSET $${params.length}`,
    params
  )
  return rows
}

export async function adminUpdateUpload(id, fields) {
  const allowed = ['status', 'title', 'description', 'genre', 'maturity_rating', 'language', 'cast_list', 'trailer_url', 'subtitle_url', 'audio_tracks', 'artwork']
  const sets = []
  const params = []
  for (const k of allowed) {
    if (fields[k] !== undefined) { params.push(fields[k]); sets.push(`${k} = $${params.length}`) }
  }
  if (!sets.length) return null
  params.push(id)
  const { rows } = await pool.query(`UPDATE uploads SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params)
  return rows[0]
}

export async function getAllShorts({ search = '', limit = 100, offset = 0 }) {
  const params = []
  let where = ''
  if (search) { params.push(`%${search}%`); where = `WHERE title ILIKE $${params.length} OR description ILIKE $${params.length}` }
  params.push(limit, offset)
  const { rows } = await pool.query(
    `SELECT shorts.*, u.name AS owner_name FROM shorts JOIN users u ON u.id = shorts.user_id
     ${where} ORDER BY shorts.created_at DESC LIMIT $${params.length-1} OFFSET $${params.length}`,
    params
  )
  return rows
}

export async function getAllTransactions({ limit = 100, offset = 0, type } = {}) {
  const params = []
  let where = ''
  if (type) { params.push(type); where = `WHERE type = $${params.length}` }
  params.push(limit, offset)
  const { rows } = await pool.query(
    `SELECT tr.*, u.email, u.name FROM transactions tr JOIN users u ON u.id = tr.user_id
     ${where} ORDER BY tr.created_at DESC LIMIT $${params.length-1} OFFSET $${params.length}`, params
  )
  return rows
}

export async function getAllSubscriptions() {
  const { rows } = await pool.query(
    `SELECT s.*, u.email, u.name FROM subscriptions s JOIN users u ON u.id = s.user_id
     ORDER BY s.started_at DESC`
  )
  return rows
}

export async function createPromoCode({ code, plan = 'premium', discountType = 'pct', discountValue = 0, maxUses = 0, expiresAt = null, minAmount = 0, applyToAllPlans = false, allowedIps = [], allowedPhones = [], country = null, startsAt = null, usagePerUser = 0, mode = 'one_time' }) {
  const { rows } = await pool.query(
    `INSERT INTO promo_codes (code, plan, discount_type, discount_value, max_uses, expires_at, min_amount, apply_to_all_plans, allowed_ips, allowed_phones, country, starts_at, usage_per_user, mode)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (code) DO NOTHING RETURNING *`,
    [code, plan, discountType, discountValue, maxUses, expiresAt, minAmount, applyToAllPlans, allowedIps, allowedPhones, country, startsAt, usagePerUser, mode]
  )
  return rows[0]
}

export async function updatePromoCode(id, updates) {
  const fields = []
  const values = []
  let param = 1
  const allowed = ['plan', 'discount_type', 'discount_value', 'max_uses', 'expires_at', 'min_amount', 'apply_to_all_plans', 'allowed_ips', 'allowed_phones', 'country', 'starts_at', 'usage_per_user', 'mode', 'active']
  for (const [key, val] of Object.entries(updates)) {
    if (allowed.includes(key)) {
      fields.push(`${key} = $${param}`)
      values.push(val)
      param++
    }
  }
  if (fields.length === 0) return null
  values.push(id)
  const { rows } = await pool.query(
    `UPDATE promo_codes SET ${fields.join(', ')} WHERE id = $${param} RETURNING *`,
    values
  )
  return rows[0]
}

export async function deletePromoCode(id) {
  await pool.query(`DELETE FROM promo_codes WHERE id = $1`, [id])
  return true
}

export async function getPromoCodeById(id) {
  const { rows } = await pool.query(`SELECT * FROM promo_codes WHERE id = $1`, [id])
  return rows[0] || null
}

export async function listPromoCodes() {
  const { rows } = await pool.query(`SELECT * FROM promo_codes ORDER BY created_at DESC`)
  return rows
}

export async function listBanners() {
  const { rows } = await pool.query(`SELECT * FROM banners ORDER BY active DESC, sort ASC, created_at DESC`)
  return rows
}

export async function createBanner({ title, imageUrl, link, position = 'home', active = true, sort = 0 }) {
  const { rows } = await pool.query(
    `INSERT INTO banners (title, image_url, link, position, active, sort) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [title, imageUrl, link, position, active, sort]
  )
  return rows[0]
}

export async function listAudioLibrary() {
  const { rows } = await pool.query(`SELECT * FROM audio_library ORDER BY created_at DESC`)
  return rows
}

export async function createAudioTrack({ title, artist, url, license }) {
  const { rows } = await pool.query(
    `INSERT INTO audio_library (title, artist, url, license) VALUES ($1,$2,$3,$4) RETURNING *`,
    [title, artist, url, license]
  )
  return rows[0]
}

export async function getFeedSettingsValue(key, fallback = {}) {
  const { rows } = await pool.query(`SELECT value FROM feed_settings WHERE key = $1`, [key])
  return rows[0] ? rows[0].value : fallback
}

export async function setFeedSettings(key, value) {
  const { rows } = await pool.query(
    `INSERT INTO feed_settings (key, value) VALUES ($1,$2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW() RETURNING *`,
    [key, value]
  )
  return rows[0]
}

export async function getDefaultCurrency() {
  const value = await getFeedSettingsValue('default_currency', 'NGN')
  return typeof value === 'string' ? value : (value?.currency || 'NGN')
}

export async function setDefaultCurrency(currency) {
  return setFeedSettings('default_currency', currency)
}

export async function listCreatorApplications() {
  const { rows } = await pool.query(
    `SELECT ca.*, u.email, u.name FROM creator_applications ca JOIN users u ON u.id = ca.user_id ORDER BY ca.created_at DESC`
  )
  return rows
}

export async function getForumModerationItems() {
  const { rows } = await pool.query(
    `SELECT f.id, f.content, f.created_at, u.name AS author_name
     FROM forum_replies f JOIN users u ON u.id = f.author_id ORDER BY f.created_at DESC LIMIT 50`
  )
  return rows
}

export async function updateReportStatus(id, status) {
  const { rows } = await pool.query(
    `UPDATE reports SET status = $1 WHERE id = $2 RETURNING *`, [status, id]
  )
  return rows[0]
}

export async function deleteReview(id) {
  await pool.query(`DELETE FROM reviews WHERE id = $1`, [id])
}

export async function getFeedSettingsAll() {
  const { rows } = await pool.query(`SELECT key, value FROM feed_settings`)
  return rows
}

export async function getRevenueBySeries(days = 30) {
  const { rows } = await pool.query(
    `SELECT to_char(created_at, 'YYYY-MM-DD') AS day,
            SUM(amount) AS revenue, COUNT(*) AS txns
     FROM transactions
     WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day')
     GROUP BY day ORDER BY day`, [days]
  )
  return rows.map(r => ({ day: r.day, revenue: Number(r.revenue || 0), txns: Number(r.txns) }))
}

export async function getTopViewsByType(limit = 10) {
  const [movies, shorts] = await Promise.all([
    pool.query(`SELECT 'movie' AS content_type, id, title, views, minutes_watched AS minutes, revenue FROM uploads ORDER BY views DESC LIMIT $1`, [limit]),
    pool.query(`SELECT 'short' AS content_type, id, title, views, 0 AS minutes, 0 AS revenue FROM shorts ORDER BY views DESC LIMIT $1`, [limit]),
  ])
  return [...shorts.rows, ...movies.rows].sort((a, b) => b.views - a.views).slice(0, limit)
}

// ============ RBAC (Admin Roles & Permissions) ============

export async function getAdminRoles() {
  const { rows } = await pool.query(`SELECT * FROM admin_roles ORDER BY is_system DESC, created_at ASC`)
  return rows
}

export async function getAdminRoleBySlug(slug) {
  const { rows } = await pool.query(`SELECT * FROM admin_roles WHERE slug = $1`, [slug])
  return rows[0]
}

export async function createAdminRole({ name, slug, description = '', permissions = [] }) {
  const { rows } = await pool.query(
    `INSERT INTO admin_roles (name, slug, description, permissions, is_system) VALUES ($1,$2,$3,$4,FALSE)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, permissions = EXCLUDED.permissions, updated_at = NOW()
     RETURNING *`,
    [name, slug, description, JSON.stringify(permissions)]
  )
  return rows[0]
}

export async function updateAdminRole(id, { name, description, permissions }) {
  const { rows } = await pool.query(
    `UPDATE admin_roles SET name = $1, description = $2, permissions = $3, updated_at = NOW()
     WHERE id = $4 AND is_system = FALSE RETURNING *`,
    [name, description, JSON.stringify(permissions), id]
  )
  return rows[0]
}

export async function deleteAdminRole(id) {
  const { rows } = await pool.query(
    `DELETE FROM admin_roles WHERE id = $1 AND is_system = FALSE
     RETURNING id`,
    [id]
  )
  return rows[0]
}

export async function getAdminRolePermissions(userId) {
  if (!userId) return { slug: null, permissions: [] }
  const { rows } = await pool.query(
    `SELECT ar.slug, ar.permissions FROM users u
     LEFT JOIN admin_roles ar ON ar.id = u.admin_role_id
     WHERE u.id = $1`,
    [userId]
  )
  const row = rows[0]
  const perms = row?.permissions
  return {
    slug: row?.slug || null,
    permissions: Array.isArray(perms) ? perms : [],
  }
}

// Effective permission set for an admin: 'super-admin' slug bypasses everything.
export async function hasAdminPermission(userId, key) {
  if (!userId) return false
  const { rows } = await pool.query(
    `SELECT ar.slug, ar.permissions FROM users u
     LEFT JOIN admin_roles ar ON ar.id = u.admin_role_id
     WHERE u.id = $1`,
    [userId]
  )
  const row = rows[0]
  if (!row) return false
  if (row.slug === 'super-admin') return true
  return Array.isArray(row.permissions) ? row.permissions.includes(key) : false
}

export async function assignAdminRole(userId, adminRoleId) {
  const { rows } = await pool.query(
    `UPDATE users SET admin_role_id = $1 WHERE id = $2 RETURNING *`,
    [adminRoleId, userId]
  )
  return rows[0]
}

export async function clearAdminRole(userId) {
  const { rows } = await pool.query(`UPDATE users SET admin_role_id = NULL WHERE id = $1 RETURNING *`, [userId])
  return rows[0]
}

export async function createAppeal({ userId, userEmail, userName, appealType, message, accountReason, accountUntil }) {
  const { rows } = await pool.query(
    `INSERT INTO appeals (user_id, user_email, user_name, appeal_type, message, account_reason, account_until)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [userId, userEmail, userName || '', appealType || 'suspension', message, accountReason || '', accountUntil || null]
  )
  return rows[0]
}

export async function getAppeals(status) {
  const cond = status && status !== 'all' ? `WHERE status = $1` : ''
  const params = status && status !== 'all' ? [status] : []
  const { rows } = await pool.query(
    `SELECT * FROM appeals ${cond} ORDER BY created_at DESC LIMIT 300`,
    params
  )
  return rows
}

export async function getAppealsByUser(userId) {
  const { rows } = await pool.query(`SELECT * FROM appeals WHERE user_id = $1 ORDER BY created_at DESC`, [userId])
  return rows
}

export async function resolveAppeal(id, { status, resolutionNote, reviewedBy }) {
  const { rows } = await pool.query(
    `UPDATE appeals SET status = $1, resolution_note = $2, reviewed_by = $3, reviewed_at = NOW()
     WHERE id = $4 RETURNING *`,
    [status, resolutionNote || '', reviewedBy || null, id]
  )
  return rows[0]
}

// ============ PRODUCTION AUTH: Refresh Tokens ============

export async function createRefreshToken(userId, tokenHash, expiresAt) {
  const { rows } = await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3) RETURNING *`,
    [userId, tokenHash, expiresAt]
  )
  return rows[0]
}

export async function findRefreshToken(tokenHash) {
  const { rows } = await pool.query(
    `SELECT * FROM refresh_tokens WHERE token_hash = $1`,
    [tokenHash]
  )
  return rows[0] || null
}

export async function deleteRefreshToken(tokenHash) {
  await pool.query(`DELETE FROM refresh_tokens WHERE token_hash = $1`, [tokenHash])
}

export async function deleteAllRefreshTokens(userId) {
  await pool.query(`DELETE FROM refresh_tokens WHERE user_id = $1`, [userId])
}

// ============ PRODUCTION AUTH: Token Blocklist ============

export async function addToBlocklist(tokenHash, expiresAt) {
  await pool.query(
    `INSERT INTO token_blocklist (token_hash, expires_at)
     VALUES ($1, $2)
     ON CONFLICT (token_hash) DO NOTHING`,
    [tokenHash, expiresAt]
  )
}

export async function isTokenBlocked(tokenHash) {
  const { rows } = await pool.query(
    `SELECT 1 FROM token_blocklist WHERE token_hash = $1 LIMIT 1`,
    [tokenHash]
  )
  return rows.length > 0
}

export async function cleanupExpiredBlocklist() {
  await pool.query(`DELETE FROM token_blocklist WHERE expires_at < NOW()`)
}

// ============ PRODUCTION AUTH: Rate Limiting ============

export async function recordRateLimitAttempt(identifier, action) {
  await pool.query(
    `INSERT INTO rate_limit_log (identifier, action) VALUES ($1, $2)`,
    [identifier, action]
  )
}

export async function getRateLimitAttempts(identifier, action, windowMs = 900000) {
  const windowSeconds = Math.floor(windowMs / 1000)
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM rate_limit_log
     WHERE identifier = $1 AND action = $2
       AND attempted_at > NOW() - INTERVAL '1 second' * $3`,
    [identifier, action, windowSeconds]
  )
  return rows[0]?.count || 0
}

export async function clearRateLimitAttempts(identifier, action) {
  await pool.query(
    `DELETE FROM rate_limit_log WHERE identifier = $1 AND action = $2`,
    [identifier, action]
  )
}

export async function cleanupOldRateLimitLogs() {
  await pool.query(
    `DELETE FROM rate_limit_log WHERE attempted_at < NOW() - INTERVAL '1 hour'`
  )
}

// ============ PRODUCTION AUTH: Account Lockout ============

export async function incrementFailedLoginAttempts(userId) {
  const { rows } = await pool.query(
    `UPDATE users SET failed_login_attempts = failed_login_attempts + 1,
       locked_until = CASE WHEN failed_login_attempts + 1 >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE locked_until END
     WHERE id = $1 RETURNING failed_login_attempts, locked_until`,
    [userId]
  )
  return rows[0] || null
}

export async function resetFailedLoginAttempts(userId) {
  await pool.query(
    `UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1`,
    [userId]
  )
}

export async function isAccountLocked(userId) {
  const { rows } = await pool.query(
    `SELECT locked_until FROM users WHERE id = $1`,
    [userId]
  )
  const lockedUntil = rows[0]?.locked_until
  if (!lockedUntil) return false
  return new Date(lockedUntil) > new Date()
}
