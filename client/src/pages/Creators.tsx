import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import Icon from '../components/ui/Icon'
import SEOMeta from '../components/ui/SEOMeta'
import { useAuth } from '../lib/AuthContext'
import { getPublicCreators } from '../lib/api'
import Perspective3DGridBackdrop from '../components/features/Perspective3DGridBackdrop'
import { formatCurrency } from '../lib/currency'

const fadeUp = {
  initial: { opacity: 0, y: 40 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.6 },
}

const stagger = {
  initial: { opacity: 0, y: 30 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { staggerChildren: 0.1, delayChildren: 0.2 },
}

const benefits = [
  { icon: 'attach_money' as const, title: 'Monetize Your Work', desc: 'Earn from subscriptions, tips, pay-per-view, memberships, and merch — all from one dashboard.' },
  { icon: 'group' as const, title: 'Build Your Audience', desc: 'Reach viewers worldwide. Turn casual watchers into superfans with follower tools and leaderboards.' },
  { icon: 'bar_chart' as const, title: 'Real-Time Analytics', desc: 'Track views, watch minutes, engagement, and revenue the moment they happen.' },
  { icon: 'shield' as const, title: 'Full Creative Control', desc: 'You own your content. Set your own prices, schedule releases, and choose where it plays.' },
  { icon: 'language' as const, title: 'Global Distribution', desc: 'Your films reach audiences across 190+ countries with instant subtitles and localization.' },
  { icon: 'trending_up' as const, title: 'Smart Recommendations', desc: 'Our engine puts your content in front of the right audience at exactly the right time.' },
]

const steps = [
  { num: '01', title: 'Create Your Account', desc: 'Sign up as a creator in minutes. No upfront fees, no contracts.' },
  { num: '02', title: 'Upload Your Film', desc: 'Drag and drop your masterpiece. We handle encoding, hosting, and delivery.' },
  { num: '03', title: 'Set Your Terms', desc: 'Choose free, premium, or pay-per-view. You decide how to monetize.' },
  { num: '04', title: 'Connect & Earn', desc: 'Share with your audience, track your earnings, and withdraw anytime.' },
]

const plans = [
  { id: 'student', name: 'Student', price: 800, period: '/month', features: ['720p HD streaming', 'Basic analytics', '1 download device'] },
  { id: 'basic', name: 'Basic', price: 1500, period: '/month', features: ['720p HD streaming', 'Basic analytics', 'Priority support'] },
  { id: 'standard', name: 'Standard', price: 2500, period: '/month', featured: true, features: ['1080p Full HD', 'Advanced analytics', 'Early access to features', 'Ad-free experience'] },
  { id: 'premium', name: 'Premium', price: 5500, period: '/month', features: ['4K HDR streaming', 'Full analytics suite', 'Watch parties & premieres', 'Spatial audio'] },
]

const faqs = [
  { q: 'Is it free to join NovaFlix as a creator?', a: 'Creating your account is completely free. To publish content you pick an affordable plan — starting at ₦800/month — which covers hosting, encoding, distribution, and your full creator toolkit. No hidden fees.' },
  { q: 'How do I get paid?', a: 'You earn from tips, subscriptions, pay-per-view, memberships, and store sales. Everything lands in your creator wallet in real time, and you can withdraw anytime through supported payment gateways.' },
  { q: 'Who owns my content?', a: 'You do — always. NovaFlix is purely a distribution platform. You keep 100% ownership of your films and full control over pricing, availability, and territories.' },
  { q: 'Can I manage everything from my phone?', a: 'Yes. Upload, review analytics, reply to fans, and track earnings from any mobile browser or our mobile apps. Start a cut on your phone, finish on desktop — everything syncs.' },
  { q: 'What kind of content can I publish?', a: 'Feature films, shorts, series, docs, music videos — anything original you have the rights to. Our team reviews uploads for quality so viewers always get the best experience.' },
]

const navLinks = [
  { label: 'Features', href: '#features' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Creators', href: '#featured-creators' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
]

function safeCount(v: unknown): string {
  const n = Number(v)
  return Number.isFinite(n) ? n.toLocaleString() : '0'
}

function CreatorCard({ creator: c, onOpen }: { creator: any; onOpen: () => void }) {
  const [imgError, setImgError] = useState(false)
  const showImg = c.avatar && !imgError
  return (
    <motion.div
      variants={{ initial: { opacity: 0, y: 30 }, whileInView: { opacity: 1, y: 0 } }}
      whileHover={{ y: -4 }}
      onClick={onOpen}
      className="group cursor-pointer"
    >
      <div className="aspect-[3/4] bg-surface-container-high border border-white/5 rounded-xl overflow-hidden mb-3 relative">
        {showImg ? (
          <img
            src={c.avatar}
            alt={c.name}
            loading="lazy"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-primary-container/10">
            <Icon name="videocam" className="w-8 h-8 text-primary-container/40" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
          <div className="flex items-center gap-2 text-xs text-white">
            <Icon name="star" fill={true} className="text-primary-container" /> {safeCount(c.total_likes)} likes
          </div>
        </div>
      </div>
      <p className="font-label-md text-label-md text-on-surface truncate">{c.name}</p>
      <p className="text-on-surface-variant/60 text-sm truncate">{c.known_for_department || 'Filmmaker'}</p>
      <p className="text-xs text-primary mt-1 inline-flex items-center gap-1">
        <Icon name="group" className="w-3.5 h-3.5" /> {safeCount(c.followers_count)} followers
      </p>
    </motion.div>
  )
}

export default function Creators() {
  const { user, isCreator } = useAuth()
  const navigate = useNavigate()
  const [creators, setCreators] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scrolled, setScrolled] = useState(false)
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  const authedCreator = !!(user && isCreator)

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false
    let attempt = 0
    async function load() {
      try {
        const r = await getPublicCreators(controller.signal)
        if (cancelled) return
        if (r.success) {
          setCreators(Array.isArray(r.creators) ? r.creators : [])
          setError(null)
          setLoading(false)
        } else if (++attempt <= 1) {
          setTimeout(load, 1200)
        } else {
          setError(r.error || 'Could not load creators')
          setLoading(false)
        }
      } catch (e: any) {
        if (cancelled || e?.name === 'AbortError') return
        if (++attempt <= 1) {
          setTimeout(load, 1200)
        } else {
          setError('Failed to connect to server')
          setLoading(false)
        }
      }
    }
    load()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [])

  function retryLoad() {
    setLoading(true)
    setError(null)
    getPublicCreators().then(r => {
      if (r.success) setCreators(Array.isArray(r.creators) ? r.creators : [])
      else setError(r.error || 'Could not load creators')
      setLoading(false)
    }).catch(() => {
      setError('Failed to connect to server')
      setLoading(false)
    })
  }

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const signupTo = '/creator/signup'

  function CtaButtons({ size = 'lg' }: { size?: 'lg' | 'sm' }) {
    const pad = size === 'lg' ? 'px-8 py-3.5 text-base' : 'px-5 py-2.5 text-sm'
    return (
      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        {authedCreator ? (
          <Link to="/creator" className={`px-8 py-3.5 bg-primary-container text-on-primary-container rounded-xl font-semibold ${size === 'lg' ? 'text-lg' : ''} hover:brightness-110 transition-all inline-flex items-center justify-center gap-2 shadow-lg shadow-primary-container/25`}>
            Go to Dashboard <Icon name="arrow_forward" />
          </Link>
        ) : (
          <>
            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
              <Link to={signupTo} className={`inline-flex items-center justify-center gap-2 ${pad} bg-primary-container text-on-primary-container rounded-xl font-semibold hover:brightness-110 transition-all shadow-lg shadow-primary-container/30`}>
                Start Creating Free <Icon name="arrow_forward" />
              </Link>
            </motion.div>
            <Link to="/login" className={`inline-flex items-center justify-center gap-2 ${pad} bg-surface-variant/20 text-on-surface rounded-xl font-semibold hover:bg-surface-variant/40 transition-colors border border-outline/20`}>
              Log In
            </Link>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface text-white">
      <SEOMeta type="page" title="NovaFlix for Creators — Publish. Grow. Get Paid." description="Upload your films, build a fanbase, and earn from day one. NovaFlix gives filmmakers the stage they deserve." />

      {/* Nav */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b ${scrolled ? 'bg-surface/85 backdrop-blur-xl border-white/10' : 'bg-transparent border-transparent'}`}>
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 hover:scale-105 transition-transform">
            <img src="/leter-mark-logo.png" alt="" className="h-10 w-auto" />
          </Link>
          <div className="hidden lg:flex items-center gap-7">
            {navLinks.map(l => (
              <a key={l.href} href={l.href} className="text-sm text-on-surface-variant hover:text-primary transition-colors">{l.label}</a>
            ))}
          </div>
          <div className="flex items-center gap-3">
            {authedCreator ? (
              <Link to="/creator" className="text-sm bg-primary-container text-on-primary-container px-5 py-2 rounded-full font-medium hover:brightness-110 transition-colors">Dashboard</Link>
            ) : (
              <>
                <Link to="/login" className="hidden sm:block text-sm text-on-surface-variant hover:text-on-surface transition-colors">Log In</Link>
                <Link to={signupTo} className="text-sm bg-primary-container text-on-primary-container px-5 py-2 rounded-full font-medium hover:brightness-110 transition-all hover:scale-105 shadow-[0_0_15px_rgba(229,9,20,0.35)]">Sign Up</Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden bg-black">
        <Perspective3DGridBackdrop />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black z-[1]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary-container/15 via-transparent to-transparent z-[1]" />
        <div className="relative z-[2] max-w-6xl mx-auto px-4 pt-32 pb-24 md:pt-40 md:pb-32 text-center">
          <motion.div {...fadeUp}>
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary-container/30 bg-primary-container/10 text-xs font-semibold tracking-widest uppercase text-primary mb-6">
              <Icon name="movie_filter" className="w-4 h-4" /> NovaFlix for Creators
            </span>
            <h1 className="text-headline-lg-mobile md:text-display-md font-bold text-on-surface mb-4 leading-tight">
              Filmmaking.
              <br />
              <span className="bg-gradient-to-r from-primary-container to-secondary bg-clip-text text-transparent">Now playing everywhere.</span>
            </h1>
            <p className="text-body-lg text-on-surface-variant max-w-2xl mx-auto mb-10">
              Millions of viewers, one upload away. Publish your films, grow a fanbase,
              and get paid — no credit card needed to start.
            </p>
            <CtaButtons />
            <p className="text-on-surface-variant/40 text-xs mt-4">Free to join · Keep 100% of your rights · Withdraw anytime</p>
          </motion.div>

          {/* Editor-style mockup strip */}
          <motion.div {...fadeUp} transition={{ duration: 0.7, delay: 0.2 }} className="mt-16 max-w-4xl mx-auto relative rounded-xl border border-white/10 bg-surface-container-low overflow-hidden shadow-2xl">
            <div className="flex items-center px-4 py-2 bg-surface-container-lowest border-b border-white/5">
              <div className="flex gap-2">
                <span className="w-3 h-3 rounded-full bg-error" />
                <span className="w-3 h-3 rounded-full bg-secondary" />
                <span className="w-3 h-3 rounded-full bg-primary-container" />
              </div>
              <span className="mx-auto text-on-surface-variant/60 text-xs font-mono truncate px-4">my_first_premiere.cin</span>
            </div>
            <div className="grid grid-cols-12 gap-3 p-4">
              <div className="col-span-3 hidden md:flex flex-col gap-2">
                {['B-Roll', 'Soundtrack', 'Master Cuts'].map(a => (
                  <div key={a} className="flex items-center gap-2 text-xs text-on-surface-variant/70 bg-surface-container-high rounded-lg px-3 py-2">
                    <Icon name="folder" className="w-3.5 h-3.5" /> {a}
                  </div>
                ))}
              </div>
              <div className="col-span-12 md:col-span-9 space-y-3">
                <div className="relative aspect-video rounded-lg overflow-hidden bg-surface-container flex items-center justify-center">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary-container/20 via-transparent to-secondary/10" />
                  <Icon name="play_circle" className="w-14 h-14 text-white/80" />
                </div>
                <div className="h-16 rounded-lg bg-surface-container-lowest border border-white/5 p-2 flex gap-1 relative">
                  <div className="absolute left-1/3 top-0 bottom-0 w-px bg-primary z-10" />
                  <div className="w-1/4 self-stretch bg-secondary-container/40 rounded-sm border border-secondary/40" />
                  <div className="w-1/2 self-stretch ml-2 bg-primary-container/40 rounded-sm border border-primary-container/60" />
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="border-y border-white/5 bg-surface-container-high">
        <div className="max-w-5xl mx-auto px-4 py-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          {[
            { label: 'Active Creators', value: loading ? '—' : `${Math.max(creators.length, 1) * 10}+` },
            { label: 'Films Uploaded', value: '2,400+' },
            { label: 'Minutes Streamed', value: '1.2M+' },
            { label: 'Revenue Paid Out', value: '$50K+' },
          ].map(s => (
            <div key={s.label}>
              <p className="text-2xl font-bold text-on-surface tabular-nums inline-block min-w-[4ch]">{s.value}</p>
              <p className="text-on-surface-variant/60 text-xs mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-6xl mx-auto px-4 py-16 md:py-24">
        <motion.div {...fadeUp} className="text-center mb-14">
          <h2 className="text-headline-lg-mobile md:text-headline-lg font-bold text-on-surface mb-3">
            Pro Tools. <span className="text-primary-container">Accessible Everywhere.</span>
          </h2>
          <p className="text-on-surface-variant max-w-xl mx-auto">
            Everything you need to succeed as a filmmaker, all in one platform.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-gutter">
          {benefits.map((b, i) => (
            <motion.div
              key={b.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="bg-surface-container border border-white/5 rounded-xl p-6 hover:border-primary-container/30 hover:shadow-[0_0_20px_rgba(229,9,20,0.15)] transition-all"
            >
              <div className="w-11 h-11 rounded-full bg-primary-container/10 flex items-center justify-center mb-4">
                <Icon name={b.icon} className="text-primary-container" />
              </div>
              <h3 className="font-label-md text-label-md text-on-surface mb-2">{b.title}</h3>
              <p className="text-on-surface-variant text-sm leading-relaxed">{b.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="bg-surface-container-high border-y border-white/5 py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-4">
          <motion.div {...fadeUp} className="text-center mb-14">
            <h2 className="text-headline-lg-mobile md:text-headline-lg font-bold text-on-surface mb-3">
              How It <span className="text-primary-container">Works</span>
            </h2>
            <p className="text-on-surface-variant max-w-xl mx-auto">Get started in four simple steps.</p>
          </motion.div>

          <div className="grid md:grid-cols-4 gap-6 relative">
            <div className="hidden md:block absolute top-12 left-[12%] right-[12%] h-px bg-gradient-to-r from-primary-container/40 via-primary-container/20 to-transparent" />
            {steps.map((s, i) => (
              <motion.div
                key={s.num}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.12 }}
                className="relative text-center"
              >
                <div className="w-12 h-12 rounded-full bg-primary-container text-on-primary-container font-bold text-lg flex items-center justify-center mx-auto mb-4 relative z-10">{s.num}</div>
                <h3 className="font-label-md text-label-md text-on-surface mb-2">{s.title}</h3>
                <p className="text-on-surface-variant text-sm leading-relaxed">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Creators */}
      <section id="featured-creators" className="max-w-6xl mx-auto px-4 py-16 md:py-24">
        <motion.div {...fadeUp} className="text-center mb-12">
          <h2 className="text-headline-lg-mobile md:text-headline-lg font-bold text-on-surface mb-3">
            Meet Our <span className="text-primary-container">Creators</span>
          </h2>
          <p className="text-on-surface-variant max-w-xl mx-auto">
            From indie filmmakers to award-winning directors — discover the talent that makes NovaFlix extraordinary.
          </p>
        </motion.div>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-gutter">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-[3/4] bg-white/5 rounded-xl mb-3" />
                <div className="h-4 bg-white/5 rounded w-24 mb-2" />
                <div className="h-3 bg-white/5 rounded w-16" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-12 space-y-4">
            <p className="text-on-surface-variant/80 text-sm">{error}</p>
            <button
              onClick={retryLoad}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-surface-variant/20 border border-outline/20 text-sm font-medium hover:bg-surface-variant/40 transition-colors"
            >
              <Icon name="refresh" className="w-4 h-4" /> Retry
            </button>
          </div>
        ) : creators.length === 0 ? (
          <p className="text-center text-on-surface-variant/60 text-sm py-10">Be among the first creators on the platform.</p>
        ) : (
          <motion.div {...stagger} className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-gutter">
            {creators.slice(0, 10).map((c) => (
              <CreatorCard key={c.id} creator={c} onOpen={() => navigate(`/profile/${c.id}`)} />
            ))}
          </motion.div>
        )}
      </section>

      {/* Testimonials */}
      <section className="bg-surface-container-high border-y border-white/5 py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-4">
          <motion.div {...fadeUp} className="text-center mb-12">
            <h2 className="text-headline-lg-mobile md:text-headline-lg font-bold text-on-surface mb-3">
              What Creators <span className="text-primary-container">Say</span>
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-gutter">
            {[
              { quote: 'I published my short film globally in one afternoon. The analytics dashboard alone changed how I make films.', name: 'Amara O.', role: 'Indie Film Director' },
              { quote: 'The recommendation engine brought me thousands of new viewers. I was monetizing within my first week.', name: 'David M.', role: 'Documentary Filmmaker' },
              { quote: 'Full creative control, real payouts, direct fan relationships. This is what distribution should feel like.', name: 'Lena K.', role: 'Series Creator' },
            ].map((t, i) => (
              <motion.div
                key={t.name}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-surface-container border border-white/5 rounded-xl p-6"
              >
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <Icon key={j} name="star" fill={true} className="text-primary-container" />
                  ))}
                </div>
                <p className="text-on-surface-variant text-sm leading-relaxed mb-4 italic">"{t.quote}"</p>
                <div>
                  <p className="font-label-md text-label-md text-on-surface">{t.name}</p>
                  <p className="text-on-surface-variant/60 text-xs">{t.role}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-6xl mx-auto px-4 py-16 md:py-24">
        <motion.div {...fadeUp} className="text-center mb-14">
          <h2 className="text-headline-lg-mobile md:text-headline-lg font-bold text-on-surface mb-3">
            Simple, <span className="text-primary-container">transparent</span> pricing
          </h2>
          <p className="text-on-surface-variant max-w-xl mx-auto">
            Every plan includes hosting, global distribution, analytics, and your full creator toolkit. No hidden fees.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
          {plans.map((p, i) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className={`relative rounded-xl border p-6 flex flex-col ${p.featured ? 'border-primary-container ring-1 ring-primary-container/40 bg-gradient-to-b from-primary-container/10 to-surface-container shadow-[0_0_30px_rgba(229,9,20,0.2)]' : 'border-white/5 bg-surface-container'}`}
            >
              {p.featured && <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary-container text-on-primary-container text-xs font-semibold px-4 py-1 rounded-full whitespace-nowrap">Most Popular</span>}
              <h3 className="font-label-md text-label-md text-on-surface mb-2">{p.name}</h3>
              <div className="mb-5">
                <span className="text-3xl font-bold text-on-surface">{formatCurrency(p.price)}</span>
                <span className="text-on-surface-variant text-sm">{p.period}</span>
              </div>
              <ul className="space-y-2.5 mb-6 flex-1">
                {p.features.map(f => (
                  <li key={f} className="text-sm text-on-surface-variant flex items-start gap-2">
                    <Icon name="check_circle" className="w-4 h-4 text-primary shrink-0 mt-0.5" /> {f}
                  </li>
                ))}
              </ul>
              <Link
                to={authedCreator ? '/creator/choose-plan' : signupTo}
                className={`block text-center w-full py-2.5 rounded-xl font-semibold text-sm transition-colors ${p.featured ? 'bg-primary-container text-on-primary-container hover:brightness-110' : 'bg-surface-variant/20 text-on-surface hover:bg-surface-variant/40 border border-outline/20'}`}
              >
                Choose {p.name}
              </Link>
            </motion.div>
          ))}
        </div>
        <p className="text-center text-on-surface-variant/50 text-xs mt-8">All plans unlock creator features. Cancel or switch anytime.</p>
      </section>

      {/* FAQ */}
      <section id="faq" className="bg-surface-container-high border-y border-white/5 py-16 md:py-24">
        <div className="max-w-3xl mx-auto px-4">
          <motion.div {...fadeUp} className="text-center mb-12">
            <h2 className="text-headline-lg-mobile md:text-headline-lg font-bold text-on-surface mb-3">
              Frequently Asked <span className="text-primary-container">Questions</span>
            </h2>
          </motion.div>

          <div className="space-y-4">
            {faqs.map((f, i) => (
              <motion.div
                key={f.q}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06 }}
                className={`rounded-xl overflow-hidden border transition-colors ${openFaq === i ? 'border-primary-container/40' : 'border-white/5'} bg-surface-container`}
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full px-6 py-4 flex justify-between items-center gap-4 text-left hover:bg-surface-container-high transition-colors"
                >
                  <span className={`font-label-md text-label-md ${openFaq === i ? 'text-primary' : 'text-on-surface'}`}>{f.q}</span>
                  <Icon name="expand_more" className={`w-5 h-5 shrink-0 transition-transform duration-300 ${openFaq === i ? 'rotate-180 text-primary' : 'text-on-surface-variant'}`} />
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-5 text-body-md text-on-surface-variant leading-relaxed">{f.a}</div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative overflow-hidden py-20 md:py-28">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary-container/15 via-transparent to-transparent" />
        <div className="relative max-w-3xl mx-auto px-4 text-center">
          <motion.div {...fadeUp}>
            <Icon name="play_circle" className="w-10 h-10 text-primary-container mx-auto mb-4" />
            <h2 className="text-headline-lg-mobile md:text-display-md font-bold text-on-surface mb-4">
              Ready to Share Your <span className="text-primary-container">Story</span>?
            </h2>
            <p className="text-on-surface-variant text-body-md mb-8 max-w-lg mx-auto">
              Join hundreds of creators already making an impact on NovaFlix. Your audience is waiting.
            </p>
            <CtaButtons />
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-white/5 bg-surface-container-lowest">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <img src="/leter-mark-logo.png" alt="" className="h-6 w-auto" />
          <p className="text-on-surface-variant/50 text-xs">&copy; {new Date().getFullYear()} NovaFlix Inc. All rights reserved.</p>
          <div className="flex gap-6 text-xs text-on-surface-variant/60">
            <Link to="/" className="hover:text-on-surface transition-colors">For Viewers</Link>
            <Link to="/login" className="hover:text-on-surface transition-colors">Creator Login</Link>
            <Link to={signupTo} className="hover:text-on-surface transition-colors">Become a Creator</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
