import crypto from 'crypto'
import pool from '../config/database.js'
import { notifyCreator } from '../services/creatorRealtime.js'

const DEFAULT_PPM = { movie_vpm: 2.5, short_vpm: 1.2, minimum_payout: 50.0, auto_settle: true }

export async function getPpmConfig(req, res) {
  try {
    const { rows } = await pool.query(
      `INSERT INTO creator_ppm_config (creator_id, movie_vpm, short_vpm, minimum_payout, auto_settle)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (creator_id) DO UPDATE SET creator_id = EXCLUDED.creator_id
       RETURNING creator_id, base_rate, movie_vpm, short_vpm, minimum_payout, auto_settle, updated_at`,
      [req.userId, DEFAULT_PPM.movie_vpm, DEFAULT_PPM.short_vpm, DEFAULT_PPM.minimum_payout, DEFAULT_PPM.auto_settle]
    )
    res.json({ success: true, config: rows[0] })
  } catch (err) {
    console.error('getPpmConfig error:', err.message)
    res.status(500).json({ success: false, error: 'Failed to load PPM config' })
  }
}

// PPM payout rate is admin-controlled (single source of truth: creator_ppm_config.base_rate).
// Creators are read-only; this returns the current config without allowing rate changes.
export async function savePpmConfig(req, res) {
  try {
    const { rows } = await pool.query(
      `INSERT INTO creator_ppm_config (creator_id, movie_vpm, short_vpm, minimum_payout, auto_settle)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (creator_id) DO UPDATE SET creator_id = EXCLUDED.creator_id
       RETURNING creator_id, base_rate, movie_vpm, short_vpm, minimum_payout, auto_settle, updated_at`,
      [req.userId, DEFAULT_PPM.movie_vpm, DEFAULT_PPM.short_vpm, DEFAULT_PPM.minimum_payout, DEFAULT_PPM.auto_settle]
    )
    res.json({ success: true, config: rows[0], readOnly: true, message: 'PPM payout rate is set by the platform admin.' })
  } catch (err) {
    console.error('savePpmConfig error:', err.message)
    res.status(500).json({ success: false, error: 'Failed to load PPM config' })
  }
}

export async function getStreamKey(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT stream_key, stream_url FROM creator_stream_keys WHERE creator_id = $1`,
      [req.userId]
    )
    if (rows.length === 0) {
      const key = crypto.randomBytes(24).toString('hex')
      const streamUrl = `rtmp://localhost:1935/live`
      const inserted = await pool.query(
        `INSERT INTO creator_stream_keys (creator_id, stream_key, stream_url)
         VALUES ($1, $2, $3) RETURNING stream_key, stream_url`,
        [req.userId, key, streamUrl]
      )
      return res.json({ success: true, streamKey: inserted.rows[0].stream_key, streamUrl: inserted.rows[0].stream_url })
    }
    res.json({ success: true, streamKey: rows[0].stream_key, streamUrl: rows[0].stream_url })
  } catch (err) {
    console.error('getStreamKey error:', err.message)
    res.status(500).json({ success: false, error: 'Failed to load stream key' })
  }
}

export async function regenerateStreamKey(req, res) {
  try {
    const key = crypto.randomBytes(24).toString('hex')
    const streamUrl = `rtmp://localhost:1935/live`
    const { rows } = await pool.query(
      `INSERT INTO creator_stream_keys (creator_id, stream_key, stream_url)
         VALUES ($1, $2, $3)
       ON CONFLICT (creator_id) DO UPDATE SET stream_key = EXCLUDED.stream_key
       RETURNING stream_key, stream_url`,
      [req.userId, key, streamUrl]
    )
    notifyCreator(req.userId, 'live', { action: 'key-regenerated' })
    res.json({ success: true, streamKey: rows[0].stream_key, streamUrl: rows[0].stream_url })
  } catch (err) {
    console.error('regenerateStreamKey error:', err.message)
    res.status(500).json({ success: false, error: 'Failed to regenerate stream key' })
  }
}

