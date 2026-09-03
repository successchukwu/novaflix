import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/auth_provider.dart';
import '../screens/splash_screen.dart';
import '../screens/landing_screen.dart';
import '../screens/login_screen.dart';
import '../screens/forgot_password_screen.dart';
import '../screens/register_screen.dart';
import '../screens/verify_email_screen.dart';
import '../screens/profile_gateway_screen.dart';
import '../screens/creator_login_screen.dart';
import '../screens/not_found_screen.dart';

import '../screens/home_screen.dart';
import '../screens/movie_list_screen.dart';
import '../screens/search_screen.dart';
import '../screens/search_results_screen.dart';
import '../screens/tv_shows_screen.dart';
import '../screens/discover_screen.dart';
import '../screens/category_screen.dart';
import '../screens/movie_detail_screen.dart';
import '../screens/watch_screen.dart';
import '../screens/watchlist_screen.dart';
import '../screens/profile_screen.dart';
import '../screens/settings_screen.dart';
import '../screens/pricing_screen.dart';
import '../screens/watch_party_screen.dart';
import '../screens/upload_screen.dart';
import '../screens/store_screen.dart';
import '../screens/hooks_feed_screen.dart';
import '../screens/learn_screen.dart';
import '../screens/creators_screen.dart';
import '../screens/creator_dashboard_screen.dart';
import '../screens/creator_analytics_screen.dart';
import '../screens/creator_catalog_screen.dart';
import '../screens/creator_products_screen.dart';
import '../screens/creator_courses_screen.dart';
import '../screens/creator_events_manager_screen.dart';
import '../screens/creator_membership_manager_screen.dart';
import '../screens/creator_plan_picker_screen.dart';
import '../screens/creator_campaigns_screen.dart';
import '../screens/creator_profile_hub_screen.dart';
import '../screens/admin_dashboard_screen.dart';
import '../screens/admin_asset_qc_screen.dart';
import '../screens/admin_filters_screen.dart';
import '../screens/admin_localization_screen.dart';
import '../screens/admin_campaigns_screen.dart';
import '../screens/creator_wallet_screen.dart';
import '../screens/creator_ppm_settings_screen.dart';
import '../screens/creator_onboarding_screen.dart';
import '../screens/creator_claim_start_screen.dart';
import '../screens/creator_claim_verify_screen.dart';
import '../screens/creator_claim_status_screen.dart';
import '../screens/offline_play_screen.dart';
import '../screens/community_screen.dart';
import '../screens/live_events_screen.dart';
import '../screens/event_detail_screen.dart';
import '../screens/downloads_screen.dart';
import '../screens/archive_screen.dart';
import '../screens/archive_detail_screen.dart';
import '../screens/red_carpet_screen.dart';
import '../screens/referrals_screen.dart';
import '../screens/payment_success_screen.dart';
import '../screens/news_screen.dart';
import '../screens/trivia_screen.dart';
import '../screens/notifications_screen.dart';
import '../screens/public_profile_screen.dart';
import '../screens/chat_screen.dart';
import '../screens/forum_screen.dart';
import '../widgets/layout/index.dart';

final _rootNavigatorKey = GlobalKey<NavigatorState>();
final _shellNavigatorKey = GlobalKey<NavigatorState>();

class AuthNotifier extends ChangeNotifier {
  AuthStatus status = AuthStatus.unknown;
  void update(AuthStatus s) {
    if (status != s) {
      status = s;
      notifyListeners();
    }
  }
}

final routerRefreshNotifier = AuthNotifier();

final _publicRoutes = <String>{
  '/',
  '/home',
  '/splash',
  '/landing',
  '/login',
  '/forgot-password',
  '/reset-password',
  '/register',
  '/verify-email',
  '/profiles',
  '/creator/login',
  '/oauth/callback',
  '/download-app',
  '/search',
  '/search-results',
  '/tv-shows',
  '/discover',
  '/category',
  '/category/:slug',
  '/movie/:id',
  '/tv/:id',
  '/settings',
  '/pricing',
  '/store',
  '/learn',
  '/creators',
  '/events',
  '/event/:id',
  '/red-carpet',
  '/news',
  '/news-article',
  '/creator/claim/start',
};

bool _isPublicRoute(String location) {
  if (_publicRoutes.contains(location)) return true;
  if (location.startsWith('/category/') ||
      location.startsWith('/movie/') ||
      location.startsWith('/tv/') ||
      location.startsWith('/event/') ||
      location.startsWith('/archive/') ||
      location.startsWith('/news-article'))
    return true;
  return false;
}

