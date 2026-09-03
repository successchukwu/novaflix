import axios from 'axios'
import crypto from 'crypto'

// Registry of supported social OAuth providers for Claim Profile verification
// and social login. Each provider exposes:
//   id            - internal provider key
//   name          - display name
//   clientIdEnv   - env var for client id/key
//   clientSecretEnv - env var for client secret
//   authorizeUrl  - OAuth authorization endpoint
//   tokenUrl      - token exchange endpoint
//   profileUrl    - profile endpoint (after token)
//   scope         - scopes to request
//   mapProfile(payload, tokens) -> { id, email, name, avatar, handle, profileUrl }
//   tokenParams / extraHeaders - optional per-provider token call options
//   usesPkce      - whether provider requires PKCE (state_challenge)
const PROVIDERS = {
  google: {
    id: 'google',
    name: 'Google',
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_CLIENT_SECRET',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile',
    tokenGrantType: 'authorization_code',
    usesIdToken: true,
    mapProfile: (payload) => ({
      id: String(payload.sub),
      email: payload.email || '',
      name: payload.name || payload.given_name || '',
      avatar: payload.picture || null,
      handle: payload.email || '',
      profileUrl: '',
    }),
  },
  facebook: {
    id: 'facebook',
    name: 'Facebook',
    clientIdEnv: 'FACEBOOK_CLIENT_ID',
    clientSecretEnv: 'FACEBOOK_CLIENT_SECRET',
    authorizeUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v19.0/oauth/access_token',
    scope: 'email,public_profile',
    tokenUsesParams: true,
    profileUrl: 'https://graph.facebook.com/v19.0/me',
    profileFields: 'id,name,email,picture.width(400)',
    mapProfile: (payload, tokens) => ({
      id: String(payload.id),
      email: payload.email || '',
      name: payload.name || '',
      avatar: payload.picture?.data?.url || null,
      handle: payload.id || '',
      profileUrl: `https://facebook.com/${payload.id}`,
    }),
  },
  instagram: {
    id: 'instagram',
    name: 'Instagram',
    clientIdEnv: 'INSTAGRAM_CLIENT_ID',
    clientSecretEnv: 'INSTAGRAM_CLIENT_SECRET',
    authorizeUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v19.0/oauth/access_token',
    scope: 'instagram_business_basic,instagram_business_manage_messages,email',
    tokenUsesParams: true,
    usesIg: true,
    mapProfile: async (tokens) => {
      // Instagram identity lives on the connected Facebook account; use its id
      const me = await axios.get(`https://graph.facebook.com/v19.0/me?fields=id,name,email&access_token=${tokens.access_token}`)
        .then(r => r.data).catch(() => ({}))
      return {
        id: me.id ? `ig:${me.id}` : (tokens.user_id ? `ig:${tokens.user_id}` : 'ig:unknown'),
        email: me.email || '',
        name: me.name || '',
        avatar: '',
        handle: me.id || tokens.user_id || '',
        profileUrl: me.id ? `https://instagram.com/${me.id}` : '',
      }
    },
  },
  tiktok: {
    id: 'tiktok',
    name: 'TikTok',
    clientIdEnv: 'TIKTOK_CLIENT_KEY',
    clientSecretEnv: 'TIKTOK_CLIENT_SECRET',
    authorizeUrl: 'https://www.tiktok.com/v2/auth/authorize/',
    tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
    scope: 'user.info.basic',
    tokenGrantType: 'authorization_code',
    tokenUsesParams: true,
    tiktokTokenHeaders: true,
    profileUrl: 'https://open.tiktokapis.com/v2/user/info/',
    mapProfile: (payload) => {
      const u = payload?.data?.user || {}
      return {
        id: String(u.open_id || ''),
        email: u.email || '',
        name: u.display_name || u.username || '',
        avatar: u.avatar_url || null,
        handle: u.username || u.display_name || '',
        profileUrl: u.profile_deep_link || (u.username ? `https://tiktok.com/@${u.username}` : ''),
      }
    },
  },
  twitter: {
    id: 'twitter',
    name: 'Twitter / X',
    clientIdEnv: 'TWITTER_CLIENT_ID',
    clientSecretEnv: 'TWITTER_CLIENT_SECRET',
    authorizeUrl: 'https://twitter.com/i/oauth2/authorize',
    tokenUrl: 'https://api.twitter.com/2/oauth2/token',
    scope: 'users.read tweet.read offline.access',
    tokenUsesParams: true,
    usesPkce: true,
    profileUrl: 'https://api.twitter.com/2/users/me',
    profileParams: 'user.fields=profile_image_url,username,name',
    mapProfile: (payload) => {
      const u = payload?.data || {}
      return {
        id: String(u.id || ''),
        email: u.email || '',
        name: u.name || '',
        avatar: u.profile_image_url || null,
        handle: u.username || '',
        profileUrl: u.username ? `https://x.com/${u.username}` : '',
      }
    },
  },
  youtube: {
    id: 'youtube',
    name: 'YouTube',
    clientIdEnv: 'YOUTUBE_CLIENT_ID',
    clientSecretEnv: 'YOUTUBE_CLIENT_SECRET',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile https://www.googleapis.com/auth/youtube.readonly',
    tokenGrantType: 'authorization_code',
    usesIdToken: true,
    profileUrl: 'https://www.googleapis.com/youtube/v3/channels',
    profileParams: 'part=snippet,statistics&mine=true',
    mapProfile: async (payload, tokens) => {
      let channel = {}
      if (tokens?.access_token) {
        channel = await axios.get('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        }).then(r => r.data?.items?.[0] || {}).catch(() => ({}))
      }
      const snippet = channel?.snippet || {}
      return {
        id: String(channel?.id || payload.sub || ''),
        email: payload.email || '',
        name: snippet.title || payload.name || '',
        avatar: snippet.thumbnails?.default?.url || payload.picture || null,
        handle: snippet.customUrl || payload.email || '',
        profileUrl: snippet.customUrl ? `https://youtube.com/${snippet.customUrl}` : '',
      }
    },
  },
  twitch: {
    id: 'twitch',
    name: 'Twitch',
    clientIdEnv: 'TWITCH_CLIENT_ID',
    clientSecretEnv: 'TWITCH_CLIENT_SECRET',
    authorizeUrl: 'https://id.twitch.tv/oauth2/authorize',
    tokenUrl: 'https://id.twitch.tv/oauth2/token',
    scope: 'user:read:email',
    tokenUsesParams: true,
    twitchTokenHeaders: true,
    profileUrl: 'https://api.twitch.tv/helix/users',
    mapProfile: (payload) => {
      const u = payload?.data?.[0] || {}
      return {
        id: String(u.id || ''),
        email: u.email || '',
        name: u.display_name || u.login || '',
        avatar: u.profile_image_url || null,
        handle: u.login || '',
        profileUrl: u.login ? `https://twitch.tv/${u.login}` : '',
      }
    },
  },
  discord: {
    id: 'discord',
    name: 'Discord',
    clientIdEnv: 'DISCORD_CLIENT_ID',
    clientSecretEnv: 'DISCORD_CLIENT_SECRET',
    authorizeUrl: 'https://discord.com/oauth2/authorize',
    tokenUrl: 'https://discord.com/api/oauth2/token',
    scope: 'identify email',
    tokenUsesParams: true,
    profileUrl: 'https://discord.com/api/users/@me',
    mapProfile: (payload) => ({
      id: String(payload.id || ''),
      email: payload.email || '',
      name: payload.global_name || payload.username || '',
      avatar: payload.avatar ? `https://cdn.discordapp.com/avatars/${payload.id}/${payload.avatar}.png` : null,
      handle: payload.username || '',
      profileUrl: '',
    }),
  },
}

export function getProvider(name) {
  const key = (name || '').toLowerCase()
  return PROVIDERS[key] || null
}

export function listProviders() {
  return Object.values(PROVIDERS).map(p => ({
    id: p.id,
    name: p.name,
    configured: !!(process.env[p.clientIdEnv] && process.env[p.clientSecretEnv]),
  }))
}

export function isProviderConfigured(name) {
  const p = getProvider(name)
  if (!p) return false
  return !!(process.env[p.clientIdEnv] && process.env[p.clientSecretEnv])
}

export function buildAuthorizeUrl(req, provider, redirectPath) {
  const p = getProvider(provider)
  if (!p) return null

  const redirectUri = `${getRedirectBase(req)}/api/auth/social/${p.id}/callback`
  const statePayload = { purpose: 'social-oauth', provider: p.id, path: redirectPath || '/home', ts: Date.now() }
  const state = jwtState(statePayload)

  const params = new URLSearchParams({
    client_id: process.env[p.clientIdEnv],
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: p.scope,
    state,
  })

  if (p.usesPkce) {
    const verifier = crypto.randomBytes(32).toString('base64url')
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
    params.set('code_challenge', challenge)
    params.set('code_challenge_method', 'S256')
    params.set('code_verifier', verifier)
  }
  if (p.id === 'google' || p.id === 'youtube') {
    params.set('access_type', 'online')
    params.set('prompt', 'select_account')
  }
  if (p.id === 'tiktok') params.set('response_type', 'code') // explicit

  return { url: `${p.authorizeUrl}?${params.toString()}`, redirectUri, state, verifier: params.get('code_verifier') }
}

export async function exchangeCode(req, provider, code, verifier) {
  const p = getProvider(provider)
  if (!p) return null

  const redirectUri = `${getRedirectBase(req)}/api/auth/social/${p.id}/callback`
  const clientId = process.env[p.clientIdEnv]
  const clientSecret = process.env[p.clientSecretEnv]

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: p.tokenGrantType || 'authorization_code',
  })
  if (verifier) body.set('code_verifier', verifier)

  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' }
  if (p.twitchTokenHeaders) headers['Client-Id'] = clientId
  if (p.tiktokTokenHeaders) body.set('client_key', clientId) // tiktok uses client_key in body

  const res = await axios.post(p.tokenUrl, p.tokenUsesParams ? body.toString() : body, { headers, timeout: 15000 })
  return res.data
}

