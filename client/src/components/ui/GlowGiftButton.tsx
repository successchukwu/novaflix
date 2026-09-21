import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Icon from './Icon'
import { getToken, initializeGlowGift } from '../../lib/auth'

interface GlowGiftButtonProps {
  creatorId: string
  recipientName?: string
  className?: string
}

const presets = [
  { amount: 5, icon: 'bolt' as const, label: 'Spark' },
  { amount: 10, icon: 'local_fire_department' as const, label: 'Blaze' },
  { amount: 20, icon: 'rocket_launch' as const, label: 'Rocket' },
]

export default function GlowGiftButton({ creatorId, recipientName = 'this creator', className = '' }: GlowGiftButtonProps) {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [msg, setMsg] = useState('')

  const close = () => {
    setOpen(false)
    setTimeout(() => setStatus('idle'), 300)
    setAmount('')
    setNote('')
    setMsg('')
  }

  const send = async (amt: number) => {
    const token = getToken()
    if (!token) {
      setStatus('error')
      setMsg('Please sign in to send a gift')
      return
    }
    setStatus('loading')
    setMsg('Opening secure checkout…')
    const res = await initializeGlowGift(token, creatorId, amt, note.trim())
    if (res.success && res.authorization_url) {
      window.location.href = res.authorization_url
    } else {
      setStatus('error')
      setMsg(res.error || 'Failed to start gift')
    }
  }

  const handleCustom = () => {
    const a = parseFloat(amount)
    if (a > 0) send(a)
  }

  return (
    <div className={`relative ${className}`}>
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.97 }}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border border-amber-500/30 rounded-xl text-sm font-medium text-amber-300 hover:from-amber-500/30 hover:to-yellow-500/30 active:from-amber-500/40 active:to-yellow-500/40 active:shadow-[0_2px_8px_rgba(245,158,11,0.3)] transition-all"
        style={{ boxShadow: open ? '0 2px 8px rgba(245,158,11,0.3)' : undefined }}
      >
        <Icon name="bolt" fill={true} className="text-amber-400" />
        Send Glow
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            className="absolute bottom-full left-0 mb-2 bg-surface-card border border-white/10 rounded-2xl p-4 shadow-2xl min-w-[260px] z-50"
          >
            <p className="text-sm font-medium text-white mb-1">Send Glow Tokens to {recipientName}</p>
            <p className="text-[11px] text-gray-400 mb-3">A 20% gifting fee supports NovaFlix; {recipientName} keeps the rest.</p>

            <div className="flex gap-2 mb-3">
              {presets.map((p) => (
                <button
                  key={p.amount}
                  onClick={() => send(p.amount)}
                  disabled={status === 'loading'}
                  className="flex-1 flex flex-col items-center gap-1 px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl hover:border-amber-500/50 hover:bg-amber-500/10 transition-colors disabled:opacity-50"
                >
                  <Icon name={p.icon} className="w-5 h-5 text-amber-400" />
                  <span className="text-xs font-semibold text-white">${p.amount}</span>
                  <span className="text-[10px] text-gray-500">{p.label}</span>
                </button>
              ))}
            </div>

            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note (optional)"
              className="w-full bg-surface-container border border-outline/20 rounded-xl px-3 py-2 text-sm text-on-surface placeholder-on-surface-variant/50 mb-2 focus:outline-none focus:border-amber-500/50"
            />
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Custom $"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-surface-container border border-outline/20 rounded-xl px-3 py-2 text-sm text-white placeholder-on-surface-variant/50 focus:outline-none focus:border-amber-500/50"
                min={1}
              />
              <button
                onClick={handleCustom}
                disabled={!amount || parseFloat(amount) <= 0 || status === 'loading'}
                className="px-4 py-2 bg-amber-500 text-black font-semibold text-sm rounded-xl disabled:opacity-50 hover:bg-amber-400 transition-colors"
              >
                Send
              </button>
            </div>

            {status !== 'idle' && (
              <p className={`text-xs mt-2 ${status === 'error' ? 'text-red-400' : status === 'done' ? 'text-primary' : 'text-gray-400'}`}>
                {status === 'loading' ? 'Processing…' : msg}
              </p>
            )}
            {status === 'done' && (
              <button onClick={close} className="w-full mt-2 py-2 bg-white/10 text-white text-sm rounded-xl hover:bg-white/20 transition-colors">
                Done
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}