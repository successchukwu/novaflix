import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import axios from 'axios'
import { createHash } from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import pool from '../config/database.js'
import {
  findUserByEmail, findUserById, findUserByGoogleId, findUserBySocialId, socialIdColumn, createUser, saveVerificationCode,
  verifyCode, updateUser, updateLastLogin, findDevice, upsertDevice, findKnownLocation,
  recordLocation, createRefreshToken, findRefreshToken, deleteRefreshToken,
  deleteAllRefreshTokens, addToBlocklist, isTokenBlocked, recordRateLimitAttempt,
  getRateLimitAttempts, clearRateLimitAttempts, incrementFailedLoginAttempts,
  resetFailedLoginAttempts, isAccountLocked
} from '../db.js'
import { sendVerificationCode, sendWelcomeEmail, sendLoginVerificationCode, sendPasswordResetEmail, isEmailConfigured } from '../services/emailService.js'
import { resolveJwtSecret } from '../config/jwtSecret.js'
import { buildAuthorizeUrl, exchangeCode, fetchProfile, isProviderConfigured, listProviders } from '../services/socialOAuthService.js'
import { broadcastFeed } from '../services/realtime.js'

const JWT_SECRET = resolveJwtSecret()
const INACTIVITY_DAYS = 14
const LOCATION_RADIUS_KM = 150
const ACCESS_TOKEN_EXPIRY = '15m'
const REFRESH_TOKEN_EXPIRY_DAYS = 7
const MAX_LOGIN_ATTEMPTS = 5
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000 // 15 minutes

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

function fingerprint(input) {
  return createHash('sha256').update(input).digest('hex')
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

async function needsLoginVerification(user, ctx) {
  if (!user.last_login_at) return 'inactive'
  const daysSince = (Date.now() - new Date(user.last_login_at).getTime()) / 86400000
  if (daysSince > INACTIVITY_DAYS) return 'inactive'

  if (ctx.lat !== undefined && ctx.lng !== undefined && ctx.lat !== null && ctx.lng !== null) {
    const known = await findKnownLocation(user.id, ctx.lat, ctx.lng, LOCATION_RADIUS_KM)
    if (!known) return 'unknown-location'
  }

  const knownDevice = await findDevice(user.id, ctx.devId)
  if (!knownDevice) {
    if (ctx.ip) {
      const { rows } = await pool.query(
        'SELECT 1 FROM user_devices WHERE user_id = $1 AND ip_address = $2 LIMIT 1',
        [user.id, ctx.ip]
      )
      if (rows.length > 0) return null
    }
    return 'new-device'
  }

  return null
}

async function recordLogin(req, user, deviceId, lat, lng, accuracy) {
  const ip = req.ip || req.connection?.remoteAddress
  const ua = req.headers['user-agent'] || ''
  const devId = deviceId || fingerprint(`${ip}|${ua}`)
  await updateLastLogin(user.id)
  await upsertDevice(user.id, devId, ip, ua)
  if (lat !== undefined && lng !== undefined && lat !== null && lng !== null) {
    await recordLocation(user.id, lat, lng, accuracy, 'geolocation', ip, ua)
  }
}

function getBaseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http'
  const host = req.get('host')
  return `${proto}://${host}`
}

function parseCookies(req) {
  const header = req.headers.cookie || ''
  const cookies = {}
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    const key = part.slice(0, idx).trim()
    const value = part.slice(idx + 1).trim()
    if (key) cookies[decodeURIComponent(key)] = decodeURIComponent(value)
  }
  return cookies
}

function sanitizeRedirectPath(path) {
  if (path && typeof path === 'string' && path.startsWith('/') && !path.startsWith('//')) {
    return path.slice(0, 500)
  }
  return '/home'
}

function getRedirectionUrl(role) {
  switch (role) {
    case 'admin': return '/admin'
    case 'creator': return '/creator'
    case 'viewer':
    default: return '/home'
  }
}

function signAccessToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, plan: user.plan || 'free', type: 'access' },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  )
}

function signRefreshToken(userId) {
  return jwt.sign(
    { id: userId, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: `${REFRESH_TOKEN_EXPIRY_DAYS}d` }
  )
}

