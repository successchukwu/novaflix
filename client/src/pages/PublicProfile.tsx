/**
 * PublicProfile.tsx
 * ---------------------------------------------------------------------------
 * Immersive, Spotify-style creator profile view (public route /profile/:id).
 *
 * For platform creators the page renders the cinematic layout:
 *   • Hero banner — massive backdrop, circular avatar, verified badge,
 *     bold name header, Follow action and counter stats
 *     ("4 Projects Directed • 11 Movies Acted In").
 *   • Row 1 "Created & Directed By" — horizontal scroll of films where the
 *     creator served as filmmaker; SHORT films carry their precise runtime
 *     badge directly on the card.
 *   • Row 2 "Featured / Acted In" — strictly onscreen-talent credits.
 *   • Row 3 "Fans Also Like" — grid of creators sharing parallel genre/mood
 *     tags, straight from the discovery engine.
 *
 * Non-creator users fall back to the compact profile layout. Superfan
 * leaderboard / follow lists remain available for both.
 */
import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Icon from '../components/ui/Icon'
import { useAuth } from '../lib/AuthContext'
import FollowButton from '../components/ui/FollowButton'
import GlowGiftButton from '../components/ui/GlowGiftButton'
import { getFollowStats, getFollowers, getFollowing, getFanLeaderboard, getFanStatus } from '../lib/auth'
import { subscribeContent } from '../lib/live'
import { getCreatorDiscovery, API_BASE, type DiscoveryMovieCredit, type DiscoverySimilarCreator } from '../lib/api'

function fmt(n: number | string | undefined | null): string {
  const num = Number(n)
  if (!Number.isFinite(num) || num === 0) return '0'
  return num.toLocaleString()
}

/** Seconds -> card runtime badge text ("14 min", "1 hr 22 min"). */
function runtimeBadge(seconds: number | null | undefined): string | null {
  if (!seconds || seconds <= 0) return null
  if (seconds < 60) return `${Math.round(seconds)} sec`
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  if (h > 0) return m > 0 ? `${h}hr ${m}m` : `${h}hr`
  return `${m} min`
}

