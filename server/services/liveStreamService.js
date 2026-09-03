import pool from '../config/database.js'
import { broadcastFeed } from './realtime.js'

// Default ingest / delivery host endpoints (override via env when a real
// media relay / origin cluster is provisioned).
const {
  RTMP_HOST = 'rtmp://localhost:1935',
  RTMPS_HOST = 'rtmps://localhost:1935',
  SRT_HOST = 'srt://localhost:9000',
  WHEP_HOST = 'https://localhost:4443/whep',
  WHIP_HOST = 'https://localhost:4443/whip',
  HLS_HOST = 'https://live.novaflix.local/hls',
  DASH_HOST = 'https://live.novaflix.local/dash',
  FLV_HOST = 'https://live.novaflix.local/flv',
  WS_HOST = 'wss://live.novaflix.local/ws',
} = process.env

const APP_NAME = 'novaflix'

// Ingest options a creator can pick from when starting a stream.
// - RTMP/RTMPS: desktop software (OBS, vMix, Streamlabs) — like TikTok/Twitch.
// - SRT: reliable over fluctuating networks (mobile broadcasters).
// - WebRTC (WHIP): sub-second, browser/mobile real-time interaction.
export function ingestConfig(streamKey, proto = 'rtmp') {
  const base = {
    streamKey,
    app: APP_NAME,
    protocols: {
      rtmp: { label: 'RTMP', url: `${RTMP_HOST}/${APP_NAME}/${streamKey}`, note: 'Desktop (OBS, vMix, Streamlabs)' },
      rtmps: { label: 'RTMPS', url: `${RTMPS_HOST}/${APP_NAME}/${streamKey}`, note: 'Desktop, encrypted (OBS)·TLS' },
      srt: { label: 'SRT', url: `${SRT_HOST}?streamid=${streamKey}`, note: 'Mobile / unstable networks' },
      webrtc: { label: 'WebRTC (WHIP)', url: WHIP_HOST, note: 'Sub-second browser/mobile' },
    },
    recommended: proto,
  }
  return base
}

// Delivery options a viewer can use to play a live stream.
// - LL-HLS / LL-DASH: 2–5s latency, CDN-scalable to millions.
// - WebRTC (WHEP) / HTTP-FLV: sub-second for real-time interaction / battles.
// - QUIC/HTTP3: instant start on weak mobile connections.
export function deliveryConfig(streamId, streamKey) {
  return {
    streamId,
    hls: `${HLS_HOST}/${APP_NAME}/${streamKey}.m3u8`,
    dash: `${DASH_HOST}/${APP_NAME}/${streamKey}.mpd`,
    flv: `${FLV_HOST}/${APP_NAME}/${streamKey}.flv`,
    webrtc: `${WHEP_HOST}/${streamKey}`,
    ws: `${WS_HOST}/stream/${streamId}`,
    latencyMode: 'll-hls',
  }
}

// Persist a stream and announce it to the hooks feed in real time.
export async function startLiveSession({ creatorId, name = '', title = '', category = 'general', tags = [] }) {
  const { rows } = await pool.query(
    `INSERT INTO creator_streams (creator_id, title, status, started_at, metadata)
     VALUES ($1, $2, 'live', NOW(), $3)
     ON CONFLICT DO NOTHING
     RETURNING id, title, status, started_at, viewer_count`,
    [creatorId, title || name || 'Untitled Stream', JSON.stringify({ category, tags: tags || [] })]
  )
  return rows[0] || null
}

// Mark the creator's active stream ended and remove it from the live area.
export async function endLiveSession(creatorId) {
  const { rows } = await pool.query(
    `UPDATE creator_streams SET status = 'ended', ended_at = NOW()
     WHERE creator_id = $1 AND status = 'live'
     RETURNING id, title, ended_at`,
    [creatorId]
  )
  return rows[0] || null
}

export async function getActiveStream(creatorId) {
  const { rows } = await pool.query(
    `SELECT cs.*, u.name AS creator_name, u.avatar AS creator_avatar
     FROM creator_streams cs
     JOIN users u ON u.id = cs.creator_id
     WHERE cs.creator_id = $1 AND cs.status = 'live'
     ORDER BY cs.started_at DESC LIMIT 1`,
    [creatorId]
  )
  return rows[0] || null
}

export async function listLiveStreams(limit = 20) {
  const { rows } = await pool.query(
    `SELECT cs.id, cs.title, cs.viewer_count, cs.started_at, cs.creator_id,
            u.name AS creator_name, u.avatar AS creator_avatar
     FROM creator_streams cs
     JOIN users u ON u.id = cs.creator_id
     WHERE cs.status = 'live'
     ORDER BY cs.started_at ASC LIMIT $1`,
    [limit]
  )
  return rows
}

// Announce stream lifecycle events to the global hooks feed so the LIVE
// items injected by hooksController are broadcast to all open feeds.
export function announceLive(event, payload) {
  broadcastFeed({ type: `live:${event}`, ...payload })
}

export default {
  ingestConfig,
  deliveryConfig,
  startLiveSession,
  endLiveSession,
  getActiveStream,
  listLiveStreams,
  announceLive,
}
