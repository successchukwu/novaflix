import { v4 as uuidv4 } from 'uuid'
import pool from '../config/database.js'

export async function create(req, res) {
  try {
    const {
      advertiser_name,
      creative_url,
      creative_type,
      promotion_type = 'grid',
      target_genre,
      target_plan,
      target_media_id,
      max_impressions = 0,
      budget = 0,
      start_date,
      end_date,
      channel,
      position_type,
      cue_time_seconds,
      duration_seconds,
      gam_tag_url,
      payMethod,
      walletPart,
      cardPart,
    } = req.body

    if (!advertiser_name || !creative_url) {
      return res.status(400).json({ error: 'advertiser_name and creative_url are required' })
    }

    const isCreatorBoost = channel === 'creator' || promotion_type === 'creator_boost'
    let effectiveChannel = channel || (isCreatorBoost ? 'creator' : 'internal')
    let effectivePromotion = promotion_type || (isCreatorBoost ? 'creator_boost' : 'grid')
    let effectiveStatus = 'pending'
    let effectiveApproved = false
    let paid = false
    let paidAt = null

    // For creator boosts, validate target belongs to creator and handle pay
    if (isCreatorBoost) {
      if (target_media_id) {
        const { rows: own } = await pool.query(`SELECT id FROM uploads WHERE id=$1 AND user_id=$2`, [target_media_id, req.userId])
        if (!own.length) return res.status(403).json({ error: 'You can only promote your own content' })
      }
      const numBudget = Number(budget) || 0
      if (numBudget < 100) return res.status(400).json({ error: 'Budget must be at least ₦100' })
      // Check max campaigns per creator
      const { rows: cnt } = await pool.query(`SELECT count(*)::int as c FROM ad_campaigns WHERE creator_id=$1 AND channel='creator' AND status IN ('pending','approved')`, [req.userId])
      if (cnt[0].c >= 5) return res.status(429).json({ error: 'Maximum 5 active promotions reached' })

      // Pay handling: wallet / card / split
      if (payMethod === 'wallet' || payMethod === 'split') {
        const needWallet = payMethod === 'wallet' ? numBudget : Number(walletPart) || 0
        if (needWallet > 0) {
          const { rows: w } = await pool.query(`SELECT wallet_balance_ngn FROM users WHERE id=$1`, [req.userId])
          const bal = Number(w[0]?.wallet_balance_ngn || 0)
          if (bal < needWallet) return res.status(402).json({ error: 'Insufficient wallet balance' })
          await pool.query(`UPDATE users SET wallet_balance_ngn = wallet_balance_ngn - $1 WHERE id=$2`, [needWallet, req.userId])
          await pool.query(`INSERT INTO creator_wallet_transactions (id, creator_id, amount, type, description) VALUES ($1,$2,$3,'ad_spend',$4)`, [uuidv4(), req.userId, -needWallet, `Ad boost ${advertiser_name}`])
          if (payMethod === 'wallet') { paid = true; paidAt = new Date().toISOString() }
          else {
            // split: wallet part paid, need card part
            const needCard = Number(cardPart) || (numBudget - needWallet)
            if (needCard <= 0) { paid = true; paidAt = new Date().toISOString() }
            // card part will be handled via payment initialize -> return paymentUrl
          }
        }
      }
      if (payMethod === 'card') {
        // will require external payment; mark unpaid and return paymentUrl
        paid = false
      }
      // if split and card part >0, not fully paid yet
    } else if (effectiveChannel === 'internal' && req.user?.role === 'admin') {
      // internal ads auto-paid and auto-approved
      paid = true; paidAt = new Date().toISOString(); effectiveStatus = 'approved'; effectiveApproved = true
    } else if (effectiveChannel === 'google') {
      paid = true; paidAt = new Date().toISOString()
    }

    const id = uuidv4()
    await pool.query(
      `INSERT INTO ad_campaigns (id, creator_id, advertiser_name, creative_url, creative_type,
        promotion_type, target_genre, target_plan, target_media_id, max_impressions, budget,
        start_date, end_date, approved, active, channel, status, paid, paid_at, gam_tag_url, is_house)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
      [
        id, req.userId, advertiser_name, creative_url, creative_type || 'image',
        effectivePromotion, target_genre || null, target_plan || null, target_media_id || null,
        max_impressions, budget,
        start_date || new Date().toISOString(), end_date || null,
        effectiveApproved, true, effectiveChannel, effectiveStatus, paid, paidAt, gam_tag_url || null, effectiveChannel==='internal',
      ]
    )

    // Auto-create placement
    if (isCreatorBoost) {
      const pos = position_type || 'mid_roll'
      await pool.query(
        `INSERT INTO ad_placements (id, campaign_id, content_id, position_type, cue_time_seconds, duration_seconds, is_unskippable)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [uuidv4(), id, target_media_id || null, pos, Number(cue_time_seconds)||0, Number(duration_seconds)||15, true]
      )
    } else if (promotion_type === 'hooks' || promotion_type === 'banner') {
      await pool.query(
        `INSERT INTO ad_placements (id, campaign_id, content_id, position_type, duration_seconds)
         VALUES ($1,$2,$3,$4,$5)`,
        [uuidv4(), id, target_media_id || null, promotion_type === 'hooks' ? 'promoted' : 'banner', 15]
      )
    }

    // If creator boost with card/split requiring payment, initialize Paystack
    if (isCreatorBoost && (payMethod === 'card' || (payMethod === 'split' && Number(cardPart) > 0))) {
      const needCard = payMethod==='card' ? Number(budget) : Number(cardPart)
      try {
        const { initializePayment } = await import('../services/paymentService.js')
        const pay = await initializePayment({ userId: req.userId, amount: needCard*100, email: req.user?.email, metadata: { campaignId: id, type: 'creator_boost' } })
        if (pay?.authorization_url) {
          return res.json({ success: true, campaign: { id }, requiresPayment: true, paymentUrl: pay.authorization_url })
        }
      } catch {}
      return res.json({ success: true, campaign: { id }, requiresPayment: true, paymentUrl: `/creator/wallet?pay=${id}` })
    }

    res.json({ success: true, campaign: { id } })
  } catch (err) {
    console.error('[campaign] create error:', err.message)
    res.status(500).json({ error: err.message })
  }
}