// Alias — payment flows mint upgraded-plan tokens under this name.
export function signToken(user) {
  return signAccessToken(user)
}

function setRefreshCookie(res, token) {
  res.cookie('refresh_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    path: '/api/auth',
  })
}

// ============ RATE LIMITING ============

async function checkRateLimit(identifier, action, maxAttempts = MAX_LOGIN_ATTEMPTS) {
  const attempts = await getRateLimitAttempts(identifier, action, RATE_LIMIT_WINDOW_MS)
  if (attempts >= maxAttempts) {
    const retryAfter = Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)
    return { blocked: true, retryAfter }
  }
  return { blocked: false }
}

// ============ SIGNUP: VIEWER ============

export async function signupViewer(req, res) {
  try {
    const { email, password, name } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' })
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' })
    }

    // Rate limit check
    const rateLimit = await checkRateLimit(email.toLowerCase(), 'signup-viewer')
    if (rateLimit.blocked) {
      return res.status(429).json({
        error: 'Too many signup attempts. Please try again later.',
        retryAfter: rateLimit.retryAfter
      })
    }

    if (!isEmailConfigured()) {
      return res.status(503).json({ error: 'Email verification is temporarily unavailable. Please try again later.' })
    }

    const existing = await findUserByEmail(email.toLowerCase())
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' })
    }

    const hashed = await bcrypt.hash(password, 12)
    const user = {
      id: uuidv4(),
      email: email.toLowerCase(),
      name: name || email.split('@')[0],
      password: hashed,
      role: 'viewer',
      plan: 'free',
      avatar: null,
      bio: '',
      email_verified: false,
    }
    await createUser(user)

    broadcastFeed({ type: 'admin:user.signup', userId: user.id, email: user.email, name: user.name, timestamp: Date.now() })

    const code = generateCode()
    await saveVerificationCode(user.id, code)

    try {
      await sendVerificationCode(user.email, code, user.name)
    } catch (emailErr) {
      console.error('[auth] Failed to send verification email:', emailErr.message)
    }

    console.log(`[auth] signup/viewer: ${user.email} (verification code sent)`)
    res.json({ success: true, message: 'Verification code sent to email', userId: user.id })
  } catch (err) {
    console.error('[auth] signup/viewer error:', err.message)
    res.status(500).json({ error: 'Registration failed' })
  }
}

// ============ SIGNUP: CREATOR APPLY ============

export async function signupCreatorApply(req, res) {
  try {
    const { email, password, name, platformName, socialMediaLinks, bio } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' })
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' })
    }

    if (!platformName) {
      return res.status(400).json({ error: 'Platform/Studio name is required' })
    }

    // Rate limit check
    const rateLimit = await checkRateLimit(email.toLowerCase(), 'signup-creator')
    if (rateLimit.blocked) {
      return res.status(429).json({
        error: 'Too many signup attempts. Please try again later.',
        retryAfter: rateLimit.retryAfter
      })
    }

    if (!isEmailConfigured()) {
      return res.status(503).json({ error: 'Email verification is temporarily unavailable. Please try again later.' })
    }

    const existing = await findUserByEmail(email.toLowerCase())
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' })
    }

    const hashed = await bcrypt.hash(password, 12)
    const user = {
      id: uuidv4(),
      email: email.toLowerCase(),
      name: name || email.split('@')[0],
      password: hashed,
      role: 'viewer',
      plan: 'free',
      avatar: null,
      bio: bio || '',
      email_verified: false,
    }
    await createUser(user)

    broadcastFeed({ type: 'admin:user.signup', userId: user.id, email: user.email, name: user.name, isCreatorApply: true, timestamp: Date.now() })

    // Create pending creator application
    await pool.query(
      `INSERT INTO creator_applications (user_id, handle, bio, status)
       VALUES ($1, $2, $3, 'pending')`,
      [user.id, platformName || '', bio || '']
    )

    broadcastFeed({ 
      type: 'admin:creator.application.submitted', 
      userId: user.id, 
      email: user.email, 
      name: user.name, 
      platformName: platformName || '',
      bio: bio || '',
      timestamp: Date.now() 
    })

    const code = generateCode()
    await saveVerificationCode(user.id, code)

    try {
      await sendVerificationCode(user.email, code, user.name)
    } catch (emailErr) {
      console.error('[auth] Failed to send verification email:', emailErr.message)
    }

    console.log(`[auth] signup/creator-apply: ${user.email} (verification code sent)`)
    res.json({ success: true, message: 'Verification code sent to email', userId: user.id })
  } catch (err) {
    console.error('[auth] signup/creator-apply error:', err.message)
    res.status(500).json({ error: 'Registration failed' })
  }
}

