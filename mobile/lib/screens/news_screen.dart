import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:intl/intl.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';
import '../services/api_service.dart';
import '../core/responsive.dart';
import '../widgets/ui/index.dart';

const _categories = [
  ('Movies', 'movies'),
  ('Entertainment', 'entertainment'),
  ('Technology', 'technology'),
  ('Business', 'business'),
  ('Sports', 'sports'),
  ('Top Stories', null),
];

final _categoryIndexProvider = StateProvider<int>((ref) => 0);
final _moviePillProvider = StateProvider<int>((ref) => 0);
final _newsQueryProvider = StateProvider<String>((ref) => '');

const _moviePills = ['Pursuits', 'Trailers', 'Premieres', 'Announced'];
const _movieQueries = ['', 'trailer', 'premiere', 'announced'];

const _pollInterval = Duration(seconds: 15);

final _articlesProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final api = ref.read(apiServiceProvider);
  final category = _categories[ref.watch(_categoryIndexProvider)].$2;
  final q = ref.watch(_newsQueryProvider);
  final res = await api.getNews(category: category, q: q.isEmpty ? null : q);
  final articles = res.data['articles'] as List? ?? [];
  return articles.cast<Map<String, dynamic>>();
});

final _moviesNewsProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final api = ref.read(apiServiceProvider);
  final q = _movieQueries[ref.watch(_moviePillProvider)];
  final res = await api.getNews(category: 'movies', q: q.isEmpty ? null : q);
  final articles = res.data['articles'] as List? ?? [];
  return articles.cast<Map<String, dynamic>>();
});

final _industryNewsProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final api = ref.read(apiServiceProvider);
  try {
    final res = await api.getIndustryNews();
    final articles = res.data['articles'] as List? ?? [];
    return articles.cast<Map<String, dynamic>>();
  } catch (_) {
    return [];
  }
});

class NewsScreen extends ConsumerStatefulWidget {
  final String? articleUrl;

  const NewsScreen({super.key, this.articleUrl});

  @override
  ConsumerState<NewsScreen> createState() => _NewsScreenState();
}

class _NewsScreenState extends ConsumerState<NewsScreen> {
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    if (widget.articleUrl == null) {
      _pollTimer = Timer.periodic(_pollInterval, (_) {
        if (!mounted) return;
        // Match React: background refresh every 15s, merge fresh articles.
        // Flutter equivalent: invalidate providers so fresh data streams in.
        ref.invalidate(_articlesProvider);
        ref.invalidate(_moviesNewsProvider);
        ref.invalidate(_industryNewsProvider);
      });
    }
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  Future<void> _refresh() async {
    ref.invalidate(_articlesProvider);
    ref.invalidate(_moviesNewsProvider);
    ref.invalidate(_industryNewsProvider);
    await Future.wait([
      ref.read(_articlesProvider.future).then((_) {}, onError: (Object _) {}),
      ref.read(_moviesNewsProvider.future).then((_) {}, onError: (Object _) {}),
      ref.read(_industryNewsProvider.future).then((_) {}, onError: (Object _) {}),
    ]);
  }

  String _formatDate(String? raw) {
    if (raw == null) return '';
    final dt = DateTime.tryParse(raw);
    if (dt == null) return '';
    return DateFormat('MMM d, yyyy').format(dt.toLocal());
  }

