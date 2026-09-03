import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { getTrendingFeed, getNowPlaying, getDetails, getHomeNews, getCategoryMovies, getDiscover, getHollywood, getNollywood } from '../lib/api'
import { getContinueWatching } from '../lib/auth'
import { useAuth } from '../lib/AuthContext'
import { useStore } from '../store/useStore'
import HeroBanner from '../components/features/HeroBanner'
import ContentRow from '../components/features/ContentRow'
import NewsRow from '../components/features/NewsRow'
import HoverCard from '../components/features/HoverCard'
import Icon from '../components/ui/Icon'
import OnboardingTour from '../components/ui/OnboardingTour'
import type { MediaItem, MediaDetails } from '../types'
import type { NewsArticle } from '../lib/api'

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

const HERO_COUNT = 6

export default function Home() {
  const [heroItems, setHeroItems] = useState<MediaDetails[]>([])
  const continueWatching = useStore((s) => s.continueWatching)
  const [serverContinueWatching, setServerContinueWatching] = useState<any[] | null>(null)
  const [cwLoading, setCwLoading] = useState(true)
  const { user } = useAuth()
  const watchlist = useStore((s) => s.watchlist)
  const currentProfileId = useStore((s) => s.currentProfile)
  const profiles = useStore((s) => s.profiles)
  const [trendingMovies, setTrendingMovies] = useState<MediaItem[]>([])
  const [trendingTV, setTrendingTV] = useState<MediaItem[]>([])
  const [nowPlaying, setNowPlaying] = useState<MediaItem[]>([])
  const [horrorMovies, setHorrorMovies] = useState<MediaItem[]>([])
  const [indieMovies, setIndieMovies] = useState<MediaItem[]>([])
  const [anime, setAnime] = useState<MediaItem[]>([])
  const [classicMovies, setClassicMovies] = useState<MediaItem[]>([])
  const [hollywood, setHollywood] = useState<MediaItem[]>([])
  const [nollywood, setNollywood] = useState<MediaItem[]>([])
  const [newsArticles, setNewsArticles] = useState<NewsArticle[]>([])
  const [loading, setLoading] = useState(true)
  const [showScrollLeft, setShowScrollLeft] = useState(false)
  const [showScrollRight, setShowScrollRight] = useState(true)
  const cwScrollRef = useRef<HTMLDivElement>(null)
  const userName = profiles.find((p) => p.id === currentProfileId)?.name || 'You'

  const scrollCW = (dir: 'left' | 'right') => {
    if (!cwScrollRef.current) return
    const amount = cwScrollRef.current.clientWidth * 0.75
    cwScrollRef.current.scrollBy({
      left: dir === 'left' ? -amount : amount,
      behavior: 'smooth',
    })
  }

  const handleCWScroll = () => {
    if (!cwScrollRef.current) return
    const { scrollLeft, scrollWidth, clientWidth } = cwScrollRef.current
    setShowScrollLeft(scrollLeft > 10)
    setShowScrollRight(scrollLeft < scrollWidth - clientWidth - 10)
  }

  useEffect(() => {
    if (!user) {
      setServerContinueWatching([])
      setCwLoading(false)
      return
    }
    setCwLoading(true)
    const token = localStorage.getItem('novaflix-token') || ''
    getContinueWatching(token).then((res) => {
      if (res.success && Array.isArray(res.history)) {
        setServerContinueWatching(res.history)
      } else {
        setServerContinueWatching([])
      }
    }).catch(() => {
      setServerContinueWatching([])
    }).finally(() => {
      setCwLoading(false)
    })
  }, [user])

  // Map server data to UI shape
  const serverMapped = (serverContinueWatching ?? []).map((h) => ({
    id: Number(h.content_id),
    title: h.title || '',
    poster: h.poster,
    type: h.type === 'tv' ? 'tv' : 'movie',
    season: h.season != null ? Number(h.season) : undefined,
    episode: h.episode != null ? Number(h.episode) : undefined,
    progress: Number(h.position_seconds || 0),
    duration: Number(h.duration_seconds || 0),
  }))

  // Hydration-aware: local fallback first paint, then server truth
  const cwItems: any[] = serverContinueWatching === null
    ? continueWatching // first paint: local fallback to prevent layout shift
    : serverMapped // after hydration: server is truth; empty array hides section

  useEffect(() => {
    async function load() {
      setLoading(true)
      const timeout = (p: Promise<any>) => Promise.race([
        p,
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 20000)),
      ])

      const settle = async (p: Promise<any>) => {
        try { return await timeout(p) } catch { return { success: false } }
      }

      const [trendingRes, nowPlayingRes, newsRes, horrorRes, indieRes, animeRes, classicRes, hollywoodRes, nollywoodRes] = await Promise.all([
        settle(getTrendingFeed()),
        settle(getNowPlaying()),
        settle(getHomeNews()),
        settle(getCategoryMovies('27', 'movie')),
        settle(getDiscover({ type: 'movie', with_companies: '1549' })),
        settle(getDiscover({ type: 'movie', genre_id: '16', with_original_language: 'ja' })),
        settle(getDiscover({ type: 'movie', sort_by: 'vote_average.desc', min_votes: 1000, primary_release_date_lte: '1999-12-31' })),
        settle(getHollywood()),
        settle(getNollywood()),
      ])

      const movies = trendingRes && trendingRes.success ? trendingRes.data.movies.slice(0, 20) : []
      const tv = trendingRes && trendingRes.success ? trendingRes.data.tv.slice(0, 20) : []
      const np = nowPlayingRes && nowPlayingRes.success ? nowPlayingRes.data.slice(0, 20) : []
      const horror = horrorRes && horrorRes.success ? horrorRes.data.slice(0, 20) : []
      const indie = indieRes && indieRes.success ? indieRes.data.slice(0, 20) : []
      const animeList = animeRes && animeRes.success ? animeRes.data.slice(0, 20) : []
      const classics = classicRes && classicRes.success ? classicRes.data.slice(0, 20) : []
      const holly = hollywoodRes && hollywoodRes.success ? hollywoodRes.data.slice(0, 20) : []
      const nolly = nollywoodRes && nollywoodRes.success ? nollywoodRes.data.slice(0, 20) : []
      if (newsRes && newsRes.success) setNewsArticles(newsRes.articles || [])

      setTrendingMovies(movies)
      setTrendingTV(tv)
      setNowPlaying(np)
      setHorrorMovies(horror)
      setIndieMovies(indie)
      setAnime(animeList)
      setClassicMovies(classics)
      setHollywood(holly)
      setNollywood(nolly)

      const heroCandidates = shuffleArray([...np.slice(0, 8), ...movies.slice(0, 8)]).slice(0, HERO_COUNT)

      if (heroCandidates.length > 0) {
        try {
          const detailResults = await Promise.all(
            heroCandidates.map((item) => timeout(getDetails(String(item.id), item.type)))
          )
          setHeroItems(
            detailResults
              .filter((r) => r.success && r.data)
              .map((r) => r.data)
              .slice(0, HERO_COUNT)
          )
        } catch { /* hero is best-effort */ }
      }

      setLoading(false)
    }
    load()

    const poll = setInterval(() => {
      getHomeNews().then((res) => {
        if (res.success && res.articles) setNewsArticles((prev) => {
          const seen = new Set(prev.map((a) => a.id))
          const fresh = res.articles.filter((a) => !seen.has(a.id))
          return fresh.length ? [...fresh, ...prev].slice(0, 12) : prev
        })
      })
    }, 60000)
    return () => clearInterval(poll)
  }, [])

  return (
    <div className="min-h-screen">
      <HeroBanner items={heroItems} loading={loading} />

      <main className="relative z-20 space-y-16 pb-nav">
        {/* Continue Watching — skeleton while hydrating, hide completely when empty */}
        {!cwLoading && cwItems.length === 0 ? null : (
          <section className="relative mb-8 md:mb-10 px-margin-mobile md:px-margin-desktop max-w-container-max mx-auto" aria-hidden={cwLoading}>
            {cwLoading && cwItems.length === 0 && (
              <div className="h-[212px] animate-pulse bg-surface-container-high/50 rounded-2xl" aria-hidden="true" />
            )}
            {!cwLoading && cwItems.length > 0 && (
              <>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-headline-md text-on-surface flex items-center gap-2">
                    Continue Watching for {userName}
                    <Icon name="chevron_right" className="text-primary" />
                  </h2>
                  <Link
                    to="/watchlist"
                    className="font-label-md text-label-md text-primary hover:underline transition-colors"
                  >
                    View All
                  </Link>
                </div>

                <div className="relative group">
                  {showScrollLeft && (
                    <button
                      onClick={() => scrollCW('left')}
                      className="absolute left-0 top-0 bottom-0 z-10 w-12 md:w-16 bg-gradient-to-r from-background to-transparent flex items-center justify-start pl-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                      aria-label="Scroll left"
                    >
                      <Icon name="chevron_left" className="text-on-surface" />
                    </button>
                  )}

                  <div
                    ref={cwScrollRef}
                    onScroll={handleCWScroll}
                    className="flex gap-4 overflow-x-auto hide-scrollbar pb-4 snap-x"
                  >
                    {cwItems.map((cw, i) => {
                      const resumeUrl = `/watch?id=${cw.id}&type=${cw.type}${cw.season ? `&season=${cw.season}` : ''}${cw.episode ? `&episode=${cw.episode}` : ''}${cw.progress > 0 ? `&resume=${Math.round(cw.progress)}` : ''}`
                      return (
                        <HoverCard
                          key={`${cw.id}-${cw.type}`}
                          item={{
                            id: cw.id,
                            title: cw.title,
                            poster: cw.poster,
                            backdrop: null,
                            type: cw.type,
                            year: '',
                            overview: '',
                          }}
                          index={i}
                          progress={cw.progress}
                          duration={cw.duration}
                          watchUrl={resumeUrl}
                        />
                      )
                    })}
                  </div>

                  {showScrollRight && (
                    <button
                      onClick={() => scrollCW('right')}
                      className="absolute right-0 top-0 bottom-0 z-10 w-12 md:w-16 bg-gradient-to-l from-background to-transparent flex items-center justify-end pr-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                      aria-label="Scroll right"
                    >
                      <Icon name="chevron_right" className="text-on-surface" />
                    </button>
                  )}
                </div>
              </>
            )}
          </section>
        )}

        {trendingMovies.length > 0 && (
          <ContentRow
            title="Trending Now"
            items={trendingMovies.slice(0, 20)}
            link="/discover?sort=trending"
          />
        )}

        {newsArticles.length > 0 && (
          <NewsRow
            title="Latest Movie News"
            articles={newsArticles}
            loading={false}
            link="/news"
          />
        )}

        {watchlist.length > 0 && (
          <ContentRow
            title="Because You Watched"
            items={shuffleArray([...trendingMovies, ...trendingTV]).slice(0, 10)}
            link="/discover"
          />
        )}

        {nowPlaying.length > 0 && (
          <ContentRow
            title="Now Playing"
            items={nowPlaying}
            link="/search?type=movie"
          />
        )}

        {trendingTV.length > 0 && (
          <ContentRow
            title="Popular TV Shows"
            items={trendingTV}
            link="/tv-shows"
          />
        )}

        {trendingMovies.length > 0 && (
          <ContentRow
            title="Top Rated Movies"
            items={shuffleArray(trendingMovies).slice(0, 20)}
            link="/discover?sort=top_rated"
          />
        )}

        {hollywood.length > 0 && (
          <ContentRow
            title="Hollywood"
            items={hollywood}
            link="/discover?origin=US"
          />
        )}

        {nollywood.length > 0 && (
          <ContentRow
            title="Nollywood"
            items={nollywood}
            link="/discover?origin=NG"
          />
        )}

        {horrorMovies.length > 0 && (
          <ContentRow
            title="Horror Movies"
            items={horrorMovies}
            link="/discover?genre_id=27"
          />
        )}

        {indieMovies.length > 0 && (
          <ContentRow title="Indie Films" items={indieMovies} />
        )}

        {anime.length > 0 && (
          <ContentRow title="Anime" items={anime} link="/discover?genre_id=16" />
        )}

        {classicMovies.length > 0 && (
          <ContentRow title="Classic Movies" items={classicMovies} />
        )}
      </main>

      <OnboardingTour
        storageKey="novaflix-onboarding-home"
        steps={[
          {
            targetSelector: '.flex.gap-4.overflow-x-auto',
            title: 'Browse & Discover',
            description: 'Click any movie or TV show card to explore details, ratings, trailers, and similar recommendations.',
            placement: 'top',
          },
        ]}
      />
    </div>
  )
}