export async function getStreamStatus(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT id, title, status, started_at, ended_at, viewer_count FROM creator_streams
        WHERE creator_id = $1 ORDER BY (status = 'live') DESC, started_at DESC NULLS LAST LIMIT 1`,
      [req.userId]
    )
    const active = rows[0] && rows[0].status === 'live' ? rows[0] : null
    res.json({ success: true, live: !!active, stream: active })
  } catch (err) {
    console.error('getStreamStatus error:', err.message)
    res.status(500).json({ success: false, live: false, error: 'Failed to load stream status' })
  }
}

export async function startStream(req, res) {
  try {
    const { title, category, tags } = req.body || {}
    const { rows } = await pool.query(
      `INSERT INTO creator_streams (creator_id, title, status, started_at, metadata)
       VALUES ($1, $2, 'live', NOW(), $3)
       RETURNING id, title, status, started_at, viewer_count`,
      [req.userId, title || 'Untitled Stream', JSON.stringify({ category: category || 'general', tags: tags || [] })]
    )
    notifyCreator(req.userId, 'live', { action: 'started', stream: rows[0] })
    res.json({ success: true, stream: rows[0] })
  } catch (err) {
    console.error('startStream error:', err.message)
    res.status(500).json({ success: false, error: 'Failed to start stream' })
  }
}

export async function endStream(req, res) {
  try {
    await pool.query(
      `UPDATE creator_streams SET status = 'ended', ended_at = NOW()
        WHERE creator_id = $1 AND status = 'live'`,
      [req.userId]
    )
    notifyCreator(req.userId, 'live', { action: 'ended' })
    res.json({ success: true })
  } catch (err) {
    console.error('endStream error:', err.message)
    res.status(500).json({ success: false, error: 'Failed to end stream' })
  }
}

export async function getOnboarding(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT step, identity, links, monetization, payout, completed FROM creator_onboarding WHERE creator_id = $1`,
      [req.userId]
    )
    res.json({ success: true, onboarding: rows[0] || null })
  } catch (err) {
    console.error('getOnboarding error:', err.message)
    res.status(500).json({ success: false, error: 'Failed to load onboarding' })
  }
}

export async function saveOnboarding(req, res) {
  try {
    const { step, identity, links, monetization, payout, completed } = req.body || {}
    const { rows } = await pool.query(
      `INSERT INTO creator_onboarding (creator_id, step, identity, links, monetization, payout, completed, updated_at)
       VALUES ($1, COALESCE($2, 1), $3, $4, $5, $6, COALESCE($7, FALSE), NOW())
       ON CONFLICT (creator_id) DO UPDATE SET
         step = EXCLUDED.step,
         identity = COALESCE(EXCLUDED.identity, creator_onboarding.identity),
         links = COALESCE(EXCLUDED.links, creator_onboarding.links),
         monetization = COALESCE(EXCLUDED.monetization, creator_onboarding.monetization),
         payout = COALESCE(EXCLUDED.payout, creator_onboarding.payout),
         completed = EXCLUDED.completed,
         updated_at = NOW()
       RETURNING step, identity, links, monetization, payout, completed`,
      [req.userId, step != null ? step : null, identity ? JSON.stringify(identity) : null,
       links ? JSON.stringify(links) : null, monetization ? JSON.stringify(monetization) : null,
       payout ? JSON.stringify(payout) : null, completed != null ? !!completed : null]
    )
    notifyCreator(req.userId, 'content', { action: 'onboarding-updated', step: rows[0].step })
    res.json({ success: true, onboarding: rows[0] })
  } catch (err) {
    console.error('saveOnboarding error:', err.message)
    res.status(500).json({ success: false, error: 'Failed to save onboarding' })
  }
}

export async function deleteUpload(req, res) {
  try {
    const { id } = req.params
    const result = await pool.query('DELETE FROM uploads WHERE id = $1 AND user_id = $2 RETURNING id', [id, req.userId])
    if (result.rowCount === 0) return res.status(404).json({ success: false, error: 'Upload not found' })
    notifyCreator(req.userId, 'content', { action: 'deleted', id })
    res.json({ success: true })
  } catch (err) {
    console.error('deleteUpload error:', err.message)
    res.status(500).json({ success: false, error: 'Failed to delete upload' })
  }
}

export default { getPpmConfig, savePpmConfig, getStreamKey, regenerateStreamKey, getStreamStatus, startStream, endStream, getOnboarding, saveOnboarding, deleteUpload }
