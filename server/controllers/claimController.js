import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database.js';
import { searchPerson, getPersonCredits } from '../services/tmdbService.js';
import { getProvider } from '../services/socialOAuthService.js';

export async function startClaim(req, res) {
  try {
    const { tmdbPersonId, displayName, provider } = req.body;
    if (!tmdbPersonId) return res.status(400).json({ error: 'TMDB person ID required' });

    // Check if already claimed
    const existing = await pool.query(
      'SELECT cp.user_id FROM creator_profiles cp WHERE cp.tmdb_person_id = $1',
      [tmdbPersonId]
    );
    if (existing.rows[0]?.user_id) {
      return res.status(409).json({ error: 'This profile is already claimed' });
    }

    // Check for existing pending claim
    const pending = await pool.query(
      'SELECT id FROM creator_claim_requests WHERE tmdb_person_id = $1 AND claim_status = $2',
      [tmdbPersonId, 'pending']
    );
    if (pending.rows[0]) {
      return res.status(409).json({ error: 'Claim already in progress', claimId: pending.rows[0].id });
    }

    // Get TMDB data for preview
    const [person, credits] = await Promise.all([
      searchPerson(tmdbPersonId),
      getPersonCredits(tmdbPersonId)
    ]);

    const claimId = uuidv4();

    await pool.query(
      `INSERT INTO creator_claim_requests 
       (id, tmdb_person_id, display_name, verification_provider, claim_status, kyc_status)
       VALUES ($1, $2, $3, $4, 'pending', 'pending')`,
      [claimId, tmdbPersonId, displayName, provider || null]
    );

    // Get estimated earnings from scraped content
    const estimatedEarnings = await getEstimatedEarnings(tmdbPersonId);

    res.json({
      success: true,
      claimId,
      preview: {
        name: person.name,
        profilePath: person.profile_path,
        knownFor: person.known_for_department,
        filmCount: credits.cast?.length + credits.crew?.length || 0,
        estimatedMonthlyEarnings: estimatedEarnings
      }
    });
  } catch (err) {
    console.error('[claim] startClaim error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

export async function getClaimStatus(req, res) {
  try {
    const { claimId } = req.params;
    const { rows } = await pool.query(
      `SELECT id, tmdb_person_id, display_name, verification_provider,
              social_handle, social_profile_url, claim_status, kyc_status,
              created_at, reviewed_at
       FROM creator_claim_requests WHERE id = $1`,
      [claimId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Claim not found' });
    res.json({ success: true, claim: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getClaimPreview(req, res) {
  try {
    const { tmdbPersonId } = req.params;
    const [person, credits] = await Promise.all([
      searchPerson(tmdbPersonId),
      getPersonCredits(tmdbPersonId)
    ]);
    const estimatedEarnings = await getEstimatedEarnings(tmdbPersonId);
    res.json({ success: true, preview: { person, credits, estimatedEarnings } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Verify a claim using the authenticated user's social identity
export async function verifyClaimSocial(req, res) {
  try {
    const { claimId, provider } = req.body;
    if (!claimId || !provider) return res.status(400).json({ error: 'claimId and provider required' });

    const p = getProvider(provider);
    if (!p) return res.status(400).json({ error: 'Unsupported provider' });

    const socialIdCol = socialIdColumnName(provider);
    const socialId = req.user?.[socialIdCol];
    if (!socialId) {
      return res.status(409).json({ error: `You have not connected ${p.name}. Please sign in with ${p.name} first.` });
    }

    await handleClaimApproved(claimId, {
      userId: req.user.id,
      provider: provider,
      socialId: socialId,
      socialProfileUrl: social_url_for(provider, socialId),
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[claim] verifyClaimSocial error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

function socialIdColumnName(provider) {
  const map = {
    google: 'google_id', facebook: 'facebook_id', instagram: 'instagram_id',
    tiktok: 'tiktok_id', twitter: 'twitter_id', youtube: 'youtube_id',
    twitch: 'twitch_id', discord: 'discord_id',
  };
  return map[provider] || null;
}

function social_url_for(provider, id) {
  const bases = {
    facebook: `https://facebook.com/${id}`,
    instagram: `https://instagram.com/${id}`,
    tiktok: `https://tiktok.com/@${id}`,
    twitter: `https://x.com/${id}`,
    youtube: `https://youtube.com/channel/${id}`,
    twitch: `https://twitch.tv/${id}`,
    discord: '',
    google: '',
  };
  return bases[provider] || '';
}

async function handleClaimApproved(claimId, verification) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: claimRows } = await client.query(
      'SELECT * FROM creator_claim_requests WHERE id = $1 FOR UPDATE',
      [claimId]
    );

    if (!claimRows[0]) throw new Error('Claim not found');
    const claim = claimRows[0];

    if (claim.claim_status === 'approved') {
      await client.query('COMMIT');
      return;
    }

    let userId = verification?.userId || claim.user_id;

    // If no linked user yet, create one
    if (!userId) {
      userId = uuidv4();
      await client.query(
        `INSERT INTO users (id, name, role, plan, email_verified, creator_approved)
         VALUES ($1, $2, 'creator', 'free', true, true)`,
        [userId, claim.display_name || 'Creator']
      );
    }

    // Update claim as approved with verification details
    await client.query(
      `UPDATE creator_claim_requests 
       SET kyc_status = 'approved', claim_status = 'approved',
           verification_provider = COALESCE($2, verification_provider),
           social_handle = COALESCE($3, social_handle),
           social_profile_url = COALESCE($4, social_profile_url),
           user_id = $5, reviewed_at = NOW()
       WHERE id = $1`,
      [claimId, verification?.provider || null, verification?.socialId || null, verification?.socialProfileUrl || null, userId]
    );

    // Link creator profile to user
    await client.query(
      `UPDATE creator_profiles SET user_id = $1 WHERE tmdb_person_id = $2`,
      [userId, claim.tmdb_person_id]
    );

    // Link user to claimed profile
    await client.query(
      `UPDATE users SET claimed_creator_profile_id = (SELECT id FROM creator_profiles WHERE tmdb_person_id = $1) WHERE id = $2`,
      [claim.tmdb_person_id, userId]
    );

    // Initialize creator PPM config
    await client.query(
      `INSERT INTO creator_ppm_config (creator_id, base_rate) VALUES ($1, 10.00)
       ON CONFLICT (creator_id) DO NOTHING`,
      [userId]
    );

    // Set creator profile approval status to approved
    await client.query(
      `UPDATE creator_profiles SET approval_status = 'approved', approved_at = NOW()
       WHERE tmdb_person_id = $1`,
      [claim.tmdb_person_id]
    );

    // Sync creator_approved flag on user
    await client.query(
      `UPDATE users SET creator_approved = TRUE WHERE id = $1`,
      [userId]
    );

    await client.query('COMMIT');
    console.log(`[claim] Approved claim ${claimId} for user ${userId}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[claim] handleClaimApproved error:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

async function getEstimatedEarnings(tmdbPersonId) {
  try {
    // Get films linked to this TMDB person
    const { rows } = await pool.query(
      `SELECT COUNT(*) as film_count FROM scraped_content_links WHERE creator_tmdb_person_id = $1`,
      [tmdbPersonId]
    );
    const filmCount = parseInt(rows[0]?.film_count) || 0;

    // Rough estimate: avg 5000 min/month per film × ₦2 baseline × 1.25 multiplier (standard tier)
    const estimatedMonthly = filmCount * 5000 * 2.0 * 1.25;
    return Math.round(estimatedMonthly);
  } catch {
    return 0;
  }
}

// Admin endpoints
export async function adminListClaims(req, res) {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let where = '';
    const params = [limit, offset];
    if (status) {
      where = 'WHERE claim_status = $3';
      params.push(status);
    }

    const { rows } = await pool.query(
      `SELECT ccr.*, u.email as claimant_email 
       FROM creator_claim_requests ccr
       LEFT JOIN users u ON u.id = ccr.user_id
       ${where}
       ORDER BY ccr.created_at DESC
       LIMIT $1 OFFSET $2`,
      params
    );

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) FROM creator_claim_requests ${where.replace('WHERE', '')}`,
      status ? [status] : []
    );

    res.json({ success: true, claims: rows, total: parseInt(countRows[0].count) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function adminApproveClaim(req, res) {
  try {
    const { claimId } = req.params;
    await handleClaimApproved(claimId, {});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function adminDenyClaim(req, res) {
  try {
    const { claimId } = req.params;
    const { reason } = req.body;

    await pool.query(
      `UPDATE creator_claim_requests 
       SET claim_status = 'denied', kyc_status = 'denied', reviewed_by = $1, reviewed_at = NOW()
       WHERE id = $2`,
      [req.userId, claimId]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