  String _relativeTime(String? raw) {
    if (raw == null || raw.isEmpty) return '';
    final dt = DateTime.tryParse(raw);
    if (dt == null) return '';
    final diff = DateTime.now().difference(dt.toLocal());
    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inHours < 1) return '${diff.inMinutes}m ago';
    if (diff.inDays < 1) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return _formatDate(raw);
  }

  @override
  Widget build(BuildContext context) {
    if (widget.articleUrl != null) {
      return _ArticleReader(articleUrl: widget.articleUrl!);
    }
    final articles = ref.watch(_articlesProvider);
    final movies = ref.watch(_moviesNewsProvider);
    final industry = ref.watch(_industryNewsProvider);
    final activeTab = ref.watch(_categoryIndexProvider);
    final moviePill = ref.watch(_moviePillProvider);
    final width = MediaQuery.of(context).size.width;
    final size = screenSizeFor(width);
    final hPadding = responsivePadding(width);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: EdgeInsets.fromLTRB(hPadding, size == ScreenSize.desktop ? 40 : 24, hPadding, 48),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 1280),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildHeader(context, ref),
                  const Divider(color: Colors.white10, height: 1),
                  const SizedBox(height: 16),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: _categories.asMap().entries.map((entry) {
                      final i = entry.key;
                      final active = i == activeTab;
                      return GestureDetector(
                        onTap: () => ref.read(_categoryIndexProvider.notifier).state = i,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                          decoration: BoxDecoration(
                            color: active ? AppColors.primaryContainer.withValues(alpha: 0.1) : Colors.transparent,
                            borderRadius: BorderRadius.circular(999),
                            border: Border.all(color: active ? AppColors.primary : Colors.white10),
                          ),
                          child: Text(
                            entry.value.$1,
                            style: AppTypography.labelSm.copyWith(
                              color: active ? AppColors.primary : AppColors.onSurfaceVariant,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 24),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        flex: 5,
                        child: movies.when(
                          data: (movieArticles) {
                            if (movieArticles.isEmpty) {
                              return const _EmptyNote(icon: Icons.movie, text: 'No movie articles right now.');
                            }
                            final feature = movieArticles.first;
                            final thumbs = movieArticles.skip(1).take(4).toList();
                            return Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Text('Movies', style: AppTypography.headlineMd),
                                    const Spacer(),
                                    Row(
                                      children: _moviePills.asMap().entries.map((e) {
                                        final i = e.key;
                                        final active = i == moviePill;
                                        return Padding(
                                          padding: const EdgeInsets.only(left: 8),
                                          child: GestureDetector(
                                            onTap: () => ref.read(_moviePillProvider.notifier).state = i,
                                            child: Container(
                                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                                              decoration: BoxDecoration(
                                                color: active ? AppColors.primaryContainer.withValues(alpha: 0.1) : Colors.transparent,
                                                borderRadius: BorderRadius.circular(999),
                                                border: Border.all(color: active ? AppColors.primary : Colors.white10),
                                              ),
                                              child: Text(
                                                e.value,
                                                style: AppTypography.labelSm.copyWith(
                                                  color: active ? AppColors.primary : AppColors.onSurfaceVariant,
                                                  fontWeight: FontWeight.w600,
                                                ),
                                              ),
                                            ),
                                          ),
                                        );
                                      }).toList(),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 16),
                                _NewsCard(
                                  article: feature,
                                  variant: _NewsCardVariant.feature,
                                  source: feature['source']?.toString() ?? '',
                                  publishedAt: _relativeTime(feature['publishedAt']?.toString()),
                                ),
                                const SizedBox(height: 16),
                                GridView.builder(
                                  shrinkWrap: true,
                                  physics: const NeverScrollableScrollPhysics(),
                                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                                    crossAxisCount: 2,
                                    crossAxisSpacing: 16,
                                    mainAxisSpacing: 16,
                                    childAspectRatio: 1.6,
                                  ),
                                  itemCount: thumbs.length,
                                  itemBuilder: (_, i) => _NewsCard(
                                    article: thumbs[i],
                                    variant: _NewsCardVariant.standard,
                                    source: thumbs[i]['source']?.toString() ?? '',
                                    publishedAt: _relativeTime(thumbs[i]['publishedAt']?.toString()),
                                  ),
                                ),
                              ],
                            );
                          },
                          loading: () => const SizedBox(height: 400, child: Center(child: LoadingSpinner())),
                          error: (e, _) => Padding(
                            padding: const EdgeInsets.symmetric(vertical: 24),
                            child: Text(friendlyErrorMessage(e), style: const TextStyle(color: AppColors.error)),
                          ),
                        ),
                      ),
                      const SizedBox(width: 24),
                      Expanded(
                        flex: 3,
                        child: articles.when(
                          data: (items) => items.isEmpty
                              ? const _EmptyNote(icon: Icons.feed, text: 'No articles found. Try a different category.')
                              : Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text('Latest News', style: AppTypography.headlineMd),
                                    const SizedBox(height: 16),
                                    ...items.take(6).map(
                                      (a) => _NewsCard(
                                        article: a,
                                        variant: _NewsCardVariant.row,
                                        source: a['source']?.toString() ?? '',
                                        publishedAt: _relativeTime(a['publishedAt']?.toString()),
                                      ),
                                    ),
                                  ],
                                ),
                          loading: () => const SizedBox(height: 400, child: Center(child: LoadingSpinner())),
                          error: (e, _) => Padding(
                            padding: const EdgeInsets.symmetric(vertical: 24),
                            child: Text(friendlyErrorMessage(e), style: const TextStyle(color: AppColors.error)),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 32),
                  const Divider(color: Colors.white10, height: 1),
                  const SizedBox(height: 16),
                  industry.when(
                    data: (items) {
                      if (items.isEmpty) return const SizedBox.shrink();
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Most Read', style: AppTypography.headlineMd),
                          const SizedBox(height: 8),
                          ...items.take(5).toList().asMap().entries.map(
                            (entry) => _NewsCard(
                              article: entry.value,
                              variant: _NewsCardVariant.row,
                              rank: entry.key + 1,
                              source: entry.value['source']?.toString() ?? '',
                              publishedAt: _relativeTime(entry.value['publishedAt']?.toString()),
                            ),
                          ),
                        ],
                      );
                    },
                    loading: () => const SizedBox.shrink(),
                    error: (_, _) => const SizedBox.shrink(),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildHeader(BuildContext context, WidgetRef ref) {
    final now = DateTime.now();
    final weekday = DateFormat('EEEE').format(now);
    final date = DateFormat('d MMM, yyyy').format(now);
    final headerSize = screenSizeFor(MediaQuery.of(context).size.width);
    final searchCtl = TextEditingController(text: ref.read(_newsQueryProvider));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(weekday, style: AppTypography.bodyMd.copyWith(color: AppColors.onSurface, fontWeight: FontWeight.w600)),
                Text(date, style: AppTypography.labelSm.copyWith(color: AppColors.onSurfaceVariant)),
              ],
            ),
            const SizedBox(width: 24),
            if (headerSize == ScreenSize.desktop)
              Expanded(
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: ['World', 'Politics', 'Business', 'Opinion', 'Tech', 'Science', 'Sports', 'Arts', 'Books', 'Style', 'Food', 'Travel', 'Magazine']
                        .map((nav) => Padding(padding: const EdgeInsets.symmetric(horizontal: 12), child: Text(nav, style: AppTypography.bodySm.copyWith(color: AppColors.onSurfaceVariant))))
                        .toList(),
                  ),
                ),
              ),
            const Spacer(),
            Flexible(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 280, minWidth: 180),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  decoration: BoxDecoration(color: AppColors.surfaceContainerHigh, border: Border.all(color: Colors.white10), borderRadius: BorderRadius.circular(12)),
                  child: Row(
                    children: [
                      const Icon(Icons.search, size: 18, color: AppColors.onSurfaceVariant),
                      const SizedBox(width: 8),
                      Expanded(
                        child: TextField(
                          controller: searchCtl,
                          style: const TextStyle(color: AppColors.onSurface, fontSize: 14),
                          decoration: const InputDecoration(hintText: 'Search movie news...', hintStyle: TextStyle(color: AppColors.onSurfaceVariant), border: InputBorder.none, isDense: true),
                          onSubmitted: (v) {
                            ref.read(_newsQueryProvider.notifier).state = v.trim();
                          },
                        ),
                      ),
                      ValueListenableBuilder<TextEditingValue>(
                        valueListenable: searchCtl,
                        builder: (_, val, __) => val.text.isNotEmpty
                            ? IconButton(
                                icon: const Icon(Icons.close, color: AppColors.onSurfaceVariant, size: 16),
                                onPressed: () {
                                  searchCtl.clear();
                                  ref.read(_newsQueryProvider.notifier).state = '';
                                },
                              )
                            : const SizedBox.shrink(),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(width: 12),
            InkWell(
              onTap: _refresh,
              child: Row(
                children: [
                  const Icon(Icons.refresh, size: 16, color: AppColors.onSurfaceVariant),
                  const SizedBox(width: 4),
                  Text('Refresh', style: AppTypography.labelSm.copyWith(color: AppColors.onSurfaceVariant)),
                  const SizedBox(width: 12),
                  Container(width: 8, height: 8, decoration: const BoxDecoration(color: AppColors.secondary, shape: BoxShape.circle)),
                  const SizedBox(width: 6),
                  Text('Live', style: AppTypography.labelSm.copyWith(color: AppColors.onSurfaceVariant)),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
      ],
    );
  }
}

enum _NewsCardVariant { feature, standard, row }

class _NewsCard extends StatelessWidget {
  final Map<String, dynamic> article;
  final _NewsCardVariant variant;
  final String source;
  final String publishedAt;
  final int? rank;

  const _NewsCard({required this.article, required this.variant, required this.source, required this.publishedAt, this.rank});

  @override
  Widget build(BuildContext context) {
    final url = article['url']?.toString() ?? '';
    final title = article['title']?.toString() ?? '';
    final description = article['description']?.toString();
    final imageUrl = article['image']?.toString();
    final hasImage = imageUrl != null && imageUrl.isNotEmpty;

    final meta = Row(
      children: [
        Text(source.toUpperCase(), style: const TextStyle(color: AppColors.primary, fontSize: 11, fontWeight: FontWeight.w600, letterSpacing: 0.5)),
        const SizedBox(width: 6),
        const Text('·', style: TextStyle(color: AppColors.onSurfaceVariant)),
        const SizedBox(width: 6),
        Text(publishedAt, style: const TextStyle(color: AppColors.onSurfaceVariant, fontSize: 11)),
      ],
    );

    if (variant == _NewsCardVariant.feature) {
      return GestureDetector(
        onTap: () => context.push('/news-article?url=${Uri.encodeComponent(url)}'),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              height: 200,
              width: double.infinity,
              decoration: BoxDecoration(color: AppColors.surfaceContainerHigh, borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.white.withValues(alpha: 0.05))),
              clipBehavior: Clip.antiAlias,
              child: hasImage ? CachedNetworkImage(imageUrl: imageUrl!, fit: BoxFit.cover, errorWidget: (_, _, _) => const _NewsFallback(size: 48)) : const _NewsFallback(size: 48),
            ),
            const SizedBox(height: 12),
            meta,
            const SizedBox(height: 8),
            Text(title, maxLines: 2, overflow: TextOverflow.ellipsis, style: AppTypography.bodyLg.copyWith(color: AppColors.onSurface, fontWeight: FontWeight.w700, height: 1.3)),
            if (description != null && description.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(description, maxLines: 3, overflow: TextOverflow.ellipsis, style: AppTypography.bodySm.copyWith(color: AppColors.onSurfaceVariant, height: 1.5)),
            ],
            const SizedBox(height: 8),
            const Text('CONTINUE READING', style: TextStyle(color: AppColors.primary, fontSize: 11, fontWeight: FontWeight.w600, letterSpacing: 1)),
          ],
        ),
      );
    }

    if (variant == _NewsCardVariant.standard) {
      return GestureDetector(
        onTap: () => context.push('/news-article?url=${Uri.encodeComponent(url)}'),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              height: 100,
              width: double.infinity,
              decoration: BoxDecoration(color: AppColors.surfaceContainerHigh, borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.white.withValues(alpha: 0.05))),
              clipBehavior: Clip.antiAlias,
              child: hasImage ? CachedNetworkImage(imageUrl: imageUrl!, fit: BoxFit.cover, errorWidget: (_, _, _) => const _NewsFallback(size: 32)) : const _NewsFallback(size: 32),
            ),
            const SizedBox(height: 8),
            meta,
            const SizedBox(height: 6),
            Text(title, maxLines: 2, overflow: TextOverflow.ellipsis, style: AppTypography.bodySm.copyWith(color: AppColors.onSurface, fontWeight: FontWeight.w600, height: 1.3)),
          ],
        ),
      );
    }

    return GestureDetector(
      onTap: () => context.push('/news-article?url=${Uri.encodeComponent(url)}'),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (rank != null) SizedBox(width: 28, child: Text('$rank', style: AppTypography.bodyLg.copyWith(color: AppColors.onSurfaceVariant, fontWeight: FontWeight.w800))),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  meta,
                  const SizedBox(height: 6),
                  Text(title, maxLines: 2, overflow: TextOverflow.ellipsis, style: AppTypography.bodySm.copyWith(color: AppColors.onSurface, fontWeight: FontWeight.w600, height: 1.3)),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Container(
              width: 96,
              height: 64,
              decoration: BoxDecoration(color: AppColors.surfaceContainerHigh, borderRadius: BorderRadius.circular(8), border: Border.all(color: Colors.white.withValues(alpha: 0.05))),
              clipBehavior: Clip.antiAlias,
              child: hasImage ? CachedNetworkImage(imageUrl: imageUrl!, fit: BoxFit.cover, errorWidget: (_, _, _) => const _NewsFallback(size: 24)) : const _NewsFallback(size: 24),
            ),
          ],
        ),
      ),
    );
  }
}

