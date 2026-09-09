import 'dart:async';
import 'dart:convert';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import '../providers/auth_provider.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';
import '../services/api_service.dart';
import '../services/ws_service.dart';
import '../widgets/features/index.dart';
import '../widgets/ui/index.dart';

String? _sanitizeAvatar(dynamic v) {
  if (v == null) return null;
  final s = v.toString().trim();
  if (s.isEmpty || s.toLowerCase() == 'null') return null;
  return s;
}

final _communitiesProvider = FutureProvider.family<
  List<Map<String, dynamic>>,
  String?
>((ref, search) async {
  final api = ref.read(apiServiceProvider);
  final res = await api.getCommunities(search: search);
  final data = res.data['communities'] as List? ?? [];
  return data.cast<Map<String, dynamic>>();
});

final _myCommunitiesProvider = FutureProvider<List<Map<String, dynamic>>>((
  ref,
) async {
  final api = ref.read(apiServiceProvider);
  final res = await api.getMyCommunities();
  final data = res.data['communities'] as List? ?? res.data['items'] as List? ?? [];
  return data.cast<Map<String, dynamic>>();
});

final _myEggsProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final api = ref.read(apiServiceProvider);
  final res = await api.getMyEggs();
  final data = res.data['keys'] as List? ?? [];
  return data.cast<Map<String, dynamic>>();
});

final _trendingTakesProvider = FutureProvider<List<Map<String, dynamic>>>((
  ref,
) async {
  final api = ref.read(apiServiceProvider);
  final res = await api.getForumTopics(category: 'all', sort: 'new');
  final data = res.data['topics'] as List? ?? [];
  final topics = data.cast<Map<String, dynamic>>();
  topics.sort((a, b) {
    final sa = (a['upvotes'] as num? ?? 0) - (a['downvotes'] as num? ?? 0);
    final sb = (b['upvotes'] as num? ?? 0) - (b['downvotes'] as num? ?? 0);
    return sb.compareTo(sa);
  });
  return topics.take(3).toList();
});

final _communityDetailProvider = FutureProvider.family<
  ({Map<String, dynamic> community, bool isMember, List<Map<String, dynamic>> posts}),
  int
>((ref, id) async {
  final api = ref.read(apiServiceProvider);
  final res = await api.getCommunity(id);
  final data = res.data;
  final community =
      (data is Map ? data['community'] : null) as Map<String, dynamic>? ?? {};
  final isMember =
      (data is Map ? data['isMember'] : null) == true;
  final posts =
      ((data is Map ? data['posts'] : null) as List? ?? [])
          .cast<Map<String, dynamic>>();
  return (community: community, isMember: isMember, posts: posts);
});

class CommunityScreen extends ConsumerStatefulWidget {
  final int? communityId;

  const CommunityScreen({super.key, this.communityId});

  @override
  ConsumerState<CommunityScreen> createState() => _CommunityScreenState();
}

