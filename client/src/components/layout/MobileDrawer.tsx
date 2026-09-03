import { useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../../store/useStore'
import { useAuth } from '../../lib/AuthContext'
import Icon from '../ui/Icon'

interface NavItem {
  to: string
  icon: string
  label: string
  auth?: boolean
  creatorOnly?: boolean
  adminOnly?: boolean
}

const mainItems: NavItem[] = [
  { to: '/home', icon: 'home', label: 'Home' },
  { to: '/search?type=movie', icon: 'search', label: 'Search' },
  { to: '/tv-shows', icon: 'live_tv', label: 'TV Shows' },
  { to: '/discover', icon: 'explore', label: 'Discover' },
  { to: '/events', icon: 'event', label: 'Live Events' },
  { to: '/red-carpet', icon: 'star', label: 'Red Carpet' },
]

const authItems: NavItem[] = [
  { to: '/hooks', icon: 'video_library', label: 'Shorts', auth: true },
  { to: '/watchlist', icon: 'bookmark', label: 'Watchlist', auth: true },
  { to: '/referrals', icon: 'share', label: 'Refer & Earn', auth: true },
  { to: '/download-app', icon: 'smartphone', label: 'Download App' },
  { to: '/downloads', icon: 'download', label: 'My Downloads', auth: true },
  { to: '/archive', icon: 'archive', label: 'Archive Vault', auth: true },
]

const engagementItems: NavItem[] = [
  { to: '/community', icon: 'diversity_3', label: 'Community', auth: true },
  { to: '/hot-takes', icon: 'local_fire_department', label: 'Hot Takes', auth: true },
  { to: '/trivia', icon: 'quiz', label: 'Trivia & Rewards', auth: true },
]

const creatorItems: NavItem[] = [
  { to: '/creator', icon: 'bar_chart', label: 'Dashboard', auth: true, creatorOnly: true },
  { to: '/upload', icon: 'cloud_upload', label: 'Upload Film', auth: true, creatorOnly: true },
  { to: '/creator/memberships', icon: 'card_membership', label: 'Memberships', auth: true, creatorOnly: true },
  { to: '/creator/events', icon: 'live_tv', label: 'Live Events', auth: true, creatorOnly: true },
  { to: '/creator/products', icon: 'inventory_2', label: 'Products', auth: true, creatorOnly: true },
  { to: '/creator/courses', icon: 'school', label: 'Courses', auth: true, creatorOnly: true },
]

const adminItems: NavItem[] = [
  { to: '/admin', icon: 'admin_panel_settings', label: 'Admin Panel', auth: true, adminOnly: true },
]

const extraItems: NavItem[] = [
  { to: '/pricing', icon: 'workspace_premium', label: 'Plans' },
  { to: '/store', icon: 'shopping_bag', label: 'Merch Store' },
  { to: '/learn', icon: 'school', label: 'E-Learning' },
  { to: '/watch-party', icon: 'diversity_3', label: 'Watch Party', auth: true },
]

export default function MobileDrawer() {
  const open = useStore((s) => s.mobileDrawerOpen)
  const setOpen = useStore((s) => s.setMobileDrawerOpen)
  const { user, isCreator, isAdmin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  const handleNav = (to: string) => {
    setOpen(false)
    navigate(to)
  }

  const isActive = (to: string) => {
    const path = to.split('?')[0]
    return location.pathname === path
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm lg:hidden"
            onClick={() => setOpen(false)}
          />
          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed left-0 top-0 bottom-0 z-50 w-[85vw] max-w-[300px] min-w-[260px] bg-surface-container-lowest border-r border-white/5 flex flex-col lg:hidden"
          >
            <div className="flex items-center justify-between px-4 h-16 border-b border-white/5 shrink-0">
              <img src="/leter-mark-logo.png" alt="NovaFlix" className="w-auto h-6 md:h-7 object-contain max-h-full shrink-0" />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setOpen(false)
                }}
                className="p-3 rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-white/5 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                aria-label="Close navigation menu"
              >
                <Icon name="close" />
              </button>
            </div>

            {user && (
              <button
                onClick={() => handleNav('/profile')}
                className="flex items-center gap-3 mx-3 mt-3 px-3 py-2.5 rounded-xl bg-surface-container-high border border-white/5 text-left shrink-0"
              >
                <span className="w-9 h-9 rounded-full overflow-hidden bg-gradient-to-br from-primary-container to-secondary flex items-center justify-center shrink-0">
                  {user.avatar ? (
                    <img src={user.avatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Icon name="person" size="sm" />
                  )}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-label-md text-label-md text-on-surface truncate">{user.name || 'Member'}</span>
                  <span className="block text-xs text-on-surface-variant/60 truncate">{user.email || ''}</span>
                </span>
                <Icon name="chevron_right" size="sm" className="text-on-surface-variant/40 shrink-0" />
              </button>
            )}

            <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1 pb-safe">
              {mainItems.map((item) => (
                <button
                  key={item.to}
                  onClick={() => handleNav(item.to)}
                  className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-left transition-colors ${
                    isActive(item.to)
                      ? 'text-primary bg-white/5'
                      : 'text-on-surface-variant/60 hover:text-on-surface hover:bg-white/5'
                  }`}
                >
                  <Icon name={item.icon} size="sm" className={`shrink-0 ${isActive(item.to) ? 'text-primary' : ''}`} />
                  <span className="font-label-md text-label-md">{item.label}</span>
                </button>
              ))}

              <div className="my-3 px-3">
                <div className="h-px bg-white/5" />
              </div>

              {!user && (
                <button
                  onClick={() => handleNav('/login')}
                  className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-on-surface-variant/60 hover:text-on-surface hover:bg-white/5 transition-colors text-left"
                >
                  <Icon name="login" size="sm" className="shrink-0" />
                  <span className="font-label-md text-label-md">Sign In</span>
                </button>
              )}

              {authItems
                .filter((i) => !i.auth || user)
                .map((item) => (
                  <button
                    key={item.to}
                    onClick={() => handleNav(item.to)}
                    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-on-surface-variant/60 hover:text-on-surface hover:bg-white/5 transition-colors text-left"
                  >
                    <Icon name={item.icon} size="sm" className="shrink-0" />
                    <span className="font-label-md text-label-md">{item.label}</span>
                  </button>
                ))}

              {user && (
                <>
                  <p className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">Community &amp; Engagement</p>
                  {engagementItems
                    .filter((i) => !i.auth || user)
                    .map((item) => (
                      <button
                        key={item.to}
                        onClick={() => handleNav(item.to)}
                        className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-on-surface-variant/60 hover:text-on-surface hover:bg-white/5 transition-colors text-left"
                      >
                        <Icon name={item.icon} size="sm" className="shrink-0" />
                        <span className="font-label-md text-label-md">{item.label}</span>
                      </button>
                    ))}
                </>
              )}

              {(isCreator || isAdmin) && (
                <>
                  <div className="my-3 px-3">
                    <div className="h-px bg-white/5" />
                  </div>
                  {creatorItems
                    .filter((i) => !i.creatorOnly || isCreator)
                    .map((item) => (
                      <button
                        key={item.to}
                        onClick={() => handleNav(item.to)}
                        className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-on-surface-variant/60 hover:text-on-surface hover:bg-white/5 transition-colors text-left"
                      >
                        <Icon name={item.icon} size="sm" className="shrink-0" />
                        <span className="font-label-md text-label-md">{item.label}</span>
                      </button>
                    ))}
                </>
              )}

              {isAdmin && (
                <>
                  <div className="my-3 px-3">
                    <div className="h-px bg-white/5" />
                  </div>
                  {adminItems.map((item) => (
                    <button
                      key={item.to}
                      onClick={() => handleNav(item.to)}
                      className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-secondary hover:bg-white/5 transition-colors text-left"
                    >
                      <Icon name={item.icon} size="sm" className="shrink-0 text-secondary" />
                      <span className="font-label-md text-label-md">{item.label}</span>
                    </button>
                  ))}
                </>
              )}

              <div className="my-3 px-3">
                <div className="h-px bg-white/5" />
              </div>

              {extraItems.map((item) => {
                if (item.auth && !user) return null
                return (
                  <button
                    key={item.to}
                    onClick={() => handleNav(item.to)}
                    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-on-surface-variant/60 hover:text-on-surface hover:bg-white/5 transition-colors text-left"
                  >
                    <Icon name={item.icon} size="sm" className="shrink-0" />
                    <span className="font-label-md text-label-md">{item.label}</span>
                  </button>
                )
              })}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