/** Format pill distinguishing short-form vs feature-length films. */
function FormatPill({ format }: { format: 'SHORT' | 'LONG' | null | undefined }) {
  const isShort = format === 'SHORT'
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${
        isShort ? 'bg-secondary/20 text-secondary border-secondary/40' : 'bg-primary-container/15 text-primary border-primary/40'
      }`}
    >
      {isShort ? 'Short Film' : 'Feature'}
    </span>
  )
}

/** Horizontal-scroll movie card with optional precise runtime badge. */
function CreditCard({ movie, onClick }: { movie: DiscoveryMovieCredit; onClick: () => void }) {
  const rt = movie.format === 'SHORT' ? runtimeBadge(movie.duration_seconds) : null
  return (
    <button
      onClick={onClick}
      className="group relative w-36 md:w-44 shrink-0 snap-start text-left rounded-xl overflow-hidden bg-surface-container border border-white/5 hover:border-white/20 transition-all hover:-translate-y-1"
    >
      <div className="relative aspect-[2/3] bg-surface-container-high">
        {movie.poster_path ? (
          <img src={`${API_BASE}${movie.poster_path}`} alt={movie.title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Icon name="movie" className="text-on-surface-variant/30" />
          </div>
        )}
        {/* Short films display their precise runtime badge on the card. */}
        {rt && (
          <span className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-sm text-[10px] font-bold text-white border border-white/20">
            {rt}
          </span>
        )}
        <span className="absolute top-2 left-2 opacity-90">
          <FormatPill format={movie.format} />
        </span>
      </div>
      <div className="p-2.5">
        <p className="font-label-md text-label-md text-on-surface truncate">{movie.title}</p>
        <p className="text-xs text-on-surface-variant/50 truncate mt-0.5">
          {fmt(movie.views)} views
          {movie.character_name ? ` • as ${movie.character_name}` : ''}
        </p>
      </div>
    </button>
  )
}

/** Section shell for the horizontal scroll rows. */
function ScrollRow({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="flex items-center gap-2 font-label-md text-label-md uppercase tracking-widest mb-4">
        <Icon name={icon} className="text-primary-container" /> {title}
      </h2>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
        {children}
      </div>
    </section>
  )
}

export default function PublicProfile() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  // ---- Data: discovery aggregate + social graph + fan state --------------
  const [discovery, setDiscovery] = useState<Awaited<ReturnType<typeof getCreatorDiscovery>> | null>(null)
  const [stats, setStats] = useState<any>(null)
  const [fans, setFans] = useState<any[]>([])
  const [fanStatus, setFanStatus] = useState<any>(null)
  const [listType, setListType] = useState<'followers' | 'following' | null>(null)
  const [list, setList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Quiet refresh: background refetch without toggling the loading skeleton.
  const quietRefresh = useCallback(async (creatorId: string) => {
    const [d, s, f, fs] = await Promise.all([
      getCreatorDiscovery(creatorId),
      getFollowStats(creatorId),
      getFanLeaderboard(creatorId),
      getFanStatus(creatorId),
    ])
    if (d.success) setDiscovery(d)
    if (s.success) setStats(s)
    if (f.success) setFans(f.fans)
    if (fs.success) setFanStatus(fs)
  }, [])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)

    // Initial load.
    Promise.all([getCreatorDiscovery(id), getFollowStats(id), getFanLeaderboard(id), getFanStatus(id)])
      .then(([d, s, f, fs]) => {
        if (cancelled) return
        if (d.success) setDiscovery(d)
        if (s.success) setStats(s)
        if (f.success) setFans(f.fans)
        if (fs.success) setFanStatus(fs)
      })
      .finally(() => !cancelled && setLoading(false))

    // Real-time channel: server pushes follow/like/view events for this creator.
    const unsubscribe = subscribeContent('creator', id, (msg) => {
      if (msg.type === 'follow') {
        if (typeof msg.followers_count === 'number') {
          setDiscovery((prev) =>
            prev ? { ...prev, creator: { ...prev.creator, followers_count: msg.followers_count } } : prev
          )
          setStats((prev) => (prev && msg.actorId !== user?.id ? { ...prev, followers: msg.followers_count } : prev))
        }
        if (msg.actorId === user?.id) {
          getFollowStats(id).then((s) => s.success && setStats(s)).catch(() => {})
        }
      } else if (msg.type === 'like') {
        const delta = msg.liked ? 1 : -1
        setDiscovery((prev) =>
          prev
            ? { ...prev, creator: { ...prev.creator, total_likes: Math.max(0, Number(prev.creator.total_likes || 0) + delta) } }
            : prev
        )
      } else if (msg.type === 'view') {
        setDiscovery((prev) =>
          prev
            ? { ...prev, creator: { ...prev.creator, total_views: Number(prev.creator.total_views || 0) + 1 } }
            : prev
        )
      }
    })

    // Polling safety net (TopNav parity): refresh every 20s while tab is visible,
    // and immediately on window focus after being away.
    const POLL_MS = 20000
    let lastPoll = Date.now()
    const interval = setInterval(() => {
      if (document.hidden || cancelled) return
      lastPoll = Date.now()
      quietRefresh(id).catch(() => {})
    }, POLL_MS)
    const onFocus = () => {
      if (cancelled || document.hidden) return
      if (Date.now() - lastPoll > POLL_MS) quietRefresh(id).catch(() => {})
    }
    window.addEventListener('focus', onFocus)

    return () => {
      cancelled = true
      unsubscribe()
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [id, user?.id, quietRefresh])

  const openList = async (type: 'followers' | 'following') => {
    setListType(type)
    const res = type === 'followers' ? await getFollowers(id!) : await getFollowing(id!)
    if (res.success) setList(res.users)
  }

  const closeList = () => {
    setListType(null)
    setList([])
  }

  // ---- Loading skeleton ---------------------------------------------------
  if (loading) {
    return (
      <div className="min-h-screen px-margin-mobile md:px-margin-desktop pt-6 md:pt-10 pb-nav">
        <div className="max-w-6xl mx-auto animate-pulse">
          <div className="h-56 md:h-72 rounded-2xl bg-white/5 mb-16" />
          <div className="h-8 bg-white/5 rounded w-64 mb-3" />
          <div className="h-4 bg-white/5 rounded w-96 mb-10" />
          <div className="flex gap-3 overflow-hidden mb-10">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="w-36 md:w-44 shrink-0 aspect-[2/3] bg-white/5 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  const badge = fanStatus?.badge
  const isCreator = !!discovery

  // Compact fallback for regular (non-creator) users -------------------------
  if (!isCreator) {
    return (
      <div className="min-h-screen px-margin-mobile md:px-margin-desktop pt-6 md:pt-10 pb-nav">
        <div className="max-w-4xl mx-auto">
          <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-on-surface-variant hover:text-on-surface mb-6 text-sm">
            <Icon name="arrow_back" className="w-4 h-4" /> Back
          </button>
          <div className="flex items-center gap-5 mb-8">
            {stats?.profile?.avatar ? (
              <img src={stats.profile.avatar} alt={stats.profile.name} className="w-24 h-24 rounded-2xl object-cover ring-2 ring-white/10" />
            ) : (
              <div className="w-24 h-24 rounded-2xl bg-surface-container-high flex items-center justify-center">
                <Icon name="person" className="w-12 h-12 text-on-surface-variant/40" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-headline-md font-bold text-on-surface">{stats?.profile?.name || 'User'}</h1>
                {badge && (
                  <span
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
                    style={{ backgroundColor: `${badge.color}22`, color: badge.color, border: `1px solid ${badge.color}55` }}
                  >
                    <Icon name="workspace_premium" className="w-3.5 h-3.5" /> {badge.tier}
                  </span>
                )}
              </div>
              <p className="text-on-surface-variant text-sm mt-1">{stats?.profile?.bio || 'No bio yet'}</p>
              {user && user.id !== id && (
                <div className="mt-3 flex items-center gap-2">
                  <FollowButton
                    creatorId={id!}
                    onCountChange={(count) => setStats((prev: any) => (prev ? { ...prev, followers: count } : prev))}
                  />
                  <GlowGiftButton creatorId={id!} recipientName={stats?.profile?.name} />
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-gutter mb-8">
            <button onClick={() => openList('followers')} className="bg-surface-container-high border border-white/5 rounded-xl p-5 text-left hover:border-white/15 transition-colors">
              <Icon name="group" className="text-primary-container mb-3" />
              <p className="text-2xl font-bold text-on-surface">{fmt(stats?.followers)}</p>
              <p className="text-on-surface-variant/60 text-sm">Followers</p>
            </button>
            <button onClick={() => openList('following')} className="bg-surface-container-high border border-white/5 rounded-xl p-5 text-left hover:border-white/15 transition-colors">
              <Icon name="person_add" className="text-secondary mb-3" />
              <p className="text-2xl font-bold text-on-surface">{fmt(stats?.following)}</p>
              <p className="text-on-surface-variant/60 text-sm">Following</p>
            </button>
          </div>

          {user && user.id !== id && fanStatus?.engaged && (
            <div className="bg-surface-container border border-white/5 rounded-xl p-5 mb-8 flex items-center justify-between">
              <div>
                <p className="text-sm text-on-surface-variant">Your fan score on this member</p>
                <p className="text-lg font-bold text-on-surface mt-1">
                  {fanStatus.points} pts {fanStatus.rank ? <span className="text-on-surface-variant text-sm font-normal">· Rank #{fanStatus.rank}</span> : null}
                </p>
              </div>
              <span className="text-2xl">🏆</span>
            </div>
          )}

          {user && user.id !== id && (
            <div className="w-full flex justify-center py-2">
              <GlowGiftButton creatorId={id!} recipientName={stats?.profile?.name} />
            </div>
          )}
          {renderListModal()}
        </div>
      </div>
    )
  }

  const creator = discovery!.creator
  const counts = discovery!.counts
  const directed = discovery!.directed
  const acted = discovery!.acted
  const similar = discovery!.similarCreators

  // Backdrop art: newest directed film poster, blurred behind the hero.
  const heroBackdrop = directed[0]?.poster_path || acted[0]?.poster_path || null

  /** Followers/Following modal (shared by both layouts). */
  function renderListModal() {
    if (!listType) return null
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={closeList}>
        <div className="w-full max-w-md bg-surface-container-high border border-white/10 rounded-2xl p-5 max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-label-md text-label-md text-on-surface">{listType === 'followers' ? 'Followers' : 'Following'}</h3>
            <button onClick={closeList} className="text-on-surface-variant hover:text-on-surface"><Icon name="close" /></button>
          </div>
          {list.length === 0 ? (
            <p className="text-on-surface-variant text-sm text-center py-6">No {listType} yet</p>
          ) : (
            <div className="space-y-2">
              {list.map((u: any) => (
                <div key={u.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5">
                  {u.avatar ? (
                    <img src={u.avatar} alt={u.name} className="w-9 h-9 rounded-full object-cover" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center">
                      <Icon name="person" className="w-4 h-4 text-on-surface-variant/50" />
                    </div>
                  )}
                  <button onClick={() => { closeList(); navigate(`/creators/${u.id}`) }} className="flex-1 text-left font-label-md text-label-md text-on-surface truncate">
                    {u.name}
                  </button>
                  {user && user.id !== u.id && <FollowButton creatorId={u.id} />}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ---- Immersive creator layout --------------------------------------------
  return (
    <div className="min-h-screen pb-nav">
      {/* ===== HERO HEADER BANNER ===== */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 h-64 md:h-80">
          {heroBackdrop ? (
            <>
              <img src={`${API_BASE}${heroBackdrop}`} alt="" className="w-full h-full object-cover scale-110 blur-2xl brightness-[0.35]" />
            </>
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary-container/25 via-surface-container to-background" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        </div>

        <div className="relative px-margin-mobile md:px-margin-desktop pt-16 md:pt-24 pb-8">
          <div className="max-w-6xl mx-auto">
            <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-on-surface-variant hover:text-on-surface mb-8 text-sm">
              <Icon name="arrow_back" className="w-4 h-4" /> Back
            </button>

            <div className="flex flex-col sm:flex-row sm:items-end gap-5">
              {/* Large circular profile picture */}
              {creator.avatar ? (
                <img
                  src={creator.avatar}
                  alt={creator.name}
                  className="w-28 h-28 md:w-36 md:h-36 rounded-full object-cover ring-4 ring-primary-container/60 shadow-2xl shrink-0"
                />
              ) : (
                <div className="w-28 h-28 md:w-36 md:h-36 rounded-full bg-surface-container-high ring-4 ring-primary-container/60 flex items-center justify-center shrink-0">
                  <Icon name="person" className="w-14 h-14 text-on-surface-variant/40" />
                </div>
              )}

              <div className="flex-1 min-w-0">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-on-surface-variant mb-1">
                  {creator.verified ? (
                    <>
                      Verified Creator
                      {/* Verified badge */}
                      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary-container text-on-primary-container" title="Verified creator">
                        <Icon name="check" className="w-2.5 h-2.5" />
                      </span>
                    </>
                  ) : (
                    'Creator'
                  )}
                </p>
                {/* Bold creator-name header */}
                <h1 className="text-headline-lg-mobile md:text-display-lg font-extrabold text-on-surface leading-tight break-words">
                  {creator.name}
                </h1>
                {/* Counter stats line */}
                <p className="mt-2 text-on-surface-variant font-label-md">
                  <span className="text-on-surface font-semibold">{counts.directed}</span> Project{counts.directed !== 1 ? 's' : ''} Directed
                  <span className="mx-2 text-on-surface-variant/40">•</span>
                  <span className="text-on-surface font-semibold">{counts.acted}</span> Movie{counts.acted !== 1 ? 's' : ''} Acted In
                </p>
                {creator.bio && (
                  <p className="mt-2 text-sm text-on-surface-variant/70 max-w-2xl line-clamp-2">{creator.bio}</p>
                )}
                {/* Follow interaction */}
                {user && user.id !== id && (
                  <div className="mt-4 flex items-center gap-2 flex-wrap">
                    <FollowButton
                      creatorId={id!}
                      onCountChange={(count) =>
                        setDiscovery((prev) =>
                          prev ? { ...prev, creator: { ...prev.creator, followers_count: count } } : prev
                        )
                      }
                    />
                    <GlowGiftButton creatorId={id!} recipientName={creator.name} />
                  </div>
                )}
              </div>
            </div>

            {/* Quick stats strip */}
            <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3 text-sm">
              <button onClick={() => openList('followers')} className="hover:text-primary transition-colors">
                <span className="font-bold text-on-surface">{fmt(creator.followers_count)}</span>{' '}
                <span className="text-on-surface-variant">Followers</span>
              </button>
              <span>
                <span className="font-bold text-on-surface">{fmt(creator.total_views)}</span>{' '}
                <span className="text-on-surface-variant">Views</span>
              </span>
              <span>
                <span className="font-bold text-on-surface">{fmt(creator.total_likes)}</span>{' '}
                <span className="text-on-surface-variant">Likes</span>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ===== CREDIT SHELVES ===== */}
      <div className="px-margin-mobile md:px-margin-desktop max-w-6xl mx-auto pt-4">
        {/* Row 1 — filmmaker credits */}
        <ScrollRow title="Created & Directed By" icon="videocam">
          {directed.map((m) => (
            <CreditCard key={`dir-${m.id}`} movie={m} onClick={() => navigate(`/movie/${m.id}`)} />
          ))}
          {directed.length === 0 && (
            <p className="text-sm text-on-surface-variant/40 py-6">No director credits yet.</p>
          )}
        </ScrollRow>

        {/* Row 2 — strictly onscreen talent */}
        {(acted.length > 0 || directed.length > 0) && (
          <ScrollRow title="Featured / Acted In" icon="theater_comedy">
            {acted.map((m) => (
              <CreditCard key={`act-${m.id}`} movie={m} onClick={() => navigate(`/movie/${m.id}`)} />
            ))}
            {acted.length === 0 && (
              <p className="text-sm text-on-surface-variant/40 py-6">No acting credits yet.</p>
            )}
          </ScrollRow>
        )}

        {/* ===== ROW 3 — FANS ALSO LIKE ===== */}
        {similar.length > 0 && (
          <section className="mb-12">
            <h2 className="flex items-center gap-2 font-label-md text-label-md uppercase tracking-widest mb-4">
              <Icon name="people_alt" className="text-primary-container" /> Fans Also Like
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {similar.map((c: DiscoverySimilarCreator) => (
                <button
                  key={c.id}
                  onClick={() => navigate(`/creators/${c.id}`)}
                  className="group flex flex-col items-center text-center gap-3 p-4 rounded-xl bg-surface-container border border-white/5 hover:border-white/20 hover:bg-surface-container-high transition-all"
                >
                  <span className="w-20 h-20 rounded-full overflow-hidden bg-surface-container-highest flex items-center justify-center group-hover:scale-105 transition-transform">
                    {c.avatar ? (
                      <img src={c.avatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Icon name="person" className="w-9 h-9 text-on-surface-variant/40" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center justify-center gap-1">
                      <span className="font-label-md text-label-md text-on-surface truncate">{c.name}</span>
                      {c.verified && (
                        <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-primary-container text-on-primary-container shrink-0">
                          <Icon name="check" className="w-2 h-2" />
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-on-surface-variant/50 mt-0.5">
                      {c.film_count} film{c.film_count !== 1 ? 's' : ''}
                    </span>
                    {/* Shared genre/mood tags driving this suggestion */}
                    {c.shared_tags.length > 0 && (
                      <span className="block mt-1.5 text-[10px] text-secondary truncate capitalize">
                        {c.shared_tags.slice(0, 2).join(' • ').replace(/-/g, ' ')}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ===== SUPERFAN LEADERBOARD ===== */}
        {fans.length > 0 && (
          <div className="mb-8">
            <h2 className="font-label-md text-label-md text-on-surface uppercase tracking-widest mb-4 flex items-center gap-2">
              <Icon name="leaderboard" className="text-primary-container" /> Superfan Leaderboard
            </h2>
            <div className="space-y-2">
              {fans.slice(0, 10).map((f, i) => (
                <div key={f.user_id} className="flex items-center gap-4 bg-surface-container border border-white/5 rounded-xl p-3">
                  <div className="w-7 h-7 rounded-full bg-surface-container flex items-center justify-center text-xs font-bold text-on-surface-variant shrink-0">
                    {i + 1}
                  </div>
                  {f.avatar ? (
                    <img src={f.avatar} alt={f.name} className="w-9 h-9 rounded-full object-cover" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center">
                      <Icon name="person" className="w-4 h-4 text-on-surface-variant/50" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <button onClick={() => navigate(`/creators/${f.user_id}`)} className="font-label-md text-label-md text-on-surface hover:text-primary transition-colors truncate">
                      {f.name}
                    </button>
                    <p className="text-on-surface-variant/60 text-xs">❤ {f.likes} · 💬 {f.comments} · {f.watch_minutes}m watched</p>
                  </div>
                  <span className="hidden sm:inline text-xs font-semibold px-2 py-1 rounded-full shrink-0" style={{ backgroundColor: `${f.badge.color}22`, color: f.badge.color }}>
                    {f.badge.tier}
                  </span>
                  <span className="text-sm font-bold text-on-surface shrink-0 w-10 text-right">{f.points} pts</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Glow Token */}
        {user && user.id !== id && (
          <div className="mb-12 flex justify-center">
            <GlowGiftButton creatorId={id!} recipientName={creator.name} />
          </div>
        )}
      </div>

      {renderListModal()}
    </div>
  )
}
