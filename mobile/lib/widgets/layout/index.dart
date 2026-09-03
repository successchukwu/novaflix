import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/responsive.dart';
import '../../providers/auth_provider.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_typography.dart';

class AppShell extends ConsumerWidget {
  final Widget child;

  const AppShell({super.key, required this.child});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    final user = auth.user;
    final isAuthenticated = auth.status == AuthStatus.authenticated;
    final isCreator = user?.role == 'creator' || user?.role == 'admin';
    final isAdmin = user?.role == 'admin';

    return LayoutBuilder(
      builder: (context, constraints) {
        final size = screenSizeFor(constraints.maxWidth);
        if (size == ScreenSize.desktop) {
          return _DesktopLayout(
            child: child,
            isAuthenticated: isAuthenticated,
            isCreator: isCreator,
            avatar: user?.avatar,
          );
        }
        return _MobileLayout(
          child: child,
          isAuthenticated: isAuthenticated,
          isCreator: isCreator,
          isAdmin: isAdmin,
          avatar: user?.avatar,
          userName: user?.username,
          userEmail: user?.email,
        );
      },
    );
  }
}

// ===================== BOTTOM NAV ITEMS (mirrors BottomNav.tsx) =====================

class _ShellItem {
  final String label;
  final IconData icon;
  final IconData activeIcon;
  final String route;
  final bool Function(String) matches;

  const _ShellItem(
    this.label,
    this.icon,
    this.activeIcon,
    this.route,
    this.matches,
  );
}

List<_ShellItem> _guestBottomItems() {
  return [
    _ShellItem('Home', Icons.home_outlined, Icons.home, '/home',
        (p) => p == '/' || p.startsWith('/home')),
    _ShellItem('Search', Icons.search, Icons.search, '/search',
        (p) => p.startsWith('/search')),
    _ShellItem('Discover', Icons.explore_outlined, Icons.explore, '/discover',
        (p) => p.startsWith('/discover')),
    _ShellItem('Categories', Icons.category_outlined, Icons.category, '/category',
        (p) => p.startsWith('/category')),
    _ShellItem('Sign In', Icons.login, Icons.login, '/login',
        (p) => p.startsWith('/login') || p.startsWith('/register')),
  ];
}

List<_ShellItem> _userBottomItems() {
  return [
    _ShellItem('Home', Icons.home_outlined, Icons.home, '/home',
        (p) => p == '/' || p.startsWith('/home')),
    _ShellItem('Search', Icons.search, Icons.search, '/search',
        (p) => p.startsWith('/search')),
    _ShellItem('Discover', Icons.explore_outlined, Icons.explore, '/discover',
        (p) => p.startsWith('/discover')),
    _ShellItem('Categories', Icons.category_outlined, Icons.category, '/category',
        (p) => p.startsWith('/category')),
    _ShellItem('Profile', Icons.person_outline, Icons.person, '/profile',
        (p) => p.startsWith('/profile')),
  ];
}

List<_ShellItem> _creatorBottomItems() {
  return [
    _ShellItem('Home', Icons.home_outlined, Icons.home, '/home',
        (p) => p == '/' || p.startsWith('/home')),
    _ShellItem('Dashboard', Icons.bar_chart_outlined, Icons.bar_chart, '/creator',
        (p) => p.startsWith('/creator') || p.startsWith('/upload')),
    _ShellItem('Search', Icons.search, Icons.search, '/search',
        (p) => p.startsWith('/search')),
    _ShellItem('Discover', Icons.explore_outlined, Icons.explore, '/discover',
        (p) => p.startsWith('/discover')),
    _ShellItem('Profile', Icons.person_outline, Icons.person, '/profile',
        (p) => p.startsWith('/profile')),
  ];
}

List<_ShellItem> _bottomItems(bool isAuthenticated, bool isCreator) {
  if (isCreator) return _creatorBottomItems();
  if (isAuthenticated) return _userBottomItems();
  return _guestBottomItems();
}

// ===================== DRAWER NAV ITEMS (mirrors MobileDrawer.tsx) =====================

class _DrawerNavItem {
  final String label;
  final String icon;
  final String route;
  final bool authenticated;
  final bool creatorOnly;
  final bool adminOnly;

  const _DrawerNavItem({
    required this.label,
    required this.icon,
    required this.route,
    this.authenticated = false,
    this.creatorOnly = false,
    this.adminOnly = false,
  });
}

