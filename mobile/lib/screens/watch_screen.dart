import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../core/config.dart';
import '../theme/app_colors.dart';
import '../models/media_item.dart';
import '../services/api_service.dart';
import '../providers/auth_provider.dart';
import '../providers/store_provider.dart';
import '../widgets/features/video_player.dart';

String resolveStreamUrl(String url) {
  final u = url.trim();
  if (u.isEmpty) return u;
  if (u.startsWith('http://') || u.startsWith('https://')) return u;
  if (u.startsWith('/')) {
    return Uri.parse(AppConfig.apiBaseUrl).origin + u;
  }
  return u;
}

final _watchDetailsProvider = FutureProvider.family<MediaItem?, int>((
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

final _tvSeasonProvider = FutureProvider.family<List<dynamic>, ({int id, int season})>((
  ref,
  args,
) async {
  final api = ref.read(apiServiceProvider);
  final res = await api.getTVSeason(args.id, args.season);
  final data = res.data['data'] as Map<String, dynamic>? ?? res.data as Map<String, dynamic>;
  return data['episodes'] as List? ?? [];
});

final _sourceProvider =
    FutureProvider.family<
      Map<String, dynamic>,
      ({int id, String type, int? season, int? episode})
    >((ref, args) async {
      final api = ref.read(apiServiceProvider);
      final res = await api.getStreamSource(
        args.id,
        args.type,
        season: args.season,
        episode: args.episode,
      );
      final data = res.data is Map<String, dynamic>
          ? (res.data['data'] as Map<String, dynamic>? ??
                res.data as Map<String, dynamic>)
          : <String, dynamic>{};
      if (data['success'] == false) {
        throw Exception(
          data['error'] as String? ?? 'Could not load video source',
        );
      }
      return data;
    });

class WatchScreen extends ConsumerStatefulWidget {
  final int? movieId;
  final String? mediaType;
  final String? streamUrl;
  final String? season;
  final String? episode;
  final String? resume;

  const WatchScreen({
    super.key,
    this.movieId,
    this.mediaType,
    this.streamUrl,
    this.season,
    this.episode,
    this.resume,
  });

  @override
  ConsumerState<WatchScreen> createState() => _WatchScreenState();
}

class _WatchScreenState extends ConsumerState<WatchScreen> {
  DateTime? _lastWatchRecord;
  bool _watchRecorded = false;
  double _duration = 0;
  double _lastPosition = 0;
  @override
  void initState() {
    super.initState();
    _enterFullscreen();
  }

  Future<void> _enterFullscreen() async {
    try {
      await SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
      await SystemChrome.setPreferredOrientations([
        DeviceOrientation.landscapeLeft,
        DeviceOrientation.landscapeRight,
      ]);
    } catch (_) {}
  }

  Future<void> _exitFullscreen() async {
    try {
      await SystemChrome.setPreferredOrientations([
        DeviceOrientation.portraitUp,
        DeviceOrientation.portraitDown,
      ]);
      await SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    } catch (_) {}
  }

  @override
  void dispose() {
    try {
      _recordFinalPosition();
    } catch (_) {}
    _exitFullscreen();
    super.dispose();
  }

  void _recordFinalPosition() {
    if (!mounted) return;
    AuthStatus authStatus;
    try {
      authStatus = ref.read(authProvider).status;
    } catch (_) {
      return;
    }
    final detail = ref.read(_watchDetailsProvider(widget.movieId ?? 0)).valueOrNull;
    final minutes = (_lastPosition / 60).round();
    final entry = {
      'contentId': widget.movieId,
      'title': detail?.title ?? '',
      'type': widget.mediaType ?? 'movie',
      'minutes': minutes,
      'positionSeconds': _lastPosition.round(),
      'durationSeconds': _duration.round(),
      'poster': detail?.posterUrl,
      if (widget.season != null) 'season': int.tryParse(widget.season!),
      if (widget.episode != null) 'episode': int.tryParse(widget.episode!),
    };
    if (_lastPosition <= 0) return;
    if (authStatus == AuthStatus.authenticated) {
      ref.read(apiServiceProvider).recordWatch(entry).then((_) {}, onError: (_) {});
    }
    ref.read(storeProvider.notifier).updateProgress(
      widget.movieId ?? 0,
      widget.mediaType ?? 'movie',
      _lastPosition,
    );
  }

  void _goBack() {
    _exitFullscreen();
    if (context.canPop()) {
      context.pop();
    } else if (widget.movieId != null) {
      context.go('/movie/${widget.movieId}');
    } else {
      context.go('/home');
    }
  }

  void _onPlaybackProgress(double progress) {
    _lastPosition = progress;
    final now = DateTime.now();
    if (_lastWatchRecord != null && now.difference(_lastWatchRecord!).inSeconds < 30) return;
    _lastWatchRecord = now;
    final api = ref.read(apiServiceProvider);
    final auth = ref.read(authProvider);
    final detail = ref.read(_watchDetailsProvider(widget.movieId ?? 0)).valueOrNull;
    final minutes = (progress / 60).round();
    if (minutes < 1 && _watchRecorded) return;
    _watchRecorded = true;
    final entry = {
      'contentId': widget.movieId,
      'title': detail?.title ?? '',
      'type': widget.mediaType ?? 'movie',
      'minutes': minutes,
      'positionSeconds': progress.round(),
      'durationSeconds': _duration.round(),
      'poster': detail?.posterUrl,
      if (widget.season != null) 'season': int.tryParse(widget.season!),
      if (widget.episode != null) 'episode': int.tryParse(widget.episode!),
    };
    if (auth.status == AuthStatus.authenticated) {
      api.recordWatch(entry).then((_) {}, onError: (_) {});
    }
    ref.read(storeProvider.notifier).addToContinueWatching(
      ContinueWatchingItem(
        id: widget.movieId ?? 0,
        title: detail?.title ?? '',
        poster: detail?.posterUrl,
        type: widget.mediaType ?? 'movie',
        season: int.tryParse(widget.season ?? ''),
        episode: int.tryParse(widget.episode ?? ''),
        progress: progress,
        duration: _duration,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (widget.movieId == null) {
      return Scaffold(
        backgroundColor: Colors.black,
        body: const Center(
          child: Text('No media selected', style: TextStyle(color: Colors.white)),
        ),
      );
    }

    final type = widget.mediaType ?? 'movie';
    final detail = ref.watch(_watchDetailsProvider(widget.movieId!));
    final source = ref.watch(
      _sourceProvider((
        id: widget.movieId!,
        type: type,
        season: int.tryParse(widget.season ?? ''),
        episode: int.tryParse(widget.episode ?? ''),
      )),
    );
    final authState = ref.watch(authProvider);
    // Tier matrix: ads on free/student (adFree=false); skip caps on free/student/basic
    final features = authState.user?.planFeatures ?? const {};
    final isFreeTier = !(features['adFree'] == true);
    final skipsCapped = !(features['unlimitedSkips'] == true);

    final episodeInfo = widget.episode != null
        ? 'S${widget.season} E${widget.episode}'
        : null;

    return PopScope(
      canPop: true,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _goBack();
      },
      child: Scaffold(
        backgroundColor: Colors.black,
        body: Stack(
          children: [
            Column(
              children: [
                Expanded(
                  child: source.when(
                    loading: () => const Center(
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        valueColor: AlwaysStoppedAnimation(AppColors.primary),
                      ),
                    ),
                    error: (e, _) => _buildError(friendlyErrorMessage(e)),
                    data: (src) {
                      final rawHeaders = src['headers'] as Map<String, dynamic>?;
                      final rawProxy = src['streamUrl'] as String? ?? '';
                      final rawDirect = src['directUrl'] as String? ?? '';
                      final mode = src['providerMode'] as String? ?? '';
                      final preferDirect = mode == 'direct' && rawDirect.isNotEmpty;
                      final primaryRaw = preferDirect ? rawDirect : rawProxy;
                      final fallbackRaw = preferDirect ? rawProxy : '';
                      var url = primaryRaw.isNotEmpty
                          ? resolveStreamUrl(primaryRaw)
                          : '';
                      if (url.isEmpty) {
                        url = resolveStreamUrl(
                          widget.streamUrl ?? src['streamUrl'] as String? ?? '',
                        );
                      }
                      if (url.isEmpty) {
                        return _buildError(
                          src['error'] as String? ?? 'Could not load video source',
                        );
                      }
                      final direct = rawDirect.isNotEmpty
                          ? resolveStreamUrl(rawDirect)
                          : null;
                      final directHeaders = rawHeaders?.map(
                        (k, v) => MapEntry(k, '$v'),
                      );
                      final fallbackUrl = fallbackRaw.isNotEmpty
                          ? resolveStreamUrl(fallbackRaw)
                          : null;
                      return Padding(
                        padding: const EdgeInsets.all(12),
                        child: Column(
                          children: [
                            VideoPlayer(
                              streamUrl: url,
                              httpHeaders: url == direct ? directHeaders : null,
                              errorReason: src['error'] as String?,
                              fallbackUrl: fallbackUrl == url ? null : fallbackUrl,
                              title: episodeInfo != null
                                  ? '${detail.valueOrNull?.title} - $episodeInfo'
                                  : detail.valueOrNull?.title,
                              isFreeTier: isFreeTier,
                              skipsCapped: skipsCapped,
                              onProgress: _onPlaybackProgress,
                              onDuration: (d) {
                                if (mounted) setState(() => _duration = d);
                              },
                              startPosition: double.tryParse(widget.resume ?? ''),
                            ),
                            const SizedBox(height: 12),
                            if (episodeInfo != null)
                              Text(
                                episodeInfo,
                                style: const TextStyle(color: AppColors.onSurfaceVariant),
                              ),
                          ],
                        ),
                      );
                    },
                  ),
                ),
              ],
            ),

            Positioned(
              top: 12,
              left: 12,
              child: SafeArea(
                child: IconButton(
                  onPressed: _goBack,
                  icon: const Icon(Icons.arrow_back, color: Colors.white, size: 28),
                  style: IconButton.styleFrom(
                    backgroundColor: Colors.black45,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildError(String message) {
    return Container(
      color: Colors.black,
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.info, color: Colors.redAccent, size: 48),
          const SizedBox(height: 12),
          const Text(
            'Stream unavailable',
            style: TextStyle(
              color: Colors.redAccent,
              fontWeight: FontWeight.bold,
              fontSize: 16,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            message,
            style: const TextStyle(color: Colors.white54),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 20),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              FilledButton(
                onPressed: _goBack,
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.primaryContainer,
                ),
                child: const Text('Go Back'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