class _CommunityScreenState extends ConsumerState<CommunityScreen> {
  int _tab = 0;
  String _search = '';
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final id = widget.communityId;
    if (id != null) {
      return _CommunityDetailView(communityId: id);
    }
    return Scaffold(
      backgroundColor: AppColors.background,
      body: ListView(
        padding: EdgeInsets.zero,
        children: [
          _hero(),
          if (_tab != 2) _searchBox(),
          _body(),
        ],
      ),
    );
  }

  Widget _hero() {
    final user = ref.watch(authProvider).user;
    return Container(
      color: AppColors.surfaceContainer,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Community & Engagement', style: AppTypography.headlineMd),
                      const SizedBox(height: 4),
                      Text(
                        'Communities · Hot Takes · Debate',
                        style: AppTypography.bodySm.copyWith(
                          color: AppColors.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
                if (user?.isCreator == true)
                  _primaryButton('New Community', Icons.add, () async {
                    final created = await _openCreateModal();
                    if (created != null && context.mounted) {
                      context.push('/community/$created');
                    }
                  }),
              ],
            ),
            const SizedBox(height: 20),
            Container(
              padding: const EdgeInsets.all(2),
              decoration: BoxDecoration(
                color: AppColors.surfaceContainerHigh,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.white.withValues(alpha: 0.05)),
              ),
              child: Row(
                children: [
                  _tabItem(0, Icons.diversity_3, 'Communities'),
                  _tabItem(1, Icons.forum, 'Hot Takes', onTap: () {
                    context.push('/forum');
                  }),
                  _tabItem(2, Icons.key, 'My Keys'),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _tabItem(int index, IconData icon, String label, {VoidCallback? onTap}) {
    final active = _tab == index;
    return Expanded(
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onTap ??
            () => setState(() {
                  _tab = index;
                  if (index == 2) {
                    final auth = ref.read(authProvider);
                    if (auth.user == null) {
                      context.push('/login?redirect=/community');
                      return;
                    }
                  }
                }),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: active ? AppColors.primaryContainer : Colors.transparent,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 16, color: active ? AppColors.onPrimaryContainer : AppColors.onSurfaceVariant),
              const SizedBox(width: 6),
              Text(
                label,
                style: AppTypography.labelMd.copyWith(
                  color: active ? AppColors.onPrimaryContainer : AppColors.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _searchBox() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
      child: TextField(
        onSubmitted: (v) => setState(() {
          _query = v.trim();
          ref.invalidate(_communitiesProvider(_query));
        }),
        onChanged: (v) {
          if (_query.isNotEmpty && v.trim().isEmpty) {
            setState(() {
              _query = '';
              ref.invalidate(_communitiesProvider(''));
            });
          }
        },
        style: const TextStyle(color: AppColors.onSurface),
        decoration: InputDecoration(
          hintText: 'Search communities…',
          hintStyle: const TextStyle(color: AppColors.onSurfaceVariant),
          prefixIcon: const Icon(Icons.search, color: AppColors.onSurfaceVariant),
          filled: true,
          fillColor: AppColors.surfaceContainerHigh,
          contentPadding: const EdgeInsets.symmetric(vertical: 12),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide(
              color: AppColors.white.withValues(alpha: 0.1),
            ),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide(
              color: AppColors.white.withValues(alpha: 0.1),
            ),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: AppColors.primaryContainer),
          ),
        ),
      ),
    );
  }

  Widget _body() {
    if (_tab == 2) return _keysTab();
    return _communitiesTab();
  }

  Widget _keysTab() {
    final keys = ref.watch(_myEggsProvider);
    return Padding(
      padding: const EdgeInsets.all(16),
      child: keys.when(
        loading: () => const LoadingSpinner(),
        error: (e, _) => Center(
          child: Text(friendlyErrorMessage(e), style: const TextStyle(color: AppColors.error)),
        ),
        data: (items) => Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.vpn_key, size: 20, color: AppColors.primaryContainer),
                const SizedBox(width: 8),
                Text('My Digital Keys', style: AppTypography.headlineSm),
                const Spacer(),
                Text(
                  '${items.length} collected',
                  style: AppTypography.bodySm.copyWith(color: AppColors.onSurfaceVariant),
                ),
              ],
            ),
            const SizedBox(height: 16),
            if (items.isEmpty) _emptyKeys() else _keyGrid(items),
          ],
        ),
      ),
    );
  }

  Widget _emptyKeys() {
    return Container(
      padding: const EdgeInsets.all(40),
      decoration: BoxDecoration(
        color: AppColors.surfaceContainer,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.white.withValues(alpha: 0.05)),
      ),
      child: Column(
        children: [
          const Icon(Icons.key_off, size: 48, color: AppColors.onSurfaceVariant),
          const SizedBox(height: 12),
          Text('No keys yet', style: AppTypography.headlineSm),
          const SizedBox(height: 6),
          Text(
            'Hidden keys are waiting in movies — go hunt for them.',
            textAlign: TextAlign.center,
            style: AppTypography.bodyMd.copyWith(color: AppColors.onSurfaceVariant),
          ),
          const SizedBox(height: 16),
          OutlinedButton.icon(
            onPressed: () => context.go('/'),
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.primaryContainer,
              side: const BorderSide(color: AppColors.primaryContainer),
            ),
            icon: const Icon(Icons.arrow_forward, size: 18),
            label: const Text('Start Hunting'),
          ),
        ],
      ),
    );
  }

  Widget _keyGrid(List<Map<String, dynamic>> items) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final cols = gridColumnsForWidth(constraints.maxWidth).clamp(1, 3);
        return GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: cols,
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
            childAspectRatio: 1.4,
          ),
          itemCount: items.length,
          itemBuilder: (_, i) => _KeyCard(item: items[i]),
        );
      },
    );
  }

  Widget _communitiesTab() {
    final communities = ref.watch(_communitiesProvider(_query));
    final myCommunities = ref.watch(_myCommunitiesProvider);
    final trending = ref.watch(_trendingTakesProvider);
    return Padding(
      padding: const EdgeInsets.all(16),
      child: communities.when(
        loading: () => const LoadingSpinner(),
        error: (e, _) => Center(
          child: Text(friendlyErrorMessage(e), style: const TextStyle(color: AppColors.error)),
        ),
        data: (items) {
          final mine = myCommunities.value ?? <Map<String, dynamic>>[];
          final mineIds = mine.map((m) => '${m['id']}').toSet();
          final others = items.where((c) => !mineIds.contains('${c['id']}')).toList();
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (mine.isNotEmpty) ...[
                _sectionHeader(Icons.bookmark, 'My Communities'),
                _communityGrid(mine, joined: true),
                const SizedBox(height: 24),
              ],
              trending.when(
                data: (takes) => Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.local_fire_department, size: 20, color: AppColors.primaryContainer),
                        const SizedBox(width: 8),
                        Text('Trending Hot Takes', style: AppTypography.headlineSm),
                        const Spacer(),
                        OutlinedButton(
                          onPressed: () => context.push('/forum'),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: AppColors.primaryContainer,
                            side: const BorderSide(color: AppColors.primaryContainer),
                          ),
                          child: const Text('Start a Debate'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    _takesGrid(takes),
                    const SizedBox(height: 24),
                  ],
                ),
                loading: () => const SizedBox(
                  height: 120,
                  child: Center(child: LoadingSpinner(size: 24)),
                ),
                error: (e, _) => const SizedBox.shrink(),
              ),
              _sectionHeader(Icons.diversity_3, 'All Communities'),
              if (others.isEmpty)
                _emptyCommunities()
              else
                _communityGrid(others),
            ],
          );
        },
      ),
    );
  }

  Widget _sectionHeader(IconData icon, String title) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Icon(icon, size: 20, color: AppColors.primaryContainer),
          const SizedBox(width: 8),
          Text(title, style: AppTypography.headlineSm),
        ],
      ),
    );
  }

  Widget _communityGrid(List<Map<String, dynamic>> items, {bool joined = false}) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final cols = gridColumnsForWidth(constraints.maxWidth).clamp(1, 3);
        return GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: cols,
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
            childAspectRatio: 1.5,
          ),
      itemCount: items.length,
      itemBuilder: (_, i) {
        final item = items[i];
        final id = item['id'] is num
            ? (item['id'] as num).toInt()
            : int.tryParse(item['id'].toString()) ?? 0;
        return GestureDetector(
          onTap: () => context.push('/community/$id'),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: joined ? AppColors.surfaceContainerHigh : AppColors.surfaceContainer,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.white.withValues(alpha: 0.05)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    _avatarTile(_sanitizeAvatar(item['avatar']), 36),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            item['name']?.toString() ?? '',
                            style: AppTypography.labelMd.copyWith(color: AppColors.onSurface),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          if (item['member_count'] != null)
                            Text(
                              '${item['member_count']} members',
                              style: const TextStyle(color: AppColors.onSurfaceVariant, fontSize: 12),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Expanded(
                  child: Text(
                    item['description']?.toString() ?? '',
                    style: AppTypography.bodySm.copyWith(color: AppColors.onSurfaceVariant),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (item['creator_name'] != null)
                  Text(
                    'Created by ${item['creator_name']}',
                    style: const TextStyle(color: AppColors.onSurfaceVariant, fontSize: 11),
                  ),
              ],
            ),
          ),
        );
      },
        );
      },
    );
  }

  Widget _emptyCommunities() {
    return SizedBox(
      width: double.infinity,
      child: Column(
        children: [
          const SizedBox(height: 32),
          const Icon(Icons.diversity_3, size: 56, color: AppColors.onSurfaceVariant),
          const SizedBox(height: 12),
          Text('No communities found', style: AppTypography.bodyMd.copyWith(color: AppColors.onSurfaceVariant)),
          const SizedBox(height: 4),
          Text(
            'No communities yet. Create the first one!',
            style: AppTypography.bodySm.copyWith(color: AppColors.onSurfaceVariant),
          ),
        ],
      ),
    );
  }

  Widget _takesGrid(List<Map<String, dynamic>> takes) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final cols = gridColumnsForWidth(constraints.maxWidth).clamp(1, 3);
        return GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: cols,
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
            childAspectRatio: 1.6,
          ),
      itemCount: takes.length,
      itemBuilder: (_, i) {
        final t = takes[i];
        final id = t['id'] is num ? (t['id'] as num).toInt() : int.tryParse(t['id'].toString()) ?? 0;
        final up = t['upvotes'] as num? ?? 0;
        final down = t['downvotes'] as num? ?? 0;
        final net = up - down;
        return GestureDetector(
          onTap: () => context.push('/forum/$id'),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.surfaceContainerHigh,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.white.withValues(alpha: 0.05)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    if (t['category'] != null)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: AppColors.primary.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          t['category'].toString().toUpperCase(),
                          style: AppTypography.labelXs.copyWith(color: AppColors.primary),
                        ),
                      ),
                    const Spacer(),
                    const Icon(Icons.thumb_up, size: 14, color: AppColors.onSurfaceVariant),
                    const SizedBox(width: 2),
                    Text('$net', style: const TextStyle(color: AppColors.onSurfaceVariant, fontSize: 12)),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  t['title']?.toString() ?? '',
                  style: AppTypography.labelMd.copyWith(color: AppColors.onSurface),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const Spacer(),
                Row(
                  children: [
                    Text(
                      t['author_name']?.toString() ?? 'user',
                      style: const TextStyle(color: AppColors.onSurfaceVariant, fontSize: 12),
                      overflow: TextOverflow.ellipsis,
                    ),
                    const Spacer(),
                    Text(
                      '💬 ${t['reply_count'] ?? 0}',
                      style: const TextStyle(color: AppColors.onSurfaceVariant, fontSize: 12),
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
        );
      },
    );
  }

  Widget _avatarTile(String? avatar, double size) {
    final safe = _sanitizeAvatar(avatar);
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: AppColors.primaryContainer.withValues(alpha: 0.2),
        borderRadius: BorderRadius.circular(size * 0.35),
      ),
      clipBehavior: Clip.antiAlias,
      child: safe != null && safe.isNotEmpty
          ? CachedNetworkImage(
              imageUrl: safe,
              fit: BoxFit.cover,
              errorWidget: (_, _, _) => const Icon(Icons.diversity_3, color: AppColors.onSurfaceVariant),
            )
          : const Icon(Icons.diversity_3, color: AppColors.onSurfaceVariant),
    );
  }

  Widget _primaryButton(String label, IconData icon, VoidCallback onPressed) {
    return FilledButton.icon(
      onPressed: onPressed,
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.primaryContainer,
        foregroundColor: AppColors.onPrimaryContainer,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      ),
      icon: Icon(icon, size: 18),
      label: Text(label, style: AppTypography.labelMd),
    );
  }

  Future<int?> _openCreateModal() async {
    final nameCtl = TextEditingController();
    final descCtl = TextEditingController();
    final created = await showDialog<int>(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.6),
      builder: (ctx) => Dialog(
        backgroundColor: AppColors.surfaceContainerHigh,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: StatefulBuilder(
            builder: (ctx, setModalState) {
              return Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Create Community', style: AppTypography.headlineSm),
                  const SizedBox(height: 16),
                  TextField(
                    controller: nameCtl,
                    onChanged: (_) => setModalState(() {}),
                    style: const TextStyle(color: AppColors.onSurface),
                    decoration: const InputDecoration(
                      labelText: 'Name',
                      filled: true,
                      fillColor: AppColors.surfaceContainer,
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: descCtl,
                    minLines: 3,
                    maxLines: 5,
                    style: const TextStyle(color: AppColors.onSurface),
                    decoration: const InputDecoration(
                      labelText: 'Description (optional)',
                      filled: true,
                      fillColor: AppColors.surfaceContainer,
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      TextButton(
                        onPressed: () => Navigator.of(ctx).pop(),
                        child: const Text('Cancel', style: TextStyle(color: AppColors.onSurfaceVariant)),
                      ),
                      const SizedBox(width: 8),
                      FilledButton(
                        onPressed: nameCtl.text.trim().isEmpty
                            ? null
                            : () async {
                                try {
                                  final api = ref.read(apiServiceProvider);
                                  final res = await api.createCommunity({
                                    'name': nameCtl.text.trim(),
                                    'description': descCtl.text.trim(),
                                  });
                                  final community = res.data['community'] as Map<String, dynamic>?;
                                  final id = community?['id'];
                                  final idInt = id is num
                                      ? id.toInt()
                                      : int.tryParse(id.toString()) ?? 0;
                                  Navigator.of(ctx).pop(idInt);
                                  ref.invalidate(_communitiesProvider(_query));
                                  ref.invalidate(_myCommunitiesProvider);
                                } catch (e) {
                                  if (ctx.mounted) {
                                    ScaffoldMessenger.of(ctx).showSnackBar(
                                      SnackBar(content: Text('Failed to create: $e')),
                                    );
                                  }
                                }
                              },
                        style: FilledButton.styleFrom(
                          backgroundColor: AppColors.primaryContainer,
                          foregroundColor: AppColors.onPrimaryContainer,
                        ),
                        child: const Text('Create'),
                      ),
                    ],
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
    return created;
  }
}

class _KeyCard extends StatelessWidget {
  final Map<String, dynamic> item;

  const _KeyCard({required this.item});

  @override
  Widget build(BuildContext context) {
    final reward = item['reward'];
    final rewardType = reward is Map ? reward['type']?.toString() : null;
    final isSecretRoom = rewardType == 'secret_room';
    final contentId = item['contentId']?.toString() ?? item['content_id']?.toString() ?? '';
    final hint = item['hint']?.toString() ?? '';
    final foundAt = item['found_at']?.toString() ?? '';
    final secretRoom = item['secret_room'] == true;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.white.withValues(alpha: 0.05)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: AppColors.primaryContainer.withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.vpn_key, size: 18, color: AppColors.primaryContainer),
              ),
              const Spacer(),
              if (isSecretRoom)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    'Enter Room →',
                    style: AppTypography.labelXs.copyWith(color: AppColors.primary),
                  ),
                )
              else if (reward is Map)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    (reward['name']?.toString() ?? reward['icon']?.toString() ?? 'Reward'),
                    style: AppTypography.labelXs.copyWith(color: AppColors.primary),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 8),
          if (contentId.isNotEmpty)
            Text(
              contentId,
              style: AppTypography.labelMd.copyWith(color: AppColors.onSurface),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          if (hint.isNotEmpty)
            Text(
              hint,
              style: AppTypography.bodySm.copyWith(
                color: AppColors.onSurfaceVariant.withValues(alpha: 0.7),
                fontStyle: FontStyle.italic,
              ),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          const Spacer(),
          Text(
            foundAt.isNotEmpty
                ? 'Found at $foundAt${secretRoom ? ' · Secret Room unlocked' : ''}'
                : (secretRoom ? 'Secret Room unlocked' : ''),
            style: const TextStyle(color: AppColors.onSurfaceVariant, fontSize: 11),
          ),
        ],
      ),
    );
  }
}

