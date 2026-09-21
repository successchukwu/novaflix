const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT_UPLOADS) || 2

let active = 0
const waiting = []

function tryDequeue() {
  if (active >= MAX_CONCURRENT || waiting.length === 0) return
  const next = waiting.shift()
  active++
  next()
}

export function uploadQueueMiddleware(req, res, next) {
  if (active < MAX_CONCURRENT) {
    active++
    const release = () => {
      active = Math.max(0, active - 1)
      tryDequeue()
    }
    req._queueRelease = release
    res.on('finish', release)
    res.on('close', () => {
      if (req._queueRelease) {
        const fn = req._queueRelease
        req._queueRelease = null
        fn()
      }
    })
    return next()
  }

  // Queue full — check if we can wait (cap queue depth to avoid unbounded memory)
  const MAX_QUEUE = MAX_CONCURRENT * 3
  if (waiting.length >= MAX_QUEUE) {
    res.setHeader('Retry-After', '30')
    return res.status(429).json({ error: 'Too many uploads in progress. Please retry shortly.', retryAfter: 30 })
  }

  // Hold request until a slot frees; client sees pending until then
  let timeout
  const queuedNext = () => {
    clearTimeout(timeout)
    const release = () => {
      active = Math.max(0, active - 1)
      tryDequeue()
    }
    req._queueRelease = release
    res.on('finish', release)
    res.on('close', () => {
      if (req._queueRelease) {
        const fn = req._queueRelease
        req._queueRelease = null
        fn()
      }
    })
    next()
  }

  // If queued too long, return 429
  timeout = setTimeout(() => {
    const idx = waiting.indexOf(queuedNext)
    if (idx !== -1) waiting.splice(idx, 1)
    if (!res.headersSent) {
      res.setHeader('Retry-After', '15')
      res.status(429).json({ error: 'Upload queue timeout. Please retry.', retryAfter: 15 })
    }
  }, 60_000)

  waiting.push(queuedNext)

  // If client aborts while queued, remove from queue
  req.on('close', () => {
    const idx = waiting.indexOf(queuedNext)
    if (idx !== -1) {
      waiting.splice(idx, 1)
      clearTimeout(timeout)
    }
  })
}