const _drawerMainItems = [
  _DrawerNavItem(label: 'Home', icon: 'home', route: '/home'),
  _DrawerNavItem(label: 'Search', icon: 'search', route: '/search?type=movie'),
  _DrawerNavItem(label: 'TV Shows', icon: 'live_tv', route: '/tv-shows'),
  _DrawerNavItem(label: 'Discover', icon: 'explore', route: '/discover'),
  _DrawerNavItem(label: 'Live Events', icon: 'event', route: '/events'),
  _DrawerNavItem(label: 'Red Carpet', icon: 'star', route: '/red-carpet'),
];

const _drawerAuthItems = [
  _DrawerNavItem(label: 'Shorts', icon: 'video_library', route: '/hooks', authenticated: true),
  _DrawerNavItem(label: 'Watchlist', icon: 'bookmark', route: '/watchlist', authenticated: true),
  _DrawerNavItem(label: 'Refer & Earn', icon: 'share', route: '/referrals', authenticated: true),
  _DrawerNavItem(label: 'My Downloads', icon: 'download', route: '/downloads', authenticated: true),
  _DrawerNavItem(label: 'Archive Vault', icon: 'archive', route: '/archive', authenticated: true),
];

const _drawerEngagementItems = [
  _DrawerNavItem(label: 'Community', icon: 'diversity_3', route: '/community', authenticated: true),
  _DrawerNavItem(label: 'Hot Takes', icon: 'local_fire_department', route: '/forum', authenticated: true),
  _DrawerNavItem(label: 'Trivia & Rewards', icon: 'quiz', route: '/trivia', authenticated: true),
];

const _drawerCreatorItems = [
  _DrawerNavItem(label: 'Dashboard', icon: 'bar_chart', route: '/creator', authenticated: true, creatorOnly: true),
  _DrawerNavItem(label: 'Upload Film', icon: 'cloud_upload', route: '/upload', authenticated: true, creatorOnly: true),
  _DrawerNavItem(label: 'Memberships', icon: 'card_membership', route: '/creator/memberships', authenticated: true, creatorOnly: true),
  _DrawerNavItem(label: 'Live Events', icon: 'live_tv', route: '/creator/events', authenticated: true, creatorOnly: true),
  _DrawerNavItem(label: 'Products', icon: 'inventory_2', route: '/creator/products', authenticated: true, creatorOnly: true),
  _DrawerNavItem(label: 'Courses', icon: 'school', route: '/creator/courses', authenticated: true, creatorOnly: true),
];

const _drawerExtraItems = [
  _DrawerNavItem(label: 'Plans', icon: 'workspace_premium', route: '/pricing'),
  _DrawerNavItem(label: 'Merch Store', icon: 'shopping_bag', route: '/store'),
  _DrawerNavItem(label: 'E-Learning', icon: 'school', route: '/learn'),
  _DrawerNavItem(label: 'Watch Party', icon: 'diversity_3', route: '/watch-party', authenticated: true),
];

// ===================== SIDEBAR DATA (mirrors Sidebar.tsx) =====================

class _SidebarItem {
  final String label;
  final IconData icon;
  final String route;
  final bool authenticated;
  final bool creatorOnly;
  final bool primary;

  const _SidebarItem({
    required this.label,
    required this.icon,
    required this.route,
    this.authenticated = false,
    this.creatorOnly = false,
    this.primary = false,
  });
}

const _mainNav = [
  _SidebarItem(label: 'TV Shows', icon: Icons.live_tv, route: '/tv-shows'),
  _SidebarItem(label: 'Trending', icon: Icons.trending_up, route: '/discover?sort=trending'),
  _SidebarItem(label: 'Top Rated', icon: Icons.star_outline, route: '/discover?sort=top_rated'),
  _SidebarItem(label: 'Discover', icon: Icons.explore_outlined, route: '/discover'),
  _SidebarItem(label: 'Watchlist', icon: Icons.bookmark_border, route: '/watchlist', authenticated: true),
  _SidebarItem(label: 'My Downloads', icon: Icons.download_outlined, route: '/downloads', authenticated: true),
  _SidebarItem(label: 'Refer & Earn', icon: Icons.share_outlined, route: '/referrals', authenticated: true),
  _SidebarItem(label: 'Archive Vault', icon: Icons.archive_outlined, route: '/archive', authenticated: true),
  _SidebarItem(label: 'Live Events', icon: Icons.event_outlined, route: '/events'),
  _SidebarItem(label: 'Red Carpet', icon: Icons.star_outline, route: '/red-carpet'),
  _SidebarItem(label: 'Shorts', icon: Icons.video_library_outlined, route: '/hooks', authenticated: true),
  _SidebarItem(label: 'News & Insights', icon: Icons.newspaper_outlined, route: '/news'),
];

