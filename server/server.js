import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '.env') });
import express from 'express';
import axios from 'axios';
import cors from 'cors';
import fs from 'fs';
import { spawn } from 'child_process';
import http from 'http';
import { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import { closeBrowser } from './scraper.mjs';
import { initDatabase } from './config/database.js';
import apiRoutes from './routes/index.js';
import claimRoutes from './routes/claimRoutes.js';
import beneficiaryRoutes from './routes/beneficiaryRoutes.js';
import walletRoutes from './routes/walletRoutes.js';
import { getPlanRank } from './controllers/planUtils.js';
import { joinTopicRoom, leaveTopicRoom, leaveAllTopicRooms } from './lib/realtime.js';
import { resolveJwtSecret } from './config/jwtSecret.js';
import { initializeCronJobs } from './services/cronJobs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3030;
const JWT_SECRET = resolveJwtSecret();
const TMDB_ACCESS_TOKEN = process.env.TMDB_ACCESS_TOKEN;

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3030',
  'http://localhost:5173',
  'https://novaflix-ecz9.onrender.com',
  'https://novaflix-web.vercel.app',
];

const renderSiteUrl = process.env.RENDER_EXTERNAL_URL;
if (renderSiteUrl) allowedOrigins.push(renderSiteUrl);

function isAllowedOrigin(origin) {
  if (!origin) return true; // curl, mobile/native, server-to-server
  if (allowedOrigins.includes(origin)) return true;
  // Accept any onrender.com subdomain so new deploys are not blocked.
  try {
    const host = new URL(origin).hostname;
    if (host === 'onrender.com' || host.endsWith('.onrender.com')) return true;
  } catch {}
  // Accept Vercel preview + production domains for the web client.
  try {
    const host = new URL(origin).hostname;
    if (host === 'vercel.app' || host.endsWith('.vercel.app')) return true;
  } catch {}
  return false;
}

process.on('unhandledRejection', (reason) => {
  console.error('[server] Unhandled rejection:', reason?.message || reason)
})
process.on('uncaughtException', (err) => {
  console.error('[server] Uncaught exception:', err?.message || err)
})

if (!TMDB_ACCESS_TOKEN) {
  console.error('\x1b[31m[TMDB] ERROR: TMDB_ACCESS_TOKEN is not set in server/.env\x1b[0m');
  console.error('\x1b[33m[TMDB] All TMDB search/detail endpoints will return 401 errors.\x1b[0m');
  console.error('\x1b[33m[TMDB] Create server/.env with: TMDB_ACCESS_TOKEN=your_token_here\x1b[0m');
  console.error('\x1b[33m[TMDB] Get a token at: https://www.themoviedb.org/settings/api\x1b[0m\n');
}

async function resolveFfmpeg() {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }
  const candidates = [
    'ffmpeg',
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages', 'Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe', 'ffmpeg-8.1.1-full_build', 'bin', 'ffmpeg.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages', 'Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe', 'ffmpeg-7.1-full_build', 'bin', 'ffmpeg.exe'),
    'C:\\tools\\ffmpeg\\bin\\ffmpeg.exe',
    'C:\\ffmpeg\\bin\\ffmpeg.exe',
  ];
  for (const c of candidates) {
    try {
      if (c === 'ffmpeg') {
        const r = spawn.sync(c, ['-version'], { stdio: 'pipe', timeout: 3000 });
        if (r.status === 0) { return c; }
      } else if (fs.existsSync(c)) {
        return c;
      }
    } catch {}
  }
  // Render / serverless fallback: ffmpeg-static ships a bundled binary.
  try {
    const { createRequire } = await import('node:module');
    const requireM = createRequire(import.meta.url);
    const ffmpegStaticPath = requireM('ffmpeg-static');
    if (ffmpegStaticPath && fs.existsSync(ffmpegStaticPath)) {
      console.log('[ffmpeg] using ffmpeg-static:', ffmpegStaticPath);
      return ffmpegStaticPath;
    }
  } catch {}
  return 'ffmpeg';
}

