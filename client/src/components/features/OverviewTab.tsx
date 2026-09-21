import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Icon from '../ui/Icon'
import { useAuth } from '../../lib/AuthContext'
import FollowButton from '../ui/FollowButton'
import GlowGiftButton from '../ui/GlowGiftButton'
import { getFollowStats, getFollowers, getFollowing, getFanLeaderboard, getFanStatus } from '../../lib/auth'
import { subscribeContent } from '../../lib/live'
import { getCreatorDiscovery, API_BASE, type DiscoveryMovieCredit, type DiscoverySimilarCreator } from '../../lib/api'

function fmt(n: number | string | undefined | null): string {
  const num = Number(n)
  if (!Number.isFinite(num) || num === 0) return '0'
  return num.toLocaleString()
}

function runtimeBadge(seconds: number | null | undefined): string | null {
  if (!seconds || seconds <= 0) return null
  if (seconds < 60) return `${Math.round(seconds)} sec`
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  if (h > 0) return m > 0 ? `${h}hr ${m}m` : `${h}hr`
  return `${m} min`
}

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

export default function OverviewTab() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [discovery, setDiscovery] = useState<Awaited<ReturnType<typeof getCreatorDiscovery>> | null>(null)
  const [stats, setStats] = useState<any>(null)
  const [fans, setFans] = useState<any[]>([])
  const [fanStatus, setFanStatus] = useState<any>(null)
  const [listType, setListType] = useState<'followers' | 'following' | null>(null)
  const [list, setList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

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

    Promise.all([getCreatorDiscovery(id), getFollowStats(id), getFanLeaderboard(id), getFanStatus(id)])
      .then(([d, s, f, fs]) => {
        if (cancelled) return
        if (d.success) setDiscovery(d)
        if (s.success) setStats(s)
        if (f.success) setFans(f.fans)
        if (fs.success) setFanStatus(fs)
      })
      .finally(() => !cancelled && setLoading(false))

    const unsubscribe = subscribeContent('creator', id, (msg) => {
      if (msg.type === 'follow') {
        if (typeof msg.followers_count === 'number') {
          setDiscovery((prev: Awaited<ReturnType<typeof getCreatorDiscovery>> | null) =>
            prev ? { ...prev, creator: { ...prev.creator, followers_count: msg.followers_count } } : prev
          )
          setStats((prev: any) => (prev && msg.actorId !== user?.id ? { ...prev, followers: msg.followers_count } : prev))
        }
        if (msg.actorId === user?.id) {
          getFollowStats(id).then((s) => s.success && setStats(s)).catch(() => {})
        }
      } else if (msg.type === 'like') {
        const delta = msg.liked ? 1 : -1
        setDiscovery((prev: Awaited<ReturnType<typeof getCreatorDiscovery>> | null) =>
          prev
            ? { ...prev, creator: { ...prev.creator, total_likes: Math.max(0, Number(prev.creator.total_likes || 0) + delta) } }
            : prev
        )
      } else if (msg.type === 'view') {
        setDiscovery((prev: Awaited<ReturnType<typeof getCreatorDiscovery>> | null) =>
          prev
            ? { ...prev, creator: { ...prev.creator, total_views: Number(prev.creator.total_views || 0) + 1 } }
            : prev
        )
      }
    })

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

  if (loading) {
    return (
      <div className="px-4 md:px-6 pb-8 animate-pulse space-y-8">
        <div className="h-56 md:h-72 rounded-2xl bg-white/5" />
        <div className="h-8 bg-white/5 rounded w-64 mb-3" />
        <div className="h-4 bg-white/5 rounded w-96 mb-10" />
        <div className="flex gap-3 overflow-hidden mb-10">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="w-36 md:w-44 shrink-0 aspect-[2/3] bg-white/5 rounded-xl" />
          ))}
        </div>
        <div className="flex gap-3 overflow-hidden mb-10">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="w-36 md:w-44 shrink-0 aspect-[2/3] bg-white/5 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="aspect-square bg-white/5 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (!discovery) {
    return (
      <div className="px-4 md:px-6 pb-8 text-center py-12">
        <Icon name="person_search" className="w-16 h-16 text-on-surface-variant/30 mx-auto mb-4" />
        <p className="text-on-surface-variant/60 text-sm">This creator profile is not available.</p>
      </div>
    )
  }

  const badge = fanStatus?.badge
  const c = discovery.creator
  const directed = discovery.directed || []
  const acted = discovery.acted || []
  const similar = discovery.similarCreators || []

  return (
    <div className="px-4 md:px-6 pb-8 space-y-10">
      {/* Created & Directed By */}
      {directed.length > 0 && (
        <ScrollRow title="Created & Directed By" icon="movie_filter">
          {directed.map((m) => (
            <CreditCard key={m.id} movie={m} onClick={() => navigate(`/movie/${m.id}`)} />
          ))}
        </ScrollRow>
      )}

      {/* Featured / Acted In */}
      {acted.length > 0 && (
        <ScrollRow title="Featured / Acted In" icon="person">
          {acted.map((m) => (
            <CreditCard key={m.id} movie={m} onClick={() => navigate(`/movie/${m.id}`)} />
          ))}
        </ScrollRow>
      )}

      {/* Fans Also Like */}
      {similar.length > 0 && (
        <section className="mb-10">
          <h2 className="flex items-center gap-2 font-label-md text-label-md uppercase tracking-widest mb-4">
            <Icon name="people_alt" className="text-primary-container" /> Fans Also Like
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {similar.map((sc: DiscoverySimilarCreator) => (
              <button
                key={sc.id}
                onClick={() => navigate(`/creators/${sc.id}`)}
                className="group flex flex-col items-center text-center gap-3 p-4 rounded-xl bg-surface-container border border-white/5 hover:border-white/20 hover:bg-surface-container-high transition-all"
              >
                <span className="w-20 h-20 rounded-full overflow-hidden bg-surface-container-highest flex items-center justify-center group-hover:scale-105 transition-transform">
                  {sc.avatar ? (
                    <img src={sc.avatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Icon name="person" className="w-9 h-9 text-on-surface-variant/40" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center justify-center gap-1">
                    <span className="font-label-md text-label-md text-on-surface truncate">{sc.name}</span>
                    {sc.verified && (
                      <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-primary-container text-on-primary-container shrink-0">
                        <Icon name="check" className="w-2 h-2" />
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-on-surface-variant/50 mt-0.5">
                    {sc.film_count} film{sc.film_count !== 1 ? 's' : ''}
                  </span>
                  {sc.shared_tags.length > 0 && (
                    <span className="block mt-1.5 text-[10px] text-secondary truncate capitalize">
                      {sc.shared_tags.slice(0, 2).join(' • ').replace(/-/g, ' ')}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Superfan Leaderboard */}
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
                <img
                  src={f.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(f.name)}&background=1a1a2e&color=e50914&size=40`}
                  alt={f.name}
                  className="w-10 h-10 rounded-full object-cover ring-2 ring-white/10"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-on-surface truncate">{f.name}</p>
                  <p className="text-xs text-on-surface-variant/60">{f.total_engagement} engagements</p>
                </div>
                {f.badge && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold"
                    style={{ backgroundColor: `${f.badge.color}22`, color: f.badge.color, border: `1px solid ${f.badge.color}55` }}>
                    <Icon name="emoji_events" className="w-3 h-3" /> {f.badge.label}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Followers / Following Modal Trigger */}
      {(listType === 'followers' || listType === 'following') && list.length > 0 && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm" onClick={closeList}>
          <div className="max-w-md mx-auto mt-20 bg-surface-container rounded-2xl border border-white/10 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <h3 className="font-label-md text-label-md text-on-surface">{listType === 'followers' ? 'Followers' : 'Following'}</h3>
              <button onClick={closeList} className="p-1 rounded-full hover:bg-white/10 transition-colors">
                <Icon name="close" className="w-6 h-6 text-on-surface-variant" />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {list.map((u) => (
                <button
                  key={u.id}
                  onClick={() => { navigate(`/creators/${u.id}`); closeList(); }}
                  className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-colors border-b border-white/5"
                >
                  <img
                    src={u.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}&background=1a1a2e&color=e50914&size=40`}
                    alt={u.name}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-on-surface truncate">{u.name}</p>
                    {u.bio && <p className="text-xs text-on-surface-variant/60 truncate">{u.bio}</p>}
                  </div>
                  {u.isFollowing && (
                    <span className="text-xs text-on-surface-variant/50">Following</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}