class _NewsFallback extends StatelessWidget {
  final double size;
  const _NewsFallback({this.size = 32});

  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppColors.surfaceContainer,
      child: Center(child: Icon(Icons.newspaper, size: size, color: AppColors.onSurfaceVariant.withValues(alpha: 0.5))),
    );
  }
}

class _EmptyNote extends StatelessWidget {
  final IconData icon;
  final String text;
  const _EmptyNote({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 40),
      child: Column(children: [Icon(icon, size: 40, color: AppColors.onSurfaceVariant.withValues(alpha: 0.3)), const SizedBox(height: 12), Text(text, style: AppTypography.bodySm.copyWith(color: AppColors.onSurfaceVariant))]),
    );
  }
}

class _ArticleReader extends ConsumerWidget {
  final String articleUrl;

  const _ArticleReader({required this.articleUrl});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final article = ref.watch(_articleProvider(articleUrl));

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Article')),
      body: article.when(
        loading: () => const LoadingSpinner(),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Text(friendlyErrorMessage(e), style: const TextStyle(color: AppColors.error), textAlign: TextAlign.center),
          ),
        ),
        data: (a) {
          if (a.isEmpty) {
            return const Center(child: Text('Article not found.', style: TextStyle(color: AppColors.onSurfaceVariant)));
          }
          final title = a['title']?.toString() ?? 'Untitled';
          final image = a['image']?.toString();
          final source = a['source']?.toString() ?? '';
          final publishedAt = a['publishedAt']?.toString();
          // Display full content without paid gate — matches React web which shows full article.
          final content = a['content']?.toString() ?? a['description']?.toString() ?? '';
          final paragraphs = a['paragraphs'] as List?;
          final hasParagraphs = paragraphs != null && paragraphs.isNotEmpty;

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              if (source.isNotEmpty)
                Row(children: [AppBadge(label: source.toUpperCase()), const Spacer(), Text(_timeAgo(publishedAt), style: const TextStyle(color: AppColors.onSurfaceVariant, fontSize: 12))]),
              const SizedBox(height: 12),
              Text(title, style: AppTypography.headlineMd),
              const SizedBox(height: 16),
              if (image != null && image.isNotEmpty)
                ClipRRect(borderRadius: BorderRadius.circular(12), child: CachedNetworkImage(imageUrl: image, height: 200, width: double.infinity, fit: BoxFit.cover, errorWidget: (_, _, _) => const SizedBox.shrink())),
              const SizedBox(height: 16),
              if (hasParagraphs)
                ...paragraphs.map((p) => Padding(padding: const EdgeInsets.only(bottom: 12), child: Text(p.toString(), style: AppTypography.bodyMd.copyWith(height: 1.6))))
              else
                Text(content, style: AppTypography.bodyMd.copyWith(height: 1.6)),
              const SizedBox(height: 24),
              Center(child: Text('Provided by $source · Curated for NovaFlix', style: const TextStyle(color: AppColors.onSurfaceVariant, fontSize: 11))),
            ],
          );
        },
      ),
    );
  }

  String _timeAgo(String? raw) {
    if (raw == null || raw.isEmpty) return '';
    final dt = DateTime.tryParse(raw);
    if (dt == null) return '';
    final diff = DateTime.now().difference(dt.toLocal());
    if (diff.inMinutes < 1) return 'now';
    if (diff.inHours < 1) return '${diff.inMinutes}m ago';
    if (diff.inDays < 1) return '${diff.inHours}h ago';
    return '${diff.inDays}d ago';
  }
}

final _articleProvider = FutureProvider.family<Map<String, dynamic>, String>((ref, url) async {
  final api = ref.read(apiServiceProvider);
  try {
    final res = await api.getNewsArticle(url);
    final data = res.data as Map<String, dynamic>;
    // Server returns {success, article} — if not found, data['article'] may be null & success false.
    // Do not throw 500; return empty map so UI shows friendly message.
    if (data['success'] == false && data['error'] != null) {
      // Let the UI surface the server error via empty + error handling is done via thrown DioException.
      // If server returned success:false without Dio error, treat as empty.
      return <String, dynamic>{};
    }
    return data['article'] as Map<String, dynamic>? ?? <String, dynamic>{};
  } on DioException catch (e) {
    // Re-throw to let AsyncValue.error carry DioException so friendlyErrorMessage can parse it.
    throw e;
  } catch (e) {
    // Wrap unknown errors as Dio-like for friendly message.
    throw DioException(requestOptions: RequestOptions(path: '/news/article'), error: e);
  }
});
