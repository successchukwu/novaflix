import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../core/responsive.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';
import '../services/api_service.dart';
import '../models/media_item.dart';
import '../providers/store_provider.dart';
import '../providers/auth_provider.dart';
import '../providers/downloads_provider.dart';
import '../providers/watchlist_provider.dart';
import '../widgets/ui/index.dart';
import '../widgets/features/index.dart';

final _rng = Random();

List<T> _shuffled<T>(List<T> list) {
  final copy = List<T>.from(list);
  for (var i = copy.length - 1; i > 0; i--) {
    final j = _rng.nextInt(i + 1);
    final tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

final _trendingProvider = FutureProvider<
  ({List<MediaItem> movies, List<MediaItem> tv})
>((ref) async {
  final api = ref.read(apiServiceProvider);
  final res = await api.getTrending();
  final data =
      res.data['data'] as Map<String, dynamic>? ??
      res.data as Map<String, dynamic>;
  final movies =
      (data['movies'] as List?)
          ?.map((e) => MediaItem.fromJson(e as Map<String, dynamic>))
          .toList() ??
      <MediaItem>[];
  final tv =
      (data['tv'] as List?)
          ?.map((e) => MediaItem.fromJson(e as Map<String, dynamic>))
          .toList() ??
      <MediaItem>[];
  return (movies: movies, tv: tv);
});

final _nowPlayingProvider = FutureProvider<List<MediaItem>>((ref) async {
  final api = ref.read(apiServiceProvider);
  final res = await api.getNowPlaying();
  final data = res.data['data'] as List? ?? res.data as List;
  return data
      .map((e) => MediaItem.fromJson(e as Map<String, dynamic>))
      .toList();
});

final _homeNewsProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final api = ref.read(apiServiceProvider);
  final res = await api.getHomeNews();
  final articles = res.data['articles'] as List? ?? [];
  return articles.cast<Map<String, dynamic>>();
});

final _continueWatchingProvider = FutureProvider<List<ContinueWatchingItem>>((
  ref,
) async {
  final api = ref.read(apiServiceProvider);
  final auth = ref.read(authProvider);
  final local = ref.read(storeProvider).continueWatching;
  if (auth.status != AuthStatus.authenticated) return local;
  try {
    final res = await api.getContinueWatching();
    final history = res.data['history'] as List? ?? [];
    final items = history.map((e) {
      final m = e as Map<String, dynamic>;
      return ContinueWatchingItem(
        id: int.tryParse('${m['content_id']}') ?? 0,
        title: m['title'] as String? ?? '',
        poster: m['poster'] as String?,
        type: m['type'] as String? ?? 'movie',
        season: m['season'] as int?,
        episode: m['episode'] as int?,
        progress: (m['position_seconds'] as num?)?.toDouble() ?? 0,
        duration: (m['duration_seconds'] as num?)?.toDouble() ?? 0,
      );
    }).toList();
    if (items.isNotEmpty) return items;
    return local;
  } catch (_) {
    return local;
  }
});

final _categoryProvider = FutureProvider.family<List<MediaItem>, int>((
  ref,
  genreId,
) async {
  final api = ref.read(apiServiceProvider);
  final res = await api.getCategoryMovies(genreId, type: 'movie');
  final data = res.data['data'] as List? ?? res.data as List;
  return data
      .map((e) => MediaItem.fromJson(e as Map<String, dynamic>))
      .toList();
});

FutureProvider<List<MediaItem>> _discoverProvider(
  String key, {
  String? type,
  String? sortBy,
  int? minVotes,
  String? withCompanies,
  String? withOriginalLanguage,
  String? withOriginCountry,
  String? primaryReleaseDateLte,
}) {
  return FutureProvider<List<MediaItem>>((ref) async {
    final api = ref.read(apiServiceProvider);
    final res = await api.getDiscover(
      type: type,
      sortBy: sortBy,
      minVotes: minVotes,
      withCompanies: withCompanies,
      withOriginalLanguage: withOriginalLanguage,
      withOriginCountry: withOriginCountry,
      primaryReleaseDateLte: primaryReleaseDateLte,
    );
    final data = res.data['data'] as List? ?? res.data as List;
    return data
        .map((e) => MediaItem.fromJson(e as Map<String, dynamic>))
        .toList();
  });
}

