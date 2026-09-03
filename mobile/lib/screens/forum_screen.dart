import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import '../providers/auth_provider.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';
import '../services/api_service.dart';
import '../services/ws_service.dart';
import '../widgets/ui/index.dart';

final _forumCategoriesProvider = FutureProvider<List<String>>((ref) async {
  final api = ref.read(apiServiceProvider);
  final res = await api.getForumCategories();
  final data = res.data['categories'] as List? ?? [];
  return data.cast<String>();
});

final _forumTopicProvider = FutureProvider.family<
  ({Map<String, dynamic> topic, List<Map<String, dynamic>> replies}),
  int
>((ref, id) async {
  final api = ref.read(apiServiceProvider);
  final res = await api.getForumTopic(id);
  final data = res.data is Map ? res.data : <String, dynamic>{};
  final topic = data['topic'] as Map<String, dynamic>? ?? {};
  final replies =
      (data['replies'] as List? ?? []).cast<Map<String, dynamic>>();
  return (topic: topic, replies: replies);
});

class ForumScreen extends ConsumerStatefulWidget {
  final int? topicId;

  const ForumScreen({super.key, this.topicId});

  @override
  ConsumerState<ForumScreen> createState() => _ForumScreenState();
}

class _ForumScreenState extends ConsumerState<ForumScreen> {
  static const _pageSize = 15;

  String? _selectedCategory;
  String _sort = 'new';
  bool _showNew = false;
  bool _loading = true;
  bool _loadingMore = false;
  bool _hasMore = true;
  String? _error;
  final List<Map<String, dynamic>> _topics = [];

  @override
  void initState() {
    super.initState();
    if (widget.topicId == null) _load(reset: true);
  }

  Future<void> _load({bool reset = false}) async {
    final offset = reset ? 0 : _topics.length;
    if (reset) {
      setState(() {
        _loading = true;
        _error = null;
        _hasMore = true;
      });
    } else {
      setState(() => _loadingMore = true);
    }
    try {
      final api = ref.read(apiServiceProvider);
      final res = await api.getForumTopics(
        category: _selectedCategory,
        sort: _sort,
        limit: _pageSize,
        offset: offset,
      );
      final data = res.data is Map ? res.data : <String, dynamic>{};
      final items =
          (data['topics'] as List? ?? []).cast<Map<String, dynamic>>();
      if (!mounted) return;
      setState(() {
        if (reset) {
          _topics
            ..clear()
            ..addAll(items);
        } else {
          for (final t in items) {
            if (!_topics.any((x) => '${x['id']}' == '${t['id']}')) {
              _topics.add(t);
            }
          }
        }
        _hasMore = items.length == _pageSize;
        _loading = false;
        _loadingMore = false;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _loadingMore = false;
        if (reset) _error = e.toString();
      });
    }
  }

