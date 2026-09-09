import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import os from 'os'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env') })

import axios from 'axios'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import pool from '../config/database.js'
import { uploadFile } from '../lib/r2.js'
import { addGraphEdge } from '../db.js'
import * as ytDlpService from '../services/ytDlpService.js'

const TMDB = axios.create({
  baseURL: 'https://api.themoviedb.org/3',
  headers: { Authorization: `Bearer ${process.env.TMDB_ACCESS_TOKEN}` },
  timeout: 15000,
})

function slugOf(name) { return name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30) }

async function ensureCreatorForPerson(person) {
  // Check existing creator_profiles by tmdb_person_id
  const { rows: existing } = await pool.query(
    `SELECT u.id as user_id, u.name FROM users u JOIN creator_profiles cp ON cp.user_id = u.id WHERE cp.tmdb_person_id = $1`,
    [person.id]
  )
  if (existing[0]) {
    return { userId: existing[0].user_id, name: existing[0].name, tmdbId: person.id }
  }
  // Create new user + creator_profiles
  const email = `${slugOf(person.name)}-${person.id}@novaflix.com`
  const hashed = await bcrypt.hash('1234', 10)
  const userId = uuidv4()
  const avatar = person.profile_path ? `https://image.tmdb.org/t/p/w500${person.profile_path}` : null
  await pool.query(
    `INSERT INTO users (id, email, password, name, role, plan, avatar, bio, email_verified)
     VALUES ($1,$2,$3,$4,'creator','premium',$5,'',true)
     ON CONFLICT (email) DO UPDATE SET name=$4, avatar=$5 RETURNING id`,
    [userId, email, hashed, person.name, avatar]
  )
  const { rows } = await pool.query(`SELECT id FROM users WHERE email=$1`, [email])
  const actualId = rows[0].id
  await pool.query(
    `INSERT INTO creator_profiles (user_id, display_name, bio, avatar, tmdb_person_id, known_for_department)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (user_id) DO UPDATE SET display_name=$2, tmdb_person_id=$5, known_for_department=$6`,
    [actualId, person.name, person.known_for_department || '', avatar, person.id, person.known_for_department || 'Acting']
  )
  return { userId: actualId, name: person.name, avatar, tmdbId: person.id }
}

async function fetchTrendingMovies(limit = 3) {
  const { data } = await TMDB.get('/trending/movie/week', { params: { language: 'en-US' } })
  return (data.results || []).slice(0, limit)
}

async function fetchCredits(movieId) {
  const { data } = await TMDB.get(`/movie/${movieId}/credits`, { params: { language: 'en-US' } })
  return data
}

