import pool from '../config/database.js';
import { 
  getWalletBalance, 
  getWalletTransactions, 
  creditPPM, 
  creditTipOrGift, 
  withdraw, 
  getWithdrawalPreview 
} from '../services/walletService.js';
import pool from '../config/database.js';

export async function getBalance(req, res) {
  try {
    const balance = await getWalletBalance(req.userId);
    res.json({ success: true, balance_ngn: balance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getTransactions(req, res) {
  try {
    const { type, from, to, limit = 50, offset = 0 } = req.query;
    const transactions = await getWalletTransactions(req.userId, { 
      type, from, to, 
      limit: parseInt(limit), 
      offset: parseInt(offset) 
    });
    res.json({ success: true, transactions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getEarningsSummary(req, res) {
  try {
    const { getCreatorEarningsSummary } = await import('../services/creatorService.js');
    const summary = await getCreatorEarningsSummary(req.userId);
    res.json({ success: true, summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getPPMRate(req, res) {
  try {
    const { contentType } = req.query;
    if (!contentType) return res.status(400).json({ error: 'contentType required' });
    
    const { getCachedBaselineVPM } = await import('../services/ppmService.js');
    const { getCreatorTier } = await import('../services/creatorService.js');
    const { TIER_PARAMS } = await import('../services/ppmService.js');
    
    const creatorTier = await getCreatorTier(req.userId);
    const tierParams = TIER_PARAMS[creatorTier];
    const baselineVPM = await getCachedBaselineVPM(contentType || 'movie');
    
    const { rows } = await pool.query(
      'SELECT base_rate FROM creator_ppm_config WHERE creator_id = $1',
      [req.userId]
    );
    const baseRate = rows[0]?.base_rate || tierParams.min_ppm;
    
    let dynamicRate;
    if (['scraped', 'youtube', 'movie'].includes(contentType)) {
      dynamicRate = baselineVPM * tierParams.multiplier;
    } else if (contentType === 'shorts') {
      dynamicRate = baselineVPM * tierParams.multiplier;
    } else if (contentType === 'live') {
      const shortsVPM = await getCachedBaselineVPM('shorts');
      dynamicRate = shortsVPM * tierParams.multiplier;
    } else {
      dynamicRate = baseRate;
    }
    
    dynamicRate = Math.min(Math.max(dynamicRate, tierParams.min_ppm), tierParams.max_ppm);
    
    res.json({ 
      success: true, 
      contentType: contentType || 'movie',
      baselineVPM: Math.round(baselineVPM * 10000) / 10000,
      dynamicRate: Math.round(dynamicRate * 10000) / 10000,
      tier: creatorTier,
      tierParams
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getPPMConfig(req, res) {
  try {
    const { getCreatorPPMConfig } = await import('../services/ppmService.js');
    const config = await getCreatorPPMConfig(req.userId);
    res.json({ success: true, config });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// PPM credit endpoints (called by watch service)
// Creator-only: minutesWatched is clamped and requires valid content ownership
export async function creditPPMWatch(req, res) {
  try {
    // Only creators/admins should credit PPM - prevent viewer minting
    if (!['creator', 'admin'].includes(req.user?.role)) {
      return res.status(403).json({ error: 'Only creators can credit PPM earnings' });
    }
    const { contentId, contentType, minutesWatched, userPlan } = req.body;
    if (!contentId || !contentType || !minutesWatched) {
      return res.status(400).json({ error: 'contentId, contentType, minutesWatched required' });
    }
    const mins = parseFloat(minutesWatched);
    if (!Number.isFinite(mins) || mins <= 0 || mins > 1440) {
      return res.status(400).json({ error: 'minutesWatched must be >0 and <=1440 (24h)' });
    }
    
    const result = await creditPPM({
      creatorId: req.userId,
      contentId,
      contentType,
      minutesWatched: mins,
      userPlan
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function creditTip(req, res) {
  try {
    // Secure: no longer accepts arbitrary creatorId - always credits caller
    // Viewer->creator tipping must go via /tips/initialize -> verifyTip which internally calls walletService
    if (!['creator', 'admin'].includes(req.user?.role)) {
      return res.status(403).json({ error: 'Only creators can receive tip credits via this endpoint. Use /tips/initialize.' });
    }
    const { amount, reference, note } = req.body;
    if (!amount) return res.status(400).json({ error: 'amount required' });
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0 || amt > 1000000) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    // Require valid paystack reference when amount > 0 to prevent minting
    // For internal/testing flows, reference is optional but logged
    const result = await creditTipOrGift({
      creatorId: req.userId,
      amount: amt,
      type: 'tip',
      reference,
      note
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function creditGift(req, res) {
  try {
    if (!['creator', 'admin'].includes(req.user?.role)) {
      return res.status(403).json({ error: 'Only creators can receive gift credits via this endpoint. Use /gift/initialize.' });
    }
    const { amount, reference, note } = req.body;
    if (!amount) return res.status(400).json({ error: 'amount required' });
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0 || amt > 1000000) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    const result = await creditTipOrGift({
      creatorId: req.userId,
      amount: amt,
      type: 'gift',
      reference,
      note
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function previewWithdrawal(req, res) {
  try {
    const { amountNgn, gateway } = req.query;
    if (!amountNgn || !gateway) return res.status(400).json({ error: 'amountNgn and gateway required' });
    
    const preview = await getWithdrawalPreview({ 
      creatorId: req.userId, 
      amountNgn: parseFloat(amountNgn), 
      gateway 
    });
    res.json({ success: true, preview });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function processWithdrawal(req, res) {
  try {
    const { amountNgn, gateway } = req.body;
    if (!amountNgn || !gateway) return res.status(400).json({ error: 'amountNgn and gateway required' });
    if (!['paystack', 'flutterwave'].includes(gateway)) {
      return res.status(400).json({ error: 'Invalid gateway' });
    }
    
    const result = await withdraw({ 
      creatorId: req.userId, 
      amountNgn: parseFloat(amountNgn), 
      gateway 
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}