  Future<void> _toggleVote(int id, int value) async {
    try {
      final api = ref.read(apiServiceProvider);
      await api.voteForumTopic(id, value);
      if (mounted) _load(reset: true);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Vote failed: $e')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final id = widget.topicId;
    return Scaffold(
      backgroundColor: AppColors.background,
      body: id != null ? _ThreadView(topicId: id) : _buildList(),
    );
  }

  Widget _buildList() {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      children: [
        _backLink('Community Hub', () => context.push('/community')),
        const SizedBox(height: 12),
        _header(),
        const SizedBox(height: 4),
        Text(
          'Controversial movie opinions — change my mind.',
          style: AppTypography.bodyMd.copyWith(color: AppColors.onSurfaceVariant),
        ),
        const SizedBox(height: 16),
        _browseBanner(),
        const SizedBox(height: 16),
        _filterStrip(),
        if (_showNew) ...[const SizedBox(height: 12), _composer()],
        const SizedBox(height: 16),
        if (_loading)
          const SizedBox(height: 24, child: LoadingSpinner())
        else if (_error != null)
          Center(
            child: Text(
              'Error: $_error',
              style: const TextStyle(color: AppColors.error),
            ),
          )
        else if (_topics.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 32),
            child: Center(
              child: Text(
                'No hot takes yet in this category. Start one!',
                style: TextStyle(color: AppColors.onSurfaceVariant),
              ),
            ),
          )
        else ...[
          ..._topics.map((t) => _TopicCard(topic: t, onVote: _toggleVote)),
          if (_loadingMore)
            const Padding(
              padding: EdgeInsets.all(12),
              child: Center(child: LoadingSpinner(size: 20)),
            )
          else if (_hasMore)
            Center(
              child: TextButton(
                onPressed: () => _load(),
                child: const Text(
                  'Load more',
                  style: TextStyle(color: AppColors.primaryContainer),
                ),
              ),
            )
          else
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 8),
              child: Center(
                child: Text(
                  "You've reached the end",
                  style: TextStyle(
                    color: AppColors.onSurfaceVariant,
                    fontSize: 12,
                  ),
                ),
              ),
            ),
        ],
      ],
    );
  }

  Widget _backLink(String label, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.arrow_back, size: 16, color: AppColors.onSurfaceVariant),
          const SizedBox(width: 4),
          Text(
            label,
            style: AppTypography.bodySm.copyWith(color: AppColors.onSurfaceVariant),
          ),
        ],
      ),
    );
  }

  Widget _header() {
    final user = ref.watch(authProvider).user;
    return Row(
      children: [
        const Icon(Icons.forum, size: 22, color: AppColors.primaryContainer),
        const SizedBox(width: 10),
        Expanded(
          child: Text('Hot Takes · Debate Forum', style: AppTypography.headlineMd),
        ),
        if (user != null)
          FilledButton.icon(
            onPressed: () => setState(() => _showNew = !_showNew),
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.primaryContainer,
              foregroundColor: AppColors.onPrimaryContainer,
              visualDensity: VisualDensity.compact,
            ),
            icon: const Icon(Icons.add, size: 18),
            label: const Text('New hot take'),
          ),
      ],
    );
  }

  Widget _browseBanner() {
    return Material(
      color: AppColors.surfaceContainerHigh,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => context.push('/community'),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.white.withValues(alpha: 0.05)),
          ),
          child: Row(
            children: [
              const Icon(Icons.diversity_3, size: 20, color: AppColors.primaryContainer),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Browse Communities →',
                  style: AppTypography.labelMd.copyWith(color: AppColors.onSurface),
                ),
              ),
              const Icon(Icons.arrow_forward, size: 18, color: AppColors.onSurfaceVariant),
            ],
          ),
        ),
      ),
    );
  }

  Widget _filterStrip() {
    final categories = ref.watch(_forumCategoriesProvider);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.all(2),
          decoration: BoxDecoration(
            color: AppColors.surfaceContainerHigh,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.white.withValues(alpha: 0.05)),
          ),
          child: Row(
            children: [
              _sortPill('Hot', _sort == 'hot', () {
                if (_sort != 'hot') {
                  setState(() => _sort = 'hot');
                  _load(reset: true);
                }
              }),
              _sortPill('New', _sort == 'new', () {
                if (_sort != 'new') {
                  setState(() => _sort = 'new');
                  _load(reset: true);
                }
              }),
            ],
          ),
        ),
        const SizedBox(height: 8),
        SizedBox(
          height: 38,
          child: categories.when(
            data: (cats) => ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: cats.length + 1,
              separatorBuilder: (_, __) => const SizedBox(width: 6),
              itemBuilder: (_, i) {
                if (i == 0) {
                  return _categoryPill('All', _selectedCategory == null, () {
                    if (_selectedCategory != null) {
                      setState(() => _selectedCategory = null);
                      _load(reset: true);
                    }
                  });
                }
                final cat = cats[i - 1];
                return _categoryPill(cat, _selectedCategory == cat, () {
                  if (_selectedCategory != cat) {
                    setState(() => _selectedCategory = cat);
                    _load(reset: true);
                  }
                });
              },
            ),
            loading: () => const SizedBox.shrink(),
            error: (e, _) => const SizedBox.shrink(),
          ),
        ),
      ],
    );
  }

  Widget _sortPill(String label, bool active, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 7),
        decoration: BoxDecoration(
          color: active ? AppColors.primaryContainer : Colors.transparent,
          borderRadius: BorderRadius.circular(9),
        ),
        child: Text(
          label,
          style: AppTypography.labelMd.copyWith(
            color: active ? AppColors.onPrimaryContainer : AppColors.onSurfaceVariant,
          ),
        ),
      ),
    );
  }

  Widget _categoryPill(String label, bool active, VoidCallback onTap) {
    final display = label == 'all' ? 'All' : _capitalize(label);
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
        decoration: BoxDecoration(
          color: active ? AppColors.primaryContainer : Colors.transparent,
          borderRadius: BorderRadius.circular(9),
        ),
        child: Text(
          display,
          style: AppTypography.labelSm.copyWith(
            color: active ? AppColors.onPrimaryContainer : AppColors.onSurfaceVariant,
          ),
        ),
      ),
    );
  }

  String _capitalize(String s) {
    if (s.isEmpty) return s;
    return s[0].toUpperCase() + s.substring(1);
  }

  Widget _composer() {
    final titleCtl = TextEditingController();
    final bodyCtl = TextEditingController();
    String? selectedCategory;
    final categories = ref.read(_forumCategoriesProvider).value ?? <String>[];
    return Consumer(
      builder: (context, ref, _) {
        return Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: AppColors.surfaceContainerHigh,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.white.withValues(alpha: 0.05)),
          ),
          child: StatefulBuilder(
            builder: (ctx, setLocal) {
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  TextField(
                    controller: titleCtl,
                    onChanged: (_) => setLocal(() {}),
                    style: const TextStyle(color: AppColors.onSurface),
                    decoration: _inputDeco('Unpopular opinion: …'),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: bodyCtl,
                    onChanged: (_) => setLocal(() {}),
                    minLines: 3,
                    maxLines: 5,
                    style: const TextStyle(color: AppColors.onSurface),
                    decoration: _inputDeco('Explain your take…'),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: DropdownButtonFormField<String>(
                          initialValue: selectedCategory,
                          dropdownColor: AppColors.surfaceContainerHigh,
                          items: (categories.isEmpty ? const ['General'] : categories)
                              .map(
                                (c) => DropdownMenuItem(
                                  value: c,
                                  child: Text(
                                    c,
                                    style: const TextStyle(color: AppColors.onSurface),
                                  ),
                                ),
                              )
                              .toList(),
                          onChanged: (v) => setLocal(() => selectedCategory = v),
                          decoration: _inputDeco('Category'),
                        ),
                      ),
                      const SizedBox(width: 8),
                      FilledButton(
                        onPressed: (titleCtl.text.trim().isEmpty ||
                                bodyCtl.text.trim().isEmpty)
                            ? null
                            : () async {
                                try {
                                  final api = ref.read(apiServiceProvider);
                                  final res = await api.createForumTopic({
                                    'title': titleCtl.text.trim(),
                                    'content': bodyCtl.text.trim(),
                                    'category': selectedCategory ??
                                        (categories.isEmpty
                                            ? 'General'
                                            : categories.first),
                                  });
                                  final topic =
                                      res.data['topic'] as Map<String, dynamic>?;
                                  final id = topic?['id'];
                                  final idInt = id is num
                                      ? id.toInt()
                                      : int.tryParse(id.toString());
                                  if (idInt != null && context.mounted) {
                                    context.push('/forum/$idInt');
                                  } else {
                                    setState(() => _showNew = false);
                                    _load(reset: true);
                                  }
                                } catch (e) {
                                  if (context.mounted) {
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      SnackBar(content: Text('Failed to post: $e')),
                                    );
                                  }
                                }
                              },
                        style: FilledButton.styleFrom(
                          backgroundColor: AppColors.primaryContainer,
                          foregroundColor: AppColors.onPrimaryContainer,
                          padding: const EdgeInsets.symmetric(
                            horizontal: 18,
                            vertical: 14,
                          ),
                        ),
                        child: const Text('Post'),
                      ),
                    ],
                  ),
                ],
              );
            },
          ),
        );
      },
    );
  }

  InputDecoration _inputDeco(String hint) {
    return InputDecoration(
      hintText: hint,
      hintStyle: const TextStyle(color: AppColors.onSurfaceVariant),
      filled: true,
      fillColor: AppColors.surfaceContainerLow,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(9),
        borderSide: BorderSide(color: AppColors.white.withValues(alpha: 0.1)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(9),
        borderSide: BorderSide(color: AppColors.white.withValues(alpha: 0.1)),
      ),
    );
  }
}

