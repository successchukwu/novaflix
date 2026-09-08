import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';
import '../services/currency_service.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';
import '../widgets/ui/index.dart';
import '../core/responsive.dart';
import '../widgets/features/index.dart';

final _pricingProvider = FutureProvider<Map<String, dynamic>>((ref) async {
  final api = ref.read(apiServiceProvider);
  final res = await api.getPricing();
  return res.data as Map<String, dynamic>;
});

final _gatewayProvider = FutureProvider<Map<String, dynamic>>((ref) async {
  final api = ref.read(apiServiceProvider);
  final res = await api.getGatewayInfo();
  return res.data is Map
      ? Map<String, dynamic>.from(res.data as Map)
      : <String, dynamic>{};
});

class PricingScreen extends ConsumerWidget {
  final String? upgrade;

  const PricingScreen({super.key, this.upgrade});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pricing = ref.watch(_pricingProvider);
    final user = ref.watch(authProvider).user;
    final width = MediaQuery.sizeOf(context).width;
    final hPadding = responsivePadding(width);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: pricing.when(
        loading: () => const LoadingSpinner(),
        error: (e, _) => Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline, color: Colors.redAccent, size: 48),
              const SizedBox(height: 12),
              Text('Failed to load plans', style: AppTypography.bodyLg),
              const SizedBox(height: 8),
              FilledButton(
                onPressed: () => ref.invalidate(_pricingProvider),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
        data: (data) {
          final plans = (data['plans'] as List? ?? [])
              .map((p) => Map<String, dynamic>.from(p as Map))
              .toList();
          if (plans.isEmpty) {
            return const Center(child: Text('No plans available'));
          }
          final allFeatures = plans.fold<List<String>>(
            [],
            (acc, p) {
              for (final f in (p['features'] as List? ?? [])) {
                if (!acc.contains(f.toString())) acc.add(f.toString());
              }
              return acc;
            },
          );
          final selectedSlug = upgrade ?? user?.plan ?? 'standard';
          final activePlan = user?.plan;

          return SingleChildScrollView(
            padding: EdgeInsets.fromLTRB(hPadding, 32, hPadding, 64),
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 1200),
                child: Column(
                  children: [
                    _header(),
                    const SizedBox(height: 40),
                    _planGrid(
                      context,
                      ref,
                      plans,
                      selectedSlug,
                      activePlan,
                    ),
                    const SizedBox(height: 32),
                    InkWell(
                      onTap: () => context.go('/settings'),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            'Manage subscription',
                            style: AppTypography.labelMd.copyWith(
                              color: AppColors.onSurfaceVariant,
                            ),
                          ),
                          const SizedBox(width: 4),
                          const Icon(
                            Icons.arrow_forward,
                            size: 16,
                            color: AppColors.onSurfaceVariant,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 64),
                    _banner(),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _header() {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
          decoration: BoxDecoration(
            color: AppColors.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text(
            'PRICING TIERS',
            style: AppTypography.labelMd.copyWith(
              color: AppColors.secondary,
              letterSpacing: 2,
            ),
          ),
        ),
        const SizedBox(height: 16),
        Text(
          "Choose the plan that's right for you",
          textAlign: TextAlign.center,
          style: AppTypography.headlineLg,
        ),
        const SizedBox(height: 8),
        Text(
          'Stream movies, TV shows, creator content and more — cancel anytime.',
          textAlign: TextAlign.center,
          style: AppTypography.bodyLg.copyWith(color: AppColors.onSurfaceVariant),
        ),
      ],
    );
  }

  Widget _planGrid(
    BuildContext context,
    WidgetRef ref,
    List<Map<String, dynamic>> plans,
    String selectedSlug,
    String? activePlan,
  ) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final cols = gridColumns(constraints.maxWidth);

        return GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: cols,
            crossAxisSpacing: 16,
            mainAxisSpacing: 24,
            childAspectRatio: gridAspectRatio(constraints.maxWidth, cols),
          ),
          itemCount: plans.length,
          itemBuilder: (_, i) {
            final plan = plans[i];
            return _PlanCard(
              plan: plan,
              selected: plan['slug'] == selectedSlug,
              isActive: plan['slug'] == activePlan,
              onSubscribe: () => _startCheckout(context, ref, plan),
            );
          },
        );
      },
    );
  }

  Future<void> _startCheckout(
    BuildContext context,
    WidgetRef ref,
    Map<String, dynamic> plan,
  ) async {
    final user = ref.read(authProvider).user;
    if (user == null) {
      context.push('/login?redirect=/pricing');
      return;
    }
    if (plan['slug'] == user.plan) return;
    _openPaymentModal(context, ref, plan);
  }

  Future<void> _openPaymentModal(
    BuildContext context,
    WidgetRef ref,
    Map<String, dynamic> plan,
  ) async {    final gateways = ref.read(_gatewayProvider).value ??
        {'flutterwave': {'configured': true}, 'paystack': {'configured': false}};
    final gw = gateways['gateways'] is Map
        ? Map<String, dynamic>.from(gateways['gateways'] as Map)
        : gateways;
    final flutterwave =
        gw['flutterwave'] is Map
            ? Map<String, dynamic>.from(gw['flutterwave'] as Map)
            : {'configured': true};
    final paystack =
        gw['paystack'] is Map
            ? Map<String, dynamic>.from(gw['paystack'] as Map)
            : {'configured': false};
    String gateway = 'flutterwave';
    bool busy = false;

    await showDialog(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.6),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialog) {
          final canPay =
              gateway != 'paystack' || (paystack['configured'] == true);
          return Dialog(
            backgroundColor: AppColors.surfaceContainerHigh,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
              side: BorderSide(
                color: AppColors.outlineVariant.withValues(alpha: 0.3),
              ),
            ),
            child: SizedBox(
              width: MediaQuery.sizeOf(ctx).width >= 468
                  ? 420
                  : MediaQuery.sizeOf(ctx).width - 32,
              child: Padding(
                padding: const EdgeInsets.all(28),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Align(
                      alignment: Alignment.topRight,
                      child: IconButton(
                        onPressed: () => Navigator.of(ctx).pop(),
                        icon: const Icon(
                          Icons.close,
                          color: AppColors.onSurfaceVariant,
                        ),
                      ),
                    ),
                    Text(
                      'Complete Payment',
                      style: AppTypography.headlineMd.copyWith(
                        color: AppColors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${plan['name']} — ${plan['price']}/month',
                      style: AppTypography.bodyMd.copyWith(
                        color: AppColors.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(height: 20),
                    Text(
                      'SELECT PAYMENT METHOD',
                      style: AppTypography.labelSm.copyWith(
                        color: AppColors.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(height: 10),
                    _gatewayRow(
                      'Flutterwave',
                      selected: gateway == 'flutterwave',
                      configured: flutterwave['configured'] == true,
                      onTap: () => setDialog(() => gateway = 'flutterwave'),
                    ),
                    const SizedBox(height: 8),
                    _gatewayRow(
                      'Paystack',
                      selected: gateway == 'paystack',
                      configured: paystack['configured'] == true,
                      onTap: () => setDialog(() => gateway = 'paystack'),
                    ),
                    const SizedBox(height: 20),
                    FilledButton(
                      onPressed: !canPay || busy
                          ? null
                          : () async {
                              setDialog(() => busy = true);
                              try {
                                final api = ref.read(apiServiceProvider);
                                final res = await api.initializePayment(
                                  plan['slug'].toString(),
                                  gateway: gateway,
                                );
                                final body = res.data is Map
                                    ? res.data as Map
                                    : <String, dynamic>{};
                                final url = body['authorization_url'];
                                if (url != null && url.toString().isNotEmpty) {
                                  if (ctx.mounted) Navigator.of(ctx).pop();
                                  if (context.mounted) {
                                    context.push(
                                      '/payment-success?reference=${body['reference'] ?? ''}&plan=${plan['slug']}',
                                    );
                                  }
                                } else {
                                  setDialog(() => busy = false);
                                }
                              } catch (_) {
                                if (ctx.mounted) setDialog(() => busy = false);
                              }
                            },
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.primaryContainer,
                        foregroundColor: AppColors.onPrimaryContainer,
                        minimumSize: const Size.fromHeight(48),
                      ),
                      child: busy
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : Text(
                              !canPay
                                  ? 'Paystack unavailable'
                                  : 'Pay Now',
                            ),
                    ),
                    const SizedBox(height: 12),
                    Center(
                      child: Text(
                        "You'll be redirected to the payment portal",
                        style: AppTypography.bodySm.copyWith(
                          color: AppColors.onSurfaceVariant,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _gatewayRow(
    String name, {
    required bool selected,
    required bool configured,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: selected
              ? AppColors.surfaceContainerHigh
              : AppColors.surfaceContainer,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: selected
                ? AppColors.primaryContainer.withValues(alpha: 0.5)
                : AppColors.outlineVariant.withValues(alpha: 0.3),
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: AppColors.primaryContainer.withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(
                name == 'Flutterwave'
                    ? Icons.waves
                    : Icons.account_balance,
                size: 18,
                color: AppColors.primaryContainer,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                name,
                style: AppTypography.bodyMd.copyWith(
                  color: AppColors.onSurface,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            if (!configured)
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 8,
                  vertical: 2,
                ),
                decoration: BoxDecoration(
                  color: AppColors.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: const Text(
                  'Keys not set',
                  style: TextStyle(color: AppColors.onSurfaceVariant, fontSize: 11),
                ),
              ),
            const SizedBox(width: 8),
            Icon(
              selected
                  ? Icons.radio_button_checked
                  : Icons.radio_button_unchecked,
              size: 20,
              color: selected
                  ? AppColors.primaryContainer
                  : AppColors.onSurfaceVariant,
            ),
          ],
        ),
      ),
    );
  }

  Widget _banner() {
    return Container(
      height: 300,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            AppColors.primaryContainer.withValues(alpha: 0.2),
            AppColors.surface,
            AppColors.surface,
          ],
        ),
      ),
      child: Stack(
        children: [
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    AppColors.transparent,
                    AppColors.background.withValues(alpha: 0.8),
                  ],
                ),
              ),
            ),
          ),
          Positioned(
            left: 32,
            right: 32,
            bottom: 32,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'EXPERIENCE THE NEXUS',
                  style: AppTypography.labelMd.copyWith(
                    color: AppColors.secondary,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Studio quality content in every frame, everywhere you are.',
                  style: AppTypography.headlineMd.copyWith(
                    color: AppColors.onSurface,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PlanCard extends StatelessWidget {
  final Map<String, dynamic> plan;
  final bool selected;
  final bool isActive;
  final VoidCallback onSubscribe;

  const _PlanCard({
    required this.plan,
    required this.selected,
    required this.isActive,
    required this.onSubscribe,
  });

  @override
  Widget build(BuildContext context) {
    final name = plan['name']?.toString() ?? '';
    final description = plan['description']?.toString() ?? '';
    final price = plan['price'] as num? ?? 0;
    final slug = plan['slug']?.toString() ?? '';
    final features = (plan['features'] as List? ?? [])
        .map((f) => f.toString())
        .toList();
    final isPopular = slug == 'standard';

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: selected
            ? AppColors.surfaceContainerHigh
            : AppColors.surfaceContainer,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: selected
              ? AppColors.primaryContainer.withValues(alpha: 0.5)
              : AppColors.outlineVariant.withValues(alpha: 0.3),
        ),
        boxShadow: selected
            ? [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.5),
                  blurRadius: 24,
                ),
              ]
            : null,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (isPopular)
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: AppColors.primaryContainer,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    'Most Popular',
                    style: AppTypography.labelSm.copyWith(
                      color: AppColors.onPrimaryContainer,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.5,
                    ),
                  ),
                )
              else if (isActive)
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: AppColors.secondary,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    'Current',
                    style: AppTypography.labelSm.copyWith(
                      color: Colors.black,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                )
              else
                const SizedBox(height: 26),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            name,
            textAlign: TextAlign.center,
            style: AppTypography.headlineMd.copyWith(color: AppColors.onSurface),
          ),
          const SizedBox(height: 2),
          Text(
            description,
            textAlign: TextAlign.center,
            style: AppTypography.labelSm.copyWith(
              color: AppColors.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(
                CurrencyService.format(price),
                style: AppTypography.headlineLg.copyWith(
                  color: AppColors.onSurface,
                ),
              ),
              Text(
                '/month',
                style: AppTypography.bodyMd.copyWith(
                  color: AppColors.onSurfaceVariant,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Expanded(
            child: Column(
              children: [
                for (final f in features)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(
                          Icons.check_circle,
                          size: 18,
                          color: AppColors.primaryContainer,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            f,
                            style: AppTypography.bodyMd.copyWith(
                              color: AppColors.onSurface,
                              fontSize: 13,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 48,
            child: FilledButton(
              onPressed: isActive ? null : onSubscribe,
              style: FilledButton.styleFrom(
                backgroundColor: selected
                    ? AppColors.primaryContainer
                    : AppColors.transparent,
                foregroundColor: selected
                    ? AppColors.onPrimaryContainer
                    : AppColors.primaryContainer,
                side: selected
                    ? null
                    : BorderSide(color: AppColors.primaryContainer),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(9),
                ),
              ),
              child: Text(
                isActive
                    ? 'Current Plan'
                    : 'Subscribe — ${CurrencyService.format(price)}',
                style: AppTypography.labelMd.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
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
}