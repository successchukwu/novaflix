import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:url_launcher/url_launcher.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';
import '../services/api_service.dart';
import '../models/media_item.dart';
import '../providers/auth_provider.dart';
import '../providers/watchlist_provider.dart';
import '../providers/downloads_provider.dart';
import '../widgets/ui/index.dart';
import '../core/responsive.dart';
import '../widgets/features/index.dart';

class CastMember {
  final String? name;
  final String? character;
  final String? profilePath;
  final String? job;
  final String? department;

  const CastMember({
    this.name,
    this.character,
    this.profilePath,
    this.job,
    this.department,
  });

  factory CastMember.fromJson(Map<String, dynamic> json) => CastMember(
    name: json['name'] as String?,
    character: json['character'] as String?,
    profilePath: json['profile_path'] as String?,
    job: json['job'] as String?,
    department: json['department'] as String?,
  );
}

final _movieDetailProvider = FutureProvider.family<MediaItem?, int>((
  ref,
  id,
) async {
  final api = ref.read(apiServiceProvider);
  try {
    final res = await api.getDetails(id, 'movie');
    final data =
        res.data['data'] as Map<String, dynamic>? ??
        res.data as Map<String, dynamic>;
    return MediaItem.fromJson(data);
  } catch (_) {
    return null;
  }
});

final _similarProvider = FutureProvider.family<List<MediaItem>, (int, String)>((
  ref,
  key,
) async {
  final (id, type) = key;
  final api = ref.read(apiServiceProvider);
  try {
    final res = await api.getSimilarRecommendations(id, type: type);
    final data = res.data['data'] as List? ?? [];
    return data
        .map((e) => MediaItem.fromJson(e as Map<String, dynamic>))
        .toList();
  } catch (_) {
    return [];
  }
});

final _creditsProvider = FutureProvider.family<List<CastMember>, int>((
  ref,
  id,
) async {
  final api = ref.read(apiServiceProvider);
  try {
    final res = await api.getCredits(id, 'movie');
    final cast = res.data['cast'] as List? ?? [];
    final crew = res.data['crew'] as List? ?? [];
    return [
      ...cast.map((e) => CastMember.fromJson(e as Map<String, dynamic>)),
      ...crew.map((e) => CastMember.fromJson(e as Map<String, dynamic>)),
    ];
  } catch (_) {
    return [];
  }
});

class MovieDetailScreen extends ConsumerWidget {
  final int movieId;
  final String? mediaType;

