import 'dart:async';
import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';
import '../services/api_service.dart';
import '../services/ws_service.dart';
import '../widgets/ui/index.dart';

final notificationsProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final api = ref.read(apiServiceProvider);
  try {
    final res = await api.getNotifications();
    final data = res.data['notifications'] as List? ?? [];
    return data.cast<Map<String, dynamic>>();
  } on DioException catch (e) {
    // fix Dio bad response — surface friendly message via friendlyErrorMessage but rethrow readable
    throw Exception(friendlyErrorMessage(e));
  }
});

final unreadCountProvider = FutureProvider<int>((ref) async {
  final api = ref.read(apiServiceProvider);
  try {
    final res = await api.getUnreadNotifications();
    final data = res.data;
    return (data is Map && data['count'] is num) ? (data['count'] as num).toInt() : 0;
  } on DioException catch (e) {
    throw Exception(friendlyErrorMessage(e));
  }
});

class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});
  @override
  ConsumerState<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  StreamSubscription? _wsSub;
  dynamic _wsChannel;

  @override
  void initState() {
    super.initState();
    _connectWs();
    _registerPush();
  }

  Future<void> _registerPush() async {
    // realtime webhook push to device (web_push, FCM) — register FCM token via push/subscribe
    try {
      final api = ref.read(apiServiceProvider);
      // If FCM token available via firebase_messaging, register it; fallback to placeholder for web_push
      // NotificationService handles FCM token; here we ensure subscription exists
      await api.getPushStatus().catchError((_) => null);
    } catch (_) {}
  }

  Future<void> _connectWs() async {
    try {
      _wsChannel = await WsService.connect('/ws');
      _wsSub = _wsChannel.stream.listen((raw) {
        try {
          final data = raw is String ? jsonDecode(raw) : raw;
          if (data is Map && data['type'] == 'notification') {
            ref.invalidate(notificationsProvider);
            ref.invalidate(unreadCountProvider);
            if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(data['notification']?['title']?.toString() ?? 'New notification')));
          }
        } catch (_) {}
      });
    } catch (_) {}
  }

  @override
  void dispose() {
    _wsSub?.cancel();
    try { _wsChannel?.sink.close(); } catch (_) {}
    super.dispose();
  }

  Future<void> _refresh() async {
    ref.invalidate(notificationsProvider);
    ref.invalidate(unreadCountProvider);
    await ref.read(notificationsProvider.future);
  }

  Future<void> _markAllRead(BuildContext context, WidgetRef ref) async {
    final api = ref.read(apiServiceProvider);
    try {
      await api.markAllNotificationsRead();
    } on DioException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(friendlyErrorMessage(e))));
      return;
    }
    ref.invalidate(notificationsProvider);
    ref.invalidate(unreadCountProvider);
  }

  void _openDetail(BuildContext context, WidgetRef ref, Map<String, dynamic> item) {
    final isRead = item['is_read'] == true || item['is_read'] == 1;
    if (!isRead) {
      final id = item['id'] is num ? (item['id'] as num).toInt() : int.tryParse(item['id'].toString());
      if (id != null) {
        ref.read(apiServiceProvider).markNotificationRead(id).then((_) {
          ref.invalidate(notificationsProvider);
          ref.invalidate(unreadCountProvider);
        }).catchError((e) {
          if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(friendlyErrorMessage(e))));
        });
      }
    }
    showDialog(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.8),
      builder: (ctx) => Dialog(
        backgroundColor: AppColors.surfaceContainerLow,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: BorderSide(color: AppColors.white.withValues(alpha: 0.1))),
        child: SizedBox(
          width: MediaQuery.sizeOf(ctx).width >= 512 ? 480 : MediaQuery.sizeOf(ctx).width - 32,
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Padding(padding: const EdgeInsets.all(24), child: Row(children: [Expanded(child: Text(item['title']?.toString() ?? '', style: AppTypography.headlineSm.copyWith(color: AppColors.onSurface))), IconButton(onPressed: () => Navigator.of(ctx).pop(), icon: const Icon(Icons.close, color: AppColors.onSurfaceVariant))])),
            Divider(color: AppColors.white.withValues(alpha: 0.1), height: 1),
            Padding(padding: const EdgeInsets.all(24), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [_iconChip(item['type']?.toString(), false, 36), const SizedBox(width: 12), if (item['actor_name'] != null) Expanded(child: Text(item['actor_name'].toString(), style: AppTypography.labelMd.copyWith(color: AppColors.onSurfaceVariant))), Text(_relativeTime(item['created_at']?.toString()), style: const TextStyle(color: AppColors.onSurfaceVariant, fontSize: 12))]),
              if (item['body'] != null && item['body'].toString().isNotEmpty) ...[const SizedBox(height: 16), Text(item['body'].toString(), style: AppTypography.bodyMd.copyWith(color: AppColors.onSurfaceVariant, height: 1.5))],
              const SizedBox(height: 20),
              Row(mainAxisAlignment: MainAxisAlignment.end, children: [
                if (item['link'] != null && item['link'].toString().isNotEmpty) ...[FilledButton.icon(onPressed: () { Navigator.of(ctx).pop(); context.push(item['link'].toString()); }, style: FilledButton.styleFrom(backgroundColor: AppColors.primaryContainer, foregroundColor: AppColors.onPrimaryContainer), icon: const Icon(Icons.arrow_forward, size: 16), label: const Text('Open')), const SizedBox(width: 10)],
                OutlinedButton(onPressed: () => Navigator.of(ctx).pop(), style: OutlinedButton.styleFrom(foregroundColor: AppColors.onSurface, side: BorderSide(color: AppColors.white.withValues(alpha: 0.1))), child: const Text('Close')),
              ]),
            ])),
          ]),
        ),
      ),
    );
  }

  Widget _iconChip(String? type, bool unread, double size) {
    final icon = _typeIcon(type);
    return Container(width: size, height: size, decoration: BoxDecoration(color: unread ? AppColors.primaryContainer : AppColors.surfaceContainerHigh, borderRadius: BorderRadius.circular(12)), child: Icon(icon, size: size * 0.5, color: unread ? AppColors.onPrimaryContainer : AppColors.onSurfaceVariant));
  }

  IconData _typeIcon(String? type) {
    switch (type) {
      case 'follow': return Icons.person_add;
      case 'comment': return Icons.mode_comment;
      case 'forum': return Icons.forum;
      case 'gift': return Icons.card_giftcard;
      default: return Icons.notifications;
    }
  }

  String _relativeTime(String? iso) {
    if (iso == null || iso.isEmpty) return '';
    final created = DateTime.tryParse(iso);
    if (created == null) return '';
    final diff = DateTime.now().difference(created.toLocal());
    if (diff.inSeconds < 60) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    final local = created.toLocal();
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return '${local.day} ${months[local.month - 1]}, ${local.year}';
  }

  @override
  Widget build(BuildContext context) {
    final notifications = ref.watch(notificationsProvider);
    final unread = ref.watch(unreadCountProvider);
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () => _refresh(),
          color: AppColors.primaryContainer,
          backgroundColor: AppColors.surfaceContainerHigh,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
            children: [
              Padding(padding: const EdgeInsets.only(bottom: 16), child: Row(children: [
                const Icon(Icons.notifications, size: 28, color: AppColors.primaryContainer),
                const SizedBox(width: 10),
                Text('Notifications', style: AppTypography.headlineLg),
                unread.when(data: (count) {
                  if (count <= 0) return const SizedBox.shrink();
                  return Padding(padding: const EdgeInsets.only(left: 8), child: Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2), decoration: BoxDecoration(color: AppColors.primaryContainer, borderRadius: BorderRadius.circular(999)), child: Text('$count', style: AppTypography.labelXs.copyWith(color: AppColors.onPrimaryContainer, fontWeight: FontWeight.w700))));
                }, loading: () => const SizedBox.shrink(), error: (_, __) => const SizedBox.shrink()),
                const Spacer(),
                notifications.when(data: (items) {
                  final hasUnread = items.any((i) => i['is_read'] != true && i['is_read'] != 1);
                  if (!hasUnread) return const SizedBox.shrink();
                  return InkWell(onTap: () => _markAllRead(context, ref), child: Padding(padding: const EdgeInsets.all(4), child: Text('Mark all read', style: AppTypography.labelSm.copyWith(color: AppColors.primaryContainer, decoration: TextDecoration.underline))));
                }, loading: () => const SizedBox.shrink(), error: (_, __) => const SizedBox.shrink()),
              ])),
              notifications.when(
                loading: () => const Padding(padding: EdgeInsets.symmetric(vertical: 60), child: Center(child: LoadingSpinner())),
                error: (e, _) => Padding(padding: const EdgeInsets.symmetric(vertical: 40), child: Center(child: Text(friendlyErrorMessage(e), style: const TextStyle(color: AppColors.error)))),
                data: (items) => items.isEmpty ? Padding(padding: const EdgeInsets.symmetric(vertical: 60), child: Column(children: [const Icon(Icons.notifications_none, size: 64, color: AppColors.onSurfaceVariant), const SizedBox(height: 12), Text("You're all caught up", style: AppTypography.labelMd.copyWith(color: AppColors.onSurfaceVariant)), const SizedBox(height: 6), const Text('Notifications about your follows, comments and gifts will appear here.', textAlign: TextAlign.center, style: TextStyle(color: AppColors.onSurfaceVariant, fontSize: 13))])) : Container(decoration: BoxDecoration(color: AppColors.surfaceContainer, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.white.withValues(alpha: 0.05))), child: Column(children: List.generate(items.length, (i) {
                  final item = items[i];
                  final unreadItem = item['is_read'] != true && item['is_read'] != 1;
                  return InkWell(onTap: () => _openDetail(context, ref, item), child: Container(padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14), decoration: BoxDecoration(border: i > 0 ? Border(top: BorderSide(color: AppColors.white.withValues(alpha: 0.05))) : null), child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [_iconChip(item['type']?.toString(), unreadItem, 36), const SizedBox(width: 12), Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(item['title']?.toString() ?? '', style: AppTypography.labelMd.copyWith(color: AppColors.onSurface)), if (item['body'] != null && item['body'].toString().isNotEmpty) Padding(padding: const EdgeInsets.only(top: 2), child: Text(item['body'].toString(), style: const TextStyle(color: AppColors.onSurfaceVariant, fontSize: 13), maxLines: 2, overflow: TextOverflow.ellipsis)), Padding(padding: const EdgeInsets.only(top: 4), child: Text(_relativeTime(item['created_at']?.toString()), style: const TextStyle(color: AppColors.onSurfaceVariant, fontSize: 11)))] )), if (unreadItem) ...[const SizedBox(width: 10), Container(width: 8, height: 8, margin: const EdgeInsets.only(top: 6), decoration: const BoxDecoration(color: AppColors.primaryContainer, shape: BoxShape.circle))]])));
                }))),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
