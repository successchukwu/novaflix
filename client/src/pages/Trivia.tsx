import { useEffect, useState, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import Icon from '../components/ui/Icon'
import { useAuth } from '../lib/AuthContext'
import { useNavigate } from 'react-router-dom'
import {
  getDailyTrivia, submitDailyTrivia, getTriviaStreak, getTriviaLeaderboard,
  getGuessMovie, submitGuess, getCoinsBalance, getCosmetics, purchaseCosmetic, equipCosmetic,
  getTriviaStatus, getGuessStatus, getToken,
} from '../lib/auth'

interface Q {
  id: string
  question: string
  options: string[]
  answered?: boolean
  correct?: boolean | null
  image_url?: string | null
  difficulty?: string
  clue?: string | null
}

interface ResultItem {
  id: string
  correct: boolean
  alreadyAnswered?: boolean
  difficulty?: string
  question?: string
  pointsAwarded?: number
}

const PASS_RATIO = 0.7

function ScoreResult({ score, total, passed }: { score: number; total: number; passed?: boolean }) {
  const pct = total > 0 ? score / total : 0
  const didPass = passed ?? pct >= PASS_RATIO
  const config = didPass
    ? pct >= 0.9
      ? { color: '#22c55e', glow: 'rgba(34,197,94,0.35)', label: 'Trivia Legend! 🏆', copy: 'Near-perfect. The whole platform bows to your film knowledge.' }
      : { color: '#22c55e', glow: 'rgba(34,197,94,0.35)', label: 'Excellent!', copy: 'You passed! Coins earned — you clearly know your films.' }
    : { color: '#ef4444', glow: 'rgba(239,68,68,0.35)', label: 'Failed', copy: `Even hits have outtakes. Score ${Math.round(PASS_RATIO * 100)}%+ tomorrow to win coins.` }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 180, damping: 14 }}
      className="bg-surface-container-high border border-white/5 rounded-2xl p-8 text-center"
    >
      <motion.div
        initial={{ scale: 0, rotate: -30 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 12, delay: 0.15 }}
        className="relative w-28 h-28 mx-auto mb-5"
        style={{ filter: `drop-shadow(0 0 22px ${config.glow})` }}
      >
        <svg viewBox="0 0 100 100" className="w-full h-full" fill="none" stroke={config.color} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round">
          {!didPass ? (
            <>
              <motion.path d="M30 30 L70 70" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35, delay: 0.35 }} />
              <motion.path d="M70 30 L30 70" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35, delay: 0.6 }} />
            </>
          ) : (
            <motion.path d="M22 52 L43 72 L79 32" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5, delay: 0.35 }} />
          )}
        </svg>
        <motion.div
          className="absolute inset-0 rounded-full"
          initial={{ opacity: 0.8, scale: 0.6 }}
          animate={{ opacity: 0, scale: 1.6 }}
          transition={{ duration: 0.9, delay: 0.1 }}
          style={{ border: `3px solid ${config.color}` }}
        />
      </motion.div>

      <motion.h2
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="text-headline-sm font-bold text-on-surface mb-1"
      >
        {config.label}
      </motion.h2>
      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.85 }}
        className="text-2xl font-extrabold mb-2"
        style={{ color: config.color }}
      >
        {score}/{total}
      </motion.p>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct * 100}%` }}
        transition={{ delay: 0.5, duration: 0.8, ease: 'easeOut' }}
        className="h-2 rounded-full mx-auto mb-3 max-w-[240px]"
        style={{ background: config.color }}
      />
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }} className="text-sm text-on-surface-variant mb-5">
        {config.copy}
      </motion.p>
    </motion.div>
  )
}

function CountdownCard({ h, m, s }: { h: number; m: number; s: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 1.1 }}
      className="bg-surface-container-high border border-white/5 rounded-xl p-4 text-center"
    >
      <p className="text-xs text-on-surface-variant uppercase tracking-wide mb-1">Next quiz in</p>
      <motion.p
        key={`${h}:${m}:${s}`}
        initial={{ scale: 0.8 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        className="font-mono text-2xl font-bold text-on-surface tabular-nums"
      >
        {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
      </motion.p>
    </motion.div>
  )
}

function DifficultyBadge({ difficulty }: { difficulty?: string }) {
  const config = {
    easy: { bg: 'bg-green-500/15', text: 'text-green-300', label: 'Easy' },
    normal: { bg: 'bg-blue-500/15', text: 'text-blue-300', label: 'Normal' },
    hard: { bg: 'bg-amber-500/15', text: 'text-amber-300', label: 'Hard' },
    very_hard: { bg: 'bg-red-500/15', text: 'text-red-300', label: 'Very Hard' },
    medium: { bg: 'bg-amber-500/15', text: 'text-amber-300', label: 'Medium' },
  }[difficulty || 'trivia'] || { bg: 'bg-white/10', text: 'text-on-surface-variant', label: 'Trivia' }
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold uppercase ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  )
}

/** Amber "+2" chip — every correct answer pays the same flat reward. */
function CoinValueChip() {
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-amber-400/15 text-amber-300">
      <Icon name="monetization_on" className="w-3 h-3" />+2
    </span>
  )
}

export default function Trivia() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'trivia' | 'guess' | 'shop' | 'leaderboard'>('trivia')

  const [questions, setQuestions] = useState<Q[]>([])
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [result, setResult] = useState<any>(null)
  const [triviaLoading, setTriviaLoading] = useState(true)
  const [currentIndex, setCurrentIndex] = useState(0)

  const [streak, setStreak] = useState(0)

  const [countdown, setCountdown] = useState({ h: 0, m: 0, s: 0 })

  const [guessQ, setGuessQ] = useState<Q | null>(null)
  const [guessPicked, setGuessPicked] = useState<number | null>(null)
  const [guessResult, setGuessResult] = useState<any>(null)
  const [guessError, setGuessError] = useState<string | null>(null)
  const [showBlur, setShowBlur] = useState(true)
  const [guessRemaining, setGuessRemaining] = useState(1)
  const [guessDailyLimit, setGuessDailyLimit] = useState(false)
  const [triviaCompleted, setTriviaCompleted] = useState(false)
  const [guessCompleted, setGuessCompleted] = useState(false)

  const [cosmetics, setCosmetics] = useState<any[]>([])
  const [coins, setCoins] = useState(0)

  const [leaderboard, setLeaderboard] = useState<any[]>([])

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [buyingId, setBuyingId] = useState<string | null>(null)
  const [buyError, setBuyError] = useState<string | null>(null)
  const [newlyBought, setNewlyBought] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)

  const loadTrivia = useCallback(() => {
    setTriviaLoading(true)
    setSubmitError(null)
    getDailyTrivia().then(r => {
      if (r.success) {
        setQuestions(r.questions)
        setAnswers({})
        setResult(null)
        setCurrentIndex(0)
      }
      setTriviaLoading(false)
    })
  }, [])

  const loadStreak = useCallback(() => {
    getTriviaStreak().then(r => {
      if (r.success && typeof r.streak === 'number') setStreak(r.streak)
    })
  }, [])

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0))
      const diff = Math.max(0, next.getTime() - now.getTime())
      const h = Math.floor(diff / 3_600_000)
      const m = Math.floor((diff % 3_600_000) / 60_000)
      const s = Math.floor((diff % 60_000) / 1000)
      setCountdown({ h, m, s })
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const token = getToken()
    if (!token) return
    // Use centralized WS origin if available (parity with HotTakes/Forum)
    let wsHost = window.location.host
    try {
      const apiBase = (import.meta as any).env?.VITE_API_BASE as string | undefined
      if (apiBase && apiBase.startsWith('http')) {
        wsHost = new URL(apiBase).host
      }
    } catch {}
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${wsHost}/ws?token=${encodeURIComponent(token)}`)
    // queue topic-joins until OPEN to avoid race
    const pendingJoins: string[] = []
    const flushJoins = () => {
      while (pendingJoins.length && ws.readyState === WebSocket.OPEN) {
        const msg = pendingJoins.shift()!
        try { ws.send(msg) } catch {}
      }
    }
    ws.onopen = flushJoins
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data)
        if (data?.type === 'trivia:leaderboard' && Array.isArray(data.leaderboard)) {
          setLeaderboard(data.leaderboard)
        }
        if (data?.type === 'coins:update' && typeof data.coins === 'number') {
          setCoins(data.coins)
        }
        if (data?.type === 'cosmetics:update') {
          if (tab === 'shop') loadShop()
        }
        if (data?.type === 'trivia:score') {
          // live score update after submit
          if (data.score != null) setResult((prev: any) => prev ? { ...prev, score: data.score } : prev)
          if (Array.isArray(data.leaderboard)) setLeaderboard(data.leaderboard)
        }
        if (data?.type === 'trivia:guess' && data.question) {
          setGuessQ(data.question)
        }
      } catch {}
    }
    wsRef.current = ws as any
    // expose flush for other effects if needed
    ;(wsRef as any)._flush = flushJoins
    ;(wsRef as any)._queue = pendingJoins
    return () => { ws.close() }
  }, [])

  useEffect(() => {
    const init = async () => {
      const token = getToken()
      if (!token) return

      // Check trivia status (guess status derived without side-effect)
      const triviaStatus = await getTriviaStatus()

      if (triviaStatus.success && triviaStatus.completedToday) {
        setTriviaCompleted(true)
        setResult({ ...triviaStatus, alreadyPlayed: true })
      } else {
        loadTrivia()
      }

      // Defer guess loading until user actually visits guess tab to avoid creating question prematurely
      if (tab === 'guess') {
        loadGuess()
      }

      loadStreak()
      getCoinsBalance().then(r => {
        if (r.success && typeof r.coins === 'number') setCoins(r.coins)
      })
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Lazy-load guess when tab switches to guess
  useEffect(() => {
    if (tab === 'guess' && !guessCompleted && !guessQ && !guessDailyLimit) {
      loadGuess()
    }
  }, [tab, guessCompleted, guessQ, guessDailyLimit, loadGuess])

  const loadGuess = useCallback(() => {
    setGuessPicked(null)
    setGuessResult(null)
    setGuessError(null)
    setGuessDailyLimit(false)
    getGuessMovie().then(r => {
      if (r.success) {
        setGuessQ(r.question)
        if (typeof r.remaining === 'number') setGuessRemaining(r.remaining)
        if (r.dailyLimitReached) setGuessDailyLimit(true)
      } else if (r.alreadyPlayed) {
        setGuessCompleted(true)
        setGuessResult(r)
        setGuessDailyLimit(true)
      }
    })
  }, [])

  useEffect(() => { if (tab === 'guess' && !guessCompleted) loadGuess() }, [tab, loadGuess, guessCompleted])

  const loadShop = useCallback(() => {
    getCosmetics().then(r => {
      if (r.success) {
        setCosmetics(r.cosmetics)
        setCoins(r.coins)
      }
    })
    getTriviaLeaderboard().then(r => r.success && setLeaderboard(r.leaderboard))
  }, [])

  useEffect(() => { if (tab === 'shop' || tab === 'leaderboard') loadShop() }, [tab, loadShop])

  const pickAnswer = (qid: string, idx: number) => {
    setAnswers(prev => ({ ...prev, [qid]: idx }))
    setSubmitError(null)
  }

  // Only count questions that can actually be answered — a malformed options
  // array must never permanently disable submission.
  const answerable = questions.filter(q => Array.isArray(q.options) && q.options.length >= 2)
  const answeredCount = Object.keys(answers).length
  const unanswered = Math.max(0, answerable.length - answeredCount)

  const submit = async () => {
    if (answeredCount === 0 || unanswered > 0) return
    setSubmitting(true)
    setSubmitError(null)
    const res = await submitDailyTrivia(Object.entries(answers).map(([id, answerIndex]) => ({ id, answerIndex })))
    setSubmitting(false)
    if (res.success) {
      setResult(res)
      setCoins(res.coins)
      if (!res.alreadyPlayed) {
        setQuestions(prev => prev.map(q => ({ ...q, answered: true })))
      }
      loadStreak()
    } else {
      setSubmitError(res.error || 'Failed to submit. Please try again.')
    }
  }

  const guess = async (idx: number) => {
    if (guessPicked !== null || !guessQ) return
    setGuessPicked(idx)
    setGuessError(null)
    const res = await submitGuess(guessQ.id, idx)
    if (res.success) {
      setGuessResult(res)
      setCoins(res.coins)
      setGuessRemaining(typeof res.remaining === 'number' ? res.remaining : guessRemaining - 1)
      if (res.correct) setShowBlur(false)
    } else if (res.status === 429) {
      setGuessError(res.error || 'Too many requests. Please wait before guessing again.')
      setGuessPicked(null)
    } else if (res.dailyLimitReached) {
      setGuessDailyLimit(true)
      setGuessRemaining(0)
      setGuessError('Daily guess limit reached. Come back tomorrow!')
    } else {
      setGuessError(res.error || 'Failed to submit guess.')
      setGuessPicked(null)
    }
  }

  const buy = async (id: string) => {
    setBuyingId(id)
    setBuyError(null)
    const res = await purchaseCosmetic(id)
    setBuyingId(null)
    if (res.success) {
      setCoins(res.coins)
      setNewlyBought(id)
      setTimeout(() => setNewlyBought(null), 2000)
      loadShop()
    } else {
      setBuyError(res.error || 'Purchase failed')
    }
  }

  const toggleEquip = async (id: string, currentlyEquipped: boolean) => {
    const res = await equipCosmetic(id, !currentlyEquipped)
    if (res.success) loadShop()
  }

  if (!user) {
    return (
      <div className="min-h-screen px-margin-mobile md:px-margin-desktop pt-6 md:pt-10 pb-nav text-center">
        <h1 className="text-headline-md font-bold text-on-surface mb-3">Trivia & Rewards</h1>
        <p className="text-on-surface-variant mb-6">Sign in to play trivia and earn coins.</p>
        <button onClick={() => navigate('/login')} className="px-5 py-2.5 rounded-lg bg-primary-container text-on-primary-container font-label-md hover:brightness-110">
          Sign in
        </button>
      </div>
    )
  }

  const tabs = [
    { id: 'trivia' as const, label: 'Daily Trivia', icon: 'quiz' as const },
    { id: 'guess' as const, label: 'Guess the Movie', icon: 'videocam' as const },
    { id: 'shop' as const, label: 'Cosmetics Shop', icon: 'shopping_bag' as const },
    { id: 'leaderboard' as const, label: 'Leaderboard', icon: 'leaderboard' as const },
  ]

  return (
    <div className="min-h-screen px-margin-mobile md:px-margin-desktop pt-6 md:pt-10 pb-nav">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Icon name="quiz" className="text-primary-container" />
            <h1 className="text-headline-md font-bold text-on-surface">Trivia & Rewards</h1>
          </div>
          <div className="inline-flex items-center gap-1.5 bg-surface-container-high border border-white/5 rounded-full px-3 py-1.5 text-sm text-amber-300">
            <Icon name="monetization_on" className="w-4 h-4" /> {coins.toLocaleString()} coins
          </div>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <div className="inline-flex items-center gap-1.5 bg-surface-container-high border border-white/5 rounded-full px-3 py-1.5 text-sm">
            <Icon name="local_fire_department" className="w-4 h-4 text-amber-400" /> {streak} day{streak !== 1 ? 's' : ''} streak
          </div>
          <div className="inline-flex items-center gap-1.5 bg-surface-container-high border border-white/5 rounded-full px-3 py-1.5 text-sm text-on-surface-variant">
            <Icon name="schedule" className="w-4 h-4" /> Next in {countdown.h}h {countdown.m}m {countdown.s}s
          </div>
        </div>

        <div className="flex gap-1 mb-6 overflow-x-auto bg-surface-container-high rounded-xl p-1 border border-white/5">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 whitespace-nowrap inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-primary-container text-on-primary-container' : 'text-on-surface-variant hover:text-on-surface'}`}
            >
              <Icon name={t.icon} className="text-base leading-none" /> {t.label}
            </button>
          ))}
        </div>

        {tab === 'trivia' && (
          <div className="space-y-4">
            {triviaLoading ? (
              <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-28 bg-white/5 rounded-xl animate-pulse" />)}</div>
            ) : result ? (
              <div className="space-y-4">
                <ScoreResult score={result.score} total={result.total} passed={result.passed} />
                <CountdownCard h={countdown.h} m={countdown.m} s={countdown.s} />
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.2 }} className="text-center">
                  {result.alreadyPlayed ? (
                    <p className="text-on-surface-variant mb-4">You already played today. Your score: {result.score}/{result.total} · Streak: {result.streak} 🔥</p>
                  ) : result.passed === false ? (
                    <p className="text-on-surface-variant mb-4">
                      No coins earned — score {Math.round(PASS_RATIO * 100)}%+ tomorrow to win · Streak frozen at {result.streak} 🔥
                    </p>
                  ) : (
                    <p className="text-on-surface-variant mb-4">
                      +{result.coinsEarned} coins earned · Current streak: {result.streak} 🔥
                    </p>
                  )}
                  {result.results && result.results.length > 0 && (
                    <div className="mb-4 max-h-56 overflow-y-auto">
                      <p className="text-xs text-on-surface-variant mb-2 text-left">Question review:</p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-left">
                        {result.results.map((r: ResultItem) => (
                          <div key={r.id} className={`px-2 py-1.5 rounded-lg space-y-1 ${r.alreadyAnswered && r.correct === undefined ? 'bg-white/5' : r.correct ? 'bg-green-500/15' : 'bg-red-500/15'}`}>
                            <div className="flex items-center justify-between gap-1">
                              <span className={`text-xs font-bold font-mono ${r.correct ? 'text-green-300' : 'text-red-300'}`}>{r.correct ? '✓' : '✗'}</span>
                              {r.difficulty ? <DifficultyBadge difficulty={r.difficulty} /> : null}
                            </div>
                            {r.question && (
                              <p className="text-[11px] text-on-surface-variant line-clamp-2 leading-snug">{r.question}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex gap-3 justify-center flex-wrap">
                    {result.alreadyPlayed ? (
                      <button onClick={() => setTab('shop')} className="px-4 py-2 rounded-lg border border-primary/30 text-primary text-sm font-label-md hover:bg-primary/10">
                        Spend coins
                      </button>
                    ) : (
                      <>
                        <button onClick={() => setTab('shop')} className="px-4 py-2 rounded-lg border border-primary/30 text-primary text-sm font-label-md hover:bg-primary/10">
                          Spend coins
                        </button>
                      </>
                    )}
                    <button onClick={() => setTab('leaderboard')} className="px-4 py-2 rounded-lg border border-white/10 text-on-surface-variant text-sm font-label-md hover:bg-white/5">
                      Leaderboard
                    </button>
                  </div>
                </motion.div>
              </div>
            ) : questions.length === 0 ? (
              <p className="text-center text-on-surface-variant py-12">No trivia available today — check back soon!</p>
            ) : (
              <div className="space-y-4">
                <motion.div
                  key={questions[currentIndex]?.id}
                  initial={{ opacity: 0, x: 40 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                  className="bg-surface-container-high border border-white/5 rounded-xl p-5"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold uppercase bg-white/5 text-on-surface-variant">
                      Question {currentIndex + 1} of {questions.length}
                    </span>
                    <div className="flex gap-1">
                      {questions.map((_, qi) => (
                        <span key={qi} className={`w-1.5 h-1.5 rounded-full ${qi < currentIndex ? 'bg-primary-container' : qi === currentIndex ? 'bg-primary' : 'bg-white/10'}`} />
                      ))}
                    </div>
                  </div>
                  {(() => {
                    const q = questions[currentIndex]
                    if (!q) return null
                    return (
                      <>
                        <div className="flex items-start gap-3 mb-3">
                          {q.image_url && <img src={q.image_url} alt="" className="w-12 object-cover rounded-lg shrink-0" style={{ height: '4.5rem' }} />}
                          <div>
                            <div className="flex items-center gap-1.5">
                              <DifficultyBadge difficulty={q.difficulty} />
                              <CoinValueChip />
                            </div>
                            <h3 className="text-sm font-semibold text-on-surface mt-1">{q.question}</h3>
                          </div>
                        </div>
                        <div className="grid gap-2">
                          {q.options.map((opt, i) => (
                            <button
                              key={i}
                              onClick={() => pickAnswer(q.id, i)}
                              className={`text-left px-4 py-2.5 rounded-lg border text-sm transition-all ${
                                answers[q.id] === i
                                  ? 'bg-primary-container border-primary-container text-on-primary-container'
                                  : 'bg-surface-container border-white/10 text-on-surface hover:border-primary/40'
                              }`}
                            >
                              {String.fromCharCode(65 + i)}. {opt}
                            </button>
                          ))}
                        </div>
                      </>
                    )
                  })()}
                </motion.div>

                {currentIndex < questions.length - 1 ? (
                  <button
                    onClick={() => setCurrentIndex(i => Math.min(questions.length - 1, i + 1))}
                    disabled={typeof answers[questions[currentIndex]?.id] !== 'number'}
                    className="w-full py-3 rounded-xl bg-primary-container text-on-primary-container font-label-md hover:brightness-110 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    Next Question <Icon name="arrow_forward" size="sm" />
                  </button>
                ) : (
                  <>
                    <button
                      onClick={submit}
                      disabled={unanswered > 0 || submitting}
                      className="w-full py-3 rounded-xl bg-primary-container text-on-primary-container font-label-md hover:brightness-110 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                    >
                      {submitting ? (
                        <>
                          <span className="animate-spin">⟳</span> Submitting…
                        </>
                      ) : (
                        <>
                          Submit answers · {answeredCount}/{answerable.length} selected
                        </>
                      )}
                    </button>
                    {!submitting && unanswered > 0 && (
                      <p className="text-xs text-center text-amber-300/80">
                        Answer {unanswered} more question{unanswered !== 1 ? 's' : ''} to submit
                      </p>
                    )}
                  </>
                )}
                {submitError && (
                  <p className="text-sm text-center text-red-400" role="alert">{submitError}</p>
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'guess' && (
          <div className="space-y-4">
            {guessDailyLimit ? (
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="bg-surface-container-high border border-white/5 rounded-2xl p-6 text-center">
                <Icon name="schedule" className="text-4xl text-amber-400 mx-auto mb-3" />
                <h2 className="text-headline-sm font-bold text-on-surface mb-2">Daily Limit Reached</h2>
                <p className="text-on-surface-variant mb-4">You've used your 1 guess for today.</p>
                <CountdownCard h={countdown.h} m={countdown.m} s={countdown.s} />
                <button onClick={() => setTab('trivia')} className="mt-4 px-4 py-2 rounded-lg bg-primary-container text-on-primary-container text-sm font-label-md hover:brightness-110">
                  Play Daily Trivia instead
                </button>
              </motion.div>
            ) : !guessQ ? (
              <div className="h-48 bg-white/5 rounded-xl animate-pulse" />
            ) : (
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="bg-surface-container-high border border-white/5 rounded-2xl p-6">
                <div className="text-center mb-4">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <h2 className="text-headline-sm font-bold text-on-surface">Guess the Movie</h2>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold uppercase bg-blue-500/15 text-blue-300">
                      {guessRemaining} / 1 left today
                    </span>
                  </div>
                  <p className="text-sm text-on-surface-variant">5 coins per correct guess</p>
                </div>
                <div className="relative w-full max-w-xs mx-auto mb-4">
                  {guessQ.image_url && (
                    <img
                      src={guessQ.image_url}
                      alt="Blurred movie"
                      className={`w-full rounded-xl object-cover transition-all duration-500 ${guessPicked === null ? 'blur-2xl' : showBlur ? 'blur-2xl' : ''}`}
                      style={{ aspectRatio: '2/3' }}
                    />
                  )}
                  {guessPicked === null && <div className="absolute inset-0 flex items-center justify-center text-on-surface-variant text-sm">🤔 Can you name it?</div>}
                  {guessPicked !== null && (
                    <button
                      onClick={() => setShowBlur(!showBlur)}
                      className="absolute top-2 right-2 px-2 py-1 bg-black/50 text-white text-xs rounded hover:bg-black/70 transition-colors"
                      aria-label={showBlur ? 'Reveal' : 'Blur'}
                    >
                      {showBlur ? '👁 Reveal' : '🙈 Blur'}
                    </button>
                  )}
                </div>
                {guessQ.clue && <p className="text-sm text-on-surface-variant text-center italic mb-4">"{guessQ.clue}…"</p>}
                {guessError && (
                  <p className="text-sm text-center text-red-400 mb-2" role="alert">{guessError}</p>
                )}
                <div className="grid gap-2">
                  {guessQ.options.map((opt, i) => (
                    <button
                      key={i}
                      onClick={() => guess(i)}
                      disabled={guessPicked !== null}
                      className={`text-left px-4 py-2.5 rounded-lg border text-sm transition-all disabled:cursor-default ${
                        guessPicked === i
                          ? guessResult?.correct
                            ? 'bg-green-500/20 border-green-500 text-green-300'
                            : 'bg-red-500/20 border-red-500 text-red-300'
                          : 'bg-surface-container border-white/10 text-on-surface hover:border-primary/40'
                      }`}
                    >
                      {String.fromCharCode(65 + i)}. {opt}
                    </button>
                  ))}
                </div>
                {guessResult && (
                  <div className="mt-4 text-center">
                    <p className={`text-sm font-semibold ${guessResult.correct ? 'text-green-400' : 'text-red-400'}`}>
                      {guessResult.correct ? `Correct! It was ${guessResult.answer}` : `Nope — it was ${guessResult.answer}`} {guessResult.correct ? `· +5 coins` : ''}
                    </p>
                    <CountdownCard h={countdown.h} m={countdown.m} s={countdown.s} />
                  </div>
                )}
              </motion.div>
            )}
          </div>
        )}

        {tab === 'shop' && (
          <div className="space-y-6">
            {buyError && (
              <div className="bg-red-500/15 border border-red-500/30 text-red-300 px-4 py-3 rounded-lg text-sm flex items-center justify-between animate-in slide-in-from-top-2">
                {buyError}
                <button onClick={() => setBuyError(null)} className="ml-4 text-red-400 hover:text-red-300">✕</button>
              </div>
            )}
            {(['avatar_frame', 'badge', 'title'] as const).map(kind => {
              const items = cosmetics.filter(c => c.kind === kind)
              if (items.length === 0) return null
              const kindLabel = kind === 'avatar_frame' ? 'Avatar Frames' : kind === 'badge' ? 'Badges' : 'Titles'
              const kindIcon = kind === 'avatar_frame' ? 'picture_frame' : kind === 'badge' ? 'military_tech' : 'title'
              const kindColor = kind === 'avatar_frame' ? 'purple' : kind === 'badge' ? 'blue' : 'amber'
              return (
                <div key={kind} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Icon name={kindIcon} className={`text-${kindColor}-300`} />
                    <h3 className="font-label-md text-label-md text-on-surface">{kindLabel}</h3>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full bg-${kindColor}-500/15 text-${kindColor}-300`}>
                      {items.filter(c => c.owned && c.equipped).length} / {items.filter(c => c.owned).length} owned
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-gutter">
                    {items.map(c => (
                      <div key={c.id} className={`bg-surface-container-high border border-white/5 rounded-xl p-4 flex flex-col items-center text-center relative transition-all ${newlyBought === c.id ? 'ring-2 ring-green-400 animate-pulse' : ''}`}>
                        <div className="text-4xl mb-2">{c.icon}</div>
                        <p className="font-label-md text-label-md text-on-surface">{c.name}</p>
                        <p className="text-[11px] text-on-surface-variant mb-1">{c.description}</p>
                        {c.owned && c.equipped && (
                          <span className="absolute top-2 right-2 text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-300">Equipped</span>
                        )}
                        {c.owned ? (
                          <button onClick={() => toggleEquip(c.id, c.equipped)} className={`w-full py-1.5 rounded-lg text-xs font-semibold transition-colors ${c.equipped ? 'bg-primary-container text-on-primary-container' : 'bg-white/5 text-on-surface-variant hover:text-on-surface'}`}>
                            {c.equipped ? 'Equipped ✓' : 'Equip'}
                          </button>
                        ) : (
                          <button
                            onClick={() => buy(c.id)}
                            disabled={coins < c.price || buyingId === c.id}
                            className="w-full py-1.5 rounded-lg bg-primary-container text-on-primary-container text-xs font-semibold hover:brightness-110 transition-all disabled:opacity-40"
                          >
                            {buyingId === c.id ? (
                              <>
                                <span className="animate-spin mr-1">⟳</span> Buying…
                              </>
                            ) : (
                              `${c.price} coins`
                            )}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {tab === 'leaderboard' && (
          <div className="bg-surface-container-high border border-white/5 rounded-2xl overflow-hidden">
            {leaderboard.length === 0 ? (
              <p className="text-center text-on-surface-variant py-10 text-sm">No trivia played yet — be the first!</p>
            ) : (
              leaderboard.map((u, i) => (
                <div key={u.user_id} className="flex items-center gap-3 px-4 py-3 border-b border-white/5 last:border-0">
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${i === 0 ? 'bg-amber-400/20 text-amber-300' : i === 1 ? 'bg-gray-400/20 text-gray-300' : i === 2 ? 'bg-orange-400/20 text-orange-300' : 'bg-white/5 text-on-surface-variant'}`}>
                    {i + 1}
                  </span>
                  {u.avatar ? <img src={u.avatar} alt="" className="w-8 h-8 rounded-full object-cover" /> : <Icon name="person" className="text-on-surface-variant/50" />}
                  <div className="flex-1 min-w-0">
                    <button onClick={() => navigate(`/profile/${u.user_id}`)} className="text-sm font-medium text-on-surface truncate hover:text-primary">{u.name}</button>
                    <p className="text-xs text-on-surface-variant/60">🔥 {u.streak} streak · {u.total_correct} correct</p>
                  </div>
                  <span className="text-sm font-bold text-on-surface">{u.total_points} pts</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}