  const MovieDetailScreen({super.key, required this.movieId, this.mediaType});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final type = mediaType ?? 'movie';
    final detail = ref.watch(_movieDetailProvider(movieId));
    final similar = ref.watch(_similarProvider((movieId, type)));
    final credits = ref.watch(_creditsProvider(movieId));
    final auth = ref.watch(authProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: detail.when(
        loading: () => const LoadingSpinner(),
        error: (err, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, size: 48, color: AppColors.error),
              const SizedBox(height: 16),
              Text('Failed to load details', style: AppTypography.bodyMd),
              const SizedBox(height: 16),
              AppButton(
                label: 'Go Back',
                onPressed: () => context.pop(),
                fullWidth: false,
              ),
            ],
          ),
        ),
        data: (item) {
          if (item == null) {
            return const Center(child: Text('Item not found'));
          }
          final width = MediaQuery.sizeOf(context).width;
          final size = screenSizeFor(width);
          final heroHeight = screenSizeFor(width) != ScreenSize.mobile ? 751.0 : 618.0;
          final isTV = item.isTV;
          final runtimeStr = item.runtime != null
              ? '${item.runtime! ~/ 60}h ${item.runtime! % 60}m'
              : null;
          final hPadding = responsivePadding(width);

          return CustomScrollView(
            slivers: [
              SliverAppBar(
                expandedHeight: heroHeight,
                pinned: false,
                floating: false,
                snap: false,
                backgroundColor: AppColors.background,
                flexibleSpace: FlexibleSpaceBar(
                  background: Stack(
                    fit: StackFit.expand,
                    children: [
                      if (item.backdropUrl != null)
                        CachedNetworkImage(
                          imageUrl: item.backdropUrl!,
                          fit: BoxFit.cover,
                        )
                      else
                        Container(
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                              colors: [
                                AppColors.primaryContainer.withValues(alpha: 0.2),
                                AppColors.surface,
                              ],
                            ),
                          ),
                        ),
                      Container(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            colors: [
                              const Color(0xFF050505).withValues(alpha: 0.0),
                              const Color(0xFF050505).withValues(alpha: 0.4),
                              const Color(0xFF050505),
                            ],
                            stops: const [0.0, 0.5, 1.0],
                          ),
                        ),
                      ),
                      Container(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.centerLeft,
                            end: Alignment.centerRight,
                            colors: [
                              const Color(0xFF050505).withValues(alpha: 0.8),
                              const Color(0xFF050505).withValues(alpha: 0.2),
                              const Color(0xFF050505).withValues(alpha: 0.0),
                            ],
                            stops: const [0.0, 0.3, 1.0],
                          ),
                        ),
                      ),
                      Positioned(
                        top: 0,
                        left: size == ScreenSize.desktop ? 32 : 16,
                        child: SafeArea(
                          child: Padding(
                            padding: const EdgeInsets.only(top: 8),
                            child: IconButton(
                              onPressed: () {
                                if (context.canPop()) {
                                  context.pop();
                                } else {
                                  context.go('/home');
                                }
                              },
                              icon: const Icon(
                                Icons.arrow_back,
                                color: Colors.white,
                              ),
                              style: IconButton.styleFrom(
                                backgroundColor: Colors.black.withValues(alpha: 0.4),
                              ),
                            ),
                          ),
                        ),
                      ),
                      Positioned(
                        left: hPadding,
                        right: hPadding,
                        bottom: size == ScreenSize.desktop ? 96 : 48,
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 896),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 8,
                                      vertical: 4,
                                    ),
                                    decoration: BoxDecoration(
                                      color: AppColors.surfaceContainerHighest,
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                    child: Text(
                                      isTV ? 'TV SERIES' : 'ORIGINAL FILM',
                                      style: AppTypography.labelSm.copyWith(
                                        color: AppColors.onSurface,
                                        letterSpacing: 2,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  const Icon(
                                    Icons.star,
                                    color: AppColors.secondary,
                                    size: 14,
                                  ),
                                  const SizedBox(width: 4),
                                  Text(
                                    '${item.ratingFormatted} Rating',
                                    style: AppTypography.labelMd.copyWith(
                                      color: AppColors.secondary,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 12),
                              Text(
                                item.title,
                                style: size == ScreenSize.desktop
                                    ? AppTypography.displayLg.copyWith(
                                        color: Colors.white,
                                      )
                                    : AppTypography.headlineLgMobile.copyWith(
                                        color: Colors.white,
                                      ),
                              ),
                              const SizedBox(height: 16),
                              Wrap(
                                spacing: 12,
                                runSpacing: 8,
                                crossAxisAlignment: WrapCrossAlignment.center,
                                children: [
                                  Text(
                                    '${item.year}',
                                    style: AppTypography.labelMd.copyWith(
                                      color: AppColors.secondary,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 6,
                                      vertical: 2,
                                    ),
                                    decoration: BoxDecoration(
                                      border: Border.all(
                                        color: AppColors.onSurfaceVariant,
                                      ),
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                    child: const Text(
                                      '18+',
                                      style: TextStyle(
                                        color: AppColors.onSurfaceVariant,
                                        fontSize: 10,
                                      ),
                                    ),
                                  ),
                                  if (runtimeStr != null)
                                    Text(
                                      runtimeStr,
                                      style: AppTypography.labelMd.copyWith(
                                        color: AppColors.onSurfaceVariant,
                                      ),
                                    ),
                                  Text(
                                    '4K Ultra HD',
                                    style: AppTypography.labelMd.copyWith(
                                      color: AppColors.onSurfaceVariant,
                                    ),
                                  ),
                                  Text(
                                    'Dolby Atmos',
                                    style: AppTypography.labelMd.copyWith(
                                      color: AppColors.onSurfaceVariant,
                                    ),
                                  ),
                                ],
                              ),
                              if (item.overview != null &&
                                  item.overview!.isNotEmpty) ...[
                                const SizedBox(height: 16),
                                ConstrainedBox(
                                  constraints: const BoxConstraints(maxWidth: 672),
                                  child: Text(
                                    item.overview!,
                                    maxLines: 3,
                                    overflow: TextOverflow.ellipsis,
                                    style: AppTypography.bodyLg.copyWith(
                                      color: AppColors.onSurfaceVariant,
                                    ),
                                  ),
                                ),
                              ],
                              const SizedBox(height: 24),
                              Wrap(
                                spacing: 12,
                                runSpacing: 12,
                                children: [
                                  _heroButton(
                                    label: 'Play Now',
                                    icon: Icons.play_arrow,
                                    filled: true,
                                    onTap: () {
                                      if (auth.status != AuthStatus.authenticated) {
                                        context.go('/login?redirect=/movie/$movieId');
                                        return;
                                      }
                                      context.push(
                                        '/watch?id=$movieId&type=$type${isTV ? '&season=1&episode=1' : ''}',
                                      );
                                    },
                                  ),
                                  Consumer(
                                    builder: (_, ref2, __) {
                                      final dlState = ref2.watch(downloadsProvider);
                                      final isDownloading = dlState.active.any((a) => a.contentId == item.id);
                                      return _heroButton(
                                        label: isDownloading ? 'Downloading...' : 'Download',
                                        icon: Icons.download,
                                        filled: false,
                                        onTap: () async {
                                          if (auth.status != AuthStatus.authenticated) {
                                            context.go('/login?redirect=/movie/$movieId');
                                            return;
                                          }
                                          try {
                                            if (isTV) {
                                              // For TV, gather episodes from seasons if available
                                              final eps = (item.seasons != null && item.seasons!.isNotEmpty)
                                                  ? List.generate(item.seasons!.first.episodeCount ?? 1, (i) => {
                                                        'season': 1,
                                                        'episode': i + 1,
                                                        'name': 'Episode ${i + 1}',
                                                      })
                                                  : [
                                                      {'season': 1, 'episode': 1, 'name': 'Episode 1'}
                                                    ];
                                              await ref2.read(downloadsProvider.notifier).startDownload(
                                                    contentId: item.id,
                                                    type: 'tv',
                                                    title: item.title,
                                                    poster: item.posterUrl,
                                                    backdrop: item.backdropUrl,
                                                    episodes: eps,
                                                  );
                                            } else {
                                              await ref2.read(downloadsProvider.notifier).startDownload(
                                                    contentId: item.id,
                                                    type: 'movie',
                                                    title: item.title,
                                                    poster: item.posterUrl,
                                                    backdrop: item.backdropUrl,
                                                  );
                                            }
                                            if (context.mounted) {
                                              ScaffoldMessenger.of(context).showSnackBar(
                                                const SnackBar(content: Text('Download started — check Downloads'), duration: Duration(seconds: 2)),
                                              );
                                              context.go('/downloads');
                                            }
                                          } catch (e) {
                                            if (context.mounted) {
                                              final msg = e.toString().contains('limit') ? 'Device limit reached — manage devices in Settings' : 'Download failed: $e';
                                              ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
                                            }
                                          }
                                        },
                                      );
                                    },
                                  ),
                                  Container(
                                    width: 56,
                                    height: 56,
                                    decoration: BoxDecoration(
                                      color: AppColors.surfaceVariant.withValues(alpha: 0.4),
                                      shape: BoxShape.circle,
                                      border: Border.all(color: Colors.white10),
                                    ),
                                    child: Consumer(
                                      builder: (_, ref2, __) {
                                        final watchlist = ref2.watch(watchlistProvider);
                                        final inList = watchlist.isInWatchlist(item.id, isTV ? 'tv' : 'movie');
                                        return IconButton(
                                          icon: Icon(
                                            inList ? Icons.check : Icons.add,
                                            color: AppColors.onSurface,
                                          ),
                                          onPressed: () {
                                            if (auth.status != AuthStatus.authenticated) {
                                              context.go('/login?redirect=/movie/$movieId');
                                              return;
                                            }
                                            ref2
                                                .read(watchlistProvider.notifier)
                                                .toggle(item.id, isTV ? 'tv' : 'movie');
                                          },
                                        );
                                      },
                                    ),
                                  ),
                                  _heroButton(
                                    label: 'Watch Party',
                                    icon: Icons.diversity_3,
                                    filled: false,
                                    outline: true,
                                    onTap: () => context.push(
                                      '/watch-party?id=$movieId&type=$type',
                                    ),
                                  ),
                                  if (item.trailerKey != null &&
                                      item.trailerKey!.isNotEmpty)
                                    _heroButton(
                                      label: 'Watch Trailer',
                                      icon: Icons.play_circle_outline,
                                      filled: false,
                                      onTap: () => _openTrailer(item.trailerKey!),
                                    ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              SliverToBoxAdapter(
                child: Align(
                  alignment: Alignment.topCenter,
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 1440),
                    child: Padding(
                      padding: EdgeInsets.fromLTRB(hPadding, 0, hPadding, 32),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const SizedBox(height: 32),
                          _infoCard(item, credits.valueOrNull ?? const [], isTV),
                          const SizedBox(height: 24),
                          _engagementSection(context, item),
                          const SizedBox(height: 24),
                          if (isTV && item.seasons != null && item.seasons!.isNotEmpty) ...[
                            Text('Episodes', style: AppTypography.headlineMd),
                            const SizedBox(height: 12),
                            SeasonEpisodeSelector(
                              showId: item.id,
                              seasons: item.seasons!,
                            ),
                            const SizedBox(height: 24),
                          ],
                          CommentSection(
                            contentId: item.id,
                            contentType: isTV ? 'tv' : 'movie',
                          ),
                          const SizedBox(height: 24),
                          similar.when(
                            data: (items) => items.isNotEmpty
                                ? ContentRow(
                                    title: 'More Like This',
                                    items: items,
                                  )
                                : const SizedBox.shrink(),
                            loading: () => const SizedBox(
                              height: 200,
                              child: LoadingSpinner(),
                            ),
                            error: (_, __) => const SizedBox.shrink(),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _openTrailer(String key) async {
    final uri = Uri.parse('https://www.youtube.com/watch?v=$key');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  Widget _heroButton({
    required String label,
    required IconData icon,
    required VoidCallback onTap,
    bool filled = false,
    bool outline = false,
  }) {
    final bg = filled
        ? AppColors.primaryContainer
        : outline
            ? Colors.transparent
            : AppColors.surfaceVariant.withValues(alpha: 0.4);
    final fg = filled ? AppColors.onPrimaryContainer : AppColors.onSurface;
    return Material(
      color: bg,
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            border: outline ? Border.all(color: AppColors.primary.withValues(alpha: 0.3)) : null,
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, color: fg, size: 18),
              const SizedBox(width: 8),
              Text(
                label,
                style: TextStyle(
                  color: fg,
                  fontWeight: FontWeight.w700,
                  fontSize: 16,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _infoCard(MediaItem item, List<CastMember> credits, bool isTV) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: AppColors.surfaceContainer,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white.withValues(alpha: 0.05)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Synopsis', style: AppTypography.headlineMd),
          const SizedBox(height: 8),
          Text(
            item.overview ?? 'No synopsis available.',
            style: AppTypography.bodyMd.copyWith(
              color: AppColors.onSurfaceVariant,
              height: 1.6,
            ),
          ),
          if (credits.isNotEmpty) ...[
            const SizedBox(height: 24),
            const Text('Cast & Crew', style: AppTypography.headlineMd),
            const SizedBox(height: 12),
            SizedBox(
              height: 150,
              child: ListView.builder(
                scrollDirection: Axis.horizontal,
                itemCount: credits.length,
                itemBuilder: (_, i) {
                  final person = credits[i];
                  return Padding(
                    padding: const EdgeInsets.only(right: 16),
                    child: SizedBox(
                      width: 80,
                      child: Column(
                        children: [
                          CircleAvatar(
                            radius: 32,
                            backgroundColor: AppColors.surfaceContainerHigh,
                            backgroundImage: person.profilePath != null
                                ? NetworkImage(
                                    'https://image.tmdb.org/t/p/w185${person.profilePath}',
                                  )
                                : null,
                            child: person.profilePath == null
                                ? const Icon(
                                    Icons.person,
                                    color: AppColors.onSurfaceVariant,
                                  )
                                : null,
                          ),
                          const SizedBox(height: 8),
                          Text(
                            person.name ?? '',
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            textAlign: TextAlign.center,
                            style: AppTypography.bodySm.copyWith(
                              color: AppColors.onSurface,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          if (person.character != null ||
                              person.job != null) ...[
                            const SizedBox(height: 2),
                            Text(
                              person.character ?? person.job ?? '',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              textAlign: TextAlign.center,
                              style: const TextStyle(
                                color: AppColors.onSurfaceVariant,
                                fontSize: 11,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
          const SizedBox(height: 24),
          Wrap(
            spacing: 24,
            runSpacing: 16,
            children: [
              _infoField('Rating', '${item.ratingFormatted} / 10', AppColors.primary),
              _infoField('Year', '${item.year}'),
              _infoField(
                'Genres',
                item.genres?.map((g) => g.name).join(', ') ?? '—',
              ),
              _infoField('Type', isTV ? 'TV Series' : 'Movie'),
            ],
          ),
          if ((item.voteAverage ?? 0) >= 8) ...[
            const SizedBox(height: 16),
            const PremiumBadge(size: 18),
          ],
        ],
      ),
    );
  }

  Widget _infoField(String label, String value, [Color? valueColor]) {
    return SizedBox(
      width: 200,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label.toUpperCase(),
            style: const TextStyle(
              color: AppColors.onSurfaceVariant,
              fontSize: 10,
              letterSpacing: 1.5,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: AppTypography.labelMd.copyWith(color: valueColor ?? AppColors.onSurface),
          ),
        ],
      ),
    );
  }

  Widget _engagementSection(BuildContext context, MediaItem item) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: AppColors.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white.withValues(alpha: 0.05)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Engagement',
            style: AppTypography.labelMd.copyWith(
              color: AppColors.onSurfaceVariant,
              letterSpacing: 1.5,
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: Column(
                  children: [
                    _engRow('Popularity', '#1 Today', color: AppColors.secondary),
                    const SizedBox(height: 8),
                    const ClipRRect(
                      borderRadius: BorderRadius.all(Radius.circular(8)),
                      child: LinearProgressIndicator(
                        value: 0.92,
                        backgroundColor: Colors.white10,
                        color: AppColors.secondary,
                        minHeight: 4,
                      ),
                    ),
                    const SizedBox(height: 16),
                    _engRow(
                      'Critical Score',
                      '${((item.voteAverage ?? 0) * 10).round()}/100',
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 16),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  LikeButton(
                    contentId: item.id,
                    contentType: item.isTV ? 'tv' : 'movie',
                  ),
                  const SizedBox(height: 8),
                  InkWell(
                    onTap: () {
                      Clipboard.setData(
                        ClipboardData(
                          text: 'https://novaflix.app/${item.isTV ? 'tv' : 'movie'}/${item.id}',
                        ),
                      );
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Link copied to clipboard'),
                          duration: Duration(seconds: 2),
                        ),
                      );
                    },
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          Icons.share_outlined,
                          color: AppColors.onSurfaceVariant,
                          size: 20,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          'Share',
                          style: AppTypography.labelSm.copyWith(
                            color: AppColors.onSurfaceVariant,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 8),
                  OutlinedButton(
                    onPressed: () {},
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.primary,
                      side: BorderSide(color: AppColors.primary.withValues(alpha: 0.3)),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      minimumSize: const Size(160, 44),
                    ),
                    child: Text(
                      'Rate this Movie',
                      style: AppTypography.labelMd,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _engRow(String label, String value, {Color? color}) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: AppTypography.labelSm.copyWith(color: AppColors.onSurfaceVariant)),
        Text(
          value,
          style: AppTypography.labelSm.copyWith(
            color: color ?? AppColors.onSurface,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }
}