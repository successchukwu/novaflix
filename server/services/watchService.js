import pool from '../config/database.js';
import { creditPPM } from './walletService.js';
import { refreshBaselineVPM } from './ppmService.js';

const HEARTBEAT_INTERVAL = 30000;
const pendingHeartbeats = new Map();

export async function handleWatchHeartbeat({ userId, contentId, contentType, userPlan, timestamp = Date.now() }) {
  const key = `${userId}:${contentId}:${contentType}`;
  const now = timestamp;
  
  let session = pendingHeartbeats.get(key);
  if (!session) {
    session = {
      userId,
      contentId,
      contentType,
      userPlan,
      startTime: now,
      lastHeartbeat: now,
      minutesAccumulated: 0
    };
    pendingHeartbeats.set(key, session);
    return { credited: false, reason: 'session_started' };
  }

  const elapsedMs = now - session.lastHeartbeat;
  if (elapsedMs < HEARTBEAT_INTERVAL * 0.5) {
    return { credited: false, reason: 'too_frequent' };
  }

  const elapsedMinutes = elapsedMs / 60000;
  session.minutesAccumulated += elapsedMinutes;
  session.lastHeartbeat = now;

  const minutesToCredit = Math.floor(session.minutesAccumulated);
  if (minutesToCredit >= 1) {
    session.minutesAccumulated -= minutesToCredit;
    
    try {
      const result = await creditPPM({
        creatorId: await getContentCreator(contentId, contentType),
        contentId,
        contentType,
        minutesWatched: minutesToCredit,
        userPlan: session.userPlan
      });
      return { credited: true, minutesCredited: minutesToCredit, ...result };
    } catch (err) {
      console.error('[watch] PPM credit error:', err.message);
      return { credited: false, error: err.message };
    }
  }

  return { credited: false, minutesAccumulated: session.minutesAccumulated };
}

export function endWatchSession(userId, contentId, contentType) {
  const key = `${userId}:${contentId}:${contentType}`;
  const session = pendingHeartbeats.get(key);
  if (!session) return Promise.resolve({ credited: false, reason: 'no_session' });

  const minutesToCredit = Math.floor(session.minutesAccumulated);
  pendingHeartbeats.delete(key);

  if (minutesToCredit >= 1) {
    return creditPPM({
      creatorId: getContentCreator(contentId, contentType),
      contentId,
      contentType,
      minutesWatched: minutesToCredit,
      userPlan: session.userPlan
    }).then(result => ({ credited: true, minutesCredited: minutesToCredit, ...result }))
      .catch(err => ({ credited: false, error: err.message }));
  }

  return Promise.resolve({ credited: false, minutesCredited: 0 });
}

async function getContentCreator(contentId, contentType) {
  if (contentType === 'upload' || contentType === 'youtube') {
    const { rows } = await pool.query('SELECT user_id FROM uploads WHERE id = $1', [contentId]);
    return rows[0]?.user_id;
  } else if (contentType === 'scraped' || contentType === 'movie' || contentType === 'tv') {
    const { rows } = await pool.query(
      `SELECT cp.user_id 
       FROM scraped_content_links scl
       JOIN creator_profiles cp ON cp.tmdb_person_id = scl.creator_tmdb_person_id
       WHERE scl.tmdb_id = $1 AND scl.media_type = $2
       LIMIT 1`,
      [contentId, contentType === 'tv' ? 'tv' : 'movie']
    );
    return rows[0]?.user_id;
  } else if (contentType === 'shorts') {
    const { rows } = await pool.query('SELECT user_id FROM shorts WHERE id = $1', [contentId]);
    return rows[0]?.user_id;
  } else if (contentType === 'live') {
    const { rows } = await pool.query('SELECT creator_id FROM live_events WHERE id = $1', [contentId]);
    return rows[0]?.creator_id;
  }
  return null;
}

export async function onLiveStreamEnd({ streamId, creatorId, streamTitle, recordingUrl, durationMinutes }) {
  try {
    const shortId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO shorts (id, user_id, title, description, video_url, duration_seconds, status, source_type, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', 'live_replay', $7)`,
      [shortId, creatorId, `Live Replay: ${streamTitle}`, '', recordingUrl, durationMinutes * 60, JSON.stringify({ originalStreamId: streamId })]
    );
    return { success: true, shortId };
  } catch (err) {
    console.error('[watch] onLiveStreamEnd error:', err.message);
    return { success: false, error: err.message };
  }
}

// Background Jobs
export async function runHourlyJobs() {
  console.log('[cron] Running hourly jobs...');
  await refreshBaselineVPM();
}

export async function runWebhookRetryJob() {
  // Retry failed Persona webhooks (stored in a queue table if needed)
  console.log('[cron] Checking webhook retries...');
}

export async function runPayoutStatusJob() {
  // Check pending withdrawals and update status via gateway APIs
  console.log('[cron] Checking payout statuses...');
}

import crypto from 'crypto';