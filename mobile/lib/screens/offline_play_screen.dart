import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';
import '../providers/downloads_provider.dart';
import '../services/download_service.dart';
import '../widgets/ui/index.dart';

class OfflinePlayArgs {
  final DownloadItem item;
  final DownloadEpisode? episode;
  const OfflinePlayArgs({required this.item, this.episode});
}

class OfflinePlayScreen extends ConsumerStatefulWidget {
  const OfflinePlayScreen({super.key});

  @override
  ConsumerState<OfflinePlayScreen> createState() => _OfflinePlayScreenState();
}

class _OfflinePlayScreenState extends ConsumerState<OfflinePlayScreen> {
  final _player = Player();
  late final VideoController _controller;

  DownloadItem? _item;
  DownloadEpisode? _currentEp;
  File? _tempFile;
  bool _loading = true;
  String? _error;
  bool _ended = false;
  double _resumeFrom = 0;
  StreamSubscription? _posSub;
  StreamSubscription? _endedSub;
  Timer? _progressSaveTimer;

  @override
  void initState() {
    super.initState();
    _controller = VideoController(_player);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final args = GoRouterState.of(context).extra as OfflinePlayArgs?;
    if (args != null && _item == null) {
      _item = args.item;
      _currentEp = args.episode;
      _initPlayback();
    }
  }

  Future<void> _initPlayback() async {
    final item = _item!;
    final episode = _currentEp;
    final resumePos = episode?.progress ?? item.progress;
    setState(() {
      _loading = true;
      _error = null;
    });
    final service = ref.read(downloadServiceProvider);
    try {
      final tmp = await service.decryptToTemp(item, episode: episode);
      _tempFile = tmp;
      await _player.open(Media(tmp.path));
      // Wait a tick for duration to populate before seeking
      await Future.delayed(const Duration(milliseconds: 300));
      if (resumePos > 0.05 && resumePos < 0.95) {
        final dur = _player.state.duration.inMilliseconds;
        if (dur > 0) {
          await _player.seek(Duration(milliseconds: (resumePos * dur).round()));
        }
      }
      _subscribe();
      _startProgressSaver();
      if (mounted) setState(() => _loading = false);
    } catch (e) {
      if (mounted) setState(() {
        _error = 'Could not play this download: $e';
        _loading = false;
      });
    }
  }

  void _subscribe() {
    _posSub?.cancel();
    _posSub = _player.stream.position.listen((p) {
      if (!mounted) return;
      final t = p.inMilliseconds / 1000;
      final dur = _player.state.duration.inMilliseconds / 1000;
      if (dur > 0 && t >= dur - 2) {
        if (!_ended) {
          setState(() => _ended = true);
        }
      }
    });
  }

  void _startProgressSaver() {
    _progressSaveTimer?.cancel();
    _progressSaveTimer = Timer.periodic(const Duration(seconds: 10), (_) async {
      final item = _item;
      if (item == null) return;
      final pos = _player.state.position.inMilliseconds / 1000;
      final dur = _player.state.duration.inMilliseconds / 1000;
      if (dur <= 0) return;
      final fraction = (pos / dur).clamp(0.0, 1.0);
      final service = ref.read(downloadServiceProvider);
      if (item.isTv && _currentEp != null) {
        await service.updateEpisodeProgress(item.id, 'tv', _currentEp!.season, _currentEp!.episode,
            progress: fraction, duration: dur);
      } else {
        await service.updateItemProgress(item.id, item.type, progress: fraction, duration: dur);
      }
      ref.invalidate(downloadsProvider);
    });
  }

  void _switchEpisode(DownloadEpisode ep) async {
    final item = _item;
    if (item == null) return;
    await _cleanupTemp();
    setState(() {
      _currentEp = ep;
      _ended = false;
      _loading = true;
      _error = null;
    });
    final service = ref.read(downloadServiceProvider);
    try {
      final tmp = await service.decryptToTemp(item, episode: ep);
      _tempFile = tmp;
      await _player.open(Media(tmp.path));
      _subscribe();
      _startProgressSaver();
      if (mounted) setState(() => _loading = false);
    } catch (e) {
      if (mounted) setState(() {
        _error = 'Could not play episode: $e';
        _loading = false;
      });
    }
  }