class _TopicCard extends ConsumerWidget {
  final Map<String, dynamic> topic;
  final Future<void> Function(int id, int value) onVote;

  const _TopicCard({required this.topic, required this.onVote});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final id = topic['id'] is num
        ? (topic['id'] as num).toInt()
        : int.tryParse(topic['id'].toString()) ?? 0;
    final up = topic['upvotes'] is num ? topic['upvotes'] as num : num.tryParse(topic['upvotes'].toString()) ?? 0;
    final down = topic['downvotes'] is num ? topic['downvotes'] as num : num.tryParse(topic['downvotes'].toString()) ?? 0;
    final net = up - down;
    final replyCount = topic['reply_count'] is num ? topic['reply_count'] as num : num.tryParse(topic['reply_count'].toString()) ?? 0;
    final userVote = topic['myVote'] is num ? topic['myVote'] as num : num.tryParse(topic['myVote'].toString()) ?? 0;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: AppColors.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.white.withValues(alpha: 0.05)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _voteRail(
            upVoted: userVote > 0,
            downVoted: userVote < 0,
            net: net,
            onUp: () => onVote(id, userVote > 0 ? 0 : 1),
            onDown: () => onVote(id, userVote < 0 ? 0 : -1),
          ),
          Expanded(
            child: InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: () => context.push('/forum/$id'),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        if (topic['category'] != null)
                          _categoryBadge(topic['category'].toString()),
                        const SizedBox(width: 8),
                        if (topic['created_at'] != null)
                          Text(
                            _relativeDate(topic['created_at']),
                            style: const TextStyle(
                              color: AppColors.onSurfaceVariant,
                              fontSize: 12,
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      topic['title']?.toString() ?? '',
                      style: AppTypography.labelMd.copyWith(color: AppColors.onSurface),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if ((topic['content'] ?? topic['body']) != null) ...[
                      const SizedBox(height: 4),
                      Text(
                        (topic['content'] ?? topic['body']).toString(),
                        style: AppTypography.bodySm.copyWith(
                          color: AppColors.onSurfaceVariant.withValues(alpha: 0.7),
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        _miniAvatar(topic['author_avatar']?.toString()),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            topic['author_name']?.toString() ?? 'user',
                            style: const TextStyle(
                              color: AppColors.onSurfaceVariant,
                              fontSize: 12,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        Text(
                          '💬 $replyCount',
                          style: const TextStyle(
                            color: AppColors.onSurfaceVariant,
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _categoryBadge(String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: AppColors.primary.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label.toUpperCase(),
        style: AppTypography.labelXs.copyWith(color: AppColors.primary),
      ),
    );
  }
}

Widget _voteRail({
  required bool upVoted,
  required bool downVoted,
  required num net,
  required VoidCallback onUp,
  required VoidCallback onDown,
}) {
  return Padding(
    padding: const EdgeInsets.only(left: 6, top: 10),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        IconButton(
          onPressed: onUp,
          visualDensity: VisualDensity.compact,
          padding: EdgeInsets.zero,
          constraints: const BoxConstraints(),
          icon: Icon(
            Icons.thumb_up,
            size: 16,
            color: upVoted
                ? AppColors.secondary
                : AppColors.onSurfaceVariant.withValues(alpha: 0.6),
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 2),
          child: Text(
            '${net is int ? net : net.toInt()}',
            style: AppTypography.labelXs.copyWith(color: AppColors.onSurfaceVariant),
          ),
        ),
        IconButton(
          onPressed: onDown,
          visualDensity: VisualDensity.compact,
          padding: EdgeInsets.zero,
          constraints: const BoxConstraints(),
          icon: Icon(
            Icons.thumb_down,
            size: 16,
            color: downVoted
                ? AppColors.error
                : AppColors.onSurfaceVariant.withValues(alpha: 0.6),
          ),
        ),
      ],
    ),
  );
}

Widget _miniAvatar(String? avatar) {
  return CircleAvatar(
    radius: 10,
    backgroundColor: AppColors.surfaceContainerHighest,
    backgroundImage: avatar != null && avatar.isNotEmpty
        ? NetworkImage(avatar)
        : null,
    child: avatar == null || avatar.isEmpty
        ? const Icon(Icons.person, size: 12, color: AppColors.onSurfaceVariant)
        : null,
  );
}

String _relativeDate(Object? t) {
  if (t == null) return '';
  final dt = t is num
      ? DateTime.fromMillisecondsSinceEpoch(t.toInt())
      : DateTime.tryParse(t.toString());
  if (dt == null) return '';
  final local = dt.toLocal();
  final diff = DateTime.now().difference(local);
  if (diff.inSeconds < 60) return 'just now';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
  if (diff.inHours < 24) return '${diff.inHours}h ago';
  if (diff.inDays < 7) return '${diff.inDays}d ago';
  return '${local.day}/${local.month}/${local.year}';
}

class _ThreadView extends ConsumerStatefulWidget {
  final int topicId;

  const _ThreadView({required this.topicId});

  @override
  ConsumerState<_ThreadView> createState() => _ThreadViewState();
}

class _ThreadViewState extends ConsumerState<_ThreadView> {
  int? _replyingTo;
  WebSocketChannel? _channel;
  StreamSubscription? _wsSub;

  @override
  void initState() {
    super.initState();
    _connectWs();
  }

  Future<void> _connectWs() async {
    try {
      final ch = await WsService.connect('/ws');
      _channel = ch;
      ch.sink.add(jsonEncode({'type': 'topic-join', 'payload': {'topicId': widget.topicId}}));
      _wsSub = ch.stream.listen((msg) {
        try {
          final data = jsonDecode(msg is String ? msg : msg.toString());
          if (data is Map && data['type'] == 'topic-reply' && '${data['topicId']}' == '${widget.topicId}') {
            if (mounted) ref.invalidate(_forumTopicProvider(widget.topicId));
          }
        } catch (_) {}
      });
    } catch (_) {}
  }

  @override
  void dispose() {
    _wsSub?.cancel();
    try { _channel?.sink.close(); } catch (_) {}
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final data = ref.watch(_forumTopicProvider(widget.topicId));
    return data.when(
      loading: () => const LoadingSpinner(),
      error: (e, _) => Center(
        child: Text('Error: $e', style: const TextStyle(color: AppColors.error)),
      ),
      data: (d) {
        final topic = d.topic;
        if (topic.isEmpty) {
          return const Center(
            child: Text(
              'Topic not found.',
              style: TextStyle(color: AppColors.onSurfaceVariant),
            ),
          );
        }
        final replies = d.replies;
        final roots = replies.where((r) => r['parent_id'] == null).toList();
        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
          children: [
            InkWell(
              onTap: () => context.pop(),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.arrow_back, size: 16, color: AppColors.onSurfaceVariant),
                  const SizedBox(width: 4),
                  Text(
                    'Back to hot takes',
                    style: AppTypography.bodySm.copyWith(color: AppColors.onSurfaceVariant),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            _ThreadTopicCard(
              topic: topic,
              replyCount: replies.length,
              onVote: _voteTopic,
            ),
            const SizedBox(height: 20),
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(
                'REPLIES (${replies.length})',
                style: AppTypography.labelSm.copyWith(
                  color: AppColors.onSurface,
                  letterSpacing: 2,
                ),
              ),
            ),
            if (replies.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 16),
                child: Center(
                  child: Text(
                    'No replies yet. Drop a hot take!',
                    style: TextStyle(color: AppColors.onSurfaceVariant),
                  ),
                ),
              )
            else
              ...roots.map(
                (r) => _ReplyNode(
                  reply: r,
                  all: replies,
                  depth: 0,
                  topicId: widget.topicId,
                  replyingTo: _replyingTo,
                  onReplyToggle: (id) => setState(
                    () => _replyingTo = _replyingTo == id ? null : id,
                  ),
                  onVote: _voteReply,
                ),
              ),
            const SizedBox(height: 16),
            _ThreadComposer(
              topicId: widget.topicId,
              replyingTo: _replyingTo,
              onCancelReply: () => setState(() => _replyingTo = null),
            ),
          ],
        );
      },
    );
  }

  Future<void> _voteTopic(int value) async {
    try {
      final api = ref.read(apiServiceProvider);
      await api.voteForumTopic(widget.topicId, value);
      ref.invalidate(_forumTopicProvider(widget.topicId));
    } catch (_) {}
  }

  Future<void> _voteReply(int replyId, int value) async {
    try {
      final api = ref.read(apiServiceProvider);
      await api.voteForumReply(replyId, value);
      ref.invalidate(_forumTopicProvider(widget.topicId));
    } catch (_) {}
  }
}

class _ThreadTopicCard extends ConsumerWidget {
  final Map<String, dynamic> topic;
  final int replyCount;
  final Future<void> Function(int value) onVote;

  const _ThreadTopicCard({
    required this.topic,
    required this.replyCount,
    required this.onVote,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final up = topic['upvotes'] as num? ?? 0;
    final down = topic['downvotes'] as num? ?? 0;
    final userVote = topic['myVote'] as num? ?? 0;
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.white.withValues(alpha: 0.05)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              if (topic['category'] != null)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    topic['category'].toString().toUpperCase(),
                    style: AppTypography.labelXs.copyWith(color: AppColors.primary),
                  ),
                ),
              const SizedBox(width: 8),
              if (topic['created_at'] != null)
                Flexible(
                  child: Text(
                    _relativeDate(topic['created_at']),
                    style: const TextStyle(
                      color: AppColors.onSurfaceVariant,
                      fontSize: 12,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              const Spacer(),
              _liveBadge(),
            ],
          ),
          const SizedBox(height: 10),
          Text(topic['title']?.toString() ?? '', style: AppTypography.headlineSm),
          const SizedBox(height: 10),
          Row(
            children: [
              _miniAvatar(topic['author_avatar']?.toString()),
              const SizedBox(width: 8),
              Text(
                topic['author_name']?.toString() ?? 'user',
                style: AppTypography.bodySm.copyWith(color: AppColors.onSurfaceVariant),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            (topic['content'] ?? topic['body'])?.toString() ?? '',
            style: AppTypography.bodyMd.copyWith(color: AppColors.onSurface, height: 1.5),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              _votePill(
                icon: Icons.thumb_up,
                count: up,
                color: AppColors.secondary,
                active: userVote > 0,
                onTap: () => onVote(userVote > 0 ? 0 : 1),
              ),
              const SizedBox(width: 8),
              _votePill(
                icon: Icons.thumb_down,
                count: down,
                color: AppColors.error,
                active: userVote < 0,
                onTap: () => onVote(userVote < 0 ? 0 : -1),
              ),
              const SizedBox(width: 10),
              Text(
                '💬 $replyCount replies',
                style: const TextStyle(
                  color: AppColors.onSurfaceVariant,
                  fontSize: 12,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _liveBadge() {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: const BoxDecoration(
            color: AppColors.secondary,
            shape: BoxShape.circle,
          ),
        ),
        const SizedBox(width: 6),
        const Text(
          'Live',
          style: TextStyle(color: AppColors.onSurfaceVariant, fontSize: 12),
        ),
      ],
    );
  }
}

Widget _votePill({
  required IconData icon,
  required num count,
  required Color color,
  required bool active,
  required VoidCallback onTap,
}) {
  return InkWell(
    borderRadius: BorderRadius.circular(8),
    onTap: onTap,
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: active ? color.withValues(alpha: 0.15) : Colors.transparent,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: active ? color : AppColors.white.withValues(alpha: 0.1),
        ),
      ),
      child: Row(
        children: [
          Icon(icon, size: 15, color: active ? color : AppColors.onSurfaceVariant),
          const SizedBox(width: 6),
          Text(
            '${count is int ? count : count.toInt()}',
            style: AppTypography.labelMd.copyWith(
              color: active ? color : AppColors.onSurfaceVariant,
            ),
          ),
        ],
      ),
    ),
  );
}

class _ReplyNode extends ConsumerWidget {
  final Map<String, dynamic> reply;
  final List<Map<String, dynamic>> all;
  final int depth;
  final int topicId;
  final int? replyingTo;
  final ValueChanged<int> onReplyToggle;
  final Future<void> Function(int replyId, int value) onVote;

  const _ReplyNode({
    required this.reply,
    required this.all,
    required this.depth,
    required this.topicId,
    required this.replyingTo,
    required this.onReplyToggle,
    required this.onVote,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final id = reply['id'] is num
        ? (reply['id'] as num).toInt()
        : int.tryParse(reply['id'].toString()) ?? 0;
    final children = all.where((r) => '${r['parent_id']}' == '$id').toList();
    final up = reply['upvotes'] as num? ?? 0;
    final down = reply['downvotes'] as num? ?? 0;
    final userVote = reply['myVote'] as num? ?? 0;
    final hasReplyComposer = replyingTo == id;

    final card = Container(
      margin: const EdgeInsets.only(bottom: 10),
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
              _miniAvatar(reply['author_avatar']?.toString()),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  reply['author_name']?.toString() ?? 'user',
                  style: AppTypography.bodySm.copyWith(
                    color: AppColors.onSurfaceVariant,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              if (depth > 0)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: AppColors.white.withValues(alpha: 0.05),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    '↳ reply',
                    style: const TextStyle(
                      color: AppColors.onSurfaceVariant,
                      fontSize: 10,
                    ),
                  ),
                ),
              if (reply['created_at'] != null) ...[
                const SizedBox(width: 8),
                Text(
                  _relativeDate(reply['created_at']),
                  style: const TextStyle(
                    color: AppColors.onSurfaceVariant,
                    fontSize: 11,
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 8),
          Text(
            reply['content']?.toString() ?? '',
            style: AppTypography.bodyMd.copyWith(color: AppColors.onSurface),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              InkWell(
                onTap: () => onVote(id, userVote > 0 ? 0 : 1),
                child: Padding(
                  padding: const EdgeInsets.all(6),
                  child: Icon(
                    Icons.thumb_up,
                    size: 15,
                    color: userVote > 0
                        ? AppColors.secondary
                        : AppColors.onSurfaceVariant,
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: Text(
                  '$up',
                  style: const TextStyle(
                    color: AppColors.onSurfaceVariant,
                    fontSize: 12,
                  ),
                ),
              ),
              InkWell(
                onTap: () => onVote(id, userVote < 0 ? 0 : -1),
                child: Padding(
                  padding: const EdgeInsets.all(6),
                  child: Icon(
                    Icons.thumb_down,
                    size: 15,
                    color: userVote < 0
                        ? AppColors.error
                        : AppColors.onSurfaceVariant,
                  ),
                ),
              ),
              Text(
                '${up - down}',
                style: const TextStyle(
                  color: AppColors.onSurfaceVariant,
                  fontSize: 12,
                ),
              ),
              const SizedBox(width: 8),
              InkWell(
                onTap: () => onReplyToggle(id),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
                  child: Text(
                    'Reply',
                    style: AppTypography.bodySm.copyWith(
                      color: AppColors.onSurfaceVariant,
                    ),
                  ),
                ),
              ),
            ],
          ),
          if (hasReplyComposer) ...[
            const SizedBox(height: 10),
            _InlineReplyComposer(
              topicId: topicId,
              parentId: id,
              onDone: () => onReplyToggle(id),
            ),
          ],
        ],
      ),
    );

    final indented = Padding(
      padding: EdgeInsets.only(left: (depth * 20).clamp(0, 80).toDouble()),
      child: card,
    );

    if (children.isEmpty) return indented;
    return Column(
      children: [
        indented,
        ...children.map(
          (c) => _ReplyNode(
            reply: c,
            all: all,
            depth: depth + 1,
            topicId: topicId,
            replyingTo: replyingTo,
            onReplyToggle: onReplyToggle,
            onVote: onVote,
          ),
        ),
      ],
    );
  }
}

class _InlineReplyComposer extends ConsumerStatefulWidget {
  final int topicId;
  final int parentId;
  final VoidCallback onDone;

  const _InlineReplyComposer({
    required this.topicId,
    required this.parentId,
    required this.onDone,
  });

  @override
  ConsumerState<_InlineReplyComposer> createState() => _InlineReplyComposerState();
}

class _InlineReplyComposerState extends ConsumerState<_InlineReplyComposer> {
  final _ctl = TextEditingController();
  bool _sending = false;

  @override
  void dispose() {
    _ctl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final text = _ctl.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    try {
      await ref.read(apiServiceProvider).addForumReply(
            widget.topicId,
            text,
            parentId: widget.parentId,
          );
      _ctl.clear();
      widget.onDone();
      ref.invalidate(_forumTopicProvider(widget.topicId));
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Reply failed: $e')));
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: TextField(
            controller: _ctl,
            style: const TextStyle(color: AppColors.onSurface),
            decoration: InputDecoration(
              hintText: 'Share your hot take…',
              hintStyle: const TextStyle(color: AppColors.onSurfaceVariant),
              filled: true,
              fillColor: AppColors.surfaceContainerLow,
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 12,
                vertical: 10,
              ),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(9),
                borderSide: BorderSide(
                  color: AppColors.white.withValues(alpha: 0.1),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(width: 8),
        IconButton(
          onPressed: _sending ? null : _submit,
          style: IconButton.styleFrom(
            backgroundColor: AppColors.primaryContainer,
            foregroundColor: AppColors.onPrimaryContainer,
          ),
          icon: _sending
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                )
              : const Icon(Icons.send, size: 18),
        ),
      ],
    );
  }
}

class _ThreadComposer extends ConsumerStatefulWidget {
  final int topicId;
  final int? replyingTo;
  final VoidCallback onCancelReply;

  const _ThreadComposer({
    required this.topicId,
    required this.replyingTo,
    required this.onCancelReply,
  });

  @override
  ConsumerState<_ThreadComposer> createState() => _ThreadComposerState();
}

class _ThreadComposerState extends ConsumerState<_ThreadComposer> {
  final _ctl = TextEditingController();
  bool _sending = false;

  @override
  void dispose() {
    _ctl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final text = _ctl.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    try {
      await ref.read(apiServiceProvider).addForumReply(
            widget.topicId,
            text,
            parentId: widget.replyingTo,
          );
      _ctl.clear();
      widget.onCancelReply();
      ref.invalidate(_forumTopicProvider(widget.topicId));
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Reply failed: $e')));
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    if (user == null) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 8),
        child: Center(
          child: Text(
            'Sign in to join the discussion',
            style: TextStyle(color: AppColors.onSurfaceVariant),
          ),
        ),
      );
    }
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
          if (widget.replyingTo != null) ...[
            Row(
              children: [
                Text(
                  'Replying to a comment',
                  style: AppTypography.labelSm.copyWith(
                    color: AppColors.onSurfaceVariant,
                  ),
                ),
                const SizedBox(width: 8),
                InkWell(
                  onTap: widget.onCancelReply,
                  child: Text(
                    '(cancel)',
                    style: AppTypography.labelSm.copyWith(
                      color: AppColors.primaryContainer,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
          ],
          TextField(
            controller: _ctl,
            minLines: 2,
            maxLines: 4,
            style: const TextStyle(color: AppColors.onSurface),
            decoration: InputDecoration(
              hintText: 'Share your hot take…',
              hintStyle: const TextStyle(color: AppColors.onSurfaceVariant),
              filled: true,
              fillColor: AppColors.surfaceContainerLow,
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 12,
                vertical: 10,
              ),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(9),
                borderSide: BorderSide(
                  color: AppColors.white.withValues(alpha: 0.1),
                ),
              ),
            ),
          ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerRight,
            child: FilledButton(
              onPressed: _sending ? null : _submit,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.primaryContainer,
                foregroundColor: AppColors.onPrimaryContainer,
              ),
              child: _sending
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Text('Post reply'),
            ),
          ),
        ],
      ),
    );
  }
}