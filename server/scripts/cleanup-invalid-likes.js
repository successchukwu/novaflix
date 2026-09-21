/**
 * Migration: clean up corrupted non-UUID entries in likes.content_id
 * 
 * likes.content_id is VARCHAR(255) but joins to uploads.id (UUID) via ::uuid.
 * Rows where content_id is not a valid UUID (e.g. YouTube IDs) crash the cast.
 * The main query now guards with a regex filter; this script removes existing
 * bad rows so no orphan data remains.
 *
 * Safe: SELECTs first, prints counts, then DELETEs only matching bad rows
 * inside a single transaction. No nullification - we delete since the FK
 * target never existed.
 */

import pool from '../config/database.js'

// Wait for the lazy async pool init in config/database.js (DNS resolution)
async function ensurePoolReady(retries = 10) {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query('SELECT 1')
      return
    } catch (e) {
      if (e.message.includes('Database unavailable')) {
        await new Promise(r => setTimeout(r, 500))
        continue
      }
      throw e
    }
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SQL_REGEX = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"

async function cleanupInvalidLikes() {
  await ensurePoolReady()
  console.log('[cleanup-invalid-likes] scanning likes for non-UUID upload entries…')

  // 1) Count total upload-type likes
  const { rows: [{ total }] } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM likes WHERE content_type = 'upload'`
  )
  console.log(`  total likes WHERE content_type='upload': ${total}`)

  // 2) Select bad rows (non-UUID content_id for uploads) in small batches for observability
  const { rows: bad } = await pool.query(
    `SELECT id, content_id, content_type, user_id, created_at
     FROM likes
     WHERE content_type = 'upload'
       AND content_id !~* $1
     ORDER BY created_at DESC
     LIMIT 100`,
    [SQL_REGEX]
  )
  console.log(`  bad (non-UUID) sample: ${bad.length} rows (showing up to 100)`)
  if (bad.length) {
    for (const r of bad.slice(0, 10)) {
      console.log(`    - likes.id=${r.id} content_id='${String(r.content_id).slice(0, 60)}' user_id=${r.user_id}`)
    }
    if (bad.length === 100) console.log('    … (more than 100 bad rows exist)')
  }

  // 3) Count all bad rows precisely
  const { rows: [{ bad_total }] } = await pool.query(
    `SELECT COUNT(*)::int AS bad_total FROM likes
     WHERE content_type = 'upload' AND content_id !~* $1`,
    [SQL_REGEX]
  )
  console.log(`  total bad (non-UUID upload) rows: ${bad_total}`)

  if (bad_total === 0) {
    console.log('[cleanup-invalid-likes] nothing to clean.')
    return
  }

  // 4) Delete in transaction, batched to avoid long locks / OOM
  const BATCH = 500
  let deletedTotal = 0
  let batch = 0
  while (true) {
    const { rowCount } = await pool.query(
      `DELETE FROM likes
       WHERE id IN (
         SELECT id FROM likes
         WHERE content_type = 'upload' AND content_id !~* $1
         LIMIT $2
       )`,
      [SQL_REGEX, BATCH]
    )
    deletedTotal += rowCount
    batch++
    console.log(`  batch ${batch}: deleted ${rowCount} (total ${deletedTotal}/${bad_total})`)
    if (rowCount === 0 || rowCount < BATCH) break
  }

  console.log(`[cleanup-invalid-likes] done. deleted ${deletedTotal} corrupted rows.`)
}

cleanupInvalidLikes()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[cleanup-invalid-likes] failed:', err.message)
    console.error(err.stack)
    process.exit(1)
  })
