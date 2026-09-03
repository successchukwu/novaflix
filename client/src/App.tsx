import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { API_BASE } from './lib/config'
import Layout from './components/layout/Layout'
import AuthGuard from './components/layout/AuthGuard'
import AdminGuard from './components/layout/AdminGuard'
import AdminLayout from './components/layout/AdminLayout'
import CreatorGuard from './components/layout/CreatorGuard'
import Skeleton from './components/ui/Skeleton'

const Creators = lazy(() => import('./pages/Creators'))
const DownloadApp = lazy(() => import('./pages/DownloadApp'))
const Splash = lazy(() => import('./pages/Splash'))
const Home = lazy(() => import('./pages/Home'))
const Search = lazy(() => import('./pages/Search'))
const SearchResults = lazy(() => import('./pages/SearchResults'))
const MovieDetail = lazy(() => import('./pages/MovieDetail'))
const Watch = lazy(() => import('./pages/Watch'))
const TVShows = lazy(() => import('./pages/TVShows'))
const Discover = lazy(() => import('./pages/Discover'))
const Watchlist = lazy(() => import('./pages/Watchlist'))
const Profile = lazy(() => import('./pages/Profile'))
const Settings = lazy(() => import('./pages/Settings'))
const Login = lazy(() => import('./pages/Login'))
const OAuthCallback = lazy(() => import('./pages/OAuthCallback'))
const Register = lazy(() => import('./pages/Register'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const ProfileGateway = lazy(() => import('./pages/ProfileGateway'))
const CreatorForgotPassword = lazy(() => import('./pages/CreatorForgotPassword'))
const CreatorResetPassword = lazy(() => import('./pages/CreatorResetPassword'))
const SuspendedPage = lazy(() => import('./pages/SuspendedPage'))
const Pricing = lazy(() => import('./pages/Pricing'))
const CreatorDashboard = lazy(() => import('./pages/CreatorDashboard'))
const CreatorPlanPicker = lazy(() => import('./pages/CreatorPlanPicker'))
const Upload = lazy(() => import('./pages/Upload'))
const Store = lazy(() => import('./pages/Store'))
const Learn = lazy(() => import('./pages/Learn'))
const WatchParty = lazy(() => import('./pages/WatchParty'))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))
const Community = lazy(() => import('./pages/Community').then(m => ({ default: m.CommunityRedirect })))
const CommunityPage = lazy(() => import('./pages/Community'))
const Downloads = lazy(() => import('./pages/Downloads'))
const HooksFeed = lazy(() => import('./pages/HooksFeed'))
const News = lazy(() => import('./pages/News'))
const ArticleNews = lazy(() => import('./pages/ArticleNews'))
const CategoryPage = lazy(() => import('./pages/CategoryPage'))
const CreatorAnalytics = lazy(() => import('./pages/CreatorAnalytics'))
const CreatorProfileHub = lazy(() => import('./pages/CreatorProfileHub'))
const CreatorCatalog = lazy(() => import('./pages/CreatorCatalog'))
const CreatorCampaigns = lazy(() => import('./pages/CreatorCampaigns'))
const AdminAssetQC = lazy(() => import('./pages/AdminAssetQC'))
const AdminFilters = lazy(() => import('./pages/AdminFilters'))
const AdminCampaigns = lazy(() => import('./pages/AdminCampaigns'))
const AdminLocalization = lazy(() => import('./pages/AdminLocalization'))
const AdminAnnouncements = lazy(() => import('./pages/AdminAnnouncements'))
const AdminOverview = lazy(() => import('./pages/AdminOverview'))
const AdminContent = lazy(() => import('./pages/AdminContent'))
const AdminShorts = lazy(() => import('./pages/AdminShorts'))
const AdminAnalytics = lazy(() => import('./pages/AdminAnalytics'))
const AdminTransactions = lazy(() => import('./pages/AdminTransactions'))
const AdminSubscriptions = lazy(() => import('./pages/AdminSubscriptions'))
const AdminUsers = lazy(() => import('./pages/AdminUsers'))
const AdminCreators = lazy(() => import('./pages/AdminCreators'))
const AdminCommunity = lazy(() => import('./pages/AdminCommunity'))
const AdminModeration = lazy(() => import('./pages/AdminModeration'))
const AdminMarketing = lazy(() => import('./pages/AdminMarketing'))
const AdminPromotions = lazy(() => import('./pages/AdminPromotions'))
const AdminFeedSettings = lazy(() => import('./pages/AdminFeedSettings'))
const AdminRoles = lazy(() => import('./pages/AdminRoles'))
const AdminSettings = lazy(() => import('./pages/AdminSettings'))
const Referrals = lazy(() => import('./pages/Referrals'))
const CreatorMembershipManager = lazy(() => import('./pages/CreatorMembershipManager'))
const CreatorEventsManager = lazy(() => import('./pages/CreatorEventsManager'))
const LiveEvents = lazy(() => import('./pages/LiveEvents'))
const EventDetail = lazy(() => import('./pages/EventDetail'))
const RedCarpet = lazy(() => import('./pages/RedCarpet'))
const CreatorProducts = lazy(() => import('./pages/CreatorProducts'))
const CreatorCourses = lazy(() => import('./pages/CreatorCourses'))
const Archive = lazy(() => import('./pages/Archive'))
const ArchiveDetail = lazy(() => import('./pages/ArchiveDetail'))
const PaymentSuccess = lazy(() => import('./pages/PaymentSuccess'))
const GatewaySuccess = lazy(() => import('./pages/GatewaySuccess'))
const DeepDivePage = lazy(() => import('./pages/DeepDivePage'))
const Notifications = lazy(() => import('./pages/Notifications'))
const NotFound = lazy(() => import('./pages/NotFound'))
const Chat = lazy(() => import('./pages/Chat'))
const Forum = lazy(() => import('./pages/Forum').then(m => ({ default: m.ForumRedirect })))
const ForumPage = lazy(() => import('./pages/Forum'))
const HotTakes = lazy(() => import('./pages/HotTakes'))
const Trivia = lazy(() => import('./pages/Trivia'))
const SecretRoom = lazy(() => import('./pages/SecretRoom'))
const PublicProfile = lazy(() => import('./pages/PublicProfile'))
const ClaimStart = lazy(() => import('./pages/ClaimStart'))
const ClaimPreview = lazy(() => import('./pages/ClaimPreview'))
const ClaimVerify = lazy(() => import('./pages/ClaimVerify'))
const ClaimStatus = lazy(() => import('./pages/ClaimStatus'))
const ClaimSuccess = lazy(() => import('./pages/ClaimSuccess'))
const CreatorWallet = lazy(() => import('./pages/CreatorWallet'))
const CreatorOnboarding = lazy(() => import('./pages/CreatorOnboarding'))
const CreatorPPMSettings = lazy(() => import('./pages/CreatorPPMSettings'))
const GoLive = lazy(() => import('./pages/GoLive'))
const PendingClaim = lazy(() => import('./pages/PendingClaim'))

