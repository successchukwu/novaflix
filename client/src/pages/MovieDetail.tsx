import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { getDetails, API_BASE } from '../lib/api'
import { getCredits } from '../lib/api'
import type { CastMember, CrewMember } from '../lib/api'
import { getSimilarRecommendations, checkAchievements } from '../lib/auth'
import { getStreamSource } from '../lib/api'
import { useStore } from '../store/useStore'
import { useAuth } from '../lib/AuthContext'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import RatingBadge from '../components/ui/RatingBadge'
import PremiumBadge from '../components/ui/PremiumBadge'
import Skeleton from '../components/ui/Skeleton'
import Icon from '../components/ui/Icon'
import SeasonEpisodeSelector from '../components/features/SeasonEpisodeSelector'
import TipButton from '../components/ui/TipButton'
import LikeButton from '../components/features/LikeButton'
import HoverCard from '../components/features/HoverCard'
import RecommendationGrid from '../components/features/RecommendationGrid'
import CommentSection from '../components/features/CommentSection'
import CastCrew from '../components/features/CastCrew'
import CreatorCard from '../components/ui/CreatorCard'
import ShareButton from '../components/ui/ShareButton'
import { isMobileBrowser, routeToStore } from '../lib/platform'
import type { MediaDetails } from '../types'
import SEOMeta from '../components/ui/SEOMeta'
import VideoPlayer from '../components/features/VideoPlayer'

