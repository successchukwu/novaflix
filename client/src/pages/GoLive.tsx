import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import Icon from '../components/ui/Icon'
import Skeleton from '../components/ui/Skeleton'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import { useToast } from '../components/ui/Toast'
import { getToken, getStreamKey, regenerateStreamKey, getStreamStatus, startStream, endStream, getLiveStreamInfo } from '../lib/auth'
import { subscribeCreator } from '../lib/creatorLive'

const NAV = [
  { path: '/creator', label: 'Dashboard', icon: 'dashboard' },
  { path: '/creator/analytics', label: 'Analytics', icon: 'monitoring' },
  { path: '/creator/catalog', label: 'Catalog', icon: 'movie' },
  { path: '/creator/wallet', label: 'Wallet', icon: 'account_balance_wallet' },
  { path: '/creator/ppm', label: 'PPM', icon: 'tune' },
  { path: '/creator/onboarding', label: 'Onboarding', icon: 'rocket_launch' },
  { path: '/creator/go-live', label: 'Go Live', icon: 'podcasts' },
]

export default function GoLive() {
  const nav = useNavigate()
  const loc = useLocation()
  const toast = useToast()
  const [key, setKey] = useState('')
  const [url, setUrl] = useState('')
  const [live, setLive] = useState(false)
  const [stream, setStream] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showKey, setShowKey] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [confirmRegen, setConfirmRegen] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [viewers, setViewers] = useState(0)
  const [starting, setStarting] = useState(false)
  const [ending, setEnding] = useState(false)
  const [ingest, setIngest] = useState<any>(null)
  const [delivery, setDelivery] = useState<any>(null)
  const [proto, setProto] = useState('rtmp')

  const load = async () => {
    const token = getToken()
    if (!token) { setLoading(false); return }
    const [k, s] = await Promise.all([getStreamKey(token), getStreamStatus(token)])
    if (k.success) { setKey(k.streamKey); setUrl(k.streamUrl) }
    if (s.success) { setLive(s.live); setStream(s.stream); setViewers(s.stream?.viewer_count || 0) }
    const info = await getLiveStreamInfo(token)
    if (info.success) { setIngest(info.ingest); setDelivery(info.delivery) }
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    return subscribeCreator('live', (msg) => {
      if (msg.action === 'key-regenerated') load()
      if (msg.action === 'started') { setLive(true); setStream(msg.stream); setViewers(msg.stream?.viewer_count || 0) }
      if (msg.action === 'ended') { setLive(false); setStream(null); setViewers(0) }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleRegenerate = async () => {
    const token = getToken()
    if (!token) return
    setRegenerating(true)
    const r = await regenerateStreamKey(token)
    setRegenerating(false)
    setConfirmRegen(false)
    if (r.success) { setKey(r.streamKey); setUrl(r.streamUrl); toast.success('Stream key regenerated') }
    else toast.error(r.error || 'Failed to regenerate')
  }

  const copy = (text: string, label: string) => {
    navigator.clipboard?.writeText(text).then(() => { setCopied(label); setTimeout(() => setCopied(null), 1500) })
  }

  const handleStart = async () => {
    const token = getToken()
    if (!token) return
    setStarting(true)
    const r = await startStream(token, { title, category: 'general' })
    setStarting(false)
    if (r.success) {
      setLive(true)
      setStream(r.stream)
      setViewers(r.stream?.viewer_count || 0)
      const info = await getLiveStreamInfo(token)
      if (info.success) { setIngest(info.ingest); setDelivery(info.delivery) }
      toast.success('Stream started — you are live!')
    } else {
      toast.error(r.error || 'Failed to start stream')
    }
  }

  const handleEnd = async () => {
    const token = getToken()
    if (!token) return
    setEnding(true)
    const r = await endStream(token)
    setEnding(false)
    if (r.success) {
      setLive(false)
      setStream(null)
      setViewers(0)
      toast.success('Stream ended')
    } else {
      toast.error(r.error || 'Failed to end stream')
    }
  }

  // Poll viewer count + status while live
  useEffect(() => {
    if (!live) return
    const t = setInterval(async () => {
      const s = await getStreamStatus(getToken() || '')
      if (s.success && s.live) setViewers(s.stream?.viewer_count || 0)
    }, 15000)
    return () => clearInterval(t)
  }, [live])

  if (loading) {
    return <div className="min-h-screen px-margin-mobile md:px-margin-desktop pt-6 md:pt-10 pb-nav"><div className="max-w-3xl mx-auto"><Skeleton variant="rect" className="h-96 rounded-xl" /></div></div>
  }

  return (
    <div className="min-h-screen px-margin-mobile md:px-margin-desktop pt-6 md:pt-10 pb-nav">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <Icon name="podcasts" className="w-7 h-7 text-primary-container" />
          <div>
            <h1 className="text-headline-md font-bold">Go Live</h1>
            <p className="text-on-surface-variant/60 text-xs mt-0.5">Stream to your viewers in real time</p>
          </div>
        </div>

        <nav className="flex gap-1 overflow-x-auto mb-6 pb-1">
          {NAV.map(n => (
            <button key={n.path} onClick={() => nav(n.path)} className={`flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl whitespace-nowrap transition-colors ${loc.pathname === n.path ? 'bg-primary-container text-on-primary-container' : 'text-on-surface-variant hover:text-on-surface hover:bg-white/5'}`}>
              <Icon name={n.icon as any} size="sm" /> {n.label}
            </button>
          ))}
        </nav>

        <div className={`rounded-xl border p-6 mb-6 ${live ? 'bg-red-500/10 border-red-500/30' : 'bg-surface-container-high border-white/5'}`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
              <span className="text-sm font-medium text-on-surface">{live ? 'LIVE' : 'Offline'}</span>
            </div>
            {live && <span className="text-xs text-on-surface-variant">{viewers} watching</span>}
          </div>

          <h2 className="text-headline-md font-bold mb-1">{live ? (stream?.title || 'You are live') : 'Ready to stream'}</h2>
          <p className="text-on-surface-variant/60 text-sm mb-6">
            {live ? 'Your stream is broadcasting to viewers.' : 'Use any streaming software (OBS, vMix, etc.) with the details below.'}
          </p>

          {ingest?.protocols && (
            <div className="mb-6">
              <p className="text-xs text-on-surface-variant/60 mb-2 flex items-center gap-1.5"><Icon name="cast" size="sm" /> INGEST PROTOCOL</p>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {Object.entries(ingest.protocols).map(([p, v]: any) => (
                  <button
                    key={p}
                    onClick={() => setProto(p)}
                    className={`text-left rounded-xl border px-3 py-2.5 transition-colors ${proto === p ? 'border-primary-container bg-primary-container/10' : 'border-white/10 hover:border-white/25'}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-on-surface">{v.label}</span>
                      {proto === p && <Icon name="check_circle" size="sm" className="text-primary-container" />}
                    </div>
                    <p className="text-[11px] text-on-surface-variant/60 mt-0.5">{v.note}</p>
                  </button>
                ))}
              </div>
              <div className="bg-black/30 border border-white/5 rounded-xl p-4">
                <p className="text-xs text-on-surface-variant/60 mb-2 flex items-center gap-1.5"><Icon name="link" size="sm" /> {ingest.protocols[proto]?.label} URL</p>
                <div className="flex items-center justify-between gap-2">
                  <code className="text-sm text-on-surface break-all font-mono">{ingest.protocols[proto]?.url}</code>
                  <button onClick={() => copy(ingest.protocols[proto]?.url || '', 'proto')} className="shrink-0 flex items-center gap-1 text-xs text-primary-container hover:underline"><Icon name={copied === 'proto' ? 'check' : 'content_copy'} size="sm" /> {copied === 'proto' ? 'Copied' : 'Copy'}</button>
                </div>
              </div>
            </div>
          )}

          {live && delivery && (
            <div className="mb-6">
              <p className="text-xs text-on-surface-variant/60 mb-2 flex items-center gap-1.5"><Icon name="play_circle" size="sm" /> DELIVERY (viewers)</p>
              <div className="space-y-2">
                <DeliveryRow label="LL-HLS" url={delivery.hls} copy={copy} copied={copied} />
                <DeliveryRow label="LL-DASH" url={delivery.dash} copy={copy} copied={copied} />
                <DeliveryRow label="HTTP-FLV" url={delivery.flv} copy={copy} copied={copied} />
                <DeliveryRow label="WebRTC" url={delivery.webrtc} copy={copy} copied={copied} />
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 mb-6">
            {live ? (
              <Button onClick={handleEnd} loading={ending} className="bg-red-500/20 text-red-300">End Stream</Button>
            ) : (
              <Button onClick={handleStart} loading={starting} className="bg-red-500 text-white">Go Live</Button>
            )}
          </div>

          {!live && (
            <div className="mb-5">
              <label className="text-on-surface-variant text-sm mb-1.5 block">Stream title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Give your stream a title…" className="w-full bg-surface-variant/20 border border-outline/30 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary-container" />
            </div>
          )}

          <div className="space-y-3">
            <div className="bg-black/30 border border-white/5 rounded-xl p-4">
              <p className="text-xs text-on-surface-variant/60 mb-2 flex items-center gap-1.5"><Icon name="dns" size="sm" /> STREAM URL</p>
              <div className="flex items-center justify-between gap-2">
                <code className="text-sm text-on-surface break-all font-mono">{url}</code>
                <button onClick={() => copy(url, 'url')} className="shrink-0 flex items-center gap-1 text-xs text-primary-container hover:underline"><Icon name={copied === 'url' ? 'check' : 'content_copy'} size="sm" /> {copied === 'url' ? 'Copied' : 'Copy'}</button>
              </div>
            </div>
            <div className="bg-black/30 border border-white/5 rounded-xl p-4">
              <p className="text-xs text-on-surface-variant/60 mb-2 flex items-center gap-1.5"><Icon name="key" size="sm" /> STREAM KEY</p>
              <div className="flex items-center justify-between gap-2">
                <code className="text-sm text-on-surface font-mono break-all">{showKey ? key : '•'.repeat(Math.min(24, key.length))}</code>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => setShowKey(!showKey)} className="flex items-center gap-1 text-xs text-on-surface-variant hover:text-on-surface"><Icon name={showKey ? 'visibility_off' : 'visibility'} size="sm" /></button>
                  <button onClick={() => copy(key, 'key')} className="flex items-center gap-1 text-xs text-primary-container hover:underline"><Icon name={copied === 'key' ? 'check' : 'content_copy'} size="sm" /> {copied === 'key' ? 'Copied' : 'Copy'}</button>
                  <button onClick={() => setConfirmRegen(true)} className="flex items-center gap-1 text-xs text-amber-300 hover:underline"><Icon name="refresh" size="sm" /> Regenerate</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-surface-container-high border border-white/5 rounded-xl p-6">
          <h3 className="font-label-md text-label-md text-on-surface mb-3 flex items-center gap-2"><Icon name="tips_and_updates" className="text-primary-container" /> How to go live</h3>
          <ol className="space-y-2 text-sm text-on-surface-variant pl-1 list-decimal list-inside">
            <li>Open OBS Studio or your streaming software.</li>
            <li>Pick an <span className="text-on-surface">ingest protocol</span> above — <span className="text-on-surface">RTMP/RTMPS</span> for desktop, <span className="text-on-surface">SRT</span> for shaky mobile networks, or <span className="text-on-surface">WebRTC</span> for sub-second interactivity.</li>
            <li>In Settings &gt; Stream, paste the selected <span className="text-on-surface">protocol URL</span> and your <span className="text-on-surface">Stream Key</span>.</li>
            <li>Set your output to 4500 kbps at 1080p.</li>
            <li>Press <span className="text-on-surface">Go Live</span> — viewers receive <span className="text-on-surface">LL-HLS / LL-DASH</span> (2–5s latency) or <span className="text-on-surface">WebRTC</span> for instant playback.</li>
          </ol>
        </div>
      </div>

      <Modal isOpen={confirmRegen} onClose={() => setConfirmRegen(false)} title="Regenerate stream key?">
        <p className="text-sm text-on-surface-variant mb-6">Regenerating will invalidate your current stream key. Any active stream will disconnect. This cannot be undone.</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmRegen(false)}>Cancel</Button>
          <Button onClick={handleRegenerate} loading={regenerating} className="bg-amber-500/20 text-amber-300">Regenerate</Button>
        </div>
      </Modal>
    </div>
  )
}

function DeliveryRow({ label, url, copy, copied }: { label: string; url: string; copy: (t: string, l: string) => void; copied: string | null }) {
  return (
    <div className="bg-black/30 border border-white/5 rounded-xl p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-on-surface-variant/60 shrink-0">{label}</span>
        <div className="flex items-center gap-2 min-w-0">
          <code className="text-xs text-on-surface break-all font-mono">{url}</code>
          <button onClick={() => copy(url, label)} className="shrink-0 flex items-center gap-1 text-xs text-primary-container hover:underline"><Icon name={copied === label ? 'check' : 'content_copy'} size="sm" /> {copied === label ? 'Copied' : 'Copy'}</button>
        </div>
      </div>
    </div>
  )
}
