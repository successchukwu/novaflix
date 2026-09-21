import { useEffect, useRef, useState, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import Icon from '../components/ui/Icon'
import { useAuth } from '../lib/AuthContext'
import { getConversations, getDirectMessages } from '../lib/auth'
import { WS_ORIGIN } from '../lib/config'

interface ChatMsg {
  id: string
  userId: string
  name: string
  message: string
  timestamp: number
}

interface Convo {
  room: string
  otherUser: { id: string; name: string; avatar: string | null }
  lastMessage: string
  lastAt: number
}

export default function Chat() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const initialWith = params.get('with') || ''

  const [conversations, setConversations] = useState<Convo[]>([])
  const [active, setActive] = useState<string>(initialWith)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [draft, setDraft] = useState('')
  const [otherUser, setOtherUser] = useState<{ id: string; name: string; avatar: string | null } | null>(null)
  const [loading, setLoading] = useState(true)

  const wsRef = useRef<WebSocket | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const draftRef = useRef(draft)
  draftRef.current = draft

  const connect = useCallback((withUserId: string) => {
    const token = localStorage.getItem('novaflix-token') || ''
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = WS_ORIGIN ? new URL(WS_ORIGIN).host : window.location.host
    if (wsRef.current) wsRef.current.close()
    const ws = new WebSocket(`${protocol}//${host}/ws?token=${encodeURIComponent(token)}`)

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'dm-join', payload: { otherUserId: withUserId }, user: { name: user?.name || 'Anonymous' } }))
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'chat-history') {
          setMessages(msg.messages || [])
        } else if (msg.type === 'chat') {
          setMessages((prev) => [...prev, {
            id: String(Date.now()) + Math.random().toString(36).slice(2, 6),
            userId: msg.userId,
            name: msg.name || 'Anonymous',
            message: msg.message,
            timestamp: msg.timestamp || Date.now(),
          }])
        }
      } catch {}
    }

    ws.onclose = () => {
      wsRef.current = null
    }

    wsRef.current = ws
  }, [user])

  // Load conversations
  useEffect(() => {
    getConversations().then((r) => {
      if (r.success) setConversations(r.conversations)
      setLoading(false)
    })
  }, [messages.length])

  // Load active thread
  useEffect(() => {
    if (!active) return
    setMessages([])
    getDirectMessages(active).then((r) => {
      if (r.success) {
        setOtherUser(r.otherUser)
        setMessages(r.messages || [])
      }
    })
    connect(active)
    return () => {
      if (wsRef.current) wsRef.current.close()
      wsRef.current = null
    }
  }, [active, connect])

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const send = () => {
    const text = draft.trim()
    if (!text || !wsRef.current || !user) return
    wsRef.current.send(JSON.stringify({ type: 'dm-chat', payload: { message: text, name: user.name }, user: { name: user.name } }))
    setDraft('')
  }

  const selectConvo = (c: Convo) => {
    setActive(c.otherUser.id)
    setOtherUser(c.otherUser)
  }

  return (
    <div className="min-h-screen px-margin-mobile md:px-margin-desktop pt-6 md:pt-10 pb-nav">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <Icon name="chat_bubble" className="text-primary-container" />
          <h1 className="text-headline-md font-bold text-on-surface">Messages</h1>
        </div>

        <div className="grid md:grid-cols-[320px_1fr] gap-gutter h-[calc(100vh-220px)] min-h-[420px]">
          {/* Conversation list */}
          <div className="bg-surface-container-high border border-white/5 rounded-xl overflow-hidden flex flex-col">
            <div className="p-3 border-b border-white/5">
              <p className="text-sm font-semibold text-on-surface-variant px-2">Conversations</p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 bg-white/5 rounded-lg animate-pulse" />)}
                </div>
              ) : conversations.length === 0 ? (
                <p className="text-on-surface-variant text-sm text-center py-10 px-4">No conversations yet. Open a profile and press "Message" to start a chat.</p>
              ) : (
                conversations.map((c) => (
                  <button
                    key={c.room}
                    onClick={() => selectConvo(c)}
                    className={`w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-white/5 transition-colors ${active === c.otherUser.id ? 'bg-primary/10' : ''}`}
                  >
                    {c.otherUser.avatar ? (
                      <img src={c.otherUser.avatar} alt={c.otherUser.name} className="w-10 h-10 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center shrink-0">
                        <Icon name="person" className="w-5 h-5 text-on-surface-variant/50" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-label-md text-label-md text-on-surface truncate">{c.otherUser.name}</p>
                      <p className="text-on-surface-variant/60 text-xs truncate">{c.lastMessage}</p>
                    </div>
                    <span className="text-[10px] text-on-surface-variant/50 shrink-0">
                      {new Date(c.lastAt).toLocaleDateString()}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Thread */}
          <div className="bg-surface-container-high border border-white/5 rounded-xl overflow-hidden flex flex-col">
            {!active ? (
              <div className="flex-1 flex items-center justify-center text-on-surface-variant text-sm">
                Select a conversation to start messaging
              </div>
            ) : (
              <>
                <div className="px-4 py-3 border-b border-white/5 flex items-center gap-3">
                  {otherUser?.avatar ? (
                    <img src={otherUser.avatar} alt={otherUser.name} className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center">
                      <Icon name="person" className="w-4 h-4 text-on-surface-variant/50" />
                    </div>
                  )}
                  <div className="flex-1">
                    <p className="font-label-md text-label-md text-on-surface">{otherUser?.name || 'Loading…'}</p>
                  </div>
                  <button onClick={() => navigate(`/creators/${active}`)} className="text-on-surface-variant hover:text-primary text-xs">View profile</button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messages.length === 0 && (
                    <p className="text-center text-on-surface-variant/60 text-sm py-10">Say hello 👋</p>
                  )}
                  {messages.map((m) => {
                    const mine = m.userId === user?.id
                    return (
                      <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%] rounded-2xl px-4 py-2 ${mine ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container border border-white/10'}`}>
                          {!mine && <p className="text-xs font-semibold mb-0.5">{m.name}</p>}
                          <p className="text-sm break-words">{m.message}</p>
                          <p className="text-[10px] opacity-50 mt-1">{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                      </div>
                    )
                  })}
                  <div ref={bottomRef} />
                </div>

                <div className="p-3 border-t border-white/5 flex items-center gap-2">
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') send() }}
                    placeholder="Type a message…"
                    className="flex-1 bg-surface-container rounded-lg px-4 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <button
                    onClick={send}
                    disabled={!draft.trim()}
                    className="px-4 py-2.5 rounded-lg bg-primary-container text-on-primary-container text-sm font-semibold hover:brightness-110 transition-all disabled:opacity-40"
                  >
                    Send
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
