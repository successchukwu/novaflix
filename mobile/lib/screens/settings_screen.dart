import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';
import '../providers/auth_provider.dart';
import '../providers/store_provider.dart';
import '../services/api_service.dart';
import '../widgets/ui/index.dart';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  final _nameCtl = TextEditingController();
  final _bioCtl = TextEditingController();
  final _currentPwCtl = TextEditingController();
  final _newPwCtl = TextEditingController();
  final _confirmPwCtl = TextEditingController();

  bool _showPwForm = false;
  bool _showDeleteConfirm = false;
  final _deleteCtl = TextEditingController();

  bool _profileSaving = false;
  String? _profileMsg;
  bool _profileMsgIsError = false;

  bool _pwSaving = false;
  String? _pwMsg;
  String? _pwError;

  bool _deleting = false;

  Map<String, dynamic>? _stats;
  Map<String, dynamic>? _billing;
  bool _statsLoading = false;

  static const _locales = {'en': 'English', 'es': 'Español', 'fr': 'Français'};
  static const _qualities = ['Auto', '720p', '1080p', '4K'];

  @override
  void initState() {
    super.initState();
    final user = ref.read(authProvider).user;
    _nameCtl.text = user?.username ?? '';
    _bioCtl.text = user?.bio ?? '';
    _loadBilling();
    _loadServerSettings();
  }

  Future<void> _loadServerSettings() async {
    try {
      final api = ref.read(apiServiceProvider);
      final res = await api.getSettings();
      final settings = (res.data['settings'] as Map<String, dynamic>?);
      if (settings == null) return;
      final store = ref.read(storeProvider);
      final playback = settings['playbackSettings'];
      final notif = settings['notificationSettings'];
      if (playback is Map<String, dynamic>) {
        ref.read(storeProvider.notifier).updatePlaybackSettings(
          store.playbackSettings.copyWith(
            defaultQuality: playback['defaultQuality'] as String? ?? store.playbackSettings.defaultQuality,
            subtitleSize: (playback['subtitleSize'] as num?)?.toDouble() ?? store.playbackSettings.subtitleSize,
            autoplay: playback['autoplay'] as bool? ?? store.playbackSettings.autoplay,
            subtitleLanguage: playback['subtitleLanguage'] as String? ?? store.playbackSettings.subtitleLanguage,
          ),
        );
      }
      if (notif is Map<String, dynamic>) {
        ref.read(storeProvider.notifier).updateNotificationSettings(
          store.notificationSettings.copyWith(
            newReleases: notif['newReleases'] as bool? ?? store.notificationSettings.newReleases,
            watchlistUpdates: notif['watchlistUpdates'] as bool? ?? store.notificationSettings.watchlistUpdates,
            creatorActivity: notif['creatorActivity'] as bool? ?? store.notificationSettings.creatorActivity,
            marketing: notif['marketing'] as bool? ?? store.notificationSettings.marketing,
            pushEnabled: notif['pushEnabled'] as bool? ?? store.notificationSettings.pushEnabled,
            commentReply: notif['commentReply'] as bool? ?? store.notificationSettings.commentReply,
            sound: notif['sound'] as bool? ?? store.notificationSettings.sound,
          ),
        );
      }
    } catch (_) {}
  }

  Future<void> _syncServerSettings() async {
    try {
      final api = ref.read(apiServiceProvider);
      final store = ref.read(storeProvider);
      await api.updateSettings({
        'playbackSettings': store.playbackSettings.toJson(),
        'notificationSettings': store.notificationSettings.toJson(),
      });
    } catch (_) {}
  }

  @override
  void dispose() {
    _nameCtl.dispose();
    _bioCtl.dispose();
    _currentPwCtl.dispose();
    _newPwCtl.dispose();
    _confirmPwCtl.dispose();
    _deleteCtl.dispose();
    super.dispose();
  }

  Future<void> _loadBilling() async {
    setState(() => _statsLoading = true);
    try {
      final api = ref.read(apiServiceProvider);
      final stats = await api.getUserStats();
      final billing = await api.getPaymentStatus();
      if (!mounted) return;
      setState(() {
        _stats = (stats.data['stats'] as Map<String, dynamic>?) ?? const {};
        _billing = (billing.data as Map<String, dynamic>?) ?? const {};
      });
    } catch (_) {
    } finally {
      if (mounted) setState(() => _statsLoading = false);
    }
  }

  Future<void> _saveProfile() async {
    setState(() { _profileSaving = true; _profileMsg = null; });
    try {
      final api = ref.read(apiServiceProvider);
      await api.updateProfile({'name': _nameCtl.text.trim(), 'bio': _bioCtl.text.trim()});
      await ref.read(authProvider.notifier).refreshUser();
      if (!mounted) return;
      setState(() { _profileMsg = 'Profile updated'; _profileMsgIsError = false; });
    } catch (e) {
      if (!mounted) return;
      // fix bioexception bad response — use friendlyErrorMessage instead of raw DioException
      setState(() { _profileMsg = friendlyErrorMessage(e); _profileMsgIsError = true; });
    } finally {
      if (mounted) setState(() => _profileSaving = false);
    }
  }

  Future<void> _changePassword() async {
    setState(() { _pwMsg = null; _pwError = null; });
    if (_newPwCtl.text != _confirmPwCtl.text) {
      setState(() => _pwError = 'Passwords do not match');
      return;
    }
    if (_newPwCtl.text.length < 6) {
      setState(() => _pwError = 'Password must be at least 6 characters');
      return;
    }
    setState(() => _pwSaving = true);
    try {
      final api = ref.read(apiServiceProvider);
      await api.changePassword(_currentPwCtl.text, _newPwCtl.text);
      if (!mounted) return;
      setState(() {
        _pwMsg = 'Password updated';
        _currentPwCtl.clear(); _newPwCtl.clear(); _confirmPwCtl.clear();
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _pwError = friendlyErrorMessage(e));
    } finally {
      if (mounted) setState(() => _pwSaving = false);
    }
  }

  Future<void> _deleteAccount() async {
    if (_deleteCtl.text.trim() != 'DELETE') return;
    setState(() => _deleting = true);
    try {
      final api = ref.read(apiServiceProvider);
      await api.deleteAccount();
      await ref.read(authProvider.notifier).logout();
      if (mounted) context.go('/home');
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(friendlyErrorMessage(e))));
    } finally {
      if (mounted) setState(() => _deleting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authProvider);
    final store = ref.watch(storeProvider);
    final user = authState.user;

    return Scaffold(
      backgroundColor: AppColors.background,
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 800),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 24, 16, 48),
            children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 0, vertical: 4),
            child: Row(
              children: [
                const Icon(Icons.settings, size: 28, color: AppColors.primaryContainer),
                const SizedBox(width: 12),
                Text('Settings', style: AppTypography.headlineLg),
              ],
            ),
          ),
          const SizedBox(height: 24),
          _section('Account', [
            _field('Name', AppInput(controller: _nameCtl, hint: 'Your name')),
            const SizedBox(height: 12),
            _field('Bio', AppInput(controller: _bioCtl, hint: 'Tell people about yourself')),
            const SizedBox(height: 12),
            _field('Email', TextField(
              controller: TextEditingController(text: user?.email ?? ''),
              enabled: false,
              style: const TextStyle(color: AppColors.onSurfaceVariant, fontSize: 16),
              decoration: const InputDecoration(hintText: 'email@example.com'),
            )),
            const SizedBox(height: 12),
            Row(children: [
              AppButton(label: 'Save Profile', onPressed: _saveProfile, loading: _profileSaving, fullWidth: false),
              if (_profileMsg != null) ...[
                const SizedBox(width: 12),
                Expanded(child: Text(_profileMsg!, style: TextStyle(
                  fontSize: 13,
                  color: _profileMsgIsError ? AppColors.error : AppColors.secondary,
                ))),
              ],
            ]),
          ]),
          const SizedBox(height: 24),
          _section('Subscription', [
            ListTile(
              leading: const Icon(Icons.workspace_premium, color: AppColors.primary),
              title: Text('${_planName(user?.plan)} Plan'),
              subtitle: Text(
                '${user?.planFeatures['maxResolution']} · ${user?.planFeatures['concurrentScreens']} screen${(user?.planFeatures['concurrentScreens'] as int? ?? 1) > 1 ? 's' : ''} · ${user?.planFeatures['adFree'] == true ? 'Ad-free' : 'Ads'}',
                style: const TextStyle(color: AppColors.onSurfaceVariant, fontSize: 13),
              ),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => context.push('/pricing'),
            ),
            if (_statsLoading)
              const Padding(
                padding: EdgeInsets.all(16),
                child: Center(child: SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2))),
              )
            else if (_stats?['subscription'] != null)
              ListTile(
                leading: const Icon(Icons.check_circle, color: AppColors.secondary),
                title: const Text('Active subscription', style: TextStyle(fontSize: 14)),
                subtitle: Text(
                  'Since ${_formatDate((_stats!['subscription'] as Map<String, dynamic>)['started_at']?.toString())}',
                  style: const TextStyle(color: AppColors.onSurfaceVariant, fontSize: 13),
                ),
              ),
            if (_billing?['subscription'] != null)
              ListTile(
                leading: const Icon(Icons.receipt_long, color: AppColors.onSurfaceVariant),
                title: Text(_billing!['subscription']['plan']?.toString() ?? '', style: const TextStyle(fontSize: 14)),
                subtitle: Text(_billing!['subscription']['status']?.toString() ?? '', style: const TextStyle(color: AppColors.onSurfaceVariant, fontSize: 13)),
              ),
            _linkTile(Icons.compare_arrows, 'Compare Plans', () => context.push('/pricing')),
          ]),
          const SizedBox(height: 24),
          _section('Security', [
            if (!_showPwForm)
              AppButton(label: 'Change Password', onPressed: () => setState(() => _showPwForm = true), outlined: true)
            else ...[
              AppInput(controller: _currentPwCtl, label: 'Current Password', obscureText: true),
              const SizedBox(height: 12),
              AppInput(controller: _newPwCtl, label: 'New Password', obscureText: true),
              const SizedBox(height: 12),
              AppInput(controller: _confirmPwCtl, label: 'Confirm New Password', obscureText: true),
              const SizedBox(height: 12),
              Row(children: [
                AppButton(
                  label: 'Update Password',
                  onPressed: _changePassword,
                  loading: _pwSaving,
                  fullWidth: false,
                ),
                const SizedBox(width: 12),
                AppButton(
                  label: 'Cancel',
                  onPressed: () => setState(() { _showPwForm = false; _pwMsg = null; _pwError = null; }),
                  text: true,
                ),
              ]),
              if (_pwMsg != null) ...[
                const SizedBox(height: 8),
                Text(_pwMsg!, style: const TextStyle(color: AppColors.secondary, fontSize: 13)),
              ],
              if (_pwError != null) ...[
                const SizedBox(height: 8),
                Text(_pwError!, style: const TextStyle(color: AppColors.error, fontSize: 13)),
              ],
            ],
          ]),
          const SizedBox(height: 24),
          _section('Appearance', [
            ListTile(
              leading: const Icon(Icons.language, color: AppColors.primary),
              title: Text(_locales[store.locale] ?? 'English'),
              subtitle: const Text('Language', style: TextStyle(color: AppColors.onSurfaceVariant, fontSize: 13)),
              trailing: const Icon(Icons.chevron_right, color: AppColors.onSurfaceVariant),
              onTap: () => _showLanguagePicker(),
            ),
          ]),
          const SizedBox(height: 24),
          _section('Playback', [
            ListTile(
              leading: const Icon(Icons.hd, color: AppColors.primary),
              title: const Text('Default Quality'),
              subtitle: Text(store.playbackSettings.defaultQuality, style: const TextStyle(color: AppColors.onSurfaceVariant, fontSize: 13)),
              trailing: PopupMenuButton<String>(
                initialValue: store.playbackSettings.defaultQuality,
                onSelected: (q) {
                  ref.read(storeProvider.notifier).updatePlaybackSettings(
                    store.playbackSettings.copyWith(defaultQuality: q),
                  );
                  _syncServerSettings();
                },
                itemBuilder: (_) => _qualities.map((q) => PopupMenuItem(value: q, child: Text(q))).toList(),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: AppColors.surfaceContainerHigh,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: AppColors.outlineVariant),
                  ),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    Text(store.playbackSettings.defaultQuality, style: const TextStyle(fontSize: 14)),
                    const SizedBox(width: 4),
                    const Icon(Icons.arrow_drop_down, size: 18, color: AppColors.onSurfaceVariant),
                  ]),
                ),
              ),
            ),
            SwitchListTile(
              secondary: const Icon(Icons.autorenew, color: AppColors.primary),
              title: const Text('Autoplay'),
              subtitle: const Text('Next episode automatically', style: TextStyle(color: AppColors.onSurfaceVariant, fontSize: 13)),
              value: store.playbackSettings.autoplay,
              onChanged: (v) {
                ref.read(storeProvider.notifier).updatePlaybackSettings(
                  store.playbackSettings.copyWith(autoplay: v),
                );
                _syncServerSettings();
              },
            ),
          ]),
          const SizedBox(height: 24),
          _section('Notifications', [
            _notifSwitch(store, Icons.notifications_active, 'Push Notifications', 'Enable device push (FCM / web_push)', store.notificationSettings.pushEnabled, (v) {
              ref.read(storeProvider.notifier).updateNotificationSettings(store.notificationSettings.copyWith(pushEnabled: v));
              _syncServerSettings();
            }),
            _notifSwitch(store, Icons.notifications_active, 'New Releases', 'Get notified about new content', store.notificationSettings.newReleases, (v) {
              ref.read(storeProvider.notifier).updateNotificationSettings(store.notificationSettings.copyWith(newReleases: v));
              _syncServerSettings();
            }),
            _notifSwitch(store, Icons.notifications, 'Watchlist Updates', 'When items change', store.notificationSettings.watchlistUpdates, (v) {
              ref.read(storeProvider.notifier).updateNotificationSettings(store.notificationSettings.copyWith(watchlistUpdates: v));
              _syncServerSettings();
            }),
            _notifSwitch(store, Icons.campaign, 'Creator Activity', 'Updates from creators you follow', store.notificationSettings.creatorActivity, (v) {
              ref.read(storeProvider.notifier).updateNotificationSettings(store.notificationSettings.copyWith(creatorActivity: v));
              _syncServerSettings();
            }),
            _notifSwitch(store, Icons.mode_comment, 'Comment Reply', 'Replies to your comments', store.notificationSettings.commentReply, (v) {
              ref.read(storeProvider.notifier).updateNotificationSettings(store.notificationSettings.copyWith(commentReply: v));
              _syncServerSettings();
            }),
            _notifSwitch(store, Icons.volume_up, 'Sound', 'Play sound for notifications', store.notificationSettings.sound, (v) {
              ref.read(storeProvider.notifier).updateNotificationSettings(store.notificationSettings.copyWith(sound: v));
              _syncServerSettings();
            }),
            _notifSwitch(store, Icons.local_offer, 'Marketing', 'Promotions and offers', store.notificationSettings.marketing, (v) {
              ref.read(storeProvider.notifier).updateNotificationSettings(store.notificationSettings.copyWith(marketing: v));
              _syncServerSettings();
            }),
          ]),
          const SizedBox(height: 24),
          _section('Your Library', [
            _linkTile(Icons.bookmark, 'Watchlist', () => context.push('/watchlist')),
            _linkTile(Icons.person, 'Profile', () => context.push('/profile')),
            _linkTile(Icons.play_circle, 'Continue Watching', () => context.push('/home')),
            _linkTile(Icons.share, 'Refer & Earn', () => context.push('/referrals')),
          ]),
          if (user?.isCreator ?? false) ...[
            const SizedBox(height: 24),
            _section('Creator Tools', [
              _linkTile(Icons.cloud_upload, 'Upload Film', () => context.push('/upload')),
              _linkTile(Icons.school, 'E-Learning', () => context.push('/learn')),
              _linkTile(Icons.storefront, 'Merch Store', () => context.push('/store')),
              _linkTile(Icons.dashboard, 'Dashboard', () => context.push('/creator')),
            ]),
          ],
          const SizedBox(height: 24),
          _section('Danger Zone', [
            if (!_showDeleteConfirm)
              AppButton(
                label: 'Delete Account',
                onPressed: () => setState(() => _showDeleteConfirm = true),
                outlined: true,
                color: AppColors.error,
              )
            else ...[
              const Text(
                'This will permanently delete your account and all data. Type DELETE to confirm.',
                style: TextStyle(color: AppColors.error, fontSize: 13),
              ),
              const SizedBox(height: 12),
              AppInput(controller: _deleteCtl, hint: 'Type DELETE'),
              const SizedBox(height: 12),
              Row(children: [
                AppButton(
                  label: _deleting ? 'Deleting...' : 'Permanently Delete',
                  onPressed: _deleting ? null : _deleteAccount,
                  color: AppColors.error,
                  fullWidth: false,
                ),
                const SizedBox(width: 12),
                AppButton(
                  label: 'Cancel',
                  onPressed: () => setState(() { _showDeleteConfirm = false; _deleteCtl.clear(); }),
                  text: true,
                ),
              ]),
            ],
          ]),
          const SizedBox(height: 32),
        ],
      ),
    ),
    ),
    );
  }

  Widget _field(String label, Widget child) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: AppTypography.labelSm.copyWith(color: AppColors.onSurfaceVariant)),
        const SizedBox(height: 4),
        child,
      ],
    );
  }

  Widget _notifSwitch(
    StoreState store,
    IconData icon,
    String title,
    String subtitle,
    bool value,
    ValueChanged<bool> onChanged,
  ) {
    return SwitchListTile(
      secondary: Icon(icon, color: AppColors.primary),
      title: Text(title, style: const TextStyle(fontSize: 15)),
      subtitle: Text(subtitle, style: const TextStyle(color: AppColors.onSurfaceVariant, fontSize: 13)),
      value: value,
      onChanged: onChanged,
    );
  }

  Future<void> _showLanguagePicker() async {
    final store = ref.read(storeProvider);
    final selected = await AppModal.show<String>(
      context,
      title: 'Language',
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: _locales.entries.map((e) {
          final active = store.locale == e.key;
          return ListTile(
            leading: Icon(active ? Icons.check : Icons.language, color: active ? AppColors.primary : AppColors.onSurfaceVariant),
            title: Text(e.value, style: TextStyle(color: active ? AppColors.primary : AppColors.onSurface)),
            onTap: () => Navigator.of(context).pop(e.key),
          );
        }).toList(),
      ),
    );
    if (selected != null) {
      ref.read(storeProvider.notifier).setLocale(selected);
    }
  }

  String _planName(String? plan) {
    if (plan == null || plan.isEmpty) return 'Free';
    return plan[0].toUpperCase() + plan.substring(1);
  }

  String _formatDate(String? iso) {
    if (iso == null || iso.isEmpty) return 'recently';
    try {
      final dt = DateTime.parse(iso).toLocal();
      return '${dt.month}/${dt.day}/${dt.year}';
    } catch (_) {
      return iso;
    }
  }

  Widget _section(String title, List<Widget> children) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title.toUpperCase(), style: AppTypography.labelXs.copyWith(color: AppColors.onSurfaceVariant, letterSpacing: 2)),
        const SizedBox(height: 8),
        Container(
          decoration: BoxDecoration(
            color: AppColors.surfaceContainerHigh,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.white.withValues(alpha: 0.05)),
          ),
          child: Column(children: children),
        ),
      ],
    );
  }

  Widget _linkTile(IconData icon, String label, VoidCallback onTap) {
    return ListTile(
      leading: Icon(icon, color: AppColors.primary),
      title: Text(label, style: const TextStyle(fontSize: 15)),
      trailing: const Icon(Icons.chevron_right, color: AppColors.onSurfaceVariant),
      onTap: onTap,
    );
  }
}
