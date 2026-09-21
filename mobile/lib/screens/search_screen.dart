import 'dart:async';
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
import '../widgets/ui/index.dart';
import '../widgets/features/index.dart';
import '../widgets/movie_card.dart';

final _suggestProvider = FutureProvider.family<List<MediaItem>, ({String query, String type})>((ref, params) async {
  final query = params.query;
  final type = params.type;
  if (query.isEmpty) return [];
  final api = ref.read(apiServiceProvider);
  try {
    final res = await api.searchMedia(query, type: type == 'tv' ? 'tv' : 'movie');
    final data = res.data['data'] as List? ?? [];
    return data.map((e) => MediaItem.fromJson(e as Map<String, dynamic>)).toList();
  } catch (_) {
    return [];
  }
});

final _searchResultsProvider = FutureProvider.family<List<MediaItem>, String>((ref, query) async {
  if (query.isEmpty) return [];
  final api = ref.read(apiServiceProvider);
  final res = await api.searchAll(query);
  final data = res.data['data'] as List? ?? [];
  return data.map((e) => MediaItem.fromJson(e as Map<String, dynamic>)).toList();
});

final _peopleResultsProvider = FutureProvider.family<List<Map<String, dynamic>>, String>((ref, query) async {
  if (query.isEmpty) return [];
  final api = ref.read(apiServiceProvider);
  final res = await api.searchPerson(query);
  final data = res.data['data'] as List? ?? [];
  return data.cast<Map<String, dynamic>>();
});

final _creatorResultsProvider = FutureProvider.family<List<Map<String, dynamic>>, String>((ref, query) async {
  if (query.isEmpty) return [];
  final api = ref.read(apiServiceProvider);
  final res = await api.searchCreators(query);
  final data = res.data['creators'] as List? ?? [];
  return data.cast<Map<String, dynamic>>();
});

final _categoryResultsProvider = FutureProvider.family<List<Map<String, dynamic>>, String>((ref, query) async {
  if (query.isEmpty) return [];
  final api = ref.read(apiServiceProvider);
  final res = await api.searchCategories(query);
  final data = res.data['categories'] as List? ?? [];
  return data.cast<Map<String, dynamic>>();
});

final _personCreditsProvider = FutureProvider.family<Map<String, dynamic>, int>((ref, id) async {
  final api = ref.read(apiServiceProvider);
  final res = await api.getPersonCredits(id);
  return res.data as Map<String, dynamic>? ?? {};
});

final _nowPlayingProvider = FutureProvider<List<MediaItem>>((ref) async {
  final api = ref.read(apiServiceProvider);
  final res = await api.getNowPlaying();
  final data = res.data['data'] as List? ?? res.data as List;
  return data.map((e) => MediaItem.fromJson(e as Map<String, dynamic>)).toList();
});

final _trendingProvider = FutureProvider<({List<MediaItem> movies, List<MediaItem> tv})>((ref) async {
  final api = ref.read(apiServiceProvider);
  final res = await api.getTrending();
  final data = res.data['data'] as Map<String, dynamic>? ?? res.data as Map<String, dynamic>;
  final movies = (data['movies'] as List?)?.map((e) => MediaItem.fromJson(e as Map<String, dynamic>)).toList() ?? <MediaItem>[];
  final tv = (data['tv'] as List?)?.map((e) => MediaItem.fromJson(e as Map<String, dynamic>)).toList() ?? <MediaItem>[];
  return (movies: movies, tv: tv);
});

final _genreProvider = FutureProvider.family<List<MediaItem>, int>((ref, genreId) async {
  final api = ref.read(apiServiceProvider);
  final res = await api.getCategoryMovies(genreId, type: 'movie');
  final data = res.data['data'] as List? ?? res.data as List;
  return data.map((e) => MediaItem.fromJson(e as Map<String, dynamic>)).toList();
});

final _popularTvProvider = FutureProvider<List<MediaItem>>((ref) async {
  final api = ref.read(apiServiceProvider);
  final res = await api.getDiscover(type: 'tv', sortBy: 'popularity.desc');
  final data = res.data['data'] as List? ?? res.data as List;
  return data.map((e) => MediaItem.fromJson(e as Map<String, dynamic>)).toList();
});

