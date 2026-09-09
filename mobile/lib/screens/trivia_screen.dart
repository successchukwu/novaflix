import 'dart:async';
import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'dart:ui' show ImageFilter;
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../core/responsive.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';
import '../services/ws_service.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';
import '../utils/format_time.dart';
import '../widgets/ui/index.dart';
import '../widgets/features/index.dart';
import '../widgets/movie_card.dart';

final _coinsProvider = FutureProvider<int>((ref) async {
  final api = ref.read(apiServiceProvider);
  final data = (await api.getCoinsBalance()).data;
  return (data is Map && data['coins'] is num)
      ? (data['coins'] as num).toInt()
      : 0;
});

final _dailyTriviaProvider = FutureProvider<List<Map<String, dynamic>>>((
  ref,
) async {
  final api = ref.read(apiServiceProvider);
  final data = (await api.getDailyTrivia()).data;
  return ((data is Map ? data['questions'] : null) as List? ?? [])
      .cast<Map<String, dynamic>>();
});

final _guessProvider = FutureProvider<Map<String, dynamic>>((ref) async {
  final api = ref.read(apiServiceProvider);
  final data = (await api.getGuessMovie()).data;
  if (data is! Map || data['question'] is! Map) return <String, dynamic>{};
  return Map<String, dynamic>.from(data['question'] as Map);
});

final _cosmeticsProvider =
    FutureProvider<({List<Map<String, dynamic>> items, int coins})>((
      ref,
    ) async {
      final api = ref.read(apiServiceProvider);
      final data = (await api.getCosmetics()).data;
      final items = ((data is Map ? data['cosmetics'] : null) as List? ?? [])
          .cast<Map<String, dynamic>>();
      final coins = (data is Map && data['coins'] is num)
          ? (data['coins'] as num).toInt()
          : 0;
      return (items: items, coins: coins);
    });

final _leaderboardProvider = FutureProvider<List<Map<String, dynamic>>>((
  ref,
) async {
  final api = ref.read(apiServiceProvider);
  final data = (await api.getTriviaLeaderboard()).data;
  return ((data is Map ? data['leaderboard'] : null) as List? ?? [])
      .cast<Map<String, dynamic>>();
});

class TriviaScreen extends ConsumerStatefulWidget {
  const TriviaScreen({super.key});

  @override
  ConsumerState<TriviaScreen> createState() => _TriviaScreenState();
}

class _TriviaScreenState extends ConsumerState<TriviaScreen> {
  static const _tabs = [
    'Daily Trivia',
    'Guess the Movie',
    'Cosmetics Shop',
    'Leaderboard',
  ];

  int _tab = 0;

  int _qIndex = 0;
  int? _selected;
  bool _dailyBusy = false;
  int _correctCount = 0;
  int _coinsEarned = 0;
  int _streak = 0;
  bool _dailyDone = false;

  int? _guessSelected;
  Map<String, dynamic>? _guessResult;
  bool _guessBusy = false;

  Timer? _countdownTimer;
  String _countdownText = '';

  WebSocketChannel? _wsChannel;
  StreamSubscription? _wsSub;

  int _int(dynamic v, [int fallback = 0]) => v is num ? v.toInt() : fallback;

  @override
  void initState() {
    super.initState();
    _startCountdownTimer();
    _connectWs();
  }

  Future<void> _connectWs() async {
    try {
      final ch = await WsService.connect('/ws');
      if (!mounted) { try { ch.sink.close(); } catch (_) {} return; }
      _wsChannel = ch;
      _wsSub = ch.stream.listen((raw) {
        try {
          final data = raw is String ? jsonDecode(raw) : jsonDecode(raw.toString());
          if (data is! Map) return;
          final type = data['type']?.toString();
          if (type == 'coins:update' && data['coins'] is num) {
            ref.invalidate(_coinsProvider);
            ref.invalidate(_cosmeticsProvider);
          } else if (type == 'trivia:leaderboard' && data['leaderboard'] is List) {
            ref.invalidate(_leaderboardProvider);
          } else if (type == 'cosmetics:update') {
            ref.invalidate(_cosmeticsProvider);
          }
        } catch (_) {}
      });
    } catch (_) {}
  }

