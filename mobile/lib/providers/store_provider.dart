import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

const _storage = FlutterSecureStorage();
const _storeKey = 'novaflix-store';

class ContinueWatchingItem {
  final int id;
  final String title;
  final String? poster;
  final String type;
  final int? season;
  final int? episode;
  final double progress;
  final double duration;

  ContinueWatchingItem({
    required this.id, required this.title, this.poster,
    required this.type, this.season, this.episode,
    this.progress = 0, this.duration = 0,
  });

  Map<String, dynamic> toJson() => {
    'id': id, 'title': title, 'poster': poster, 'type': type,
    if (season != null) 'season': season,
    if (episode != null) 'episode': episode,
    'progress': progress, 'duration': duration,
  };

  factory ContinueWatchingItem.fromJson(Map<String, dynamic> json) => ContinueWatchingItem(
    id: json['id'] as int, title: json['title'] as String,
    poster: json['poster'] as String?, type: json['type'] as String,
    season: json['season'] as int?, episode: json['episode'] as int?,
    progress: (json['progress'] as num?)?.toDouble() ?? 0,
    duration: (json['duration'] as num?)?.toDouble() ?? 0,
  );
}

class PlaybackSettings {
  final String defaultQuality;
  final double subtitleSize;
  final bool autoplay;
  final String subtitleLanguage;

  const PlaybackSettings({
    this.defaultQuality = 'Auto', this.subtitleSize = 1.0,
    this.autoplay = true, this.subtitleLanguage = 'en',
  });

  Map<String, dynamic> toJson() => {
    'defaultQuality': defaultQuality, 'subtitleSize': subtitleSize,
    'autoplay': autoplay, 'subtitleLanguage': subtitleLanguage,
  };

  factory PlaybackSettings.fromJson(Map<String, dynamic> json) => PlaybackSettings(
    defaultQuality: json['defaultQuality'] as String? ?? 'Auto',
    subtitleSize: (json['subtitleSize'] as num?)?.toDouble() ?? 1.0,
    autoplay: json['autoplay'] as bool? ?? true,
    subtitleLanguage: json['subtitleLanguage'] as String? ?? 'en',
  );

  PlaybackSettings copyWith({String? defaultQuality, double? subtitleSize, bool? autoplay, String? subtitleLanguage}) =>
      PlaybackSettings(
        defaultQuality: defaultQuality ?? this.defaultQuality,
        subtitleSize: subtitleSize ?? this.subtitleSize,
        autoplay: autoplay ?? this.autoplay,
        subtitleLanguage: subtitleLanguage ?? this.subtitleLanguage,
      );
}

class NotificationSettings {
  final bool newReleases;
  final bool watchlistUpdates;
  final bool creatorActivity;
  final bool marketing;
  final bool pushEnabled;
  final bool commentReply;
  final bool sound;

  const NotificationSettings({
    this.newReleases = true, this.watchlistUpdates = true,
    this.creatorActivity = true, this.marketing = false,
    this.pushEnabled = true, this.commentReply = true, this.sound = true,
  });

  Map<String, dynamic> toJson() => {
    'newReleases': newReleases, 'watchlistUpdates': watchlistUpdates,
    'creatorActivity': creatorActivity, 'marketing': marketing,
    'pushEnabled': pushEnabled, 'commentReply': commentReply, 'sound': sound,
  };

  factory NotificationSettings.fromJson(Map<String, dynamic> json) => NotificationSettings(
    newReleases: json['newReleases'] as bool? ?? true,
    watchlistUpdates: json['watchlistUpdates'] as bool? ?? true,
    creatorActivity: json['creatorActivity'] as bool? ?? true,
    marketing: json['marketing'] as bool? ?? false,
    pushEnabled: json['pushEnabled'] as bool? ?? true,
    commentReply: json['commentReply'] as bool? ?? true,
    sound: json['sound'] as bool? ?? true,
  );

  NotificationSettings copyWith({bool? newReleases, bool? watchlistUpdates, bool? creatorActivity, bool? marketing, bool? pushEnabled, bool? commentReply, bool? sound}) =>
      NotificationSettings(
        newReleases: newReleases ?? this.newReleases,
        watchlistUpdates: watchlistUpdates ?? this.watchlistUpdates,
        creatorActivity: creatorActivity ?? this.creatorActivity,
        marketing: marketing ?? this.marketing,
        pushEnabled: pushEnabled ?? this.pushEnabled,
        commentReply: commentReply ?? this.commentReply,
        sound: sound ?? this.sound,
      );
}

class WatchlistItem {
  final int id;
  final String title;
  final String? poster;
  final String type;
  final String? year;
  final String? overview;

  WatchlistItem({
    required this.id, required this.title, this.poster, required this.type,
    this.year, this.overview,
  });

  Map<String, dynamic> toJson() => {
    'id': id, 'title': title, 'poster': poster, 'type': type,
    'year': year, 'overview': overview,
  };

  factory WatchlistItem.fromJson(Map<String, dynamic> json) => WatchlistItem(
    id: json['id'] as int, title: json['title'] as String,
    poster: json['poster'] as String?, type: json['type'] as String,
    year: json['year'] as String?, overview: json['overview'] as String?,
  );
}

class StoreState {
  final List<ContinueWatchingItem> continueWatching;
  final List<String> recentlySearched;
  final List<WatchlistItem> watchlist;
  final PlaybackSettings playbackSettings;
  final NotificationSettings notificationSettings;
  final bool sidebarCollapsed;
  final String locale;