const _engagementNav = [
  _SidebarItem(label: 'Community', icon: Icons.groups_outlined, route: '/community', authenticated: true),
  _SidebarItem(label: 'Hot Takes', icon: Icons.forum_outlined, route: '/forum', authenticated: true),
  _SidebarItem(label: 'Trivia & Rewards', icon: Icons.quiz_outlined, route: '/trivia', authenticated: true),
];

const _businessNav = [
  _SidebarItem(label: 'Plans', icon: Icons.workspace_premium, route: '/pricing', primary: true),
  _SidebarItem(label: 'Creator Hub', icon: Icons.bar_chart, route: '/creator', authenticated: true, creatorOnly: true, primary: true),
  _SidebarItem(label: 'Upload Film', icon: Icons.cloud_upload_outlined, route: '/upload', authenticated: true, creatorOnly: true, primary: true),
  _SidebarItem(label: 'Promotions', icon: Icons.campaign_outlined, route: '/creator/campaigns', authenticated: true, creatorOnly: true, primary: true),
  _SidebarItem(label: 'Memberships', icon: Icons.card_membership, route: '/creator/memberships', authenticated: true, creatorOnly: true, primary: true),
  _SidebarItem(label: 'Live Events', icon: Icons.live_tv, route: '/creator/events', authenticated: true, creatorOnly: true, primary: true),
  _SidebarItem(label: 'Products', icon: Icons.inventory_2_outlined, route: '/creator/products', authenticated: true, creatorOnly: true, primary: true),
  _SidebarItem(label: 'Courses', icon: Icons.school_outlined, route: '/creator/courses', authenticated: true, creatorOnly: true, primary: true),
  _SidebarItem(label: 'Merch Store', icon: Icons.shopping_bag_outlined, route: '/store', primary: true),
  _SidebarItem(label: 'E-Learning', icon: Icons.school_outlined, route: '/learn', primary: true),
  _SidebarItem(label: 'Watch Party', icon: Icons.groups_outlined, route: '/watch-party', authenticated: true, primary: true),
];

// ===================== TOP BAR (mirrors TopNav.tsx) =====================

class _TopBar extends StatelessWidget {
  final bool isAuthenticated;
  final String? avatar;
  final VoidCallback? onMenuPressed;

  const _TopBar({required this.isAuthenticated, this.avatar, this.onMenuPressed});

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.of(context).size.width;
    final isDesktopScreen = screenSizeFor(width) == ScreenSize.desktop;

