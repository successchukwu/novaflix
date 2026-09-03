import pool from '../config/database.js'
import {
  ingestConfig,
  deliveryConfig,
  getActiveStream,
  listLiveStreams,
  announceLive,
} from '../services/liveStreamService.js'
import { broadcastToRoom } from '../services/realtime.js'

// Creator-facing: full ingest + delivery protocol config for going live.
export async function getCreatorStreamInfo(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT stream_key, stream_url FROM creator_stream_keys WHERE creator_id = $1`,
      [req.userId]
    )
    let key = rows[0]?.stream_key
    if (!key) {
      key = (await import('crypto')).default.randomBytes(24).toString('hex')
      await pool.query(
        `INSERT INTO creator_stream_keys (creator_id, stream_key, stream_url)
         VALUES ($1, $2, $3) ON CONFLICT (creator_id) DO UPDATE SET stream_key = EXCLUDED.stream_key`,
        [req.userId, key, 'rtmp://localhost:1935/live']
      )
    }
    const active = await getActiveStream(req.userId)
    const ingest = ingestConfig(key)
    res.json({
      success: true,
      ingest,
      delivery: deliverIfActive(active, key),
      live: !!active,
      stream: active,
    })
  } catch (err) {
    console.error('getCreatorStreamInfo error:', err.message)
    res.status(500).json({ success: false, error: 'Failed to load stream info' })
  }
}

function deliverIfActive(active, key) {
  if (!active) return null
  return { ...deliveryConfig(active.id, key), id: active.id }
}

// Public: list of live streams with a lightweight delivery preview.
export async function listLiveStreamsHandler(req, res) {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50)
    const streams = await listLiveStreams(limit)
    res.json({ success: true, streams })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

// Public: single live stream + its playback/chat endpoints.
export async function getLiveStreamHandler(req, res) {
  try {
    const { id } = req.params
    const { rows } = await pool.query(
      `SELECT cs.*, u.name AS creator_name, u.avatar AS creator_avatar
       FROM creator_streams cs
       JOIN users u ON u.id = cs.creator_id
       WHERE cs.id = $1 AND cs.status = 'live'`,
      [id]
    )
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Stream not live' })
    const stream = rows[0]
    const { rows: k } = await pool.query(
      `SELECT stream_key FROM creator_stream_keys WHERE creator_id = $1`,
      [stream.creator_id]
    )
    stream.delivery = deliveryConfig(stream.id, k[0]?.stream_key || stream.id)
    res.json({ success: true, stream })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

// Post a live chat message; broadcasts to the stream room in real time.
export async function postLiveChat(req, res) {
  try {
    const { id } = req.params
    const { message } = req.body
    if (!message || !String(message).trim()) {
      return res.status(400).json({ success: false, error: 'message required' })
    }
    const { rows } = await pool.query(
      `SELECT id FROM creator_streams WHERE id = $1 AND status = 'live'`,
      [id]
    )
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Stream not live' })
    const who = req.user ? { id: req.user.id, name: req.user.name || 'Viewer', avatar: req.user.avatar || null } : { id: null, name: 'Guest', avatar: null }
    const payload = { streamId: id, user: who, message: String(message).trim(), ts: Date.now() }
    broadcastToRoom(`stream:${id}`, { type: 'live:chat', ...payload })
    res.json({ success: true, message: payload })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

export default {
  getCreatorStreamInfo,
  listLiveStreamsHandler,
  getLiveStreamHandler,
  postLiveChat,
}
