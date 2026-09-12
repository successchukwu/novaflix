import { useEffect, useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Icon from '../components/ui/Icon'
import { useAuth } from '../lib/AuthContext'
import { useSearchParams } from 'react-router-dom'
import { WS_ORIGIN } from '../lib/config'
import {
  getHotTakes, getHotTake, createHotTake, voteHotTake, addHotTakeReply, getToken,
} from '../lib/auth'

interface Stats {
  agree: number
  disagree: number
  total: number
  agreePct: number
  leadingSide: 'agree' | 'disagree' | 'tied'
}

interface Take {
  id: string
  title: string
  movie_title: string | null
  category: string
  author_id: string
  author_name: string
  author_avatar: string | null
  upvotes: number
  downvotes: number
  reply_count?: number
  myVote: number
  stats: Stats
  created_at: string
}

interface Comment {
  id: string
  author_id: string
  author_name: string
  author_avatar: string | null
  content: string
  stance: 'agree' | 'disagree' | null
  upvotes: number
  downvotes: number
  created_at: string
}

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

/** Red/white poll bar matching the debate-arena design. */
function PollBar({ stats }: { stats: Stats }) {
  return (
    <div>
      <div className="h-3 bg-white rounded-full overflow-hidden flex" role="progressbar" aria-valuenow={stats.agreePct} aria-valuemin={0} aria-valuemax={100}>
        <motion.div
          className="h-full bg-red-600"
          animate={{ width: `${stats.agreePct}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        />
      </div>
      <div className="flex justify-between mt-2 text-xs font-semibold tabular-nums">
        <span className="text-red-400">{stats.agreePct}% Agree ({fmt(stats.agree)})</span>
        <span className="text-on-surface-variant">{100 - stats.agreePct}% Disagree ({fmt(stats.disagree)})</span>
      </div>
    </div>
  )
}

function StanceTag({ stance }: { stance: 'agree' | 'disagree' | null }) {
  if (!stance) return null
  return stance === 'agree' ? (
    <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wide bg-red-500/20 text-red-400 border border-red-500/50">Agreed</span>
  ) : (
    <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wide bg-white/10 text-on-surface border border-white/30">Disagreed</span>
  )
}

export default function HotTakes() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const [takes, setTakes] = useState<Take[]>([])
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState<'hot' | 'new'>('hot')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [active, setActive] = useState<Take | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [detailLoading, setDetailLoading] = useState(false)

  const [commentText, setCommentText] = useState('')
  const [postingComment, setPostingComment] = useState(false)
  const [myStance, setMyStance] = useState<'agree' | 'disagree'>('agree')

  const [showModal, setShowModal] = useState(false)
  const [movieTitle, setMovieTitle] = useState('')
  const [headline, setHeadline] = useState('')
  const [noSpoilers, setNoSpoilers] = useState(false)
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const takesRef = useRef<Take[]>([])
  useEffect(() => { takesRef.current = takes }, [takes])
  const activeIdRef = useRef<string | null>(null)
  useEffect(() => { activeIdRef.current = activeId }, [activeId])

  const applyStats = useCallback((topicId: string, stats: Stats) => {
    setTakes(prev => prev.map(t => (t.id === topicId
      ? { ...t, upvotes: stats.agree, downvotes: stats.disagree, stats }
      : t)))
    setActiveId(prev => {
      if (prev === topicId) setActive(a => (a && a.id === topicId ? { ...a, upvotes: stats.agree, downvotes: stats.disagree, stats } : a))
      return prev
    })
  }, [])

  // ---- Initial load ----
  const loadTakes = useCallback((s: 'hot' | 'new', selectFirst: boolean) => {
    setLoading(true)
    getHotTakes(s).then(r => {
      if (r.success) {
        setTakes(r.topics)
        const fromUrl = searchParams.get('take')
        const target = selectFirst
          ? (fromUrl && r.topics.find((t: Take) => t.id === fromUrl)) || r.topics[0] || null
          : null
        if (target) setActiveId(target.id)
        else if (!selectFirst) setActiveId(prev => prev)
      }
      setLoading(false)
    })
  }, [searchParams])

  useEffect(() => { loadTakes(sort, true) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Load detail when selection changes ----
  useEffect(() => {
    if (!activeId) { setActive(null); setComments([]); return }
    let cancelled = false
    setDetailLoading(true)
    getHotTake(activeId).then(r => {
      if (cancelled) return
      if (r.success) {
        setActive(r.topic)
        setComments(r.replies)
        if (r.topic.myVote !== 0) setMyStance(r.topic.myVote > 0 ? 'agree' : 'disagree')
      }
      setDetailLoading(false)
    })
    return () => { cancelled = true }
  }, [activeId])

  // Keep URL shareable
  useEffect(() => {
    const current = searchParams.get('take')
    if (activeId && current !== activeId) setSearchParams({ take: activeId }, { replace: true })
  }, [activeId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Live WebSocket: join the debate room, stream votes + comments ----
  useEffect(() => {
    const token = getToken()
    if (!token) return
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
      if (activeIdRef.current) queueJoin(activeIdRef.current)
      flushJoins()
    }
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data)
        if (data?.type === 'hot-take-vote' && data.topicId) {
          applyStats(data.topicId, {
            agree: data.agree, disagree: data.disagree, total: data.total,
            agreePct: data.agreePct, leadingSide: data.leadingSide,
          })
        } else if (data?.type === 'hot-take-created' && data.topic?.id) {
          setTakes(prev => (prev.some(t => t.id === data.topic.id) ? prev : [data.topic, ...prev]))
        } else if (data?.type === 'topic-reply' && data.topicId === activeIdRef.current && data.reply) {
          setComments(prev => (prev.some(c => c.id === data.reply.id) ? prev : [...prev, data.reply]))
          setTakes(prev => prev.map(t => (t.id === data.topicId ? { ...t, reply_count: (t.reply_count || 0) + 1 } : t)))
        }
      } catch {}
    }
    ;(ws as any)._queueJoin = queueJoin
    ;(ws as any)._flush = flushJoins
    wsRef.current = ws
    return () => { try { ws.close() } catch {} }
  }, [applyStats])

  // Switch debate rooms on selection change
  useEffect(() => {
    const ws: any = wsRef.current
    if (!ws || !activeId) return
    const join = ws._queueJoin || ((id: string) => {
      const msg = JSON.stringify({ type: 'topic-join', payload: { topicId: id } })
      if (ws.readyState === WebSocket.OPEN) ws.send(msg)
    })
    join(activeId)
    if (ws._flush) ws._flush()
  }, [activeId])

  // ---- Actions ----
  const castVote = async (vote: 1 | -1) => {
    if (!user) return
    if (!active) return
    const target = vote === 1 ? 'agree' : 'disagree'
    setMyStance(target)
    // Optimistic flip using server math rules (toggle / switch sides)
    const prevMine = active.myVote
    let agree = active.stats.agree
    let disagree = active.stats.disagree
    if (prevMine === vote) { if (vote === 1) agree--; else disagree-- }
    else if (prevMine === -vote && prevMine !== 0) { if (vote === 1) { agree++; disagree-- } else { disagree++; agree-- } }
    else { if (vote === 1) agree++; else disagree++ }
    const total = Math.max(0, agree + disagree)
    const optimistic: Stats = {
      agree: Math.max(0, agree), disagree: Math.max(0, disagree), total,
      agreePct: total ? Math.round((Math.max(0, agree) / total) * 100) : 50,
      leadingSide: total === 0 || agree === disagree ? 'tied' : agree > disagree ? 'agree' : 'disagree',
    }
    applyStats(active.id, optimistic)
    setActive(a => (a && a.id === active.id ? { ...a, myVote: prevMine === vote ? 0 : vote } : a))
    setTakes(prev => prev.map(t => (t.id === active.id ? { ...t, myVote: prevMine === vote ? 0 : vote } : t)))

    const res = await voteHotTake(active.id, vote)
    if (res.success) applyStats(active.id, res.stats)
  }

  const postComment = async () => {
    if (!commentText.trim() || !active || postingComment) return
    setPostingComment(true)
    const res = await addHotTakeReply(active.id, commentText.trim(), myStance)
    setPostingComment(false)
    if (res.success) {
      setComments(prev => (prev.some(c => c.id === res.reply.id) ? prev : [...prev, res.reply]))
      setCommentText('')
    }
  }

  const submitTake = async () => {
    if (creating) return
    setFormError(null)
    if (!headline.trim()) { setFormError('Give your take a headline.'); return }
    if (!noSpoilers) { setFormError('Confirm your take is spoiler-free.'); return }
    setCreating(true)
    const res = await createHotTake(movieTitle.trim(), headline.trim(), true)
    setCreating(false)
    if (res.success) {
      setTakes(prev => (prev.some(t => t.id === res.topic.id) ? prev : [res.topic, ...prev]))
      setActiveId(res.topic.id)
      setShowModal(false)
      setMovieTitle(''); setHeadline(''); setNoSpoilers(false)
    } else {
      setFormError(res.error || 'Failed to post your take.')
    }
  }

  const leadingCopy = active?.stats.leadingSide === 'agree'
    ? `"AGREE" SIDE IS LEADING`
    : active?.stats.leadingSide === 'disagree'
      ? `"DISAGREE" SIDE IS LEADING`
      : 'DEAD EVEN — VOTE NOW'

  return (
    <div className="min-h-screen px-margin-mobile md:px-margin-desktop pt-6 md:pt-10 pb-nav">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
          <div className="flex items-center gap-2">
            <Icon name="local_fire_department" size="lg" className="text-red-500" fill />
            <h1 className="text-headline-md font-bold text-on-surface">Hot Takes · Debate Forum</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 bg-surface-container-high rounded-xl p-1 border border-white/5">
              <button onClick={() => { setSort('hot'); loadTakes('hot', false) }} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${sort === 'hot' ? 'bg-red-600 text-white' : 'text-on-surface-variant hover:text-on-surface'}`}>🔥 Hot</button>
              <button onClick={() => { setSort('new'); loadTakes('new', false) }} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${sort === 'new' ? 'bg-red-600 text-white' : 'text-on-surface-variant hover:text-on-surface'}`}>New</button>
            </div>
            <button onClick={() => setShowModal(true)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 text-white font-label-md text-sm font-bold hover:bg-red-700 transition-all">
              <Icon name="add" className="w-4 h-4" /> New Take
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5 items-start">
          {/* LEFT: trending topics sidebar */}
          <aside className="bg-surface-container-high border border-white/5 rounded-2xl p-4 lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto lg:sticky lg:top-20">
            <div className="flex items-center gap-2 pb-3 mb-3 border-b border-white/5">
              <span className="text-sm font-extrabold uppercase tracking-wide text-red-500">🔥 Trending Topics</span>
              <span className="ml-auto text-[11px] text-on-surface-variant tabular-nums">{takes.length} debates</span>
            </div>
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 bg-white/5 rounded-xl animate-pulse" />)}</div>
            ) : takes.length === 0 ? (
              <p className="text-on-surface-variant text-sm text-center py-8">No hot takes yet.<br />Start the first debate!</p>
            ) : (
              <div className="space-y-2.5">
                {takes.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setActiveId(t.id)}
                    className={`w-full text-left bg-black/40 p-3 rounded-xl border transition-all ${activeId === t.id ? 'border-red-600 bg-red-500/5' : 'border-white/10 hover:border-red-600/60'}`}
                  >
                    <div className="text-[11px] text-on-surface-variant mb-0.5 truncate">{t.movie_title || 'General Cinema'}</div>
                    <div className="text-[13px] font-semibold leading-snug text-on-surface line-clamp-2 mb-2">"{t.title}"</div>
                    <div className="flex justify-between text-[11px] text-on-surface-variant tabular-nums">
                      <span>{fmt(t.stats.total)} Votes</span>
                      <span className={t.stats.leadingSide === 'agree' ? 'text-red-400' : ''}>{t.stats.agreePct}% Agree</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </aside>

          {/* RIGHT: active debate arena */}
          <main>
            {!active ? (
              <div className="bg-surface-container-high border border-white/5 rounded-2xl p-10 text-center">
                {detailLoading ? (
                  <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 bg-white/5 rounded-xl animate-pulse" />)}</div>
                ) : (
                  <>
                    <Icon name="forum" size="xl" className="text-on-surface-variant/40 mx-auto mb-3" />
                    <p className="text-on-surface-variant text-sm">Pick a take from the list — or drop the first one.</p>
                  </>
                )}
              </div>
            ) : (
              <motion.div key={active.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="bg-surface-container-high border border-white/5 rounded-2xl p-5 md:p-6 shadow-[0_10px_30px_rgba(255,0,0,0.08)]">
                <span className="inline-flex items-center gap-1.5 bg-red-500/15 text-red-500 border border-red-500/60 text-[11px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wide mb-3">
                  🔥 Active Debate
                </span>
                <div className="text-sm text-on-surface-variant mb-1.5">Re: {active.movie_title || 'General Cinema'} · by {active.author_name} · {timeAgo(active.created_at)}</div>
                <h2 className="text-lg md:text-xl font-bold leading-snug text-on-surface mb-5">"{active.title}"</h2>

                {/* Live analytics */}
                <div className="bg-black/40 border border-white/5 rounded-xl p-4 mb-5">
                  <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                    <span className="text-[13px] font-bold text-on-surface tabular-nums">👥 {fmt(active.stats.total)} Moviegoers Voted</span>
                    <span className={`text-[11px] font-extrabold uppercase tracking-wide ${active.stats.leadingSide === 'tied' ? 'text-amber-400' : 'text-red-500'}`}>
                      🏆 {leadingCopy}
                    </span>
                  </div>
                  <PollBar stats={active.stats} />
                  <span className="relative flex h-2 w-2 mt-3" title="Live — updates in real time">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-60" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                  </span>
                </div>

                {/* Vote buttons */}
                <div className="grid grid-cols-2 gap-3 mb-5">
                  <button
                    onClick={() => castVote(1)}
                    disabled={!user}
                    className={`py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-40 ${active.myVote === 1 ? 'bg-red-600 text-white scale-[0.98]' : 'bg-red-600/90 text-white hover:bg-red-600'}`}
                  >
                    {active.myVote === 1 ? '✓ You Agree' : 'Vote Agree'}
                  </button>
                  <button
                    onClick={() => castVote(-1)}
                    disabled={!user}
                    className={`py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-40 ${active.myVote === -1 ? 'bg-white text-black scale-[0.98]' : 'bg-transparent text-white border border-white/70 hover:border-white'}`}
                  >
                    {active.myVote === -1 ? '✓ You Disagree' : 'Vote Disagree'}
                  </button>
                </div>

                {/* Comment input */}
                {user ? (
                  <div className="flex gap-2.5 items-center mb-2">
                    <input
                      value={commentText}
                      onChange={e => setCommentText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') postComment() }}
                      placeholder={`Defend your position to tilt the scale…`}
                      className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-red-500/60"
                    />
                    <div className="flex rounded-lg overflow-hidden border border-white/10 shrink-0" role="group" aria-label="Your stance">
                      <button onClick={() => setMyStance('agree')} title="Post as agreeing" className={`px-2.5 py-2.5 text-xs font-bold ${myStance === 'agree' ? 'bg-red-600 text-white' : 'bg-black/40 text-on-surface-variant'}`}>A</button>
                      <button onClick={() => setMyStance('disagree')} title="Post as disagreeing" className={`px-2.5 py-2.5 text-xs font-bold border-l border-white/10 ${myStance === 'disagree' ? 'bg-white text-black' : 'bg-black/40 text-on-surface-variant'}`}>D</button>
                    </div>
                    <button onClick={postComment} disabled={!commentText.trim() || postingComment} className="px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-40 shrink-0">
                      {postingComment ? '…' : 'Post'}
                    </button>
                  </div>
                ) : (
                  <p className="text-center text-on-surface-variant text-sm mb-2">Sign in to vote and defend your position.</p>
                )}

                {/* Comments */}
                <div className="border-t border-white/5 pt-4 mt-4 space-y-3">
                  <p className="text-xs text-on-surface-variant uppercase tracking-wider font-bold">{comments.length} Argument{comments.length !== 1 ? 's' : ''}</p>
                  {comments.length === 0 && (
                    <p className="text-on-surface-variant text-sm text-center py-4">No arguments yet. Defend your side!</p>
                  )}
                  <AnimatePresence initial={false}>
                    {comments.map(c => (
                      <motion.div key={c.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-black/40 border border-white/5 rounded-xl px-4 py-3">
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            {c.author_avatar
                              ? <img src={c.author_avatar} alt="" className="w-6 h-6 rounded-full object-cover" />
                              : <Icon name="person" className="w-4 h-4 text-on-surface-variant/50" />}
                            <button onClick={() => c.author_id && window.location.assign(`/profile/${c.author_id}`)} className="text-[13px] font-semibold text-white truncate hover:text-red-400">{c.author_name}</button>
                            <StanceTag stance={c.stance} />
                          </div>
                          <span className="text-[10px] text-on-surface-variant/60 shrink-0">{timeAgo(c.created_at)}</span>
                        </div>
                        <p className="text-[13px] leading-relaxed text-on-surface-variant whitespace-pre-wrap">{c.content}</p>
                      </motion.div>
                    ))}
                  </AnimatePresence>
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
              <h2 className="text-center text-base font-extrabold uppercase tracking-wider mb-6">Submit Your Hot Take</h2>

              <label className="block text-[13px] font-semibold mb-2">Movie Title</label>
              <input
                value={movieTitle}
                onChange={e => setMovieTitle(e.target.value)}
                placeholder="e.g., The Dark Knight"
                className="w-full bg-transparent border border-white/15 rounded-lg px-3.5 py-3 text-sm mb-4 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
              />

              <label className="block text-[13px] font-semibold mb-2">Your Hot Take Headline</label>
              <textarea
                value={headline}
                onChange={e => setHeadline(e.target.value)}
                rows={3}
                maxLength={255}
                placeholder='e.g., "Joker carried the entire movie…"'
                className="w-full bg-transparent border border-white/15 rounded-lg px-3.5 py-3 text-sm resize-none min-h-[84px] mb-4 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
              />

              <label className="flex items-center gap-2.5 mb-6 cursor-pointer select-none">
                <input type="checkbox" checked={noSpoilers} onChange={e => setNoSpoilers(e.target.checked)} className="accent-red-600 w-4 h-4" />
                <span className="text-[13px] text-on-surface-variant">Confirm no spoilers</span>
              </label>

              {formError && <p className="text-red-400 text-xs mb-3 text-center" role="alert">{formError}</p>}

              <button
                onClick={submitTake}
                disabled={creating}
                className="w-full bg-red-600 text-white py-3.5 rounded-lg font-bold text-sm uppercase tracking-wide hover:bg-red-700 disabled:opacity-50 transition-all"
              >
                {creating ? 'Posting…' : 'Submit Hot Take'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
