import { v4 as uuidv4 } from 'uuid'
import pool from '../config/database.js'

const WEB_ORIGIN = process.env.WEB_ORIGIN || 'https://novaflix-web.vercel.app'

function referralUrl(code) {
  return `${WEB_ORIGIN}/register?ref=${code}`
}

function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

async function generateUniqueCode() {
  for (let i = 0; i < 10; i++) {
    const code = generateCode()
    const { rows } = await pool.query('SELECT 1 FROM affiliate_referrals WHERE code = $1', [code])
    if (rows.length === 0) return code
  }
  // fallback to uuid slice
  return uuidv4().slice(0, 8).toUpperCase()
}

export async function generateReferral(req, res) {
  try {
    const userId = req.userId

    // Return existing pending code if any (single active code per user)
    const { rows: existing } = await pool.query(
      'SELECT * FROM affiliate_referrals WHERE referrer_id = $1 AND status = $2',
      [userId, 'pending']
    )

    if (existing[0]) {
      return res.json({ success: true, code: existing[0].code, url: referralUrl(existing[0].code) })
    }

    const code = await generateUniqueCode()
    const id = uuidv4()
    try {
      await pool.query(
        `INSERT INTO affiliate_referrals (id, referrer_id, code, status) VALUES ($1, $2, $3, 'pending')`,
        [id, userId, code]
      )
    } catch (e) {
      if (e.code === '23505') {
        // unique violation on code, retry once
        const retryCode = await generateUniqueCode()
        const retryId = uuidv4()
        await pool.query(
          `INSERT INTO affiliate_referrals (id, referrer_id, code, status) VALUES ($1, $2, $3, 'pending')`,
          [retryId, userId, retryCode]
        )
        return res.json({ success: true, code: retryCode, url: referralUrl(retryCode) })
      }
      throw e
    }

    res.json({
      success: true,
      code,
      url: referralUrl(code),
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function getStats(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1)
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100)
    const offset = (page - 1) * limit

    const { rows } = await pool.query(
      `SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'converted') as converted,
        COALESCE(SUM(commission), 0) as total_commission
       FROM affiliate_referrals WHERE referrer_id = $1`,
      [req.userId]
    )

    const { rows: referrals } = await pool.query(
      `SELECT * FROM affiliate_referrals WHERE referrer_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [req.userId, limit, offset]
    )

    res.json({
      success: true,
      stats: rows[0] || { total: 0, converted: 0, total_commission: 0 },
      referrals,
      page,
      nextPage: referrals.length === limit ? page + 1 : undefined,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function redeemReferral(req, res) {
  try {
    const { code } = req.body
    if (!code) return res.status(400).json({ error: 'Code required' })

    const { rows } = await pool.query(
      'SELECT * FROM affiliate_referrals WHERE code = $1 AND status = $2',
      [code.toUpperCase(), 'pending']
    )

    if (!rows[0]) {
      return res.json({ success: false, error: 'Invalid or expired referral code' })
    }

    // Prevent self-referral
    if (rows[0].referrer_id === req.userId) {
      return res.json({ success: false, error: 'You cannot use your own referral code' })
    }

    // Prevent already-referred users from redeeming again
    const { rows: already } = await pool.query(
      'SELECT 1 FROM affiliate_referrals WHERE referred_id = $1 LIMIT 1',
      [req.userId]
    )
    if (already.length > 0) {
      return res.json({ success: false, error: 'You have already used a referral code' })
    }

    // Mark as converted
    await pool.query(
      `UPDATE affiliate_referrals SET status = 'converted', referred_id = $1, converted_at = NOW() WHERE id = $2`,
      [req.userId, rows[0].id]
    )

    // Notify referrer in realtime (best-effort)
    try {
      const { notifyUser } = await import('../services/realtime.js')
      notifyUser(rows[0].referrer_id, { type: 'referral_converted', referredId: req.userId, code: rows[0].code })
    } catch {}

    res.json({ success: true, message: 'Referral applied! You will earn the referrer 10% commission on your first paid plan.' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
