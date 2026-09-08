import 'package:flutter/material.dart';
import '../services/currency_service.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';
import '../widgets/ui/index.dart';
import '../core/responsive.dart';
import '../widgets/features/index.dart';

final _eventsProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final api = ref.read(apiServiceProvider);
  final res = await api.getEvents(includePast: true);
  final data = res.data['events'] as List? ?? res.data['data'] as List? ?? [];
  return data.cast<Map<String, dynamic>>();
});

final _ticketsProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final api = ref.read(apiServiceProvider);
  final res = await api.getMyTickets();
  final data = res.data['tickets'] as List? ?? res.data['data'] as List? ?? [];
  return data.cast<Map<String, dynamic>>();
});

class RedCarpetScreen extends ConsumerStatefulWidget {
  const RedCarpetScreen({super.key});

  @override
  ConsumerState<RedCarpetScreen> createState() => _RedCarpetScreenState();
}

class _RedCarpetScreenState extends ConsumerState<RedCarpetScreen> {
  String? _purchasingId;

  bool _hasTicket(
    List<Map<String, dynamic>> tickets,
    Map<String, dynamic> event,
  ) {
    final id = event['id'].toString();
    return tickets.any((t) => t['event_id']?.toString() == id);
  }

  Future<void> _purchase(Map<String, dynamic> event) async {
    final user = ref.read(authProvider).user;
    if (user == null) {
      context.push('/login?redirect=/red-carpet');
      return;
    }
    final id = event['id'];
    if (id is! int && id is! String) return;
    final eventId = int.tryParse(id.toString()) ?? -1;
    if (eventId < 0) return;
    setState(() => _purchasingId = id.toString());
    try {
      final api = ref.read(apiServiceProvider);
      final res = await api.purchaseTicket(eventId);
      final body = res.data is Map ? res.data : <String, dynamic>{};
      if (body['free'] == true) {
        ref.invalidate(_ticketsProvider);
        ref.invalidate(_eventsProvider);
        _toast('You got your ticket!');
      } else if (body['authorization_url'] != null) {
        if (context.mounted) {
          context.push(
            '/payment-success?reference=${body['reference'] ?? ''}&source=event',
          );
        }
      } else {
        _toast(body['error']?.toString() ?? 'Purchase failed. Try again.');
      }
    } catch (_) {
      if (mounted) _toast('Purchase failed. Try again.');
    } finally {
      if (mounted) setState(() => _purchasingId = null);
    }
  }