async function fetchTrailerKey(movieId) {
  const { data } = await TMDB.get(`/movie/${movieId}/videos`, { params: { language: 'en-US' } })
  const vids = data.results || []
  const trailer = vids.find(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser')) || vids.find(v => v.site === 'YouTube')
  return trailer ? trailer.key : null
}

async function seed() {
  console.log('[seedShortsFromTrending] Fetching 3 trending movies (tmdb trending)...')
  const trending = await fetchTrendingMovies(3)
  if (trending.length === 0) throw new Error('No trending movies found')
  console.log(`[seedShortsFromTrending] Trending: ${trending.map(m=>m.title).join(', ')}`)

  for (const movie of trending) {
    console.log(`\n[seedShortsFromTrending] Processing movie ${movie.id} "${movie.title}"`)
    const credits = await fetchCredits(movie.id)
    const cast5 = (credits.cast || []).slice(0, 5)
    if (cast5.length < 2) {
      console.warn(`[seed] Not enough cast for ${movie.title}, skipping`)
      continue
    }
    console.log(`[seedShortsFromTrending] Crew 5 actors: ${cast5.map(c=>c.name).join(', ')}`)

    // Ensure each actor seeded into db creator_profiles
    const crew = []
    for (const person of cast5) {
      const ensured = await ensureCreatorForPerson(person)
      crew.push(ensured)
      console.log(`[seedShortsFromTrending] Ensured creator_profiles for ${person.name} -> ${ensured.userId}`)
    }

    // Fetch trailer key
    let trailerKey = await fetchTrailerKey(movie.id)
    if (!trailerKey) {
      console.warn(`[seedShortsFromTrending] No trailer for ${movie.title}, skipping download`)
      continue
    }
    const youtubeUrl = `https://www.youtube.com/watch?v=${trailerKey}`
    console.log(`[seedShortsFromTrending] Trailer URL: ${youtubeUrl}`)

    // Probe via ytDlpService (probe)
    try {
      const info = await ytDlpService.probe(youtubeUrl)
      console.log(`[seedShortsFromTrending] Probe ok: ${info.title} duration=${info.duration}`)
    } catch (e) {
      console.warn(`[seedShortsFromTrending] Probe failed, continuing: ${e.message}`)
    }

    // Download trailer via ytDlpService at medium quality (height<=720) with MAX 100MB
    const tmpFile = path.join(os.tmpdir(), `novaflix-trending-${movie.id}-${Date.now()}.mp4`)
    let buffer = null
    let uploadKeyForLog = ''
    try {
      console.log(`[seedShortsFromTrending] Downloading trailer via ytDlpService at medium quality (720p, --max-filesize 100M, --merge-output-format mp4)...`)
      const dl = await ytDlpService.download(youtubeUrl, tmpFile)
      console.log(`[seedShortsFromTrending] Downloaded ${dl.size} bytes to ${dl.path}`)
      buffer = fs.readFileSync(tmpFile)
    } catch (e) {
      console.warn(`[seedShortsFromTrending] yt-dlp download failed for ${movie.title}: ${e.message}`)
      // Fallback: try youtube thumbnail as placeholder? but we skip insertion if no file
      // For CI without yt-dlp/network, we still create shorts with trailer_url fallback
      buffer = null
    } finally {
      if (fs.existsSync(tmpFile)) {
        // keep buffer, unlink after upload
      }
    }

    // For each of the 5 crew, push to S3 R2 via lib/r2.js uploadFile to shorts/<userId>/, uses s3 endpoint link
    for (const member of crew) {
      let videoUrl = `https://www.youtube.com/embed/${trailerKey}`
      let thumbnailUrl = member.avatar || `https://image.tmdb.org/t/p/w500${movie.poster_path || ''}`

      if (buffer) {
        const key = `shorts/${member.userId}/${uuidv4()}.mp4`
        uploadKeyForLog = key
        const r2Res = await uploadFile({ buffer, key, contentType: 'video/mp4' })
        if (r2Res.success) {
          videoUrl = r2Res.url // s3 endpoint link (R2_PUBLIC_URL or endpoint)
          console.log(`[seedShortsFromTrending] Uploaded to R2 shorts/${member.userId}/ -> ${videoUrl}`)
        } else {
          console.warn(`[seedShortsFromTrending] R2 upload failed for ${member.name}: ${r2Res.error}, using youtube embed fallback`)
        }
      }

      // Insert into shorts table, all 5 crew post same short (same videoUrl, same movie)
      const shortId = uuidv4()
      await pool.query(
        `INSERT INTO shorts (id, user_id, title, description, video_url, thumbnail_url, duration_seconds, status, trailer_url, media_id, media_type)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (id) DO NOTHING`,
        [
          shortId,
          member.userId,
          `${movie.title} — Official Trailer (via ${crew[0].name} crew)`,
          `Trending trailer for ${movie.title}. Shared by ${crew.map(c=>c.name).join(', ')} #trending #trailer #novaflix`,
          videoUrl,
          thumbnailUrl,
          0,
          'active',
          youtubeUrl,
          movie.id,
          'movie'
        ]
      )
      console.log(`[seedShortsFromTrending] Inserted shorts entry ${shortId} for user ${member.userId} (${member.name})`)
    }

    if (buffer && fs.existsSync(tmpFile)) {
      try { fs.unlinkSync(tmpFile) } catch {}
    }

    // Builds recommendation graph via db addGraphEdge for all pairs among the 5
    console.log(`[seedShortsFromTrending] Building recommendation graph via addGraphEdge for ${movie.title}`)
    for (let i = 0; i < crew.length; i++) {
      for (let j = i + 1; j < crew.length; j++) {
        const a = crew[i], b = crew[j]
        await addGraphEdge(a.userId, b.userId, String(movie.id), movie.title, 'ACTED_IN', 'ACTED_IN')
        await addGraphEdge(b.userId, a.userId, String(movie.id), movie.title, 'ACTED_IN', 'ACTED_IN')
        console.log(`[graph] Edge ${a.name} <-> ${b.name} (movie ${movie.id})`)
      }
    }
  }

  console.log('\n[seedShortsFromTrending] Done. Seeded trending trailers with crew graph.')
  await pool.end()
  process.exit(0)
}

seed().catch(err => {
  console.error('[seedShortsFromTrending] Fatal:', err.message)
  console.error(err.stack)
  process.exit(1)
})