const AuthViewerSignup = lazy(() => import('./pages/auth/ViewerSignup'))
const AuthCreatorSignup = lazy(() => import('./pages/auth/CreatorSignup'))
const AuthLoginPage = lazy(() => import('./pages/auth/LoginPage'))
const RoleDashboard = lazy(() => import('./components/auth/RoleDashboard'))

function PageLoading() {
  return (
    <div className="p-8 space-y-4">
      <Skeleton variant="text" className="w-64 h-8" />
      <Skeleton variant="text" className="w-full h-4" />
      <Skeleton variant="text" className="w-full h-4" />
      <div className="grid grid-cols-4 gap-4 mt-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} variant="poster" className="w-full" />
        ))}
      </div>
    </div>
  )
}

// Fire-and-forget connection counter: once per browser session, tell the
// server a user landed on the site. Survival-safe so it counts even if the
// tab closes mid-load.
function useConnectionTrack() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem('nf-visited')) return
      sessionStorage.setItem('nf-visited', '1')
      fetch(`${API_BASE}/stats/visit`, { method: 'POST', keepalive: true }).catch(() => {})
    } catch {}
  }, [])
}

export default function App() {
  useConnectionTrack()
  return (
    <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/" element={<Splash />} />
        <Route path="/splash" element={<Splash />} />
        <Route path="/creators" element={<Creators />} />
        <Route path="/download-app" element={<DownloadApp />} />
        <Route path="/login" element={<Login />} />
        <Route path="/oauth/callback" element={<OAuthCallback />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/profiles" element={<ProfileGateway />} />
         <Route path="/creator/signup" element={<AuthCreatorSignup />} />
          <Route path="/creator/forgot-password" element={<CreatorForgotPassword />} />
          <Route path="/creator/reset-password" element={<CreatorResetPassword />} />
          <Route path="/creator/claim/start" element={<ClaimStart />} />
          <Route path="/creator/claim/preview/:tmdbPersonId" element={<ClaimPreview />} />
          <Route path="/creator/claim/verify" element={<ClaimVerify />} />
          <Route path="/creator/claim/status/:claimId" element={<ClaimStatus />} />
           <Route path="/creator/claim/success" element={<ClaimSuccess />} />
          <Route path="/creator/pending-claim" element={<AuthGuard><PendingClaim /></AuthGuard>} />
           <Route path="/suspended" element={<SuspendedPage />} />
        <Route path="/auth/viewer-signup" element={<AuthViewerSignup />} />
        <Route path="/auth/creator-signup" element={<AuthCreatorSignup />} />
        <Route path="/auth/login" element={<AuthLoginPage />} />
        <Route path="/dashboard" element={<RoleDashboard />} />
        <Route element={<Layout />}>
          <Route path="/home" element={<Home />} />
          <Route path="/community" element={<AuthGuard><CommunityPage /></AuthGuard>} />
          <Route path="/community/:id" element={<AuthGuard><Community /></AuthGuard>} />
          <Route path="/community/room/:id" element={<AuthGuard><SecretRoom /></AuthGuard>} />
          <Route path="/downloads" element={<AuthGuard><Downloads /></AuthGuard>} />
          <Route path="/search" element={<Search />} />
          <Route path="/search/results" element={<SearchResults />} />
          <Route path="/movie/:id" element={<MovieDetail />} />
          <Route path="/tv/:id" element={<MovieDetail />} />
          <Route path="/watch" element={<AuthGuard><Watch /></AuthGuard>} />
          <Route path="/tv-shows" element={<TVShows />} />
          <Route path="/discover" element={<Discover />} />
          <Route path="/watchlist" element={<AuthGuard><Watchlist /></AuthGuard>} />
          <Route path="/profile" element={<AuthGuard><Profile /></AuthGuard>} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/payment/success" element={<AuthGuard><PaymentSuccess /></AuthGuard>} />
          <Route path="/gift/success" element={<AuthGuard><GatewaySuccess /></AuthGuard>} />
          <Route path="/tips/success" element={<AuthGuard><GatewaySuccess /></AuthGuard>} />
          <Route path="/notifications" element={<AuthGuard><Notifications /></AuthGuard>} />
          <Route path="/hooks" element={<AuthGuard><HooksFeed /></AuthGuard>} />
          <Route path="/news" element={<News />} />
          <Route path="/news/deep-dive/:id" element={<DeepDivePage />} />
          <Route path="/news/:id" element={<ArticleNews />} />
          <Route path="/category" element={<CategoryPage />} />
          <Route path="/category/:slug" element={<CategoryPage />} />
          <Route path="/creator" element={<CreatorGuard><CreatorDashboard /></CreatorGuard>} />
          <Route path="/creator/analytics" element={<CreatorGuard><CreatorAnalytics /></CreatorGuard>} />
          <Route path="/creator/profile" element={<CreatorGuard><CreatorProfileHub /></CreatorGuard>} />
          <Route path="/creator/catalog" element={<CreatorGuard><CreatorCatalog /></CreatorGuard>} />
          <Route path="/creator/campaigns" element={<CreatorGuard><CreatorCampaigns /></CreatorGuard>} />
          <Route path="/creator/choose-plan" element={<CreatorPlanPicker />} />
          <Route path="/upload" element={<AuthGuard><Upload /></AuthGuard>} />
          <Route path="/store" element={<Store />} />
          <Route path="/store/product/:id" element={<Store />} />
          <Route path="/learn" element={<Learn />} />
          <Route path="/learn/course/:id" element={<Learn />} />
          <Route path="/creator/products" element={<CreatorGuard><CreatorProducts /></CreatorGuard>} />
          <Route path="/creator/courses" element={<CreatorGuard><CreatorCourses /></CreatorGuard>} />
          <Route path="/referrals" element={<AuthGuard><Referrals /></AuthGuard>} />
          <Route path="/memberships" element={<AuthGuard><CreatorMembershipManager /></AuthGuard>} />
          <Route path="/memberships/:creatorId" element={<AuthGuard><CreatorMembershipManager /></AuthGuard>} />
          <Route path="/creator/memberships" element={<CreatorGuard><CreatorMembershipManager /></CreatorGuard>} />
          <Route path="/creator/events" element={<CreatorGuard><CreatorEventsManager /></CreatorGuard>} />
          <Route path="/creator/wallet" element={<CreatorGuard><CreatorWallet /></CreatorGuard>} />
          <Route path="/creator/onboarding" element={<CreatorGuard><CreatorOnboarding /></CreatorGuard>} />
          <Route path="/creator/ppm" element={<CreatorGuard><CreatorPPMSettings /></CreatorGuard>} />
          <Route path="/creator/go-live" element={<CreatorGuard><GoLive /></CreatorGuard>} />
          <Route path="/events" element={<LiveEvents />} />
          <Route path="/events/:id" element={<EventDetail />} />
          <Route path="/red-carpet" element={<RedCarpet />} />
          <Route path="/archive" element={<AuthGuard><Archive /></AuthGuard>} />
          <Route path="/archive/:id" element={<AuthGuard><ArchiveDetail /></AuthGuard>} />
          <Route path="/watch-party" element={<AuthGuard requirePremium><WatchParty /></AuthGuard>} />
          <Route path="/chat" element={<AuthGuard><Chat /></AuthGuard>} />
          <Route path="/forum" element={<AuthGuard><ForumPage /></AuthGuard>} />
          <Route path="/forum/:topicId" element={<AuthGuard><Forum /></AuthGuard>} />
          <Route path="/hot-takes" element={<AuthGuard><HotTakes /></AuthGuard>} />
          <Route path="/trivia" element={<AuthGuard><Trivia /></AuthGuard>} />
          <Route path="/profile/:id" element={<PublicProfile />} />
          <Route path="/admin/asset-qc" element={<AdminGuard><AdminAssetQC /></AdminGuard>} />
          <Route path="/admin/filters" element={<AdminGuard><AdminFilters /></AdminGuard>} />
          <Route path="/admin/campaigns" element={<AdminGuard><AdminCampaigns /></AdminGuard>} />
          <Route path="/admin/localization" element={<AdminGuard><AdminLocalization /></AdminGuard>} />
          <Route path="/admin/announcements" element={<AdminGuard><AdminAnnouncements /></AdminGuard>} />
        </Route>
        <Route path="/admin" element={<AdminGuard><AdminLayout /></AdminGuard>}>
          <Route index element={<AdminOverview />} />
          <Route path="content" element={<AdminContent />} />
          <Route path="shorts" element={<AdminShorts />} />
          <Route path="creative" element={<AdminContent />} />
          <Route path="analytics" element={<AdminAnalytics />} />
          <Route path="transactions" element={<AdminTransactions />} />
          <Route path="subscriptions" element={<AdminSubscriptions />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="creators" element={<AdminCreators />} />
          <Route path="community" element={<AdminCommunity />} />
          <Route path="moderation" element={<AdminModeration />} />
          <Route path="announcements" element={<AdminAnnouncements />} />
          <Route path="push-notifications" element={<AdminAnnouncements />} />
          <Route path="marketing" element={<AdminMarketing />} />
          <Route path="promotions" element={<AdminPromotions />} />
          <Route path="roles" element={<AdminRoles />} />
          <Route path="feed-settings" element={<AdminFeedSettings />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}
