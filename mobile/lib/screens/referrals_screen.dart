import 'package:flutter/material.dart';
import '../services/currency_service.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter/services.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';
import '../core/responsive.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';
import '../widgets/ui/index.dart';

/// Web app origin where the `?ref=` registration flow lives.
const String _webOrigin = 'https://novaflix-web.vercel.app';

class ReferralsScreen extends ConsumerStatefulWidget {
  const ReferralsScreen({super.key});

  @override
  ConsumerState<ReferralsScreen> createState() => _ReferralsScreenState();
}

class _ReferralsScreenState extends ConsumerState<ReferralsScreen> {
  String _url = '';
  Map<String, dynamic> _stats = const {};
  List<Map<String, dynamic>> _referrals = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final api = ref.read(apiServiceProvider);
    final user = ref.read(authProvider).user;
    if (user == null) {
      if (mounted) setState(() => _loading = false);
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        api.generateReferral(),
        api.getAffiliateStats(),
      ]);
      final gen = results[0].data;
      final stats = results[1].data;
      if (gen is Map) {
        _url = _webUrl(gen['url']?.toString() ?? '');
      }
      if (stats is Map) {
        _stats = (stats['stats'] as Map?)?.cast<String, dynamic>() ?? const {};
        _referrals =
            (stats['referrals'] as List?)?.cast<Map<String, dynamic>>() ?? [];
      }
    } catch (e) {
      if (mounted) setState(() => _error = 'Failed to load referral data. $e');
    }
    if (mounted) setState(() => _loading = false);
  }

  /// Server builds the URL from its own host (the API server), which has no
  /// frontend. Rewrite it to the real web app origin.
  String _webUrl(String url) {
    if (url.isEmpty) return '';
    final ref = Uri.tryParse(url)?.queryParameters['ref'] ?? '';
    return ref.isEmpty ? url : '$_webOrigin/register?ref=$ref';
  }

  Future<void> _copyLink() async {
    if (_url.isEmpty) return;
    try {
      await Clipboard.setData(ClipboardData(text: _url));
      if (mounted) _toast('Referral link copied!');
    } catch (_) {}
  }

  Future<void> _share() async {
    if (_url.isEmpty) return;
    try {
      await Share.share(
        'Join NovaFlix and discover amazing movies! Sign up using my link: $_url',
      );
    } catch (_) {
      _copyLink();
    }
  }

  Future<void> _shareWhatsApp() async {
    if (_url.isEmpty) return;
    final text =
        'Join NovaFlix and discover amazing movies! Sign up using my link: $_url';
    final uri = Uri.https('wa.me', '/', {'text': text});
    try {
      final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!ok && mounted) _toast('Could not open WhatsApp');
    } catch (_) {
      if (mounted) _toast('Could not open WhatsApp');
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

  String _formatDate(String iso) {
    final dt = DateTime.tryParse(iso);
    if (dt == null) return iso;
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    return '${months[dt.month - 1]} ${dt.day}, ${dt.year}';
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    final width = MediaQuery.sizeOf(context).width;
    final hPadding = responsivePadding(width);

    if (user == null) {
      return Scaffold(
        backgroundColor: AppColors.background,
        body: Center(
          child: FilledButton(
            onPressed: () => context.push('/login?redirect=/referrals'),
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.primaryContainer,
              foregroundColor: AppColors.onPrimaryContainer,
            ),
            child: const Text('Sign in to refer & earn'),
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: AppColors.background,
      body: _loading
          ? const Center(child: LoadingSpinner())
          : _error != null
              ? _errorView()
              : SingleChildScrollView(
              padding: EdgeInsets.fromLTRB(hPadding, 32, hPadding, 48),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 672),
                  child: Column(
                    children: [
                      const SizedBox(height: 16),
                      Container(
                        width: 56,
                        height: 56,
                        decoration: BoxDecoration(
                          color: AppColors.secondary.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: const Icon(
                          Icons.share,
                          size: 28,
                          color: AppColors.secondary,
                        ),
                      ),
                      const SizedBox(height: 16),
                      Text('Refer & Earn', style: AppTypography.headlineMd),
                      const SizedBox(height: 6),
                      Text(
                        'Invite friends to NovaFlix and earn rewards',
                        style: AppTypography.bodySm.copyWith(
                          color: AppColors.onSurfaceVariant,
                        ),
                      ),
                      const SizedBox(height: 32),
                      _linkCard(),
                      const SizedBox(height: 24),
                      _statsRow(),
                      const SizedBox(height: 24),
                      _historyCard(),
                      const SizedBox(height: 32),
                      Text(
                        'Terms apply. Commission is credited after the referred friend\'s first paid subscription.',
                        textAlign: TextAlign.center,
                        style: AppTypography.labelXs.copyWith(
                          color: AppColors.onSurfaceVariant.withValues(alpha: 0.4),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
    );
  }

  Widget _errorView() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.cloud_off,
              size: 48,
              color: AppColors.onSurfaceVariant,
            ),
            const SizedBox(height: 16),
            Text(
              _error ?? 'Something went wrong',
              textAlign: TextAlign.center,
              style: AppTypography.bodyMd.copyWith(
                color: AppColors.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: _load,
              icon: const Icon(Icons.refresh, size: 18),
              label: const Text('Retry'),
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.primaryContainer,
                foregroundColor: AppColors.onPrimaryContainer,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _linkCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: AppColors.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.white.withValues(alpha: 0.05)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Your Referral Link',
            style: AppTypography.labelXs.copyWith(
              color: AppColors.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 8),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: AppColors.surfaceContainer,
              borderRadius: BorderRadius.circular(9),
              border: Border.all(color: AppColors.white.withValues(alpha: 0.05)),
            ),
            child: Row(
              children: [
                const Icon(
                  Icons.link,
                  size: 16,
                  color: AppColors.primaryContainer,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    _url.isEmpty ? 'Loading…' : _url,
                    style: const TextStyle(
                      color: AppColors.onSurface,
                      fontSize: 14,
                      fontFamily: 'monospace',
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          LayoutBuilder(
            builder: (context, constraints) {
              final rows = constraints.maxWidth < 420 ? 3 : 1;
              final children = <Widget>[
                Expanded(child: _btn(Icons.content_copy, 'Copy Link', _copyLink)),
                const SizedBox(width: 12),
                Expanded(child: _btn(Icons.share, 'Share', _share)),
                const SizedBox(width: 12),
                Expanded(child: _btn(Icons.chat, 'WhatsApp', _shareWhatsApp, isWhatsApp: true)),
              ];
              if (rows == 3) {
                return Column(
                  children: [
                    Row(children: children.take(3).toList()),
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      child: _btn(Icons.chat, 'WhatsApp', _shareWhatsApp, isWhatsApp: true),
                    ),
                  ],
                );
              }
              return Row(children: children);
            },
          ),
        ],
      ),
    );
  }

  Widget _btn(IconData icon, String label, VoidCallback onTap, {bool isWhatsApp = false}) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        height: 44,
        decoration: BoxDecoration(
          color: isWhatsApp
              ? AppColors.secondary.withValues(alpha: 0.2)
              : AppColors.outline.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              icon,
              size: 15,
              color: isWhatsApp
                  ? AppColors.secondary
                  : AppColors.onSurfaceVariant,
            ),
            const SizedBox(width: 6),
            Text(
              label,
              style: AppTypography.labelSm.copyWith(
                color: isWhatsApp
                    ? AppColors.secondary
                    : AppColors.onSurfaceVariant,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _statsRow() {
    final total = _stats['total'] is num ? (_stats['total'] as num).toString() : _stats['total']?.toString() ?? '0';
    final converted = _stats['converted'] is num ? (_stats['converted'] as num).toString() : _stats['converted']?.toString() ?? '0';
    final raw = _stats['total_commission'];
    final commission = _num(raw);
    return Row(
      children: [
        _stat(Icons.group, total, 'TOTAL REFERRALS'),
        const SizedBox(width: 12),
        _stat(Icons.check_circle, converted, 'CONVERTED'),
        const SizedBox(width: 12),
        _stat(Icons.payments, '₦$commission', 'COMMISSION'),
      ],
    );
  }

  /// Server returns numeric columns as strings (node-postgres bigint/numeric).
  static int _num(dynamic v) {
    if (v == null) return 0;
    if (v is num) return v.toInt();
    return int.tryParse(v.toString()) ?? 0;
  }

  Widget _stat(IconData icon, String value, String label) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 16),
        decoration: BoxDecoration(
          color: AppColors.surfaceContainerHigh,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.white.withValues(alpha: 0.05)),
        ),
        child: Column(
          children: [
            Icon(icon, size: 20, color: AppColors.primaryContainer),
            const SizedBox(height: 6),
            Text(
              value,
              style: AppTypography.headlineMd.copyWith(
                color: AppColors.onSurface,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              label,
              textAlign: TextAlign.center,
              style: AppTypography.labelXs.copyWith(
                color: AppColors.onSurfaceVariant.withValues(alpha: 0.6),
                letterSpacing: 1,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _historyCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: AppColors.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.white.withValues(alpha: 0.05)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Referral History',
            style: AppTypography.labelMd.copyWith(
              color: AppColors.onSurface,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 8),
          if (_referrals.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 24),
              child: Column(
                children: [
                  const Icon(
                    Icons.group_add,
                    size: 40,
                    color: AppColors.onSurfaceVariant,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'No referrals yet. Share your link to get started!',
                    textAlign: TextAlign.center,
                    style: AppTypography.bodySm.copyWith(
                      color: AppColors.onSurfaceVariant.withValues(alpha: 0.6),
                    ),
                  ),
                ],
              ),
            )
          else
            for (final r in _referrals) _referralRow(r),
        ],
      ),
    );
  }

  Widget _referralRow(Map<String, dynamic> r) {
    final status = r['status']?.toString() ?? '';
    final commission = _num(r['commission']);
    final created = r['created_at']?.toString() ?? '';
    Color color = const Color(0xFFFFC107);
    if (status == 'converted') color = AppColors.secondary;
    if (status == 'paid') color = AppColors.primaryContainer;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10),
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(color: AppColors.white.withValues(alpha: 0.05)),
        ),
      ),
      child: Row(
        children: [
          Text(
            r['code']?.toString() ?? '',
            style: const TextStyle(
              color: AppColors.onSurface,
              fontSize: 14,
              fontFamily: 'monospace',
            ),
          ),
          const SizedBox(width: 10),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(4),
            ),
            child: Text(
              status.toUpperCase(),
              style: AppTypography.labelXs.copyWith(
                color: color,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          const Spacer(),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                _formatDate(created),
                style: AppTypography.labelXs.copyWith(
                  color: AppColors.onSurfaceVariant.withValues(alpha: 0.6),
                ),
              ),
              if (commission > 0)
                Text(
                  '+₦$commission',
                  style: AppTypography.labelXs.copyWith(
                    color: AppColors.secondary,
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}