  @override
  void dispose() {
    _countdownTimer?.cancel();
    _wsSub?.cancel();
    try { _wsChannel?.sink.close(); } catch (_) {}
    super.dispose();
  }

  void _startCountdownTimer() {
    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      final now = DateTime.now().toUtc();
      final midnight = DateTime(now.year, now.month, now.day + 1, 0, 0, 0, 0, 0);
      final diff = midnight.difference(now);
      if (diff.isNegative) {
        _countdownTimer?.cancel();
        setState(() => _countdownText = 'New trivia available!');
        _loadDailyTrivia();
      } else {
        final hours = diff.inHours;
        final minutes = diff.inMinutes % 60;
        final seconds = diff.inSeconds % 60;
        setState(() {
          _countdownText =
              '${hours.toString().padLeft(2, '0')}:${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
        });
      }
      });
    }

  Future<void> _loadDailyTrivia() async {
    ref.invalidate(_dailyTriviaProvider);
    setState(() {
      _qIndex = 0;
      _selected = null;
      _dailyBusy = false;
      _correctCount = 0;
      _coinsEarned = 0;
      _streak = 0;
      _dailyDone = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    if (user == null) {
      return Scaffold(
        backgroundColor: AppColors.background,
        body: SafeArea(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.quiz, size: 48, color: AppColors.primaryContainer),
                  const SizedBox(height: 16),
                  Text(
                    'Trivia & Rewards',
                    style: AppTypography.headlineMd.copyWith(
                      color: AppColors.onSurface,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Sign in to play trivia and earn coins.',
                    textAlign: TextAlign.center,
                    style: AppTypography.bodyMd.copyWith(
                      color: AppColors.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: 20),
                  FilledButton(
                    onPressed: () => context.push('/login?redirect=/trivia'),
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.primaryContainer,
                      foregroundColor: AppColors.onPrimaryContainer,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 24,
                        vertical: 12,
                      ),
                    ),
                    child: const Text('Sign in'),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Trivia & Rewards'),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: Center(child: _buildCoinsPill()),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
            child: AppTabs(
              tabs: _tabs,
              activeIndex: _tab,
              onChanged: _onTabChanged,
              scrollable: true,
            ),
          ),
          Expanded(child: _buildBody()),
        ],
      ),
    );
  }

  Widget _buildCoinsPill() {
    return ref
        .watch(_coinsProvider)
        .when(
          data: (coins) => Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: AppColors.surfaceContainerHigh,
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: AppColors.outlineVariant),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.star_rounded,
                  size: 16,
                  color: AppColors.primary,
                ),
                const SizedBox(width: 4),
                Text(
                  '$coins',
                  style: AppTypography.labelMd.copyWith(
                    color: AppColors.onSurface,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
          loading: () => Container(
            width: 44,
            height: 26,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: AppColors.surfaceContainerHigh,
              borderRadius: BorderRadius.circular(999),
            ),
            child: const SizedBox(
              width: 14,
              height: 14,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                valueColor: AlwaysStoppedAnimation(AppColors.primary),
              ),
            ),
          ),
          error: (_, _) => const SizedBox.shrink(),
        );
  }

  void _onTabChanged(int i) {
    setState(() => _tab = i);
    if (i == 1) ref.invalidate(_guessProvider);
    if (i == 2) ref.invalidate(_cosmeticsProvider);
    if (i == 3) ref.invalidate(_leaderboardProvider);
    ref.invalidate(_coinsProvider);
  }

  Widget _buildBody() {
    switch (_tab) {
      case 0:
        return _buildDaily();
      case 1:
        return _buildGuess();
      case 2:
        return _buildShop();
      default:
        return _buildLeaderboard();
    }
  }

  // ---------- Tab 1: Daily Trivia ----------

  Widget _buildDaily() {
    final trivia = ref.watch(_dailyTriviaProvider);
    return trivia.when(
      loading: () => const LoadingSpinner(),
      error: (e, _) => Center(
        child: Text(
          'Error: $e',
          style: const TextStyle(color: AppColors.error),
        ),
      ),
      data: (items) {
        if (_dailyDone) return _buildDailyResult(items.length);
        if (items.isEmpty) {
          return Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.quiz_outlined,
                  size: 64,
                  color: AppColors.onSurfaceVariant,
                ),
                const SizedBox(height: 16),
                Text(
                  'No trivia available today — check back soon!',
                  textAlign: TextAlign.center,
                  style: AppTypography.bodyMd.copyWith(
                    color: AppColors.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          );
        }
        return Column(
          children: [
            if (_countdownText.isNotEmpty)
              Padding(
                padding: const EdgeInsets.all(16),
                child: Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: AppColors.primaryContainer.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppColors.primaryContainer),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(
                        Icons.schedule,
                        color: AppColors.primary,
                        size: 20,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        'Next trivia in $_countdownText',
                        style: AppTypography.labelMd.copyWith(
                          color: AppColors.primary,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            _buildDailyQuestions(items),
          ],
        );
      },
    );
  }

  Widget _buildDailyQuestions(List<Map<String, dynamic>> items) {
    final qi = _qIndex < items.length ? _qIndex : items.length - 1;
    final q = items[qi];
        final options =
            (q['options'] as List?)?.map((o) => o.toString()).toList() ??
            <String>[];
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Row(
              children: [
                Text(
                  'Question ${qi + 1} of ${items.length}',
                  style: AppTypography.labelXs.copyWith(
                    color: AppColors.onSurfaceVariant,
                  ),
                ),
                const Spacer(),
                ...List.generate(items.length, (i) {
                  final color = i < qi
                      ? AppColors.secondary
                      : i == qi
                      ? AppColors.primary
                      : AppColors.onSurfaceVariant.withValues(alpha: 0.35);
                  return Container(
                    width: 6,
                    height: 6,
                    margin: const EdgeInsets.only(left: 4),
                    decoration: BoxDecoration(
                      color: color,
                      shape: BoxShape.circle,
                    ),
                  );
                }),
              ],
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.surfaceContainerHigh,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (q['image_url'] != null) ...[
                        ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: SizedBox(
                            width: 44,
                            height: 56,
                            child: CachedNetworkImage(
                              imageUrl: q['image_url'].toString(),
                              fit: BoxFit.cover,
                              placeholder: (_, _) => Container(
                                color: AppColors.surfaceContainerHighest,
                              ),
                              errorWidget: (_, _, _) => Container(
                                color: AppColors.surfaceContainerHighest,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                      ],
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _difficultyBadge(q['difficulty']?.toString()),
                            const SizedBox(height: 6),
                            Text(
                              q['question']?.toString() ?? '',
                              style: AppTypography.bodyMd.copyWith(
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  ...List.generate(options.length, (i) {
                    return _optionTile(
                      label: options[i],
                      index: i,
                      selected: _selected == i,
                      disabled: _dailyBusy,
                      onTap: _dailyBusy
                          ? null
                          : () => _pickAnswer(q, i, items.length),
                    );
                  }),
                 ],
               ),
             ),
           ],
         );
   }

  // Batch answer collection: store locally, submit all at end. Prevents 500 from per-question half-batch and matches PASS 0.7 logic.
  final Map<String,int> _batchAnswers = {};
  bool _submittingBatch = false;

  Future<void> _pickAnswer(Map<String, dynamic> q, int idx, int total) async {
    if (_dailyBusy || _submittingBatch) return;
    final qid = q['id']?.toString();
    if (qid == null || qid.isEmpty) { _floatError(friendlyErrorMessage(Exception('Invalid question'))); return; }
    if (idx < 0 || idx > 10) { _floatError(friendlyErrorMessage(Exception('Invalid answer'))); return; }
    setState(() { _selected = idx; });
    // brief highlight then record
    await Future.delayed(const Duration(milliseconds: 350));
    if (!mounted) return;
    _batchAnswers[qid] = idx;
    final isLast = _qIndex >= total - 1;
    if (isLast) {
      await _submitBatch(total);
    } else {
      setState(() { _qIndex = _qIndex + 1; _selected = null; });
    }
  }

  Future<void> _submitBatch(int total) async {
    if (_submittingBatch) return;
    setState(() { _submittingBatch = true; _dailyBusy = true; });
    try {
      final api = ref.read(apiServiceProvider);
      final answers = _batchAnswers.entries.map((e) => {'id': e.key, 'answerIndex': e.value}).toList();
      if (answers.isEmpty) { setState(() { _submittingBatch = false; _dailyBusy = false; }); return; }
      final res = await api.submitDailyTrivia(answers);
      final body = res.data;
      if (!mounted) return;
      if (body is Map && body['success'] == true) {
        // PASS 0.7 is server-computed; honor it directly
        final passed = body['passed'] == true;
        final score = _int(body['score']);
        final totalResp = _int(body['total'], total);
        // coinsEarned is zero when failed (threshold not met) — reflect that
        final coinsEarned = _int(body['coinsEarned']);
        final streak = _int(body['streak'], _streak);
        ref.invalidate(_coinsProvider);
        ref.invalidate(_leaderboardProvider);
        setState(() {
          _correctCount = score;
          _coinsEarned = coinsEarned;
          _streak = streak;
          _dailyDone = true;
          _selected = null;
          _dailyBusy = false;
          _submittingBatch = false;
          // keep passed via correctCount/total but also respect server flag for UI
          if (!passed && totalResp > 0) {
            // ensure tier reflects fail (0.4 threshold handled in result view)
          }
        });
        // alreadyPlayed is handled via UI state, no error banner needed
      } else {
        setState(() { _selected = null; _dailyBusy = false; _submittingBatch = false; });
        _floatError(friendlyErrorMessage(Exception(body is Map ? (body['error']?.toString() ?? 'Submit failed') : 'Submit failed')));
      }
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() { _selected = null; _dailyBusy = false; _submittingBatch = false; });
      // handle 429 / dailyLimitReached friendly
      final data = e.response?.data;
      if (data is Map && data['dailyLimitReached'] == true) {
        setState(() => _dailyDone = true);
      }
      _floatError(friendlyErrorMessage(e));
    } catch (e) {
      if (!mounted) return;
      setState(() { _selected = null; _dailyBusy = false; _submittingBatch = false; });
      _floatError(friendlyErrorMessage(e));
    }
  }

  Widget _buildDailyResult(int total) {
    final pct = total > 0 ? _correctCount / total : 0.0;
    final Color tierColor;
    final String tierLabel;
    final String tierCopy;
    if (pct >= 0.7) {
      tierColor = const Color(0xFF22C55E);
      tierLabel = 'Excellent!';
      tierCopy = 'You clearly know your films. Bravo!';
    } else if (pct >= 0.4) {
      tierColor = const Color(0xFFF97316);
      tierLabel = 'Good!';
      tierCopy = 'Solid effort — the next round is yours.';
    } else {
      tierColor = const Color(0xFFEF4444);
      tierLabel = 'You failed';
      tierCopy = "Don't worry — even hits have outtakes. Try again!";
    }
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: AppColors.surfaceContainerHigh,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.white.withValues(alpha: 0.05)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              width: 80,
              height: 80,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: tierColor.withValues(alpha: 0.15),
                shape: BoxShape.circle,
              ),
              child: Icon(
                pct >= 0.4 ? Icons.check_rounded : Icons.close_rounded,
                size: 44,
                color: tierColor,
              ),
            ),
            const SizedBox(height: 16),
            Text(
              tierLabel,
              style: AppTypography.headlineSm.copyWith(color: AppColors.onSurface),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 4),
            Text(
              '$_correctCount/$total',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.w800,
                color: tierColor,
              ),
            ),
            const SizedBox(height: 12),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: pct,
                minHeight: 8,
                backgroundColor: AppColors.surfaceContainerHighest,
                color: tierColor,
              ),
            ),
            const SizedBox(height: 12),
            Text(
              tierCopy,
              textAlign: TextAlign.center,
              style: AppTypography.bodyMd.copyWith(
                color: AppColors.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 20),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(
                  Icons.star_rounded,
                  size: 18,
                  color: AppColors.primary,
                ),
                const SizedBox(width: 6),
                Text(
                  '+$_coinsEarned coins earned · Current streak: $_streak 🔥',
                  style: AppTypography.labelMd.copyWith(
                    color: AppColors.onSurface,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),
            AppButton(label: 'Play again', onPressed: _playAgain),
            const SizedBox(height: 8),
            AppButton(
              label: 'Spend coins',
              outlined: true,
              onPressed: () => _onTabChanged(2),
            ),
          ],
        ),
      ),
    );
  }

  void _playAgain() {
    ref.invalidate(_dailyTriviaProvider);
    setState(() {
      _qIndex = 0;
      _selected = null;
      _dailyBusy = false;
      _correctCount = 0;
      _coinsEarned = 0;
      _streak = 0;
      _dailyDone = false;
    });
  }

  // ---------- Tab 2: Guess the Movie ----------

  Widget _buildGuess() {
    final guess = ref.watch(_guessProvider);
    return guess.when(
      loading: () => const LoadingSpinner(),
      error: (e, _) => Center(
        child: Text(
          'Error: $e',
          style: const TextStyle(color: AppColors.error),
        ),
      ),
      data: (q) {
        if (q.isEmpty) {
          return Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.movie_outlined,
                  size: 64,
                  color: AppColors.onSurfaceVariant,
                ),
                const SizedBox(height: 16),
                Text(
                  'No movie to guess right now.',
                  style: AppTypography.bodyMd.copyWith(
                    color: AppColors.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          );
        }
        final imageUrl = q['image_url']?.toString();
        final clue = q['clue']?.toString();
        final options =
            (q['options'] as List?)?.map((o) => o.toString()).toList() ??
            <String>[];
        final hasResult = _guessResult != null;
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.surfaceContainerHigh,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Guess the Movie',
                    style: AppTypography.headlineSm,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '15 coins per correct guess',
                    textAlign: TextAlign.center,
                    style: AppTypography.bodySm.copyWith(
                      color: AppColors.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: 16),
                  _blurredPoster(imageUrl),
                  if (clue != null && clue.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    Text(
                      '“$clue…”',
                      textAlign: TextAlign.center,
                      style: AppTypography.bodySm.copyWith(
                        color: AppColors.onSurfaceVariant,
                        fontStyle: FontStyle.italic,
                      ),
                    ),
                  ],
                  const SizedBox(height: 16),
                  ...List.generate(options.length, (i) {
                    final picked = _guessSelected == i;
                    Color? accent;
                    IconData? trailing;
                    if (hasResult && picked) {
                      final correct = _guessResult?['correct'] == true;
                      accent = correct ? AppColors.secondary : AppColors.error;
                      trailing = correct ? Icons.check_circle : Icons.cancel;
                    }
                    return _optionTile(
                      label: options[i],
                      index: i,
                      selected: hasResult ? picked : false,
                      accent: accent,
                      trailingIcon: trailing,
                      disabled: _guessBusy || _guessSelected != null,
                      onTap: (_guessBusy || _guessSelected != null)
                          ? null
                          : () => _submitGuess(q, i),
                    );
                  }),
                ],
              ),
            ),
            if (hasResult) ...[const SizedBox(height: 12), _buildGuessResult()],
          ],
        );
      },
    );
  }

  Future<void> _submitGuess(Map<String, dynamic> q, int idx) async {
    if (_guessBusy || _guessSelected != null) return;
    if (idx < 0 || idx > 10) { _floatError(friendlyErrorMessage(Exception('Invalid answer'))); return; }
    final api = ref.read(apiServiceProvider);
    setState(() {
      _guessBusy = true;
      _guessSelected = idx;
    });
    try {
      final res = await api.submitGuess(q['id'].toString(), idx);
      final body = res.data;
      if (!mounted) return;
      if (body is Map && body['success'] == true) {
        ref.invalidate(_coinsProvider);
        ref.invalidate(_leaderboardProvider);
        setState(() {
          _guessResult = Map<String, dynamic>.from(body);
          _guessBusy = false;
        });
      } else {
        final isDaily = body is Map && body['dailyLimitReached'] == true;
        if (isDaily) _floatError('Daily guess limit reached. Come back tomorrow!');
        else _floatError(friendlyErrorMessage(Exception(body is Map ? (body['error']?.toString() ?? 'Failed') : 'Failed')));
        setState(() { _guessSelected = null; _guessBusy = false; });
      }
    } on DioException catch (e) {
      if (!mounted) return;
      final data = e.response?.data;
      final daily = data is Map && data['dailyLimitReached'] == true;
      final is429 = e.response?.statusCode == 429;
      if (daily) {
        _floatError('Daily guess limit reached. Come back tomorrow!');
      } else if (is429) {
        _floatError(friendlyErrorMessage(e));
      } else {
        _floatError(friendlyErrorMessage(e));
      }
      setState(() { _guessSelected = null; _guessBusy = false; });
    } catch (e) {
      if (mounted) {
        setState(() { _guessSelected = null; _guessBusy = false; });
        _floatError(friendlyErrorMessage(e));
      }
    }
  }

  Widget _buildGuessResult() {
    final correct = _guessResult?['correct'] == true;
    final answer = _guessResult?['answer']?.toString() ?? '';
    final coins = _int(_guessResult?['coinsEarned']);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(
                correct ? Icons.check_circle : Icons.cancel,
                size: 22,
                color: correct ? AppColors.secondary : AppColors.error,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  correct ? 'Correct! It was $answer' : 'Nope — it was $answer',
                  style: AppTypography.bodyMd.copyWith(
                    color: correct ? AppColors.secondary : AppColors.error,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
          if (coins > 0) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                const Icon(
                  Icons.star_rounded,
                  size: 16,
                  color: AppColors.primary,
                ),
                const SizedBox(width: 4),
                Text('+$coins coins', style: AppTypography.labelMd),
              ],
            ),
          ],
          const SizedBox(height: 16),
          AppButton(label: 'Next movie', onPressed: _nextGuess),
        ],
      ),
    );
  }

  void _nextGuess() {
    setState(() {
      _guessSelected = null;
      _guessResult = null;
      _guessBusy = false;
    });
    ref.invalidate(_guessProvider);
    ref.invalidate(_coinsProvider);
  }

