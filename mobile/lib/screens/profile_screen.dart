import 'dart:async';
import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import '../core/responsive.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';
import '../providers/auth_provider.dart';
import '../providers/store_provider.dart';
import '../providers/downloads_provider.dart';
import '../services/api_service.dart';
import '../services/ws_service.dart';
import '../widgets/ui/index.dart';
import '../widgets/features/download_progress_tile.dart';

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  Map<String, dynamic>? _stats;
  Map<String, dynamic>? _followStats;
  List<dynamic> _followers = [];
  List<dynamic> _following = [];
  List<dynamic> _achievements = [];
  Map<String, dynamic>? _gamification;
  List<dynamic> _continueWatching = [];
  List<dynamic> _watchlist = [];
  Map<String, dynamic> _equipped = {};
  bool _loading = true;
  bool _uploading = false;
  String? _error;
  Timer? _pollTimer;
  StreamSubscription? _wsSub;
  dynamic _wsChannel;

  bool get _isPremium {
    final plan = ref.read(authProvider).user?.plan ?? 'free';
    // fix isPremium check — parity with React: plan !== 'free' (not rank>=1 with free null)
    return plan != 'free' && plan.isNotEmpty;
  }

  @override
  void initState() {
    super.initState();
    _loadAll();
    _connectWs();
    _pollTimer = Timer.periodic(const Duration(seconds: 60), (_) => _refreshFollowStats());
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _wsSub?.cancel();
    try { _wsChannel?.sink.close(); } catch (_) {}
    super.dispose();
  }

  Future<void> _connectWs() async {
    try {
      _wsChannel = await WsService.connect('/ws');
      _wsSub = _wsChannel.stream.listen((raw) {
        try {
          final data = raw is String ? jsonDecode(raw) : raw;
          if (data is Map && (data['type'] == 'notification' || data['type'] == 'follow' || data['type'] == 'follow:update')) {
            _refreshFollowStats();
          }
          if (data is Map && data['type'] == 'settings:updated') {
            if (mounted) setState(() {});
          }
        } catch (_) {}
      }, onError: (_) {});
    } catch (_) {}
  }

  Future<void> _refreshFollowStats() async {
    final user = ref.read(authProvider).user;
    if (user == null) return;
    try {
      final api = ref.read(apiServiceProvider);
      final res = await api.getFollowStats(user.id);
      if (!mounted) return;
      final d = res.data as Map<String, dynamic>;
      if (d['success'] == true) {
        setState(() => _followStats = {'followers': d['followers'], 'following': d['following']});
      }
    } catch (_) {}
  }

  Future<void> _loadAll() async {
    setState(() { _loading = true; _error = null; });
    final user = ref.read(authProvider).user;
    if (user == null) { setState(() => _loading = false); return; }
    final api = ref.read(apiServiceProvider);
    try {
      // realtime data from db: getUserStats, getFollowStats, getFollowers, etc.
      final results = await Future.wait([
        api.getUserStats().catchError((e) => throw e),
        api.getFollowStats(user.id).catchError((e) => throw e),
        api.getWatchlist().catchError((_) => null),
        api.getContinueWatching().catchError((_) => null),
        api.getMyAchievements().catchError((_) => null),
        api.getCosmetics().catchError((_) => null),
      ], eagerError: false);
      final statsRes = results[0];
      final followRes = results[1];
      final watchlistRes = results[2];
      final cwRes = results[3];
      final achRes = results[4];
      final cosmRes = results[5];
      if (!mounted) return;
      setState(() {
        if (statsRes != null && statsRes.data is Map) {
          _stats = (statsRes.data['stats'] as Map<String, dynamic>?) ?? {};
        }
        if (followRes != null && followRes.data is Map && followRes.data['success'] == true) {
          _followStats = {'followers': followRes.data['followers'], 'following': followRes.data['following']};
        }
        if (watchlistRes != null && watchlistRes.data is Map) {
          final list = watchlistRes.data['watchlist'] ?? watchlistRes.data['items'] ?? [];
          _watchlist = List<dynamic>.from(list as List);
        }
        if (cwRes != null && cwRes.data is Map && cwRes.data['history'] is List) {
          _continueWatching = List<dynamic>.from(cwRes.data['history'] as List);
        }
        if (achRes != null && achRes.data is Map && achRes.data['data'] is List) {
          _achievements = List<dynamic>.from(achRes.data['data'] as List);
        } else if (achRes != null && achRes.data is Map && achRes.data['achievements'] is List) {
          _achievements = List<dynamic>.from(achRes.data['achievements'] as List);
        }
        if (cosmRes != null && cosmRes.data is Map && cosmRes.data['cosmetics'] is List) {
          final cosmetics = cosmRes.data['cosmetics'] as List;
          final equipped = cosmetics.where((c) => c is Map && c['owned'] == true && c['equipped'] == true).fold<Map<String,dynamic>>({}, (acc, c) {
            final kind = (c as Map)['kind']?.toString() ?? '';
            if (kind.isNotEmpty) acc[kind] = c;
            return acc;
          });
          _equipped = equipped;
        }
        // gamification from stats or separate call
        if (statsRes != null && statsRes.data is Map && statsRes.data['stats'] is Map) {
          // try getGamification via cosmetics endpoint fallback
        }
        _loading = false;
      });
      // also fetch gamification if available
      try {
        final g = await api.get('/achievements/mine');
        // alternative: use store
      } catch (_) {}
    } catch (e) {
      if (!mounted) return;
      setState(() { _error = friendlyErrorMessage(e); _loading = false; });
    }
  }

  Future<void> _pickAvatar() async {
    final picker = ImagePicker();
    final file = await picker.pickImage(source: ImageSource.gallery, maxWidth: 800, imageQuality: 85);
    if (file == null) return;
    setState(() => _uploading = true);
    try {
      final api = ref.read(apiServiceProvider);
      final form = FormData.fromMap({
        'avatar': await MultipartFile.fromFile(file.path, filename: file.name),
      });
      await api.uploadAvatar(form);
      await ref.read(authProvider.notifier).refreshUser();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Avatar updated')));
      setState(() {});
    } catch (e) {
      // fix bioexception bad response on update name/password — use friendlyErrorMessage
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(friendlyErrorMessage(e))));
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _openFollowers(String type) async {
    final user = ref.read(authProvider).user;
    if (user == null) return;
    final api = ref.read(apiServiceProvider);
    try {
      final res = type == 'followers' ? await api.getFollowers(user.id) : await api.getFollowing(user.id);
      final users = (res.data['users'] as List?) ?? [];
      if (!mounted) return;
      showModalBottomSheet(
        context: context,
        backgroundColor: AppColors.surfaceContainerHigh,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
        builder: (_) => SizedBox(
          height: 400,
          child: Column(
            children: [
              Padding(padding: const EdgeInsets.all(16), child: Text(type == 'followers' ? 'Followers' : 'Following', style: AppTypography.headlineSm)),
              Expanded(
                child: users.isEmpty
                    ? Center(child: Text('No ${type} yet', style: const TextStyle(color: AppColors.onSurfaceVariant)))
                    : ListView.builder(
                        itemCount: users.length,
                        itemBuilder: (_, i) {
                          final u = users[i] as Map;
                          return ListTile(
                            leading: CircleAvatar(backgroundImage: u['avatar'] != null ? NetworkImage(u['avatar'].toString()) : null, child: u['avatar'] == null ? const Icon(Icons.person) : null),
                            title: Text(u['name']?.toString() ?? 'User'),
                            trailing: AppButton(label: 'View', onPressed: () => context.push('/user/${u['id']}'), fullWidth: false, height: 32),
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(friendlyErrorMessage(e))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authProvider);
    final store = ref.watch(storeProvider);
    final user = authState.user;
    final canDownload = user != null && (user.planFeatures['downloadDevices'] as int? ?? 0) > 0;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Profile')),
      body: RefreshIndicator(
        onRefresh: _loadAll,
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 800),
            child: SingleChildScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Center(
                    child: Column(
                      children: [
                        Stack(
                          children: [
                            if (_equipped['avatar_frame'] != null)
                              Container(
                                padding: const EdgeInsets.all(3),
                                decoration: BoxDecoration(shape: BoxShape.circle, gradient: LinearGradient(colors: [AppColors.primaryContainer, AppColors.secondary])),
                                child: CircleAvatar(radius: 50, backgroundImage: user?.avatar != null ? NetworkImage(user!.avatar!) : null, backgroundColor: AppColors.surfaceContainerHighest, child: user?.avatar == null ? Icon(Icons.person, size: 50, color: AppColors.onSurfaceVariant) : null),
                              )
                            else
                              CircleAvatar(radius: 50, backgroundImage: user?.avatar != null ? NetworkImage(user!.avatar!) : null, backgroundColor: AppColors.surfaceContainerHighest, child: user?.avatar == null ? Icon(Icons.person, size: 50, color: AppColors.onSurfaceVariant) : null),
                            Positioned(
                              bottom: 0, right: 0,
                              child: InkWell(
                                onTap: _uploading ? null : _pickAvatar,
                                child: Container(
                                  width: 28, height: 28,
                                  decoration: BoxDecoration(color: AppColors.primaryContainer, shape: BoxShape.circle, border: Border.all(color: AppColors.background, width: 2)),
                                  child: _uploading ? const Padding(padding: EdgeInsets.all(6), child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.camera_alt, size: 14, color: AppColors.onPrimaryContainer),
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                          Text(user?.username ?? 'User', style: AppTypography.headlineMd),
                          if (_equipped['badge'] != null) ...[
                            const SizedBox(width: 8),
                            Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2), decoration: BoxDecoration(color: AppColors.primaryContainer.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(999)), child: Row(mainAxisSize: MainAxisSize.min, children: [const Icon(Icons.military_tech, size: 12, color: AppColors.primary), const SizedBox(width: 4), Text(_equipped['badge']['name']?.toString() ?? 'Badge', style: const TextStyle(fontSize: 11, color: AppColors.primary))])),
                          ],
                        ]),
                        if (_equipped['title'] != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text(_equipped['title']['name']?.toString() ?? '', style: const TextStyle(color: Color(0xFFFCD34D), fontSize: 13, fontWeight: FontWeight.w600))),
                        const SizedBox(height: 4),
                        Text(user?.email ?? '', style: AppTypography.bodyMd.copyWith(color: AppColors.onSurfaceVariant)),
                        if (user?.bio != null && user!.bio!.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(user.bio!, style: const TextStyle(color: AppColors.onSurfaceVariant, fontSize: 13), textAlign: TextAlign.center)),
                        const SizedBox(height: 8),
                        if (_isPremium)
                          const PremiumBadge()
                        else
                          AppButton(label: 'Upgrade to Premium', onPressed: () => context.push('/pricing'), fullWidth: false, height: 36),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),
                  if (_error != null) Padding(padding: const EdgeInsets.only(bottom: 12), child: Text(_error!, style: const TextStyle(color: AppColors.error))),
                  _section('Stats', [
                    _statCard(Icons.bookmark, 'Watchlist', '${_watchlist.isNotEmpty ? _watchlist.length : store.watchlist.length} items'),
                    _statCard(Icons.play_circle, 'Continue Watching', '${_continueWatching.isNotEmpty ? _continueWatching.length : store.continueWatching.length} items'),
                    if (_stats != null) _statCard(Icons.schedule, 'Minutes Watched', '${_stats!['minutesWatched'] ?? 0} min'),
                  ]),
                  const SizedBox(height: 16),
                  // Follow stats — realtime via WsService + poll
                  Row(
                    children: [
                      Expanded(child: InkWell(onTap: () => _openFollowers('followers'), child: _statCard(Icons.group, 'Followers', '${_followStats?['followers'] ?? '–'}'))),
                      const SizedBox(width: 12),
                      Expanded(child: InkWell(onTap: () => _openFollowers('following'), child: _statCard(Icons.person_add, 'Following', '${_followStats?['following'] ?? '–'}'))),
                    ],
                  ),
                  const SizedBox(height: 24),
                  // hide download menu if free — sidebar download visibility
                  if (canDownload) _downloadsPreview(context, ref) else _section('Downloads', [ListTile(leading: const Icon(Icons.lock, color: AppColors.onSurfaceVariant), title: const Text('Downloads — Premium only'), subtitle: const Text('Upgrade to enable offline downloads'), trailing: const Icon(Icons.chevron_right), onTap: () => context.push('/pricing'))]),
                  const SizedBox(height: 24),
                  // achievements — cosmetics
                  if (_loading && _achievements.isEmpty) const Center(child: Padding(padding: EdgeInsets.all(16), child: CircularProgressIndicator()))
                  else if (_achievements.isNotEmpty) ...[
                    Text('Achievements', style: AppTypography.headlineSm),
                    const SizedBox(height: 8),
                    GridView.builder(shrinkWrap: true, physics: const NeverScrollableScrollPhysics(), gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, childAspectRatio: 2.2, crossAxisSpacing: 8, mainAxisSpacing: 8), itemCount: _achievements.length, itemBuilder: (_, i) {
                      final a = _achievements[i] as Map;
                      final earned = a['earned_at'] != null;
                      return Container(decoration: BoxDecoration(color: AppColors.surfaceContainerHigh, borderRadius: BorderRadius.circular(12), border: Border.all(color: earned ? AppColors.primaryContainer.withValues(alpha: 0.3) : Colors.white.withValues(alpha: 0.05))), padding: const EdgeInsets.all(12), child: Row(children: [Icon(Icons.emoji_events, color: earned ? AppColors.primary : AppColors.onSurfaceVariant.withValues(alpha: 0.4)), const SizedBox(width: 8), Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [Text(a['name']?.toString() ?? 'Achievement', style: TextStyle(fontSize: 12, color: earned ? AppColors.onSurface : AppColors.onSurfaceVariant, fontWeight: FontWeight.w600), maxLines: 1, overflow: TextOverflow.ellipsis), Text(a['description']?.toString() ?? '', style: const TextStyle(fontSize: 10, color: AppColors.onSurfaceVariant), maxLines: 2, overflow: TextOverflow.ellipsis)]))]));
                    }),
                    const SizedBox(height: 24),
                  ],
                  _section('Quick Links', [
                    _linkTile(Icons.settings, 'Settings', () => context.push('/settings')),
                    _linkTile(Icons.bookmark, 'Watchlist', () => context.push('/watchlist')),
                    // hide download menu if free
                    if (canDownload) _linkTile(Icons.download, 'Downloads', () => context.push('/downloads')),
                    _linkTile(Icons.star, 'Pricing', () => context.push('/pricing')),
                  ]),
                  const SizedBox(height: 24),
                  if (user?.isCreator ?? false) ...[
                    _section('Creator Tools', [
                      _linkTile(Icons.dashboard, 'Dashboard', () => context.push('/creator')),
                      _linkTile(Icons.upload, 'Upload', () => context.push('/upload')),
                      _linkTile(Icons.store, 'Store', () => context.push('/store')),
                    ]),
                    const SizedBox(height: 24),
                  ],
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      onPressed: () async {
                        await ref.read(authProvider.notifier).logout();
                        if (context.mounted) context.go('/login');
                      },
                      style: OutlinedButton.styleFrom(foregroundColor: AppColors.error, side: const BorderSide(color: AppColors.error), padding: const EdgeInsets.symmetric(vertical: 14)),
                      child: const Text('Sign Out'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _section(String title, List<Widget> children) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(title, style: AppTypography.headlineSm), const SizedBox(height: 12), ...children]);
  }

  Widget _downloadsPreview(BuildContext context, WidgetRef ref) {
    final dlState = ref.watch(downloadsProvider);
    final items = dlState.items;
    final active = dlState.active;
    final tiles = <Widget>[];
    for (final a in active.take(3)) {
      tiles.add(GestureDetector(onTap: () => context.push('/downloads'), child: DownloadProgressTile(backdrop: a.backdrop, poster: a.poster, progress: a.fraction, active: true, size: 72)));
    }
    for (final m in items.take(3)) {
      tiles.add(GestureDetector(onTap: () => context.push('/downloads'), child: DownloadProgressTile(backdrop: m.backdrop, poster: m.poster, progress: m.progress, active: false, size: 72)));
    }
    if (tiles.isEmpty) {
      return _section('Downloads', [_linkTile(Icons.download, 'Your downloads', () => context.push('/downloads'))]);
    }
    return _section('Downloads', [
      Text(active.isNotEmpty ? '${active.length} downloading • ${items.length} saved' : '${items.length} saved for offline', style: AppTypography.bodySm.copyWith(color: AppColors.onSurfaceVariant)),
      const SizedBox(height: 12),
      Row(children: [for (var i = 0; i < tiles.length; i++) ...[if (i > 0) const SizedBox(width: 12), tiles[i]]]),
      const SizedBox(height: 8),
      _linkTile(Icons.open_in_new, 'Go to downloads', () => context.push('/downloads')),
    ]);
  }

  Widget _statCard(IconData icon, String label, String value) {
    return Container(
      padding: const EdgeInsets.all(16),
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(color: AppColors.surfaceContainerHigh, borderRadius: BorderRadius.circular(12)),
      child: Row(children: [Icon(icon, color: AppColors.primary, size: 24), const SizedBox(width: 12), Expanded(child: Text(label, style: AppTypography.bodyMd)), Text(value, style: AppTypography.bodyMd.copyWith(fontWeight: FontWeight.w600))]),
    );
  }

  Widget _linkTile(IconData icon, String label, VoidCallback onTap) {
    return ListTile(leading: Icon(icon, color: AppColors.primary), title: Text(label), trailing: const Icon(Icons.chevron_right, color: AppColors.onSurfaceVariant), onTap: onTap, dense: true);
  }
}
