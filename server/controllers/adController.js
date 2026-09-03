import { v4 as uuidv4 } from 'uuid'
import pool from '../config/database.js'
import { getPlanRank } from './planUtils.js'

const DEV_MOCK = process.env.DEV_MOCK_PAYMENTS === 'true'

export async function getNextAd(req, res) {
  try {
    const { contentId } = req.query
    const userPlan = req.user?.plan || 'free'
    const planRank = getPlanRank(userPlan)

    // Standard and above get no ads (Basic is also ad-free per tier spec)
    if (planRank >= 2) {
      return res.json({ success: true, ads: [] })
    }

    // Check for active binge pass
    if (req.userId) {
      const { rows: passes } = await pool.query(
        `SELECT * FROM binge_passes
         WHERE user_id = $1 AND expires_at > NOW()
         AND minutes_used < minutes_granted
         ORDER BY created_at DESC LIMIT 1`,
        [req.userId]
      )
      if (passes[0]) {
        return res.json({ success: true, ads: [], bingePass: passes[0] })
      }
    }

    // Exhaustion rule: if creator has a boost for this contentId but exhausted, show no ads (no fallback)
    if (contentId) {
      const { rows: hasCreator } = await pool.query(`SELECT 1 FROM ad_placements ap JOIN ad_campaigns ac ON ac.id=ap.campaign_id WHERE ap.content_id=$1 AND ac.channel='creator' LIMIT 1`, [contentId])
      if (hasCreator.length) {
        const { rows: eligibleCreator } = await pool.query(
          `SELECT 1 FROM ad_placements ap JOIN ad_campaigns ac ON ac.id=ap.campaign_id
           WHERE ap.content_id=$1 AND ac.channel='creator' AND ac.active=true AND ac.status='approved' AND ac.paid=true
           AND (ac.max_impressions=0 OR ac.current_impressions < ac.max_impressions)
           AND (ac.start_date IS NULL OR ac.start_date <= NOW()) AND (ac.end_date IS NULL OR ac.end_date >= NOW()) LIMIT 1`, [contentId])
        if (!eligibleCreator.length) return res.json({ success: true, ads: [] })
      }
    }

    // Query active ad placements with 3-channel priority: creator -> internal -> google
    const { rows: placements } = await pool.query(
      `SELECT ap.*, ac.creative_url, ac.creative_type, ac.advertiser_name, ac.channel, ac.status
       FROM ad_placements ap
       JOIN ad_campaigns ac ON ac.id = ap.campaign_id
       WHERE ac.active = true AND ac.status='approved' AND ac.paid=true
       AND (ac.start_date IS NULL OR ac.start_date <= NOW())
       AND (ac.end_date IS NULL OR ac.end_date >= NOW())
       AND (ac.max_impressions = 0 OR ac.current_impressions < ac.max_impressions)
       ORDER BY CASE ac.channel WHEN 'creator' THEN 1 WHEN 'internal' THEN 2 ELSE 3 END, ap.position_type, ap.cue_time_seconds`
    )

    // In dev mock mode, provide sample ads if none exist
    if (DEV_MOCK && placements.length === 0) {
      const mockAds = [
        {
          id: 'mock-1',
          creative_url: 'https://via.placeholder.com/1280x720/ff0000/ffffff?text=Ad+1',
          creative_type: 'image',
          advertiser_name: 'Mock Brand',
          position_type: 'pause',
          duration_seconds: 15,
        },
        {
          id: 'mock-2',
          creative_url: 'https://via.placeholder.com/1280x720/00ff00/ffffff?text=Ad+2',
          creative_type: 'image',
          advertiser_name: 'Mock Studio',
          position_type: 'mid_roll',
          cue_time_seconds: 180,
          duration_seconds: 30,
        },
        {
          id: 'mock-3',
          creative_url: 'https://via.placeholder.com/1280x720/0000ff/ffffff?text=Ad+3',
          creative_type: 'image',
          advertiser_name: 'Mock Cinema',
          position_type: 'mid_roll',
          cue_time_seconds: 600,
          duration_seconds: 20,
        },
      ]

      // Seed mock placements into DB
      for (const ad of mockAds) {
        const campId = uuidv4()
        await pool.query(
          `INSERT INTO ad_campaigns (id, advertiser_name, creative_url, creative_type, active)
           VALUES ($1, $2, $3, $4, true)`,
          [campId, ad.advertiser_name, ad.creative_url, ad.creative_type]
        )
        await pool.query(
          `INSERT INTO ad_placements (campaign_id, position_type, cue_time_seconds, duration_seconds, content_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [campId, ad.position_type, ad.cue_time_seconds || 0, ad.duration_seconds, contentId || null]
        )
      }

      return res.json({ success: true, ads: mockAds })
    }

    const ads = placements.map((p) => ({
      id: p.id,
      creative_url: p.creative_url,
      creative_type: p.creative_type,
      advertiser_name: p.advertiser_name,
      position_type: p.position_type,
      cue_time_seconds: p.cue_time_seconds || 0,
      duration_seconds: p.duration_seconds,
      skip_after_seconds: p.skip_after_seconds,
      warning_seconds: p.warning_seconds,
      is_unskippable: p.is_unskippable,
      channel: p.channel,
    }))

    res.json({ success: true, ads })
  } catch (err) {
    console.error('[ads] getNextAd error:', err.message)
    res.status(500).json({ error: err.message })
  }
}

export async function recordImpression(req, res) {
  try {
    const { placementId, completed, watchedSeconds } = req.body
    if (!placementId) return res.status(400).json({ error: 'placementId required' })

    const id = uuidv4()
    await pool.query(
      `INSERT INTO ad_impressions (id, placement_id, user_id, completed, watched_seconds)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, placementId, req.userId || null, completed || false, watchedSeconds || 0]
    )

    // Increment campaign impression count
    await pool.query(
      `UPDATE ad_campaigns SET current_impressions = current_impressions + 1
       WHERE id = (SELECT campaign_id FROM ad_placements WHERE id = $1)`,
      [placementId]
    )

    res.json({ success: true, id })
  } catch (err) {
    console.error('[ads] recordImpression error:', err.message)
    res.status(500).json({ error: err.message })
  }
}

export async function grantBingePass(req, res) {
  try {
    const { contentId, minutes } = req.body
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized' })

    const id = uuidv4()
    await pool.query(
      `INSERT INTO binge_passes (id, user_id, content_id, minutes_granted, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, req.userId, contentId || null, minutes || 60, new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()]
    )

    res.json({ success: true, bingePass: { id, minutes_granted: minutes || 60 } })
  } catch (err) {
    console.error('[ads] grantBingePass error:', err.message)
    res.status(500).json({ error: err.message })
  }
}

export async function getSkipLimit(req, res) {
  try {
    if (!req.userId) return res.json({ success: true, skips_used: 0, skips_max: 0 })

    const { rows } = await pool.query(
      `SELECT * FROM skip_limits
       WHERE user_id = $1 AND window_start > NOW() - INTERVAL '1 hour'
       ORDER BY window_start DESC LIMIT 1`,
      [req.userId]
    )

    if (rows[0]) {
      return res.json({
        success: true,
        skips_used: rows[0].skips_used,
        skips_max: rows[0].skips_max,
        window_start: rows[0].window_start,
      })
    }

    const planRank = getPlanRank(req.user?.plan || 'free')
    const maxSkips = planRank >= 3 ? 999 : planRank >= 1 ? 6 : 6

    res.json({ success: true, skips_used: 0, skips_max: maxSkips })
  } catch (err) {
    console.error('[ads] getSkipLimit error:', err.message)
    res.status(500).json({ error: err.message })
  }
}

export async function incrementSkip(req, res) {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized' })

    const { rows: existing } = await pool.query(
      `SELECT * FROM skip_limits
       WHERE user_id = $1 AND window_start > NOW() - INTERVAL '1 hour'
       ORDER BY window_start DESC LIMIT 1`,
      [req.userId]
    )

    if (existing[0]) {
      await pool.query(
        'UPDATE skip_limits SET skips_used = skips_used + 1 WHERE id = $1',
        [existing[0].id]
      )
    } else {
      const planRank = getPlanRank(req.user?.plan || 'free')
      const maxSkips = planRank >= 3 ? 999 : 6
      await pool.query(
        `INSERT INTO skip_limits (id, user_id, skips_used, skips_max, window_start)
         VALUES ($1, $2, 1, $3, NOW())`,
        [uuidv4(), req.userId, maxSkips]
      )
    }

    res.json({ success: true })
  } catch (err) {
    console.error('[ads] incrementSkip error:', err.message)
    res.status(500).json({ error: err.message })
  }
}

export async function getPricing(req, res) {
  try {
    const { rows } = await pool.query(`SELECT * FROM ad_pricing ORDER BY position_type`)
    res.json({ success: true, pricing: rows })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function updatePricing(req, res) {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
    const { position_type, price_per_mille } = req.body
    if (!position_type || price_per_mille === undefined) return res.status(400).json({ error: 'position_type and price_per_mille required' })
    await pool.query(`INSERT INTO ad_pricing (position_type, price_per_mille) VALUES ($1,$2) ON CONFLICT (position_type) DO UPDATE SET price_per_mille=$2, updated_at=NOW()`, [position_type, Number(price_per_mille)])
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function listPlacements(req, res) {
  try {
    const { contentId } = req.query
    let q = `SELECT ap.*, ac.advertiser_name, ac.channel, ac.status FROM ad_placements ap JOIN ad_campaigns ac ON ac.id=ap.campaign_id WHERE 1=1`
    const params = []
    if (contentId) { params.push(contentId); q += ` AND ap.content_id=$${params.length}` }
    q += ` ORDER BY ap.cue_time_seconds`
    const { rows } = await pool.query(q, params)
    res.json({ success: true, placements: rows })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function createPlacement(req, res) {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
    const { campaign_id, content_id, position_type, cue_time_seconds, duration_seconds, warning_seconds, is_unskippable } = req.body
    if (!campaign_id || !position_type) return res.status(400).json({ error: 'campaign_id and position_type required' })
    const id = uuidv4()
    await pool.query(`INSERT INTO ad_placements (id, campaign_id, content_id, position_type, cue_time_seconds, duration_seconds, warning_seconds, is_unskippable) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [id, campaign_id, content_id||null, position_type, Number(cue_time_seconds)||0, Number(duration_seconds)||15, Number(warning_seconds)||10, is_unskippable!==false])
    res.json({ success: true, id })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function deletePlacement(req, res) {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
    await pool.query(`DELETE FROM ad_placements WHERE id=$1`, [req.params.id])
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
}

export async function walletDeduct(req, res) {
  try {
    const { campaignId, amount } = req.body
    const need = Number(amount)
    if (!need || need < 1) return res.status(400).json({ error: 'Invalid amount' })
    const { rows: u } = await pool.query(`SELECT wallet_balance_ngn FROM users WHERE id=$1`, [req.userId])
    const bal = Number(u[0]?.wallet_balance_ngn || 0)
    if (bal < need) return res.status(402).json({ error: 'Insufficient wallet balance' })
    await pool.query(`UPDATE users SET wallet_balance_ngn = wallet_balance_ngn - $1 WHERE id=$2`, [need, req.userId])
    await pool.query(`INSERT INTO creator_wallet_transactions (id, creator_id, amount, type, description) VALUES ($1,$2,$3,'ad_spend',$4)`, [uuidv4(), req.userId, -need, `Ad boost ${campaignId}`])
    if (campaignId) {
      await pool.query(`UPDATE ad_campaigns SET paid=true, paid_at=NOW() WHERE id=$1 AND creator_id=$2`, [campaignId, req.userId])
    }
    res.json({ success: true, balance: bal - need })
  } catch (err) { res.status(500).json({ error: err.message }) }
}
