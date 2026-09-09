import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') })
import jwt from 'jsonwebtoken'
import { v4 as uuidv4 } from 'uuid'
import { createUser } from '../db.js'
import pool from '../config/database.js'
import { resolveJwtSecret } from '../config/jwtSecret.js'

await new Promise((r) => setTimeout(r, 2500))

const BASE = 'http://localhost:3030/api/ads'
const results = {}
const cleanup = []
const usedSkipsLimitIds = []

function mintToken(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role, plan: user.plan }, resolveJwtSecret())
}

async function api(method, p, { token, body, base = BASE } = {}) {
  const res = await fetch(base + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  let data = null
  try { data = await res.json() } catch { /* non-json */ }
  return { status: res.status, data }
}

async function dbUser(email, role, plan) {
  const hashed = await (await import('bcryptjs')).hash('TestPass123!', 10)
  const user = {
    id: uuidv4(), email, name: role === 'admin' ? 'Test Admin' : `Test ${plan}`, password: hashed,
    role, plan, avatar: null, bio: '', email_verified: true,
  }
  await createUser(user)
  cleanup.push(() => pool.query(`DELETE FROM users WHERE id=$1`, [user.id]))
  return user
}

async function seedCampaign({ channel, advertiser_name, content_id = null, max_impressions = 0, current_impressions = 0, position_type = 'mid_roll', cue_time_seconds = 0 }) {
  const campId = uuidv4()
  const placementId = uuidv4()
  await pool.query(
    `INSERT INTO ad_campaigns (id, advertiser_name, creative_url, creative_type, channel, status, active, approved, paid, max_impressions, current_impressions)
     VALUES ($1,$2,$3,'image',$4,'approved',true,true,true,$5,$6)`,
    [campId, advertiser_name, `https://cdn.novaflix.test/img/${campId}.png`, channel, max_impressions, current_impressions]
  )
  await pool.query(
    `INSERT INTO ad_placements (id, campaign_id, content_id, position_type, cue_time_seconds, duration_seconds, is_unskippable)
     VALUES ($1,$2,$3,$4,$5,15,true)`,
    [placementId, campId, content_id, position_type, cue_time_seconds]
  )
  cleanup.push(() =>
    pool.query(`DELETE FROM ad_campaigns WHERE id=$1`, [campId])
  )
  return { campId, placementId }
}

try {
  const adminUser = await dbUser(`ads-admin-${Date.now()}@novaflix.dev`, 'admin', 'premium')
  const freeUser = await dbUser(`ads-free-${Date.now()}@novaflix.dev`, 'user', 'free')
  const studentUser = await dbUser(`ads-student-${Date.now()}@novaflix.dev`, 'user', 'student')
  const basicUser = await dbUser(`ads-basic-${Date.now()}@novaflix.dev`, 'user', 'basic')
  const premiumUser = await dbUser(`ads-premium-${Date.now()}@novaflix.dev`, 'user', 'premium')

  const freeToken = mintToken(freeUser)
  const studentToken = mintToken(studentUser)
  const basicToken = mintToken(basicUser)
  const premiumToken = mintToken(premiumUser)
  const adminToken = mintToken(adminUser)

  // ---- Phase A: only internal + google campaigns exist ---------------------
  const internalA = await seedCampaign({ channel: 'internal', advertiser_name: 'Internal Brand', position_type: 'mid_roll' })
  const googleA = await seedCampaign({ channel: 'google', advertiser_name: 'Google Brand', position_type: 'mid_roll', cue_time_seconds: 5 })

  let r = await api('GET', '/next', { token: freeToken })
  results.a1_noCreator = { status: r.status, channels: r.data?.ads?.map(a => a.channel) }
  if (r.status !== 200 || r.data?.ads?.[0]?.channel !== 'internal')
    throw new Error(`Phase A: expected internal first, got ${JSON.stringify(r.data)}`)
  const channelsA = r.data.ads.map(a => a.channel)
  if (channelsA.indexOf('internal') > channelsA.indexOf('google'))
    throw new Error('Phase A: internal should beat google in priority')

  // ---- Phase B: add live creator campaign for test-content-1 --------------
  const creatorB = await seedCampaign({ channel: 'creator', advertiser_name: 'Creator Boost', content_id: 'test-content-1', position_type: 'mid_roll' })

  r = await api('GET', '/next?contentId=test-content-1', { token: freeToken })
  results.b1_creatorFirst = { status: r.status, channels: r.data?.ads?.map(a => a.channel) }
  if (r.data?.ads?.[0]?.channel !== 'creator')
    throw new Error(`Phase B: expected creator first, got ${JSON.stringify(r.data)}`)

  // ---- Phase C: exhausted creator campaign -> no-fallback rule ------------
  const exhaustedC = await seedCampaign({ channel: 'creator', advertiser_name: 'Exhausted Boost', content_id: 'test-content-2', max_impressions: 5, current_impressions: 5 })

  r = await api('GET', '/next?contentId=test-content-2', { token: freeToken })
  results.c1_exhaustNoFallback = { status: r.status, ads: r.data?.ads?.length }
  if (r.status !== 200 || (r.data?.ads?.length ?? -1) !== 0)
    throw new Error(`Phase C: exhausted creator boost must return no ads, got ${JSON.stringify(r.data)}`)

  // ---- Plan gating ---------------------------------------------------------
  r = await api('GET', '/next?contentId=test-content-1', { token: basicToken })
  results.d1_basicNoAds = { status: r.status, ads: r.data?.ads?.length }
  if ((r.data?.ads?.length ?? -1) !== 0) throw new Error('basic plan must be ad-free')

  r = await api('GET', '/next?contentId=test-content-1', { token: premiumToken })
  results.d2_premiumNoAds = { status: r.status, ads: r.data?.ads?.length }
  if ((r.data?.ads?.length ?? -1) !== 0) throw new Error('premium plan must be ad-free')

  r = await api('GET', '/next?contentId=test-content-1', { token: studentToken })
  results.d3_studentGetsAds = { status: r.status, channels: r.data?.ads?.map(a => a.channel) }
  if ((r.data?.ads?.length ?? 0) === 0) throw new Error('student plan should still get ads')

  // ---- Binge pass -----------------------------------------------------------
  r = await api('POST', '/binge-pass', { token: freeToken, body: { contentId: 'test-content-1', minutes: 60 } })
  results.e1_grantBinge= { status: r.status, minutes: r.data?.bingePass?.minutes_granted }
  r = await api('GET', '/next?contentId=test-content-1', { token: freeToken })
  results.e2_bingeServesNoAds = { status: r.status, ads: r.data?.ads?.length, hasBinge: !!r.data?.bingePass }
  if ((r.data?.ads?.length ?? -1) !== 0 || !r.data?.bingePass)
    throw new Error('binge pass must suppress ads')

  // ---- Impression recording -------------------------------------------------
  r = await api('POST', '/impression', { token: freeToken, body: { placementId: creatorB.placementId, completed: true, watchedSeconds: 12 } })
  results.f1_impression = { status: r.status }
  const { rows: afterImp } = await pool.query(`SELECT current_impressions FROM ad_campaigns WHERE id=$1`, [creatorB.campId])
  results.f2_impressionCounted = Number(afterImp[0].current_impressions)
  if (Number(afterImp[0].current_impressions) < 1) throw new Error('impression not counted')

  // ---- Skip limits ----------------------------------------------------------
  r = await api('GET', '/skip-limit', { token: freeToken })
  results.g1_skipLimitInitial = { status: r.status, skips_max: r.data?.skips_max }
  r = await api('POST', '/skip', { token: freeToken })
  results.g2_skipIncrement = { status: r.status }
  r = await api('GET', '/skip-limit', { token: freeToken })
  results.g3_skipLimitUsed = { status: r.status, skips_used: r.data?.skips_used }
  if (r.data?.skips_used !== 1) throw new Error('skip increment not reflected')

  // ---- Admin pricing ---------------------------------------------------------
  r = await api('GET', '/pricing', { token: freeToken })
  results.h1_pricingList = { status: r.status, count: r.data?.pricing?.length }
  r = await api('PUT', '/pricing', { token: freeToken, body: { position_type: 'pre_roll', price_per_mille: 99999 } })
  results.h2_viewerCantSetPricing = { status: r.status }
  if (r.status !== 403) throw new Error('viewer must be forbidden from updating pricing')
  r = await api('PUT', '/pricing', { token: adminToken, body: { position_type: 'pre_roll', price_per_mille: 1234 } })
  results.h3_adminSetPricing = { status: r.status }
  if (r.status !== 200) throw new Error('admin pricing update failed')
  r = await api('GET', '/pricing', { token: freeToken })
  const preRoll = r.data?.pricing?.find(p => p.position_type === 'pre_roll')
  results.h4_pricingPersisted = preRoll?.price_per_mille
  if (preRoll?.price_per_mille !== 1234) throw new Error('pricing change not persisted')
  await pool.query(`UPDATE ad_pricing SET price_per_mille=800 WHERE position_type='pre_roll'`)

  // ---- Placement admin CRUD --------------------------------------------------
  const thirdCamp = await seedCampaign({ channel: 'internal', advertiser_name: 'Placement CRUD', position_type: 'mid_roll' })
  r = await api('POST', '/placements', { token: freeToken, body: { campaign_id: thirdCamp.campId, position_type: 'mid_roll', cue_time_seconds: 90 } })
  results.i1_viewerCantCreatePlacement = { status: r.status }
  if (r.status !== 403) throw new Error('viewer must not create placements')
  r = await api('POST', '/placements', { token: adminToken, body: { campaign_id: thirdCamp.campId, position_type: 'mid_roll', cue_time_seconds: 90 } })
  results.i2_adminCreatePlacement = { status: r.status, id: r.data?.id }
  if (r.status !== 200 || !r.data?.id) throw new Error('admin placement create failed')
  const newPlacementId = r.data.id
  r = await api('GET', '/placements', { token: freeToken })
  const listedNew = r.data?.placements?.find(p => p.id === newPlacementId)
  results.i3_placementListed = !!listedNew
  if (!listedNew) throw new Error('created placement not listed')
  r = await api('DELETE', `/placements/${newPlacementId}`, { token: adminToken })
  results.i4_adminDeletePlacement = { status: r.status }
  if (r.status !== 200) throw new Error('placement delete failed')

  results.allPassed = true
  console.log(JSON.stringify(results, null, 2))
} catch (err) {
  results.error = err.message
  results.allPassed = false
  console.log(JSON.stringify(results, null, 2))
  console.error('FAILED:', err)
} finally {
  for (const fn of cleanup) { try { await fn() } catch {} }
  await pool.end()
}