    return Container(
      height: 96,
      padding: const EdgeInsets.symmetric(horizontal: 16),
      decoration: const BoxDecoration(
        color: Color(0x99131313),
        border: Border(bottom: BorderSide(color: Color(0x0DFFFFFF))),
      ),
      child: Row(
        children: [
          if (!isDesktopScreen)
            Builder(
              builder: (ctx) {
                final loc = GoRouterState.of(ctx).matchedLocation ?? '';
                final isTopLevel = loc == '/home' || loc == '/' || loc == '/search' || loc == '/discover' || loc == '/profile' || loc == '/login' || loc == '/register';
                final showBack = !isTopLevel && (loc.startsWith('/movie/') || loc.startsWith('/tv/') || loc.startsWith('/category/') || loc.startsWith('/search-results') || loc.startsWith('/list/') || loc.startsWith('/event/') || loc.startsWith('/store') || loc.startsWith('/learn') || loc.startsWith('/news') || loc.startsWith('/community') || loc.startsWith('/forum') || loc.startsWith('/trivia') || loc.startsWith('/downloads') || loc.startsWith('/watchlist') || loc.startsWith('/notifications') || loc.startsWith('/settings') || loc.startsWith('/pricing') || ctx.canPop());
                if (showBack) {
                  return IconButton(icon: const Icon(Icons.arrow_back), onPressed: () { if (ctx.canPop()) ctx.pop(); else ctx.go('/home'); });
                }
                return IconButton(icon: const Icon(Icons.menu), onPressed: onMenuPressed ?? () => Scaffold.of(ctx).openDrawer());
              },
            ),
          GestureDetector(
            onTap: () => context.go('/home'),
            child: SizedBox(
              width: 300,
              height: 96,
              child: Image.asset(
                'assets/brand/leter-mark-logo.png',
                fit: BoxFit.contain,
                alignment: Alignment.centerLeft,
              ),
            ),
          ),
          const Spacer(),
          IconButton(
            icon: const Icon(Icons.search),
            onPressed: () => context.go('/search'),
          ),
          if (isAuthenticated)
            IconButton(
              icon: const Icon(Icons.notifications_none),
              onPressed: () => context.go('/notifications'),
            ),
          GestureDetector(
            onTap: () => context.go(isAuthenticated ? '/profile' : '/login'),
            child: Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: AppColors.surfaceContainerHigh,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppColors.outlineVariant),
              ),
              clipBehavior: Clip.antiAlias,
              child: avatar != null
                  ? Image.network(avatar!, fit: BoxFit.cover)
                  : const Icon(
                      Icons.person,
                      size: 20,
                      color: AppColors.onSurfaceVariant,
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

// ===================== MOBILE LAYOUT (mirrors Layout.tsx < lg) =====================

class _MobileLayout extends StatelessWidget {
  final Widget child;
  final bool isAuthenticated;
  final bool isCreator;
  final bool isAdmin;
  final String? avatar;
  final String? userName;
  final String? userEmail;

  const _MobileLayout({
    required this.child,
    required this.isAuthenticated,
    required this.isCreator,
    this.isAdmin = false,
    this.avatar,
    this.userName,
    this.userEmail,
  });

  @override
  Widget build(BuildContext context) {
    final items = _bottomItems(isAuthenticated, isCreator);
    final location = GoRouterState.of(context).matchedLocation ?? '';
    var activeIndex = items.indexWhere((i) => i.matches(location));
    if (activeIndex < 0) activeIndex = 0;

    final scaffoldKey = GlobalKey<ScaffoldState>();

    return Scaffold(
      key: scaffoldKey,
      backgroundColor: AppColors.background,
      drawer: _MobileDrawer(
        isAuthenticated: isAuthenticated,
        isCreator: isCreator,
        isAdmin: isAdmin,
        avatar: avatar,
        userName: userName,
        userEmail: userEmail,
      ),
      body: Column(
        children: [
          _TopBar(
            isAuthenticated: isAuthenticated,
            avatar: avatar,
            onMenuPressed: () => scaffoldKey.currentState?.openDrawer(),
          ),
          Expanded(child: child),
        ],
      ),
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          color: Color(0xE60E0E0E),
          border: Border(top: BorderSide(color: Color(0x0DFFFFFF))),
        ),
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).padding.bottom),
        child: Row(
          children: [
            for (var i = 0; i < items.length; i++)
              Expanded(
                child: InkWell(
                  onTap: () => context.go(items[i].route),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 2),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          activeIndex == i ? items[i].activeIcon : items[i].icon,
                          size: 22,
                          color: activeIndex == i
                              ? AppColors.primaryPink
                              : AppColors.onSurfaceVariant.withValues(alpha: 0.6),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          items[i].label,
                          style: TextStyle(
                            fontSize: 10,
                            height: 1.1,
                            color: activeIndex == i
                                ? AppColors.primaryPink
                                : AppColors.onSurfaceVariant.withValues(alpha: 0.6),
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

// ===================== MOBILE DRAWER (mirrors MobileDrawer.tsx) =====================

class _MobileDrawer extends StatelessWidget {
  final bool isAuthenticated;
  final bool isCreator;
  final bool isAdmin;
  final String? avatar;
  final String? userName;
  final String? userEmail;

  const _MobileDrawer({
    required this.isAuthenticated,
    required this.isCreator,
    this.isAdmin = false,
    this.avatar,
    this.userName,
    this.userEmail,
  });

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.of(context).size.width;
    final drawerWidth = min(width * 0.85, 300.0).clamp(260.0, 300.0);
    final location = GoRouterState.of(context).matchedLocation ?? '';

    bool isActive(String route) {
      final path = route.split('?').first;
      return location == path || location.startsWith('$path/');
    }

    void handleNav(String route) {
      Navigator.of(context).pop();
      context.go(route);
    }

    Widget navButton(_DrawerNavItem item) {
      final active = isActive(item.route);
      return InkWell(
        onTap: () => handleNav(item.route),
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: active ? Colors.white.withValues(alpha: 0.05) : null,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            children: [
              Icon(
                _drawerIcon(item.icon),
                size: 20,
                color: active
                    ? AppColors.primaryPink
                    : AppColors.onSurfaceVariant.withValues(alpha: 0.6),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  item.label,
                  style: AppTypography.labelMd.copyWith(
                    color: active
                        ? AppColors.primaryPink
                        : AppColors.onSurfaceVariant.withValues(alpha: 0.6),
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ),
      );
    }

    Widget divider = const Padding(
      padding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Divider(height: 1, thickness: 0.5, color: Color(0x0DFFFFFF)),
    );

    Widget sectionHeader(String title) {
      return Padding(
        padding: const EdgeInsets.fromLTRB(12, 16, 12, 4),
        child: Text(
          title.toUpperCase(),
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w600,
          letterSpacing: 1.2,
          color: AppColors.onSurfaceVariant.withValues(alpha: 0.5),
        ),
        ),
      );
    }

    List<_DrawerNavItem> visibleItems(List<_DrawerNavItem> items) => items
        .where((i) => (!i.authenticated || isAuthenticated) && (!i.creatorOnly || isCreator) && (!i.adminOnly || isAdmin))
        .toList();

    return Drawer(
      width: drawerWidth,
      backgroundColor: const Color(0xFF0E0E0E),
      child: SafeArea(
        child: Column(
          children: [
            Container(
              height: 56,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              decoration: const BoxDecoration(
                border: Border(bottom: BorderSide(color: Color(0x0DFFFFFF))),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: GestureDetector(
                      onTap: () => handleNav('/home'),
                      child: SizedBox(
                        height: 96,
                        child: Image.asset(
                          'assets/brand/leter-mark-logo.png',
                          fit: BoxFit.contain,
                        ),
                      ),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close, size: 22),
                    color: AppColors.onSurfaceVariant,
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
            ),
            if (isAuthenticated)
              InkWell(
                onTap: () => handleNav('/profile'),
                borderRadius: BorderRadius.circular(12),
                child: Container(
                  margin: const EdgeInsets.fromLTRB(12, 12, 12, 0),
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: AppColors.surfaceContainerHigh,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.05)),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            colors: [
                              AppColors.primaryContainer,
                              AppColors.secondary,
                            ],
                          ),
                          shape: BoxShape.circle,
                        ),
                        clipBehavior: Clip.antiAlias,
                        child: avatar != null
                            ? Image.network(avatar!, fit: BoxFit.cover)
                            : const Icon(Icons.person, size: 18, color: Colors.white),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              userName ?? 'Member',
                              style: AppTypography.labelMd.copyWith(color: AppColors.onSurface),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            if (userEmail != null)
                              Text(
                                userEmail!,
                                style: TextStyle(
                                  fontSize: 11,
                                  color: AppColors.onSurfaceVariant.withValues(alpha: 0.6),
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                          ],
                        ),
                      ),
                      Icon(Icons.chevron_right, size: 18, color: AppColors.onSurfaceVariant.withValues(alpha: 0.4)),
                    ],
                  ),
                ),
              ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 16),
                children: [
                  ..._drawerMainItems.map(navButton),
                  divider,
                  if (!isAuthenticated)
                    InkWell(
                      onTap: () => handleNav('/login'),
                      borderRadius: BorderRadius.circular(12),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                        decoration: BoxDecoration(borderRadius: BorderRadius.circular(12)),
                        child: Row(
                          children: [
                            Icon(Icons.login, size: 20, color: AppColors.onSurfaceVariant.withValues(alpha: 0.6)),
                            const SizedBox(width: 12),
                            Text(
                              'Sign In',
                              style: AppTypography.labelMd.copyWith(
                                color: AppColors.onSurfaceVariant.withValues(alpha: 0.6),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ...visibleItems(_drawerAuthItems).map(navButton),
                  if (isAuthenticated) ...[
                    sectionHeader('Community & Engagement'),
                    ...visibleItems(_drawerEngagementItems).map(navButton),
                  ],
                  if (isCreator || isAdmin) ...[
                    divider,
                    ...visibleItems(_drawerCreatorItems).map(navButton),
                  ],
                  divider,
                  ...visibleItems(_drawerExtraItems).map(navButton),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

IconData _drawerIcon(String name) {
  const map = {
    'home': Icons.home_outlined,
    'search': Icons.search,
    'live_tv': Icons.live_tv,
    'explore': Icons.explore_outlined,
    'event': Icons.event_outlined,
    'star': Icons.star_outline,
    'video_library': Icons.video_library_outlined,
    'bookmark': Icons.bookmark_border,
    'share': Icons.share_outlined,
    'download': Icons.download_outlined,
    'archive': Icons.archive_outlined,
    'diversity_3': Icons.groups_outlined,
    'local_fire_department': Icons.local_fire_department,
    'quiz': Icons.quiz_outlined,
    'bar_chart': Icons.bar_chart,
    'cloud_upload': Icons.cloud_upload_outlined,
    'card_membership': Icons.card_membership,
    'inventory_2': Icons.inventory_2_outlined,
    'school': Icons.school_outlined,
    'workspace_premium': Icons.workspace_premium,
    'shopping_bag': Icons.shopping_bag_outlined,
    'login': Icons.login,
  };
  return map[name] ?? Icons.circle;
}

// ===================== DESKTOP SIDEBAR (mirrors Sidebar.tsx) =====================

class _DesktopSidebar extends StatelessWidget {
  final bool isAuthenticated;
  final bool isCreator;

  const _DesktopSidebar({required this.isAuthenticated, required this.isCreator});

  List<_SidebarItem> _visible(List<_SidebarItem> items) => items
      .where((i) => (!i.authenticated || isAuthenticated) && (!i.creatorOnly || isCreator))
      .toList();

  @override
  Widget build(BuildContext context) {
    final visibleNav = _visible(_mainNav);
    final visibleEngagement = _visible(_engagementNav);
    final visibleBusiness = _visible(_businessNav);
    final location = GoRouterState.of(context).matchedLocation ?? '';

    bool isActive(String route) {
      if (route.contains('?')) {
        return location.startsWith(route.split('?').first);
      }
      return location == route || location.startsWith('$route/');
    }

    Widget itemTile(_SidebarItem item) {
      final active = isActive(item.route);
      return InkWell(
        onTap: () => context.go(item.route),
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 1),
          decoration: BoxDecoration(
            color: active
                ? (item.primary
                    ? Colors.white.withValues(alpha: 0.05)
                    : AppColors.primaryContainer.withValues(alpha: 0.2))
                : null,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: Row(
              children: [
                Icon(
                  item.icon,
                  size: 20,
                  color: active
                      ? AppColors.primaryPink
                      : (item.primary
                          ? AppColors.primaryLight
                          : AppColors.onSurfaceVariant.withValues(alpha: 0.6)),
                ),
                const SizedBox(width: 12),
                Text(
                  item.label,
                  style: AppTypography.labelMd.copyWith(
                    color: active
                        ? AppColors.primaryPink
                        : AppColors.onSurfaceVariant.withValues(alpha: 0.6),
                    fontWeight: item.primary ? FontWeight.w600 : FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }

    const divider = Divider(height: 24, thickness: 0.5, color: Color(0x0DFFFFFF));

    return Container(
      width: 240,
      color: const Color(0xFF0E0E0E),
      padding: const EdgeInsets.only(top: 8, bottom: 8),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ...visibleNav.map(itemTile),
            if (visibleEngagement.isNotEmpty) ...[
              divider,
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: Text(
                  'COMMUNITY & ENGAGEMENT',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 1.2,
                    color: AppColors.onSurfaceVariant.withValues(alpha: 0.5),
                  ),
                ),
              ),
              const SizedBox(height: 4),
              ...visibleEngagement.map(itemTile),
            ],
            if (!isAuthenticated)
              InkWell(
                onTap: () => context.go('/login'),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  child: Row(
                    children: [
                      const Icon(Icons.login, size: 20, color: AppColors.onSurfaceVariant),
                      const SizedBox(width: 12),
                      Text(
                        'Sign In',
                        style: AppTypography.labelMd.copyWith(color: AppColors.onSurfaceVariant),
                      ),
                    ],
                  ),
                ),
              ),
            if (visibleBusiness.isNotEmpty) ...[
              divider,
              ...visibleBusiness.map(itemTile),
            ],
          ],
        ),
      ),
    );
  }
}

// ===================== DESKTOP LAYOUT =====================

class _DesktopLayout extends StatelessWidget {
  final Widget child;
  final bool isAuthenticated;
  final bool isCreator;
  final String? avatar;

  const _DesktopLayout({
    required this.child,
    required this.isAuthenticated,
    required this.isCreator,
    this.avatar,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _DesktopSidebar(isAuthenticated: isAuthenticated, isCreator: isCreator),
          Container(width: 1, color: const Color(0x0DFFFFFF)),
          Expanded(
            child: Column(
              children: [
                _TopBar(isAuthenticated: isAuthenticated, avatar: avatar),
                Expanded(child: child),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