class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key});

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  final _searchCtl = TextEditingController();
  final _focusNode = FocusNode();
  String _query = '';
  String _type = 'movie';
  int? _selectedPersonId;
  bool _showSuggestions = false;
  Timer? _suggestDebounce;

  @override
  void dispose() {
    _searchCtl.dispose();
    _focusNode.dispose();
    _suggestDebounce?.cancel();
    super.dispose();
  }

  void _clear() {
    _searchCtl.clear();
    setState(() => _query = '');
    _focusNode.requestFocus();
  }

  void _runSearch(String q) {
    if (q.isEmpty) return;
    ref.read(storeProvider.notifier).addRecentSearch(q);
    setState(() => _query = q);
  }

  @override
  Widget build(BuildContext context) {
    final suggestions = ref.watch(_suggestProvider((query: _query.length > 0 ? _query : '', type: _type == 'tv' ? 'tv' : 'movie')));
    final results = ref.watch(_searchResultsProvider(_query));
    final store = ref.watch(storeProvider);
    final nowPlaying = ref.watch(_nowPlayingProvider);
    final trending = ref.watch(_trendingProvider);
    final actionMovies = ref.watch(_genreProvider(28));
    final comedyMovies = ref.watch(_genreProvider(35));
    final popularTv = ref.watch(_popularTvProvider);
    final width = MediaQuery.of(context).size.width;
    final size = screenSizeFor(width);
    final hPadding = responsivePadding(width);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(hPadding, size == ScreenSize.desktop ? 40 : 24, hPadding, 48),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 896),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Stack(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                      decoration: BoxDecoration(
                        color: AppColors.surfaceContainerHigh,
                        border: Border.all(color: AppColors.outline.withValues(alpha: 0.2)),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.search, color: AppColors.onSurfaceVariant),
                          const SizedBox(width: 12),
                          Expanded(
                            child: TextField(
                              controller: _searchCtl,
                              focusNode: _focusNode,
                              style: const TextStyle(color: AppColors.onSurface, fontSize: 16),
                              decoration: const InputDecoration(
                                hintText: 'Search movies, TV shows...',
                                hintStyle: TextStyle(color: AppColors.onSurfaceVariant),
                                border: InputBorder.none,
                                isDense: true,
                              ),
                              onChanged: (v) {
                                _suggestDebounce?.cancel();
                                _suggestDebounce = Timer(const Duration(milliseconds: 250), () {
                                  if (mounted) setState(() {});
                                });
                                setState(() => _showSuggestions = v.isNotEmpty);
                              },
                              onSubmitted: (v) => _runSearch(v.trim()),
                              onTap: () => setState(() => _showSuggestions = _searchCtl.text.isNotEmpty),
                            ),
                          ),
                          if (_searchCtl.text.isNotEmpty)
                            IconButton(
                              icon: const Icon(Icons.close, color: AppColors.onSurfaceVariant, size: 20),
                              onPressed: _clear,
                            ),
                        ],
                      ),
                    ),
                    if (_showSuggestions)
                      Positioned(
                        top: 56,
                        left: 0,
                        right: 0,
                        child: Material(
                          color: Colors.transparent,
                          child: suggestions.when(
                            data: (items) => items.isEmpty
                                ? const SizedBox.shrink()
                                : Container(
                                    decoration: BoxDecoration(
                                      color: AppColors.surfaceContainerHigh,
                                      border: Border.all(color: AppColors.outline.withValues(alpha: 0.2)),
                                      borderRadius: BorderRadius.circular(12),
                                      boxShadow: const [BoxShadow(color: Colors.black54, blurRadius: 24)],
                                    ),
                                    child: Column(
                                      children: items.take(5).map((item) {
                                        final type = item.mediaType == 'tv' ? 'TV Show' : 'Movie';
                                        return InkWell(
                                          onTap: () {
                                            _runSearch(_searchCtl.text.trim());
                                            setState(() => _showSuggestions = false);
                                            context.go('/${item.mediaType == 'tv' ? 'tv' : 'movie'}/${item.id}');
                                          },
                                          child: Padding(
                                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                                            child: Row(
                                              children: [
                                                ClipRRect(
                                                  borderRadius: BorderRadius.circular(4),
                                                  child: SizedBox(
                                                    width: 32,
                                                    height: 48,
                                                    child: item.posterPath != null
                                                        ? CachedNetworkImage(
                                                            imageUrl: item.posterPath!,
                                                            fit: BoxFit.cover,
                                                            errorWidget: (_, _, _) => Container(
                                                              color: AppColors.surfaceVariant,
                                                              child: const Icon(Icons.movie, color: AppColors.onSurfaceVariant, size: 16),
                                                            ),
                                                          )
                                                        : Container(
                                                            color: AppColors.surfaceVariant,
                                                            child: const Icon(Icons.movie, color: AppColors.onSurfaceVariant, size: 16),
                                                          ),
                                                  ),
                                                ),
                                                const SizedBox(width: 12),
                                                Expanded(
                                                  child: Column(
                                                    crossAxisAlignment: CrossAxisAlignment.start,
                                                    children: [
                                                      Text(item.title, style: AppTypography.bodyMd, maxLines: 1, overflow: TextOverflow.ellipsis),
                                                      const SizedBox(height: 2),
                                                      Text(type, style: AppTypography.labelSm.copyWith(color: AppColors.onSurfaceVariant)),
                                                    ],
                                                  ),
                                                ),
                                                const Icon(Icons.chevron_right, color: AppColors.onSurfaceVariant, size: 20),
                                              ],
                                            ),
                                          ),
                                        );
                                      }).toList(),
                                    ),
                                  ),
                            loading: () => const SizedBox.shrink(),
                            error: (_, _) => const SizedBox.shrink(),
                          ),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 24),
                AppTabs(
                  tabs: const ['Movies', 'TV Shows', 'People', 'Creators', 'Categories'],
                  activeIndex: _type == 'movie' ? 0 : _type == 'tv' ? 1 : _type == 'people' ? 2 : _type == 'creators' ? 3 : 4,
                  onChanged: (i) => setState(() {
                    _type = ['movie', 'tv', 'people', 'creators', 'categories'][i];
                    _selectedPersonId = null;
                  }),
                ),
                const SizedBox(height: 24),
                if (_query.isEmpty)
                  _buildRecentAndDiscover(store, nowPlaying, trending, actionMovies, comedyMovies, popularTv)
                else if (_type == 'people')
                  _buildPeopleResults()
                else if (_type == 'creators')
                  _buildCreatorResults()
                else if (_type == 'categories')
                  _buildCategoryResults()
                else
                  _buildResults(results),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildRecentAndDiscover(
    StoreState store,
    AsyncValue<List<MediaItem>> nowPlaying,
    AsyncValue<({List<MediaItem> movies, List<MediaItem> tv})> trending,
    AsyncValue<List<MediaItem>> actionMovies,
    AsyncValue<List<MediaItem>> comedyMovies,
    AsyncValue<List<MediaItem>> popularTv,
  ) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (store.recentlySearched.isNotEmpty) ...[
          Text('Recent Searches', style: AppTypography.labelMd.copyWith(color: AppColors.onSurfaceVariant)),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: store.recentlySearched.map((s) => GestureDetector(
              onTap: () {
                _searchCtl.text = s;
                _runSearch(s);
              },
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: AppColors.surfaceContainerHigh,
                  border: Border.all(color: AppColors.outline.withValues(alpha: 0.2)),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(s, style: AppTypography.bodySm.copyWith(color: AppColors.onSurfaceVariant)),
              ),
            )).toList(),
          ),
          const SizedBox(height: 40),
        ],
        const Divider(color: Colors.white10, height: 1),
        const SizedBox(height: 24),
        const Text('Discover', style: AppTypography.headlineMd),
        const SizedBox(height: 24),
        _discoverRow('Now Playing', nowPlaying, () => context.go('/discover?sort=trending')),
        _discoverRowTrending('Trending Movies', trending, (items) => items.movies, () => context.go('/discover?sort=trending')),
        _discoverRowTrending('Trending TV Shows', trending, (items) => items.tv, () => context.go('/tv-shows')),
        _discoverRow('Top Rated Movies', nowPlaying, () => context.go('/discover?sort=top_rated')),
        _discoverRow('Action Movies', actionMovies, () => context.go('/discover?sort=trending')),
        _discoverRow('Comedy Movies', comedyMovies, () => context.go('/discover?sort=trending')),
        _discoverRow('Popular TV Shows', popularTv, () => context.go('/tv-shows')),
      ],
    );
  }

  Widget _discoverRow(
    String title,
    AsyncValue<List<MediaItem>> items, [
    VoidCallback? onSeeAll,
  ]) {
    return items.when(
      data: (list) => _row(title, list, onSeeAll),
      loading: () => const SizedBox(height: 180, child: Center(child: LoadingSpinner(size: 28))),
      error: (_, _) => const SizedBox.shrink(),
    );
  }

  Widget _discoverRowTrending(
    String title,
    AsyncValue<({List<MediaItem> movies, List<MediaItem> tv})> items,
    List<MediaItem> Function(({List<MediaItem> movies, List<MediaItem> tv})) selector, [
    VoidCallback? onSeeAll,
  ]) {
    return items.when(
      data: (data) => _row(title, selector(data), onSeeAll),
      loading: () => const SizedBox(height: 180, child: Center(child: LoadingSpinner(size: 28))),
      error: (_, _) => const SizedBox.shrink(),
    );
  }

  Widget _row(String title, List<MediaItem> items, VoidCallback? onSeeAll) {
    if (items.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Row(
                  children: [
                    Flexible(child: Text(title, style: AppTypography.headlineSm, maxLines: 1, overflow: TextOverflow.ellipsis)),
                    const SizedBox(width: 6),
                    const Icon(Icons.chevron_right, color: AppColors.primary, size: 20),
                  ],
                ),
              ),
              if (onSeeAll != null)
                GestureDetector(
                  onTap: onSeeAll,
                  child: Text('View All', style: AppTypography.labelSm.copyWith(color: AppColors.primary)),
                ),
            ],
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 200,
            child: ListView.builder(
              scrollDirection: Axis.horizontal,
              itemCount: items.take(10).length,
              itemBuilder: (_, i) => Padding(
                padding: const EdgeInsets.only(right: 12),
                child: SizedBox(width: 130, child: MovieCard(item: items[i])),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPeopleResults() {
    final people = ref.watch(_peopleResultsProvider(_query));
    final selected = _selectedPersonId;
    if (selected != null) return _buildPersonCredits(selected);
    return people.when(
      data: (items) {
        if (items.isEmpty) return const _EmptySearch();
        final cols = gridColumns(MediaQuery.of(context).size.width);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(
                  '${items.length} person${items.length == 1 ? '' : 's'}',
                  style: AppTypography.bodySm.copyWith(color: AppColors.onSurfaceVariant),
                ),
                const Spacer(),
                const AppBadge(label: 'People'),
              ],
            ),
            const SizedBox(height: 16),
            LayoutBuilder(
              builder: (context, constraints) => GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: cols,
                  childAspectRatio: gridAspectRatio(MediaQuery.of(context).size.width, cols),
                  crossAxisSpacing: 16,
                  mainAxisSpacing: 16,
                ),
                itemCount: items.length,
                itemBuilder: (_, i) {
                  final p = items[i];
                  final id = int.tryParse('${p['id']}') ?? 0;
                  final name = p['name'] as String? ?? '';
                  final profile = p['profile_path'] as String?;
                  final dept = p['known_for_department'] as String? ?? '';
                  return GestureDetector(
                    onTap: () => setState(() => _selectedPersonId = id),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(12),
                          child: AspectRatio(
                            aspectRatio: 2 / 3,
                            child: profile != null
                                ? CachedNetworkImage(
                                    imageUrl: profile,
                                    fit: BoxFit.cover,
                                    errorWidget: (_, _, _) => Container(
                                      color: AppColors.surfaceContainer,
                                      child: const Icon(Icons.person, color: AppColors.onSurfaceVariant, size: 40),
                                    ),
                                  )
                                : Container(
                                    color: AppColors.surfaceContainer,
                                    child: const Icon(Icons.person, color: AppColors.onSurfaceVariant, size: 40),
                                  ),
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(name, style: AppTypography.labelMd.copyWith(color: AppColors.onSurface), maxLines: 1, overflow: TextOverflow.ellipsis),
                        if (dept.isNotEmpty) ...[
                          const SizedBox(height: 2),
                          Text(dept, style: AppTypography.bodySm.copyWith(color: AppColors.onSurfaceVariant), maxLines: 1, overflow: TextOverflow.ellipsis),
                        ],
                      ],
                    ),
                  );
                },
              ),
            ),
          ],
        );
      },
      loading: () => const SizedBox(height: 300, child: Center(child: LoadingSpinner())),
      error: (_, _) => const _EmptySearch(),
    );
  }

  Widget _buildPersonCredits(int personId) {
    final credits = ref.watch(_personCreditsProvider(personId));
    return credits.when(
      data: (data) {
        final name = data['name'] as String? ?? 'Person';
        final cast = (data['cast'] as List? ?? []).cast<Map<String, dynamic>>();
        final crew = (data['crew'] as List? ?? []).cast<Map<String, dynamic>>();
        final cols = gridColumns(MediaQuery.of(context).size.width);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                IconButton(
                  icon: const Icon(Icons.arrow_back, color: AppColors.onSurface),
                  onPressed: () => setState(() => _selectedPersonId = null),
                ),
                const SizedBox(width: 8),
                Expanded(child: Text(name, style: AppTypography.headlineMd, maxLines: 1, overflow: TextOverflow.ellipsis)),
              ],
            ),
            const SizedBox(height: 16),
            if (cast.isEmpty && crew.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 24),
                child: Text('No credits found.', style: TextStyle(color: AppColors.onSurfaceVariant)),
              )
            else ...[
              if (cast.isNotEmpty) ...[
                Text('Known For', style: AppTypography.labelMd.copyWith(color: AppColors.onSurfaceVariant)),
                const SizedBox(height: 12),
                LayoutBuilder(
                  builder: (context, constraints) => GridView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: cols,
                      childAspectRatio: gridAspectRatio(constraints.maxWidth, cols),
                      crossAxisSpacing: 16,
                      mainAxisSpacing: 16,
                    ),
                    itemCount: cast.length,
                    itemBuilder: (_, i) => MovieCard(item: MediaItem.fromJson(cast[i])),
                  ),
                ),
                const SizedBox(height: 24),
              ],
              if (crew.isNotEmpty) ...[
                Text('Crew', style: AppTypography.labelMd.copyWith(color: AppColors.onSurfaceVariant)),
                const SizedBox(height: 12),
                LayoutBuilder(
                  builder: (context, constraints) => GridView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: cols,
                      childAspectRatio: gridAspectRatio(constraints.maxWidth, cols),
                      crossAxisSpacing: 16,
                      mainAxisSpacing: 16,
                    ),
                    itemCount: crew.length,
                    itemBuilder: (_, i) => MovieCard(item: MediaItem.fromJson(crew[i])),
                  ),
                ),
              ],
            ],
          ],
        );
      },
      loading: () => const SizedBox(height: 300, child: Center(child: LoadingSpinner())),
      error: (_, _) => const _EmptySearch(),
    );
  }

  Widget _buildResults(AsyncValue<List<MediaItem>> results) {
    return results.when(
      data: (items) {
        final filtered = items.where((e) {
          if (_type == 'movie') return e.mediaType != 'tv';
          return e.mediaType == 'tv';
        }).toList();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(
                  '${filtered.length} result${filtered.length == 1 ? '' : 's'}',
                  style: AppTypography.bodySm.copyWith(color: AppColors.onSurfaceVariant),
                ),
                const Spacer(),
                AppBadge(label: _type == 'movie' ? 'Movies' : 'TV Shows'),
              ],
            ),
            const SizedBox(height: 16),
            if (filtered.isEmpty)
              const _EmptySearch()
            else
              LayoutBuilder(
                builder: (context, constraints) => GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: gridColumns(constraints.maxWidth),
                    childAspectRatio: gridAspectRatio(constraints.maxWidth, gridColumns(constraints.maxWidth)),
                    crossAxisSpacing: 16,
                    mainAxisSpacing: 16,
                  ),
                  itemCount: filtered.length,
                  itemBuilder: (_, i) => MovieCard(item: filtered[i]),
                ),
              ),
          ],
        );
      },
      loading: () => const SizedBox(height: 300, child: Center(child: LoadingSpinner())),
      error: (e, _) => const _EmptySearch(),
    );
  }

  Widget _buildCreatorResults() {
    final creators = ref.watch(_creatorResultsProvider(_query));
    return creators.when(
      data: (items) {
        if (items.isEmpty) return const _EmptySearch();
        final cols = gridColumns(MediaQuery.of(context).size.width);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(
                  '${items.length} creator${items.length == 1 ? '' : 's'}',
                  style: AppTypography.bodySm.copyWith(color: AppColors.onSurfaceVariant),
                ),
                const Spacer(),
                const AppBadge(label: 'Creators'),
              ],
            ),
            const SizedBox(height: 16),
            LayoutBuilder(
              builder: (context, constraints) => GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: cols,
                  childAspectRatio: gridAspectRatio(MediaQuery.of(context).size.width, cols),
                  crossAxisSpacing: 16,
                  mainAxisSpacing: 16,
                ),
                itemCount: items.length,
                itemBuilder: (_, i) {
                  final c = items[i];
                  final id = c['id'] as String? ?? '';
                  final name = c['name'] as String? ?? '';
                  final avatar = c['avatar'] as String?;
                  final dept = c['known_for_department'] as String? ?? '';
                  final filmCount = c['film_count'] as int? ?? 0;
                  return GestureDetector(
                    onTap: () => context.push('/user/$id'),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(12),
                          child: AspectRatio(
                            aspectRatio: 2 / 3,
                            child: avatar != null
                                ? CachedNetworkImage(
                                    imageUrl: avatar,
                                    fit: BoxFit.cover,
                                    errorWidget: (_, _, _) => Container(
                                      color: AppColors.surfaceContainer,
                                      child: const Icon(Icons.person, color: AppColors.onSurfaceVariant, size: 40),
                                    ),
                                  )
                                : Container(
                                    color: AppColors.surfaceContainer,
                                    child: const Icon(Icons.person, color: AppColors.onSurfaceVariant, size: 40),
                                  ),
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(name, style: AppTypography.labelMd.copyWith(color: AppColors.onSurface), maxLines: 1, overflow: TextOverflow.ellipsis),
                        if (dept.isNotEmpty) ...[
                          const SizedBox(height: 2),
                          Text(dept, style: AppTypography.bodySm.copyWith(color: AppColors.onSurfaceVariant), maxLines: 1, overflow: TextOverflow.ellipsis),
                        ],
                        Text('$filmCount films', style: AppTypography.bodySm.copyWith(color: AppColors.primary), maxLines: 1, overflow: TextOverflow.ellipsis),
                      ],
                    ),
                  );
                },
              ),
            ),
          ],
        );
      },
      loading: () => const SizedBox(height: 300, child: Center(child: LoadingSpinner())),
      error: (_, _) => const _EmptySearch(),
    );
  }

  Widget _buildCategoryResults() {
    final categories = ref.watch(_categoryResultsProvider(_query));
    return categories.when(
      data: (items) {
        if (items.isEmpty) return const _EmptySearch();
        final cols = gridColumns(MediaQuery.of(context).size.width);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(
                  '${items.length} categor${items.length == 1 ? 'y' : 'ies'}',
                  style: AppTypography.bodySm.copyWith(color: AppColors.onSurfaceVariant),
                ),
                const Spacer(),
                const AppBadge(label: 'Categories'),
              ],
            ),
            const SizedBox(height: 16),
            LayoutBuilder(
              builder: (context, constraints) => GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: cols,
                  childAspectRatio: gridAspectRatio(MediaQuery.of(context).size.width, cols),
                  crossAxisSpacing: 16,
                  mainAxisSpacing: 16,
                ),
                itemCount: items.length,
                itemBuilder: (_, i) {
                  final cat = items[i];
                  final id = cat['id'] as String? ?? '';
                  final name = cat['name'] as String? ?? '';
                  final source = cat['source'] as String? ?? 'tmdb';
                  return GestureDetector(
                    onTap: () => context.go(source == 'tmdb' ? '/discover?genre_id=$id' : '/discover?sort=popular'),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(12),
                          child: AspectRatio(
                            aspectRatio: 2 / 3,
                            child: Container(
                              color: AppColors.surfaceContainer,
                              child: Center(
                                child: Icon(
                                  source == 'creator' ? Icons.video_library : Icons.category,
                                  color: AppColors.onSurfaceVariant,
                                  size: 48,
                                ),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(name, style: AppTypography.labelMd.copyWith(color: AppColors.onSurface), maxLines: 1, overflow: TextOverflow.ellipsis),
                        Text(source, style: AppTypography.bodySm.copyWith(color: AppColors.onSurfaceVariant), maxLines: 1, overflow: TextOverflow.ellipsis),
                      ],
                    ),
                  );
                },
              ),
            ),
          ],
        );
      },
      loading: () => const SizedBox(height: 300, child: Center(child: LoadingSpinner())),
      error: (_, _) => const _EmptySearch(),
    );
  }
}

class _EmptySearch extends StatelessWidget {
  const _EmptySearch();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 48),
      child: Column(
        children: [
          const Icon(Icons.search, size: 64, color: AppColors.onSurfaceVariant),
          const SizedBox(height: 12),
          Text('No results found', style: AppTypography.labelMd.copyWith(color: AppColors.onSurfaceVariant)),
          const SizedBox(height: 4),
          Text('Try a different search term', style: AppTypography.bodySm.copyWith(color: AppColors.onSurfaceVariant)),
        ],
      ),
    );
  }
}