import 'package:flutter/material.dart';
import '../services/currency_service.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../core/responsive.dart';
import '../services/api_service.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';
import '../widgets/ui/index.dart';
import '../widgets/features/index.dart';

final _eventsProvider = FutureProvider.family<
    List<Map<String, dynamic>>,
    bool>((ref, includePast) async {
  final api = ref.read(apiServiceProvider);
  final res = await api.getEvents(includePast: includePast);
  final data = res.data['events'] as List? ?? res.data['data'] as List? ?? [];
  return data.cast<Map<String, dynamic>>();
});

class LiveEventsScreen extends ConsumerStatefulWidget {
  const LiveEventsScreen({super.key});

  @override
  ConsumerState<LiveEventsScreen> createState() => _LiveEventsScreenState();
}

class _LiveEventsScreenState extends ConsumerState<LiveEventsScreen> {
  bool _past = false;

  @override
  Widget build(BuildContext context) {
    final events = ref.watch(_eventsProvider(_past));
    final width = MediaQuery.sizeOf(context).width;
    final hPadding = responsivePadding(width);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(hPadding, 24, hPadding, 48),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 1152),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(
                      Icons.live_tv,
                      size: 28,
                      color: AppColors.primaryContainer,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text('Live Events', style: AppTypography.headlineLg),
                    ),
                    _filterToggle(),
                  ],
                ),
                const SizedBox(height: 24),
                events.when(
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
                  data: (list) => list.isEmpty
                      ? Padding(
                          padding: const EdgeInsets.symmetric(vertical: 60),
                          child: Center(
                            child: Column(
                              children: [
                                const Icon(
                                  Icons.event_busy,
                                  size: 48,
                                  color: AppColors.onSurfaceVariant,
                                ),
                                const SizedBox(height: 12),
                                Text(
                                  _past ? 'No past events' : 'No upcoming events',
                                  style: const TextStyle(
                                    color: AppColors.onSurfaceVariant,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        )
                      : _grid(list),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _filterToggle() {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: AppColors.surfaceContainer,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _toggleBtn('Upcoming', !_past, () => setState(() => _past = false)),
          _toggleBtn('Past', _past, () => setState(() => _past = true)),
        ],
      ),
    );
  }

  Widget _toggleBtn(String label, bool active, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: active ? AppColors.primaryContainer : Colors.transparent,
          borderRadius: BorderRadius.circular(9),
        ),
        child: Text(
          label,
          style: AppTypography.labelSm.copyWith(
            color: active
                ? AppColors.onPrimaryContainer
                : AppColors.onSurfaceVariant,
            fontWeight: active ? FontWeight.w600 : FontWeight.w400,
          ),
        ),
      ),
    );
  }

  Widget _grid(List<Map<String, dynamic>> items) {
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
            onTap: () => _openEvent(items[i]),
          ),
        );
      },
    );
  }

  void _openEvent(Map<String, dynamic> event) {
    final id = event['id'];
    final eventId = id is num ? id.toInt() : int.tryParse(id.toString()) ?? -1;
    if (eventId >= 0) context.push('/event/$eventId');
  }
}

class _EventCard extends StatelessWidget {
  final Map<String, dynamic> event;
  final VoidCallback onTap;

  const _EventCard({required this.event, required this.onTap});

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
    final isScheduled = status == 'scheduled';
    final totalTickets = (event['total_tickets'] as num? ?? 0).toInt();
    final available = (event['available_tickets'] as num? ?? 0).toInt();

    return GestureDetector(
      onTap: onTap,
      child: Container(
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
                        errorWidget: (_, _, _) => const Icon(
                          Icons.live_tv,
                          size: 36,
                          color: AppColors.onSurfaceVariant,
                        ),
                      )
                    : const Icon(Icons.live_tv, size: 36, color: AppColors.onSurfaceVariant),
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
                        _badge(
                          'LIVE',
                          color: AppColors.secondary,
                          dot: true,
                        )
                      else if (isScheduled)
                        _badge('Scheduled', color: const Color(0xFF64B5F6)),
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
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      const Icon(
                        Icons.schedule,
                        size: 14,
                        color: AppColors.onSurfaceVariant,
                      ),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text(
                          _formatEventDate(event['event_date']?.toString() ?? ''),
                          style: AppTypography.labelSm.copyWith(
                            color: AppColors.onSurfaceVariant,
                          ),
                        ),
                      ),
                    ],
                  ),
                  if (creator.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      'by $creator',
                      style: AppTypography.labelSm.copyWith(
                        color: AppColors.onSurfaceVariant,
                      ),
                    ),
                  ],
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
                      if (totalTickets > 0)
                        Text(
                          '$available left',
                          style: AppTypography.labelXs.copyWith(
                            color: AppColors.onSurfaceVariant,
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _badge(String label, {required Color color, bool dot = false}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (dot)
            Container(
              width: 6,
              height: 6,
              decoration: BoxDecoration(
                color: color,
                shape: BoxShape.circle,
              ),
            ),
          if (dot) const SizedBox(width: 4),
          Text(
            label.toUpperCase(),
            style: AppTypography.labelXs.copyWith(
              color: color,
              fontWeight: FontWeight.w600,
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
    final h = dt.hour % 12 == 0 ? 12 : dt.hour % 12;
    final m = dt.minute.toString().padLeft(2, '0');
    final ap = dt.hour >= 12 ? 'PM' : 'AM';
    return '${days[dt.weekday - 1]}, ${months[dt.month - 1]} ${dt.day}, $h:$m $ap';
  }
}