  void _toast(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: AppColors.surfaceContainerHigh,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final events = ref.watch(_eventsProvider);
    final user = ref.watch(authProvider).user;
    final tickets = user != null
        ? ref.watch(_ticketsProvider).valueOrNull ?? []
        : <Map<String, dynamic>>[];
    final width = MediaQuery.sizeOf(context).width;
    final size = screenSizeFor(width);
    final hPadding = responsivePadding(width);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _hero(size),
            Padding(
              padding: EdgeInsets.fromLTRB(hPadding, 24, hPadding, 48),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 1152),
                  child: events.when(
                    loading: () => const Padding(
                      padding: EdgeInsets.symmetric(vertical: 60),
                      child: Center(child: LoadingSpinner()),
                    ),
                    error: (e, _) => Padding(
                      padding: const EdgeInsets.symmetric(vertical: 40),
                      child: Center(
                        child: Text(
                          'Error: $e',
                          style: const TextStyle(color: AppColors.error),
                        ),
                      ),
                    ),
                    data: (list) {
                      final upcoming = list
                          .where((e) =>
                              e['status'] == 'scheduled' ||
                              e['status'] == 'live')
                          .toList()
                        ..sort((a, b) =>
                            DateTime.parse(a['event_date']?.toString() ?? '')
                                .compareTo(
                                    DateTime.parse(b['event_date']?.toString() ?? '')));
                      final past = list
                          .where((e) => e['status'] == 'ended')
                          .toList();
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (upcoming.isNotEmpty)
                            _section(
                              'Upcoming Premieres',
                              liveDot: true,
                              child: _upcomingGrid(upcoming, tickets),
                            ),
                          if (upcoming.isEmpty && past.isEmpty)
                            const Padding(
                              padding: EdgeInsets.symmetric(vertical: 60),
                              child: Center(
                                child: Column(
                                  children: [
                                    Icon(
                                      Icons.star_border,
                                      size: 48,
                                      color: AppColors.onSurfaceVariant,
                                    ),
                                    SizedBox(height: 12),
                                    Text(
                                      'No events scheduled yet',
                                      style: TextStyle(
                                        color: AppColors.onSurfaceVariant,
                                      ),
                                    ),
                                    SizedBox(height: 4),
                                    Text(
                                      'Check back soon for upcoming premieres',
                                      style: TextStyle(
                                        color: AppColors.onSurfaceVariant,
                                        fontSize: 13,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          if (past.isNotEmpty)
                            _section(
                              'Past Premieres',
                              child: _pastGrid(past),
                            ),
                        ],
                      );
                    },
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _hero(ScreenSize size) {
    final isDesktop = size == ScreenSize.desktop;
    return Container(
      height: isDesktop ? 440 : 320,
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Color(0x66DC2626),
            Color(0x33220A0A),
            AppColors.background,
          ],
        ),
      ),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.star, size: 56, color: Color(0xFFFFC107)),
            const SizedBox(height: 16),
            Text(
              'Virtual Red Carpet',
              textAlign: TextAlign.center,
              style: AppTypography.headlineLg.copyWith(
                fontSize: isDesktop ? 56 : 36,
                height: 1.15,
              ),
            ),
            const SizedBox(height: 12),
            Text(
              'Exclusive premieres, live events, and behind-the-scenes access. Get your front-row seat.',
              textAlign: TextAlign.center,
              style: AppTypography.bodyMd.copyWith(
                color: AppColors.onSurfaceVariant,
                fontSize: isDesktop ? 18 : 14,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _section(
    String title, {
    bool liveDot = false,
    required Widget child,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 40),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              if (liveDot)
                Container(
                  width: 8,
                  height: 8,
                  decoration: const BoxDecoration(
                    color: Colors.redAccent,
                    shape: BoxShape.circle,
                  ),
                ),
              if (liveDot) const SizedBox(width: 8),
              Text(
                title,
                style: AppTypography.headlineMd.copyWith(
                  color: AppColors.onSurface,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          child,
        ],
      ),
    );
  }

  Widget _upcomingGrid(
    List<Map<String, dynamic>> items,
    List<Map<String, dynamic>> tickets,
  ) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final cols = gridColumnsForWidth(constraints.maxWidth).clamp(1, 3);
        return GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: cols,
            crossAxisSpacing: 16,
            mainAxisSpacing: 16,
            childAspectRatio: gridAspectRatio(constraints.maxWidth, cols, spacing: 16),
          ),
          itemCount: items.length,
          itemBuilder: (_, i) => _EventCard(
            event: items[i],
            hasTicket: _hasTicket(tickets, items[i]),
            purchasing: _purchasingId == items[i]['id'].toString(),
            onPurchase: () => _purchase(items[i]),
          ),
        );
      },
    );
  }

