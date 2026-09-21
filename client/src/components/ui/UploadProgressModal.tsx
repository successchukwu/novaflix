import { motion, AnimatePresence } from 'framer-motion'
import Icon from './Icon'

export interface UploadProgress {
  loaded: number
  total: number
  pct: number
  speedBps: number
  etaSec: number | null
  elapsedSec: number
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function fmtSpeed(bps: number): string {
  if (bps < 1024) return `${Math.round(bps)} B/s`
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`
  return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`
}

function fmtEta(sec: number | null): string {
  if (sec == null || !isFinite(sec) || sec < 0) return '—'
  if (sec < 60) return `${Math.ceil(sec)}s`
  const m = Math.floor(sec / 60)
  const s = Math.ceil(sec % 60)
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

interface Props {
  open: boolean
  progress: UploadProgress | null
  fileName?: string
  onCancel?: () => void
  error?: string | null
}

export default function UploadProgressModal({ open, progress, fileName, onCancel, error }: Props) {
  const pct = progress?.pct ?? 0
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 8 }}
            className="w-full max-w-md bg-surface-container-high border border-white/10 rounded-2xl p-6 shadow-2xl"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-primary-container/20 flex items-center justify-center">
                <Icon name="cloud_upload" className="text-primary-container" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-on-surface">Uploading your film</p>
                <p className="text-xs text-on-surface-variant/60 truncate">{fileName || 'Preparing…'}</p>
              </div>
              {onCancel && (
                <button onClick={onCancel} className="text-on-surface-variant hover:text-on-surface p-1" aria-label="Cancel upload">
                  <Icon name="close" />
                </button>
              )}
            </div>

            <div className="h-3 rounded-full bg-white/10 overflow-hidden">
              <motion.div
                className="h-full bg-primary-container rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(pct, 2)}%` }}
                transition={{ duration: 0.2 }}
              />
            </div>

            <div className="flex items-center justify-between mt-3 text-xs">
              <span className="font-mono font-semibold text-primary-container">{pct}%</span>
              <span className="text-on-surface-variant/60">
                {progress ? `${fmtBytes(progress.loaded)} / ${fmtBytes(progress.total)}` : '—'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3 mt-4">
              <div className="bg-white/5 rounded-xl px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-widest text-on-surface-variant/50">Speed</p>
                <p className="text-sm font-mono font-semibold text-on-surface mt-1">{progress ? fmtSpeed(progress.speedBps) : '—'}</p>
              </div>
              <div className="bg-white/5 rounded-xl px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-widest text-on-surface-variant/50">ETA</p>
                <p className="text-sm font-mono font-semibold text-on-surface mt-1">{fmtEta(progress?.etaSec ?? null)}</p>
              </div>
              <div className="bg-white/5 rounded-xl px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-widest text-on-surface-variant/50">Elapsed</p>
                <p className="text-sm font-mono font-semibold text-on-surface mt-1">
                  {progress ? `${Math.floor(progress.elapsedSec)}s` : '—'}
                </p>
              </div>
            </div>

            {error && (
              <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            {onCancel && !error && (
              <button onClick={onCancel} className="w-full mt-4 py-2.5 bg-white/10 text-on-surface text-sm font-medium rounded-xl hover:bg-white/15 transition-colors">
                Cancel upload
              </button>
            )}
            {error && onCancel && (
              <button onClick={onCancel} className="w-full mt-4 py-2.5 bg-surface-variant text-on-surface text-sm font-medium rounded-xl hover:bg-surface-variant/80 transition-colors">
                Dismiss
              </button>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
