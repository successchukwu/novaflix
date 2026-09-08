import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';
import '../models/media_item.dart';
import '../services/api_service.dart';
import '../providers/auth_provider.dart';
import '../providers/downloads_provider.dart';
import '../services/download_service.dart';
import '../widgets/ui/index.dart';
import '../widgets/features/download_progress_tile.dart';
import 'watch_screen.dart';
import 'offline_play_screen.dart';

class DownloadsScreen extends ConsumerWidget {
  const DownloadsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dlState = ref.watch(downloadsProvider);
    final netStatus = ref.watch(netStatusProvider);
    final isOffline = netStatus == NetStatus.offline;
    final items = dlState.items;
    final active = dlState.active;
    final movies = items.where((i) => !i.isTv).toList();
    final shows = items.where((i) => i.isTv).toList();

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Downloads'),
        backgroundColor: AppColors.background,
      ),
      body: dlState.loading
          ? const LoadingSpinner()
          : RefreshIndicator(
              onRefresh: () async {
                ref.invalidate(downloadsProvider);
                await Future.delayed(const Duration(milliseconds: 400));
              },
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                children: [
                  if (dlState.limitError != null)
                    _limitBanner(context, ref, dlState.limitError!),
                  if (isOffline)
                    _offlineBanner(context),
                  _storageBar(context, ref),
                  const SizedBox(height: 8),

                  if (active.isNotEmpty) ...[
                    _sectionTitle('Downloading'),
                    const SizedBox(height: 8),
                    _activeDownloads(context, ref, active),
                    const SizedBox(height: 16),
                  ],

                  if (items.isEmpty && active.isEmpty) ...[
                    const SizedBox(height: 60),
                    _emptyState(context),
                  ],

                  if (movies.isNotEmpty) ...[
                    _sectionTitle('Movies'),
                    const SizedBox(height: 8),
                    ...movies.map((m) => _movieRow(context, ref, m)),
                    const SizedBox(height: 16),
                  ],

                  if (shows.isNotEmpty) ...[
                    _sectionTitle('TV Shows'),
                    const SizedBox(height: 8),
                    ...shows.map((s) => _showCard(context, ref, s)),
                    const SizedBox(height: 16),
                  ],

                  if (items.isNotEmpty && isOffline)
                    _offlineSuggestions(context, ref, movies),
                ],
              ),
            ),
    );
  }

  Widget _limitBanner(BuildContext context, WidgetRef ref, String message) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.error.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.error.withValues(alpha: 0.5)),
      ),
      child: Row(
        children: [
          Icon(Icons.block, color: AppColors.error, size: 18),
          const SizedBox(width: 10),
          Expanded(
            child: Text(message, style: const TextStyle(color: Colors.white, fontSize: 13)),
          ),
          GestureDetector(
            onTap: () => ref.read(downloadsProvider.notifier).clearLimitError(),
            child: const Icon(Icons.close, color: Colors.white70, size: 16),
          ),
        ],
      ),
    );
  }

  Widget _storageBar(BuildContext context, WidgetRef ref) {
    return FutureBuilder<int>(
      future: ref.read(downloadServiceProvider).getTotalDownloadedBytes(),
      builder: (ctx, snap) {
        final used = snap.data ?? 0;
        final total = 300 * 1024 * 1024;
        final pct = (used / total).clamp(0.0, 1.0);
        String fmt(int b) {
          if (b <= 0) return '0 MB';
          final mb = b / (1024 * 1024);
          return mb >= 1024 ? '${(mb/1024).toStringAsFixed(1)} GB' : '${mb.toStringAsFixed(1)} MB';
        }
        return Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppColors.surfaceContainer,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('Storage', style: AppTypography.labelMd.copyWith(color: AppColors.onSurfaceVariant)),
                  Text('${fmt(used)} / 300 MB', style: const TextStyle(color: Colors.white70, fontSize: 12)),
                ],
              ),
              const SizedBox(height: 8),
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: pct,
                  minHeight: 6,
                  backgroundColor: Colors.white12,
                  color: pct > 0.9 ? AppColors.error : pct > 0.75 ? Colors.orangeAccent : AppColors.primary,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                '100 MB per file at lowest quality (184p) • 1 movie (~75MB) + 2 episodes (~30MB each) ≈ 130 MB',
                style: const TextStyle(color: Colors.white38, fontSize: 11),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _offlineBanner(BuildContext context) {    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.outlineVariant),
      ),
      child: Row(
        children: [
          Container(
            width: 10,
            height: 10,
            decoration: BoxDecoration(color: AppColors.secondary, shape: BoxShape.circle),
          ),
          const SizedBox(width: 10),
          const Expanded(
            child: Text(
              'You are offline — playing from your downloads',
              style: TextStyle(color: Colors.white, fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }

  Widget _sectionTitle(String label) {
    return Text(
      label,
      style: AppTypography.bodyLg.copyWith(fontWeight: FontWeight.w700),
    );
  }

  Widget _activeDownloads(BuildContext context, WidgetRef ref, List<ActiveDownload> active) {
    return Column(
      children: [
        for (final a in active)
          Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.surfaceContainerHigh,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                DownloadProgressTile(
                  backdrop: a.backdrop,
                  poster: a.poster,
                  progress: a.fraction,
                  active: true,
                  size: 72,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(a.title,
                          style: AppTypography.bodyMd,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis),
                      const SizedBox(height: 4),
                      Text(
                        a.type == 'tv'
                            ? '${a.episodesDone}/${a.episodeCount} episodes'
                            : 'Movie',
                        style: TextStyle(color: AppColors.onSurfaceVariant, fontSize: 12),
                      ),
                      const SizedBox(height: 8),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(3),
                        child: LinearProgressIndicator(
                          value: a.fraction,
                          minHeight: 4,
                          color: AppColors.primary,
                          backgroundColor: Colors.white12,
                        ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close, color: Colors.white54),
                  onPressed: () => ref.read(downloadsProvider.notifier).cancelDownloads(),
                ),
              ],
            ),
          ),
      ],
    );
  }

  Widget _movieRow(BuildContext context, WidgetRef ref, DownloadItem m) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppColors.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          DownloadProgressTile(
            backdrop: m.backdrop,
            poster: m.poster,
            progress: m.progress,
            active: false,
            size: 72,
            onTap: () => _playMovie(context, ref, m),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(m.title,
                    style: AppTypography.bodyMd,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis),
                const SizedBox(height: 4),
                Text('Downloaded',
                    style: TextStyle(color: AppColors.onSurfaceVariant, fontSize: 12)),
                const SizedBox(height: 6),
                Row(
                  children: [
                    if (m.progress >= 1 && m.duration > 0)
                      _chip(context, Icons.replay, 'Replay'),
                  ],
                ),
              ],
            ),
          ),
          IconButton(
            icon: const Icon(Icons.play_circle_fill, color: AppColors.primary, size: 32),
            onPressed: () => _playMovie(context, ref, m),
          ),
          IconButton(
            icon: const Icon(Icons.delete_outline, color: AppColors.error),
            onPressed: () => _confirmDelete(context, ref, m),
          ),
        ],
      ),
    );
  }

  Widget _showCard(BuildContext context, WidgetRef ref, DownloadItem s) {
    final sorted = List<DownloadEpisode>.from(s.episodes)
      ..sort((a, b) => a.episode.compareTo(b.episode));
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: AppColors.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(10),
            child: Row(
              children: [
                DownloadProgressTile(
                  backdrop: s.backdrop,
                  poster: s.poster,
                  progress: s.progress,
                  active: false,
                  size: 72,
                  onTap: () => _playShow(context, ref, s, sorted.first),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(s.title,
                          style: AppTypography.bodyMd,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis),
                      const SizedBox(height: 4),
                      Text('${sorted.length} episodes',
                          style: TextStyle(color: AppColors.onSurfaceVariant, fontSize: 12)),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.delete_outline, color: AppColors.error),
                  onPressed: () => _confirmDelete(context, ref, s),
                ),
              ],
            ),
          ),
          Divider(height: 1, color: Colors.white.withValues(alpha: 0.06)),
          ...sorted.map((e) => _episodeRow(context, ref, s, e)),
        ],
      ),
    );
  }

  Widget _episodeRow(BuildContext context, WidgetRef ref, DownloadItem s, DownloadEpisode e) {
    final resumed = e.progress > 0 && e.progress < 1;
    return InkWell(
      onTap: () => _playShow(context, ref, s, e),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        child: Row(
          children: [
            Text(
              e.episode.toString().padLeft(2, '0'),
              style: TextStyle(
                color: AppColors.onSurfaceVariant,
                fontFamily: 'JetBrains Mono',
                fontSize: 13,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('S${e.season} E${e.episode}',
                      style: AppTypography.bodyMd.copyWith(fontSize: 13)),
                  const SizedBox(height: 2),
                  Text(e.name,
                      style: TextStyle(color: AppColors.onSurfaceVariant, fontSize: 12),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis),
                ],
              ),
            ),
            if (resumed)
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: _chip(context, Icons.replay, 'Resume'),
              ),
            Icon(Icons.play_arrow, color: AppColors.primary, size: 22),
          ],
        ),
      ),
    );
  }

  Widget _chip(BuildContext context, IconData icon, String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: AppColors.primary.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: AppColors.primary),
          const SizedBox(width: 4),
          Text(label,
              style: const TextStyle(color: AppColors.primary, fontSize: 11)),
        ],
      ),
    );
  }

  Widget _emptyState(BuildContext context) {
    return Column(
      children: [
        const Icon(Icons.download_for_offline, size: 64, color: AppColors.onSurfaceVariant),
        const SizedBox(height: 16),
        Text('Nothing downloaded yet', style: AppTypography.bodyLg),
        const SizedBox(height: 8),
        const Text(
          'Download movies & shows to watch offline — available on Premium plans',
          textAlign: TextAlign.center,
          style: TextStyle(color: AppColors.onSurfaceVariant, fontSize: 13),
        ),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: () => context.go('/home'),
          style: FilledButton.styleFrom(backgroundColor: AppColors.primary),
          child: const Text('Browse'),
        ),
      ],
    );
  }

  Widget _offlineSuggestions(BuildContext context, WidgetRef ref, List<DownloadItem> movies) {
    if (movies.isEmpty) return const SizedBox.shrink();
    final shuffled = List<DownloadItem>.from(movies)
      ..shuffle(math.Random());
    final take = shuffled.take(4).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionTitle('Suggestions for you'),
        const SizedBox(height: 8),
        Text(
          'Pick another downloaded movie to watch',
          style: TextStyle(color: AppColors.onSurfaceVariant, fontSize: 12),
        ),
        const SizedBox(height: 12),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 12,
          crossAxisSpacing: 12,
          childAspectRatio: 1.3,
          children: take
              .map((m) => GestureDetector(
                    onTap: () => _playMovie(context, ref, m),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(8),
                            child: _backdropImage(m),
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(m.title,
                            style: const TextStyle(fontSize: 12),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis),
                      ],
                    ),
                  ))
              .toList(),
        ),
      ],
    );
  }

  Widget _backdropImage(DownloadItem m) {
    final url = m.backdrop ?? m.poster;
    if (url == null || url.isEmpty) {
      return Container(color: AppColors.surfaceContainerHighest, child: const Icon(Icons.movie));
    }
    return Image.network(url, fit: BoxFit.cover, errorBuilder: (_, __, ___) => Container(
      color: AppColors.surfaceContainerHighest,
      child: const Icon(Icons.movie),
    ));
  }

  void _playMovie(BuildContext context, WidgetRef ref, DownloadItem m) {
    context.push('/downloads/play', extra: OfflinePlayArgs(item: m, episode: null));
  }

  void _playShow(BuildContext context, WidgetRef ref, DownloadItem s, DownloadEpisode e) {
    context.push('/downloads/play', extra: OfflinePlayArgs(item: s, episode: e));
  }

  Future<void> _confirmDelete(BuildContext context, WidgetRef ref, DownloadItem item) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surfaceContainerHigh,
        title: const Text('Delete download?'),
        content: Text('Remove "${item.title}" from your device?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.error),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok == true) {
      await ref.read(downloadsProvider.notifier).remove(item);
    }
  }
}
