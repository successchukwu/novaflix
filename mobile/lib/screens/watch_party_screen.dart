import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';
import '../services/ws_service.dart';
import '../core/config.dart';
import '../core/responsive.dart';

class WatchPartyScreen extends ConsumerStatefulWidget {
  const WatchPartyScreen({super.key});

  @override
  ConsumerState<WatchPartyScreen> createState() => _WatchPartyScreenState();
}

class _WatchPartyScreenState extends ConsumerState<WatchPartyScreen> {
  WebSocketChannel? _channel;
  final _roomCtl = TextEditingController();
  final _chatCtl = TextEditingController();
  bool _joined = false;
  bool _isHost = false;
  String? _roomCode;
  List<String> _users = [];
  List<Map<String, dynamic>> _messages = [];
  String? _error;

  String _generateRoomCode() {
    final r = Random();
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    return List.generate(6, (_) => chars[r.nextInt(chars.length)]).join().toUpperCase();
  }

  Future<void> _connect(String room) async {
    setState(() => _error = null);
    try {
      final api = ref.read(apiServiceProvider);
      final token = await api.getToken();
      _channel = await WsService.connectWithToken('/ws', token);
      _channel!.stream.listen(_handleMessage, onError: (_) {});
      _channel!.sink.add(jsonEncode({'type': 'join', 'room': room}));
      setState(() {
        _joined = true;
        _roomCode = room;
      });
    } catch (e) {
      if (mounted) {
        setState(() => _error = 'Could not connect to room. Check your connection.');
      }
    }
  }

  void _handleMessage(dynamic raw) {
    Map<String, dynamic> msg;
    try {
      msg = jsonDecode(raw as String) as Map<String, dynamic>;
    } catch (_) {
      return;
    }
    switch (msg['type']) {
      case 'joined':
        setState(() {
          _users =
              (msg['users'] as List?)?.map((u) => u.toString()).toList() ?? _users;
          _isHost = msg['isHost'] == true;
        });
        break;
      case 'user-joined':
        setState(() {
          if (msg['userId'] != null && !_users.contains(msg['userId'].toString())) {
            _users.add(msg['userId'].toString());
          }
        });
        break;
      case 'user-left':
        setState(() {
          _users.removeWhere((u) => u == msg['userId']?.toString());
        });
        break;
      case 'host-changed':
        setState(() => _isHost = msg['hostId'] == ref.read(authProvider).user?.id);
        break;
      case 'chat':
        setState(() {
          _messages.add(
            (msg['payload'] is Map
                    ? msg['payload'] as Map
                    : msg as Map)
                .cast<String, dynamic>(),
          );
        });
        break;
      case 'chat-history':
        setState(() {
          _messages =
              (msg['messages'] as List?)?.cast<Map<String, dynamic>>() ?? [];
        });
        break;
      case 'error':
        setState(() => _error = msg['message']?.toString() ?? 'Room error');
        break;
    }
  }

  void _sendChat() {
    if (_chatCtl.text.trim().isEmpty || _roomCode == null) return;
    _channel!.sink.add(
      jsonEncode({
        'type': 'chat',
        'room': _roomCode!,
        'payload': {
          'message': _chatCtl.text.trim(),
          'name': ref.read(authProvider).user?.username ?? 'User',
        },
      }),
    );
    _chatCtl.clear();
  }

  void _leave() {
    _channel?.sink.add(jsonEncode({'type': 'leave'}));
    _channel?.sink.close();
    _channel = null;
    setState(() {
      _joined = false;
      _roomCode = null;
      _users = [];
      _messages = [];
      _isHost = false;
    });
  }