Widget _blurredPoster(String? url) {
    final bool revealed = _guessSelected != null;
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: Stack(
        children: [
          if (url != null)
            ImageFiltered(
              imageFilter: ImageFilter.blur(
                  sigmaX: revealed ? 0 : 12, sigmaY: revealed ? 0 : 12),
              child: CachedNetworkImage(
                imageUrl: url,
                height: 240,
                width: double.infinity,
                fit: BoxFit.cover,
                placeholder: (_, _) => Container(
                  height: 240,
                  color: AppColors.surfaceContainerHigh,
                ),
                errorWidget: (_, _, _) => Container(
                  height: 240,
                  color: AppColors.surfaceContainerHighest,
                  child: const Icon(
                    Icons.movie_creation_outlined,
                    size: 40,
                    color: AppColors.onSurfaceVariant,
                  ),
                ),
              ),
            )
          else
            Container(
              height: 240,
              width: double.infinity,
              color: AppColors.surfaceContainerHigh,
              child: const Icon(
                Icons.movie_creation_outlined,
                size: 40,
                color: AppColors.onSurfaceVariant,
              ),
            ),
          Positioned.fill(
            child: Container(
                color: revealed
                    ? Colors.transparent
                    : AppColors.black.withValues(alpha: 0.4)),
          ),
          if (!revealed && url != null)
            Positioned.fill(
              child: Center(
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 8,
                  ),
                  decoration: BoxDecoration(
                    color: AppColors.black.withValues(alpha: 0.6),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Text(
                    'Can you name it?',
                    style: TextStyle(
                      color: AppColors.onSurfaceVariant,
                      fontSize: 13,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      );
  }

  // ---------- Tab 3: Cosmetics Shop ----------

  Widget _buildShop() {
    final shop = ref.watch(_cosmeticsProvider);
    return shop.when(
      loading: () => const LoadingSpinner(),
      error: (e, _) => Center(
        child: Text(
          'Error: $e',
          style: const TextStyle(color: AppColors.error),
        ),
      ),
      data: (data) {
        if (data.items.isEmpty) {
          return Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.shopping_bag_outlined,
                  size: 64,
                  color: AppColors.onSurfaceVariant,
                ),
                const SizedBox(height: 16),
                Text(
                  'The shop is empty right now.',
                  style: AppTypography.bodyMd.copyWith(
                    color: AppColors.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          );
        }
        return LayoutBuilder(
          builder: (context, constraints) => GridView.builder(
            padding: const EdgeInsets.all(16),
            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: gridColumns(constraints.maxWidth - 32),
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
              childAspectRatio: gridAspectRatio(constraints.maxWidth - 32, gridColumns(constraints.maxWidth - 32)),
            ),
          itemCount: data.items.length,
          itemBuilder: (_, i) {
            final item = data.items[i];
            return _CosmeticCard(
              item: item,
              coins: data.coins,
              onBuy: () => _buyCosmetic(item),
              onEquip: () => _equipCosmetic(item),
            );
          },
          ),
        );
      },
    );
  }

  Future<void> _buyCosmetic(Map<String, dynamic> item) async {
    final api = ref.read(apiServiceProvider);
    try {
      await api.purchaseCosmetic(_itemId(item));
      if (mounted) {
        ref.invalidate(_cosmeticsProvider);
        ref.invalidate(_coinsProvider);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Bought ${item['name']?.toString() ?? 'cosmetic'}!'),
            backgroundColor: AppColors.secondary,
          ),
        );
      }
    } on DioException catch (e) {
      if (mounted) _floatError(friendlyErrorMessage(e));
    } catch (e) {
      if (mounted) _floatError(friendlyErrorMessage(e));
    }
  }

  Future<void> _equipCosmetic(Map<String, dynamic> item) async {
    final api = ref.read(apiServiceProvider);
    try {
      final bool currentlyEquipped = item['equipped'] == true;
      await api.equipCosmetic(_itemId(item), !currentlyEquipped);
      if (mounted) {
        ref.invalidate(_cosmeticsProvider);
        ref.invalidate(_coinsProvider);
      }
    } on DioException catch (e) {
      if (mounted) _floatError(friendlyErrorMessage(e));
    } catch (e) {
      if (mounted) _floatError(friendlyErrorMessage(e));
    }
  }

  String _itemId(Map<String, dynamic> item) {
    final id = item['id'];
    return id?.toString() ?? '';
  }

  // ---------- Tab 4: Leaderboard ----------

  Widget _buildLeaderboard() {
    final board = ref.watch(_leaderboardProvider);
    return board.when(
      loading: () => const LoadingSpinner(),
      error: (e, _) => Center(
        child: Text(
          'Error: $e',
          style: const TextStyle(color: AppColors.error),
        ),
      ),
      data: (rows) {
        if (rows.isEmpty) {
          return Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.leaderboard_outlined,
                  size: 64,
                  color: AppColors.onSurfaceVariant,
                ),
                const SizedBox(height: 16),
                Text(
                  'No trivia played yet — be the first!',
                  style: AppTypography.bodyMd.copyWith(
                    color: AppColors.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          );
        }
        return ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: rows.length,
          itemBuilder: (_, i) => _LeaderboardTile(rank: i + 1, row: rows[i]),
        );
      },
    );
  }

  // ---------- Shared widgets ----------

  Widget _optionTile({
    required String label,
    required int index,
    bool selected = false,
    bool disabled = false,
    Color? accent,
    IconData? trailingIcon,
    VoidCallback? onTap,
  }) {
    final color =
        accent ?? (selected ? AppColors.primary : AppColors.onSurface);
    return GestureDetector(
      onTap: disabled ? null : onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.surfaceContainerHigh,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: selected
                ? (accent ?? AppColors.primary)
                : AppColors.transparent,
            width: 1.4,
          ),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(
                '${String.fromCharCode(65 + index)}. $label',
                style: AppTypography.bodyMd.copyWith(
                  color: color,
                  fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
                ),
              ),
            ),
            if (trailingIcon != null)
              Icon(
                trailingIcon,
                size: 18,
                color: accent ?? AppColors.onSurfaceVariant,
              ),
          ],
        ),
      ),
    );
  }

  Widget _difficultyBadge(String? difficulty) {
    final Color color;
    switch (difficulty?.toLowerCase()) {
      case 'easy':
        color = AppColors.secondary;
        break;
      case 'medium':
        color = AppColors.primaryLight;
        break;
      case 'hard':
        color = AppColors.error;
        break;
      default:
        color = AppColors.onSurfaceVariant;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        (difficulty ?? 'trivia').toUpperCase(),
        style: AppTypography.labelXs.copyWith(color: color),
      ),
    );
  }

  void _floatError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: AppColors.errorContainer,
      ),
    );
  }
}

