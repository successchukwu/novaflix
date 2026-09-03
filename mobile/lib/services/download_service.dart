import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';
import 'package:crypto/crypto.dart';
import 'package:encrypt/encrypt.dart' as enc;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import '../services/api_service.dart';

const _magic = 'NFLX'; // custom container magic bytes
const _version = 2; // bumped for new length-prefixed chunk format
const _chunkSize = 64 * 1024; // AES block aligned chunking
const _offlineKeyStorageKey = 'novaflix-offline-key';

class DownloadEpisode {
  final int season;
  final int episode;
  final String name;
  final String fileName; // encrypted file name (relative path)
  final double progress;
  final double duration;
  const DownloadEpisode({
    required this.season,
    required this.episode,
    required this.name,
    required this.fileName,
    this.progress = 0,
    this.duration = 0,
  });

  Map<String, dynamic> toJson() => {
        'season': season,
        'episode': episode,
        'name': name,
        'fileName': fileName,
        'progress': progress,
        'duration': duration,
      };

  factory DownloadEpisode.fromJson(Map<String, dynamic> j) => DownloadEpisode(
        season: j['season'] as int? ?? 1,
        episode: j['episode'] as int? ?? 1,
        name: j['name'] as String? ?? '',
        fileName: j['fileName'] as String? ?? '',
        progress: (j['progress'] as num?)?.toDouble() ?? 0,
        duration: (j['duration'] as num?)?.toDouble() ?? 0,
      );
}

class DownloadItem {
  final int id;
  final String type; // movie | tv
  final String title;
  final String? poster;
  final String? backdrop;
  final DateTime addedAt;
  final double progress; // aggregate 0..1
  final double duration;
  final bool completed;
  final List<DownloadEpisode> episodes; // empty for movies
  const DownloadItem({
    required this.id,
    required this.type,
    required this.title,
    this.poster,
    this.backdrop,
    required this.addedAt,
    this.progress = 0,
    this.duration = 0,
    this.completed = false,
    this.episodes = const [],
  });

  bool get isTv => type == 'tv';

  Map<String, dynamic> toJson() => {
        'id': id,
        'type': type,
        'title': title,
        'poster': poster,
        'backdrop': backdrop,
        'addedAt': addedAt.millisecondsSinceEpoch,
        'progress': progress,
        'duration': duration,
        'completed': completed,
        'episodes': episodes.map((e) => e.toJson()).toList(),
      };