  void _copyLink() {
    if (_roomCode == null) return;
    final link = '${AppConfig.apiBaseUrl.replaceFirst('/api', '')}/watch-party?room=$_roomCode';
    Clipboard.setData(ClipboardData(text: link));
    _toast('Invite link copied!');
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
  void dispose() {
    _channel?.sink.close();
    _roomCtl.dispose();
    _chatCtl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    final rank = user?.planRank ?? 0;
    final hasAccess = rank >= 3;

    if (!hasAccess) {
      return Scaffold(
        backgroundColor: AppColors.background,
        body: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 64,
                  height: 64,
                  decoration: BoxDecoration(
                    color: AppColors.primaryAccent.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: const Icon(
                    Icons.workspace_premium,
                    size: 32,
                    color: AppColors.primaryAccent,
                  ),
                ),
                const SizedBox(height: 20),
                Text(
                  'Premium Feature',
                  textAlign: TextAlign.center,
                  style: AppTypography.headlineMd.copyWith(
                    color: AppColors.onSurface,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Watch Parties are available exclusively on the Premium plan.',
                  textAlign: TextAlign.center,
                  style: AppTypography.bodyMd.copyWith(
                    color: AppColors.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 28),
                SizedBox(
                  width: 280,
                  child: FilledButton(
                    onPressed: () => context.push('/pricing'),
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.primaryContainer,
                      foregroundColor: AppColors.onPrimaryContainer,
                      minimumSize: const Size.fromHeight(48),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: const Text('Upgrade to Premium'),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }

    if (!_joined) {
      return _lobby();
    }

    return _room();
  }

  Widget _lobby() {
    final width = MediaQuery.sizeOf(context).width;
    final hPadding = responsivePadding(width);
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(hPadding, 24, hPadding, 48),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 896),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.people, size: 28, color: AppColors.primaryContainer),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text('Watch Party', style: AppTypography.headlineLg),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  'Watch together, chat live, sync playback',
                  style: AppTypography.bodySm.copyWith(
                    color: AppColors.onSurfaceVariant.withValues(alpha: 0.6),
                  ),
                ),
                const SizedBox(height: 24),
                Container(
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    color: AppColors.surfaceContainerHigh,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: AppColors.white.withValues(alpha: 0.05)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Create a party',
                        style: AppTypography.labelLg.copyWith(
                          color: AppColors.onSurface,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'Start a room and invite friends with a shareable link.',
                        style: AppTypography.bodySm.copyWith(
                          color: AppColors.onSurfaceVariant,
                        ),
                      ),
                      const SizedBox(height: 16),
                      SizedBox(
                        width: double.infinity,
                        child: FilledButton(
                          onPressed: () => _connect(_generateRoomCode()),
                          style: FilledButton.styleFrom(
                            backgroundColor: AppColors.primaryContainer,
                            foregroundColor: AppColors.onPrimaryContainer,
                            minimumSize: const Size.fromHeight(46),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          child: const Text('Create Party'),
                        ),
                      ),
                      const SizedBox(height: 24),
                      Row(
                        children: [
                          Expanded(child: Container(height: 1, color: AppColors.white.withValues(alpha: 0.05))),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 12),
                            child: Text(
                              'or join with a code',
                              style: AppTypography.labelXs.copyWith(
                                color: AppColors.onSurfaceVariant.withValues(alpha: 0.6),
                              ),
                            ),
                          ),
                          Expanded(child: Container(height: 1, color: AppColors.white.withValues(alpha: 0.05))),
                        ],
                      ),
                      const SizedBox(height: 16),
                      TextField(
                        controller: _roomCtl,
                        textCapitalization: TextCapitalization.characters,
                        onSubmitted: (v) {
                          if (v.trim().length >= 4) _connect(v.trim().toUpperCase());
                        },
                        style: const TextStyle(color: AppColors.onSurface, fontSize: 15),
                        decoration: InputDecoration(
                          hintText: 'Room code',
                          hintStyle: const TextStyle(
                            color: AppColors.onSurfaceVariant,
                            fontSize: 15,
                          ),
                          filled: true,
                          fillColor: AppColors.surfaceContainer,
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 14,
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(10),
                            borderSide: BorderSide(
                              color: AppColors.white.withValues(alpha: 0.1),
                            ),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(10),
                            borderSide: const BorderSide(
                              color: AppColors.primaryContainer,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),
                      SizedBox(
                        width: double.infinity,
                        child: OutlinedButton(
                          onPressed: () {
                            if (_roomCtl.text.trim().length >= 4) {
                              _connect(_roomCtl.text.trim().toUpperCase());
                            }
                          },
                          style: OutlinedButton.styleFrom(
                            foregroundColor: AppColors.onSurface,
                            side: BorderSide(
                              color: AppColors.white.withValues(alpha: 0.1),
                            ),
                            minimumSize: const Size.fromHeight(46),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          child: const Text('Join Room'),
                        ),
                      ),
                      if (_error != null) ...[
                        const SizedBox(height: 12),
                        Text(
                          _error!,
                          style: const TextStyle(color: AppColors.error, fontSize: 13),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _room() {
    final size = screenSizeFor(MediaQuery.sizeOf(context).width);
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.surfaceContainerLowest,
        elevation: 0,
        titleSpacing: 16,
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: AppColors.white.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                _roomCode ?? '',
                style: AppTypography.labelSm.copyWith(
                  color: AppColors.onSurface,
                  fontFamily: 'monospace',
                ),
              ),
            ),
            const SizedBox(width: 10),
            Container(
              width: 6,
              height: 6,
              decoration: const BoxDecoration(
                color: AppColors.secondary,
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 6),
            Text(
              '${_users.length} watching',
              style: AppTypography.labelSm.copyWith(
                color: AppColors.onSurfaceVariant,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            onPressed: _copyLink,
            tooltip: 'Copy invite link',
            icon: const Icon(Icons.link, color: AppColors.onSurfaceVariant),
          ),
          if (_isHost)
            const Padding(
              padding: EdgeInsets.only(right: 4),
              child: Center(
                child: Text(
                  'HOST',
                  style: TextStyle(
                    color: AppColors.primaryContainer,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1,
                  ),
                ),
              ),
            ),
          IconButton(
            onPressed: _leave,
            tooltip: 'Leave party',
            icon: const Icon(Icons.exit_to_app, color: AppColors.onSurfaceVariant),
          ),
        ],
      ),
      body: _error != null && !_joined
          ? Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(_error!, style: const TextStyle(color: AppColors.error)),
                  const SizedBox(height: 16),
                  OutlinedButton(onPressed: _leave, child: const Text('Back')),
                ],
              ),
            )
          : size == ScreenSize.desktop
              ? _desktopRoom()
              : _mobileRoom(),
    );
  }

  Widget _desktopRoom() {
    final w = MediaQuery.sizeOf(context).width;
    final chatW = (w * 0.3).clamp(280.0, 360.0);
    return Row(
      children: [
        Expanded(flex: 3, child: _stagePanel()),
        Container(width: 1, color: AppColors.white.withValues(alpha: 0.05)),
        SizedBox(width: chatW, child: _chatPanel()),
      ],
    );
  }

  Widget _mobileRoom() {
    return Column(
      children: [
        Expanded(child: _stagePanel()),
        Container(height: 1, color: AppColors.white.withValues(alpha: 0.05)),
        SizedBox(height: 260, child: _chatPanel()),
      ],
    );
  }

  Widget _stagePanel() {
    return Container(
      color: Colors.black,
      width: double.infinity,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.tv_off, size: 72, color: Color(0xFF6B6B6B)),
          const SizedBox(height: 20),
          Text(
            'Video not available',
            style: AppTypography.headlineMd.copyWith(
              color: const Color(0xFF9E9E9E),
            ),
          ),
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Text(
              'Embedded playback is disabled on this client. Chat with your party or wait for the host to start.',
              textAlign: TextAlign.center,
              style: AppTypography.bodySm.copyWith(
                color: const Color(0xFF757575),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _chatPanel() {
    return Container(
      color: AppColors.surfaceContainerLowest,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Row(
              children: [
                const Icon(Icons.chat, size: 16, color: AppColors.primaryContainer),
                const SizedBox(width: 8),
                Text(
                  'Party Chat',
                  style: AppTypography.labelMd.copyWith(
                    color: AppColors.onSurface,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          Divider(height: 1, color: AppColors.white.withValues(alpha: 0.05)),
          Expanded(
            child: _messages.isEmpty
                ? Center(
                    child: Text(
                      'No messages yet',
                      style: AppTypography.bodySm.copyWith(
                        color: AppColors.onSurfaceVariant.withValues(alpha: 0.6),
                      ),
                    ),
                  )
                : ListView.builder(
                    padding: const EdgeInsets.all(12),
                    itemCount: _messages.length,
                    itemBuilder: (_, i) {
                      final m = _messages[i];
                      final name = m['name']?.toString() ?? 'User';
                      final message = m['message']?.toString() ?? '';
                      final isMe = name ==
                          ref.read(authProvider).user?.username;
                      return Align(
                        alignment:
                            isMe ? Alignment.centerRight : Alignment.centerLeft,
                        child: Container(
                          margin: const EdgeInsets.symmetric(vertical: 3),
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 8,
                          ),
                          constraints: const BoxConstraints(maxWidth: 260),
                          decoration: BoxDecoration(
                            color: isMe
                                ? AppColors.primaryContainer.withValues(alpha: 0.9)
                                : AppColors.surfaceContainerHigh,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              if (!isMe)
                                Text(
                                  name,
                                  style: AppTypography.labelXs.copyWith(
                                    color: AppColors.primaryContainer,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              Text(
                                message,
                                style: AppTypography.bodySm.copyWith(
                                  color: isMe
                                      ? AppColors.onPrimaryContainer
                                      : AppColors.onSurface,
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
          ),
          Divider(height: 1, color: AppColors.white.withValues(alpha: 0.05)),
          Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _chatCtl,
                    onSubmitted: (_) => _sendChat(),
                    style: const TextStyle(color: AppColors.onSurface, fontSize: 14),
                    decoration: InputDecoration(
                      hintText: 'Send a message…',
                      hintStyle: const TextStyle(
                        color: AppColors.onSurfaceVariant,
                        fontSize: 14,
                      ),
                      filled: true,
                      fillColor: AppColors.surfaceContainer,
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 10,
                      ),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(20),
                        borderSide: BorderSide.none,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton(
                  onPressed: _sendChat,
                  icon: const Icon(Icons.send, color: AppColors.primaryContainer),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}