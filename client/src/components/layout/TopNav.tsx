import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/AuthContext'
import { useStore } from '../../store/useStore'
import { useNotifications } from '../../lib/notifications'
import Icon from '../ui/Icon'
import SearchLightbox from '../ui/SearchLightbox'
import NotificationBell from './NotificationBell'

export default function TopNav() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const toggleMobileDrawer = useStore((s) => s.toggleMobileDrawer)
  const sidebarCollapsed = useStore((s) => s.sidebarCollapsed)
  const mobileDrawerOpen = useStore((s) => s.mobileDrawerOpen)
  const [searchOpen, setSearchOpen] = useState(false)
  const notif = useNotifications(Boolean(user))

  return (
    <header
      className="fixed top-0 left-0 right-0 z-40 glass-panel flex justify-between items-center px-margin-mobile md:px-margin-desktop h-16"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)', height: 'calc(4rem + env(safe-area-inset-top, 0px))' }}
    >
      <div className={`flex items-center gap-3 min-w-0 ${searchOpen ? 'hidden md:flex' : ''}`}>
        <button
          onClick={toggleMobileDrawer}
          className="lg:hidden p-3 rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-white/5 transition-colors shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Open navigation menu"
        >
          <Icon name="menu" />
        </button>
        <Link to="/home" className={`flex items-center gap-2 shrink-0 ${!sidebarCollapsed ? 'lg:hidden' : ''} ${mobileDrawerOpen ? 'hidden' : ''}`}>
          <img src="/leter-mark-logo.png" alt="NovaFlix" className="w-auto h-6 md:h-7 lg:h-8 object-contain max-h-full shrink-0" />
        </Link>
        <nav className="hidden lg:flex items-center gap-6 ml-8">
          <Link to="/home" className="font-label-md text-label-md text-primary transition-colors">Home</Link>
          <Link to="/search?type=movie" className="font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors">Movies</Link>
          <Link to="/tv-shows" className="font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors">TV Shows</Link>
          <Link to="/discover?sort=trending" className="font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors">New & Popular</Link>
          <Link to="/hooks" className="font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors">Shorts</Link>
          <Link to="/news" className="font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors">News</Link>
          {user && (
            <Link to="/forum" className="font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors">Hot Takes</Link>
          )}
        </nav>
      </div>
      {searchOpen && (
        <span className="md:hidden text-headline-md font-extrabold text-primary-container tracking-tight shrink-0">N</span>
      )}
      {searchOpen ? (
        <SearchLightbox open variant="navbar" onClose={() => setSearchOpen(false)} />
      ) : (
        <div className="flex items-center gap-2 md:gap-4 shrink-0">
          <Link
            to="/download-app"
            className="hidden md:flex items-center gap-1.5 font-label-md text-label-md text-on-surface-variant hover:text-primary transition-colors shrink-0"
          >
            <Icon name="smartphone" size="sm" /> Get App
          </Link>
          <button onClick={() => setSearchOpen(true)} className="text-on-surface-variant hover:text-primary transition-colors p-2.5 flex items-center justify-center min-w-[44px] min-h-[44px]" aria-label="Search">
            <Icon name="search" />
          </button>
          {user && (
            <NotificationBell {...notif} />
          )}
          <button
            onClick={() => navigate(user ? '/profile' : '/login')}
            className="w-9 h-9 md:w-8 md:h-8 rounded-xl overflow-hidden border border-surface-variant bg-surface-container-high shrink-0"
            aria-label={user ? 'Profile' : 'Sign in'}
          >
            {user?.avatar ? (
              <img src={user.avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-on-surface-variant">
                <Icon name="person" size="sm" />
              </div>
            )}
          </button>
        </div>
      )}
    </header>
  )
}