  Future<void> _cleanupTemp() async {
    _posSub?.cancel();
    _progressSaveTimer?.cancel();
    final tmp = _tempFile;
    _tempFile = null;
    if (tmp != null && await tmp.exists()) {
      try {
        await tmp.delete();
      } catch (_) {}
    }
  }

  @override
  void dispose() {
    _posSub?.cancel();
    _progressSaveTimer?.cancel();
    _player.dispose();
    _cleanupTemp();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final item = _item;
    if (item == null) {
      return Scaffold(
        backgroundColor: Colors.black,
        appBar: AppBar(title: const Text('Play')),
        body: const Center(child: Text('Nothing to play', style: TextStyle(color: Colors.white))),
      );
    }

    final episode = _currentEp;
    final title = item.isTv
        ? '${item.title} — S${episode?.season ?? 1} E${episode?.episode ?? 1}'
        : item.title;

    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        leading: AppBackButton(),
        title: Text(title, style: const TextStyle(fontSize: 15)),
      ),
      body: Column(
        children: [
          Expanded(
            child: Center(
              child: _loading
                  ? const LoadingSpinner(size: 40)
                  : _error != null
                      ? _errorView()
                      : AspectRatio(
                          aspectRatio: 16 / 9,
                          child: Video(
                            controller: _controller,
                            controls: MaterialVideoControls,
                            wakelock: true,
                          ),
                        ),
            ),
          ),
          if (item.isTv) _episodeBar(item, episode),
          if (_ended) _endedOverlay(item),
        ],
      ),
    );
  }

  Widget _errorView() {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const Icon(Icons.error_outline, color: Colors.redAccent, size: 44),
        const SizedBox(height: 12),
        Text(_error!, style: const TextStyle(color: Colors.white54), textAlign: TextAlign.center),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _initPlayback,
          style: FilledButton.styleFrom(backgroundColor: AppColors.primary),
          child: const Text('Retry'),
        ),
      ],
    );
  }

  Widget _episodeBar(DownloadItem item, DownloadEpisode? current) {
    final sorted = List<DownloadEpisode>.from(item.episodes)
      ..sort((a, b) => a.episode.compareTo(b.episode));
    return Container(
      height: 72,
      color: AppColors.surfaceContainer,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        itemCount: sorted.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final ep = sorted[i];
          final active = current != null && ep.episode == current.episode;
          final resumed = ep.progress > 0 && ep.progress < 1;
          return GestureDetector(
            onTap: () => _switchEpisode(ep),
            child: Container(
              width: 64,
              decoration: BoxDecoration(
                color: active ? AppColors.primary : AppColors.surfaceContainerHigh,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                    color: active ? AppColors.primary : AppColors.outlineVariant),
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    resumed ? Icons.replay : Icons.play_arrow,
                    color: Colors.white,
                    size: 22,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'E${ep.episode}',
                    style: const TextStyle(color: Colors.white, fontSize: 11),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _endedOverlay(DownloadItem item) {
    return Container(
      color: AppColors.surfaceContainer,
      padding: const EdgeInsets.all(12),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          IconButton(
            icon: const Icon(Icons.replay, color: AppColors.primary, size: 30),
            onPressed: () {
              setState(() => _ended = false);
              _player.seek(Duration.zero);
              _player.play();
            },
          ),
          const SizedBox(width: 8),
          const Text('Replay', style: TextStyle(color: Colors.white)),
          const SizedBox(width: 16),
          FilledButton.icon(
            onPressed: () => context.go('/downloads'),
            style: FilledButton.styleFrom(backgroundColor: AppColors.primary),
            icon: const Icon(Icons.video_library, size: 18),
            label: const Text('More downloads'),
          ),
        ],
      ),
    );
  }
}
