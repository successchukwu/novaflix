import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../lib/AuthContext'
import { getPublicCreators } from '../lib/api'
import Icon from '../components/ui/Icon'
import SEOMeta from '../components/ui/SEOMeta'

function safeCount(v: unknown): string {
  const n = Number(v)
  return Number.isFinite(n) ? n.toLocaleString() : '0'
}

export default function Creators() {
  const { user, isCreator } = useAuth()
  const navigate = useNavigate()
  const [creators, setCreators] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [activeFaq, setActiveFaq] = useState<number | null>(0)

  const authedCreator = !!(user && isCreator)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false
    let attempt = 0
    async function load() {
      try {
        const r = await getPublicCreators(controller.signal, 8)
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
        if (++attempt <= 1) setTimeout(load, 1200)
        else { setError('Failed to connect to server'); setLoading(false) }
      }
    }
    load()
    return () => { cancelled = true; controller.abort() }
  }, [])

  const handleBecomeCreator = () => {
    if (authedCreator) navigate('/creator')
    else navigate('/creator/signup')
  }
  const handleJoin = () => handleBecomeCreator()
  const scrollTo = (id: string) => {
    setMobileOpen(false)
    document.querySelector(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div style={{ fontFamily: 'Arial, Helvetica, sans-serif', background: '#050505', color: '#fff', overflowX: 'hidden' }}>
      <SEOMeta type="page" title="NovaFlix for Creators — Create. Reach. Earn." description="NovaFlix for Creators — Publish your films, grow your audience, connect with fans and earn from your creativity." />
      <style>{`
        *{margin:0;padding:0;box-sizing:border-box} html{scroll-behavior:smooth} a{color:inherit;text-decoration:none} button{font-family:inherit}
        :root{--red:#ff1a1a;--dark-red:#9d0000;--gold:#f5c542;--white:#fff;--gray:#a7a7a7;--card:#111;--border:rgba(255,255,255,0.10)}
        .c-container{width:min(1280px,92%);margin:auto}
        .c-creators-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:22px}
        .c-creator-card{border-radius:20px!important}
        .c-creator-card-inner{padding:16px 14px!important}
        .c-creator-title{font-size:16px!important}
        .c-creator-meta{font-size:13px!important}
        .c-section{padding:100px 0}
        .c-label{display:inline-block;color:var(--red);font-size:13px;font-weight:800;letter-spacing:2px;text-transform:uppercase;margin-bottom:15px}
        .c-title{font-size:clamp(35px,5vw,65px);line-height:1.05;font-weight:900;max-width:850px;margin-bottom:20px}
        .c-desc{color:#aaa;font-size:18px;line-height:1.7;max-width:700px}
        .c-red{color:var(--red)} .c-gold{color:var(--gold)}
        .c-navbar{position:fixed;top:0;left:0;width:100%;height:76px;z-index:999;display:flex;align-items:center;transition:0.3s}
        .c-navbar.scrolled{background:rgba(5,5,5,0.92);backdrop-filter:blur(20px);border-bottom:1px solid var(--border)}
        .c-nav-inner{width:min(1200px,92%);margin:auto;display:flex;justify-content:space-between;align-items:center}
        .c-logo{font-size:25px;font-weight:900;letter-spacing:-1px}
        .c-logo span{color:var(--red)}
        .c-nav-links{display:flex;gap:32px;align-items:center}
        .c-nav-links a{color:#ddd;font-size:14px;transition:0.3s}
        .c-nav-links a:hover{color:#fff}
        .c-nav-btn{padding:12px 21px;border-radius:30px;background:#fff;color:#000!important;font-weight:800}
        .c-nav-btn:hover{background:var(--red);color:#fff!important}
        .c-menu-btn{display:none;width:42px;height:42px;border:1px solid var(--border);border-radius:50%;background:transparent;color:#fff;font-size:22px;cursor:pointer}
        .c-hero{min-height:100vh;position:relative;display:flex;align-items:center;overflow:hidden;background:radial-gradient(circle at 75% 35%, rgba(255,0,0,0.22), transparent 30%),radial-gradient(circle at 20% 80%, rgba(150,0,0,0.16), transparent 30%),#050505}
        .c-hero::before{content:"";position:absolute;width:600px;height:600px;right:-250px;top:100px;border-radius:50%;background:rgba(255,0,0,0.08);filter:blur(80px)}
        .c-hero-inner{position:relative;z-index:2;display:grid;grid-template-columns:1.05fr 0.95fr;gap:50px;align-items:center;padding-top:80px}
        .c-hero-content h1{font-size:clamp(48px,7vw,86px);line-height:0.98;font-weight:900;letter-spacing:-4px;margin-bottom:28px}
        .c-hero-content p{color:#b5b5b5;max-width:600px;font-size:19px;line-height:1.7;margin-bottom:35px}
        .c-hero-btns{display:flex;flex-wrap:wrap;gap:14px}
        .c-primary,.c-secondary{border:none;cursor:pointer;padding:16px 26px;border-radius:30px;font-size:15px;font-weight:800;transition:0.3s}
        .c-primary{background:var(--red);color:#fff;box-shadow:0 10px 40px rgba(255,0,0,0.25)}
        .c-primary:hover{transform:translateY(-3px);background:#ff3030}
        .c-secondary{background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);color:#fff}
        .c-secondary:hover{background:#fff;color:#000}
        .c-hero-note{margin-top:22px;color:#777;font-size:13px}
        .c-preview{position:relative;min-height:530px;display:flex;align-items:center;justify-content:center}
        .c-dashboard{width:100%;max-width:520px;background:#101010;border:1px solid rgba(255,255,255,0.12);border-radius:22px;padding:20px;box-shadow:0 30px 80px rgba(0,0,0,0.7),0 0 80px rgba(255,0,0,0.12);transform:rotate(2deg);animation:cFloating 5s ease-in-out infinite}
        @keyframes cFloating{0%,100%{transform:translateY(0) rotate(2deg)}50%{transform:translateY(-12px) rotate(2deg)}}
        .c-dash-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:22px}
        .c-dash-profile{display:flex;align-items:center;gap:12px}
        .c-avatar{width:45px;height:45px;border-radius:50%;background:linear-gradient(135deg,#ff0000,#520000);display:flex;justify-content:center;align-items:center;font-weight:900}
        .c-dash-profile strong{font-size:14px}
        .c-dash-profile small{display:block;color:#777;margin-top:4px}
        .c-verified{color:#ff3b3b}
        .c-analytics-card{background:#181818;border-radius:15px;padding:20px;margin-bottom:15px}
        .c-analytics-title{display:flex;justify-content:space-between;color:#aaa;font-size:13px;margin-bottom:15px}
        .c-big-number{font-size:35px;font-weight:900;margin-bottom:10px}
        .c-chart{height:90px;display:flex;align-items:end;gap:7px}
        .c-bar{flex:1;background:linear-gradient(to top,#750000,#ff2525);border-radius:5px 5px 0 0;min-height:15px}
        .c-dash-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
        .c-small-stat{padding:15px;background:#181818;border-radius:12px}
        .c-small-stat span{display:block;color:#777;font-size:11px;margin-bottom:7px}
        .c-small-stat strong{font-size:19px}
        .c-trust{border-top:1px solid var(--border);border-bottom:1px solid var(--border);padding:30px 0;background:#090909}
        .c-trust-inner{display:flex;justify-content:space-between;align-items:center;gap:30px;flex-wrap:wrap}
        .c-trust-item{color:#777;font-size:13px;text-transform:uppercase;letter-spacing:1px}
        .c-trust-item strong{display:block;color:#fff;font-size:20px;margin-top:5px;text-transform:none;letter-spacing:0}
        .c-features{background:#080808}
        .c-feature-grid{margin-top:55px;display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
        .c-feature-card{padding:32px;min-height:270px;border:1px solid var(--border);border-radius:20px;background:linear-gradient(145deg,#121212,#0b0b0b);transition:0.35s;position:relative;overflow:hidden}
        .c-feature-card:hover{transform:translateY(-8px);border-color:rgba(255,0,0,0.4)}
        .c-feature-icon{width:55px;height:55px;display:flex;align-items:center;justify-content:center;border-radius:15px;background:rgba(255,0,0,0.12);color:var(--red);font-size:25px;margin-bottom:25px}
        .c-feature-card h3{font-size:22px;margin-bottom:13px}
        .c-feature-card p{color:#888;line-height:1.7;font-size:15px}
        .c-earn{background:linear-gradient(rgba(0,0,0,.75),rgba(0,0,0,.95)),radial-gradient(circle at 70% 50%, #670000, #050505 55%)}
        .c-earn-layout{display:grid;grid-template-columns:0.9fr 1.1fr;gap:80px;align-items:center}
        .c-earn-visual{position:relative;min-height:480px;display:flex;justify-content:center;align-items:center}
        .c-money-card{width:320px;padding:35px;border-radius:25px;background:linear-gradient(145deg,#161616,#090909);border:1px solid rgba(255,255,255,.13);box-shadow:0 30px 80px rgba(0,0,0,.6);transform:rotate(-5deg)}
        .c-money-card small{color:#777}
        .c-money-card h3{font-size:45px;margin:18px 0}
        .c-money-line{height:7px;border-radius:10px;background:#242424;overflow:hidden;margin-bottom:15px}
        .c-money-line span{display:block;height:100%;width:78%;background:linear-gradient(90deg,#8b0000,#ff3030)}
        .c-earning-badge{position:absolute;right:5%;top:10%;background:#fff;color:#000;padding:18px;border-radius:15px;font-size:13px;font-weight:800;box-shadow:0 20px 50px rgba(0,0,0,.4)}
        .c-earning-list{margin-top:35px}
        .c-earning-item{display:flex;gap:18px;margin-bottom:27px}
        .c-check{flex-shrink:0;width:28px;height:28px;border-radius:50%;background:rgba(255,0,0,.15);color:#ff3030;display:flex;align-items:center;justify-content:center;font-weight:900}
        .c-earning-item h4{margin-bottom:6px;font-size:17px}
        .c-earning-item p{color:#858585;line-height:1.6;font-size:14px}
        .c-analytics{background:#050505}
        .c-analytics-showcase{margin-top:60px;display:grid;grid-template-columns:1fr 1fr;gap:22px}
        .c-analytics-large{background:#101010;border:1px solid var(--border);border-radius:22px;padding:30px;min-height:390px}
        .c-analytics-large h3{font-size:20px;margin-bottom:10px}
        .c-analytics-large p{color:#777;font-size:14px;line-height:1.6}
        .c-line-chart{margin-top:50px;height:190px;display:flex;align-items:end;gap:8px}
        .c-line-bar{flex:1;background:linear-gradient(to top,#3c0000,#ff3030);border-radius:5px 5px 0 0}
        .c-audience-box{margin-top:35px}
        .c-audience-row{display:flex;justify-content:space-between;padding:15px 0;border-bottom:1px solid var(--border);color:#aaa}
        .c-audience-row strong{color:#fff}
        .c-promote{background:#090909}
        .c-promote-layout{display:grid;grid-template-columns:1fr 1fr;gap:70px;align-items:center}
        .c-phone{width:300px;height:570px;margin:auto;padding:12px;background:#111;border:1px solid #333;border-radius:40px;box-shadow:0 30px 70px rgba(0,0,0,.7)}
        .c-phone-screen{height:100%;border-radius:30px;overflow:hidden;position:relative;background:linear-gradient(to bottom,transparent 45%,rgba(0,0,0,.95)),linear-gradient(145deg,#6e0000,#170000)}
        .c-movie-poster{position:absolute;inset:0;opacity:.8;background:radial-gradient(circle at 50% 35%,#ff5a00,transparent 15%),linear-gradient(145deg,#1d1d1d,#720000)}
        .c-phone-content{position:absolute;bottom:30px;left:20px;right:20px}
        .c-promoted-label{display:inline-block;padding:6px 10px;border-radius:20px;background:rgba(255,255,255,.15);backdrop-filter:blur(10px);font-size:11px;margin-bottom:10px}
        .c-phone-content h3{font-size:25px;margin-bottom:8px}
        .c-phone-content p{color:#ddd;font-size:12px;line-height:1.5;margin-bottom:15px}
        .c-watch-btn{display:inline-block;background:#fff;color:#000;padding:11px 18px;border-radius:20px;font-size:12px;font-weight:800}
        .c-community{background:radial-gradient(circle at 50% 0%,rgba(255,0,0,.13),transparent 35%),#050505;text-align:center}
        .c-community .c-desc{margin:auto}
        .c-community-grid{margin-top:60px;display:grid;grid-template-columns:repeat(4,1fr);gap:15px}
        .c-community-card{padding:30px 20px;background:#101010;border:1px solid var(--border);border-radius:18px}
        .c-community-number{font-size:35px;font-weight:900;color:var(--red);margin-bottom:8px}
        .c-community-card h4{margin-bottom:8px}
        .c-community-card p{color:#777;font-size:13px;line-height:1.5}
        .c-journey{background:#090909}
        .c-journey-grid{margin-top:60px;display:grid;grid-template-columns:repeat(4,1fr);gap:15px}
        .c-journey-card{position:relative;padding:28px;border-top:2px solid #4b0000;background:#101010;border-radius:0 0 18px 18px}
        .c-journey-number{color:var(--red);font-size:12px;font-weight:900;margin-bottom:20px}
        .c-journey-card h3{margin-bottom:12px}
        .c-journey-card p{color:#777;line-height:1.6;font-size:14px}
        .c-quote{padding:100px 0;text-align:center;background:#050505}
        .c-quote-text{max-width:850px;margin:auto;font-size:clamp(30px,5vw,55px);line-height:1.1;font-weight:900;letter-spacing:-2px}
        .c-quote-text span{color:var(--red)}
        .c-faq{background:#090909}
        .c-faq-container{max-width:850px;margin:55px auto 0}
        .c-faq-item{border-bottom:1px solid var(--border)}
        .c-faq-q{width:100%;padding:25px 0;background:transparent;border:none;color:#fff;display:flex;justify-content:space-between;text-align:left;font-size:17px;font-weight:700;cursor:pointer}
        .c-faq-a{color:#888;line-height:1.7;padding-bottom:25px;font-size:14px}
        .c-faq-icon{font-size:22px;transition:.3s}
        .c-faq-item.active .c-faq-icon{transform:rotate(45deg);color:var(--red)}
        .c-final{padding:120px 0;text-align:center;background:radial-gradient(circle at center,rgba(255,0,0,.2),transparent 45%),#050505}
        .c-final h2{font-size:clamp(45px,7vw,80px);line-height:1;font-weight:900;letter-spacing:-3px;max-width:900px;margin:auto auto 25px}
        .c-final p{max-width:600px;margin:auto auto 35px;color:#999;line-height:1.7}
        footer.c-footer{border-top:1px solid var(--border);padding:60px 0 30px;background:#030303}
        .c-footer-grid{display:grid;grid-template-columns:1.5fr repeat(3,1fr);gap:40px;margin-bottom:60px}
        .c-footer-brand p{color:#777;line-height:1.7;font-size:14px;max-width:300px;margin-top:15px}
        .c-footer-col h4{margin-bottom:20px;font-size:14px}
        .c-footer-col a{display:block;color:#777;font-size:13px;margin-bottom:13px;transition:.3s}
        .c-footer-col a:hover{color:#fff}
        .c-footer-bottom{border-top:1px solid var(--border);padding-top:25px;display:flex;justify-content:space-between;color:#555;font-size:12px}
        @media (max-width: 900px){
          .c-nav-links{position:absolute;top:70px;left:4%;width:92%;padding:20px;background:#101010;border:1px solid var(--border);border-radius:18px;display:none;flex-direction:column;align-items:stretch}
          .c-nav-links.active{display:flex}
          .c-nav-btn{text-align:center}
          .c-menu-btn{display:block}
          .c-hero-inner,.c-earn-layout,.c-promote-layout{grid-template-columns:1fr}
          .c-hero{padding-bottom:70px}
          .c-hero-content{text-align:center}
          .c-hero-content p{margin-left:auto;margin-right:auto}
          .c-hero-btns{justify-content:center}
          .c-preview{min-height:auto}
          .c-feature-grid{grid-template-columns:repeat(2,1fr)}
          .c-analytics-showcase{grid-template-columns:1fr}
          .c-community-grid,.c-journey-grid{grid-template-columns:repeat(2,1fr)}
          .c-footer-grid{grid-template-columns:1fr 1fr}
        }
        @media (max-width: 600px){
          .c-section{padding:75px 0}
          .c-hero-content h1{font-size:52px;letter-spacing:-3px}
          .c-hero-content p{font-size:16px}
          .c-dashboard{transform:none;padding:14px;animation:none}
          .c-feature-grid,.c-community-grid,.c-journey-grid{grid-template-columns:1fr}
          .c-dash-grid{grid-template-columns:1fr 1fr}
          .c-earn-visual{min-height:390px}
          .c-money-card{width:280px}
          .c-earning-badge{right:0;top:5%}
          .c-phone{width:270px;height:520px}
          .c-footer-grid{grid-template-columns:1fr}
          .c-footer-bottom{flex-direction:column;gap:10px}
          .c-primary,.c-secondary{width:100%}
        }
        .c-creators-grid{grid-template-columns:repeat(4,1fr)!important;gap:22px!important}
        @media (max-width: 768px){ .c-creators-grid{grid-template-columns:repeat(2,1fr)!important} }
        @media (max-width: 480px){ .c-creators-grid{grid-template-columns:1fr!important} }
      `}</style>

      <header className={`c-navbar ${scrolled ? 'scrolled' : ''}`}>
        <div className="c-nav-inner">
          <a onClick={() => navigate('/')} style={{cursor:'pointer'}} className="c-logo">Nova<span>Flix</span></a>
          <nav className={`c-nav-links ${mobileOpen ? 'active' : ''}`}>
            <a onClick={() => scrollTo('#features')} style={{cursor:'pointer'}}>Features</a>
            <a onClick={() => scrollTo('#earn')} style={{cursor:'pointer'}}>Earn</a>
            <a onClick={() => scrollTo('#analytics')} style={{cursor:'pointer'}}>Analytics</a>
            <a onClick={() => scrollTo('#promote')} style={{cursor:'pointer'}}>Promote</a>
            <a onClick={() => scrollTo('#faq')} style={{cursor:'pointer'}}>FAQ</a>
            <a onClick={handleJoin} style={{cursor:'pointer'}} className="c-nav-btn">{authedCreator ? 'Go to Dashboard' : 'Join NovaFlix'}</a>
          </nav>
          <button className="c-menu-btn" onClick={() => setMobileOpen(!mobileOpen)}>{mobileOpen ? '✕' : '☰'}</button>
        </div>
      </header>

      <section className="c-hero">
        <div className="c-container c-hero-inner">
          <motion.div className="c-hero-content" initial={{opacity:0,y:30}} animate={{opacity:1,y:0}} transition={{duration:0.8}}>
            <span className="c-label">NOVAFLIX FOR CREATORS</span>
            <h1>Your story deserves <span className="c-red">an audience.</span></h1>
            <p>Bring your movies, shorts and ideas to NovaFlix. Build your audience, connect directly with fans, promote your work and earn from your creativity.</p>
            <div className="c-hero-btns">
              <motion.button whileHover={{y:-3}} whileTap={{scale:0.98}} onClick={handleBecomeCreator} className="c-primary">Become a Creator →</motion.button>
              <motion.button whileHover={{y:-2}} onClick={() => scrollTo('#features')} className="c-secondary">Explore Creator Tools</motion.button>
            </div>
            <div className="c-hero-note">Built for filmmakers, actors, directors, editors, reviewers and storytellers.</div>
          </motion.div>
          <motion.div className="c-preview" initial={{opacity:0, scale:0.9, rotate:2}} animate={{opacity:1, scale:1, rotate:2}} transition={{duration:0.9, delay:0.2}}>
            <div className="c-dashboard">
              <div className="c-dash-top">
                <div className="c-dash-profile"><div className="c-avatar">NF</div><div><strong>Your Creator Studio</strong><small><span className="c-verified">✓</span> Verified Creator</small></div></div>
                <span className="c-gold">● Live</span>
              </div>
              <div className="c-analytics-card">
                <div className="c-analytics-title"><span>Audience growth</span><span className="c-gold">+24.8%</span></div>
                <div className="c-big-number">128,420</div>
                <div className="c-chart">{[30,45,38,55,65,72,88,100].map((h,i)=><motion.div key={i} className="c-bar" initial={{height:0}} whileInView={{height:`${h}%`}} viewport={{once:true}} transition={{delay: i*0.08, duration:0.6}} />)}</div>
              </div>
              <div className="c-dash-grid">
                <div className="c-small-stat"><span>WATCH TIME</span><strong>2.4M</strong></div>
                <div className="c-small-stat"><span>FOLLOWERS</span><strong>{loading ? '—' : safeCount(creators.length ? creators.reduce((a,c)=>a+(Number(c.followers_count)||0),0) : 48700)}</strong></div>
                <div className="c-small-stat"><span>RELEASES</span><strong>18</strong></div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="c-trust">
        <div className="c-container c-trust-inner">
          {[
            {k:'Filmmakers', v:'Stories that move'},
            {k:'Creators', v:'Ideas to screen'},
            {k:'Storytellers', v:'Voices amplified'},
            {k:'Film Communities', v:'Audiences worldwide'},
          ].map(item=>(
            <div key={item.k} className="c-trust-item">Built for<strong>{item.k}</strong></div>
          ))}
        </div>
      </section>

      <motion.section id="featured-creators" className="c-section" style={{background:'#080808', textAlign:'center'}} initial={{opacity:0}} whileInView={{opacity:1}} viewport={{once:true}} transition={{duration:0.6}}>
        <div className="c-container">
          <span className="c-label">Featured Creators</span>
          <h2 className="c-title" style={{marginLeft:'auto', marginRight:'auto'}}>Meet the creators <span className="c-red">shaping NovaFlix.</span></h2>
          <p className="c-desc" style={{margin:'auto'}}>Real filmmakers, real audiences — live from the database.</p>
          <div style={{marginTop:40, minHeight:120}}>
            {loading ? (
              <div className="c-creators-grid" style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:22}}>
                {Array.from({length:8}).map((_,i)=><div key={i} style={{height:400, background:'rgba(255,255,255,0.05)', borderRadius:20}} />)}
              </div>
            ) : error ? (
              <div style={{padding:20}}><p style={{color:'#ff6666', marginBottom:12}}>{error}</p><button onClick={() => window.location.reload()} className="c-secondary" style={{padding:'10px 18px'}}>Retry</button></div>
            ) : creators.length===0 ? (
              <p style={{color:'#777', padding:20}}>Be the first creator — your profile will appear here.</p>
            ) : (
              <motion.div initial="hidden" whileInView="visible" viewport={{once:true}} variants={{hidden:{}, visible:{transition:{staggerChildren:0.07}}}} className="c-creators-grid" style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:22}}>
                {creators.slice(0,8).map(c=>(
                  <motion.div key={c.id} variants={{hidden:{opacity:0,y:20}, visible:{opacity:1,y:0}}} whileHover={{y:-6}} onClick={()=>navigate(`/creators/${c.id}`)} style={{cursor:'pointer', background:'#111', border:'1px solid var(--border)', borderRadius:20, overflow:'hidden'}}>
                    <div style={{aspectRatio:'3/4.2', minHeight:320, background:'#0a0a0a', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden'}}>
                      <img src={c.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(c.name)}&background=ff1a1a&color=fff&size=400&bold=true&format=svg`} alt={c.name} loading="lazy" style={{width:'100%',height:'100%',objectFit:'cover'}} onError={e=>{ const fb = `https://ui-avatars.com/api/?name=${encodeURIComponent(c.name)}&background=ff1a1a&color=fff&size=400&bold=true&format=svg`; (e.target as HTMLImageElement).src = fb }} />
                    </div>
                    <div className="c-creator-card-inner" style={{padding:'16px 14px'}}>
                      <div className="c-creator-title" style={{fontWeight:800, fontSize:16, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{c.name}</div>
                      <div className="c-creator-meta" style={{color:'#777', fontSize:13}}>{c.known_for_department||'Filmmaker'} • {safeCount(c.followers_count)} followers</div>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </div>
          <motion.button whileHover={{scale:1.04}} whileTap={{scale:0.97}} onClick={()=>navigate('/creators')} style={{marginTop:30, padding:'12px 22px', borderRadius:30, background:'#fff', color:'#000', fontWeight:800, border:'none', cursor:'pointer'}}>Explore All Creators →</motion.button>
        </div>
      </motion.section>

      <section className="c-section c-features" id="features">
        <div className="c-container">
          <motion.span initial={{opacity:0}} whileInView={{opacity:1}} viewport={{once:true}} className="c-label">CREATOR TOOLS</motion.span>
          <motion.h2 initial={{opacity:0,y:20}} whileInView={{opacity:1,y:0}} viewport={{once:true}} className="c-title">Everything you need to <span className="c-red">build your film career.</span></motion.h2>
          <p className="c-desc">NovaFlix gives creators a home for their work, their audience and their creative identity.</p>
          <motion.div className="c-feature-grid" initial="hidden" whileInView="visible" viewport={{once:true}} variants={{hidden:{}, visible:{transition:{staggerChildren:0.08}}}}>
            {[
              {icon:'🎬',t:'Publish Your Work',d:'Upload movies, shorts, trailers and original video content directly to your NovaFlix creator profile.'},
              {icon:'📊',t:'Understand Your Audience',d:'See how viewers discover your work, where your audience comes from and which releases are connecting with fans.'},
              {icon:'🚀',t:'Promote Your Releases',d:'Put your movie or trailer in front of audiences that are interested in your genre and creative style.'},
              {icon:'💰',t:'Earn From Your Creativity',d:'Eligible creators can earn through NovaFlix creator monetization programs and audience-supported features.'},
              {icon:'❤️',t:'Build Real Fans',d:'Turn viewers into followers and create a community around your movies, personality and creative journey.'},
              {icon:'🌍',t:'Reach Beyond Borders',d:'Give your stories the opportunity to reach viewers beyond your city, country or existing social audience.'},
            ].map(f=>(
              <motion.div key={f.t} variants={{hidden:{opacity:0,y:30}, visible:{opacity:1,y:0}}} whileHover={{y:-8}} className="c-feature-card">
                <div className="c-feature-icon">{f.icon}</div><h3>{f.t}</h3><p>{f.d}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      <section className="c-section c-earn" id="earn">
        <div className="c-container c-earn-layout">
          <motion.div className="c-earn-visual" initial={{opacity:0, x:-30}} whileInView={{opacity:1,x:0}} viewport={{once:true}} transition={{duration:0.7}}>
            <div className="c-money-card">
              <small>CREATOR EARNINGS</small><h3>₦••••••</h3>
              <div className="c-money-line"><span></span></div><small>Earnings dashboard</small>
            </div>
            <motion.div className="c-earning-badge" animate={{y:[0,-8,0]}} transition={{repeat:Infinity, duration:3}}>✦ Creator payout available</motion.div>
          </motion.div>
          <div>
            <span className="c-label">GET PAID</span>
            <h2 className="c-title">Your creativity can become <span className="c-gold">a business.</span></h2>
            <p className="c-desc">NovaFlix is designed to give creators multiple ways to build sustainable income around their creative work and audience.</p>
            <div className="c-earning-list">
              {[
                {h:'Content-based earnings',p:'Eligible movies and short-form content can participate in NovaFlix creator monetization programs.'},
                {h:'Fan support',p:'Let your audience support your work through creator gifts, tips and community features.'},
                {h:'Products & experiences',p:'Build additional revenue around merchandise, digital products, workshops and creator experiences.'},
              ].map(i=>(
                <div key={i.h} className="c-earning-item"><div className="c-check">✓</div><div><h4>{i.h}</h4><p>{i.p}</p></div></div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="c-section c-analytics" id="analytics">
        <div className="c-container">
          <span className="c-label">CREATOR ANALYTICS</span>
          <h2 className="c-title">Don&apos;t just create. <span className="c-red">Know what&apos;s working.</span></h2>
          <p className="c-desc">Turn audience activity into useful information that can help you make smarter creative and promotional decisions.</p>
          <div className="c-analytics-showcase">
            <motion.div className="c-analytics-large" initial={{opacity:0,y:20}} whileInView={{opacity:1,y:0}} viewport={{once:true}}>
              <h3>Watch time</h3><p>Understand how viewers are engaging with your releases over time.</p>
              <div className="c-line-chart">{[30,45,42,60,54,75,83,100].map((h,i)=><motion.div key={i} className="c-line-bar" initial={{height:0}} whileInView={{height:`${h}%`}} viewport={{once:true}} transition={{delay:i*0.07, duration:0.6}} />)}</div>
            </motion.div>
            <motion.div className="c-analytics-large" initial={{opacity:0,y:20}} whileInView={{opacity:1,y:0}} viewport={{once:true}} transition={{delay:0.15}}>
              <h3>Audience insights</h3><p>Learn more about the people discovering and following your creative work.</p>
              <div className="c-audience-box">
                <div className="c-audience-row"><span>Followers</span><strong>{loading?'—': safeCount(creators.reduce((a,c)=>a+(Number(c.followers_count)||0),0))}</strong></div>
                <div className="c-audience-row"><span>New viewers</span><strong>+18.4K</strong></div>
                <div className="c-audience-row"><span>Returning viewers</span><strong>64%</strong></div>
                <div className="c-audience-row"><span>Top genre</span><strong>Drama</strong></div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      <section className="c-section c-promote" id="promote">
        <div className="c-container c-promote-layout">
          <div>
            <span className="c-label">PROMOTION</span>
            <h2 className="c-title">Put your next release <span className="c-red">in the spotlight.</span></h2>
            <p className="c-desc">Don&apos;t wait for people to randomly discover your movie. Use creator promotion tools to give your release more visibility inside the NovaFlix ecosystem.</p>
            <div className="c-earning-list">
              <div className="c-earning-item"><div className="c-check">1</div><div><h4>Choose your release</h4><p>Select the movie, short or trailer you want to put in front of audiences.</p></div></div>
              <div className="c-earning-item"><div className="c-check">2</div><div><h4>Find the right audience</h4><p>Use audience and content signals to reach people interested in your type of content.</p></div></div>
              <div className="c-earning-item"><div className="c-check">3</div><div><h4>Measure the result</h4><p>Monitor engagement and understand how viewers respond to your promotion.</p></div></div>
            </div>
          </div>
          <motion.div initial={{opacity:0, scale:0.9}} whileInView={{opacity:1, scale:1}} viewport={{once:true}} transition={{duration:0.7}}>
            <div className="c-phone"><div className="c-phone-screen"><div className="c-movie-poster"></div><div className="c-phone-content"><span className="c-promoted-label">PROMOTED RELEASE</span><h3>Your Next Film</h3><p>A new cinematic experience is waiting to be discovered.</p><span className="c-watch-btn">Watch Trailer →</span></div></div></div>
          </motion.div>
        </div>
      </section>

      <section className="c-section c-community">
        <div className="c-container">
          <span className="c-label">YOUR COMMUNITY</span>
          <h2 className="c-title" style={{marginLeft:'auto',marginRight:'auto'}}>Build more than views. <span className="c-red">Build fandom.</span></h2>
          <p className="c-desc">Your creator profile becomes a home where audiences can discover your work, follow your journey and interact with your content.</p>
          <motion.div className="c-community-grid" initial="hidden" whileInView="visible" viewport={{once:true}} variants={{hidden:{}, visible:{transition:{staggerChildren:0.08}}}}>
            {[
              {n:'01',t:'Followers',d:'Grow a dedicated audience around your work.'},
              {n:'02',t:'Comments',d:'Start conversations around your movies.'},
              {n:'03',t:'Live Interaction',d:'Connect with fans through interactive experiences.'},
              {n:'04',t:'Fan Support',d:'Give supporters ways to contribute to your journey.'},
            ].map(c=>(
              <motion.div key={c.n} variants={{hidden:{opacity:0,y:20}, visible:{opacity:1,y:0}}} whileHover={{y:-6}} className="c-community-card">
                <div className="c-community-number">{c.n}</div><h4>{c.t}</h4><p>{c.d}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      <section className="c-section c-journey">
        <div className="c-container">
          <span className="c-label">HOW IT WORKS</span>
          <h2 className="c-title">From first upload to <span className="c-red">your next big audience.</span></h2>
          <motion.div className="c-journey-grid" initial="hidden" whileInView="visible" viewport={{once:true}} variants={{hidden:{}, visible:{transition:{staggerChildren:0.1}}}}>
            {[
              {n:'STEP 01',t:'Create',d:'Set up your creator profile and tell the NovaFlix community who you are.'},
              {n:'STEP 02',t:'Publish',d:'Upload your movie, short, trailer or other original creative work.'},
              {n:'STEP 03',t:'Grow',d:'Build followers, engage with viewers and use analytics to understand your audience.'},
              {n:'STEP 04',t:'Earn',d:'Participate in available monetization opportunities as your audience grows.'},
            ].map(j=>(
              <motion.div key={j.n} variants={{hidden:{opacity:0,y:30}, visible:{opacity:1,y:0}}} className="c-journey-card">
                <div className="c-journey-number">{j.n}</div><h3>{j.t}</h3><p>{j.d}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      <motion.section className="c-quote" initial={{opacity:0}} whileInView={{opacity:1}} viewport={{once:true}}><div className="c-container"><div className="c-quote-text">“Don&apos;t just upload a movie. <span>Build a world people want to return to.</span>”</div></div></motion.section>

      <section className="c-section c-faq" id="faq">
        <div className="c-container">
          <span className="c-label">CREATOR FAQ</span>
          <h2 className="c-title">Questions creators <span className="c-red">ask.</span></h2>
          <div className="c-faq-container">
            {[
              {q:'Who can become a NovaFlix creator?',a:'NovaFlix is designed for filmmakers, directors, producers, actors, editors, reviewers, storytellers and other original video creators.'},
              {q:'Can I upload my movie?',a:'Eligible creators can submit original movies, shorts and other video content through the creator platform, subject to NovaFlix content and rights requirements.'},
              {q:'Do creators get paid?',a:'NovaFlix is designed to provide monetization opportunities for eligible creators. Earnings can depend on the creator program, content, audience engagement and applicable platform terms.'},
              {q:'Can I promote my movie?',a:'Yes. NovaFlix is designed to provide creator promotion tools that can help eligible creators increase the visibility of their movies, trailers and other releases.'},
              {q:'Can fans support creators?',a:'NovaFlix can provide audience-support features such as creator gifts and other fan-supported experiences where available.'},
              {q:'Will I have access to analytics?',a:'Creator analytics are designed to help you understand content performance, audience growth, engagement and other useful creator metrics.'},
            ].map((f,i)=>(
              <motion.div key={f.q} initial={{opacity:0,y:10}} whileInView={{opacity:1,y:0}} viewport={{once:true}} transition={{delay:i*0.05}} className={`c-faq-item ${activeFaq===i?'active':''}`}>
                <button className="c-faq-q" onClick={()=>setActiveFaq(activeFaq===i?null:i)}>{f.q}<span className="c-faq-icon">+</span></button>
                <AnimatePresence>
                  {activeFaq===i && (
                    <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} transition={{duration:0.3}}>
                      <div className="c-faq-a" style={{display:'block'}}>{f.a}</div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="c-final" id="join">
        <div className="c-container">
          <motion.span initial={{opacity:0}} whileInView={{opacity:1}} viewport={{once:true}} className="c-label">YOUR STORY STARTS HERE</motion.span>
          <motion.h2 initial={{opacity:0,y:20}} whileInView={{opacity:1,y:0}} viewport={{once:true}} style={{fontSize:'clamp(45px,7vw,80px)',lineHeight:1,fontWeight:900,letterSpacing:'-3px',maxWidth:900,margin:'auto auto 25px'}}>Ready to put your <span className="c-red">story on NovaFlix?</span></motion.h2>
          <p style={{maxWidth:600,margin:'auto auto 35px',color:'#999',lineHeight:1.7}}>Create your creator profile, publish your work, connect with audiences and start building your creative future.</p>
          <motion.button whileHover={{scale:1.05,y:-2}} whileTap={{scale:0.98}} onClick={handleJoin} className="c-primary" style={{fontSize:18, padding:'18px 34px'}}>Join NovaFlix as a Creator →</motion.button>
        </div>
      </section>

      <footer className="c-footer">
        <div className="c-container">
          <div className="c-footer-grid">
            <div className="c-footer-brand">
              <div className="c-logo">Nova<span>Flix</span></div>
              <p>A home for movies, creators and the people who love great stories.</p>
            </div>
            <div className="c-footer-col"><h4>Creators</h4><a onClick={handleBecomeCreator} style={{cursor:'pointer'}}>Creator Studio</a><a onClick={()=>navigate('/upload')} style={{cursor:'pointer'}}>Upload</a><a onClick={()=>navigate('/creator/analytics')} style={{cursor:'pointer'}}>Analytics</a><a onClick={()=>navigate('/creator/wallet')} style={{cursor:'pointer'}}>Earnings</a></div>
            <div className="c-footer-col"><h4>Platform</h4><a onClick={()=>navigate('/discover')} style={{cursor:'pointer'}}>Movies</a><a onClick={()=>navigate('/discover?sort=shorts')} style={{cursor:'pointer'}}>Shorts</a><a onClick={()=>navigate('/community')} style={{cursor:'pointer'}}>Community</a><a onClick={()=>navigate('/events')} style={{cursor:'pointer'}}>Events</a></div>
            <div className="c-footer-col"><h4>Company</h4><a onClick={()=>navigate('/about')} style={{cursor:'pointer'}}>About NovaFlix</a><a>Contact</a><a>Privacy</a><a>Terms</a></div>
          </div>
          <div className="c-footer-bottom"><span>© 2026 NovaFlix. All rights reserved.</span><span>Create. Reach. Earn.</span></div>
        </div>
      </footer>
    </div>
  )
}