GoRouter? _router;
GoRouter appRouter(WidgetRef ref) {
  if (_router != null) return _router!;

  _router = GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: '/splash',
    refreshListenable: routerRefreshNotifier,
    redirect: (context, state) {
      final isAuth = routerRefreshNotifier.status == AuthStatus.authenticated;
      final location = state.matchedLocation;

      if (location == '/splash') return null;

      if (location.startsWith('/creator') && location != '/creator/login') {
        if (!isAuth) return '/login?redirect=${Uri.encodeComponent(location)}';
        return null;
      }

      if (location.startsWith('/admin')) {
        if (!isAuth) return '/login?redirect=${Uri.encodeComponent(location)}';
        return null;
      }

      if (_isPublicRoute(location)) return null;
      if (!isAuth) {
        return '/login?redirect=${Uri.encodeComponent(location)}';
      }

      return null;
    },
    routes: [
      GoRoute(path: '/splash', builder: (_, __) => const SplashScreen()),
      GoRoute(path: '/landing', builder: (_, __) => const LandingScreen()),
      GoRoute(
        path: '/login',
        builder: (_, state) => LoginScreen(
          redirect: state.uri.queryParameters['redirect'],
        ),
      ),
      GoRoute(
        path: '/forgot-password',
        builder: (_, __) => const ForgotPasswordScreen(),
      ),
      GoRoute(
        path: '/register',
        builder: (_, state) => RegisterScreen(
          refCode: state.uri.queryParameters['ref'],
        ),
      ),
      GoRoute(
        path: '/verify-email',
        builder: (_, __) => const VerifyEmailScreen(),
      ),
      GoRoute(
        path: '/profiles',
        builder: (_, __) => const ProfileGatewayScreen(),
      ),
      GoRoute(
        path: '/creator/login',
        builder: (_, __) => const CreatorLoginScreen(),
      ),
      GoRoute(path: '/reset-password', builder: (_, s) => const ForgotPasswordScreen()),
      GoRoute(path: '/oauth/callback', builder: (_, s) => const CreatorLoginScreen()),
      GoRoute(path: '/download-app', builder: (_, s) => const StoreScreen()),
      GoRoute(path: '/suspended', builder: (_, s) => const NotFoundScreen()),
      GoRoute(path: '/creator/claim/start', builder: (_, s) => const ClaimStartScreen()),
      GoRoute(
        path: '/creator/claim/verify',
        builder: (_, s) => ClaimVerifyScreen(claimId: s.uri.queryParameters['claimId'] ?? ''),
      ),
      GoRoute(
        path: '/creator/claim/status/:claimId',
        builder: (_, s) => ClaimStatusScreen(claimId: s.pathParameters['claimId'] ?? ''),
      ),
      GoRoute(path: '/creator/wallet', builder: (_, s) => const CreatorWalletScreen()),
      GoRoute(path: '/creator/ppm', builder: (_, s) => const CreatorPPMSettingsScreen()),
      GoRoute(path: '/creator/onboarding', builder: (_, s) => const CreatorOnboardingScreen()),
      GoRoute(path: '/offline-play', builder: (ctx, s) => OfflinePlayScreen(key: s.pageKey)),
      GoRoute(
        path: '/watch',
        builder: (ctx, state) => WatchScreen(
          movieId: int.tryParse(state.uri.queryParameters['id'] ?? ''),
          mediaType: state.uri.queryParameters['type'],
          season: state.uri.queryParameters['season'],
          episode: state.uri.queryParameters['episode'],
          resume: state.uri.queryParameters['resume'],
        ),
      ),

      ShellRoute(
        navigatorKey: _shellNavigatorKey,
        builder: (context, state, child) => AppShell(child: child),
        routes: [
          GoRoute(
            path: '/',
            pageBuilder: (_, s) =>
                NoTransitionPage(child: HomeScreen(key: s.pageKey)),
          ),
          GoRoute(
            path: '/home',
            pageBuilder: (_, s) =>
                NoTransitionPage(child: HomeScreen(key: s.pageKey)),
          ),
          GoRoute(
            path: '/search',
            pageBuilder: (_, s) =>
                NoTransitionPage(child: const SearchScreen()),
          ),
          GoRoute(
            path: '/search-results',
            pageBuilder: (_, s) => NoTransitionPage(
              child: SearchResultsScreen(query: s.uri.queryParameters['q']),
            ),
          ),
          GoRoute(
            path: '/tv-shows',
            pageBuilder: (_, s) =>
                NoTransitionPage(child: const TVShowsScreen()),
          ),
          GoRoute(
            path: '/discover',
            pageBuilder: (_, s) => NoTransitionPage(
              child: DiscoverScreen(initialSort: s.uri.queryParameters['sort']),
            ),
          ),
          GoRoute(
            path: '/category',
            pageBuilder: (_, s) =>
                NoTransitionPage(child: const CategoryScreen()),
          ),
          GoRoute(
            path: '/category/:slug',
            pageBuilder: (_, s) => NoTransitionPage(
              child: CategoryScreen(slug: s.pathParameters['slug']),
            ),
          ),
          GoRoute(
            path: '/movie/:id',
            pageBuilder: (_, s) => NoTransitionPage(
              child: MovieDetailScreen(
                movieId: int.parse(s.pathParameters['id']!),
              ),
            ),
          ),
          GoRoute(
            path: '/tv/:id',
            pageBuilder: (_, s) => NoTransitionPage(
              child: MovieDetailScreen(
                movieId: int.parse(s.pathParameters['id']!),
              ),
            ),
          ),
          GoRoute(
            path: '/list/:kind',
            pageBuilder: (_, s) => NoTransitionPage(
              child: MovieListScreen(kind: s.pathParameters['kind']!),
            ),
          ),
          GoRoute(
            path: '/watchlist',
            pageBuilder: (_, s) =>
                NoTransitionPage(child: const WatchlistScreen()),
          ),
          GoRoute(
            path: '/profile',
            pageBuilder: (_, s) =>
                NoTransitionPage(child: const ProfileScreen()),
          ),
          GoRoute(
            path: '/settings',
            pageBuilder: (_, s) =>
                NoTransitionPage(child: const SettingsScreen()),
          ),
          GoRoute(
            path: '/pricing',
            pageBuilder: (_, s) =>
                NoTransitionPage(child: const PricingScreen()),
          ),
          GoRoute(
            path: '/upload',
            pageBuilder: (_, s) =>
                NoTransitionPage(child: const UploadScreen()),
          ),
          GoRoute(
            path: '/store',
            pageBuilder: (_, s) => NoTransitionPage(child: const StoreScreen()),
          ),
          GoRoute(
            path: '/learn',
            pageBuilder: (_, s) => NoTransitionPage(child: const LearnScreen()),
          ),
          GoRoute(
            path: '/hooks',
            pageBuilder: (_, s) =>
                NoTransitionPage(child: const HooksFeedScreen()),
          ),
          GoRoute(
            path: '/watch-party',
            pageBuilder: (_, s) =>
                NoTransitionPage(child: const WatchPartyScreen()),
          ),
          GoRoute(
            path: '/creators',
            pageBuilder: (_, s) =>
                NoTransitionPage(child: const CreatorsScreen()),
          ),
          GoRoute(
            path: '/community',
            pageBuilder: (_, s) =>
                NoTransitionPage(child: const CommunityScreen()),
          ),
          GoRoute(
            path: '/community/:id',
            pageBuilder: (_, s) => NoTransitionPage(
              child: CommunityScreen(
                communityId: int.tryParse(s.pathParameters['id'] ?? ''),
              ),
            ),
          ),
          GoRoute(
            path: '/events',
            pageBuilder: (_, s) =>
                NoTransitionPage(child: const LiveEventsScreen()),
          ),
          GoRoute(
            path: '/event/:id',
            pageBuilder: (_, s) => NoTransitionPage(
              child: EventDetailScreen(eventId: s.pathParameters['id']),
            ),
          ),
          GoRoute(
            path: '/downloads',
            pageBuilder: (_, s) =>
                NoTransitionPage(child: const DownloadsScreen()),
          ),
          GoRoute(
            path: '/archive',
            pageBuilder: (_, s) =>
                NoTransitionPage(child: const ArchiveScreen()),
          ),
          GoRoute(
            path: '/archive/:genre',
            pageBuilder: (_, s) => NoTransitionPage(
              child: ArchiveDetailScreen(genre: s.pathParameters['genre']),
            ),
          ),
          GoRoute(
            path: '/red-carpet',
            pageBuilder: (_, s) =>
                NoTransitionPage(child: const RedCarpetScreen()),
          ),
          GoRoute(
            path: '/referrals',
            pageBuilder: (_, s) =>
                NoTransitionPage(child: const ReferralsScreen()),
          ),
          GoRoute(
            path: '/payment-success',
            pageBuilder: (_, s) =>
                NoTransitionPage(child: const PaymentSuccessScreen()),
          ),
          GoRoute(
            path: '/news',
            pageBuilder: (_, s) => NoTransitionPage(child: const NewsScreen()),
          ),
          GoRoute(
            path: '/news-article',
            pageBuilder: (_, s) => NoTransitionPage(
              child: NewsScreen(articleUrl: s.uri.queryParameters['url']),
            ),
          ),
          GoRoute(
            path: '/trivia',
            pageBuilder: (_, s) =>
                NoTransitionPage(child: const TriviaScreen()),
          ),
          GoRoute(
            path: '/notifications',
            pageBuilder: (_, s) =>
                NoTransitionPage(child: const NotificationsScreen()),
          ),
          GoRoute(
            path: '/chat',
            pageBuilder: (_, s) => NoTransitionPage(
              child: ChatScreen(otherUserId: s.uri.queryParameters['with']),
            ),
          ),
          GoRoute(
            path: '/forum',
            pageBuilder: (_, s) => NoTransitionPage(child: const ForumScreen()),
          ),
          GoRoute(
            path: '/forum/:topicId',
            pageBuilder: (_, s) => NoTransitionPage(
              child: ForumScreen(
                topicId: int.tryParse(s.pathParameters['topicId'] ?? ''),
              ),
            ),
          ),
          GoRoute(
            path: '/user/:id',
            pageBuilder: (_, s) => NoTransitionPage(
              child: PublicProfileScreen(userId: s.pathParameters['id'] ?? ''),
            ),
          ),

          GoRoute(
            path: '/creator',
            pageBuilder: (_, s) =>
                NoTransitionPage(child: const CreatorDashboardScreen()),
          ),
          GoRoute(
            path: '/creator/analytics',
            pageBuilder: (_, s) =>
                NoTransitionPage(child: const CreatorAnalyticsScreen()),
          ),
          GoRoute(
            path: '/creator/catalog',
            pageBuilder: (_, s) =>
                NoTransitionPage(child: const CreatorCatalogScreen()),
          ),
          GoRoute(
            path: '/creator/products',
            pageBuilder: (_, s) =>
                NoTransitionPage(child: const CreatorProductsScreen()),
          ),
          GoRoute(
            path: '/creator/courses',
            pageBuilder: (_, s) =>
                NoTransitionPage(child: const CreatorCoursesScreen()),
          ),
          GoRoute(
            path: '/creator/events',
            pageBuilder: (_, s) =>
                NoTransitionPage(child: const CreatorEventsManagerScreen()),
          ),
          GoRoute(
            path: '/creator/memberships',
            pageBuilder: (_, s) =>
                NoTransitionPage(child: const CreatorMembershipManagerScreen()),
          ),
          GoRoute(
            path: '/creator/plan-picker',
            pageBuilder: (_, s) =>
                NoTransitionPage(child: const CreatorPlanPickerScreen()),
          ),
          GoRoute(
            path: '/creator/campaigns',
            pageBuilder: (_, s) =>
                NoTransitionPage(child: const CreatorCampaignsScreen()),
          ),
          GoRoute(
            path: '/creator/profile',
            pageBuilder: (_, s) =>
                NoTransitionPage(child: const CreatorProfileHubScreen()),
          ),

          GoRoute(
            path: '/admin',
            pageBuilder: (_, s) =>
                NoTransitionPage(child: const AdminDashboardScreen()),
          ),
          GoRoute(
            path: '/admin/asset-qc',
            pageBuilder: (_, s) =>
                NoTransitionPage(child: const AdminAssetQCScreen()),
          ),
          GoRoute(
            path: '/admin/filters',
            pageBuilder: (_, s) =>
                NoTransitionPage(child: const AdminFiltersScreen()),
          ),
          GoRoute(
            path: '/admin/localization',
            pageBuilder: (_, s) =>
                NoTransitionPage(child: const AdminLocalizationScreen()),
          ),
          GoRoute(
            path: '/admin/campaigns',
            pageBuilder: (_, s) =>
                NoTransitionPage(child: const AdminCampaignsScreen()),
          ),
        ],
      ),
      GoRoute(path: '/:path(.*)', builder: (_, __) => const NotFoundScreen()),
    ],
  );
  return _router!;
}
