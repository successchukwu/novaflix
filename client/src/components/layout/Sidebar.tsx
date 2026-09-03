import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
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
  color?: string
}

const navItems: NavItem[] = [
  { to: '/tv-shows', icon: 'live_tv', label: 'TV Shows' },
  { to: '/discover?sort=trending', icon: 'trending_up', label: 'Trending' },
  { to: '/discover?sort=top_rated', icon: 'star', label: 'Top Rated' },
  { to: '/discover', icon: 'explore', label: 'Discover' },
  { to: '/watchlist', icon: 'bookmark', label: 'Watchlist', auth: true },
  { to: '/download-app', icon: 'smartphone', label: 'Download App' },
  { to: '/downloads', icon: 'download', label: 'My Downloads', auth: true },
  { to: '/referrals', icon: 'share', label: 'Refer & Earn', auth: true },
  { to: '/archive', icon: 'archive', label: 'Archive Vault', auth: true },
  { to: '/events', icon: 'event', label: 'Live Events' },
  { to: '/red-carpet', icon: 'star', label: 'Red Carpet' },
  { to: '/hooks', icon: 'video_library', label: 'Shorts', auth: true },
  { to: '/news', icon: 'newspaper', label: 'News & Insights' },
]

const engagementItems: NavItem[] = [
  { to: '/community', icon: 'diversity_3', label: 'Community', auth: true },
  { to: '/hot-takes', icon: 'local_fire_department', label: 'Hot Takes', auth: true },
  { to: '/trivia', icon: 'quiz', label: 'Trivia & Rewards', auth: true },
]

const businessItems: NavItem[] = [
  { to: '/pricing', icon: 'workspace_premium', label: 'Plans', color: 'text-primary' },
  { to: '/creator', icon: 'bar_chart', label: 'Creator Hub', auth: true, creatorOnly: true, color: 'text-primary' },
  { to: '/upload', icon: 'cloud_upload', label: 'Upload Film', auth: true, creatorOnly: true, color: 'text-primary' },
  { to: '/creator/campaigns', icon: 'campaign', label: 'Promotions', auth: true, creatorOnly: true, color: 'text-primary' },
  { to: '/creator/memberships', icon: 'card_membership', label: 'Memberships', auth: true, creatorOnly: true, color: 'text-primary' },
  { to: '/creator/events', icon: 'live_tv', label: 'Live Events', auth: true, creatorOnly: true, color: 'text-primary' },
  { to: '/creator/products', icon: 'inventory_2', label: 'Products', auth: true, creatorOnly: true, color: 'text-primary' },
  { to: '/creator/courses', icon: 'school', label: 'Courses', auth: true, creatorOnly: true, color: 'text-primary' },
  { to: '/store', icon: 'shopping_bag', label: 'Merch Store', color: 'text-primary' },
  { to: '/learn', icon: 'school', label: 'E-Learning', color: 'text-primary' },
  { to: '/watch-party', icon: 'diversity_3', label: 'Watch Party', auth: true, color: 'text-primary' },
]

export default function Sidebar() {
  const collapsed = useStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useStore((s) => s.toggleSidebar)
  const { user, isCreator, isAdmin } = useAuth()

  const visibleNav = navItems.filter(i => !i.auth || user)
  const visibleEngagement = engagementItems.filter(i => !i.auth || user)
  const visibleBusiness = businessItems.filter(i => {
    if (i.auth && !user) return false
    if (i.creatorOnly && !isCreator) return false
    return true
  })

  return (
    <motion.nav
      animate={{ width: collapsed ? 64 : 240 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="hidden lg:flex fixed left-0 top-0 h-screen bg-surface-container-lowest border-r border-white/5 z-30 flex-col py-4 overflow-visible pt-16"
    >
        {collapsed ? (
          <div className="flex flex-col items-center gap-2 px-4 mb-6">
            <button
              onClick={toggleSidebar}
              className="shrink-0 p-2 rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-white/5 transition-colors"
              aria-label="Expand sidebar"
            >
              <Icon name="menu" />
            </button>
            <span className="text-headline-md font-extrabold text-primary-container tracking-tight">N</span>
          </div>
        ) : (
          <div className="flex items-center gap-3 px-6 py-4 h-16 shrink-0">
            <img src="/leter-mark-logo.png" alt="NovaFlix" className="w-auto h-6 md:h-7 lg:h-8 object-contain max-h-full shrink-0" />
            <button
              onClick={toggleSidebar}
              className="shrink-0 ml-auto p-2 rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-white/5 transition-colors"
              aria-label="Collapse sidebar"
            >
              <Icon name="menu_open" />
            </button>
          </div>
        )}

      <div className="flex-1 flex flex-col gap-1 px-2 overflow-y-auto pb-6">
        {visibleNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors duration-200 ${
                isActive
                  ? 'bg-primary-container/20 text-primary'
                  : 'text-on-surface-variant/60 hover:text-on-surface hover:bg-white/5'
              }`
            }
          >
            <Icon name={item.icon} size="sm" className="shrink-0" />
            {!collapsed && (
              <span className="font-label-md text-label-md whitespace-nowrap">{item.label}</span>
            )}
          </NavLink>
        ))}

        {visibleEngagement.length > 0 && (
          <>
            <div className="my-3 px-3">
              <div className="h-px bg-white/5" />
            </div>
            {!collapsed && (
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50">Community &amp; Engagement</p>
            )}
            {visibleEngagement.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors duration-200 ${
                    isActive
                      ? 'bg-primary-container/20 text-primary'
                      : 'text-on-surface-variant/60 hover:text-on-surface hover:bg-white/5'
                  }`
                }
              >
                <Icon name={item.icon} size="sm" className="shrink-0" />
                {!collapsed && (
                  <span className="font-label-md text-label-md whitespace-nowrap">{item.label}</span>
                )}
              </NavLink>
            ))}
          </>
        )}

        {!user && (
          <NavLink
            to="/login"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-on-surface-variant/60 hover:text-on-surface hover:bg-white/5 transition-colors"
          >
            <Icon name="login" size="sm" className="shrink-0" />
            {!collapsed && <span className="font-label-md text-label-md whitespace-nowrap">Sign In</span>}
          </NavLink>
        )}

        {!collapsed && visibleBusiness.length > 0 && (
          <div className="my-3 px-3">
            <div className="h-px bg-white/5" />
          </div>
        )}

        {visibleBusiness.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors duration-200 ${
                isActive
                  ? `${item.color} bg-white/5`
                  : 'text-on-surface-variant/60 hover:text-on-surface hover:bg-white/5'
              }`
            }
          >
            <Icon name={item.icon} size="sm" className={`shrink-0 ${item.color || ''}`} />
            {!collapsed && (
              <span className="font-label-md text-label-md whitespace-nowrap">{item.label}</span>
            )}
          </NavLink>
        ))}

        {isAdmin && (
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors duration-200 ${
                isActive ? 'text-secondary bg-white/5' : 'text-on-surface-variant/60 hover:text-on-surface hover:bg-white/5'
              }`
            }
          >
            <Icon name="admin_panel_settings" size="sm" className="shrink-0 text-secondary" />
            {!collapsed && <span className="font-label-md text-label-md whitespace-nowrap">Admin Panel</span>}
          </NavLink>
        )}
      </div>
    </motion.nav>
  )
}