const ffmpegPath = await resolveFfmpeg();
console.log(`[ffmpeg] using: ${ffmpegPath}`);

app.use(cors({
  origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
  credentials: true,
}));
app.use(express.json({ limit: '50mb', verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8') } }));

// ---- Request + error logging (console only) ----
app.use((req, res, next) => {
  const start = Date.now()
  const originLog = req.headers.origin ? req.headers.origin.replace(/^https:\/\//, '') : (req.get('x-forwarded-for') || req.socket?.remoteAddress || '').toString().slice(0, 40).replace(/^https:\/\//, '')

  res.on('finish', () => {
    const ms = Date.now() - start
    const q = req.originalUrl || req.url || ''
    let userId = null
    const auth = req.headers.authorization
    if (auth && auth.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(auth.slice(7), JWT_SECRET)
        userId = decoded.id?.slice(0, 8) || null
      } catch {}
    }
    const status = res.statusCode
    if (status >= 400) {
      console.error(`[err] ${status} ${req.method} ${q} ${ms}ms u:${userId} origin:${originLog}`)
    } else {
      console.log(`[req] ${req.method} ${q} ${ms}ms -> ${status} u:${userId} origin:${originLog}`)
    }
  })
  next()
})

app.locals.ffmpegPath = ffmpegPath;
app.locals.tmdb = axios.create({
  baseURL: 'https://api.themoviedb.org/3',
  timeout: 15000,
  headers: {
    Authorization: `Bearer ${TMDB_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  },
});

// TMDB's edge occasionally drops connections / returns 429 under bursty
// traffic. Retry idempotent GETs once with a short backoff so a single
// transient blip never surfaces as "Failed to resolve metadata".
app.locals.tmdb.interceptors.response.use(undefined, async (error) => {
  const config = error.config;
  const status = error.response?.status;
  const transient =
    !error.response || // network drop / reset
    status === 429 ||
    (status >= 500 && status <= 599);
  if (config && transient && (config.__tmdbRetries || 0) < 1 && config.method === 'get') {
    config.__tmdbRetries = (config.__tmdbRetries || 0) + 1;
    await new Promise((r) => setTimeout(r, 400));
    return app.locals.tmdb.request(config);
  }
  return Promise.reject(error);
});

app.use('/api', apiRoutes);
app.use('/api', claimRoutes);
app.use('/api', beneficiaryRoutes);
app.use('/api', walletRoutes);

// Webhook aliases for backward compat (docs & gateway dashboards may use these)
app.post('/webhooks/paystack', (req, res) => import('./controllers/paymentController.js').then(m => m.webhook(req, res)))
app.post('/webhooks/flutterwave', (req, res) => import('./controllers/paymentController.js').then(m => m.webhook(req, res)))
app.post('/webhooks/stripe', (req, res) => import('./controllers/paymentController.js').then(m => m.webhook(req, res)))
app.post('/api/webhooks/paystack', (req, res) => import('./controllers/paymentController.js').then(m => m.webhook(req, res)))
app.post('/api/webhooks/flutterwave', (req, res) => import('./controllers/paymentController.js').then(m => m.webhook(req, res)))
app.post('/api/webhooks/stripe', (req, res) => import('./controllers/paymentController.js').then(m => m.webhook(req, res)))

// Render health check (also used by monitoring).
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

const server = http.createServer(app);

const wss = new WebSocketServer({ server, path: '/ws' });
const rooms = new Map()
const presence = new Map()
import { registerSocket, deregisterSocket } from './services/realtime.js'
import { registerCreatorSocket, deregisterCreatorSocket } from './services/creatorRealtime.js'

wss.on('connection', (ws, req) => {
  let userId = null
  let currentRoom = null
  let currentPresenceContent = null
  let userPlan = 'free'
  let isCreator = false

  // Authenticate via token in query param
  const url = new URL(req.url, `http://${req.headers.host}`)
  const token = url.searchParams.get('token')
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET)
      userId = decoded.id
      userPlan = decoded.plan || 'free'
    } catch {}
  }
  if (userId) registerSocket(userId, ws)

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString())
      const { type, room, user, payload } = msg

      switch (type) {
        case 'join': {
          const roomUserId = userId || user?.id || uuidv4()
          const isSecretRoom = typeof room === 'string' && room.startsWith('secret:')
          if (isSecretRoom) {
            const roomId = room.slice('secret:'.length)
            if (!userId) {
              ws.send(JSON.stringify({ type: 'error', message: 'Sign in to enter secret rooms.' }))
              return
            }
            try {
              const { hasSecretRoomAccess } = await import('./db.js')
              const allowed = await hasSecretRoomAccess(userId, roomId)
              if (!allowed) {
                ws.send(JSON.stringify({ type: 'error', message: 'Collect the matching digital key to enter this room.' }))
                return
              }
            } catch (err) {
              ws.send(JSON.stringify({ type: 'error', message: 'Could not verify room access.' }))
              return
            }
          }
          if (!isSecretRoom && getPlanRank(userPlan) < 4) {
            ws.send(JSON.stringify({ type: 'error', message: 'Watch Parties require a Premium plan. Please upgrade to join.' }))
            return
          }
          userId = roomUserId
          if (userId) registerSocket(userId, ws)
          currentRoom = room
          if (!rooms.has(room)) {
            rooms.set(room, { users: new Map(), hostId: null, metadata: null, suggestions: [] })
          }
          const roomObj = rooms.get(room)
          const isHost = roomObj.hostId === null
          if (isHost) roomObj.hostId = userId
          roomObj.users.set(userId, { ws, name: user?.name || 'Anonymous', id: userId })
          ws.send(JSON.stringify({
            type: 'joined',
            userId,
            room,
            isHost,
            hostId: roomObj.hostId,
            users: [...roomObj.users.keys()],
            suggestions: roomObj.suggestions,
          }))
          if (roomObj.metadata) {
            ws.send(JSON.stringify({ type: 'content-selected', payload: roomObj.metadata }))
          }
          broadcast(room, { type: 'user-joined', userId, name: user?.name || 'Anonymous' }, userId)
          break
        }
        case 'chat': {
          if (currentRoom) {
            const chatMsg = { type: 'chat', userId, message: payload?.message, name: payload?.name, timestamp: Date.now() }
            broadcast(currentRoom, chatMsg)
            // Persist chat message (fire-and-forget; failure must not break the room)
            try {
              const { saveMessage } = await import('./db.js')
              saveMessage(currentRoom, userId, payload?.name || user?.name || 'Anonymous', payload?.message).catch(() => {})
            } catch {}
          }
          break
        }
        case 'content-select': {
          if (currentRoom && rooms.has(currentRoom)) {
            rooms.get(currentRoom).metadata = payload
            broadcast(currentRoom, { type: 'content-selected', payload: { ...payload, userId }, userId })
          }
          break
        }
        case 'suggest': {
          if (currentRoom && rooms.has(currentRoom)) {
            const roomObj = rooms.get(currentRoom)
            const suggestion = { ...payload, suggesterId: userId, suggesterName: user?.name || 'Anonymous' }
            roomObj.suggestions.push(suggestion)
            // Send to host only
            const hostClient = roomObj.users.get(roomObj.hostId)
            if (hostClient && hostClient.ws.readyState === 1) {
              hostClient.ws.send(JSON.stringify({ type: 'suggestion', payload: suggestion }))
            }
          }
          break
        }
        case 'suggest-accept': {
          if (currentRoom && rooms.has(currentRoom)) {
            const roomObj = rooms.get(currentRoom)
            const suggesterId = payload?.suggesterId
            const suggesterClient = roomObj.users.get(suggesterId)
            if (suggesterClient && suggesterClient.ws.readyState === 1) {
              suggesterClient.ws.send(JSON.stringify({ type: 'suggest-accepted', payload: { id: payload?.id, type: payload?.type } }))
            }
            broadcast(currentRoom, { type: 'suggest-accepted-broadcast', payload: { id: payload?.id, type: payload?.type, title: payload?.title } }, userId)
          }
          break
        }
        case 'suggest-decline': {
          if (currentRoom && rooms.has(currentRoom)) {
            const roomObj = rooms.get(currentRoom)
            const suggesterId = payload?.suggesterId
            const suggesterClient = roomObj.users.get(suggesterId)
            if (suggesterClient && suggesterClient.ws.readyState === 1) {
              suggesterClient.ws.send(JSON.stringify({ type: 'suggest-declined', payload: { id: payload?.id, type: payload?.type } }))
            }
          }
          break
        }
        case 'sync': {
          if (currentRoom) {
            broadcast(currentRoom, { type: 'sync', userId, action: payload?.action, currentTime: payload?.currentTime, playing: payload?.playing }, userId)
          }
          break
        }
        case 'leave': {
          if (currentRoom && rooms.has(currentRoom)) {
            const roomObj = rooms.get(currentRoom)
            roomObj.users.delete(userId)
            // If host leaves, assign new host
            if (roomObj.hostId === userId && roomObj.users.size > 0) {
              const firstKey = roomObj.users.keys().next().value
              roomObj.hostId = firstKey
              broadcast(currentRoom, { type: 'host-changed', hostId: firstKey })
            }
            broadcast(currentRoom, { type: 'user-left', userId })
            if (roomObj.users.size === 0) rooms.delete(currentRoom)
          }
          break
        }
        case 'dm-join': {
          if (!userId) {
            ws.send(JSON.stringify({ type: 'error', message: 'Authentication required for direct messages' }))
            return
          }
          const otherId = payload?.otherUserId
          if (!otherId) {
            ws.send(JSON.stringify({ type: 'error', message: 'otherUserId required' }))
            return
          }
          const { dmRoom, getDirectMessages } = await import('./db.js')
          currentRoom = dmRoom(userId, otherId)
          if (!rooms.has(currentRoom)) rooms.set(currentRoom, new Map())
          const roomUsers = rooms.get(currentRoom)
          roomUsers.set(userId, { ws, name: user?.name || 'Anonymous', id: userId })
          ws.send(JSON.stringify({ type: 'joined', userId, room: currentRoom, users: [...roomUsers.keys()] }))
          try {
            const history = await getDirectMessages(userId, otherId, 50)
            if (history.length > 0) {
              ws.send(JSON.stringify({ type: 'chat-history', messages: history.map((m) => ({
                userId: m.user_id,
                name: m.user_name || 'Anonymous',
                message: m.message,
                timestamp: new Date(m.created_at).getTime(),
              })) }))
            }
          } catch {}
          break
        }
        case 'dm-chat': {
          if (!currentRoom || !currentRoom.startsWith('dm:')) break
          const chatMsg = { type: 'chat', userId, message: payload?.message, name: payload?.name, timestamp: Date.now() }
          broadcast(currentRoom, chatMsg)
          try {
            const { saveMessage } = await import('./db.js')
            saveMessage(currentRoom, userId, payload?.name || user?.name || 'Anonymous', payload?.message).catch(() => {})
          } catch {}
          break
        }
        case 'community-join': {
          if (!userId) {
            ws.send(JSON.stringify({ type: 'error', message: 'Sign in to join community chats' }))
            return
          }
          const communityId = payload?.communityId
          if (!communityId) {
            ws.send(JSON.stringify({ type: 'error', message: 'communityId required' }))
            return
          }
          try {
            const { isCommunityMember, getRoomMessages } = await import('./db.js')
            const member = await isCommunityMember(communityId, userId)
            if (!member) {
              ws.send(JSON.stringify({ type: 'error', code: 'not-member', message: 'Join this community to enter its chat.' }))
              break
            }
            currentRoom = `community:${communityId}`
            if (!rooms.has(currentRoom)) {
              rooms.set(currentRoom, { users: new Map(), hostId: null, metadata: null, suggestions: [] })
            }
            const roomObj = rooms.get(currentRoom)
            roomObj.users.set(userId, { ws, name: user?.name || 'Anonymous', id: userId })
            const joinedUsers = [...roomObj.users.values()].map((u) => ({ id: u.id, name: u.name }))
            ws.send(JSON.stringify({
              type: 'community-joined',
              communityId,
              users: joinedUsers,
            }))
            broadcast(currentRoom, { type: 'user-joined', userId, name: user?.name || 'Anonymous', users: joinedUsers }, userId)
            try {
              const history = await getRoomMessages(currentRoom, 50)
              ws.send(JSON.stringify({ type: 'chat-history', communityId, messages: history.map((m) => ({
                id: String(m.id),
                userId: m.user_id,
                name: m.user_name || 'Anonymous',
                message: m.message,
                timestamp: new Date(m.created_at).getTime(),
              })) }))
            } catch {}
          } catch {
            ws.send(JSON.stringify({ type: 'error', message: 'Could not join community chat' }))
          }
          break
        }
        case 'community-chat': {
          if (!currentRoom || !currentRoom.startsWith('community:')) break
          if (typeof payload?.message !== 'string' || !payload.message.trim()) break
          const text = payload.message.trim().slice(0, 2000)
          const cMsg = { type: 'chat', userId, message: text, name: user?.name || 'Anonymous', timestamp: Date.now() }
          broadcast(currentRoom, cMsg)
          try {
            const { saveMessage } = await import('./db.js')
            saveMessage(currentRoom, userId, cMsg.name, text).catch(() => {})
          } catch {}
          break
        }
        case 'community-typing': {
          if (!currentRoom || !currentRoom.startsWith('community:')) break
          broadcast(currentRoom, { type: 'typing', userId, name: user?.name || 'Anonymous', isTyping: !!payload?.isTyping }, userId)
          break
        }
        case 'topic-join': {
          if (!userId) {
            ws.send(JSON.stringify({ type: 'error', message: 'Authentication required for live replies' }))
            return
          }
          const topicId = payload?.topicId
          if (!topicId) {
            ws.send(JSON.stringify({ type: 'error', message: 'topicId required' }))
            return
          }
          joinTopicRoom(topicId, ws)
          ws.send(JSON.stringify({ type: 'topic-joined', topicId }))
          break
        }
        case 'topic-leave': {
          leaveTopicRoom(ws.topicRoomId, ws)
          break
        }
        case 'presence': {
          if (!userId) break
          const contentId = payload?.contentId
          if (!contentId) break
          currentPresenceContent = contentId
          if (!presence.has(contentId)) presence.set(contentId, new Map())
          const viewers = presence.get(contentId)
          viewers.set(userId, {
            ws,
            name: payload?.name || user?.name || 'Anonymous',
            avatar: payload?.avatar || null,
            currentTime: payload?.currentTime || 0,
            playing: !!payload?.playing,
          })
          const summary = [...viewers.entries()]
            .filter(([id]) => id !== userId)
            .map(([id, v]) => ({ userId: id, name: v.name, avatar: v.avatar, currentTime: v.currentTime, playing: v.playing }))
          ws.send(JSON.stringify({ type: 'presence-update', viewers: summary }))
          broadcastPresence(contentId, { type: 'presence-update', viewers: summary }, userId)
          break
        }
        case 'presence-flash': {
          if (!userId) break
          const contentId = payload?.contentId || currentPresenceContent
          if (!contentId) break
          broadcastPresence(contentId, {
            type: 'presence-flash',
            userId,
            name: user?.name || 'Anonymous',
            emoji: payload?.emoji || '👋',
          }, userId)
          break
        }
        case 'watch-party-invite': {
          if (!userId) break
          const contentId = payload?.contentId || currentPresenceContent
          const targetUserId = payload?.targetUserId
          if (!contentId || !targetUserId) break
          const target = presence.get(contentId)?.get(targetUserId)
          if (target && target.ws.readyState === 1) {
            target.ws.send(JSON.stringify({
              type: 'watch-party-invite',
              fromUserId: userId,
              fromName: user?.name || 'Anonymous',
              room: payload?.room,
              contentId,
            }))
          }
          break
        }
        case 'creator-subscribe': {
          if (userId) {
            isCreator = true
            registerCreatorSocket(userId, ws)
          }
          break
        }
        case 'creator-unsubscribe': {
          if (userId) deregisterCreatorSocket(userId, ws)
          break
        }
      }
    } catch {}
  })

  ws.on('close', () => {
    if (userId) deregisterSocket(userId, ws)
    if (userId && isCreator) deregisterCreatorSocket(userId, ws)
    leaveAllTopicRooms(ws)
    if (currentRoom && rooms.has(currentRoom)) {
      const roomObj = rooms.get(currentRoom)
      roomObj.users.delete(userId)
      if (roomObj.hostId === userId && roomObj.users.size > 0) {
        const firstKey = roomObj.users.keys().next().value
        roomObj.hostId = firstKey
        broadcast(currentRoom, { type: 'host-changed', hostId: firstKey })
      }
      const remainingUsers = [...roomObj.users.values()].map((u) => ({ id: u.id, name: u.name }))
      broadcast(currentRoom, { type: 'user-left', userId, users: remainingUsers })
      if (roomObj.users.size === 0) rooms.delete(currentRoom)
    }
    if (currentPresenceContent && presence.has(currentPresenceContent)) {
      presence.get(currentPresenceContent).delete(userId)
      const remaining = [...presence.get(currentPresenceContent).entries()].map(([id, v]) => ({ userId: id, name: v.name, avatar: v.avatar, currentTime: v.currentTime, playing: v.playing }))
      broadcastPresence(currentPresenceContent, { type: 'presence-update', viewers: remaining }, userId)
      if (presence.get(currentPresenceContent).size === 0) presence.delete(currentPresenceContent)
    }
  })

  function broadcast(room, msg, excludeId) {
    if (!rooms.has(room)) return
    const roomObj = rooms.get(room)
    for (const [id, client] of roomObj.users) {
      if (id !== excludeId && client.ws.readyState === 1) {
        client.ws.send(JSON.stringify(msg))
      }
    }
  }

  function broadcastPresence(contentId, msg, excludeId) {
    if (!presence.has(contentId)) return
    for (const [id, viewer] of presence.get(contentId)) {
      if (id !== excludeId && viewer.ws.readyState === 1) {
        viewer.ws.send(JSON.stringify(msg))
      }
    }
  }
})

