import { useEffect, useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Icon from '../components/ui/Icon'
import { useAuth } from '../lib/AuthContext'
import { useNavigate, useParams, useSearchParams, Navigate } from 'react-router-dom'
import { WS_ORIGIN } from '../lib/config'
import {
  getForumTopics, getForumTopic, createForumTopic, voteForumTopic,
  addForumReply, voteForumReply, getForumCategories,
} from '../lib/auth'

interface Topic {
  id: string
  title: string
  content: string
  category: string
  author_id: string
  author_name: string
  author_avatar: string | null
  upvotes: number
  downvotes: number
  reply_count: number
  myVote: number
  created_at: string
}

interface Reply {
  id: string
  author_id: string
  author_name: string
  author_avatar: string | null
  content: string
  parent_id: string | null
  upvotes: number
  downvotes: number
  myVote: number
  created_at: string
}

const PAGE_SIZE = 15
const MAX_INDENT = 6

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

/** Upvote-ratio bar mirroring the Hot Takes poll bar. */
function ScoreBar({ upvotes, downvotes }: { upvotes: number; downvotes: number }) {
  const total = Math.max(1, upvotes + downvotes)
  const pct = Math.round((upvotes / total) * 100)
  return (
    <div>
      <div className="h-3 bg-red-600/40 rounded-full overflow-hidden flex" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <motion.div
          className="h-full bg-green-500"
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        />
      </div>
      <div className="flex justify-between mt-2 text-xs font-semibold tabular-nums">
        <span className="text-green-400">▲ {fmt(upvotes)} Upvotes ({pct}%)</span>
        <span className="text-red-400">▼ {fmt(downvotes)} Downvotes ({100 - pct}%)</span>
      </div>
    </div>
  )
}

function ReplyNode({ reply, allReplies, depth, user, onVote, onReply }: {
  reply: Reply
  allReplies: Reply[]
  depth: number
  user: { id: string } | null
  onVote: (r: Reply, dir: 1 | -1) => void
  onReply: (r: Reply) => void
}) {
  const children = allReplies.filter(r => r.parent_id === reply.id)
  return (
    <div className="relative">
      <div className="relative">
        {depth > 0 && (
          <div className="absolute left-0 top-0 bottom-0 w-px bg-white/10" />
        )}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-black/40 border border-white/5 rounded-xl p-4"
          style={{ marginLeft: `${Math.min(depth, MAX_INDENT) * 1.5}rem` }}
        >
          <div className="flex items-center gap-2 mb-2">
            {reply.author_avatar ? (
              <img src={reply.author_avatar} alt="" className="w-6 h-6 rounded-full object-cover" />
            ) : (
              <Icon name="person" className="w-4 h-4 text-on-surface-variant/50" />
            )}
            <span className="text-sm font-medium text-on-surface-variant">{reply.author_name}</span>
            <span className="text-xs text-on-surface-variant/50">{timeAgo(reply.created_at)}</span>
            {depth > 0 && <span className="text-[10px] text-on-surface-variant/50">↳ reply</span>}
          </div>
          <p className="text-[13px] leading-relaxed text-on-surface whitespace-pre-wrap">{reply.content}</p>
          <div className="mt-2 flex items-center gap-2">
            <button onClick={() => onVote(reply, 1)} className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-xs transition-colors ${reply.myVote === 1 ? 'bg-green-500/15 border-green-500 text-green-400' : 'border-white/10 text-on-surface-variant hover:text-green-400'}`}>
              <Icon name="thumb_up" className="w-3.5 h-3.5" /> {reply.upvotes}
            </button>
            <button onClick={() => onVote(reply, -1)} className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-xs transition-colors ${reply.myVote === -1 ? 'bg-red-500/15 border-red-500 text-red-400' : 'border-white/10 text-on-surface-variant hover:text-red-400'}`}>
              <Icon name="thumb_down" className="w-3.5 h-3.5" /> {reply.downvotes}
            </button>
            {user && (
              <button onClick={() => onReply(reply)} className="text-xs text-on-surface-variant hover:text-red-400 px-2 py-1">
                Reply
              </button>
            )}
          </div>
        </motion.div>
      </div>
      {children.map(c => (
        <ReplyNode key={c.id} reply={c} allReplies={allReplies} depth={depth + 1} user={user} onVote={onVote} onReply={onReply} />
      ))}
    </div>
  )
}