final _indieProvider = _discoverProvider(
  'indie',
  type: 'movie',
  withCompanies: '1549',
);
final _hollywoodProvider = _discoverProvider(
  'hollywood',
  type: 'movie',
  withOriginCountry: 'US',
);
final _nollywoodProvider = _discoverProvider(
  'nollywood',
  type: 'movie',
  withOriginCountry: 'NG',
  withOriginalLanguage: 'en',
);
final _animeProvider = _discoverProvider(
  'anime',
  type: 'movie',
  withOriginalLanguage: 'ja',
);
final _classicProvider = _discoverProvider(
  'classic',
  type: 'movie',
  sortBy: 'vote_average.desc',
  minVotes: 1000,
  primaryReleaseDateLte: '1999-12-31',
);

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final trending = ref.watch(_trendingProvider);
    final nowPlaying = ref.watch(_nowPlayingProvider);
    final news = ref.watch(_homeNewsProvider);
    final horror = ref.watch(_categoryProvider(27));
    final indie = ref.watch(_indieProvider);
    final hollywood = ref.watch(_hollywoodProvider);
    final nollywood = ref.watch(_nollywoodProvider);
    final anime = ref.watch(_animeProvider);
    final classic = ref.watch(_classicProvider);
    final store = ref.watch(storeProvider);
    final watchlist = ref.watch(watchlistProvider);
    final netStatus = ref.watch(netStatusProvider);
    final dlState = ref.watch(downloadsProvider);
    final isOffline = netStatus == NetStatus.offline;
    final auth = ref.watch(authProvider);
    final hasDownloads = dlState.items.isNotEmpty;
    final isAuthed = auth.status == AuthStatus.authenticated;
    final userName = auth.user?.username ?? 'You';
    final continueWatching =
        ref.watch(_continueWatchingProvider).valueOrNull ??
        store.continueWatching;

    return Scaffold(
      backgroundColor: AppColors.background,
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(_trendingProvider);
          ref.invalidate(_nowPlayingProvider);
          ref.invalidate(_homeNewsProvider);
          ref.invalidate(_categoryProvider(27));
          ref.invalidate(_indieProvider);
          ref.invalidate(_hollywoodProvider);
          ref.invalidate(_nollywoodProvider);
          ref.invalidate(_animeProvider);
          ref.invalidate(_classicProvider);
        },
        child: CustomScrollView(
          slivers: [
            SliverAppBar(
              backgroundColor: AppColors.background,
              expandedHeight: MediaQuery.sizeOf(context).height * 0.7,
              pinned: false,
              floating: false,
              flexibleSpace: trending.when(
                data: (items) {
                  final all = [...items.movies, ...items.tv];
                  return HeroBanner(items: all.take(6).toList());
                },
                loading: () => AppSkeleton.hero(),
                error: (_, __) => const SizedBox(height: 400),
              ),
            ),
            SliverToBoxAdapter(
              child: SizedBox(height: 64, child: Container(color: AppColors.background)),
            ),
            if (isAuthed && isOffline && hasDownloads)
              SliverToBoxAdapter(child: _offlineCta(context, dlState)),
            if (continueWatching.isNotEmpty)
              SliverToBoxAdapter(
                child: _buildContinueWatching(context, continueWatching, userName),
              ),
            SliverToBoxAdapter(
              child: trending.when(
                data: (items) => ContentRow(
                  title: 'Trending Now',
                  items: items.movies.take(20).toList(),
                  onSeeAll: () => context.go('/discover?sort=trending'),
                ),
                loading: () => const SizedBox(height: 220, child: LoadingSpinner()),
                error: (_, __) => const SizedBox.shrink(),
              ),
            ),
            SliverToBoxAdapter(
              child: news.when(
                data: (articles) => articles.isEmpty
                    ? const SizedBox.shrink()
                    : _buildNewsRow(context, articles),
                loading: () => const SizedBox(height: 220, child: LoadingSpinner()),
                error: (_, __) => const SizedBox.shrink(),
              ),
            ),
            if (watchlist.items.isNotEmpty)
              SliverToBoxAdapter(
                child: trending.when(
                  data: (items) {
                    final mixed = _shuffled([...items.movies, ...items.tv]).take(10).toList();
                    return ContentRow(
                      title: 'Because You Watched',
                      items: mixed,
                      onSeeAll: () => context.go('/discover'),
                    );
                  },
                  loading: () => const SizedBox(height: 220, child: LoadingSpinner()),
                  error: (_, __) => const SizedBox.shrink(),
                ),
              ),
            SliverToBoxAdapter(
              child: nowPlaying.when(
                data: (items) => ContentRow(
                  title: 'Now Playing',
                  items: items.take(20).toList(),
                  onSeeAll: () => context.go('/search?type=movie'),
                ),
                loading: () => const SizedBox(height: 220, child: LoadingSpinner()),
                error: (_, __) => const SizedBox.shrink(),
              ),
            ),
            SliverToBoxAdapter(
              child: trending.when(
                data: (items) => ContentRow(
                  title: 'Popular TV Shows',
                  items: items.tv.take(20).toList(),
                  onSeeAll: () => context.go('/tv-shows'),
                ),
                loading: () => const SizedBox(height: 220),
                error: (_, __) => const SizedBox.shrink(),
              ),
            ),
            SliverToBoxAdapter(
              child: trending.when(
                data: (items) => ContentRow(
                  title: 'Top Rated Movies',
                  items: _shuffled(items.movies).take(20).toList(),
                  onSeeAll: () => context.go('/discover?sort=top_rated'),
                ),
                loading: () => const SizedBox(height: 220),
                error: (_, __) => const SizedBox.shrink(),
              ),
            ),
            SliverToBoxAdapter(
              child: horror.when(
                data: (items) => items.isEmpty
                    ? const SizedBox.shrink()
                    : ContentRow(
                        title: 'Horror Movies',
                        items: items.take(20).toList(),
                        onSeeAll: () => context.go('/discover?sort=trending'),
                      ),
                loading: () => const SizedBox(height: 220),
                error: (_, __) => const SizedBox.shrink(),
              ),
            ),
            SliverToBoxAdapter(
              child: indie.when(
                data: (items) => items.isEmpty
                    ? const SizedBox.shrink()
                    : ContentRow(title: 'Indie Films', items: items.take(20).toList()),
                loading: () => const SizedBox(height: 220),
                error: (_, __) => const SizedBox.shrink(),
              ),
            ),
            SliverToBoxAdapter(
              child: hollywood.when(
                data: (items) => items.isEmpty
                    ? const SizedBox.shrink()
                    : ContentRow(title: 'Hollywood', items: items.take(20).toList(), onSeeAll: () => context.go('/discover?origin=US')),
                loading: () => const SizedBox(height: 220),
                error: (_, __) => const SizedBox.shrink(),
              ),
            ),
            SliverToBoxAdapter(
              child: nollywood.when(
                data: (items) => items.isEmpty
                    ? const SizedBox.shrink()
                    : ContentRow(title: 'Nollywood', items: items.take(20).toList(), onSeeAll: () => context.go('/discover?origin=NG')),
                loading: () => const SizedBox(height: 220),
                error: (_, __) => const SizedBox.shrink(),
              ),
            ),
            SliverToBoxAdapter(
              child: anime.when(
                data: (items) => items.isEmpty
                    ? const SizedBox.shrink()
                    : ContentRow(
                        title: 'Anime',
                        items: items.take(20).toList(),
                        onSeeAll: () => context.go('/discover?sort=trending'),
                      ),
                loading: () => const SizedBox(height: 220),
                error: (_, __) => const SizedBox.shrink(),
              ),
            ),
            SliverToBoxAdapter(
              child: classic.when(
                data: (items) => items.isEmpty
                    ? const SizedBox.shrink()
                    : ContentRow(title: 'Classic Movies', items: items.take(20).toList()),
                loading: () => const SizedBox(height: 220),
                error: (_, __) => const SizedBox.shrink(),
              ),
            ),
            const SliverToBoxAdapter(child: SizedBox(height: 48)),
          ],
        ),
      ),
    );
  }

  Widget _offlineCta(BuildContext context, DownloadsState dlState) {
    return Container(
      margin: const EdgeInsets.fromLTRB(64, 0, 64, 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [AppColors.primary, AppColors.primary.withValues(alpha: 0.6)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'You\'re offline',
                  style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 15),
                ),
                const SizedBox(height: 4),
                Text(
                  '${dlState.items.length} saved — watch your downloads anytime',
                  style: const TextStyle(color: Colors.white, fontSize: 12),
                ),
              ],
            ),
          ),
          FilledButton(
            onPressed: () => context.push('/downloads'),
            style: FilledButton.styleFrom(
              backgroundColor: Colors.black,
              foregroundColor: Colors.white,
            ),
            child: const Text('Go to Downloads'),
          ),
        ],
      ),
    );
  }

  Widget _buildContinueWatching(
    BuildContext context,
    List<ContinueWatchingItem> items,
    String userName,
  ) {
    final width = MediaQuery.of(context).size.width;
    final hPadding = responsivePadding(width);
    return Center(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: responsiveMaxContentWidth(width)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: EdgeInsets.fromLTRB(hPadding, 0, hPadding, 12),
              child: Row(
                children: [
                  Expanded(
                    child: Row(
                      children: [
                        Flexible(
                          child: Text(
                            'Continue Watching for $userName',
                            style: AppTypography.headlineMd.copyWith(
                              color: AppColors.onSurface,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 8),
                        const Icon(
                          Icons.chevron_right,
                          color: AppColors.primary,
                          size: 22,
                        ),
                      ],
                    ),
                  ),
                  GestureDetector(
                    onTap: () => context.go('/watchlist'),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      child: Text(
                        'View All',
                        style: AppTypography.labelMd.copyWith(
                          color: AppColors.primary,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            SizedBox(
              height: 220,
              child: ListView.builder(
                scrollDirection: Axis.horizontal,
                padding: EdgeInsets.symmetric(horizontal: hPadding),
                itemCount: items.length,
                itemBuilder: (_, i) {
                  final item = items[i];
                  final percent = item.duration > 0
                            ? (item.progress / item.duration * 100).clamp(0, 100)
                            : 0.0;
                          return Padding(
                            padding: const EdgeInsets.only(right: 16),
                            child: SizedBox(
                              width: responsiveCardWidth(width),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Expanded(
                                    child: GestureDetector(
                                      onTap: () => context.push(
                                        '/watch?id=${item.id}&type=${item.type}'
                                        '${item.season != null ? '&season=${item.season}' : ''}'
                                        '${item.episode != null ? '&episode=${item.episode}' : ''}'
                                        '&resume=${item.progress.toStringAsFixed(0)}',
                                      ),
                              child: Container(
                                decoration: BoxDecoration(
                                  color: AppColors.surfaceContainerHigh,
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Stack(
                                  fit: StackFit.expand,
                                  children: [
                                    if (item.poster != null)
                                      ClipRRect(
                                        borderRadius: BorderRadius.circular(8),
                                        child: Image.network(
                                          item.poster!,
                                          fit: BoxFit.cover,
                                          width: 220,
                                        ),
                                      ),
                                    Positioned(
                                      bottom: 0,
                                      left: 0,
                                      right: 0,
                                      child: ClipRRect(
                                        borderRadius: const BorderRadius.vertical(
                                          bottom: Radius.circular(8),
                                        ),
                                        child: LinearProgressIndicator(
                                          value: item.duration > 0
                                              ? item.progress / item.duration
                                              : 0,
                                          backgroundColor: Colors.white12,
                                          valueColor: const AlwaysStoppedAnimation(
                                            Color(0xFFEF4444),
                                          ),
                                          minHeight: 4,
                                        ),
                                      ),
                                    ),
                                    if (item.duration > 0)
                                      Positioned(
                                        left: 6,
                                        bottom: 10,
                                        child: Container(
                                          padding: const EdgeInsets.symmetric(
                                            horizontal: 5,
                                            vertical: 1,
                                          ),
                                          decoration: BoxDecoration(
                                            color: Colors.black.withValues(
                                              alpha: 0.7,
                                            ),
                                            borderRadius: BorderRadius.circular(
                                              4,
                                            ),
                                          ),
                                          child: Text(
                                            '${percent.toStringAsFixed(0)}%',
                                            style: const TextStyle(
                                              color: Colors.white,
                                              fontSize: 9.5,
                                              fontWeight: FontWeight.w700,
                                            ),
                                          ),
                                        ),
                                      ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            item.title,
                            style: AppTypography.labelMd.copyWith(
                              color: AppColors.onSurface,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildNewsRow(BuildContext context, List<Map<String, dynamic>> articles) {
    final width = MediaQuery.of(context).size.width;
    final hPadding = responsivePadding(width);
    final cardWidth = responsiveCardWidth(width);
    return Center(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: responsiveMaxContentWidth(width)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: EdgeInsets.fromLTRB(hPadding, 0, hPadding, 12),
              child: Row(
                children: [
                  Expanded(
                    child: Row(
                      children: [
                        Flexible(
                          child: Text(
                            'Latest Movie News',
                            style: AppTypography.headlineMd.copyWith(
                              color: AppColors.onSurface,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 8),
                        const Icon(
                          Icons.newspaper,
                          color: AppColors.primary,
                          size: 22,
                        ),
                      ],
                    ),
                  ),
                  GestureDetector(
                    onTap: () => context.go('/news'),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      child: Text(
                        'View All',
                        style: AppTypography.labelMd.copyWith(
                          color: AppColors.primary,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            SizedBox(
              height: cardWidth * 0.625 + 46,
              child: ListView.builder(
                scrollDirection: Axis.horizontal,
                padding: EdgeInsets.symmetric(horizontal: hPadding),
                itemCount: articles.length,
                itemBuilder: (_, i) {
                  final a = articles[i];
                  final url = a['url']?.toString() ?? '';
                  final title = a['title']?.toString() ?? '';
                  final imageUrl = a['image']?.toString();
                  final source = a['source']?.toString() ?? '';
                  final publishedAt = a['publishedAt']?.toString() ?? '';
                  final hasImage = imageUrl != null && imageUrl.isNotEmpty;
                  return GestureDetector(
                    onTap: () => context.push(
                      '/news-article?url=${Uri.encodeComponent(url)}',
                    ),
                    child: Container(
                      width: cardWidth,
                      margin: const EdgeInsets.only(right: 16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            width: cardWidth,
                            height: cardWidth * 0.625,
                            decoration: BoxDecoration(
                              color: AppColors.surfaceContainerHigh,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: Colors.white10),
                            ),
                            clipBehavior: Clip.antiAlias,
                            child: hasImage
                                ? CachedNetworkImage(
                                    imageUrl: imageUrl,
                                    fit: BoxFit.cover,
                                    placeholder: (_, _) => const _NewsFallback(),
                                    errorWidget: (_, _, _) => const _NewsFallback(),
                                  )
                                : const _NewsFallback(),
                          ),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              Text(
                                source,
                                style: const TextStyle(
                                  color: AppColors.onSurfaceVariant,
                                  fontSize: 11,
                                ),
                              ),
                              if (source.isNotEmpty) ...[
                                const SizedBox(width: 4),
                                const Text(
                                  '·',
                                  style: TextStyle(color: AppColors.onSurfaceVariant),
                                ),
                              ],
                              const SizedBox(width: 4),
                              Text(
                                publishedAt,
                                style: const TextStyle(
                                  color: AppColors.onSurfaceVariant,
                                  fontSize: 11,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Text(
                            title,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: AppColors.onSurface,
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                              height: 1.3,
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _NewsFallback extends StatelessWidget {
  const _NewsFallback();

  @override
  Widget build(BuildContext context) {
    return const ColoredBox(
      color: AppColors.surfaceContainerHigh,
      child: Center(
        child: Icon(
          Icons.newspaper,
          size: 32,
          color: AppColors.onSurfaceVariant,
        ),
      ),
    );
  }
}