export async function fetchProfile(req, provider, tokens) {
  const p = getProvider(provider)
  if (!p) return null

  // Providers that rely on the ID token (Google/YouTube)
  if (p.usesIdToken) {
    if (tokens.id_token) {
      const payload = jwtDecode(tokens.id_token)
      if (!payload) return null
      return await p.mapProfile(payload, tokens)
    }
    // Fall through to access-token profile fetch for providers that need it
  }

  // Instagram resolves via the connected Facebook account
  if (p.usesIg) {
    return await p.mapProfile(tokens)
  }

  const accessToken = tokens.access_token
  const headers = {}
  if (p.id === 'discord') headers.Authorization = `Bearer ${accessToken}`
  if (p.id === 'tiktok') headers.Authorization = `Bearer ${accessToken}`
  if (p.id === 'twitter') headers.Authorization = `Bearer ${accessToken}`
  if (p.id === 'twitch') {
    headers.Authorization = `Bearer ${accessToken}`
    headers['Client-Id'] = process.env[p.clientIdEnv]
  }
  if (p.id === 'youtube') headers.Authorization = `Bearer ${accessToken}`
  if (p.id === 'facebook') {
    const data = await axios.get(`${p.profileUrl}?fields=${p.profileFields}&access_token=${accessToken}`, { timeout: 15000 }).then(r => r.data).catch(() => null)
    return data ? await p.mapProfile(data, tokens) : null
  }

  const url = `${p.profileUrl}${p.profileParams ? `?${p.profileParams}` : ''}`
  const data = await axios.get(url, { headers, timeout: 15000 }).then(r => r.data).catch(() => null)
  if (!data) return null
  return await p.mapProfile(data, tokens)
}

function jwtDecode(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = Buffer.from(base64, 'base64').toString('utf-8')
    return JSON.parse(json)
  } catch {
    return null
  }
}

function jwtState(payload) {
  // lightweight base64url state (not signed — callback verifies against cookie)
  return Buffer.from(JSON.stringify(payload)).toString('base64url')
}

function getRedirectBase(req) {
  return process.env.SOCIAL_OAUTH_REDIRECT_BASE || `${req.protocol}://${req.get('host')}`
}

export default { getProvider, listProviders, isProviderConfigured, buildAuthorizeUrl, exchangeCode, fetchProfile }