export async function list(req, res) {
  try {
    const role = req.user?.role
    const isAdmin = role === 'admin'
    const { channel, status } = req.query

    let query = `SELECT * FROM ad_campaigns`
    const params = []
    const conds = []

    if (!isAdmin) {
      conds.push(`creator_id = $${params.length+1}`); params.push(req.userId)
    }
    if (channel) { conds.push(`channel = $${params.length+1}`); params.push(channel) }
    if (status) { conds.push(`status = $${params.length+1}`); params.push(status) }

    if (conds.length) query += ` WHERE ` + conds.join(' AND ')
    query += ` ORDER BY created_at DESC`

    const { rows } = await pool.query(query, params)
    res.json({ success: true, campaigns: rows })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function update(req, res) {
  try {
    const { id } = req.params
    const { active, approved, max_impressions, budget, end_date, status, rejection_reason } = req.body

    // Only admins can approve/reject/suspend
    if ((approved !== undefined || status !== undefined) && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can approve campaigns' })
    }

    // Validate status transitions
    if (status) {
      if (!['pending','approved','rejected','suspended'].includes(status)) return res.status(400).json({ error: 'Invalid status' })
      const { rows: cur } = await pool.query(`SELECT status, paid, channel FROM ad_campaigns WHERE id=$1`, [id])
      if (!cur.length) return res.status(404).json({ error: 'Campaign not found' })
      const curStatus = cur[0].status || (cur[0].approved ? 'approved' : 'pending')
      if (status === 'rejected' && curStatus !== 'pending') return res.status(400).json({ error: 'Only pending campaigns can be rejected' })
      if (status === 'suspended' && curStatus !== 'approved') return res.status(400).json({ error: 'Only approved campaigns can be suspended' })
      if (status === 'approved' && !cur[0].paid && cur[0].channel === 'creator') return res.status(402).json({ error: 'Cannot approve unpaid promotion' })
    }

    const fields = []
    const values = []
    let idx = 1

    if (active !== undefined) { fields.push(`active = $${idx++}`); values.push(active) }
    if (approved !== undefined) { fields.push(`approved = $${idx++}`); values.push(approved) }
    if (status !== undefined) {
      fields.push(`status = $${idx++}`); values.push(status)
      // keep approved in sync
      fields.push(`approved = $${idx++}`); values.push(status === 'approved')
    }
    if (rejection_reason !== undefined) { fields.push(`rejection_reason = $${idx++}`); values.push(rejection_reason) }
    if (max_impressions !== undefined) { fields.push(`max_impressions = $${idx++}`); values.push(max_impressions) }
    if (budget !== undefined) { fields.push(`budget = $${idx++}`); values.push(budget) }
    if (end_date !== undefined) { fields.push(`end_date = $${idx++}`); values.push(end_date) }

    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' })

    values.push(id)
    const { rows } = await pool.query(
      `UPDATE ad_campaigns SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    )

    // broadcast for realtime
    try {
      const { broadcastFeed } = await import('../services/realtime.js')
      const ev = status === 'rejected' ? 'admin:creator.application.denied' : status === 'suspended' ? 'admin:creator.application.suspended' : status === 'approved' ? 'admin:creator.application.approved' : 'admin:catalog.updated'
      broadcastFeed({ type: ev, campaignId: id, status })
    } catch {}

    res.json({ success: true, campaign: rows[0] || null })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function getActivePromoted(req, res) {
  try {
    const { type, genre, limit: limitParam } = req.query
    const resultLimit = Math.min(parseInt(limitParam) || 5, 20)

    let query = `
      SELECT ac.*, ap.position_type, ap.cue_time_seconds, ap.duration_seconds
      FROM ad_campaigns ac
      JOIN ad_placements ap ON ap.campaign_id = ac.id
      WHERE ac.active = true
      AND ac.approved = true
      AND ac.promotion_type = $1
      AND (ac.start_date IS NULL OR ac.start_date <= NOW())
      AND (ac.end_date IS NULL OR ac.end_date >= NOW())
      AND (ac.max_impressions = 0 OR ac.current_impressions < ac.max_impressions)
    `
    const params = [type || 'grid']

    if (genre) {
      query += ` AND (ac.target_genre IS NULL OR ac.target_genre = $2)`
      params.push(genre)
    }

    query += ` ORDER BY ac.created_at DESC LIMIT $${params.length + 1}`
    params.push(resultLimit)

    const { rows } = await pool.query(query, params)
    res.json({ success: true, campaigns: rows })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
