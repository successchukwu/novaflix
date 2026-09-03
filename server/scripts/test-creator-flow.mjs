// End-to-end test: Creator Signup → Admin Approval → Public Visibility → Follow
import dotenv from 'dotenv'
import fs from 'fs'
import jwt from 'jsonwebtoken'

dotenv.config({ path: './.env' })
const BASE = 'http://127.0.0.1:3030/api'
const SECRET = process.env.JWT_SECRET || (() => {
  const env = fs.readFileSync('./.env','utf8')
  return env.match(/^JWT_SECRET=(.*)$/m)[1]
})()

const U_VIEWER = '48aeea13-ac62-4b83-9116-d72b521e609b' // wsprobe2@test.com
const U_VIEWER2 = '31853d60-3d24-4a8c-b724-d6850547c1d8' // second viewer

async function api(uid, path, opts = {}) {
  const r = await fetch(BASE + path, {
    ...opts,
    headers: { Authorization: `Bearer ${mk(uid)}`, 'Content-Type': 'application/json', ...(opts.headers || {}) }
  })
  let body = null
  try { body = await r.json() } catch {}
  return { status: r.status, body }
}

const mk = (uid) => jwt.sign({ id: uid }, SECRET, { expiresIn: '1h' })


let creatorUserId = null
let creatorEmail = `creator_test_${Date.now()}@test.com`
let creatorName = `Test Creator ${Date.now()}`

async function testCreatorFlow() {
  let passed = 0, failed = 0
  function check(name, ok, detail = '') {
    console.log(`${ok ? '✅ PASS' : '❌ FAIL'}: ${name}${detail ? ` -> ${detail}` : ''}`)
    ok ? passed++ : failed++
  }

  console.log('\n=== CREATOR FLOW E2E TEST ===\n')

  // 1. CREATE CREATOR APPLICATION (as viewer)
  console.log('--- STEP 1: Creator Signup ---')
  const signup = await api(U_VIEWER, '/auth/signup/creator-apply', {
    method: 'POST',
    body: JSON.stringify({
      email: creatorEmail,
      password: 'TestPass123!',
      name: creatorName,
      platformName: 'Test Studio',
      socialMediaLinks: { youtube: 'https://youtube.com/test', instagram: 'https://instagram.com/test' },
      bio: 'Test creator bio for e2e test'
    })
  })
  check('Creator signup succeeds', signup.status === 200 && signup.body?.success, JSON.stringify(signup.body))
  if (signup.body?.userId) creatorUserId = signup.body.userId

  await waitMs(500)

  // 2. PUBLIC CREATOR LIST (should be empty since not approved)
  console.log('\n--- STEP 2: Public Creator Visibility (Pre-Approval) ---')
  const publicCreators = await api(U_VIEWER, '/creator/public')
  check('Public creators endpoint works', publicCreators.status === 200 && publicCreators.body?.success)
  const ourCreatorPre = publicCreators.body?.creators?.find(c => c.id === creatorUserId)
  check('Our creator NOT in public list (not approved)', !ourCreatorPre)

  // 3. SEARCH CREATORS (should be empty since not approved)
  console.log('\n--- STEP 3: Creator Search (Pre-Approval) ---')
  const search = await api(U_VIEWER, `/creator/search?q=${encodeURIComponent(creatorName)}`)
  check('Search creators works', search.status === 200 && search.body?.success)
  const foundPre = search.body?.creators?.find(c => c.id === creatorUserId)
  check('Creator NOT found in search (not approved)', !foundPre)

  // 5. CREATOR DETAIL / PROFILE (should 404 or not show)
  console.log('\n--- STEP 4: Creator Profile Detail (Pre-Approval) ---')
  if (creatorUserId) {
    const detail = await api(U_VIEWER, `/creators/${creatorUserId}`)
    check('Creator detail endpoint works', detail.status === 200)
  }

  // 5. FOLLOW CREATOR (should work - can follow any user, not just approved creators)
  console.log('\n--- STEP 5: Follow Creator (Pre-Approval) ---')
  if (creatorUserId) {
    const follow = await api(U_VIEWER2, '/interactions/follow', {
      method: 'POST',
      body: JSON.stringify({ followingId: creatorUserId })
    })
    check('Follow pre-approval works (can follow any user)', follow.status === 200 && follow.body?.success && follow.body.following === true)
  }

  // 6. SEARCH CREATORS PAGE
  console.log('\n--- STEP 6: Search Page Integration (Pre-Approval) ---')
  const searchPage = await api(U_VIEWER, `/creator/search?q=${encodeURIComponent(creatorName)}`)
  check('Search endpoint returns creators', searchPage.status === 200 && searchPage.body?.success)
  const foundInSearchPre = searchPage.body?.creators?.find(c => c.id === creatorUserId)
  check('Creator NOT in search results (not approved)', !foundInSearchPre)

  console.log('\n=== PRE-APPROVAL RESULTS: ' + passed + ' passed, ' + failed + ' failed ===')
  console.log('\n⚠️  NOTE: Admin approval step requires manual DB setup for admin user')
  console.log('To complete full flow: promote a user to admin in DB, then run full test')
async function waitMs(ms) { return new Promise(r => setTimeout(r, ms)) }
  process.exit(failed ? 1 : 0)
}

function check(name, ok, detail = '') {
  console.log(`${ok ? '✅ PASS' : '❌ FAIL'}: ${name}${detail ? ` -> ${detail}` : ''}`)
  ok ? passed++ : failed++
}


testCreatorFlow().catch(e => { console.error(e); process.exit(1) })