  Widget _pastGrid(List<Map<String, dynamic>> items) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final cols = gridColumnsForWidth(constraints.maxWidth).clamp(2, 5);
        return GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: cols,
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
            childAspectRatio: gridAspectRatio(constraints.maxWidth, cols, spacing: 12),
          ),
      itemCount: items.length,
      itemBuilder: (_, i) {
        final ev = items[i];
        final poster = ev['poster_url']?.toString();
        return GestureDetector(
          onTap: () {
            final id = ev['id'];
            final eventId = id is num ? id.toInt() : int.tryParse(id.toString()) ?? -1;
            if (eventId >= 0) context.push('/events/$eventId');
          },
          child: Container(
            decoration: BoxDecoration(
              color: AppColors.surfaceContainer,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.white.withValues(alpha: 0.05)),
            ),
            clipBehavior: Clip.antiAlias,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                AspectRatio(
                  aspectRatio: 16 / 9,
                  child: Container(
                    color: AppColors.surface,
                    child: poster != null && poster.isNotEmpty
                        ? CachedNetworkImage(
                            imageUrl: poster,
                            fit: BoxFit.cover,
                            errorWidget: (_, _, _) => const Icon(
                              Icons.movie,
                              color: AppColors.onSurfaceVariant,
                            ),
                          )
                        : const Icon(Icons.movie, color: AppColors.onSurfaceVariant),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        ev['title']?.toString() ?? '',
                        style: AppTypography.labelSm.copyWith(
                          color: AppColors.onSurface,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      Text(
                        _formatShortDate(ev['event_date']?.toString() ?? ''),
                        style: AppTypography.labelXs.copyWith(
                          color: AppColors.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
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

  String _formatShortDate(String iso) {
    final dt = DateTime.tryParse(iso);
    if (dt == null) return iso;
    return '${dt.day}/${dt.month}/${dt.year}';
  }
}

class _EventCard extends StatelessWidget {
  final Map<String, dynamic> event;
  final bool hasTicket;
  final bool purchasing;
  final VoidCallback onPurchase;

  const _EventCard({
    required this.event,
    required this.hasTicket,
    required this.purchasing,
    required this.onPurchase,
  });

  @override
  Widget build(BuildContext context) {
    final title = event['title']?.toString() ?? '';
    final poster = event['poster_url']?.toString();
    final status = event['status']?.toString() ?? '';
    final creator = event['creator_name']?.toString() ?? '';
    final description = event['description']?.toString() ?? '';
    final price = (event['ticket_price'] as num? ?? 0);
    final isPaid = price > 0;
    final isLive = status == 'live';

    return Container(
      decoration: BoxDecoration(
        color: AppColors.surfaceContainer,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.white.withValues(alpha: 0.05)),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AspectRatio(
            aspectRatio: 16 / 9,
            child: Container(
              color: AppColors.surface,
              child: poster != null && poster.isNotEmpty
                  ? CachedNetworkImage(
                      imageUrl: poster,
                      fit: BoxFit.cover,
                      errorWidget: (_, _, _) =>
                          const Icon(Icons.movie, size: 36, color: AppColors.onSurfaceVariant),
                    )
                  : const Icon(Icons.movie, size: 36, color: AppColors.onSurfaceVariant),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    if (isLive)
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: AppColors.secondary.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Row(
                          children: [
                            Container(
                              width: 6,
                              height: 6,
                              decoration: const BoxDecoration(
                                color: AppColors.secondary,
                                shape: BoxShape.circle,
                              ),
                            ),
                            const SizedBox(width: 4),
                            Text(
                              'LIVE',
                              style: AppTypography.labelXs.copyWith(
                                color: AppColors.secondary,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    if (isLive) const SizedBox(width: 8),
                    Text(
                      _formatEventDate(event['event_date']?.toString() ?? ''),
                      style: AppTypography.labelXs.copyWith(
                        color: AppColors.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  title,
                  style: AppTypography.labelLg.copyWith(
                    color: AppColors.onSurface,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                Text(
                  'by $creator',
                  style: AppTypography.labelSm.copyWith(
                    color: AppColors.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  description,
                  style: AppTypography.bodySm.copyWith(
                    color: AppColors.onSurfaceVariant,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Text(
                      isPaid ? '₦${_formatPrice(price)}' : 'Free',
                      style: AppTypography.labelMd.copyWith(
                        color: AppColors.onSurface,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const Spacer(),
                    if (hasTicket)
                      Row(
                        children: [
                          const Icon(
                            Icons.check_circle,
                            size: 14,
                            color: AppColors.secondary,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            'Got Ticket',
                            style: AppTypography.labelSm.copyWith(
                              color: AppColors.secondary,
                            ),
                          ),
                        ],
                      )
                    else
                      FilledButton(
                        onPressed: purchasing ? null : onPurchase,
                        style: FilledButton.styleFrom(
                          backgroundColor: AppColors.primaryContainer,
                          foregroundColor: AppColors.onPrimaryContainer,
                          padding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 8,
                          ),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        child: purchasing
                            ? const SizedBox(
                                width: 14,
                                height: 14,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : Text(
                                isPaid ? 'Get Ticket' : 'RSVP Free',
                                style: AppTypography.labelSm.copyWith(
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _formatPrice(num p) {
    final n = p.toInt();
    final s = n.toString();
    final b = StringBuffer();
    for (var i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 == 0) b.write(',');
      b.write(s[i]);
    }
    return b.toString();
  }

  String _formatEventDate(String iso) {
    final dt = DateTime.tryParse(iso);
    if (dt == null) return iso;
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    return '${days[dt.weekday - 1]}, ${months[dt.month - 1]} ${dt.day}';
  }
}