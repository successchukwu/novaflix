class MediaItem {
  final int id;
  final String title;
  final String? posterPath;
  final String? backdropPath;
  final String? overview;
  final double? voteAverage;
  final String? releaseDate;
  final String? mediaType;
  final int? runtime;
  final List<Genre>? genres;
  final List<Season>? seasons;
  final bool premium;
  final bool promoted;
  final String? trailerKey;
  final String? source;

  MediaItem({
    required this.id,
    required this.title,
    this.posterPath,
    this.backdropPath,
    this.overview,
    this.voteAverage,
    this.releaseDate,
    this.mediaType,
    this.runtime,
    this.genres,
    this.seasons,
    this.premium = false,
    this.promoted = false,
    this.trailerKey,
    this.source,
  });

  factory MediaItem.fromJson(Map<String, dynamic> json) {
    final rawId = json['id'];
    int parsedId;
    if (rawId is int) {
      parsedId = rawId;
    } else if (rawId is String) {
      parsedId = int.tryParse(rawId) ?? 0;
    } else {
      parsedId = 0;
    }
    return MediaItem(
      id: parsedId,
      title: json['title'] as String? ?? json['name'] as String? ?? '',
      posterPath: json['poster_path'] as String? ?? json['poster'] as String?,
      backdropPath:
          json['backdrop_path'] as String? ?? json['backdrop'] as String?,
      overview: json['overview'] as String?,
      voteAverage:
          (json['vote_average'] as num?)?.toDouble() ??
          (json['rating'] as num?)?.toDouble(),
      releaseDate:
          json['release_date'] as String? ??
          json['first_air_date'] as String? ??
          json['year'] as String?,
      mediaType: json['type'] as String? ?? json['media_type'] as String?,
      runtime: json['runtime'] as int?,
      genres: (json['genres'] as List?)
          ?.map(
            (g) => g is Map<String, dynamic>
                ? Genre.fromJson(g)
                : Genre(id: 0, name: g as String),
          )
          .toList(),
      seasons: (json['seasons'] as List?)
          ?.map((s) => Season.fromJson(s as Map<String, dynamic>))
          .toList(),
      premium: json['premium'] as bool? ?? false,
      promoted: json['promoted'] as bool? ?? false,
      trailerKey: (json['trailer_key'] as String?) ?? (json['trailerKey'] as String?),
      source: json['source'] as String?,
    );
  }

  String? get posterUrl => posterPath != null
      ? (posterPath!.startsWith('http') || posterPath!.startsWith('/api/')
            ? posterPath
            : 'https://image.tmdb.org/t/p/w500$posterPath')
      : null;
  String? get backdropUrl => backdropPath != null
      ? (backdropPath!.startsWith('http') || backdropPath!.startsWith('/api/')
            ? backdropPath
            : 'https://image.tmdb.org/t/p/w1280$backdropPath')
      : null;
  int get year => releaseDate != null && releaseDate!.length >= 4
      ? int.tryParse(releaseDate!.substring(0, 4)) ?? 0
      : 0;
  String get ratingFormatted =>
      voteAverage != null ? voteAverage!.toStringAsFixed(1) : 'N/A';
  bool get isTV => mediaType == 'tv';
}

class Genre {
  final int id;
  final String name;

  Genre({required this.id, required this.name});

  factory Genre.fromJson(Map<String, dynamic> json) =>
      Genre(id: json['id'] as int, name: json['name'] as String);
}

class Season {
  final int id;
  final int seasonNumber;
  final String? name;
  final String? posterPath;
  final int? episodeCount;

  Season({
    required this.id,
    required this.seasonNumber,
    this.name,
    this.posterPath,
    this.episodeCount,
  });

  factory Season.fromJson(Map<String, dynamic> json) => Season(
    id: json['id'] as int,
    seasonNumber: json['season_number'] as int,
    name: json['name'] as String?,
    posterPath: json['poster_path'] as String?,
    episodeCount: json['episode_count'] as int?,
  );
}

class Episode {
  final int id;
  final int episodeNumber;
  final String? name;
  final String? overview;
  final String? stillPath;
  final int? runtime;

  Episode({
    required this.id,
    required this.episodeNumber,
    this.name,
    this.overview,
    this.stillPath,
    this.runtime,
  });

  factory Episode.fromJson(Map<String, dynamic> json) => Episode(
    id: json['id'] as int,
    episodeNumber: json['episode_number'] as int,
    name: json['name'] as String?,
    overview: json['overview'] as String?,
    stillPath: json['still_path'] as String?,
    runtime: json['runtime'] as int?,
  );
}