// ============ LOGIN (Centralized) ============

export async function login(req, res) {
  try {
    const { email, password, deviceId, lat, lng, accuracy } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    // Rate limit check
    const rateLimit = await checkRateLimit(email.toLowerCase(), 'login')
    if (rateLimit.blocked) {
      return res.status(429).json({
        error: 'Too many login attempts. Please try again later.',
        retryAfter: rateLimit.retryAfter
      })
    }

    const user = await findUserByEmail(email.toLowerCase())
    if (!user) {
      // Constant-time: run bcrypt even for non-existent users
      await bcrypt.compare(password, '$2a$10$invalidhashplaceholder0000000000000000000000')
      console.warn(`[auth] login failed: no account for ${email}`)
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    // Check account lockout
    const locked = await isAccountLocked(user.id)
    if (locked) {
      return res.status(423).json({ error: 'Account is temporarily locked. Please try again later.' })
    }

    if (!user.password) {
      console.warn(`[auth] login failed: ${email} uses Google Sign-In`)
      return res.status(401).json({ error: 'This account uses Google Sign-In. Please sign in with Google.' })
    }

    const match = await bcrypt.compare(password, user.password)
    if (!match) {
      await recordRateLimitAttempt(email.toLowerCase(), 'login')
      await incrementFailedLoginAttempts(user.id)
      console.warn(`[auth] login failed: bad password for ${email}`)
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    // Check banned/suspended
    if (user.role === 'banned') {
      console.warn(`[auth] login blocked: banned account ${email}`)
      return res.status(403).json({ error: 'Account banned', banned: true, reason: user.banned_reason || undefined })
    }
    if (user.suspended_until && new Date(user.suspended_until).getTime() > Date.now()) {
      console.warn(`[auth] login blocked: suspended account ${email}`)
      return res.status(403).json({
        error: 'Account suspended',
        suspended: true,
        reason: user.suspension_reason || undefined,
        suspendedUntil: user.suspended_until,
      })
    }

    if (!user.email_verified) {
      console.warn(`[auth] login blocked: unverified email ${email}`)
      return res.json({ success: true, needsVerification: true, userId: user.id, error: 'Email not verified' })
    }

    const ip = req.ip || req.connection?.remoteAddress
    const ua = req.headers['user-agent'] || ''
    const devId = deviceId || fingerprint(`${ip}|${ua}`)

    const reason = await needsLoginVerification(user, { devId, ip, lat, lng })
    if (reason) {
      if (!isEmailConfigured()) {
        console.warn(`[auth] Login verification required (${reason}) but email is not configured; allowing sign-in.`)
        return res.status(503).json({ error: 'Security verification is temporarily unavailable. Please try again later.' })
      }
      const code = generateCode()
      await saveVerificationCode(user.id, code)
      try {
        await sendLoginVerificationCode(user.email, user.name, code, reason)
      } catch (err) {
        console.error('[auth] Failed to send login verification email:', err.message)
      }
      return res.json({ success: true, needsLoginVerification: true, userId: user.id, reason })
    }

    await recordLogin(req, user, devId, lat, lng, accuracy)

    // Reset failed attempts on successful login
    await resetFailedLoginAttempts(user.id)
    await clearRateLimitAttempts(email.toLowerCase(), 'login')

    // Generate tokens
    const accessToken = signAccessToken(user)
    const refreshToken = signRefreshToken(user.id)
    const refreshTokenHash = hashToken(refreshToken)
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
    await createRefreshToken(user.id, refreshTokenHash, refreshExpiresAt)

    setRefreshCookie(res, refreshToken)

    const redirectionUrl = getRedirectionUrl(user.role)
    const safe = { ...user, password: undefined }
    console.log(`[auth] login success: ${email} (${user.role}) -> ${redirectionUrl}`)
    res.json({ success: true, token: accessToken, user: safe, redirectionUrl })
  } catch (err) {
    console.error('[auth] login error:', err.message)
    // Dev fallback: when DB unavailable (ECONNREFUSED / DATABASE_URL not set), allow any login
    // so UI testing isn't blocked by missing Postgres. Preserves dev@novaflix.local as admin.
    const isDbDown = /ECONNREFUSED|Database unavailable|connect ECONNREFUSED|DATABASE_URL/i.test(err.message || '')
    if (isDbDown) {
      const reqEmail = (req.body?.email || req.body?.username || '').toLowerCase()
      const reqPass = req.body?.password || ''
      const devEmail = (process.env.DEV_LOGIN_EMAIL || 'dev@novaflix.local').toLowerCase()
      const devPass = process.env.DEV_LOGIN_PASSWORD || 'NovaflixDev123!'
      const isDev = reqEmail === devEmail && reqPass === devPass
      // In no-DB mode, accept any email with password >=8 chars as viewer, dev creds as admin
      if (reqEmail && reqPass && reqPass.length >= 8) {
        const fallbackUser = isDev
          ? { id: 'dev-user-12345678-1234-1234-1234-123456789abc', email: devEmail, role: 'admin', plan: 'premium', name: 'Dev Admin' }
          : { id: 'dev-user-' + reqEmail.replace(/[^a-z0-9]/g, '-'), email: reqEmail, role: 'viewer', plan: 'premium', name: reqEmail.split('@')[0] }
        const accessToken = signAccessToken(fallbackUser)
        const refreshToken = signRefreshToken(fallbackUser.id)
        try { await createRefreshToken(fallbackUser.id, hashToken(refreshToken), new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000)) } catch {}
        try { setRefreshCookie(res, refreshToken) } catch {}
        console.log(`[auth] dev fallback login success: ${reqEmail} (isDev=${isDev})`)
        return res.json({ success: true, token: accessToken, user: fallbackUser, redirectionUrl: getRedirectionUrl(fallbackUser.role) })
      }
    }
    res.status(500).json({ error: 'Login failed' })
  }
}

// ============ REFRESH TOKEN ============

export async function refreshAccessToken(req, res) {
  try {
    const refreshToken = req.cookies?.refresh_token
    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token required' })
    }

    let payload
    try {
      payload = jwt.verify(refreshToken, JWT_SECRET)
    } catch {
      return res.status(401).json({ error: 'Invalid or expired refresh token' })
    }

    if (payload.type !== 'refresh') {
      return res.status(401).json({ error: 'Invalid token type' })
    }

    const tokenHash = hashToken(refreshToken)
    const stored = await findRefreshToken(tokenHash)
    if (!stored) {
      return res.status(401).json({ error: 'Refresh token not found' })
    }

    // Delete old refresh token
    await deleteRefreshToken(tokenHash)

    // Generate new tokens
    const user = await findUserById(payload.id)
    if (!user || user.role === 'banned') {
      return res.status(401).json({ error: 'User not found or banned' })
    }

    const newAccessToken = signAccessToken(user)
    const newRefreshToken = signRefreshToken(user.id)
    const newRefreshHash = hashToken(newRefreshToken)
    const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
    await createRefreshToken(user.id, newRefreshHash, newExpiresAt)

    setRefreshCookie(res, newRefreshToken)

    res.json({ success: true, token: newAccessToken })
  } catch (err) {
    console.error('[auth] refresh error:', err.message)
    res.status(500).json({ error: 'Token refresh failed' })
  }
}