  factory DownloadItem.fromJson(Map<String, dynamic> j) => DownloadItem(
        id: j['id'] as int? ?? 0,
        type: j['type'] as String? ?? 'movie',
        title: j['title'] as String? ?? '',
        poster: j['poster'] as String?,
        backdrop: j['backdrop'] as String?,
        addedAt: DateTime.fromMillisecondsSinceEpoch(j['addedAt'] as int? ?? 0),
        progress: (j['progress'] as num?)?.toDouble() ?? 0,
        duration: (j['duration'] as num?)?.toDouble() ?? 0,
        completed: j['completed'] as bool? ?? false,
        episodes: (j['episodes'] as List? ?? [])
            .map((e) => DownloadEpisode.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class ActiveDownload {
  final int contentId;
  final String type;
  final String title;
  final String? poster;
  final String? backdrop;
  final int episodeCount;
  int episodesDone;
  double totalBytes;
  double bytesDone;
  bool cancelled = false;
  ActiveDownload({
    required this.contentId,
    required this.type,
    required this.title,
    this.poster,
    this.backdrop,
    required this.episodeCount,
    required this.episodesDone,
    required this.totalBytes,
    required this.bytesDone,
  });

  double get fraction =>
      totalBytes <= 0 ? 0 : (bytesDone / totalBytes).clamp(0.0, 1.0);
}

class DownloadService {
  DownloadService(this._api);

  final ApiService _api;

  final List<ActiveDownload> _active = [];

  Directory? _cachedRoot;

  Future<Directory> _root() async {
    final dir = await getApplicationSupportDirectory();
    final d = Directory(p.join(dir.path, 'novaflix_downloads'));
    if (!await d.exists()) await d.create(recursive: true);
    return d;
  }

  Future<File> _manifestFile() async {
    final root = await _root();
    return File(p.join(root.path, 'manifest.json'));
  }

  Future<List<DownloadItem>> loadManifest() async {
    final f = await _manifestFile();
    if (!await f.exists()) return [];
    try {
      final raw = await f.readAsString();
      final list = jsonDecode(raw) as List? ?? [];
      return list
          .map((e) => DownloadItem.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> _saveManifest(List<DownloadItem> items) async {
    final f = await _manifestFile();
    await f.writeAsString(jsonEncode(items.map((e) => e.toJson()).toList()));
  }

  Future<void> updateItemProgress(int id, String type, {required double progress, required double duration}) async {
    final items = await loadManifest();
    final idx = items.indexWhere((x) => x.id == id && x.type == type);
    if (idx < 0) return;
    final old = items[idx];
    final updated = DownloadItem(
      id: old.id,
      type: old.type,
      title: old.title,
      poster: old.poster,
      backdrop: old.backdrop,
      addedAt: old.addedAt,
      progress: progress,
      duration: duration,
      completed: old.completed,
      episodes: old.episodes,
    );
    items[idx] = updated;
    await _saveManifest(items);
  }

  Future<void> updateEpisodeProgress(int id, String type, int season, int episode, {required double progress, required double duration}) async {
    final items = await loadManifest();
    final idx = items.indexWhere((x) => x.id == id && x.type == type);
    if (idx < 0) return;
    final old = items[idx];
    final eps = old.episodes.map((e) {
      if (e.season == season && e.episode == episode) {
        return DownloadEpisode(
          season: e.season,
          episode: e.episode,
          name: e.name,
          fileName: e.fileName,
          progress: progress,
          duration: duration,
        );
      }
      return e;
    }).toList();
    items[idx] = DownloadItem(
      id: old.id,
      type: old.type,
      title: old.title,
      poster: old.poster,
      backdrop: old.backdrop,
      addedAt: old.addedAt,
      progress: old.progress,
      duration: old.duration,
      completed: old.completed,
      episodes: eps,
    );
    await _saveManifest(items);
  }

  /// Download a movie (single file) or a TV show (one file per episode).
  Future<void> downloadContent({
    required int contentId,
    required String type,
    required String title,
    String? poster,
    String? backdrop,
    int? season,
    int? episode,
    List<Map<String, dynamic>>? episodes,
  }) async {
    if (type == 'tv' && (episodes == null || episodes.isEmpty)) return;
    final epList = episodes ?? const <Map<String, dynamic>>[];

    if (type == 'movie') {
      final source = await _resolveSource(contentId, 'movie');
      if (source.isEmpty) return;
      // Fetch available variants to show correct progress and allow quality selection
      String? variantUrl;
      double totalBytesHint = 0;
      try {
        final mi = await _api.getManifestInfo(source, id: contentId, type: 'movie');
        final vars = mi.data['variants'] as List? ?? [];
        if (vars.isNotEmpty) {
          // Pick middle quality (720p preferred) or highest if only one
          final sorted = vars.where((v) => v is Map).toList();
          sorted.sort((a, b) => ((a['sizeBytes'] as int?) ?? 0).compareTo((b['sizeBytes'] as int?) ?? 0));
          final pick = sorted.length >= 2 ? sorted[sorted.length ~/ 2] : sorted.first;
          variantUrl = pick['url'] as String?;
          totalBytesHint = (pick['sizeBytes'] as int?)?.toDouble() ?? 0;
        }
      } catch (_) {}
      final active = ActiveDownload(
        contentId: contentId,
        type: 'movie',
        title: title,
        poster: poster,
        backdrop: backdrop,
        episodeCount: 1,
        episodesDone: 0,
        totalBytes: totalBytesHint > 0 ? totalBytesHint : 1,
        bytesDone: 0,
      );
      _active.add(active);
      await _downloadUrlToEncrypted(
        sourceUrl: source,
        relPath: 'movie_$contentId/$contentId.nfv',
        title: title,
        variantUrl: variantUrl,
        onProgress: (done) {
          active.bytesDone = done;
          if (totalBytesHint <= 0) active.totalBytes = math.max(active.totalBytes, done);
        },
        active: active,
      );
      _active.remove(active);
      if (active.cancelled) return;
      final list = await loadManifest();
      list.removeWhere((x) => x.id == contentId && x.type == 'movie');
      list.add(DownloadItem(
        id: contentId,
        type: 'movie',
        title: title,
        poster: poster,
        backdrop: backdrop,
        addedAt: DateTime.now(),
        progress: 1,
        completed: true,
      ));
      await _saveManifest(list);
      return;
    }

    // TV show: folder structure `tv_<id>/S<season>E<ep>.nfv`
    final items = await loadManifest();
    items.removeWhere((x) => x.id == contentId && x.type == 'tv');
    final dlEpisodes = <DownloadEpisode>[];
    final total = epList.length;
    final active = ActiveDownload(
      contentId: contentId,
      type: 'tv',
      title: title,
      poster: poster,
      backdrop: backdrop,
      episodeCount: total,
      episodesDone: 0,
      totalBytes: total.toDouble(),
      bytesDone: 0,
    );
    _active.add(active);
    for (var i = 0; i < epList.length; i++) {
      if (active.cancelled) break;
      final ep = epList[i];
      final s = ep['season'] as int? ?? season ?? 1;
      final e = ep['episode'] as int? ?? (i + 1);
      String src;
      try {
        src = await _resolveSource(contentId, 'tv', season: s, episode: e);
      } catch (_) {
        continue;
      }
      if (src.isEmpty) continue;
      // Variant hint per episode
      String? variantUrl;
      try {
        final mi = await _api.getManifestInfo(src, id: contentId, type: 'tv', season: s, episode: e);
        final vars = mi.data['variants'] as List? ?? [];
        if (vars.isNotEmpty) {
          final sorted = vars.where((v) => v is Map).toList();
          sorted.sort((a, b) => ((a['sizeBytes'] as int?) ?? 0).compareTo((b['sizeBytes'] as int?) ?? 0));
          final pick = sorted.length >= 2 ? sorted[sorted.length ~/ 2] : sorted.first;
          variantUrl = pick['url'] as String?;
        }
      } catch (_) {}
      final fileName =
          'S${s.toString().padLeft(2, '0')}E${e.toString().padLeft(2, '0')}.nfv';
      await _downloadUrlToEncrypted(
        sourceUrl: src,
        relPath: 'tv_$contentId/$fileName',
        title: '$title S${s}E$e',
        variantUrl: variantUrl,
        onProgress: (done) {
          // Update both byte progress and episode count for UI ring
          active.bytesDone = active.episodesDone.toDouble() + (done > 0 ? 0.5 : 0);
        },
        active: active,
      );
      if (active.cancelled) break;
      dlEpisodes.add(DownloadEpisode(
        season: s,
        episode: e,
        name: ep['name']?.toString() ?? 'Episode $e',
        fileName: 'tv_$contentId/$fileName',
      ));
      active.episodesDone = i + 1;
      active.bytesDone = active.episodesDone.toDouble();
      await _saveManifest([
        ...items,
        DownloadItem(
          id: contentId,
          type: 'tv',
          title: title,
          poster: poster,
          backdrop: backdrop,
          addedAt: DateTime.now(),
          completed: false,
          episodes: List.from(dlEpisodes),
        ),
      ]);
    }
    _active.remove(active);
    final finalList = await loadManifest();
    finalList.removeWhere((x) => x.id == contentId && x.type == 'tv');
    finalList.add(DownloadItem(
      id: contentId,
      type: 'tv',
      title: title,
      poster: poster,
      backdrop: backdrop,
      addedAt: DateTime.now(),
      completed: true,
      episodes: List.from(dlEpisodes),
    ));
    await _saveManifest(finalList);
  }

  Future<String> _resolveSource(int id, String type, {int? season, int? episode}) async {
    try {
      final res = await _api.getStreamSource(id, type, season: season, episode: episode);
      final data = res.data is Map<String, dynamic>
          ? res.data['data'] as Map<String, dynamic>? ?? res.data as Map<String, dynamic>
          : <String, dynamic>{};
      final url = data['directUrl'] as String? ?? data['streamUrl'] as String? ?? '';
      if (url.isEmpty) {
        final error = data['error'] as String? ?? 'No playable stream found for this title.';
        throw Exception(error);
      }
      return url;
    } catch (e) {
      rethrow;
    }
  }

  /// Stream via server ffmpeg (/download) -> MP4, encrypt length-prefixed chunks into [.nfv]
  Future<void> _downloadUrlToEncrypted({
    required String sourceUrl,
    required String relPath,
    String? title,
    String? variantUrl,
    required void Function(double bytesDone) onProgress,
    required ActiveDownload active,
  }) async {
    final key = await _deriveKey();
    final iv = _randomIv();
    final encrypter = enc.Encrypter(
      enc.AES(enc.Key(Uint8List.fromList(key)), mode: enc.AESMode.cbc),
    );
    try {
      // Use real server transcode endpoint for HLS -> MP4
      final isHls = sourceUrl.contains('.m3u8') || sourceUrl.contains('proxy');
      late Stream<Uint8List> stream;
      if (isHls) {
        stream = await _api.downloadFileStream(url: sourceUrl, title: title, variant: variantUrl, compress: false);
      } else {
        // Direct MP4 (creator uploads) — stream directly
        stream = await _api.streamUrl(sourceUrl);
      }
      final header = _buildHeader(iv);
      final root = await _root();
      final f = File(p.join(root.path, relPath));
      if (await f.exists()) await f.delete();
      await f.parent.create(recursive: true);
      final out = f.openWrite();
      out.add(header);
      var done = 0;
      await for (final chunk in stream) {
        if (active.cancelled) {
          await out.flush();
          await out.close();
          await f.delete();
          return;
        }
        final data = chunk is List<int> ? Uint8List.fromList(chunk) : chunk;
        var offset = 0;
        while (offset < data.length) {
          final end = math.min(offset + _chunkSize, data.length);
          final slice = Uint8List.sublistView(data, offset, end);
          final encIv = enc.IV(iv);
          final cipher = encrypter.encryptBytes(slice, iv: encIv);
          final cipherBytes = cipher.bytes;
          // Length-prefix each chunk so decrypt can split correctly
          final len = cipherBytes.length;
          out.add([(len >> 24) & 0xFF, (len >> 16) & 0xFF, (len >> 8) & 0xFF, len & 0xFF]);
          out.add(cipherBytes);
          offset = end;
        }
        done += data.length;
        onProgress(done.toDouble());
      }
      await out.flush();
      await out.close();
      if (active.cancelled) {
        final root2 = await _root();
        final ff = File(p.join(root2.path, relPath));
        if (await ff.exists()) await ff.delete();
      }
    } catch (_) {
      final root3 = await _root();
      final ff = File(p.join(root3.path, relPath));
      if (await ff.exists()) await ff.delete();
      rethrow;
    }
  }

  /// Decrypt a downloaded [.nfv] container into a temporary playable file.
  /// Returns the temp file path (deleted after playback). Supports v1 (single block) and v2 (length-prefixed chunks).
  Future<File> decryptToTemp(DownloadItem item, {DownloadEpisode? episode}) async {
    final relPath = episode?.fileName ?? 'movie_${item.id}/${item.id}.nfv';
    final key = await _deriveKey();
    final encrypter = enc.Encrypter(
      enc.AES(enc.Key(key), mode: enc.AESMode.cbc),
    );
    final root = await _root();
    final src = File(p.join(root.path, relPath));
    if (!await src.exists()) throw FileSystemException('Missing $relPath');
    final raw = await src.readAsBytes();
    if (raw.length < headerSize) throw FileSystemException('Corrupt $relPath');
    final version = raw[4];
    final iv = raw.sublist(5, 5 + 16);
    late Uint8List outBytes;
    if (version == 2) {
      // v2: length-prefixed chunks
      final body = raw.sublist(headerSize);
      final builder = BytesBuilder();
      var offset = 0;
      while (offset + 4 <= body.length) {
        final len = (body[offset] << 24) | (body[offset + 1] << 16) | (body[offset + 2] << 8) | body[offset + 3];
        offset += 4;
        if (offset + len > body.length) break;
        final cipherChunk = body.sublist(offset, offset + len);
        offset += len;
        final plain = encrypter.decryptBytes(enc.Encrypted(Uint8List.fromList(cipherChunk)), iv: enc.IV(iv));
        builder.add(plain);
      }
      outBytes = builder.toBytes();
    } else {
      // v1 legacy single block
      final body = Uint8List.sublistView(raw, 5 + 16);
      outBytes = Uint8List.fromList(encrypter.decryptBytes(enc.Encrypted(body), iv: enc.IV(iv)));
    }
    final tmpDir = await getTemporaryDirectory();
    final tmp = File(p.join(tmpDir.path,
        '${item.type}_${item.id}_${episode?.episode ?? 0}_${DateTime.now().millisecondsSinceEpoch}.mp4'));
    await tmp.writeAsBytes(outBytes, flush: true);
    return tmp;
  }

  Future<void> deleteDownload(DownloadItem item) async {
    final root = await _root();
    final dir = Directory(p.join(root.path, item.isTv ? 'tv_${item.id}' : 'movie_${item.id}'));
    if (await dir.exists()) await dir.delete(recursive: true);
    final items = await loadManifest();
    items.removeWhere((x) => x.id == item.id && x.type == item.type);
    await _saveManifest(items);
  }

  void cancelActive() {
    for (final a in _active) {
      a.cancelled = true;
    }
  }

  List<ActiveDownload> get activeDownloads => List.unmodifiable(_active);

  static const _storage = FlutterSecureStorage();
  Future<Uint8List> _deriveKey() async {
    // Persist key so OS updates don't invalidate existing .nfv files
    final existing = await _storage.read(key: _offlineKeyStorageKey);
    if (existing != null && existing.isNotEmpty) {
      try {
        return base64Decode(existing);
      } catch (_) {}
    }
    // Include deviceId for per-device binding, fallback to stable salt
    String devicePart = 'static';
    try {
      devicePart = await _api.getDeviceId();
    } catch (_) {}
    final raw = utf8.encode('novaflix-offline-v2::$devicePart');
    final hash = sha256.convert(raw);
    final key = Uint8List.fromList(hash.bytes);
    await _storage.write(key: _offlineKeyStorageKey, value: base64Encode(key));
    return key;
  }

  Uint8List _randomIv() {
    final rng = math.Random.secure();
    return Uint8List.fromList(List.generate(16, (_) => rng.nextInt(256)));
  }

  Uint8List _buildHeader(Uint8List iv) {
    final out = BytesBuilder();
    out.add(utf8.encode(_magic));
    out.add([_version]);
    out.add(iv);
    return out.toBytes();
  }

  static const int headerSize = 5 + 16;
}

/// Provider wiring for the download service singleton.
final downloadServiceProvider = Provider<DownloadService>((ref) {
  final api = ref.read(apiServiceProvider);
  return DownloadService(api);
});
