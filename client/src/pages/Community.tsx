import { useEffect, useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Icon from '../components/ui/Icon'
import { useAuth } from '../lib/AuthContext'
import { WS_ORIGIN } from '../lib/config'
import {
  getCommunities, getCommunity, createCommunity, joinCommunity, leaveCommunity,
  getMyCommunities, getCommunityMembers, getMyEggs,
} from '../lib/auth'

interface Community {
  id: string
  name: string
  description: string | null
  avatar: string | null
  creator_id: string
  creator_name: string | null
  creator_avatar?: string | null
  member_count: number
}

interface Msg {
  id: string
  userId: string
  name: string
  message: string
  timestamp: number
}

function clock(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/** Legacy deep links /community/:id → /community?id=:id */
export function CommunityRedirect() {
  const { id } = useParams<{ id: string }>()
  return <Navigate to={`/community?id=${id}`} replace />
}

export default function Community() {
  const { user, isCreator } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [communities, setCommunities] = useState<Community[]>([])
  const [myIds, setMyIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [creating, setCreating] = useState(false)
  const [listError, setListError] = useState<string | null>(null)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [community, setCommunity] = useState<Community | null>(null)
  const [isMember, setIsMember] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)

  const [messages, setMessages] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [wsError, setWsError] = useState<string | null>(null)
  const [onlineCount, setOnlineCount] = useState(0)
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map())

  const [showKeys, setShowKeys] = useState(false)
  const [myKeys, setMyKeys] = useState<any[]>([])
  const [myKeysLoading, setMyKeysLoading] = useState(false)

  const [showMembers, setShowMembers] = useState(false)
  const [members, setMembers] = useState<any[]>([])
  const [membersLoading, setMembersLoading] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const selectedIdRef = useRef<string | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const userRef = useRef(user)
  useEffect(() => { userRef.current = user }, [user])

  // ---- Load community lists ----
  const loadLists = useCallback(async () => {
    setListError(null)
    const [allRes, mineRes] = await Promise.all([
      getCommunities(),
      getMyCommunities(),
    ])
    if (allRes.success) setCommunities(allRes.communities || [])
    if (mineRes.success) setMyIds(new Set((mineRes.communities || []).map((c: any) => c.id)))
    if (!allRes.success) setListError(allRes.error || mineRes.error || 'Failed to load communities')
    setLoading(false)
    return allRes.communities || []
  }, [])

  // Joined communities float to the top of the sidebar
  const ordered = [
    ...communities.filter(c => myIds.has(c.id)),
    ...communities.filter(c => !myIds.has(c.id)),
  ]
  const q = search.trim().toLowerCase()
  const visible = q
    ? ordered.filter(c => c.name.toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q))
    : ordered

  // ---- Initial load (+ deep-link ?id= or auto-select first) ----
  useEffect(() => {
    loadLists().then(list => {
      const fromUrl = searchParams.get('id')
      const target = (fromUrl && list.find((c: Community) => c.id === fromUrl)) || list[0] || null
      if (target) setSelectedId(target.id)
    }).catch(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep a ref in sync so onclose can reconnect to the current room
  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId])

  // ---- WebSocket: join the selected community's chat room ----
  const connect = useCallback((communityId: string) => {
    const token = localStorage.getItem('novaflix-token') || ''
    if (!token) return
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = WS_ORIGIN ? new URL(WS_ORIGIN).host : window.location.host
    try { wsRef.current?.close() } catch {}
    if (reconnectTimeoutRef.current) { clearTimeout(reconnectTimeoutRef.current); reconnectTimeoutRef.current = null }
    setWsError(null)
    const ws = new WebSocket(`${protocol}//${host}/ws?token=${encodeURIComponent(token)}`)
    ws.onopen = () => {
      reconnectAttemptsRef.current = 0
      ws.send(JSON.stringify({ type: 'community-join', payload: { communityId }, user: { name: userRef.current?.name || 'Anonymous' } }))
    }
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'chat-history') {
          setMessages(msg.messages || [])
        } else if (msg.type === 'community-joined') {
          reconnectAttemptsRef.current = 0
          setOnlineCount(msg.users?.length || 0)
        } else if (msg.type === 'user-joined') {
          setOnlineCount(msg.users?.length || 0)
        } else if (msg.type === 'user-left') {
          setOnlineCount(msg.users?.length || 0)
          setTypingUsers(prev => {
            if (!prev.has(msg.userId)) return prev
            const n = new Map(prev); n.delete(msg.userId); return n
          })
        } else if (msg.type === 'typing') {
          if (msg.userId === user?.id) return
          setTypingUsers(prev => {
            const n = new Map(prev)
            if (msg.isTyping) n.set(msg.userId, msg.name || 'Someone')
            else n.delete(msg.userId)
            return n
          })
          if (msg.isTyping) {
            setTimeout(() => {
              setTypingUsers(prev => {
                if (!prev.has(msg.userId)) return prev
                const n = new Map(prev); n.delete(msg.userId); return n
              })
            }, 4000)
          }
        } else if (msg.type === 'chat') {
          setTypingUsers(prev => {
            if (!prev.has(msg.userId)) return prev
            const n = new Map(prev); n.delete(msg.userId); return n
          })
          setMessages(prev => [...prev, {
            id: String(Date.now()) + Math.random().toString(36).slice(2, 6),
            userId: msg.userId,
            name: msg.name || 'Anonymous',
            message: msg.message,
            timestamp: msg.timestamp || Date.now(),
          }])
        } else if (msg.type === 'error') {
          setWsError(msg.message || 'Chat unavailable')
          setOnlineCount(0)
        }
      } catch {}
    }
    ws.onclose = (event) => {
      wsRef.current = null
      if (event.wasClean) return
      const stillWanted = selectedIdRef.current
      if (!stillWanted || stillWanted !== communityId) return
      const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000)
      reconnectAttemptsRef.current++
      reconnectTimeoutRef.current = setTimeout(() => {
        if (selectedIdRef.current === communityId) connect(communityId)
      }, delay)
    }
    ws.onerror = () => { try { ws.close() } catch {} }
    wsRef.current = ws
  }, [])

  // Connect / reconnect whenever selection changes
  useEffect(() => {
    if (!selectedId || !user) return
    setMessages([])
    setOnlineCount(0)
    setTypingUsers(new Map())
    connect(selectedId)
    return () => {
      selectedIdRef.current = null
      if (reconnectTimeoutRef.current) { clearTimeout(reconnectTimeoutRef.current); reconnectTimeoutRef.current = null }
      if (typingTimeoutRef.current) { clearTimeout(typingTimeoutRef.current); typingTimeoutRef.current = null }
      try { wsRef.current?.close() } catch {}
    }
  }, [selectedId, user, connect])

  // Cleanup any pending reconnect timer on unmount
  useEffect(() => () => {
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
  }, [])

  // ---- Load community details on selection ----
  useEffect(() => {
    if (!selectedId) { setCommunity(null); return }
    let cancelled = false
    setDetailLoading(true)
    getCommunity(selectedId).then(res => {
      if (cancelled) return
      if (res.success) {
        setCommunity(res.community)
        setIsMember(res.isMember)
      }
      setDetailLoading(false)
    })
    return () => { cancelled = true }
  }, [selectedId])

  // Auto-scroll chat
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  // ---- Actions ----
  const select = (id: string) => setSelectedId(id)

  const sendTyping = useCallback((isTyping: boolean) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    try { ws.send(JSON.stringify({ type: 'community-typing', payload: { isTyping }, user: { name: userRef.current?.name || 'Anonymous' } })) } catch {}
  }, [])

  const handleDraftChange = (value: string) => {
    setDraft(value)
    if (!value.trim()) {
      if (typingTimeoutRef.current) { clearTimeout(typingTimeoutRef.current); typingTimeoutRef.current = null }
      sendTyping(false)
      return
    }
    sendTyping(true)
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => sendTyping(false), 2000)
  }

  const send = () => {
    const text = draft.trim()
    if (!text || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    wsRef.current.send(JSON.stringify({ type: 'community-chat', payload: { message: text }, user: { name: userRef.current?.name || 'Anonymous' } }))
    if (typingTimeoutRef.current) { clearTimeout(typingTimeoutRef.current); typingTimeoutRef.current = null }
    sendTyping(false)
    setDraft('')
  }

  const handleCreate = async () => {
    if (!isCreator) {
      navigate('/pricing')
      return
    }
    if (!newName.trim() || creating) return
    setCreating(true)
    const res = await createCommunity({ name: newName.trim(), description: newDesc.trim() })
    setCreating(false)
    if (res.success) {
      setShowCreate(false)
      setNewName(''); setNewDesc('')
      await loadLists()
      setSelectedId(res.community.id)
    }
  }

  const handleJoin = async () => {
    if (!community) return
    const res = await joinCommunity(community.id)
    if (res.success !== false) {
      setIsMember(true)
      setCommunity(c => c ? { ...c, member_count: (c.member_count || 0) + 1 } : c)
      setMyIds(prev => new Set([...prev, community.id]))
      connect(community.id)
    }
  }

  const handleLeave = async () => {
    if (!community) return
    await leaveCommunity(community.id)
    setIsMember(false)
    setCommunity(c => c ? { ...c, member_count: Math.max(0, (c.member_count || 0) - 1) } : c)
    setMyIds(prev => { const n = new Set(prev); n.delete(community.id); return n })
    setMessages([])
    try { wsRef.current?.close() } catch {}
    setOnlineCount(0)
  }

  const openMembers = async () => {
    if (!community) return
    setShowMembers(true)
    setMembersLoading(true)
    const res = await getCommunityMembers(community.id)
    if (res.success) setMembers(res.members || [])
    setMembersLoading(false)
  }

  const openKeys = () => {
    setShowKeys(true)
    const token = localStorage.getItem('novaflix-token') || ''
    if (!token) return
    setMyKeysLoading(true)
    getMyEggs(token).then(res => {
      if (res.success) setMyKeys(res.keys || [])
      setMyKeysLoading(false)
    }).catch(() => setMyKeysLoading(false))
  }

  const mineIsCreator = !!community && user?.id === community.creator_id
  const canChat = isMember || mineIsCreator

  return (
    <div className="min-h-screen px-margin-mobile md:px-margin-desktop pt-6 md:pt-10 pb-nav">
      <div className="max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5 items-start">

        {/* ================= LEFT: COMMUNITIES SIDEBAR ================= */}
        <aside className="bg-[#0a0a0a] border border-white/5 rounded-2xl overflow-hidden lg:max-h-[calc(100vh-9rem)] lg:sticky lg:top-20 flex flex-col">
          {/* Header */}
          <div className="p-5 border-b border-white/5 bg-[#121212] flex items-center justify-between">
            <h2 className="text-red-500 text-lg font-bold tracking-wide">Communities</h2>
            <span className="bg-red-500/10 text-red-500 text-xs font-semibold px-2 py-0.5 rounded-full border border-red-500/25">
              {myIds.size} Active
            </span>
          </div>

          {/* Search */}
          <div className="p-3 border-b border-white/5">
            <div className="relative">
              <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/60" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search communities..."
                className="w-full bg-[#141414] border border-white/10 rounded-xl py-2.5 pl-9 pr-3 text-sm text-white placeholder-gray-500 outline-none focus:border-red-500/60 transition-colors"
              />
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="space-y-2 p-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 bg-white/5 rounded-xl animate-pulse" />)}</div>
            ) : listError ? (
              <div className="p-4 text-center">
                <p className="text-red-400 text-sm mb-3">Couldn't load communities: {listError}</p>
                <button
                  onClick={loadLists}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors"
                >
                  <Icon name="refresh" className="w-4 h-4" /> Retry
                </button>
              </div>
            ) : visible.length === 0 ? (
              <p className="text-on-surface-variant text-sm text-center py-10 px-4">
                {q ? 'No communities match your search.' : 'No communities yet.'}
              </p>
            ) : visible.map(c => {
              const active = selectedId === c.id
              return (
                <button
                  key={c.id}
                  onClick={() => select(c.id)}
                  className={`w-full flex items-center px-4 py-3.5 text-left border-b border-white/5 transition-colors ${active ? 'bg-[#180505] border-l-4 border-l-red-600' : 'border-l-4 border-l-transparent hover:bg-white/[0.03]'}`}
                >
                  <img
                    src={c.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(c.name)}&background=1a1a1a&color=ff0000&rounded=true&size=100`}
                    alt={c.name}
                    className="w-12 h-12 rounded-xl object-cover shrink-0 mr-3.5"
                    style={{ border: active ? '1px solid rgba(255,0,0,0.35)' : '1px solid #262626' }}
                    onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0' }}
                  />
                  <div className="overflow-hidden flex-1 min-w-0">
                    <h4 className={`m-0 mb-1.5 text-[0.95rem] font-semibold truncate ${active ? 'text-white' : 'text-on-surface'}`}>{c.name}</h4>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-500 shrink-0">Created by</span>
                      {c.creator_avatar
                        ? <img src={c.creator_avatar} alt="" className="w-[18px] h-[18px] rounded-full object-cover shrink-0" />
                        : <Icon name="person" className="w-3 h-3 text-gray-500 shrink-0" />}
                      <span className="text-xs text-gray-300 font-medium truncate">{c.creator_name || 'Unknown'}</span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Footer actions */}
          <div className="p-3 border-t border-white/5 space-y-2">
            {isCreator ? (
              <button
                onClick={() => setShowCreate(true)}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-red-600 text-white font-semibold text-sm hover:bg-red-700 transition-colors"
              >
                <Icon name="add" className="w-4 h-4" /> New Community
              </button>
            ) : (
              <button
                onClick={() => navigate('/pricing')}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-red-600/15 border border-red-500/30 text-red-400 font-semibold text-sm hover:bg-red-600/25 hover:text-red-300 transition-colors"
              >
                <Icon name="add" className="w-4 h-4" /> New Community
                <span className="text-[0.68rem] font-medium text-red-500/80 ml-1">Creator plan</span>
              </button>
            )}
            <button
              onClick={openKeys}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-[#141414] border border-white/10 text-gray-300 font-medium text-sm hover:border-red-500/50 hover:text-white transition-colors"
            >
              <Icon name="vpn_key" className="w-4 h-4" /> My Digital Keys
            </button>
          </div>
        </aside>

        {/* ================= RIGHT: CHAT ROOM ================= */}
        <main className="bg-black border border-white/5 rounded-2xl overflow-hidden flex flex-col h-[calc(100vh-13rem)] min-h-[520px]">
          {!community ? (
            <div className="flex-1 flex items-center justify-center text-center px-6">
              {detailLoading ? (
                <div className="w-full space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 bg-white/5 rounded-xl animate-pulse" />)}</div>
              ) : (
                <div>
                  <Icon name="diversity_3" className="w-12 h-12 text-on-surface-variant/30 mx-auto mb-3" />
                  <p className="text-on-surface-variant text-sm">Select a community to enter its chat room.</p>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Back bar */}
              <div className="px-5 md:px-6 py-3.5 bg-[#0a0a0a] border-b border-white/5 flex items-center justify-between shrink-0">
                <button onClick={() => setSelectedId(null)} className="text-red-500 hover:text-red-400 text-sm font-semibold inline-flex items-center gap-2 transition-colors">
                  <span className="text-base leading-none">&#8592;</span> Back to Communities
                </button>
                {canChat && (
                  <span className="text-xs text-gray-500 tabular-nums">{onlineCount} online</span>
                )}
              </div>

              {/* Community header banner */}
              <div className="px-5 md:px-6 py-5 bg-[#111111] border-b border-white/5 flex gap-4 md:gap-5 items-start shrink-0">
                <img
                  src={community.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(community.name)}&background=1a1a1a&color=ff0000&rounded=true&size=200`}
                  alt={community.name}
                  className="w-16 h-16 md:w-24 md:h-24 rounded-xl object-cover shrink-0 border border-[#333333]"
                  onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0' }}
                />
                <div className="flex-1 min-w-0">
                  <h1 className="m-0 mb-2 text-xl md:text-2xl font-bold text-white tracking-tight">{community.name}</h1>
                  {community.description && (
                    <p className="m-0 mb-3 text-sm text-gray-400 leading-relaxed line-clamp-2">{community.description}</p>
                  )}

                  {/* Metadata row */}
                  <div className="flex items-center flex-wrap gap-x-5 gap-y-2 mb-3.5 text-sm">
                    <button onClick={openMembers} className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors">
                      <Icon name="group" className="w-4 h-4 text-red-600" />
                      <span><strong className="text-white font-bold">{community.member_count}</strong> members</span>
                    </button>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">Created by</span>
                      <div className="flex items-center gap-1.5 bg-[#1a1a1a] pl-1 pr-2.5 py-0.5 rounded-full border border-[#2a2a2a]">
                        {community.creator_avatar
                          ? <img src={community.creator_avatar} alt="" className="w-5 h-5 rounded-full object-cover border border-red-600" />
                          : <Icon name="person" className="w-4 h-4 text-red-500" />}
                        <strong className="text-white font-semibold text-xs">{community.creator_name || 'Unknown'}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Action button */}
                  {mineIsCreator ? (
                    <button disabled className="bg-[#262626] text-gray-400 border border-[#333333] px-4 py-1.5 rounded-md font-semibold text-sm cursor-default">
                      You're the Creator
                    </button>
                  ) : isMember ? (
                    <button
                      onClick={handleLeave}
                      className="bg-[#262626] text-white border border-[#333333] px-4 py-1.5 rounded-md font-semibold text-sm hover:bg-red-600 hover:border-red-600 transition-all"
                    >
                      Leave Community
                    </button>
                  ) : (
                    <button
                      onClick={handleJoin}
                      className="bg-red-600 text-white border border-red-600 px-4 py-1.5 rounded-md font-semibold text-sm hover:bg-red-700 transition-all"
                    >
                      Join Community
                    </button>
                  )}
                </div>
              </div>

              {/* Chat messages */}
              {canChat ? (
                <>
                  <div className="flex-1 overflow-y-auto px-5 md:px-6 py-5 flex flex-col gap-4">
                    {messages.length === 0 && (
                      <p className="text-center text-gray-600 text-sm py-8">No messages yet — say hello 👋</p>
                    )}
                    <AnimatePresence initial={false}>
                      {messages.map(m => {
                        const mine = m.userId === user?.id
                        const isCreatorMsg = m.userId === community.creator_id
                        if (mine) {
                          return (
                            <motion.div key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-end self-end max-w-[75%] md:max-w-[65%]">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs text-gray-500">{clock(m.timestamp)}</span>
                                <span className="text-sm font-semibold text-red-500">You</span>
                              </div>
                              <div className="bg-red-600 px-3.5 py-2.5 rounded-xl rounded-tr-sm text-white text-sm leading-relaxed break-words whitespace-pre-wrap">
                                {m.message}
                              </div>
                            </motion.div>
                          )
                        }
                        return (
                          <motion.div key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-start max-w-[85%] md:max-w-[65%]">
                            <img
                              src={`https://ui-avatars.com/api/?name=${encodeURIComponent(m.name)}&background=141414&color=e0e0e0&rounded=true&size=72`}
                              alt={m.name}
                              className="w-9 h-9 rounded-full object-cover mr-3 shrink-0"
                              style={{ border: isCreatorMsg ? '1.5px solid #ff0000' : '1px solid #222222' }}
                              onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden' }}
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <button onClick={() => m.userId && navigate(`/profile/${m.userId}`)} className="text-sm font-semibold text-white truncate hover:text-red-400 transition-colors">{m.name}</button>
                                {isCreatorMsg && (
                                  <span className="bg-red-600 text-white text-[10px] px-1 py-0.5 rounded font-bold tracking-wide shrink-0">CREATOR</span>
                                )}
                                <span className="text-xs text-gray-500 shrink-0">{clock(m.timestamp)}</span>
                              </div>
                              <div className="bg-[#141414] px-3.5 py-2.5 rounded-xl rounded-tl-sm text-gray-200 text-sm leading-relaxed border border-[#222222] break-words whitespace-pre-wrap">
                                {m.message}
                              </div>
                            </div>
                          </motion.div>
                        )
                      })}
                    </AnimatePresence>
                    <div ref={bottomRef} />
                  </div>

                  {/* Typing indicator */}
                  {typingUsers.size > 0 && (
                    <div className="px-5 md:px-6 pt-2 text-xs text-gray-400 italic">
                      {[...typingUsers.values()].join(', ')} {typingUsers.size === 1 ? 'is' : 'are'} typing…
                    </div>
                  )}
                  {/* Chat input bar */}
                  <div className="px-5 md:px-6 py-4 bg-[#0a0a0a] border-t border-white/5 shrink-0">
                    <form className="flex gap-3 items-center" onSubmit={(e) => { e.preventDefault(); send() }}>
                      <input
                        value={draft}
                        onChange={e => handleDraftChange(e.target.value)}
                        placeholder={`Send a message in ${community.name}...`}
                        maxLength={2000}
                        className="flex-1 bg-[#141414] border border-[#2a2a2a] text-white px-4 py-3 rounded-full text-sm outline-none focus:border-red-500 transition-colors placeholder-gray-500"
                      />
                      <button
                        type="submit"
                        disabled={!draft.trim()}
                        className="bg-red-600 text-white px-6 py-3 rounded-full font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-40 shrink-0"
                      >
                        Send
                      </button>
                    </form>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
                  <Icon name="lock" className="w-10 h-10 text-on-surface-variant/30" />
                  <p className="text-on-surface-variant text-sm">{wsError || 'Join this community to start chatting.'}</p>
                  {!mineIsCreator && (
                    <button onClick={handleJoin} className="bg-red-600 text-white px-5 py-2.5 rounded-lg font-semibold text-sm hover:bg-red-700 transition-colors">
                      Join Community
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* ---- Create community modal ---- */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1000] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowCreate(false)}
          >
            <motion.div
              initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 12 }}
              className="bg-[#141414] w-full max-w-md rounded-2xl p-6 relative border border-white/10"
              onClick={e => e.stopPropagation()}
              role="dialog" aria-modal="true" aria-label="Create community"
            >
              <button onClick={() => setShowCreate(false)} aria-label="Close" className="absolute top-4 right-4 text-on-surface-variant hover:text-white text-2xl leading-none">×</button>
              <h2 className="text-center text-base font-extrabold uppercase tracking-wider mb-6">Create Community</h2>

              <label className="block text-[13px] font-semibold mb-2">Community Name</label>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                maxLength={80}
                placeholder="e.g., Sci-Fi Fan Club"
                className="w-full bg-transparent border border-white/15 rounded-lg px-3.5 py-3 text-sm mb-4 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
              />

              <label className="block text-[13px] font-semibold mb-2">Description (optional)</label>
              <textarea
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                rows={3}
                maxLength={300}
                placeholder="What is this community about?"
                className="w-full bg-transparent border border-white/15 rounded-lg px-3.5 py-3 text-sm resize-none min-h-[84px] mb-6 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
              />

              <button
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
                className="w-full bg-red-600 text-white py-3.5 rounded-lg font-bold text-sm uppercase tracking-wide hover:bg-red-700 disabled:opacity-50 transition-all"
              >
                {creating ? 'Creating…' : 'Create Community'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---- Members modal ---- */}
      <AnimatePresence>
        {showMembers && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1000] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowMembers(false)}
          >
            <motion.div
              initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 12 }}
              className="bg-[#141414] w-full max-w-sm rounded-2xl p-5 relative border border-white/10 max-h-[70vh] flex flex-col"
              onClick={e => e.stopPropagation()}
              role="dialog" aria-modal="true" aria-label="Community members"
            >
              <button onClick={() => setShowMembers(false)} aria-label="Close" className="absolute top-4 right-4 text-on-surface-variant hover:text-white text-2xl leading-none">×</button>
              <h2 className="text-center text-sm font-extrabold uppercase tracking-wider mb-4">Members ({members.length})</h2>
              <div className="overflow-y-auto space-y-1 pr-1">
                {membersLoading ? (
                  Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 bg-white/5 rounded-xl animate-pulse" />)
                ) : members.map(mm => (
                  <button key={mm.id} onClick={() => { setShowMembers(false); navigate(`/profile/${mm.id}`) }} className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 text-left transition-colors">
                    {mm.avatar
                      ? <img src={mm.avatar} alt="" className="w-9 h-9 rounded-full object-cover" />
                      : <div className="w-9 h-9 rounded-full bg-[#1f1f1f] flex items-center justify-center"><Icon name="person" className="w-4 h-4 text-gray-500" /></div>}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {mm.name}
                        {community && mm.id === community.creator_id && <span className="ml-2 bg-red-600 text-white text-[9px] px-1 py-0.5 rounded font-bold align-middle">CREATOR</span>}
                      </p>
                      <p className="text-[11px] text-gray-500">Joined {new Date(mm.joined_at).toLocaleDateString()}</p>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---- My keys modal ---- */}
      <AnimatePresence>
        {showKeys && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1000] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowKeys(false)}
          >
            <motion.div
              initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 12 }}
              className="bg-[#141414] w-full max-w-3xl rounded-2xl p-6 relative border border-white/10 max-h-[80vh] flex flex-col"
              onClick={e => e.stopPropagation()}
              role="dialog" aria-modal="true" aria-label="My digital keys"
            >
              <button onClick={() => setShowKeys(false)} aria-label="Close" className="absolute top-4 right-4 text-on-surface-variant hover:text-white text-2xl leading-none">×</button>
              <h2 className="text-center text-base font-extrabold uppercase tracking-wider mb-5">🔑 My Digital Keys ({myKeys.length})</h2>
              <div className="overflow-y-auto pr-1">
                {myKeysLoading ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 bg-white/5 rounded-xl animate-pulse" />)}</div>
                ) : myKeys.length === 0 ? (
                  <div className="text-center py-10">
                    <Icon name="key_off" className="w-10 h-10 text-on-surface-variant/30 mx-auto mb-3" />
                    <p className="text-on-surface text-sm mb-1">No keys yet</p>
                    <p className="text-gray-500 text-xs max-w-md mx-auto">Hidden keys are tucked into movies at exact moments. Pause when a glowing key appears on screen to collect it.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {myKeys.map(k => (
                      <div key={k.keyId} className="bg-black/40 rounded-xl p-4 border border-white/5">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="w-9 h-9 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
                            <Icon name="vpn_key" className="w-4 h-4 text-red-500" />
                          </div>
                          {k.rewardType === 'secret_room' && k.room ? (
                            <button onClick={() => navigate(`/community/room/${k.room.id}`)} className="text-[10px] px-2 py-1 rounded-full bg-red-500/15 text-red-500 font-semibold uppercase hover:bg-red-500/25 transition-colors">
                              Enter Room →
                            </button>
                          ) : k.badge ? (
                            <span className="text-[10px] px-2 py-1 rounded-full bg-red-500/15 text-red-500 font-semibold uppercase">{k.badge.icon} {k.badge.name}</span>
                          ) : null}
                        </div>
                        <p className="text-sm font-medium text-white truncate">{k.contentId}</p>
                        {k.hint && <p className="text-xs text-gray-500 italic mt-1 line-clamp-2">“{k.hint}”</p>}
                        <p className="text-[11px] text-gray-600 mt-2">
                          Found at {Math.floor(k.ts_seconds / 60)}:{Math.floor(k.ts_seconds % 60).toString().padStart(2, '0')}
                          {k.room ? ' • Secret Room unlocked' : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
