import 'dart:async';
import 'dart:math';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../core/config.dart';

final apiServiceProvider = Provider<ApiService>((ref) => ApiService());

class ApiService {
  static String get baseUrl => AppConfig.apiBaseUrl;
  static const _storage = FlutterSecureStorage();
  static const _tokenKey = 'novaflix-token';
  static const _creatorTokenKey = 'novaflix-creator-token';

  late final Dio _dio;

  ApiService() {
    _dio = Dio(
      BaseOptions(
        baseUrl: baseUrl,
        connectTimeout: const Duration(seconds: 15),
        receiveTimeout: const Duration(seconds: 15),
        headers: {'Content-Type': 'application/json'},
      ),
    );

    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await _storage.read(key: _tokenKey);
          if (token != null) {
            options.headers['Authorization'] = 'Bearer $token';
          } else {
            final cToken = await _storage.read(key: _creatorTokenKey);
            if (cToken != null) {
              options.headers['Authorization'] = 'Bearer $cToken';
            }
          }
          handler.next(options);
        },
        onError: (error, handler) {
          if (error.response?.statusCode == 401) {
            _storage.delete(key: _tokenKey);
            _storage.delete(key: _creatorTokenKey);
          }
          handler.next(error);
        },
      ),
    );
  }

  Dio get dio => _dio;

  Future<String?> getToken() => _storage.read(key: _tokenKey);
  Future<void> saveToken(String token) =>
      _storage.write(key: _tokenKey, value: token);
  Future<void> deleteToken() => _storage.delete(key: _tokenKey);

  static const _userCacheKey = 'novaflix-user-cache';
  Future<void> saveUserCache(String json) =>
      _storage.write(key: _userCacheKey, value: json);
  Future<String?> getUserCache() => _storage.read(key: _userCacheKey);
  Future<void> deleteUserCache() => _storage.delete(key: _userCacheKey);
  Future<String?> getCreatorToken() => _storage.read(key: _creatorTokenKey);
  Future<void> saveCreatorToken(String token) =>
      _storage.write(key: _creatorTokenKey, value: token);
  Future<void> deleteCreatorToken() => _storage.delete(key: _creatorTokenKey);

  static const _deviceIdKey = 'novaflix-device-id';
  Future<String> getDeviceId() async {
    final existing = await _storage.read(key: _deviceIdKey);
    if (existing != null && existing.isNotEmpty) return existing;
    final id = '${DateTime.now().millisecondsSinceEpoch}-${_randomHex(16)}';
    await _storage.write(key: _deviceIdKey, value: id);
    return id;
  }

  String _randomHex(int length) {
    const chars = '0123456789abcdef';
    final rnd = Random();
    return List.generate(
      length,
      (_) => chars[rnd.nextInt(chars.length)],
    ).join();
  }

  Future<Response> get(String path, {Map<String, dynamic>? params}) =>
      _dio.get(path, queryParameters: params);
  Future<Response> post(String path, {Map<String, dynamic>? data}) =>
      _dio.post(path, data: data);
  Future<Response> put(String path, {Map<String, dynamic>? data}) =>
      _dio.put(path, data: data);
  Future<Response> delete(String path) => _dio.delete(path);
  Future<Response> patch(String path, {Map<String, dynamic>? data}) =>
      _dio.patch(path, data: data);
  Future<Response> uploadFile(String path, FormData data) =>
      _dio.post(path, data: data);

  Future<Response> register(String email, String password, String? name) =>
      post(
        '/auth/register',
        data: {
          'email': email,
          'password': password,
          if (name != null) 'name': name,
        },
      );

  Future<Response> login(String email, String password) async {
    final deviceId = await getDeviceId();
    return post(
      '/auth/login',
      data: {'email': email, 'password': password, 'deviceId': deviceId},
    );
  }

  Future<Response> loginVerify(String userId, String code) async {
    final deviceId = await getDeviceId();
    return post(
      '/auth/login/verify',
      data: {'userId': userId, 'code': code, 'deviceId': deviceId},
    );
  }

  Future<Response> verifyEmail(String userId, String code) =>
      post('/auth/verify-email', data: {'userId': userId, 'code': code});

  Future<Response> resendVerification(String userId) =>
      post('/auth/resend-verification', data: {'userId': userId});

  Future<Response> getMe() => get('/auth/me');
  Future<Response> forgotPassword(String email) =>
      post('/auth/forgot-password', data: {'email': email});
  Future<Response> resetPassword(String token, String password) => post(
    '/auth/reset-password',
    data: {'token': token, 'password': password},
  );
  Future<Response> updateProfile(Map<String, dynamic> data) =>
      put('/user/profile', data: data);
  Future<Response> getUserStats() => get('/user/stats');
  Future<Response> getSettings() => get('/user/settings');
  Future<Response> updateSettings(Map<String, dynamic> settings) =>
      put('/user/settings', data: {'settings': settings});
  Future<Response> uploadAvatar(FormData data) =>
      uploadFile('/user/avatar', data);
  Future<Response> changePassword(String current, String newPw) => post(
    '/user/change-password',
    data: {'currentPassword': current, 'newPassword': newPw},
  );
  Future<Response> deleteAccount() => delete('/user/account');
  Future<Response> recordWatch(Map<String, dynamic> data) =>
      post('/user/watch-history', data: data);
  Future<Response> getWatchHistory() => get('/user/watch-history');
  Future<Response> getContinueWatching() => get('/user/watch-history/continue');

  Future<Response> getWatchlist() => get('/user/watchlist');
  Future<Response> addToWatchlist(Map<String, dynamic> data) =>
      post('/user/watchlist', data: data);
  Future<Response> removeFromWatchlist(String contentId) =>
      delete('/user/watchlist/$contentId');

  Future<Response> creatorRegister(
    String email,
    String password,
    String? name,
  ) => post(
    '/creator/auth/register',
    data: {'email': email, 'password': password, 'name': name},
  );
  Future<Response> creatorLogin(String email, String password) async {
    final deviceId = await getDeviceId();
    return post(
      '/creator/auth/login',
      data: {'email': email, 'password': password, 'deviceId': deviceId},
    );
  }

  Future<Response> creatorLoginVerify(String userId, String code) async {
    final deviceId = await getDeviceId();
    return post(
      '/creator/auth/login/verify',
      data: {'userId': userId, 'code': code, 'deviceId': deviceId},
    );
  }

  Future<Response> getTrending() => get('/trending');
  Future<Response> getNowPlaying() => get('/now-playing');
  Future<Response> searchMedia(String query, {String? type}) =>
      get('/search', params: {'query': query, if (type != null) 'type': type});
  Future<Response> searchAll(String query) =>
      get('/search/all', params: {'q': query});
  Future<Response> searchPerson(String query) =>
      get('/search/person', params: {'query': query});
  Future<Response> searchCreators(String query) =>
      get('/creator/search', params: {'q': query});
  Future<Response> searchCategories(String query) =>
      get('/categories/search', params: {'q': query});
  Future<Response> getPersonCredits(int id) =>
      get('/person/$id/credits');
  Future<Response> getDetails(int id, String type) =>
      get('/details', params: {'id': id, 'type': type});
  Future<Response> getCredits(int id, String type) =>
      get('/credits', params: {'id': id, 'type': type});
  Future<Response> getTVSeason(int id, int season) =>
      get('/tv-season', params: {'id': id, 'season': season});
  Future<Response> getStreamSource(
    int id,
    String type, {
    int? season,
    int? episode,
  }) => _dio.get(
    '/source',
    queryParameters: {
      'id': id,
      'type': type,
      if (season != null) 'season': season,
      if (episode != null) 'episode': episode,
    },
    options: Options(receiveTimeout: const Duration(seconds: 55)),
  );
  Future<Response> getManifestInfo(
    String url, {
    int? id,
    String? type,
    int? season,
    int? episode,
    String? plan,
  }) => get(
    '/manifest-info',
    params: {
      'url': url,
      if (id != null) 'id': id,
      if (type != null) 'type': type,
      if (season != null) 'season': season,
      if (episode != null) 'episode': episode,
      if (plan != null) 'plan': plan,
    },
  );
  Future<Response> getGenres({String? type}) =>
      get('/genres', params: {if (type != null) 'type': type});
  Future<Response> getCategoryMovies(int genreId, {String? type, int? page}) =>
      get(
        '/category',
        params: {
          'id': genreId,
          if (type != null) 'type': type,
          if (page != null) 'page': page,
        },
      );
  Future<Response> getDiscover({
    int? genreId,
    String? type,
    String? sortBy,
    int? page,
    int? minVotes,
    String? withCompanies,
    String? withOriginalLanguage,
    String? withOriginCountry,
    String? primaryReleaseDateLte,
  }) => get(
    '/discover',
    params: {
      if (genreId != null) 'genre_id': genreId,
      if (type != null) 'type': type,
      if (sortBy != null) 'sort_by': sortBy,
      if (page != null) 'page': page,
      if (minVotes != null) 'min_votes': minVotes,
      if (withCompanies != null) 'with_companies': withCompanies,
      if (withOriginalLanguage != null) 'with_original_language': withOriginalLanguage,
      if (withOriginCountry != null) 'with_origin_country': withOriginCountry,
      if (primaryReleaseDateLte != null) 'primary_release_date_lte': primaryReleaseDateLte,
    },
  );
  Future<Response> getNollywood({int? page}) => getDiscover(type: 'movie', withOriginCountry: 'NG', withOriginalLanguage: 'en', sortBy: 'popularity.desc', page: page);
  Future<Response> getHollywood({int? page}) => getDiscover(type: 'movie', withOriginCountry: 'US', sortBy: 'popularity.desc', page: page);
  Future<Response> getHooksFeed({int? page}) =>
      get('/hooks', params: {if (page != null) 'page': page});

  Future<Response> getShorts({int? page, int? limit}) => get(
        '/shorts',
        params: {
          if (page != null) 'page': page,
          if (limit != null) 'limit': limit,
        },
      );

  Future<Response> getShort(int id) => get('/shorts/$id');

  Future<Response> recordShortView(int id) => post('/shorts/$id/view');

  Future<Response> likeShort(int id) => post('/shorts/$id/like');

  Future<Response> bookmarkShort(int id) => post('/shorts/$id/bookmark');

  Future<Response> shareShort(int id) => post('/shorts/$id/share');

  Future<Response> getShortComments(int id) => get('/shorts/$id/comments');

  Future<Response> createShortComment(int id, String text) =>
      post('/shorts/$id/comment', data: {'text': text});

  Future<Response> toggleLike(
    int contentId,
    String contentType, {
    String? creatorId,
  }) => post(
    '/interactions/like',
    data: {
      'contentId': contentId,
      'contentType': contentType,
      if (creatorId != null) 'creatorId': creatorId,
    },
  );
  Future<Response> checkLike(int contentId, String contentType) => get(
    '/interactions/like',
    params: {'contentId': contentId, 'contentType': contentType},
  );
  Future<Response> getComments(int contentId, String contentType) => get(
    '/interactions/comments',
    params: {'contentId': contentId, 'contentType': contentType},
  );
  Future<Response> postComment(
    int contentId,
    String contentType,
    String text, {
    String? creatorId,
  }) => post(
    '/interactions/comment',
    data: {
      'contentId': contentId,
      'contentType': contentType,
      'text': text,
      if (creatorId != null) 'creatorId': creatorId,
    },
  );
  Future<Response> deleteComment(int id) => delete('/interactions/comment/$id');
  Future<Response> toggleFollow(String followingId) =>
      post('/interactions/follow', data: {'followingId': followingId});
  Future<Response> checkFollow(String followingId) =>
      get('/interactions/follow', params: {'followingId': followingId});

  Future<Response> getForYouRecommendations() =>
      get('/recommendations/for-you');
  Future<Response> getTrendingRecommendations() =>
      get('/recommendations/trending');
  Future<Response> getSimilarRecommendations(int id, {String? type}) => get(
    '/recommendations/similar/$id',
    params: {if (type != null) 'type': type},
  );

  Future<Response> getNextAd({int? contentId}) =>
      get('/ads/next', params: {if (contentId != null) 'contentId': contentId});
  Future<Response> recordAdImpression(
    String placementId, {
    bool? completed,
    int? watchedSeconds,
  }) => post(
    '/ads/impression',
    data: {
      'placementId': placementId,
      if (completed != null) 'completed': completed,
      if (watchedSeconds != null) 'watchedSeconds': watchedSeconds,
    },
  );
  Future<Response> grantBingePass({int? contentId, int? minutes}) => post(
    '/ads/binge-pass',
    data: {
      if (contentId != null) 'contentId': contentId,
      if (minutes != null) 'minutes': minutes,
    },
  );
  Future<Response> getSkipLimit() => get('/ads/skip-limit');
  Future<Response> incrementSkip() => post('/ads/skip');

  Future<Response> getCreatorStats() => get('/creator/stats');
  Future<Response> getCreatorUploads() => get('/creator/uploads');
  Future<Response> uploadFilm(FormData data) =>
      uploadFile('/creator/upload', data);
  Future<Response> getCreatorDashboard() => get('/creator/dashboard');
  Future<Response> getCreatorComments() => get('/creator/comments');
  Future<Response> getArtistGraph() => get('/payouts/graph');
  Future<Response> getPublicCreators() => get('/creator/public');

  Future<Response> getPricing() => get('/payment/pricing');
  Future<Response> initializePayment(String plan, {String? gateway}) =>
      post('/payment/initialize', data: {'plan': plan, if (gateway != null) 'gateway': gateway});
  Future<Response> verifyPayment(String reference, String plan) =>
      get('/payment/verify', params: {'reference': reference, 'plan': plan});
  Future<Response> getPaymentStatus() => get('/payment/status');
  Future<Response> getGatewayInfo() => get('/payment/gateway-info');

  Future<Response> sendTip(
    String creatorId,
    double amount, {
    String? message,
  }) => post(
    '/tips',
    data: {
      'creatorId': creatorId,
      'amount': amount,
      if (message != null) 'message': message,
    },
  );
  Future<Response> createPayoutRecipient(Map<String, dynamic> data) =>
      post('/payouts/recipient', data: data);
  Future<Response> requestWithdraw(double amount) =>
      post('/payouts/withdraw', data: {'amount': amount});
  Future<Response> getPayoutHistory() => get('/payouts/history');
  Future<Response> getBalance() => get('/payouts/balance');

  Future<Response> createTier(Map<String, dynamic> data) =>
      post('/memberships/tiers', data: data);
  Future<Response> updateTier(int id, Map<String, dynamic> data) =>
      put('/memberships/tiers/$id', data: data);
  Future<Response> getCreatorTiers(String creatorId) =>
      get('/memberships/tiers/$creatorId');
  Future<Response> getMyTiers() => get('/memberships/my-tiers');
  Future<Response> subscribeToTier(int tierId) =>
      post('/memberships/subscribe', data: {'tierId': tierId});
  Future<Response> verifyMembershipPayment(String reference) =>
      get('/memberships/verify', params: {'reference': reference});
  Future<Response> getMyMemberships() => get('/memberships/my-memberships');
  Future<Response> cancelMembership(int id) => post('/memberships/$id/cancel');
  Future<Response> getMySubscribers() => get('/memberships/my-subscribers');

  Future<Response> createEvent(Map<String, dynamic> data) =>
      post('/events', data: data);
  Future<Response> updateEvent(int id, Map<String, dynamic> data) =>
      put('/events/$id', data: data);
  Future<Response> getEvents({bool? includePast}) => get(
    '/events',
    params: {if (includePast != null) 'includePast': includePast},
  );
  Future<Response> getEvent(int id) => get('/events/$id');
  Future<Response> getMyEvents() => get('/events/mine');
  Future<Response> purchaseTicket(int eventId) =>
      post('/events/purchase', data: {'eventId': eventId});
  Future<Response> verifyTicketPayment(String reference) =>
      get('/events/purchase/verify', params: {'reference': reference});
  Future<Response> getMyTickets() => get('/events/my-tickets');

  Future<Response> getProducts({String? category}) =>
      get('/store', params: {if (category != null) 'category': category});
  Future<Response> getProduct(int id) => get('/store/$id');
  Future<Response> createProduct(FormData data) => uploadFile('/store', data);
  Future<Response> updateProduct(int id, FormData data) =>
      uploadFile('/store/$id', data);
  Future<Response> getMyProducts() => get('/store/mine');
  Future<Response> checkoutStore(List<Map<String, dynamic>> items) =>
      post('/store/checkout', data: {'items': items});
  Future<Response> verifyStoreOrder(String reference) =>
      get('/store/checkout/verify', params: {'reference': reference});
  Future<Response> getMyOrders() => get('/store/orders/mine');

  Future<Response> getCourses({String? category}) =>
      get('/courses', params: {if (category != null) 'category': category});
  Future<Response> getCourse(int id) => get('/courses/$id');
  Future<Response> createCourse(FormData data) => uploadFile('/courses', data);
  Future<Response> updateCourse(int id, FormData data) =>
      uploadFile('/courses/$id', data);
  Future<Response> getMyCourses() => get('/courses/mine');
  Future<Response> enrollCourse(int courseId) =>
      post('/courses/enroll', data: {'courseId': courseId});
  Future<Response> verifyCoursePayment(String reference) =>
      get('/courses/enroll/verify', params: {'reference': reference});
  Future<Response> getMyEnrollments() => get('/courses/enrollments/mine');
  Future<Response> updateCourseProgress(int courseId, double progress) => post(
    '/courses/progress',
    data: {'courseId': courseId, 'progress': progress},
  );

  Future<Response> getCommunities({String? search}) =>
      get('/community', params: {if (search != null) 'search': search});
  Future<Response> getCommunity(int id) => get('/community/$id');
  Future<Response> getMyCommunities() => get('/community/mine');
  Future<Response> createCommunity(Map<String, dynamic> data) =>
      post('/community', data: data);
  Future<Response> joinCommunity(int id) => post('/community/$id/join');
  Future<Response> leaveCommunity(int id) => post('/community/$id/leave');
  Future<Response> addCommunityPost(int communityId, String content) =>
      post('/community/$communityId/posts', data: {'content': content});
  Future<Response> deleteCommunityPost(int communityId, int postId) =>
      delete('/community/$communityId/posts/$postId');
  Future<Response> likeCommunityPost(int communityId, int postId) =>
      post('/community/$communityId/posts/$postId/like');
  Future<Response> getCommunityMembers(int communityId) =>
      get('/community/$communityId/members');
  Future<Response> getMyEggs() => get('/eggs/mine');

  Future<Response> createArchive(Map<String, dynamic> data) =>
      post('/archive', data: data);
  Future<Response> updateArchive(int id, Map<String, dynamic> data) =>
      put('/archive/$id', data: data);
  Future<Response> getArchiveItems() => get('/archive');
  Future<Response> getArchiveItem(int id) => get('/archive/$id');

  Future<Response> getAchievements() => get('/achievements');
  Future<Response> getMyAchievements() => get('/achievements/mine');
  Future<Response> checkAchievements() => post('/achievements/check');

  Future<Response> generateReferral() => post('/affiliate/generate');
  Future<Response> getAffiliateStats() => get('/affiliate/stats');
  Future<Response> redeemReferral(String code) =>
      post('/affiliate/redeem', data: {'code': code});

  Future<Response> getDownloadedFiles() => get('/downloads/list');
  Future<Response> deleteDownloadedFile(String filename) =>
      delete('/downloads/$filename');

  /// Stream a media URL in chunks (used by encrypted offline downloads).
  /// Uses Dio streaming to avoid loading the entire file into RAM.
  Future<Stream<Uint8List>> streamUrl(String url) async {
    final token = await _storage.read(key: _tokenKey);
    final cToken = await _storage.read(key: _creatorTokenKey);
    final headers = <String, dynamic>{
      if (token != null) 'Authorization': 'Bearer $token',
      if (cToken != null) 'Authorization': 'Bearer $cToken',
    };
    final resp = await _dio.get<ResponseBody>(
      url.startsWith('http') ? url : baseUrl + url,
      options: Options(
        responseType: ResponseType.stream,
        headers: headers,
        followRedirects: true,
      ),
    );
    final stream = resp.data?.stream;
    if (stream == null) return const Stream.empty();
    return stream.map((chunk) {
      if (chunk is Uint8List) return chunk;
      return Uint8List.fromList(chunk);
    });
  }

  /// Stream via server ffmpeg download endpoint (real MP4, not HLS playlist)
  Future<Stream<Uint8List>> downloadFileStream({
    required String url,
    String? title,
    String? variant,
    bool compress = false,
  }) async {
    final token = await _storage.read(key: _tokenKey);
    final cToken = await _storage.read(key: _creatorTokenKey);
    final deviceId = await getDeviceId();
    final headers = <String, dynamic>{
      if (token != null) 'Authorization': 'Bearer $token',
      if (cToken != null) 'Authorization': 'Bearer $cToken',
    };
    final resp = await _dio.get<ResponseBody>(
      '/download',
      queryParameters: {
        'url': url,
        if (title != null) 'title': title,
        if (variant != null) 'variant': variant,
        'compress': compress.toString(),
        'platform': 'android',
        'deviceId': deviceId,
        'deviceName': 'NovaFlix Mobile',
      },
      options: Options(
        responseType: ResponseType.stream,
        headers: headers,
        followRedirects: true,
      ),
    );
    final stream = resp.data?.stream;
    if (stream == null) return const Stream.empty();
    return stream.map((chunk) {
      if (chunk is Uint8List) return chunk;
      return Uint8List.fromList(chunk);
    });
  }

  Future<Response> subscribeNewsletter(String email) =>
      post('/newsletter/subscribe', data: {'email': email});

  Future<Response> getCampaigns() => get('/campaigns');
  Future<Response> createCampaign(Map<String, dynamic> data) =>
      post('/campaigns', data: data);
  Future<Response> updateCampaign(int id, Map<String, dynamic> data) =>
      patch('/campaigns/$id', data: data);

  Future<Response> startSession({String? deviceId}) => post(
    '/sessions/start',
    data: {if (deviceId != null) 'device_id': deviceId},
  );
  Future<Response> sessionHeartbeat({String? deviceId}) => post(
    '/sessions/heartbeat',
    data: {if (deviceId != null) 'device_id': deviceId},
  );
  Future<Response> endSession({String? deviceId}) => post(
    '/sessions/end',
    data: {if (deviceId != null) 'device_id': deviceId},
  );

  // ---- Download device registry (per-plan caps: student/basic 1, standard 2, premium 6) ----
  Future<Response> registerDownloadDevice({String? deviceId, String? deviceName, String? platform}) async {
    final id = deviceId ?? await getDeviceId();
    return post('/downloads/devices/register', data: {
      'device_id': id,
      if (deviceName != null) 'device_name': deviceName,
      if (platform != null) 'platform': platform,
    });
  }

  Future<Response> getDownloadDevices() => get('/downloads/devices');
  Future<Response> removeDownloadDevice(String deviceId) =>
      delete('/downloads/devices/$deviceId');

  Future<Response> adminGetUsers() => get('/admin/users');
  Future<Response> adminGetStats() => get('/admin/stats');
  Future<Response> adminGetUploads() => get('/admin/uploads');
  Future<Response> adminGetCreators() => get('/admin/creators');
  Future<Response> adminUpdateUserRole(String userId, String role) =>
      put('/admin/users/$userId/role', data: {'role': role});
  Future<Response> adminBanUser(String userId) =>
      post('/admin/users/$userId/ban');
  Future<Response> adminSendNewsletter(String subject, String content) => post(
    '/admin/newsletter/send',
    data: {'subject': subject, 'content': content},
  );
  Future<Response> adminGetNewsletterSubscribers() =>
      get('/admin/newsletter/subscribers');

  // ---------- News / Blog ----------
  Future<Response> getNews({
    String? category,
    String? q,
    int? page,
    bool? refresh,
  }) => get(
    '/news',
    params: {
      if (category != null) 'category': category,
      if (q != null) 'q': q,
      if (page != null) 'page': page,
      if (refresh != null) 'refresh': refresh,
    },
  );
  Future<Response> getHomeNews() => get('/news/home');
  Future<Response> getIndustryNews() => get('/news/industry');
  Future<Response> getNewsArticle(String url) =>
      get('/news/article', params: {'url': url});
  Future<Response> fetchDeepDive(String title, List<String> keywords) => get(
    '/news/fetch-deep-dive',
    params: {'title': title, 'keywords': keywords.join(',')},
  );

  // ---------- Trivia & Rewards ----------
  Future<Response> getDailyTrivia() => get('/trivia/today');
  Future<Response> submitDailyTrivia(List<Map<String, dynamic>> answers) =>
      post('/trivia/submit', data: {'answers': answers});
  Future<Response> getTriviaStreak() => get('/trivia/streak');
  Future<Response> getTriviaLeaderboard() => get('/trivia/leaderboard');
  Future<Response> getGuessMovie() => get('/trivia/guess');
  Future<Response> submitGuess(String questionId, int answerIndex) =>
      post('/trivia/guess/submit', data: {'questionId': questionId, 'answerIndex': answerIndex});
  Future<Response> getCoinsBalance() => get('/trivia/coins');
  Future<Response> getCosmetics() => get('/trivia/cosmetics');
  Future<Response> purchaseCosmetic(String id) =>
      post('/trivia/cosmetics/$id/purchase');
  Future<Response> equipCosmetic(String id, bool equipped) =>
      post('/trivia/cosmetics/$id/equip', data: {'equipped': equipped});

  // ---------- Notifications ----------
  Future<Response> getNotifications({int? limit}) =>
      get('/notifications', params: {if (limit != null) 'limit': limit});
  Future<Response> getUnreadNotifications() =>
      get('/notifications/unread-count');
  Future<Response> markNotificationRead(int id) =>
      post('/notifications/$id/read');
  Future<Response> markAllNotificationsRead() =>
      post('/notifications/read-all');

  // ---------- Push notifications ----------
  Future<Response> getPushStatus() => get('/push/status');
  Future<Response> subscribePush(Map<String, dynamic> data) =>
      post('/push/subscribe', data: data);
  Future<Response> unsubscribePush() => post('/push/unsubscribe');

  // ---------- Chat / DM ----------
  Future<Response> getConversations() => get('/chat/conversations');
  Future<Response> getDirectMessages(String userId, {int? limit}) => get(
    '/chat/messages',
    params: {'with': userId, if (limit != null) 'limit': limit},
  );

  // ---------- Forum / Hot Takes ----------
  Future<Response> getForumCategories() => get('/forum/categories');
  Future<Response> getForumTopics({
    String? category,
    int? limit,
    int? offset,
    String? sort,
  }) => get(
    '/forum/topics',
    params: {
      if (category != null) 'category': category,
      if (limit != null) 'limit': limit,
      if (offset != null) 'offset': offset,
      if (sort != null) 'sort': sort,
    },
  );
  Future<Response> getForumTopic(int id) => get('/forum/topics/$id');
  Future<Response> createForumTopic(Map<String, dynamic> data) =>
      post('/forum/topics', data: data);
  Future<Response> voteForumTopic(int id, int value) =>
      post('/forum/topics/$id/vote', data: {'vote': value});
  Future<Response> addForumReply(int id, String content, {int? parentId}) =>
      post(
        '/forum/topics/$id/replies',
        data: {'content': content, if (parentId != null) 'parentId': parentId},
      );
  Future<Response> voteForumReply(int replyId, int value) =>
      post('/forum/replies/$replyId/vote', data: {'vote': value});

  // ---------- Public profiles / fan ----------
  Future<Response> getFollowStats(String userId) =>
      get('/interactions/follow-stats', params: {'userId': userId});
  Future<Response> getFollowers(String userId) =>
      get('/interactions/followers', params: {'userId': userId});
  Future<Response> getFollowing(String userId) =>
      get('/interactions/following', params: {'userId': userId});
  Future<Response> getFanLeaderboard(String creatorId) =>
      get('/fan/$creatorId/leaderboard');
  Future<Response> getFanStatus(String creatorId) =>
      get('/fan/$creatorId/status');
}

