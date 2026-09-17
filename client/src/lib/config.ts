/// <reference types="vite/client" />

const rawApi = (import.meta.env.VITE_API_BASE as string | undefined) || ''

// Production fallback: no Render. The local NovaFlix engine is the backend,
// reachable through the Cloudflare tunnel (see client/vercel.json /api rewrite).
// This base INCLUDES the /api path: server routes (auth, admin, affiliate,
// stats, …) are mounted under /api, and client modules call
// `${API_BASE}/auth/…` etc. WS connects straight to the same tunnel origin.
const PROD_FALLBACK = import.meta.env.PROD ? 'https://parcel-journey-unexpected-semester.trycloudflare.com/api' : ''

export const effectiveApi: string = (rawApi || PROD_FALLBACK).replace(/\/+$/, '')
export const API_BASE: string = effectiveApi || '/api'
export const WS_ORIGIN: string = effectiveApi ? new URL(effectiveApi).origin : ''