// ============ LOGOUT ============

export async function logout(req, res) {
  try {
    // Add current access token to blocklist
    const header = req.headers.authorization
    if (header && header.startsWith('Bearer ')) {
      const token = header.split(' ')[1]
      try {
        const decoded = jwt.verify(token, JWT_SECRET)
        const tokenHash = hashToken(token)
        const expiresAt = new Date(decoded.exp * 1000)
        await addToBlocklist(tokenHash, expiresAt)
      } catch {
        // Token may already be expired, that's fine
      }
    }

    // Delete all refresh tokens for this user
    if (req.user?.id) {
      await deleteAllRefreshTokens(req.user.id)
    }

    // Clear refresh cookie
    res.clearCookie('refresh_token', { path: '/api/auth' })

    console.log(`[auth] logout: ${req.user?.email || 'unknown'}`)
    res.json({ success: true, message: 'Logged out successfully' })
  } catch (err) {
    console.error('[auth] logout error:', err.message)
    res.status(500).json({ error: 'Logout failed' })
  }
}

// ============ GET ME ============

export async function getMe(req, res) {
  const user = await findUserById(req.userId)
  if (!user) return res.status(404).json({ error: 'User not found' })
  const safe = { ...user, password: undefined }
  let accountStatus = 'active'
  if (user.role === 'banned') accountStatus = 'banned'
  else if (user.suspended_until && new Date(user.suspended_until).getTime() > Date.now()) accountStatus = 'suspended'
  safe.accountStatus = accountStatus
  safe.accountReason = accountStatus === 'suspended' ? (user.suspension_reason || '') : (user.banned_reason || '')
  res.json({ success: true, user: safe })
}