/// Converts a caught exception into a short, human-friendly message for UI
/// error banners. Server-provided error text is preferred (e.g. "Invalid
/// credentials"); network/timeout failures are described without leaking
/// internal details.
String friendlyErrorMessage(Object e) {
  if (e is DioException) {
    final resp = e.response;
    if (resp != null) {
      final data = resp.data;
      if (data is Map) {
        final msg = (data['error'] ?? data['message']) as String?;
        if (msg != null && msg.isNotEmpty) return msg;
      }
      if (resp.statusCode == 401) return 'Invalid credentials';
      if (resp.statusCode == 429) {
        return 'Too many attempts. Please try again later.';
      }
      return 'Something went wrong (${resp.statusCode}). Please try again.';
    }

    final errText = (e.error?.toString() ?? e.message ?? '').toLowerCase();
    final unreachable =
        errText.contains('refused') || errText.contains('failed to connect');

    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.transformTimeout:
        return "Can't connect to the server. Please check your internet connection and try again.";
      case DioExceptionType.connectionError:
      case DioExceptionType.unknown:
        if (unreachable) {
          return "Can't connect to the server. Please try again later.";
        }
        return 'No internet connection. Check your connection and try again.';
      case DioExceptionType.badCertificate:
        return "Can't connect securely to the server.";
      case DioExceptionType.cancel:
        return 'Request cancelled.';
      case DioExceptionType.badResponse:
        return 'Something went wrong. Please try again.';
    }
  }
  return 'Something went wrong. Please try again.';
}