  const StoreState({
    this.continueWatching = const [], this.recentlySearched = const [],
    this.watchlist = const [],
    this.playbackSettings = const PlaybackSettings(),
    this.notificationSettings = const NotificationSettings(),
    this.sidebarCollapsed = false,
    this.locale = 'en',
  });

  Map<String, dynamic> toJson() => {
    'continueWatching': continueWatching.map((e) => e.toJson()).toList(),
    'recentlySearched': recentlySearched,
    'watchlist': watchlist.map((e) => e.toJson()).toList(),
    'playbackSettings': playbackSettings.toJson(),
    'notificationSettings': notificationSettings.toJson(),
    'sidebarCollapsed': sidebarCollapsed,
    'locale': locale,
  };

  factory StoreState.fromJson(Map<String, dynamic> json) => StoreState(
    continueWatching: (json['continueWatching'] as List?)?.map((e) => ContinueWatchingItem.fromJson(e as Map<String, dynamic>)).toList() ?? [],
    recentlySearched: (json['recentlySearched'] as List?)?.cast<String>() ?? [],
    watchlist: (json['watchlist'] as List?)?.map((e) => WatchlistItem.fromJson(e as Map<String, dynamic>)).toList() ?? [],
    playbackSettings: json['playbackSettings'] != null ? PlaybackSettings.fromJson(json['playbackSettings'] as Map<String, dynamic>) : const PlaybackSettings(),
    notificationSettings: json['notificationSettings'] != null ? NotificationSettings.fromJson(json['notificationSettings'] as Map<String, dynamic>) : const NotificationSettings(),
    sidebarCollapsed: json['sidebarCollapsed'] as bool? ?? false,
    locale: json['locale'] as String? ?? 'en',
  );
}

class StoreNotifier extends StateNotifier<StoreState> {
  StoreNotifier() : super(const StoreState()) { _load(); }

  Future<void> _load() async {
    final raw = await _storage.read(key: _storeKey);
    if (raw != null) {
      try { state = StoreState.fromJson(jsonDecode(raw) as Map<String, dynamic>); } catch (_) {}
    }
  }

  Future<void> _save() async {
    await _storage.write(key: _storeKey, value: jsonEncode(state.toJson()));
  }

  void addToContinueWatching(ContinueWatchingItem item) {
    final list = List<ContinueWatchingItem>.from(state.continueWatching);
    list.removeWhere((e) => e.id == item.id && e.type == item.type);
    list.insert(0, item);
    if (list.length > 20) list.removeLast();
    state = StoreState(continueWatching: list, recentlySearched: state.recentlySearched, playbackSettings: state.playbackSettings, notificationSettings: state.notificationSettings, locale: state.locale);
    _save();
  }

  void addToWatchlist(WatchlistItem item) {
    final list = List<WatchlistItem>.from(state.watchlist);
    list.removeWhere((e) => e.id == item.id);
    list.insert(0, item);
    state = StoreState(continueWatching: state.continueWatching, recentlySearched: state.recentlySearched, watchlist: list, playbackSettings: state.playbackSettings, notificationSettings: state.notificationSettings, locale: state.locale);
    _save();
  }

  void removeFromWatchlist(int id) {
    final list = List<WatchlistItem>.from(state.watchlist);
    list.removeWhere((e) => e.id == id);
    state = StoreState(continueWatching: state.continueWatching, recentlySearched: state.recentlySearched, watchlist: list, playbackSettings: state.playbackSettings, notificationSettings: state.notificationSettings, locale: state.locale);
    _save();
  }

  bool isInWatchlist(int id) {
    return state.watchlist.any((w) => w.id == id);
  }

  void updateProgress(int id, String type, double progress) {
    final list = state.continueWatching.map((e) {
      if (e.id == id && e.type == type) return ContinueWatchingItem(id: e.id, title: e.title, poster: e.poster, type: e.type, season: e.season, episode: e.episode, progress: progress, duration: e.duration);
      return e;
    }).toList();
    state = StoreState(continueWatching: list, recentlySearched: state.recentlySearched, playbackSettings: state.playbackSettings, notificationSettings: state.notificationSettings, locale: state.locale);
    _save();
  }

  void addRecentSearch(String query) {
    final list = List<String>.from(state.recentlySearched);
    list.remove(query); list.insert(0, query);
    if (list.length > 10) list.removeLast();
    state = StoreState(continueWatching: state.continueWatching, recentlySearched: list, playbackSettings: state.playbackSettings, notificationSettings: state.notificationSettings, locale: state.locale);
    _save();
  }

  void updatePlaybackSettings(PlaybackSettings settings) {
    state = StoreState(continueWatching: state.continueWatching, recentlySearched: state.recentlySearched, playbackSettings: settings, notificationSettings: state.notificationSettings, locale: state.locale);
    _save();
  }

  void updateNotificationSettings(NotificationSettings settings) {
    state = StoreState(continueWatching: state.continueWatching, recentlySearched: state.recentlySearched, playbackSettings: state.playbackSettings, notificationSettings: settings, locale: state.locale);
    _save();
  }

  void toggleSidebar() {
    state = StoreState(continueWatching: state.continueWatching, recentlySearched: state.recentlySearched, playbackSettings: state.playbackSettings, notificationSettings: state.notificationSettings, sidebarCollapsed: !state.sidebarCollapsed, locale: state.locale);
    _save();
  }

  void setLocale(String locale) {
    state = StoreState(continueWatching: state.continueWatching, recentlySearched: state.recentlySearched, playbackSettings: state.playbackSettings, notificationSettings: state.notificationSettings, sidebarCollapsed: state.sidebarCollapsed, locale: locale);
    _save();
  }
}

final storeProvider = StateNotifierProvider<StoreNotifier, StoreState>((ref) => StoreNotifier());
