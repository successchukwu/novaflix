import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Icon from '../components/ui/Icon'
import { getStreamSource, getManifestInfo, getTVSeason, getDetails, kickSession } from '../lib/api'
import type { ActiveSession } from '../lib/api'
import { useStore } from '../store/useStore'
import { useAuth } from '../lib/AuthContext'
import { recordWatch, getEggs, collectEgg } from '../lib/auth'
import { WS_ORIGIN } from '../lib/config'
import { isMobileBrowser, routeToStore } from '../lib/platform'
import VideoPlayer from '../components/features/VideoPlayer'
import BingePassModal from '../components/features/BingePassModal'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import Skeleton from '../components/ui/Skeleton'
import Modal from '../components/ui/Modal'
import OnboardingTour from '../components/ui/OnboardingTour'
import type { Variant, Episode, EggPlacement } from '../types'
import { AdWarningBanner } from '../components/features/AdWarningBanner'
import { MidRollWarningBanner } from '../components/features/MidRollWarningBanner'
import { AdUpsellBanner } from '../components/features/AdUpsellBanner'

export default function Watch() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const id = searchParams.get('id') || ''
  const type = searchParams.get('type') || 'movie'
  const seasonParam = searchParams.get('season')
  const episodeParam = searchParams.get('episode')
  const season = seasonParam || undefined
  const episode = episodeParam || undefined
  const resumeParam = searchParams.get('resume')
  const resumeSeconds = resumeParam ? Number(resumeParam) : 0

  // Defensive: TV shows need season/episode
  useEffect(() => {
    if (type === 'tv' && id && (!seasonParam || !episodeParam)) {
      navigate(`/watch?id=${id}&type=tv&season=1&episode=1`, { replace: true })
    }
  }, [])

  const [showEpisodes, setShowEpisodes] = useState(false)
  const [showQuality, setShowQuality] = useState(false)
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null)
  const [currentStreamUrl, setCurrentStreamUrl] = useState<string>('')
  const [manifestVariants, setManifestVariants] = useState<Variant[]>([])
  const [showBingePass, setShowBingePass] = useState(false)
  const [bingePassActive, setBingePassActive] = useState(false)
  const [adPlaying, setAdPlaying] = useState(false)
  const [adWarning, setAdWarning] = useState<string | null>(null)
  const [showUpsell, setShowUpsell] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadDone, setDownloadDone] = useState(false)
  const [viewers, setViewers] = useState<any[]>([])
  const [flashes, setFlashes] = useState<{ id: number; name: string; emoji: string }[]>([])
  const [partyInvite, setPartyInvite] = useState<{ fromName: string; room: string } | null>(null)
  const [eggPlacements, setEggPlacements] = useState<EggPlacement[]>([])
  const [collectedEggIds, setCollectedEggIds] = useState<string[]>([])
  const [eggToast, setEggToast] = useState<string | null>(null)
  // Screen-limit modal (Netflix-style: end another session to watch here)
  const [screenLimit, setScreenLimit] = useState<{ sessions: ActiveSession[]; maxScreens?: number } | null>(null)
  const [kickingDevice, setKickingDevice] = useState<string | null>(null)
  const addToContinueWatching = useStore((s) => s.addToContinueWatching)
  const { user, planRank } = useAuth()
  const isFreeTier = planRank < 2
  const lastRecordRef = useRef(0)
  const durationRef = useRef(0)
  const presenceWsRef = useRef<WebSocket | null>(null)
  const lastPresenceRef = useRef(0)
  const flashIdRef = useRef(0)

  const { data: detailsData } = useQuery({
    queryKey: ['details', id, type],
    queryFn: () => getDetails(id, type as 'movie' | 'tv'),
    enabled: !!id,
  })

  const details = detailsData?.success ? detailsData.data : null

  const { data: episodesData } = useQuery({
    queryKey: ['tv-season', id, season],
    queryFn: () => getTVSeason(id, season!),
    enabled: type === 'tv' && !!season && !!id,
  })

  const episodes: Episode[] = episodesData?.episodes || []

  const { data: sourceData, isLoading: sourceLoading, error: sourceError } = useQuery({
    queryKey: ['source', id, type, season, episode],
    queryFn: () => getStreamSource(id, type, season, episode),
    enabled: !!id,
    retry: 1,
    retryDelay: 1000,
  })

  useEffect(() => {
    if (!sourceData?.success) return

    // Concurrent-screen limit hit → offer to end another session
    if ((sourceData as any).code === 'screen_limit_reached') {
      setScreenLimit({
        sessions: ((sourceData as any).activeSessions || []) as ActiveSession[],
        maxScreens: (sourceData as any).maxScreens,
      })
      return
    }

    if (sourceData.streamUrl) {
      setCurrentStreamUrl(sourceData.streamUrl)

      if (planRank < 2 && !bingePassActive) {
        setShowBingePass(true)
      }

      getManifestInfo(sourceData.directUrl || sourceData.streamUrl, id, type, season, episode, user?.plan)
        .then((manifest) => {
          if (manifest.success && manifest.variants.length > 0) {
            setManifestVariants(manifest.variants)
            setSelectedVariant(manifest.variants[manifest.variants.length - 1])
          }
        })
        .catch(() => {})
    }
  }, [sourceData, id, type, season, episode])

  useEffect(() => {
    if (details && currentStreamUrl) {
      addToContinueWatching({
        id: details.id,
        title: details.title,
        poster: details.poster,
        type: details.type,
        season: season ? Number(season) : undefined,
        episode: episode ? Number(episode) : undefined,
        progress: 0,
        duration: 0,
      })
    }
  }, [details, currentStreamUrl, addToContinueWatching, season, episode])

  // Ghost-watcher presence
  useEffect(() => {
    if (!user || !id || !currentStreamUrl) return
    const token = localStorage.getItem('novaflix-token') || ''
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = WS_ORIGIN ? new URL(WS_ORIGIN).host : window.location.host
    const ws = new WebSocket(`${protocol}//${host}/ws?token=${encodeURIComponent(token)}`)

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'presence',
        payload: { contentId: id, name: user.name, avatar: user.avatar || null, currentTime: 0, playing: true },
      }))
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'presence-update') {
          setViewers(msg.viewers || [])
        } else if (msg.type === 'presence-flash') {
          const fid = ++flashIdRef.current
          setFlashes(prev => [...prev, { id: fid, name: msg.name, emoji: msg.emoji || '👋' }])
          setTimeout(() => setFlashes(prev => prev.filter(f => f.id !== fid)), 4000)
        } else if (msg.type === 'watch-party-invite') {
          setPartyInvite({ fromName: msg.fromName, room: msg.room })
        }
      } catch {}
    }

    ws.onclose = () => { if (presenceWsRef.current === ws) presenceWsRef.current = null }
    presenceWsRef.current = ws

    return () => {
      presenceWsRef.current = null
      ws.close()
      setViewers([])
    }
  }, [user, id, currentStreamUrl])

  const handleQualitySelect = (v: Variant) => {
    setSelectedVariant(v)
    setCurrentStreamUrl(v.url)
    setShowQuality(false)
  }

  // Easter-egg placements for this content
  useEffect(() => {
    if (!user || !id) return
    const token = localStorage.getItem('novaflix-token') || ''
    getEggs(token, id).then((res) => {
      if (res.success) {
        setEggPlacements(res.placements || [])
        setCollectedEggIds(res.collected || [])
      }
    }).catch(() => {})
  }, [user, id])

  const handleCollectEgg = async (keyId: string) => {
    if (!user) return
    const token = localStorage.getItem('novaflix-token') || ''
    const res = await collectEgg(token, keyId)
    if (res.success) {
      setCollectedEggIds((prev) => (prev.includes(keyId) ? prev : [...prev, keyId]))
      if (res.alreadyCollected) return
      let msg = 'Key collected! +50 coins'
      if (res.reward) {
        msg = res.reward.type === 'secret_room'
          ? `Secret room unlocked: ${res.reward.name}`
          : `Badge earned: ${res.reward.name}`
      }
      setEggToast(msg)
      setTimeout(() => setEggToast(null), 4000)
    }
  }

  const handleDownload = async () => {
    // Web: all users (free or paid) are routed to download-app; downloads only in mobile app
    if (isMobileBrowser()) {
      routeToStore()
      return
    }
    navigate('/download-app')
  }

  const handleKickAndPlay = async (deviceId: string) => {
    if (!deviceId) return
    setKickingDevice(deviceId)
    try {
      const res = await kickSession(deviceId)
      if (res.success) {
        setScreenLimit(null)
        await queryClient.invalidateQueries({ queryKey: ['source', id, type, season, episode] })
        const refetch = await queryClient.fetchQuery({
          queryKey: ['source', id, type, season, episode],
          queryFn: () => getStreamSource(id, type, season, episode),
          staleTime: 0,
        })
        if (refetch?.success && refetch.streamUrl) setCurrentStreamUrl(refetch.streamUrl)
      }
    } finally {
      setKickingDevice(null)
    }
  }

  const handleEpisodeSelect = (ep: number) => {
    navigate(`/watch?id=${id}&type=${type}&season=${season}&episode=${ep}`)
    setShowEpisodes(false)
  }

  const handleProgress = (time: number) => {
    if (details) {
      // Ghost-watcher presence: throttle position updates to ~5s
      if (user && presenceWsRef.current && presenceWsRef.current.readyState === 1 && time - lastPresenceRef.current > 5) {
        lastPresenceRef.current = time
        presenceWsRef.current.send(JSON.stringify({ type: 'presence', payload: { contentId: id, currentTime: time, playing: true } }))
      }
      addToContinueWatching({
        id: details.id,
        title: details.title,
        poster: details.poster,
        type: details.type,
        season: season ? Number(season) : undefined,
        episode: episode ? Number(episode) : undefined,
        progress: time,
        duration: durationRef.current,
      })

      if (user && time - lastRecordRef.current > 60) {
        lastRecordRef.current = time
        const token = localStorage.getItem('novaflix-token') || ''
        recordWatch(token, {
          contentId: id,
          title: details.title,
          type,
          minutes: 1,
          positionSeconds: Math.round(time),
          durationSeconds: Math.round(durationRef.current),
          poster: details.poster,
          season: season || null,
          episode: episode || null,
        }).catch(() => {})
      }
    }
  }

  const title = details?.title || 'Loading...'
  const episodeInfo = episode ? `S${season} E${episode}` : null

  return (
    <div className="min-h-screen bg-black">
      <div className="flex items-center justify-between px-4 py-3 bg-surface-secondary/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            <Icon name="chevron_left" />
          </button>
          <div>
            <h1 className="text-sm font-semibold">{title}</h1>
            {episodeInfo && (
              <p className="text-xs text-gray-400">{episodeInfo}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {eggPlacements.length > 0 && (
            <button
              onClick={() => navigate('/community')}
              title="Hidden keys in this title — collect them for badges & secret rooms"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/15 text-primary text-xs font-semibold hover:bg-primary/25 transition-colors"
            >
              <Icon name="vpn_key" size="sm" />
              {collectedEggIds.length}/{eggPlacements.length} keys
            </button>
          )}

          {manifestVariants.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowQuality(true)}
            >
              <Icon name="info" />
              {selectedVariant?.label || 'Auto'}
            </Button>
          )}

          {type === 'tv' && episodes.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowEpisodes(true)}
            >
              Episodes
            </Button>
          )}

          <Button
              variant="secondary"
              size="sm"
              onClick={handleDownload}
              disabled={!currentStreamUrl || downloading}
            >
              <Icon name="download" size="sm" />
              {downloading ? 'Saving...' : downloadDone ? 'Downloaded!' : 'Download'}
            </Button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-4">
        {sourceLoading ? (
          <Skeleton variant="hero" className="w-full aspect-video rounded-2xl" />
        ) : sourceError || (sourceData && !sourceData.success) ? (
          (() => {
            const errMsg = sourceData?.error || ''
            if (errMsg.includes('401') || errMsg.includes('Unauthorized') || errMsg.includes('unauthenticated')) {
              navigate(`/login?redirect=/watch?id=${id}&type=${type}${season ? `&season=${season}` : ''}${episode ? `&episode=${episode}` : ''}`, { replace: true })
              return null
            }
            return (
              <div className="flex flex-col items-center justify-center py-20">
                <p className="text-red-400 text-lg font-semibold mb-2">
                  Stream unavailable
                </p>
                <p className="text-gray-500 text-sm mb-6">
                  {sourceData?.error || 'Could not load video source'}
                </p>
                <div className="flex items-center gap-3">
                  <Button
                    variant="secondary"
                    onClick={() => queryClient.invalidateQueries({ queryKey: ['source', id, type, season, episode] })}
                  >
                    Retry
                  </Button>
                  <Button variant="ghost" onClick={() => navigate(-1)}>
                    Go Back
                  </Button>
                </div>
              </div>
            )
          })()
        ) : currentStreamUrl ? (
          <>
            <AdWarningBanner
              secondsRemaining={adWarning ? parseInt(adWarning, 10) : 0}
              onWarningEnd={() => setAdWarning(null)}
            />
            <MidRollWarningBanner
              secondsRemaining={adWarning ? parseInt(adWarning, 10) : 0}
              onWarningEnd={() => setAdWarning(null)}
            />
            <AdUpsellBanner
              visible={showUpsell && isFreeTier}
              onDismiss={() => setShowUpsell(false)}
              onUpgrade={() => navigate('/pricing')}
            />
            <VideoPlayer
              streamUrl={currentStreamUrl}
              subtitles={sourceData?.subtitles || []}
              title={episodeInfo ? `${title} - ${episodeInfo}` : title}
              onProgress={handleProgress}
              onDuration={(d) => { durationRef.current = d }}
              startTime={resumeSeconds}
              plan={user?.plan || 'free'}
              bingePassActive={bingePassActive}
              eggs={eggPlacements}
              collectedEggIds={collectedEggIds}
              onCollectEgg={handleCollectEgg}
              contentId={id}
              adTagUrl={sourceData?.vmapUrl || ''}
              onAdBreakStart={() => setAdPlaying(true)}
              onAdBreakEnd={() => setAdPlaying(false)}
            />
          </>
        ) : null}

        <BingePassModal
          open={showBingePass}
          onClose={() => setShowBingePass(false)}
          onGranted={() => {
            setBingePassActive(true)
            setShowBingePass(false)
          }}
        />

        {/* Screen-limit modal: end another session to watch here */}
        <Modal isOpen={!!screenLimit} onClose={() => setScreenLimit(null)}>
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-accent/15 flex items-center justify-center">
                <Icon name="screen_lock_portrait" className="text-accent text-2xl" />
              </div>
              <div>
                <h3 className="text-title-md font-bold text-on-surface">Screen limit reached</h3>
                {screenLimit?.maxScreens && (
                  <p className="text-body-sm text-on-surface-variant">Your plan allows {screenLimit.maxScreens} screen{screenLimit.maxScreens > 1 ? 's' : ''} at a time</p>
                )}
              </div>
            </div>
            <p className="text-body-md text-on-surface-variant mb-4">
              End a session below to continue watching on this device, or upgrade your plan for more screens.
            </p>
            <div className="space-y-2 mb-5">
              {(screenLimit?.sessions || []).map((s, i) => (
                <div key={s.id} className="flex items-center justify-between bg-surface-container rounded-xl px-4 py-3 border border-outline/10">
                  <div className="min-w-0">
                    <p className="text-body-md text-on-surface truncate max-w-[240px]">
                      {i === 0 ? 'This account' : (s.device_id || 'Unknown device').slice(0, 60)}
                    </p>
                    <p className="text-body-sm text-on-surface-variant">
                      Active {new Date(s.last_heartbeat).toLocaleTimeString()} · IP {s.ip_address || '—'}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={kickingDevice === s.device_id}
                    onClick={() => handleKickAndPlay(s.device_id || '')}
                  >
                    End session
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setScreenLimit(null)}>Cancel</Button>
              <Button className="flex-1" onClick={() => navigate('/pricing')}>Upgrade plan</Button>
            </div>
          </div>
        </Modal>

        {/* Easter-egg reward toast */}
        {eggToast && (
          <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[60] bg-accent text-black text-sm font-semibold px-5 py-3 rounded-full shadow-2xl">
            <Icon name="redeem" className="mr-2" />
            {eggToast}
          </div>
        )}

        {/* Ghost-watcher presence */}
        {(viewers.length > 0 || flashes.length > 0 || partyInvite) && (
          <div className="fixed right-4 bottom-4 z-50 flex flex-col items-end gap-2">
            {viewers.length > 0 && (
              <div className="flex items-center gap-2 bg-black/70 backdrop-blur border border-white/10 rounded-full pl-3 pr-4 py-2">
                <div className="flex -space-x-2">
                  {viewers.slice(0, 4).map((v) =>
                    v.avatar ? (
                      <img key={v.userId} src={v.avatar} alt="" className="w-7 h-7 rounded-full ring-2 ring-black object-cover" />
                    ) : (
                      <div key={v.userId} className="w-7 h-7 rounded-full ring-2 ring-black bg-accent/20 flex items-center justify-center text-xs">
                        {v.name.charAt(0).toUpperCase()}
                      </div>
                    )
                  )}
                </div>
                <span className="text-xs text-gray-300">
                  {viewers.length} ghost{viewers.length > 1 ? 's' : ''} watching now
                </span>
              </div>
            )}
            {flashes.map((f) => (
              <div key={f.id} className="bg-accent/90 text-white text-xs font-medium rounded-full px-3 py-2 shadow-lg animate-bounce">
                {f.name} {f.emoji}
              </div>
            ))}
            {partyInvite && (
              <div className="bg-black/80 backdrop-blur border border-accent/30 rounded-xl p-4 max-w-xs">
                <p className="text-sm text-white mb-2">
                  <span className="font-semibold">{partyInvite.fromName}</span> invited you to a watch party
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => navigate(`/watch-party?code=${partyInvite.room}`)}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-red-700 transition-colors"
                  >
                    Join party
                  </button>
                  <button onClick={() => setPartyInvite(null)} className="px-3 py-1.5 rounded-lg border border-white/20 text-gray-300 text-xs hover:bg-white/10 transition-colors">
                    Later
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <OnboardingTour
        storageKey="novaflix-onboarding-watch"
        steps={[
          {
            targetSelector: '#tour-player',
            title: 'Play & Pause',
            description: 'Press Space or click the video to toggle play and pause.',
            placement: 'top',
          },
          {
            targetSelector: '#tour-player',
            title: 'Seek Anywhere',
            description: 'Click anywhere on the timeline bar to skip ahead or go back.',
            placement: 'bottom',
          },
          {
            targetSelector: '#tour-player',
            title: 'Volume & Mute',
            description: 'Drag the volume slider or press M to mute instantly.',
            placement: 'bottom',
          },
          {
            targetSelector: '#tour-player',
            title: 'Fullscreen',
            description: 'Press F or click the fullscreen button for an immersive experience.',
            placement: 'bottom',
          },
        ]}
      />

      <Modal
        isOpen={showQuality}
        onClose={() => setShowQuality(false)}
        title="Select Quality"
      >
        <div className="space-y-2">
          {manifestVariants.map((v, i) => (
            <button
              key={i}
              onClick={() => handleQualitySelect(v)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-colors ${
                selectedVariant?.url === v.url
                  ? 'bg-accent/10 border border-accent/30'
                  : 'bg-surface-card border border-white/10 hover:border-white/20'
              }`}
            >
              <div className="text-left">
                <p className="text-sm font-medium">{v.label}</p>
                <p className="text-xs text-gray-500">{v.sizeLabel}</p>
              </div>
              {v.compressedLabel !== 'Unknown' && (
                <span className="text-xs text-gray-500">
                  Est. {v.compressedLabel}
                </span>
              )}
            </button>
          ))}
        </div>
      </Modal>

      <Modal
        isOpen={showEpisodes}
        onClose={() => setShowEpisodes(false)}
        title="Episodes"
      >
        <div className="space-y-1 max-h-96 overflow-y-auto">
          {episodes.map((ep) => (
            <button
              key={ep.episode}
              onClick={() => handleEpisodeSelect(ep.episode)}
              className={`w-full text-left px-4 py-3 rounded-xl transition-colors ${
                Number(episodeParam) === ep.episode
                  ? 'bg-accent/10 text-accent'
                  : 'hover:bg-white/5 text-gray-300'
              }`}
            >
              <span className="text-xs text-gray-500 font-mono mr-3">
                {ep.episode.toString().padStart(2, '0')}
              </span>
              {ep.name}
            </button>
          ))}
        </div>
      </Modal>
    </div>
  )
}