// ============ EMAIL VERIFICATION ============

export async function verifyEmail(req, res) {
  try {
    const { userId, code } = req.body
    if (!userId || !code) return res.status(400).json({ error: 'User ID and code required' })

    const valid = await verifyCode(userId, code)
    if (!valid) {
      console.warn(`[auth] verify failed: bad/expired code for user ${userId?.slice?.(0, 8)}`)
      return res.status(400).json({ error: 'Invalid or expired verification code' })
    }

    await updateUser(userId, { email_verified: true })
    const user = await findUserById(userId)

    try {
      await sendWelcomeEmail(user.email, user.name)
    } catch {}

    const accessToken = signAccessToken(user)
    const refreshToken = signRefreshToken(user.id)
    const refreshTokenHash = hashToken(refreshToken)
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
    await createRefreshToken(user.id, refreshTokenHash, refreshExpiresAt)

    setRefreshCookie(res, refreshToken)

    const redirectionUrl = getRedirectionUrl(user.role)
    const safe = { ...user, password: undefined }
    console.log(`[auth] verify success: ${user.email}`)
    res.json({ success: true, token: accessToken, user: safe, redirectionUrl, message: 'Email verified successfully' })
  } catch (err) {
    console.error('[auth] verify error:', err.message)
    res.status(500).json({ error: 'Verification failed' })
  }
}

export async function resendVerification(req, res) {
  try {
    const { userId } = req.body
    if (!userId) return res.status(400).json({ error: 'User ID required' })

    const user = await findUserById(userId)
    if (!user) return res.status(404).json({ error: 'User not found' })

    const code = generateCode()
    await saveVerificationCode(user.id, code)
    try {
      await sendVerificationCode(user.email, code, user.name)
    } catch {}

    res.json({ success: true, message: 'Verification code resent' })
  } catch (err) {
    console.error('[auth] resend error:', err.message)
    res.status(500).json({ error: 'Failed to resend verification' })
  }
}

// ============ LOGIN VERIFY ============

export async function loginVerify(req, res) {
  try {
    const { userId, code, deviceId, lat, lng, accuracy } = req.body
    if (!userId || !code) return res.status(400).json({ error: 'User ID and code required' })

    const valid = await verifyCode(userId, code)
    if (!valid) return res.status(400).json({ error: 'Invalid or expired verification code' })

    const user = await findUserById(userId)
    if (!user) return res.status(404).json({ error: 'User not found' })

    if (user.role === 'banned') {
      return res.status(403).json({ error: 'Account banned', banned: true, reason: user.banned_reason || undefined })
    }
    if (user.suspended_until && new Date(user.suspended_until).getTime() > Date.now()) {
      return res.status(403).json({ error: 'Account suspended', suspended: true, reason: user.suspension_reason || undefined, suspendedUntil: user.suspended_until })
    }

    await recordLogin(req, user, deviceId, lat, lng, accuracy)

    const accessToken = signAccessToken(user)
    const refreshToken = signRefreshToken(user.id)
    const refreshTokenHash = hashToken(refreshToken)
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
    await createRefreshToken(user.id, refreshTokenHash, refreshExpiresAt)

    setRefreshCookie(res, refreshToken)

    const redirectionUrl = getRedirectionUrl(user.role)
    const safe = { ...user, password: undefined }
    res.json({ success: true, token: accessToken, user: safe, redirectionUrl })
  } catch (err) {
    console.error('[auth] loginVerify error:', err.message)
    res.status(500).json({ error: 'Verification failed' })
  }
}