import { deactivateExpiredSubscriptions } from './jobs/subscriptionExpiry.js'
import { seedAchievements } from './db.js'

server.listen(PORT, () => {
  console.log(`NovaFlix engine alive on http://localhost:${PORT}`);
  console.log(`WebSocket available at ws://localhost:${PORT}/ws`);

  // Ephemeral-filesystem hygiene: clear transcoded downloads on startup.
  // On Render the disk is temporary and small; stale mp4s would accumulate.
  try {
    const downloadDir = path.join(__dirname, 'download');
    if (fs.existsSync(downloadDir)) {
      for (const f of fs.readdirSync(downloadDir)) {
        if (f === '.gitkeep') continue;
        try { fs.unlinkSync(path.join(downloadDir, f)); } catch {}
      }
    }
  } catch {}

  const hasDbUrl = !!process.env.DATABASE_URL;
  if (hasDbUrl) {
initDatabase().then(async () => {
        await seedAchievements()
        const { seedRoles } = await import('./controllers/adminController.js')
        await seedRoles().catch((err) => console.warn('[roles] seed failed:', err.message))
        deactivateExpiredSubscriptions()
        setInterval(deactivateExpiredSubscriptions, 60 * 60 * 1000)
        console.log('[db] Database features active');
        
        // Initialize cron jobs
        await initializeCronJobs();
      }).catch((err) => {
      console.warn('[server] Database unavailable, running without DB features:', err.message);
    });
  } else {
    console.warn('[server] No DATABASE_URL set, running without database features (auth, payments, etc.)');
  }
});

process.on('SIGINT', async () => {
  console.log('Shutting down...');
  wss.close()
  await closeBrowser();
  server.close(() => process.exit(0));
});

process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  wss.close()
  await closeBrowser();
  server.close(() => process.exit(0));
});