class _CommunityDetailView extends ConsumerStatefulWidget {
  final int communityId;
  const _CommunityDetailView({required this.communityId});
  @override
  ConsumerState<_CommunityDetailView> createState() => _CommunityDetailViewState();
}

class _CommunityDetailViewState extends ConsumerState<_CommunityDetailView> {
  WebSocketChannel? _channel;
  StreamSubscription? _sub;
  Timer? _reconnectTimer;
  int _reconnectAttempts = 0;
  Timer? _typingTimer;
  final TextEditingController _draftCtl = TextEditingController();
  final ScrollController _scrollCtl = ScrollController();
  List<Map<String, dynamic>> _messages = [];
  String? _wsError;
  int _onlineCount = 0;
  Map<String, String> _typingUsers = {};
  bool _wsJoined = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _connectWs());
  }

  @override
  void didUpdateWidget(covariant _CommunityDetailView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.communityId != widget.communityId) {
      _disconnect();
      setState(() {
        _messages = [];
        _wsError = null;
        _onlineCount = 0;
        _typingUsers = {};
        _wsJoined = false;
      });
      _connectWs();
    }
  }

  @override
  void dispose() {
    _disconnect();
    _draftCtl.dispose();
    _scrollCtl.dispose();
    super.dispose();
  }

  void _disconnect() {
    _sub?.cancel();
    _sub = null;
    try { _channel?.sink.close(); } catch (_) {}
    _channel = null;
    _reconnectTimer?.cancel();
    _typingTimer?.cancel();
  }

  Future<void> _connectWs() async {
    _reconnectTimer?.cancel();
    setState(() => _wsError = null);
    try {
      final ch = await WsService.connect('/ws');
      if (!mounted) { try { ch.sink.close(); } catch (_) {} return; }
      _channel = ch;
      _reconnectAttempts = 0;
      final userName = ref.read(authProvider).user?.username ?? ref.read(authProvider).user?.username ?? 'Anonymous';
      ch.sink.add(jsonEncode({'type': 'community-join', 'payload': {'communityId': widget.communityId.toString()}, 'user': {'name': userName}}));
      _sub = ch.stream.listen((raw) {
        try {
          final data = jsonDecode(raw is String ? raw : raw.toString());
          if (data is! Map) return;
          final type = data['type']?.toString();
          if (type == 'chat-history') {
            final list = (data['messages'] as List? ?? []).map((e) => Map<String, dynamic>.from(e as Map)).toList();
            if (!mounted) return;
            setState(() => _messages = list);
            _scrollToBottom();
          } else if (type == 'community-joined') {
            final users = data['users'] as List? ?? [];
            if (!mounted) return;
            setState(() { _onlineCount = users.length; _wsJoined = true; _wsError = null; });
          } else if (type == 'user-joined') {
            final users = data['users'] as List? ?? [];
            if (!mounted) return;
            setState(() => _onlineCount = users.length);
          } else if (type == 'user-left') {
            final users = data['users'] as List? ?? [];
            final uid = data['userId']?.toString();
            if (!mounted) return;
            setState(() { _onlineCount = users.length; if (uid != null) _typingUsers.remove(uid); _typingUsers = Map.from(_typingUsers); });
          } else if (type == 'typing') {
            final uid = data['userId']?.toString();
            if (uid == null) return;
            final myId = ref.read(authProvider).user?.id;
            if (uid == myId) return;
            final isTyping = data['isTyping'] == true;
            if (!mounted) return;
            setState(() {
              if (isTyping) _typingUsers[uid] = data['name']?.toString() ?? 'Someone';
              else _typingUsers.remove(uid);
            });
            if (isTyping) {
              Future.delayed(const Duration(seconds: 4), () {
                if (mounted && _typingUsers.containsKey(uid)) setState(() => _typingUsers.remove(uid));
              });
            }
          } else if (type == 'chat') {
            final uid = data['userId']?.toString();
            if (uid != null && _typingUsers.containsKey(uid)) {
              if (mounted) setState(() => _typingUsers.remove(uid));
            }
            final msg = {
              'id': data['id']?.toString() ?? DateTime.now().millisecondsSinceEpoch.toString(),
              'userId': data['userId']?.toString() ?? '',
              'name': data['name']?.toString() ?? 'Anonymous',
              'message': data['message']?.toString() ?? '',
              'timestamp': data['timestamp'] ?? DateTime.now().millisecondsSinceEpoch,
            };
            if (!mounted) return;
            setState(() => _messages = [..._messages, msg]);
            _scrollToBottom();
          } else if (type == 'error') {
            if (!mounted) return;
            setState(() => _wsError = data['message']?.toString() ?? 'Chat unavailable');
            if ((data['code']?.toString() ?? '') == 'not-member') {
              setState(() => _onlineCount = 0);
            }
          }
        } catch (_) {}
      }, onDone: _scheduleReconnect, onError: (_) => _scheduleReconnect());
    } catch (_) {
      _scheduleReconnect();
    }
  }

  void _scheduleReconnect() {
    if (!mounted) return;
    _sub?.cancel(); _sub = null;
    try { _channel?.sink.close(); } catch (_) {}
    _channel = null;
    if (_reconnectAttempts > 10) return;
    final delayMs = (1000 * (1 << _reconnectAttempts)).clamp(1000, 10000);
    _reconnectAttempts++;
    _reconnectTimer = Timer(Duration(milliseconds: delayMs), () { if (mounted) _connectWs(); });
  }

  void _sendTyping(bool isTyping) {
    final ch = _channel; if (ch == null) return;
    try {
      final name = ref.read(authProvider).user?.username ?? 'Anonymous';
      ch.sink.add(jsonEncode({'type': 'community-typing', 'payload': {'isTyping': isTyping}, 'user': {'name': name}}));
    } catch (_) {}
  }

  void _onDraftChanged(String v) {
    if (v.trim().isEmpty) { _typingTimer?.cancel(); _sendTyping(false); return; }
    _sendTyping(true);
    _typingTimer?.cancel();
    _typingTimer = Timer(const Duration(seconds: 2), () => _sendTyping(false));
  }

  void _send() {
    final text = _draftCtl.text.trim();
    if (text.isEmpty || text.length > 2000) return;
    final ch = _channel; if (ch == null) return;
    try {
      final name = ref.read(authProvider).user?.username ?? 'Anonymous';
      ch.sink.add(jsonEncode({'type': 'community-chat', 'payload': {'message': text}, 'user': {'name': name}}));
      _typingTimer?.cancel(); _sendTyping(false); _draftCtl.clear(); setState(() {});
    } catch (_) {}
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scrollCtl.hasClients) return;
      _scrollCtl.animateTo(_scrollCtl.position.maxScrollExtent, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
    });
  }

  String _clock(int ts) {
    final dt = DateTime.fromMillisecondsSinceEpoch(ts).toLocal();
    final h = dt.hour % 12 == 0 ? 12 : dt.hour % 12;
    final ap = dt.hour < 12 ? 'AM' : 'PM';
    return '$h:${dt.minute.toString().padLeft(2,'0')} $ap';
  }

  @override
  Widget build(BuildContext context) {
    final detail = ref.watch(_communityDetailProvider(widget.communityId));
    return Scaffold(
      backgroundColor: AppColors.background,
      body: detail.when(
        loading: () => const LoadingSpinner(),
        error: (e, _) => Center(child: Text(friendlyErrorMessage(e), style: const TextStyle(color: AppColors.error))),
        data: (d) {
          final community = d.community;
          if (community.isEmpty) return const Center(child: Text('Community not found', style: TextStyle(color: AppColors.onSurfaceVariant)));
          final isMember = d.isMember;
          // creator is also considered member for chat
          final user = ref.watch(authProvider).user;
          final isCreator = user?.id.toString() == community['creator_id']?.toString() || community['creator_user_id']?.toString() == user?.id.toString();
          final canChat = isMember || isCreator || _wsJoined;
          return Column(children: [
            Expanded(child: CustomScrollView(slivers: [
              SliverToBoxAdapter(child: _detailHero(context: context, ref: ref, community: community, isMember: isMember, id: widget.communityId, onlineCount: _onlineCount)),
              if (!canChat)
                SliverToBoxAdapter(child: Padding(padding: const EdgeInsets.all(24), child: Column(children: [
                  const Icon(Icons.lock, size: 32, color: AppColors.onSurfaceVariant),
                  const SizedBox(height: 12),
                  Text(_wsError ?? 'Join this community to start chatting.', textAlign: TextAlign.center, style: AppTypography.bodyMd.copyWith(color: AppColors.onSurfaceVariant)),
                  const SizedBox(height: 16),
                  if (!isMember && !isCreator)
                    OutlinedButton(onPressed: () async {
                      final u = ref.read(authProvider).user;
                      if (u == null) { context.push('/login?redirect=/community/${widget.communityId}'); return; }
                      try { await ref.read(apiServiceProvider).joinCommunity(widget.communityId); ref.invalidate(_communityDetailProvider(widget.communityId)); _connectWs(); } catch (e) { if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(friendlyErrorMessage(e)))); }
                    }, style: OutlinedButton.styleFrom(foregroundColor: AppColors.primaryContainer, side: const BorderSide(color: AppColors.primaryContainer)), child: const Text('Join Community'))
                ])))
              else
                SliverToBoxAdapter(child: _chatSection(community)),
            ])),
            if (canChat) _inputBar(community),
          ]);
        },
      ),
    );
  }

  Widget _detailHero({required BuildContext context, required WidgetRef ref, required Map<String, dynamic> community, required bool isMember, required int id, required int onlineCount}) {
    final avatar = _sanitizeAvatar(community['avatar']);
    return Container(color: AppColors.surfaceContainer, child: Padding(padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      InkWell(onTap: () => context.pop(), child: Row(mainAxisSize: MainAxisSize.min, children: [const Icon(Icons.arrow_back, size: 18, color: AppColors.onSurfaceVariant), const SizedBox(width: 6), Text('Back to Communities', style: AppTypography.bodyMd.copyWith(color: AppColors.onSurfaceVariant))])),
      const SizedBox(height: 20),
      Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(width: 72, height: 72, decoration: BoxDecoration(color: AppColors.primaryContainer.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(16)), clipBehavior: Clip.antiAlias, child: avatar != null ? CachedNetworkImage(imageUrl: avatar, fit: BoxFit.cover, errorWidget: (_, _, _) => const Icon(Icons.diversity_3, size: 32, color: AppColors.onSurfaceVariant)) : const Icon(Icons.diversity_3, size: 32, color: AppColors.onSurfaceVariant)),
        const SizedBox(width: 20),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(community['name']?.toString() ?? '', style: AppTypography.headlineMd),
          const SizedBox(height: 6),
          Text(community['description']?.toString() ?? 'No description', style: AppTypography.bodyMd.copyWith(color: AppColors.onSurfaceVariant)),
          const SizedBox(height: 10),
          Wrap(spacing: 16, runSpacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
            _membersButton(context, ref, id, community),
            if (onlineCount > 0) Row(mainAxisSize: MainAxisSize.min, children: [
              Container(width: 8, height: 8, decoration: const BoxDecoration(color: Colors.green, shape: BoxShape.circle)),
              const SizedBox(width: 4),
              Text('$onlineCount online', style: AppTypography.bodySm.copyWith(color: AppColors.onSurfaceVariant)),
            ]),
            if (community['creator_name'] != null) Text('Created by ${community['creator_name']}', style: AppTypography.bodySm.copyWith(color: AppColors.onSurfaceVariant)),
            const SizedBox(width: 8),
            _joinButton(context, ref, id, isMember, community, onJoined: _connectWs),
          ]),
        ])),
      ]),
    ])));
  }

  Widget _membersButton(BuildContext context, WidgetRef ref, int id, Map<String, dynamic> community) {
    return InkWell(borderRadius: BorderRadius.circular(6), onTap: () async {
      try {
        final api = ref.read(apiServiceProvider);
        final res = await api.getCommunityMembers(id);
        final members = ((res.data['members'] as List?) ?? []).cast<Map<String, dynamic>>();
        if (!context.mounted) return;
        showDialog(context: context, barrierColor: Colors.black.withValues(alpha: 0.6), builder: (ctx) => Dialog(backgroundColor: AppColors.surfaceContainerHigh, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)), child: SizedBox(width: 360, child: Column(mainAxisSize: MainAxisSize.min, children: [
          Padding(padding: const EdgeInsets.all(16), child: Row(children: [Text('Members (${members.length})', style: AppTypography.headlineSm), const Spacer(), IconButton(onPressed: () => Navigator.of(ctx).pop(), icon: const Icon(Icons.close))])),
          Flexible(child: ListView.builder(shrinkWrap: true, itemCount: members.length, itemBuilder: (_, i) {
            final m = members[i]; final av = _sanitizeAvatar(m['avatar']);
            return ListTile(leading: CircleAvatar(backgroundColor: AppColors.primaryContainer.withValues(alpha: 0.2), backgroundImage: av != null ? NetworkImage(av) : null, child: av == null ? const Icon(Icons.person, size: 18, color: AppColors.onSurfaceVariant) : null), title: Text(m['name']?.toString() ?? 'User', style: AppTypography.labelMd.copyWith(color: AppColors.onSurface)));
          })),
        ]))));
      } catch (e) {
        if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(friendlyErrorMessage(e))));
      }
    }, child: Row(mainAxisSize: MainAxisSize.min, children: [const Icon(Icons.group, size: 16, color: AppColors.onSurfaceVariant), const SizedBox(width: 4), Text('${community['member_count'] ?? 0} members', style: AppTypography.bodySm.copyWith(color: AppColors.onSurfaceVariant))]));
  }

  Widget _joinButton(BuildContext context, WidgetRef ref, int id, bool isMember, Map<String, dynamic> community, {VoidCallback? onJoined}) {
    final user = ref.watch(authProvider).user;
    final isCreator = user?.id.toString() == community['creator_id']?.toString() || community['creator_user_id']?.toString() == user?.id.toString();
    if (isCreator) return const OutlinedButton(onPressed: null, child: Text("You're the creator"));
    if (isMember) return OutlinedButton(onPressed: () async { try { await ref.read(apiServiceProvider).leaveCommunity(id); ref.invalidate(_communityDetailProvider(id)); _disconnect(); setState(() { _messages = []; _onlineCount = 0; _wsJoined = false; }); } catch (e) { if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(friendlyErrorMessage(e)))); } }, style: OutlinedButton.styleFrom(foregroundColor: AppColors.error, side: const BorderSide(color: AppColors.error)), child: const Text('Leave'));
    return OutlinedButton(onPressed: () async { if (user == null) { context.push('/login?redirect=/community/$id'); return; } try { await ref.read(apiServiceProvider).joinCommunity(id); ref.invalidate(_communityDetailProvider(id)); onJoined?.call(); } catch (e) { if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(friendlyErrorMessage(e)))); } }, style: OutlinedButton.styleFrom(foregroundColor: AppColors.primaryContainer, side: const BorderSide(color: AppColors.primaryContainer)), child: const Text('Join'));
  }

  Widget _chatSection(Map<String, dynamic> community) {
    final myId = ref.watch(authProvider).user?.id;
    return Container(color: AppColors.background, child: Column(children: [
      if (_wsError != null) Container(width: double.infinity, padding: const EdgeInsets.all(8), color: AppColors.errorContainer, child: Text(_wsError!, style: const TextStyle(color: AppColors.error, fontSize: 12), textAlign: TextAlign.center)),
      SizedBox(height: 360, child: ListView.builder(controller: _scrollCtl, padding: const EdgeInsets.all(16), itemCount: _messages.isEmpty ? 1 : _messages.length, itemBuilder: (_, i) {
        if (_messages.isEmpty) return Padding(padding: const EdgeInsets.symmetric(vertical: 24), child: Center(child: Text('No messages yet — say hello 👋', style: AppTypography.bodyMd.copyWith(color: AppColors.onSurfaceVariant))));
        final m = _messages[i];
        final isMine = m['userId']?.toString() == myId;
        final ts = m['timestamp'] is num ? (m['timestamp'] as num).toInt() : int.tryParse(m['timestamp'].toString()) ?? DateTime.now().millisecondsSinceEpoch;
        if (isMine) {
          return Align(alignment: Alignment.centerRight, child: Container(margin: const EdgeInsets.only(bottom: 8), padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10), decoration: BoxDecoration(color: AppColors.primaryContainer, borderRadius: BorderRadius.circular(12)), child: Column(crossAxisAlignment: CrossAxisAlignment.end, children: [Text(m['message']?.toString() ?? '', style: const TextStyle(color: AppColors.onPrimaryContainer)), const SizedBox(height: 2), Text(_clock(ts), style: const TextStyle(color: AppColors.onPrimaryContainer, fontSize: 10))])));
        }
        return Align(alignment: Alignment.centerLeft, child: Container(margin: const EdgeInsets.only(bottom: 8), padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10), decoration: BoxDecoration(color: AppColors.surfaceContainerHigh, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.white.withValues(alpha: 0.05))), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(m['name']?.toString() ?? 'User', style: AppTypography.labelSm.copyWith(color: AppColors.primaryContainer)), const SizedBox(height: 2), Text(m['message']?.toString() ?? '', style: const TextStyle(color: AppColors.onSurface)), const SizedBox(height: 2), Text(_clock(ts), style: const TextStyle(color: AppColors.onSurfaceVariant, fontSize: 10))])) );
      })),
      if (_typingUsers.isNotEmpty) Padding(padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4), child: Align(alignment: Alignment.centerLeft, child: Text('${_typingUsers.values.join(', ')} ${_typingUsers.length == 1 ? 'is' : 'are'} typing…', style: const TextStyle(color: AppColors.onSurfaceVariant, fontSize: 12, fontStyle: FontStyle.italic)))),
    ]));
  }

  Widget _inputBar(Map<String, dynamic> community) {
    return Container(padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: AppColors.surfaceContainerHigh, border: Border(top: BorderSide(color: AppColors.white.withValues(alpha: 0.05)))), child: Row(children: [
      Expanded(child: TextField(controller: _draftCtl, onChanged: _onDraftChanged, minLines: 1, maxLines: 3, style: const TextStyle(color: AppColors.onSurface), decoration: InputDecoration(hintText: 'Send a message in ${community['name'] ?? 'community'}...', hintStyle: const TextStyle(color: AppColors.onSurfaceVariant), filled: true, fillColor: AppColors.surfaceContainer, border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)), contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10)), onSubmitted: (_) => _send())),
      const SizedBox(width: 8),
      FilledButton(onPressed: _send, style: FilledButton.styleFrom(backgroundColor: AppColors.primaryContainer, foregroundColor: AppColors.onPrimaryContainer), child: const Text('Send')),
    ]));
  }
}