export default function MovieDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const pathType = window.location.pathname.startsWith('/tv/') ? 'tv' : 'movie'
  const type = (searchParams.get('type') || pathType) as 'movie' | 'tv'
  const seasonParam = searchParams.get('season')
  const episodeParam = searchParams.get('episode')
  const { user } = useAuth()
  const addToWatchlist = useStore((s) => s.addToWatchlist)
  const watchlist = useStore((s) => s.watchlist)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['details', id, type],
    queryFn: () => getDetails(id!, type),
    enabled: !!id,
    retry: 1,
  })

  // fetchJson never throws — failures arrive as { success:false, error }.
  // Capture both shapes so the error UI can explain WHY details are missing
  // (e.g. TMDB token missing → 'Failed to resolve metadata from TMDB').
  const detailsError = error?.message || (data && data.success === false ? (data as any).error : null)
  const details = data?.success ? data.data : null
  const inWatchlist = details ? watchlist.some((w) => w.id === details.id) : false

  const { data: similarData } = useQuery({
    queryKey: ['similar', id, details?.type],
    queryFn: () => getSimilarRecommendations(id!, details?.type),
    enabled: !!id && !!details?.type,
  })
  const similarItems = similarData?.data || []

  const { data: creditsData } = useQuery({
    queryKey: ['credits', id, details?.type],
    queryFn: () => getCredits(id!, details!.type),
    enabled: !!id && !!details?.type,
  })
  const cast = creditsData?.success ? (creditsData.cast as CastMember[]) : []
  const crew = creditsData?.success ? (creditsData.crew as CrewMember[]) : []

  // Batch check which cast members have internal creator profiles
  const tmdbIds = cast.slice(0, 20).map(c => c.id).join(',')
  const { data: batchCheck } = useQuery({
    queryKey: ['creator-batch-check', tmdbIds],
    queryFn: () => fetch(`${API_BASE}/tmdb/creator/batch-check?tmdbIds=${tmdbIds}`).then(r => r.json()),
    enabled: !!tmdbIds,
  })
  const linkedCreators: Record<number, string> = batchCheck?.creators || {}

  const [showTrailer, setShowTrailer] = useState(false)

  const handleWatch = (season?: number, episode?: number) => {
    if (!user) {
      navigate(`/login?redirect=/movie/${id}?type=${type}`)
      return
    }
    let url = `/watch?id=${id}&type=${type}`
    if (season) url += `&season=${season}`
    if (episode) url += `&episode=${episode}`
    if (type === 'tv' && !season) url += '&season=1'
    if (type === 'tv' && !episode) url += '&episode=1'
    navigate(url)
  }

  const handleDownload = () => {
    if (isMobileBrowser()) {
      routeToStore()
      return
    }
    navigate('/download-app')
  }

  const handleAddToWatchlist = () => {
    if (!user) {
      navigate(`/login?redirect=/movie/${id}?type=${type}`)
      return
    }
    if (!inWatchlist && details) {
      addToWatchlist({
        id: details.id,
        title: details.title,
        poster: details.poster,
        type: details.type,
        year: details.year,
      })
      checkAchievements()
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <Skeleton variant="hero" className="w-full h-[50vh] rounded-none" />
        <div className="px-margin-mobile md:px-margin-desktop -mt-32 relative z-10">
          <div className="flex gap-8">
            <Skeleton variant="poster" className="w-[200px] hidden md:block" />
            <div className="flex-1">
              <Skeleton variant="text" className="w-96 h-10 mb-4" />
              <Skeleton variant="text" className="w-64 h-4 mb-2" />
              <Skeleton variant="text" className="w-full max-w-xl h-4 mb-6" />
              <Skeleton variant="text" className="w-48 h-10 rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error || !details) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <Icon name="error" className="text-on-surface-variant/30 mx-auto mb-4" />
          <p className="text-xl text-on-surface mb-2">Failed to load details</p>
          {detailsError && (
            <p className="text-sm text-on-surface-variant mb-6 break-words">{detailsError}</p>
          )}
          <div className="flex items-center justify-center gap-3">
            <Button onClick={() => refetch()}>Retry</Button>
            <Button variant="outline" onClick={() => navigate(-1)}>Go Back</Button>
          </div>
        </div>
      </div>
    )
  }

  const backdrop = details.backdrop
    ? `https://image.tmdb.org/t/p/original${details.backdrop}`
    : null

  const poster = details.poster
    ? `https://image.tmdb.org/t/p/w500${details.poster}`
    : null

  const runtimeStr = details.runtime
    ? `${Math.floor(details.runtime / 60)}h ${details.runtime % 60}m`
    : null

  return (
    <>
      <SEOMeta type="movie" data={details} />
      <div className="min-h-screen">
        {/* Hero Section */}
      <section className="relative w-full h-[618px] md:h-[751px] overflow-hidden">
        {backdrop ? (
          <div className="absolute inset-0 w-full h-full">
            <img src={backdrop} alt={details.title} className="w-full h-full object-cover" />
            <div className="absolute inset-0 hero-gradient" />
            <div className="absolute inset-0 hero-gradient-right" />
          </div>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary-container/20 to-surface" />
        )}

        <button
          onClick={() => navigate(-1)}
          className="absolute top-6 left-4 md:left-8 z-20 p-3 rounded-xl bg-black/40 backdrop-blur-sm text-white hover:bg-black/60 transition-colors"
          aria-label="Go back"
        >
          <Icon name="arrow_back" />
        </button>

        <div className="absolute bottom-0 left-0 w-full px-margin-mobile md:px-margin-desktop pb-12 md:pb-24 max-w-4xl z-10">
          <div className="flex items-center gap-3 mb-4">
            <span className="px-2 py-1 bg-surface-container-highest rounded text-[10px] font-bold tracking-widest text-on-surface uppercase">
              {type === 'tv' ? 'TV Series' : 'Original Film'}
            </span>
            <div className="flex items-center gap-1 text-secondary">
              <Icon name="star" fill={true} size="sm" />
              <span className="font-label-md text-label-md">{details.rating.toFixed(1)} Rating</span>
            </div>
          </div>
          <h1 className="text-headline-lg-mobile md:text-display-lg drop-shadow-lg mb-6">{details.title}</h1>
          <div className="flex flex-wrap items-center gap-4 mb-8 text-on-surface-variant font-label-md text-label-md">
            <span className="text-secondary font-bold">{details.year}</span>
            <span className="px-1.5 border border-on-surface-variant rounded text-[10px] py-0.5">18+</span>
            {runtimeStr && <span>{runtimeStr}</span>}
            <span>4K Ultra HD</span>
            <span>Dolby Atmos</span>
          </div>
          <p className="text-body-lg text-on-surface-variant max-w-2xl mb-10 line-clamp-3 md:line-clamp-none">
            {details.overview}
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={() => handleWatch()}
              className="flex items-center justify-center gap-2 px-8 py-4 bg-primary-container text-on-primary-container rounded-lg font-bold text-lg hover:brightness-110 active:scale-95 transition-all shadow-lg"
            >
              <Icon name="play_arrow" fill={true} /> Play Now
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center justify-center gap-2 px-8 py-4 rounded-lg font-bold text-lg border transition-all shadow-md bg-surface-variant/40 backdrop-blur-md text-on-surface border-white/10 hover:bg-surface-variant/60 active:scale-95"
              title="Get the Novaflix app to download"
            >
              <Icon name="download" /> Download
            </button>
            <button
              onClick={handleAddToWatchlist}
              className="flex items-center justify-center w-14 h-14 bg-surface-variant/40 backdrop-blur-md text-on-surface rounded-full border border-white/10 hover:bg-surface-variant/60 active:scale-90 transition-all"
            >
              <Icon name={inWatchlist ? 'check' : 'add'} />
            </button>
            <button
              onClick={() => {
                const code = Math.random().toString(36).substring(2, 8).toUpperCase()
                navigate(`/watch-party?room=${code}&id=${id}&type=${type}${seasonParam ? `&season=${seasonParam}` : ''}${episodeParam ? `&episode=${episodeParam}` : ''}`)
              }}
              className="flex items-center justify-center gap-2 px-6 py-4 rounded-lg font-bold text-lg border border-primary/30 text-primary hover:bg-primary/10 active:scale-95 transition-all shadow-md"
              title="Create Watch Party"
            >
              <Icon name="diversity_3" /> Watch Party
            </button>
          </div>
        </div>
      </section>

      {/* Content Section */}
      <section className="px-margin-mobile md:px-margin-desktop -mt-10 relative z-10 space-y-16 pb-32">
        {/* Trailer */}
        {details.trailerKey && (
          <div className="aspect-video rounded-xl overflow-hidden bg-black relative">
            <img
              src={`https://img.youtube.com/vi/${details.trailerKey}/maxresdefault.jpg`}
              alt={`${details.title} Trailer`}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
            <button
              onClick={() => setShowTrailer(true)}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full bg-primary-container/90 flex items-center justify-center hover:scale-110 transition-transform backdrop-blur-sm"
              aria-label="Watch trailer"
            >
              <Icon name="play_arrow" fill={true} className="text-on-primary-container w-8 h-8 ml-1" />
            </button>
          </div>
        )}

        {/* Cast & Crew */}
        {(cast.length > 0 || crew.length > 0) && (
          <div className="bg-surface-container p-8 rounded-xl border border-white/5">
            <h3 className="text-headline-md mb-4">Cast & Crew</h3>
            <CastCrew cast={cast} crew={crew} linkedCreators={linkedCreators} />
          </div>
        )}

        {/* Info */}
        <div className="bg-surface-container p-8 rounded-xl border border-white/5 space-y-6">
          <h3 className="text-headline-md">Synopsis</h3>
          <p className="text-body-md text-on-surface-variant leading-relaxed">{details.overview}</p>
          <div className="pt-4 grid grid-cols-2 sm:grid-cols-4 gap-6">
            <div>
              <span className="block text-[10px] uppercase tracking-wider text-on-surface-variant mb-1">Rating</span>
              <span className="font-label-md text-label-md text-primary">{details.rating.toFixed(1)} / 10</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase tracking-wider text-on-surface-variant mb-1">Year</span>
              <span className="font-label-md text-label-md text-on-surface">{details.year}</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase tracking-wider text-on-surface-variant mb-1">Genres</span>
              <span className="font-label-md text-label-md text-on-surface">{details.genres.join(', ')}</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase tracking-wider text-on-surface-variant mb-1">Type</span>
              <span className="font-label-md text-label-md text-on-surface">{type === 'tv' ? 'TV Series' : 'Movie'}</span>
            </div>
            {details.rating >= 8 && (
              <div className="sm:col-span-4 pt-2">
                <PremiumBadge size="md" label="Premium Content" />
              </div>
            )}
          </div>
        </div>

        {/* Creator Card */}
        <div className="grid md:grid-cols-2 gap-4">
          <CreatorCard
            name="Jane Doe"
            bio="Independent filmmaker & visual storyteller"
            filmCount={4}
            followers={2847}
            location="Los Angeles, CA"
            creatorId={user?.id}
          />
          <TipButton creatorId={user?.id} recipientName={details.title} />
        </div>

        {/* Comments */}
        <CommentSection contentId={details.id} contentType={details.type} />

        {/* Engagement */}
        <section className="bg-surface-container-high p-8 rounded-xl border border-white/5">
          <h3 className="font-label-md text-label-md text-on-surface-variant uppercase tracking-widest mb-6">Engagement</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-on-surface-variant font-label-sm">Popularity</span>
                <span className="text-secondary font-bold">#1 Today</span>
              </div>
              <div className="w-full bg-white/10 h-1 rounded-full overflow-hidden">
                <div className="bg-secondary h-full w-[92%]" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-on-surface-variant font-label-sm">Critical Score</span>
                <span className="text-on-surface font-bold">{Math.round(details.rating * 10)}/100</span>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 md:justify-end">
              <LikeButton contentId={details.id} contentType={details.type} className="w-full" />
              <ShareButton contentId={details.id} contentType={details.type} className="w-full" />
              <button className="w-full py-3 rounded-lg border border-primary/30 text-primary font-label-md hover:bg-primary/10 transition-colors">
                Rate this Movie
              </button>
            </div>
          </div>
        </section>

        {/* Season/Episode Selector for TV */}
        {details.type === 'tv' && details.seasons && details.seasons.length > 0 && (
          <div>
            <h2 className="text-headline-md mb-4">Episodes</h2>
            <SeasonEpisodeSelector
              id={id!}
              seasons={details.seasons}
              onSelect={(season, episode) => handleWatch(season, episode)}
            />
          </div>
        )}

        {/* More Like This */}
        {similarItems.length > 0 && (
          <div className="space-y-8">
            <RecommendationGrid
              title="More Like This"
              viewAllLink={`/discover?similar_to=${id}&type=${details.type}`}
            >
              {similarItems.slice(0, 12).map((item: any, i: number) => (
                <HoverCard
                  key={`${item.id}-${item.type}`}
                  item={item}
                  index={i}
                  className="w-full min-w-0"
                />
              ))}
            </RecommendationGrid>
          </div>
        )}
      </section>

        {/* Trailer Modal */}
        {showTrailer && details.trailerKey && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
            onClick={() => setShowTrailer(false)}
            role="dialog"
            aria-modal="true"
            aria-label={`${details.title} Trailer`}
          >
            <div className="relative w-full max-w-5xl mx-4 aspect-video" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setShowTrailer(false)}
                className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white"
                aria-label="Close trailer"
              >
                <Icon name="close" className="w-6 h-6" />
              </button>
              <iframe
                src={`https://www.youtube.com/embed/${details.trailerKey}?autoplay=1&rel=0&modestbranding=1`}
                title={`${details.title} Trailer`}
                className="w-full h-full rounded-xl"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          </div>
        )}

      </div>
    </>
  )
}
