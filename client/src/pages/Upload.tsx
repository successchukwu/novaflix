import { useState, useCallback, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import Icon from '../components/ui/Icon'
import { useAuth } from '../lib/AuthContext'
import { uploadFilm, uploadFilmWithProgress, createEgg, youtubePreview, startYoutubeImport, getYoutubeImportStatus, type UploadProgress } from '../lib/auth'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Modal from '../components/ui/Modal'
import { useToast } from '../components/ui/Toast'
import UploadProgressModal from '../components/ui/UploadProgressModal'

export default function Upload() {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [genre, setGenre] = useState('')
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [posterFile, setPosterFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const uploadAbortRef = useRef<(() => void) | null>(null)
  const [uploaded, setUploaded] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [uploadId, setUploadId] = useState('')
  const [showEggModal, setShowEggModal] = useState(false)
  const [eggTs, setEggTs] = useState(0)
  const [eggX, setEggX] = useState(0.5)
  const [eggY, setEggY] = useState(0.5)
  const [eggHint, setEggHint] = useState('')
  const [eggRewardType, setEggRewardType] = useState<'badge' | 'secret_room'>('badge')
  const [eggRoomName, setEggRoomName] = useState('')
  const [eggRoomDesc, setEggRoomDesc] = useState('')
  const [eggSaving, setEggSaving] = useState(false)
  const previewRef = useRef<HTMLVideoElement>(null)
  const { user } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [mode, setMode] = useState<'file' | 'youtube'>('file')
  const [ytUrl, setYtUrl] = useState('')
  const [ytInfo, setYtInfo] = useState<any>(null)
  const [ytPreviewing, setYtPreviewing] = useState(false)
  const [ytQuality, setYtQuality] = useState<number | null>(null)
  const [ytJobId, setYtJobId] = useState<string | null>(null)
  const [ytProgress, setYtProgress] = useState(0)
  const [ytImporting, setYtImporting] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!showEggModal) return
    const t = setTimeout(() => {
      const v = previewRef.current
      if (v) v.currentTime = 0
    }, 200)
    return () => clearTimeout(t)
  }, [showEggModal])

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      uploadAbortRef.current?.()
    }
  }, [])

  const handleYoutubePreview = async () => {
    const url = ytUrl.trim()
    if (!url) {
      toast.error('Paste a YouTube link first')
      return
    }
    if (!user) {
      navigate('/login')
      return
    }
    setYtPreviewing(true)
    setYtInfo(null)
    setYtQuality(null)
    const token = localStorage.getItem('novaflix-token') || ''
    const res = await youtubePreview(token, url)
    setYtPreviewing(false)
    if (res.success) {
      setYtInfo(res.info)
      if (res.info.heights?.length) setYtQuality(res.info.heights[0])
      setTitle(res.info.title || title)
    } else {
      toast.error(res.error || 'Could not read that video')
    }
  }

  const handleYoutubeImport = async () => {
    if (!user) {
      navigate('/login')
      return
    }
    if (!ytInfo || !ytQuality) {
      toast.error('Choose a quality first')
      return
    }
    setYtImporting(true)
    setYtProgress(0)
    const token = localStorage.getItem('novaflix-token') || ''
    const res = await startYoutubeImport(token, {
      url: ytUrl.trim(),
      height: ytQuality,
      title: title || ytInfo.title,
      description,
      genre,
    })
    if (res.success) {
      setYtJobId(res.jobId)
      pollRef.current = setInterval(async () => {
        const status = await getYoutubeImportStatus(token, res.jobId)
        if (status.success && status.job) {
          setYtProgress(status.job.progress || 0)
          if (status.job.status === 'done') {
            stopPolling()
            setYtImporting(false)
            setUploadId(status.job.uploadId || '')
            setUploaded(true)
          } else if (status.job.status === 'error') {
            stopPolling()
            setYtImporting(false)
            toast.error(status.job.error || 'Import failed')
          }
        }
      }, 2500)
    } else {
      setYtImporting(false)
      toast.error(res.error || 'Import failed')
    }
  }

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  const resetYoutube = () => {
    stopPolling()
    setYtUrl('')
    setYtInfo(null)
    setYtQuality(null)
    setYtJobId(null)
    setYtProgress(0)
    setYtImporting(false)
  }

  const handleMode = (m: 'file' | 'youtube') => {
    stopPolling()
    setMode(m)
    setYtInfo(null)
    setYtQuality(null)
    setYtProgress(0)
    setYtImporting(false)
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file?.type.startsWith('video/')) setVideoFile(file)
  }, [])

  const [uploadComplete, setUploadComplete] = useState(false)

  const cancelUpload = () => {
    uploadAbortRef.current?.()
    setUploading(false)
    setUploadProgress(null)
    setUploadError(null)
    setUploadComplete(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) {
      navigate('/login')
      return
    }
    setUploading(true)
    setUploadComplete(false)
    setUploadProgress({ loaded: 0, total: videoFile?.size || 0, pct: 0, speedBps: 0, etaSec: null, elapsedSec: 0 })
    setUploadError(null)
    const token = localStorage.getItem('novaflix-token') || ''
    const { promise, abort } = uploadFilmWithProgress(
      token,
      {
        title,
        description,
        genre,
        videoFile: videoFile || undefined,
        posterFile: posterFile || undefined,
      },
      (p) => setUploadProgress(p)
    )
    uploadAbortRef.current = abort
    const res = await promise
    uploadAbortRef.current = null
    if (res.success) {
      // Show 100% check animation for 1000ms before morphing to success
      setUploadProgress((prev) => prev ? { ...prev, pct: 100, loaded: prev.total } : { loaded: 0, total: 0, pct: 100, speedBps: 0, etaSec: null, elapsedSec: 0 })
      setUploadComplete(true)
      await new Promise((r) => setTimeout(r, 1000))
      setUploadComplete(false)
      setUploading(false)
      setUploadProgress(null)
      setUploadId(res.upload?.id || '')
      setUploaded(true)
    } else {
      setUploading(false)
      setUploadProgress(null)
      setUploadComplete(false)
      if (res.status === 429) {
        const secs = res.retryAfter ?? 30
        toast.error(res.error || `Too many uploads in progress. Retry in ${secs}s`)
        setUploadError(res.error || 'Too many uploads in progress. Please retry shortly.')
      } else if (res.error === 'Upload cancelled') {
        toast.error('Upload cancelled')
      } else {
        toast.error(res.error || 'Upload failed')
        setUploadError(res.error || 'Upload failed')
      }
    }
  }

  const handlePreviewClick = (e: React.MouseEvent<HTMLVideoElement>) => {
    const v = previewRef.current
    if (!v) return
    const rect = v.getBoundingClientRect()
    setEggTs(Number(v.currentTime.toFixed(2)))
    setEggX(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)))
    setEggY(Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)))
  }

  const handleSaveEgg = async () => {
    if (!user || !uploadId) return
    if (eggTs <= 0) {
      toast.error('Scrub the preview and click the exact frame to set the hidden moment')
      return
    }
    setEggSaving(true)
    const token = localStorage.getItem('novaflix-token') || ''
    const res = await createEgg(token, {
      contentId: uploadId,
      ts: eggTs,
      x: eggX,
      y: eggY,
      hint: eggHint,
      rewardType: eggRewardType,
      rewardName: eggRoomName,
      rewardDescription: eggRoomDesc,
    })
    setEggSaving(false)
    if (res.success) {
      toast.success('Hidden key added! Fans who pause at the right moment will find it.')
      setShowEggModal(false)
      setEggHint('')
      setEggRoomName('')
      setEggRoomDesc('')
    } else {
      toast.error(res.error || 'Failed to add key')
    }
  }

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className="min-h-screen px-margin-mobile md:px-margin-desktop pt-6 md:pt-10 pb-nav">
      <div className="max-w-2xl mx-auto">
        <AnimatePresence mode="wait">
          {uploaded ? (
            <motion.div
              key="uploaded-success"
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              className="text-center py-12"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 12, delay: 0.1 }}
                className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6"
              >
                <Icon name="check_circle" className="w-10 h-10 text-green-400" fill />
              </motion.div>
              <h1 className="text-headline-md font-bold mb-3">Uploaded Successfully!</h1>
              <p className="text-on-surface-variant mb-2">Your film is being processed.</p>
              <p className="text-on-surface-variant/60 text-sm mb-8">It will be reviewed and published within 24 hours.</p>
              <div className="flex items-center justify-center gap-3">
                <Button onClick={() => setShowEggModal(true)} variant="secondary">
                  <Icon name="vpn_key" size="sm" className="mr-2" />
                  Add Hidden Key
                </Button>
                <Button onClick={() => { setUploaded(false); setTitle(''); setDescription(''); setGenre(''); setVideoFile(null); setPosterFile(null) }}>Upload Another</Button>
              </div>
              <p className="text-on-surface-variant/40 text-xs mt-6">
                Tip: hide a digital key at a memorable moment to unlock badges & secret rooms for your fans.
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="upload-form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
            >
        <div className="flex items-center gap-3 mb-6">
          <Icon name="cloud_upload" className="w-8 h-8 text-primary-container" />
          <div>
            <h1 className="text-headline-md font-bold">Upload Your Film</h1>
            <p className="text-on-surface-variant/60 text-sm mt-1">Share your story with the world</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1 p-1 bg-surface-container-high rounded-xl border border-white/5 mb-6">
          <button
            type="button"
            onClick={() => handleMode('file')}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              mode === 'file' ? 'bg-primary-container/20 text-on-surface' : 'text-on-surface-variant/60 hover:text-on-surface'
            }`}
          >
            <Icon name="upload_file" size="sm" /> Upload File
          </button>
          <button
            type="button"
            onClick={() => handleMode('youtube')}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              mode === 'youtube' ? 'bg-primary-container/20 text-on-surface' : 'text-on-surface-variant/60 hover:text-on-surface'
            }`}
          >
            <Icon name="play_circle" size="sm" /> From YouTube
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {mode === 'file' && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-10 text-center transition-all duration-200 ${
              dragOver
                ? 'border-secondary bg-secondary/5'
                : videoFile
                  ? 'border-primary-container bg-primary-container/5'
                  : 'border-outline/30 hover:border-outline/50'
            }`}
          >
            {videoFile ? (
              <div>
                <Icon name="movie" className="w-12 h-12 text-primary-container mx-auto mb-3" />
                <p className="font-label-md text-label-md text-on-surface">{videoFile.name}</p>
                <p className="text-on-surface-variant/60 text-sm mt-1">
                  {(videoFile.size / 1024 / 1024).toFixed(1)} MB
                </p>
                <button
                  type="button"
                  onClick={() => setVideoFile(null)}
                  className="text-xs text-primary-container hover:text-red-400 mt-2"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div>
                <Icon name="cloud_upload" className="w-12 h-12 text-on-surface-variant/40 mx-auto mb-3" />
                <p className="text-on-surface-variant text-sm mb-1">
                  Drag & drop your video file here
                </p>
                <p className="text-on-surface-variant/60 text-xs mb-4">or</p>
                <label className="cursor-pointer">
                  <span className="inline-flex px-4 py-2 bg-surface-variant/20 border border-outline/30 rounded-xl text-sm font-medium text-on-surface hover:bg-surface-variant/40 transition-colors">
                    Browse Files
                  </span>
                  <input
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
                  />
                </label>
                <p className="text-on-surface-variant/40 text-xs mt-3">MP4, WebM, MOV • Max 2GB</p>
              </div>
            )}
          </div>
          )}

          {mode === 'youtube' && (
            <div className="border-2 border-dashed border-white/10 rounded-xl p-6 text-center">
              <Icon name="play_circle" className="w-10 h-10 text-red-400 mx-auto mb-3" />
              <p className="text-on-surface-variant text-sm mb-1">
                Paste a YouTube link and we&rsquo;ll import it into a quality you choose.
              </p>
              <p className="text-on-surface-variant/60 text-xs mb-4">
                The video is fetched on our servers and stored to NovaFlix storage.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
                <Input
                  placeholder="https://youtube.com/watch?v=..."
                  value={ytUrl}
                  onChange={(e) => setYtUrl(e.target.value)}
                  readOnly={ytImporting}
                />
                <Button
                  type="button"
                  onClick={handleYoutubePreview}
                  loading={ytPreviewing}
                  disabled={ytImporting}
                >
                  Preview
                </Button>
              </div>

              {ytInfo && !ytImporting && (
                <div className="mt-6 space-y-4 text-left max-w-md mx-auto">
                  <div className="flex items-center gap-4">
                    {ytInfo.thumbnail && (
                      <img
                        src={ytInfo.thumbnail}
                        alt={ytInfo.title}
                        className="w-28 aspect-video object-cover rounded-lg bg-black"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="font-label-md text-label-md text-on-surface truncate">{ytInfo.title}</p>
                      <p className="text-on-surface-variant/60 text-xs mt-1">
                        {ytInfo.durationLabel || `${Math.round(ytInfo.duration / 60)} min`}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="text-on-surface-variant text-sm mb-2">Choose quality</p>
                    <div className="flex flex-wrap gap-2">
                      {ytInfo.heights.map((h: number) => (
                        <button
                          key={h}
                          type="button"
                          onClick={() => setYtQuality(h)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                            ytQuality === h
                              ? 'border-primary-container bg-primary-container/10 text-on-surface'
                              : 'border-outline/30 text-on-surface-variant hover:border-outline/60'
                          }`}
                        >
                          {h}p
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {ytImporting && (
                <div className="mt-6 max-w-md mx-auto">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-on-surface-variant">Importing from YouTube{ytProgress > 0 ? '…' : ''}</span>
                    <span className="text-primary-container font-mono">{ytProgress}%</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-primary-container rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(ytProgress, 2)}%` }}
                    />
                  </div>
                  {ytProgress >= 99 ? (
                    <p className="text-xs text-on-surface-variant/60 mt-3">Merging & storing your video…</p>
                  ) : (
                    <p className="text-xs text-on-surface-variant/60 mt-3">
                      {ytProgress === 0 ? 'Starting download…' : `Downloaded ${ytProgress}%`}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
          <div className="grid md:grid-cols-2 gap-gutter">
            <div>
              <label className="text-on-surface-variant text-sm mb-1.5 block">
                <Icon name="movie" size="sm" className="inline mr-1.5" /> Film Title
              </label>
              <Input
                placeholder="Enter your film title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-on-surface-variant text-sm mb-1.5 block">
                <Icon name="local_offer" size="sm" className="inline mr-1.5" /> Genre
              </label>
              <select
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                className="w-full bg-surface-variant/20 border border-outline/30 rounded-xl px-4 py-3 text-sm on-surface focus:outline-none focus:border-primary-container"
                required
              >
                <option value="">Select genre</option>
                <option value="action">Action</option>
                <option value="comedy">Comedy</option>
                <option value="drama">Drama</option>
                <option value="horror">Horror</option>
                <option value="sci-fi">Sci-Fi</option>
                <option value="documentary">Documentary</option>
                <option value="animation">Animation</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-on-surface-variant text-sm mb-1.5 block">
              <Icon name="description" size="sm" className="inline mr-1.5" /> Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tell us about your film..."
              rows={4}
              className="w-full bg-surface-variant/20 border border-outline/30 rounded-xl px-4 py-3 text-sm on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-primary-container resize-none"
              required
            />
          </div>

          <div>
            <label className="text-on-surface-variant text-sm mb-1.5 block">
              <Icon name="image" size="sm" className="inline mr-1.5" /> Poster Image
            </label>
            <div className="flex items-center gap-3">
              <label className="cursor-pointer px-4 py-2.5 bg-surface-variant/20 border border-outline/30 rounded-xl text-sm on-surface hover:bg-surface-variant/40 transition-colors">
                Choose Image
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setPosterFile(e.target.files?.[0] || null)}
                />
              </label>
              {posterFile && (
                <span className="text-on-surface-variant text-sm">{posterFile.name}</span>
              )}
            </div>
          </div>

          {mode === 'file' ? (
            <Button
              type="submit"
              size="lg"
              className="w-full"
              loading={uploading}
              disabled={!title || !videoFile || !genre || !description}
            >
              {uploading ? 'Uploading...' : 'Upload Film'}
            </Button>
          ) : (
            <Button
              type="button"
              size="lg"
              className="w-full"
              onClick={handleYoutubeImport}
              loading={ytImporting}
              disabled={!title || !genre || !ytInfo || !ytQuality || ytImporting}
            >
              {ytImporting ? `Importing… ${ytProgress}%` : 'Import Film from YouTube'}
            </Button>
          )}

          <p className="text-on-surface-variant/40 text-xs text-center">
            By uploading, you agree to our Content Guidelines and Terms of Service.
            Your film will be reviewed before publishing.
          </p>
        </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Modal isOpen={showEggModal} onClose={() => setShowEggModal(false)} title="Add a Hidden Key">
        <div className="space-y-4">
          <div>
            <p className="text-on-surface-variant text-sm mb-2">
              Scrub the preview and <span className="text-primary-container font-medium">click the exact frame</span> to mark the hidden moment.
            </p>
            {videoFile && (
              <video
                ref={previewRef}
                src={URL.createObjectURL(videoFile)}
                onClick={handlePreviewClick}
                muted
                controls
                className="w-full aspect-video rounded-xl bg-black"
              />
            )}
            <div className="flex items-center justify-between mt-3 text-sm">
              <span className="text-on-surface-variant">
                Time: <span className="font-mono text-on-surface">{formatTime(eggTs)}</span>
              </span>
              <span className="text-on-surface-variant">
                Spot: <span className="font-mono text-on-surface">
                  ({eggX.toFixed(2)}, {eggY.toFixed(2)})
                </span>
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                const v = previewRef.current
                if (v) {
                  v.pause()
                  v.currentTime = 0
                }
                setEggTs(0)
              }}
              className="text-xs text-primary-container mt-1"
            >
              Clear selection
            </button>
          </div>

          <div>
            <label className="text-on-surface-variant text-sm mb-1.5 block">
              <Icon name="lightbulb" size="sm" className="inline mr-1.5" /> Clue (shown when fans are close)
            </label>
            <Input
              placeholder="e.g. 'There is no spoon'"
              value={eggHint}
              onChange={(e) => setEggHint(e.target.value)}
            />
          </div>

          <div>
            <label className="text-on-surface-variant text-sm mb-2 block">Reward</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setEggRewardType('badge')}
                className={`flex flex-col items-center gap-1 p-3 rounded-xl border text-sm transition-colors ${
                  eggRewardType === 'badge'
                    ? 'border-primary-container bg-primary-container/10 text-on-surface'
                    : 'border-outline/30 text-on-surface-variant hover:border-outline/60'
                }`}
              >
                <Icon name="military_tech" />
                Badge
              </button>
              <button
                type="button"
                onClick={() => setEggRewardType('secret_room')}
                className={`flex flex-col items-center gap-1 p-3 rounded-xl border text-sm transition-colors ${
                  eggRewardType === 'secret_room'
                    ? 'border-primary-container bg-primary-container/10 text-on-surface'
                    : 'border-outline/30 text-on-surface-variant hover:border-outline/60'
                }`}
              >
                <Icon name="door_front" />
                Secret Room
              </button>
            </div>
          </div>

          {eggRewardType === 'secret_room' && (
            <div className="space-y-3">
              <div>
                <label className="text-on-surface-variant text-sm mb-1.5 block">Room Name</label>
                <Input
                  placeholder="e.g. The Directors' Lounge"
                  value={eggRoomName}
                  onChange={(e) => setEggRoomName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-on-surface-variant text-sm mb-1.5 block">Room Invite Message</label>
                <textarea
                  value={eggRoomDesc}
                  onChange={(e) => setEggRoomDesc(e.target.value)}
                  placeholder="Describe the secret you've unlocked for your fans…"
                  rows={3}
                  className="w-full bg-surface-variant/20 border border-outline/30 rounded-xl px-4 py-3 text-sm on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-primary-container resize-none"
                />
              </div>
            </div>
          )}

          <Button
            onClick={handleSaveEgg}
            size="lg"
            className="w-full"
            loading={eggSaving}
            disabled={eggTs <= 0 || eggSaving}
          >
            <Icon name="vpn_key" size="sm" className="mr-2" />
            Place Hidden Key
          </Button>
        </div>
      </Modal>

      <UploadProgressModal
        open={uploading}
        progress={uploadProgress}
        fileName={videoFile?.name}
        onCancel={cancelUpload}
        error={uploadError}
        isComplete={uploadComplete}
      />
    </div>
  )
}
