import { Router } from 'express'
import { authMiddleware } from '../middleware/auth.js'
import * as streamController from '../controllers/streamController.js'
import fs from 'fs'
import path from 'path'
import os from 'os'

const router = Router()

router.get('/source', authMiddleware, streamController.source)
// Dedicated stable movie/TV endpoints (backward compat for vanilla client)
router.get('/movie/:id/source', authMiddleware, streamController.movieSource)
router.get('/tv/:id/source', authMiddleware, streamController.tvSource)
router.get('/stream/creator/:file', streamController.streamCreatorUpload)
router.get('/manifest-info', authMiddleware, streamController.manifestInfo)
router.get('/download', authMiddleware, streamController.download)
router.get('/proxy/*', streamController.proxy)
router.get('/file/:filename', authMiddleware, streamController.serveDownloadedFile)

const LOG_DIR = path.join(os.homedir(), '.novaflix', 'logs')
const LOG_FILE = path.join(LOG_DIR, 'events.jsonl')
// Streaming observability endpoint — no auth required for client beacons (avoids collision with /api/events creator routes)
router.post('/stream-events', (req, res) => {
  try {
    const event = req.body
    if (!event) return res.status(400).json({ error: 'No event data' })
    event.serverReceived = Date.now()
    event.ip = req.ip || 'unknown'
    event.timestamp = Date.now()
    const line = JSON.stringify(event) + '\n'
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })
    fs.appendFileSync(LOG_FILE, line, { flag: 'a' })
    return res.json({ status: 'ok', received: event.type })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

export default router