class _CosmeticCard extends StatelessWidget {
  final Map<String, dynamic> item;
  final int coins;
  final Future<void> Function() onBuy;
  final Future<void> Function() onEquip;

  const _CosmeticCard({
    required this.item,
    required this.coins,
    required this.onBuy,
    required this.onEquip,
  });

  @override
  Widget build(BuildContext context) {
    final owned = item['owned'] == true;
    final equipped = item['equipped'] == true;
    final price = item['price'] is num ? (item['price'] as num).toInt() : 0;
    final icon = item['icon']?.toString() ?? '';
    final name = item['name']?.toString() ?? 'Cosmetic';
    final description = item['description']?.toString();
    final kind = item['kind']?.toString() ?? item['type']?.toString() ?? '';
    final canBuy = coins >= price;

    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppColors.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          icon.isNotEmpty
              ? Text(icon, style: const TextStyle(fontSize: 28))
              : const Icon(
                  Icons.auto_awesome,
                  size: 28,
                  color: AppColors.onSurfaceVariant,
                ),
          if (kind.isNotEmpty)
            Text(
              kind.replaceAll('_', ' ').toUpperCase(),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.labelXs.copyWith(
                color: AppColors.onSurfaceVariant,
              ),
            ),
          Text(
            name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
            style: AppTypography.labelSm.copyWith(color: AppColors.onSurface),
          ),
          if (description != null)
            Text(
              description,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: TextStyle(color: AppColors.onSurfaceVariant, fontSize: 10),
            ),
          if (owned)
            SizedBox(
              width: double.infinity,
              height: 30,
              child: TextButton(
                onPressed: equipped ? null : onEquip,
                style: TextButton.styleFrom(
                  padding: EdgeInsets.zero,
                  backgroundColor: equipped
                      ? AppColors.surfaceContainerHighest
                      : AppColors.primary,
                  foregroundColor: equipped
                      ? AppColors.onSurfaceVariant
                      : AppColors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
                child: Text(
                  equipped ? 'Equipped' : 'Equip',
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            )
          else
            SizedBox(
              width: double.infinity,
              height: 30,
              child: TextButton(
                onPressed: canBuy ? onBuy : null,
                style: TextButton.styleFrom(
                  padding: EdgeInsets.zero,
                  backgroundColor: AppColors.primary,
                  foregroundColor: canBuy
                      ? AppColors.white
                      : AppColors.onSurfaceVariant,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
                child: Text(
                  '$price coins',
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _LeaderboardTile extends StatelessWidget {
  final int rank;
  final Map<String, dynamic> row;

  const _LeaderboardTile({required this.rank, required this.row});

  @override
  Widget build(BuildContext context) {
    final name = row['name']?.toString() ?? 'Anonymous';
    final points = row['points'] ?? row['score'] ?? 0;
    final correct = row['correct'];
    final answered = row['answered'];
    final avatar = row['avatar']?.toString();
    final badgeColor = rank == 1
        ? AppColors.primary
        : rank == 2
        ? AppColors.onSurface
        : rank == 3
        ? AppColors.primaryLight
        : AppColors.onSurfaceVariant;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Container(
            width: 28,
            height: 28,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: badgeColor.withValues(alpha: 0.15),
              shape: BoxShape.circle,
            ),
            child: Text(
              '$rank',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: badgeColor,
              ),
            ),
          ),
          const SizedBox(width: 12),
          CircleAvatar(
            radius: 14,
            backgroundColor: AppColors.surfaceContainerHighest,
            backgroundImage: avatar != null ? NetworkImage(avatar) : null,
            child: avatar == null
                ? const Icon(
                    Icons.person,
                    size: 16,
                    color: AppColors.onSurfaceVariant,
                  )
                : null,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.labelMd.copyWith(
                    color: AppColors.onSurface,
                  ),
                ),
                if (correct != null)
                  Text(
                    '$correct/${answered ?? 0} correct',
                    style: TextStyle(
                      color: AppColors.onSurfaceVariant,
                      fontSize: 12,
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(
            '${points is num ? points.toInt() : points} pts',
            style: AppTypography.labelMd.copyWith(
              color: AppColors.onSurfaceVariant,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}