// ============ FORGOT / RESET PASSWORD ============

export async function forgotPassword(req, res) {
  try {
    const { email } = req.body
    if (!email) return res.status(400).json({ error: 'Email required' })

    const rateLimit = await checkRateLimit(email.toLowerCase(), 'forgot-password', 3)
    if (rateLimit.blocked) {
      return res.status(429).json({ error: 'Too many requests. Please try again later.', retryAfter: rateLimit.retryAfter })
    }

    if (!isEmailConfigured()) {
      return res.status(503).json({ error: 'Password reset is temporarily unavailable. Please try again later.' })
    }

    const user = await findUserByEmail(email.toLowerCase())
    if (user) {
      const token = jwt.sign({ id: user.id, role: user.role, purpose: 'password-reset' }, JWT_SECRET, { expiresIn: '30m' })
      const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/reset-password?token=${token}`
      try {
        await sendPasswordResetEmail(user.email, user.name, resetUrl)
      } catch (err) {
        console.error('[auth] Failed to send password reset email:', err.message)
      }
    }

    res.json({ success: true, message: 'If an account exists for that email, a reset link has been sent.' })
  } catch (err) {
    console.error('[auth] forgotPassword error:', err.message)
    res.status(500).json({ error: 'Password reset failed' })
  }
}

export async function resetPassword(req, res) {
  try {
    const { token, password } = req.body
    if (!token || !password) return res.status(400).json({ error: 'Token and new password required' })
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' })

    let payload
    try {
      payload = jwt.verify(token, JWT_SECRET)
    } catch {
      return res.status(400).json({ error: 'Invalid or expired reset link' })
    }
    if (payload.purpose !== 'password-reset' || !payload.id) {
      return res.status(400).json({ error: 'Invalid or expired reset link' })
    }

    const user = await findUserById(payload.id)
    if (!user) return res.status(404).json({ error: 'User not found' })

    const hashed = await bcrypt.hash(password, 10)
    const updates = { password: hashed, password_changed_at: new Date().toISOString() }
    if (!user.email_verified) updates.email_verified = true
    await updateUser(user.id, updates)

    // Invalidate all existing refresh tokens on password change
    await deleteAllRefreshTokens(user.id)

    res.json({ success: true, message: 'Password updated. You can now sign in.' })
  } catch (err) {
    console.error('[auth] resetPassword error:', err.message)
    res.status(500).json({ error: 'Password reset failed' })
  }
}

// ============ GOOGLE OAUTH ============

export async function socialProviders(req, res) {
  res.json({ providers: listProviders() })
}

export async function startSocialAuth(req, res) {
  const provider = (req.params.provider || '').toLowerCase()
  if (!isProviderConfigured(provider)) {
    return res.status(503).json({ error: `${provider} Sign-In is not configured. Please try again later.` })
  }

  const redirectPath = sanitizeRedirectPath(req.query.redirect)
  const claimId = (req.query.claimId || '').toString()
  const built = buildAuthorizeUrl(req, provider, redirectPath)

  if (!built) {
    return res.status(400).json({ error: 'Unsupported provider.' })
  }

  res.cookie('social_oauth_state', built.state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.headers['x-forwarded-proto'] === 'https' || req.secure,
    maxAge: 10 * 60 * 1000,
    path: '/',
  })
  if (built.verifier) {
    res.cookie('social_oauth_verifier', built.verifier, {
      httpOnly: true,
      sameSite: 'lax',
      secure: req.headers['x-forwarded-proto'] === 'https' || req.secure,
      maxAge: 10 * 60 * 1000,
      path: '/',
    })
  }
  res.cookie('social_oauth_claim', claimId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.headers['x-forwarded-proto'] === 'https' || req.secure,
    maxAge: 10 * 60 * 1000,
    path: '/',
  })

  res.redirect(built.url)
}

export async function socialCallback(req, res) {
  const appUrl = process.env.APP_URL || 'http://localhost:3000'
  const provider = (req.params.provider || '').toLowerCase()
  const fail = (msg) => res.redirect(`${appUrl}/oauth/callback?error=${encodeURIComponent(msg)}`)

  try {
    const { code, state, error } = req.query
    if (error) return fail(`${provider} Sign-In was cancelled or failed.`)

    const cookieState = parseCookies(req).social_oauth_state
    if (!code || !state || !cookieState || state !== cookieState) {
      return fail('Invalid sign-in request. Please try again.')
    }

    let statePayload
    try {
      statePayload = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'))
    } catch {
      return fail('Sign-in request expired. Please try again.')
    }
    if (statePayload.provider && statePayload.provider !== provider) {
      return fail('Sign-in provider mismatch. Please try again.')
    }

    const verifier = parseCookies(req).social_oauth_verifier || null
    let tokens
    try {
      tokens = await exchangeCode(req, provider, code, verifier)
    } catch (err) {
      console.error(`[auth] ${provider} token exchange error:`, err.message)
      return fail(`${provider} Sign-In failed. Please try again.`)
    }
    if (!tokens || (!tokens.access_token && !tokens.id_token)) {
      return fail(`Unable to verify your ${provider} account.`)
    }

    const profile = await fetchProfile(req, provider, tokens)
    if (!profile || !profile.id) return fail(`Unable to read your ${provider} account.`)

    let user = await findUserBySocialId(provider, profile.id)
    let isNew = false

    const socialIdCol = socialIdColumn(provider)
    if (!user) {
      const existing = profile.email ? await findUserByEmail(profile.email) : null
      if (existing) {
        const patch = { email_verified: true }
        if (socialIdCol) patch[socialIdCol] = profile.id
        if (!existing.avatar && profile.avatar) patch.avatar = profile.avatar
        await updateUser(existing.id, patch)
        user = await findUserById(existing.id)
      } else {
        isNew = true
        user = {
          id: uuidv4(),
          email: profile.email || `${provider}_${profile.id}@social.local`,
          password: null,
          name: profile.name || profile.handle || `${provider} user`,
          role: 'viewer',
          plan: 'free',
          avatar: profile.avatar || null,
          bio: '',
          email_verified: true,
          google_id: provider === 'google' ? profile.id : null,
        }
        user[socialIdCol] = profile.id
        await createUser(user)
      }
    }

    if (user.role === 'banned') return fail('Account banned')
    if (user.suspended_until && new Date(user.suspended_until).getTime() > Date.now()) return fail('Account suspended')

    await recordLogin(req, user, undefined, undefined, undefined, undefined)

    const accessToken = signAccessToken(user)
    const refreshToken = signRefreshToken(user.id)
    const refreshTokenHash = hashToken(refreshToken)
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
    await createRefreshToken(user.id, refreshTokenHash, refreshExpiresAt)

    const statePath = sanitizeRedirectPath(statePayload.path)
    const claimId = parseCookies(req).social_oauth_claim || statePayload.claimId || ''

    res.clearCookie('social_oauth_state')
    res.clearCookie('social_oauth_claim')
    res.clearCookie('social_oauth_verifier')

    const redirectPath = claimId
      ? `/creator/claim/status/${encodeURIComponent(claimId)}`
      : (statePath || getRedirectionUrl(user.role))

    const finalRedirect = `${appUrl}/oauth/callback?token=${encodeURIComponent(accessToken)}&redirect=${encodeURIComponent(redirectPath)}&new=${isNew ? 1 : 0}&provider=${encodeURIComponent(provider)}`
    res.redirect(finalRedirect)
  } catch (err) {
    console.error(`[auth] ${provider} OAuth callback error:`, err.message)
    fail(`${provider} Sign-In failed. Please try again.`)
  }
}

export async function startGoogleAuth(req, res) {
  req.params = { ...req.params, provider: 'google' }
  return startSocialAuth(req, res)
}

export async function googleCallback(req, res) {
  req.params = { ...req.params, provider: 'google' }
  return socialCallback(req, res)
}