/** Legacy deep links /forum/:topicId → /forum?topic=:topicId */
export function ForumRedirect() {
  const { topicId } = useParams<{ topicId: string }>()
  return <Navigate to={`/forum?topic=${topicId}`} replace />
}

export default function Forum() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [sort, setSort] = useState<'hot' | 'new'>('hot')
  const [topics, setTopics] = useState<Topic[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)

  const [showModal, setShowModal] = useState(false)
  const [categories, setCategories] = useState<string[]>([])
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [newCategory, setNewCategory] = useState('general')
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Thread view (selection lives in the ?topic= query param)
  const topicId = searchParams.get('topic')
  const [topic, setTopic] = useState<Topic | null>(null)
  const [replies, setReplies] = useState<Reply[]>([])
  const [replyText, setReplyText] = useState('')
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [threadLoading, setThreadLoading] = useState(false)

  const topicsRef = useRef<Topic[]>([])
  useEffect(() => { topicsRef.current = topics }, [topics])
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const topicIdRef = useRef<string | null>(null)
  useEffect(() => { topicIdRef.current = topicId }, [topicId])

  const loadTopics = useCallback((s: string, reset: boolean) => {
    if (reset) setLoading(true)
    else setLoadingMore(true)
    const offset = reset ? 0 : topicsRef.current.length
    getForumTopics('all', PAGE_SIZE, offset, s).then(r => {
      if (r.success) {
        setTopics(prev => reset
          ? r.topics
          : [...prev, ...r.topics.filter((t: Topic) => !prev.some(p => p.id === t.id))])
        setHasMore(r.topics.length === PAGE_SIZE)
      }
      setLoading(false)
      setLoadingMore(false)
    })
  }, [])

  useEffect(() => { loadTopics(sort, true) }, [sort, loadTopics])

  useEffect(() => {
    getForumCategories().then(r => {
      if (r.success && r.categories?.length) setCategories(r.categories)
    }).catch(() => {})
  }, [])

  // Infinite scroll inside the sidebar list
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
        loadTopics(sort, false)
      }
    }, { rootMargin: '200px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [hasMore, loading, loadingMore, sort, loadTopics])

  const loadThread = useCallback(() => {
    if (!topicId) { setTopic(null); setReplies([]); return }
    setThreadLoading(true)
    getForumTopic(topicId).then(r => {
      if (r.success) {
        setTopic(r.topic)
        setReplies(r.replies)
      }
      setThreadLoading(false)
    })
  }, [topicId])

  useEffect(() => { loadThread() }, [loadThread])

  // Realtime replies via WebSocket
  useEffect(() => {
    if (!user) return
    const token = localStorage.getItem('novaflix-token') || ''
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = WS_ORIGIN ? new URL(WS_ORIGIN).host : window.location.host
    const ws = new WebSocket(`${protocol}//${host}/ws?token=${encodeURIComponent(token)}`)
    const pendingJoins: string[] = []
    const flushJoins = () => {
      while (pendingJoins.length && ws.readyState === WebSocket.OPEN) {
        const msg = pendingJoins.shift()!
        try { ws.send(msg) } catch {}
      }
    }
    const queueJoin = (topicId: string) => {
      const msg = JSON.stringify({ type: 'topic-join', payload: { topicId } })
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(msg) } catch { pendingJoins.push(msg) }
      } else {
        pendingJoins.push(msg)
      }
    }
    ws.onopen = () => {
      if (topicIdRef.current) queueJoin(topicIdRef.current)
      flushJoins()
    }
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'topic-reply' && msg.topicId === topicIdRef.current) {
          setReplies(prev => prev.some(r => r.id === msg.reply.id)
            ? prev
            : [...prev, { ...msg.reply, myVote: msg.reply.myVote ?? 0 }])
          setTopic(t => t && t.id === msg.topicId ? { ...t, reply_count: (t.reply_count || 0) + 1 } : t)
          setTopics(prev => prev.map(x => x.id === msg.topicId ? { ...x, reply_count: (x.reply_count || 0) + 1 } : x))
        } else if (msg.type === 'forum-topic-created' && msg.topic?.id) {
          setTopics(prev => (prev.some(t => t.id === msg.topic.id) ? prev : [msg.topic, ...prev]))
        }
      } catch {}
    }
    ws.onclose = () => { wsRef.current = null }
    ;(ws as any)._queueJoin = queueJoin
    ;(ws as any)._flush = flushJoins
    wsRef.current = ws
    return () => { ws.close(); wsRef.current = null }
  }, [user])

  // Switch debate rooms on selection change
  useEffect(() => {
    const ws: any = wsRef.current
    if (!ws || !topicId) return
    const join = ws._queueJoin || ((id: string) => {
      const msg = JSON.stringify({ type: 'topic-join', payload: { topicId: id } })
      if (ws.readyState === WebSocket.OPEN) ws.send(msg)
    })
    join(topicId)
    if (ws._flush) ws._flush()
  }, [topicId])

  const select = (id: string | null) => {
    setSearchParams(id ? { topic: id } : {}, { replace: true })
    setReplyingTo(null)
  }

  const submitTopic = async () => {
    if (creating) return
    setFormError(null)
    if (!newTitle.trim()) { setFormError('Give your take a headline.'); return }
    if (!newContent.trim()) { setFormError('Explain your take.'); return }
    setCreating(true)
    const res = await createForumTopic(newTitle.trim(), newCategory, newContent.trim())
    setCreating(false)
    if (res.success) {
      setTopics(prev => (prev.some(t => t.id === res.topic.id) ? prev : [res.topic, ...prev]))
      select(res.topic.id)
      setShowModal(false)
      setNewTitle(''); setNewContent('')
    } else {
      setFormError(res.error || 'Failed to post your take.')
    }
  }

  const applyTopicVote = (id: string, up: number, down: number, my: number) => {
    setTopics(prev => prev.map(x => x.id === id ? { ...x, upvotes: up, downvotes: down, myVote: my } : x))
    setTopic(prev => prev && prev.id === id ? { ...prev, upvotes: up, downvotes: down, myVote: my } : prev)
  }

  const vote = async (dir: 1 | -1) => {
    if (!user) return navigate('/login')
    if (!topic) return
    const next = topic.myVote === dir ? 0 : dir
    const res = await voteForumTopic(topic.id, next)
    if (res.success) applyTopicVote(topic.id, res.upvotes, res.downvotes, next)
  }

  const voteReply = async (r: Reply, dir: 1 | -1) => {
    if (!user) return navigate('/login')
    const next = r.myVote === dir ? 0 : dir
    const res = await voteForumReply(r.id, next)
    if (res.success) {
      setReplies(prev => prev.map(x => x.id === r.id ? { ...x, myVote: next, upvotes: res.upvotes, downvotes: res.downvotes } : x))
    }
  }

  const postReply = async () => {
    if (!replyText.trim() || !topicId) return
    const res = await addForumReply(topicId, replyText.trim(), replyingTo || undefined)
    if (res.success) {
      setReplyText('')
      setReplyingTo(null)
      setReplies(prev => prev.some(x => x.id === res.reply.id)
        ? prev
        : [...prev, { ...res.reply, myVote: res.reply.myVote ?? 0 }])
      setTopic(t => t ? { ...t, reply_count: (t.reply_count || 0) + 1 } : t)
      setTopics(prev => prev.map(x => x.id === topicId ? { ...x, reply_count: (x.reply_count || 0) + 1 } : x))
    }
  }

  return (
    <div className="min-h-screen px-margin-mobile md:px-margin-desktop pt-6 md:pt-10 pb-nav">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
          <div className="flex items-center gap-2">
            <Icon name="local_fire_department" size="lg" className="text-red-500" fill />
            <h1 className="text-headline-md font-bold text-on-surface">Debate Forum</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 bg-surface-container-high rounded-xl p-1 border border-white/5">
              <button onClick={() => setSort('hot')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${sort === 'hot' ? 'bg-red-600 text-white' : 'text-on-surface-variant hover:text-on-surface'}`}>🔥 Hot</button>
              <button onClick={() => setSort('new')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${sort === 'new' ? 'bg-red-600 text-white' : 'text-on-surface-variant hover:text-on-surface'}`}>New</button>
            </div>
            {user && (
              <button onClick={() => setShowModal(true)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 text-white font-label-md text-sm font-bold hover:bg-red-700 transition-all">
                <Icon name="add" className="w-4 h-4" /> New Take
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5 items-start">
          {/* LEFT: debate topics sidebar */}
          <aside className="bg-surface-container-high border border-white/5 rounded-2xl p-4 lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto lg:sticky lg:top-20">
            <div className="flex items-center gap-2 pb-3 mb-3 border-b border-white/5">
              <span className="text-sm font-extrabold uppercase tracking-wide text-red-500">🔥 Debate Topics</span>
              <span className="ml-auto text-[11px] text-on-surface-variant tabular-nums">{topics.length}{hasMore ? '+' : ''} threads</span>
            </div>
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 bg-white/5 rounded-xl animate-pulse" />)}</div>
            ) : topics.length === 0 ? (
              <p className="text-on-surface-variant text-sm text-center py-8">No debates yet.<br />Start the first one!</p>
            ) : (
              <div className="space-y-2.5">
                {topics.map(t => (
                  <button
                    key={t.id}
                    onClick={() => select(t.id)}
                    className={`w-full text-left bg-black/40 p-3 rounded-xl border transition-all ${topicId === t.id ? 'border-red-600 bg-red-500/5' : 'border-white/10 hover:border-red-600/60'}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-semibold uppercase">{t.category}</span>
                      <span className="text-[10px] text-on-surface-variant/50">{timeAgo(t.created_at)}</span>
                    </div>
                    <div className="text-[13px] font-semibold leading-snug text-on-surface line-clamp-2 mb-2">{t.title}</div>
                    <div className="flex items-center justify-between text-[11px] text-on-surface-variant tabular-nums min-w-0">
                      <span className="truncate">{t.author_name}</span>
                      <span className="shrink-0 ml-2">💬 {t.reply_count} · ▲{fmt(Math.max(0, t.upvotes - t.downvotes))}</span>
                    </div>
                  </button>
                ))}
                <div ref={sentinelRef} className="py-3 text-center">
                  {loadingMore ? (
                    <span className="inline-block w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  ) : !hasMore && topics.length > 0 ? (
                    <span className="text-[10px] text-on-surface-variant/50">You've reached the end</span>
                  ) : null}
                </div>
              </div>
            )}
          </aside>

          {/* RIGHT: active debate arena */}
          <main>
            {!topic ? (
              <div className="bg-surface-container-high border border-white/5 rounded-2xl p-10 text-center">
                {threadLoading ? (
                  <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 bg-white/5 rounded-xl animate-pulse" />)}</div>
                ) : (
                  <>
                    <Icon name="forum" size="xl" className="text-on-surface-variant/40 mx-auto mb-3" />
                    <p className="text-on-surface-variant text-sm">Pick a debate from the list — or drop the first one.</p>
                  </>
                )}
              </div>
            ) : (
              <motion.div key={topic.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="bg-surface-container-high border border-white/5 rounded-2xl p-5 md:p-6 shadow-[0_10px_30px_rgba(255,0,0,0.08)]">
                <span className="inline-flex items-center gap-1.5 bg-red-500/15 text-red-500 border border-red-500/60 text-[11px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wide mb-3">
                  🔥 Active Debate
                </span>
                <div className="text-sm text-on-surface-variant mb-1.5">
                  {topic.category} · by{' '}
                  <button onClick={() => navigate(`/profile/${topic.author_id}`)} className="font-medium text-on-surface hover:text-red-400">{topic.author_name}</button>
                  {' '}· {timeAgo(topic.created_at)}
                </div>
                <h2 className="text-lg md:text-xl font-bold leading-snug text-on-surface mb-3">{topic.title}</h2>
                <p className="text-sm text-on-surface leading-relaxed whitespace-pre-wrap mb-5">{topic.content}</p>

                {/* Live analytics */}
                <div className="bg-black/40 border border-white/5 rounded-xl p-4 mb-5">
                  <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                    <span className="text-[13px] font-bold text-on-surface tabular-nums">🗳️ {fmt(topic.upvotes + topic.downvotes)} Votes Cast</span>
                    <span className="relative flex h-2 w-2" title="Live — replies stream in real time">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-60" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                    </span>
                  </div>
                  <ScoreBar upvotes={topic.upvotes} downvotes={topic.downvotes} />
                </div>

                {/* Vote buttons */}
                <div className="grid grid-cols-2 gap-3 mb-5">
                  <button
                    onClick={() => vote(1)}
                    disabled={!user}
                    className={`inline-flex items-center justify-center gap-1.5 py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-40 ${topic.myVote === 1 ? 'bg-green-500/15 border border-green-500 text-green-400 scale-[0.98]' : 'border border-white/10 text-on-surface-variant hover:text-green-400 hover:border-green-500/50'}`}
                  >
                    <Icon name="thumb_up" className="w-4 h-4" /> {topic.myVote === 1 ? 'Upvoted' : 'Upvote'}
                  </button>
                  <button
                    onClick={() => vote(-1)}
                    disabled={!user}
                    className={`inline-flex items-center justify-center gap-1.5 py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-40 ${topic.myVote === -1 ? 'bg-red-500/15 border border-red-500 text-red-400 scale-[0.98]' : 'border border-white/10 text-on-surface-variant hover:text-red-400 hover:border-red-500/50'}`}
                  >
                    <Icon name="thumb_down" className="w-4 h-4" /> {topic.myVote === -1 ? 'Downvoted' : 'Downvote'}
                  </button>
                </div>

                {/* Reply input */}
                {user ? (
                  <div className="mb-4">
                    {replyingTo && <p className="text-xs text-on-surface-variant mb-2">Replying to a comment <button onClick={() => setReplyingTo(null)} className="text-red-400">(cancel)</button></p>}
                    <div className="flex gap-2.5 items-start">
                      <textarea
                        value={replyText}
                        onChange={e => setReplyText(e.target.value)}
                        rows={2}
                        placeholder="Share your hot take…"
                        className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-red-500/60 resize-none"
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); postReply() } }}
                      />
                      <button onClick={postReply} disabled={!replyText.trim()} className="px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-40 shrink-0">
                        Post
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-center text-on-surface-variant text-sm mb-4">Sign in to join the debate.</p>
                )}

                {/* Threaded replies */}
                <div className="border-t border-white/5 pt-4 mt-2 space-y-3">
                  <p className="text-xs text-on-surface-variant uppercase tracking-wider font-bold">{replies.length} Repl{replies.length !== 1 ? 'ies' : 'y'}</p>
                  {replies.length === 0 && (
                    <p className="text-on-surface-variant text-sm text-center py-4">No replies yet. Drop a hot take!</p>
                  )}
                  {replies.filter(r => !r.parent_id).map(r => (
                    <ReplyNode key={r.id} reply={r} allReplies={replies} depth={0} user={user} onVote={voteReply} onReply={(rr) => setReplyingTo(replyingTo === rr.id ? null : rr.id)} />
                  ))}
                </div>
              </motion.div>
            )}
          </main>
        </div>
      </div>

      {/* ---- Create-take modal ---- */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1000] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowModal(false)}
          >
            <motion.div
              initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 12 }}
              className="bg-[#141414] w-full max-w-md rounded-2xl p-6 relative border border-white/10"
              onClick={e => e.stopPropagation()}
              role="dialog" aria-modal="true" aria-label="Submit your hot take"
            >
              <button onClick={() => setShowModal(false)} aria-label="Close" className="absolute top-4 right-4 text-on-surface-variant hover:text-white text-2xl leading-none">×</button>
              <h2 className="text-center text-base font-extrabold uppercase tracking-wider mb-6">Start a Debate</h2>

              <label className="block text-[13px] font-semibold mb-2">Headline</label>
              <input
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                maxLength={255}
                placeholder="Unpopular opinion: …"
                className="w-full bg-transparent border border-white/15 rounded-lg px-3.5 py-3 text-sm mb-4 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
              />

              <label className="block text-[13px] font-semibold mb-2">Your Take</label>
              <textarea
                value={newContent}
                onChange={e => setNewContent(e.target.value)}
                rows={4}
                placeholder="Explain your take…"
                className="w-full bg-transparent border border-white/15 rounded-lg px-3.5 py-3 text-sm resize-none min-h-[96px] mb-4 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
              />

              <label className="block text-[13px] font-semibold mb-2">Category</label>
              <select
                value={newCategory}
                onChange={e => setNewCategory(e.target.value)}
                className="w-full bg-transparent border border-white/15 rounded-lg px-3.5 py-3 text-sm mb-6 outline-none focus:border-red-500 [&>option]:bg-[#141414]"
              >
                {(categories.length ? categories : ['general']).map(c => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>

              {formError && <p className="text-red-400 text-xs mb-3 text-center" role="alert">{formError}</p>}

              <button
                onClick={submitTopic}
                disabled={creating}
                className="w-full bg-red-600 text-white py-3.5 rounded-lg font-bold text-sm uppercase tracking-wide hover:bg-red-700 disabled:opacity-50 transition-all"
              >
                {creating ? 'Posting…' : 'Post Debate'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
