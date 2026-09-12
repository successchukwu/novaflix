import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';
import '../services/currency_service.dart';
import '../models/subscription_plan.dart';
import '../services/subscription_service.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';
import '../widgets/ui/index.dart';
import '../core/responsive.dart';


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

class PricingScreen extends ConsumerStatefulWidget {
  final String? upgrade;

  const PricingScreen({super.key, this.upgrade});

  @override
  ConsumerState<PricingScreen> createState() => _PricingScreenState();
}

class _PricingScreenState extends ConsumerState<PricingScreen> {
  // promo code injection from link (searchParams.get('code') parity)
  String _initialPromoCode = '';
  bool _promoInitialized = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_promoInitialized) {
      final code = GoRouterState.of(context).uri.queryParameters['code'];
      if (code != null && code.isNotEmpty) {
        _initialPromoCode = code.toUpperCase();
      }
      // also check upgrade query param fallback
      _promoInitialized = true;
    }
  }

  @override
  Widget build(BuildContext context) {
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
          final selectedSlug = widget.upgrade ?? user?.plan ?? 'standard';
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
  ) async {
    final gateways = ref.read(_gatewayProvider).value ??
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
    // default gateway parity with web: prefer configured
    if (flutterwave['configured'] != true && paystack['configured'] == true) {
      gateway = 'paystack';
    }
    bool busy = false;

    // promo code state - injection from link + manual input
    final promoCtl = TextEditingController(text: _initialPromoCode);
    String? promoCode = _initialPromoCode.isNotEmpty ? _initialPromoCode : null;
    Map<String, dynamic>? promoValid; // {valid, discount, total, originalAmount, error}
    bool promoApplying = false;
    String? promoError;

    Future<void> validatePromo(String code) async {
      if (code.trim().isEmpty) return;
      try {
        final api = ref.read(apiServiceProvider);
        final res = await api.validatePromo(code.trim().toUpperCase(), plan['slug'].toString());
        final data = res.data as Map<String, dynamic>;
        final isValid = data['valid'] == true || data['success'] == true && data['valid'] != false;
        if (isValid || data['discount'] != null) {
          promoValid = {
            'valid': true,
            'discount': data['discount'],
            'total': data['total'] ?? data['amount'],
            'originalAmount': data['originalAmount'] ?? data['original_amount'],
          };
          promoError = null;
        } else {
          promoValid = {'valid': false};
          promoError = data['error']?.toString() ?? 'Invalid promo code';
        }
      } catch (e) {
        promoValid = {'valid': false};
        promoError = friendlyErrorMessage(e);
      }
    }

    // auto-validate if code came from link
    if (promoCode != null && promoCode.isNotEmpty) {
      await validatePromo(promoCode);
    }

    await showDialog(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.6),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialog) {
          final canPay =
              gateway != 'paystack' || (paystack['configured'] == true);
          final gatewayNotConfigured = (gateway == 'paystack' && paystack['configured'] != true) ||
              (gateway == 'flutterwave' && flutterwave['configured'] != true);
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
              child: SingleChildScrollView(
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
                    // promo code injection + manual input (parity with Pricing.tsx)
                    Text(
                      'PROMO CODE',
                      style: AppTypography.labelSm.copyWith(
                        color: AppColors.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: promoCtl,
                            textCapitalization: TextCapitalization.characters,
                            onChanged: (v) {
                              promoCode = v.toUpperCase();
                              promoValid = null;
                              promoError = null;
                              setDialog(() {});
                            },
                            decoration: InputDecoration(
                              hintText: 'Enter promo code',
                              hintStyle: const TextStyle(color: AppColors.onSurfaceVariant),
                              filled: true,
                              fillColor: AppColors.surfaceContainer,
                              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(10),
                                borderSide: BorderSide(color: AppColors.white.withValues(alpha: 0.1)),
                              ),
                              enabledBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(10),
                                borderSide: BorderSide(color: AppColors.white.withValues(alpha: 0.1)),
                              ),
                            ),
                            style: const TextStyle(color: AppColors.onSurface, fontSize: 14),
                          ),
                        ),
                        const SizedBox(width: 8),
                        SizedBox(
                          height: 44,
                          child: FilledButton(
                            onPressed: promoApplying || promoCtl.text.trim().isEmpty
                                ? null
                                : () async {
                                    setDialog(() => promoApplying = true);
                                    await validatePromo(promoCtl.text);
                                    if (ctx.mounted) setDialog(() => promoApplying = false);
                                  },
                            style: FilledButton.styleFrom(
                              backgroundColor: AppColors.primaryContainer,
                              foregroundColor: AppColors.onPrimaryContainer,
                              padding: const EdgeInsets.symmetric(horizontal: 16),
                            ),
                            child: promoApplying
                                ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                                : const Text('Apply'),
                          ),
                        ),
                      ],
                    ),
                    if (promoValid?['valid'] == true) ...[
                      const SizedBox(height: 8),
                      Text(
                        'Promo applied! You save ${CurrencyService.format(promoValid!['discount'] as num? ?? 0)}',
                        style: const TextStyle(color: Colors.greenAccent, fontSize: 13),
                      ),
                      const SizedBox(height: 12),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: AppColors.surfaceContainer,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: AppColors.white.withValues(alpha: 0.05)),
                        ),
                        child: Column(
                          children: [
                            Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                              const Text('Original price', style: TextStyle(color: AppColors.onSurfaceVariant, fontSize: 13)),
                              Text(CurrencyService.format(promoValid!['originalAmount'] as num? ?? plan['price'] as num? ?? 0), style: const TextStyle(color: AppColors.onSurface, fontSize: 13)),
                            ]),
                            const SizedBox(height: 4),
                            Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                              const Text('Discount', style: TextStyle(color: Colors.greenAccent, fontSize: 13)),
                              Text('-${CurrencyService.format(promoValid!['discount'] as num? ?? 0)}', style: const TextStyle(color: Colors.greenAccent, fontWeight: FontWeight.w700, fontSize: 13)),
                            ]),
                            const Divider(height: 16, color: AppColors.outlineVariant),
                            Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                              const Text('Total to pay', style: TextStyle(color: AppColors.onSurface, fontWeight: FontWeight.w700)),
                              Text(CurrencyService.format(promoValid!['total'] as num? ?? 0), style: const TextStyle(color: AppColors.primaryContainer, fontWeight: FontWeight.w700)),
                            ]),
                          ],
                        ),
                      ),
                    ],
                    if (promoValid?['valid'] == false && promoError != null) ...[
                      const SizedBox(height: 8),
                      Text(promoError!, style: const TextStyle(color: AppColors.error, fontSize: 13)),
                    ],
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
                      onPressed: !canPay || busy || gatewayNotConfigured
                          ? null
                          : () async {
                              // For Flutterwave, use new in-app Charge API with card tokenization + paymentPlan
                              if (gateway == 'flutterwave') {
                                final slug = plan['slug'].toString();
                                final subPlan = planForSlug(slug);
                                if (ctx.mounted) Navigator.of(ctx).pop();
                                if (context.mounted) {
                                  await executeInAppSubscription(context, subPlan);
                                }
                                return;
                              }
                              // Paystack fallback: keep hosted WebView flow
                              setDialog(() => busy = true);
                              try {
                                final api = ref.read(apiServiceProvider);
                                final effectivePromo = promoValid?['valid'] == true ? promoCtl.text.trim().toUpperCase() : null;
                                final res = await api.initializePayment(
                                  plan['slug'].toString(),
                                  gateway: gateway,
                                  promoCode: effectivePromo,
                                );
                                final body = res.data is Map
                                    ? res.data as Map
                                    : <String, dynamic>{};
                                final url = body['authorization_url']?.toString();
                                final reference = body['reference']?.toString() ?? '';
                                if (url != null && url.isNotEmpty) {
                                  if (ctx.mounted) Navigator.of(ctx).pop();
                                  if (context.mounted) {
                                    await Navigator.of(context).push(
                                      MaterialPageRoute(
                                        builder: (_) => _PaymentWebViewScreen(
                                          authorizationUrl: url,
                                          reference: reference,
                                          plan: plan['slug'].toString(),
                                          gateway: gateway,
                                        ),
                                      ),
                                    );
                                  }
                                } else {
                                  setDialog(() => busy = false);
                                  if (ctx.mounted) {
                                    ScaffoldMessenger.of(ctx).showSnackBar(
                                      SnackBar(content: Text(body['error']?.toString() ?? 'Failed to initialize payment')),
                                    );
                                  }
                                }
                              } catch (e) {
                                if (ctx.mounted) {
                                  setDialog(() => busy = false);
                                  ScaffoldMessenger.of(ctx).showSnackBar(
                                    SnackBar(content: Text(friendlyErrorMessage(e))),
                                  );
                                }
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
                              gatewayNotConfigured
                                  ? '${gateway == 'paystack' ? 'Paystack' : 'Flutterwave'} unavailable'
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

/// WebView for payment with authorization_url and verifyPayment realtime
/// Handles gateway flutterwave/paystack via hosted checkout URL.
class _PaymentWebViewScreen extends StatefulWidget {
  final String authorizationUrl;
  final String reference;
  final String plan;
  final String gateway;

  const _PaymentWebViewScreen({
    required this.authorizationUrl,
    required this.reference,
    required this.plan,
    required this.gateway,
  });

  @override
  State<_PaymentWebViewScreen> createState() => _PaymentWebViewScreenState();
}

class _PaymentWebViewScreenState extends State<_PaymentWebViewScreen> {
  late final WebViewController _controller;
  bool _verifying = false;
  bool _handling = false;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(AppColors.background)
      ..setNavigationDelegate(NavigationDelegate(
        onNavigationRequest: (request) {
          final url = request.url.toLowerCase();
          // Detect success/callback redirects from flutterwave/paystack hosted pages
          if (url.contains('payment-success') ||
              url.contains('callback') ||
              url.contains('verify') ||
              (widget.reference.isNotEmpty && url.contains(widget.reference.toLowerCase())) ||
              url.contains('status=successful') ||
              url.contains('status=success')) {
            _verifyPaymentRealtime();
            return NavigationDecision.prevent;
          }
          return NavigationDecision.navigate;
        },
        onPageFinished: (url) {
          final lower = url.toLowerCase();
          if (lower.contains('payment-success') ||
              lower.contains('callback') ||
              (widget.reference.isNotEmpty && lower.contains(widget.reference.toLowerCase()))) {
            _verifyPaymentRealtime();
          }
        },
      ))
      ..loadRequest(Uri.parse(widget.authorizationUrl));
  }

  Future<void> _verifyPaymentRealtime() async {
    if (_handling) return;
    _handling = true;
    if (mounted) setState(() => _verifying = true);
    try {
      // Use ApiService verifyPayment realtime
      final container = ProviderScope.containerOf(context);
      final api = container.read(apiServiceProvider);
      final res = await api.verifyPayment(widget.reference, widget.plan);
      final data = res.data is Map ? res.data as Map : {};
      final success = data['success'] == true || data['status'] == 'success' || res.statusCode == 200;
      if (!mounted) return;
      if (success) {
        Navigator.of(context).pop();
        context.go('/payment-success?reference=${widget.reference}&plan=${widget.plan}');
      } else {
        if (mounted) setState(() => _verifying = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(data['error']?.toString() ?? 'Verification pending. Please wait.')),
        );
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _verifying = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(friendlyErrorMessage(e))),
      );
    } finally {
      _handling = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.surfaceContainerLowest,
        leading: IconButton(
          icon: const Icon(Icons.close, color: AppColors.onSurface),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: Text('Secure Payment — ${widget.gateway}', style: AppTypography.labelLg),
        actions: [
          if (_verifying)
            const Padding(
              padding: EdgeInsets.only(right: 16),
              child: Center(child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))),
            ),
          TextButton(
            onPressed: _verifying ? null : _verifyPaymentRealtime,
            child: const Text('Verify'),
          ),
        ],
      ),
      body: Stack(
        children: [
          WebViewWidget(controller: _controller),
          if (_verifying)
            Container(
              color: Colors.black.withValues(alpha: 0.4),
              child: const Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    CircularProgressIndicator(color: AppColors.primaryContainer),
                    SizedBox(height: 12),
                    Text('Verifying payment...', style: TextStyle(color: Colors.white)),
                  ],
                ),
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

    // pricing reference — pricingBg #111, pricingCard #202020, pricingRed #ff0718
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: selected
            ? AppColors.pricingCardHover
            : AppColors.pricingCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: selected || isPopular
              ? AppColors.pricingRed.withValues(alpha: 0.5)
              : AppColors.pricingBorder,
        ),
        boxShadow: (selected || isPopular)
            ? [
                BoxShadow(
                  color: AppColors.pricingRed.withValues(alpha: 0.08),
                  blurRadius: 24,
                ),
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.45),
                  blurRadius: 20,
                  offset: const Offset(0, 8),
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
                    color: AppColors.pricingRed,
                    borderRadius: const BorderRadius.only(
                      bottomLeft: Radius.circular(8),
                      bottomRight: Radius.circular(8),
                    ),
                  ),
                  child: Text(
                    'Most Popular',
                    style: AppTypography.labelSm.copyWith(
                      color: AppColors.pricingWhite,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.5,
                      fontSize: 9,
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
                    color: AppColors.pricingGreen,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    'Current',
                    style: AppTypography.labelSm.copyWith(
                      color: const Color(0xFF07190D),
                      fontWeight: FontWeight.w800,
                      fontSize: 9,
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
            style: AppTypography.headlineMd.copyWith(color: AppColors.pricingWhite, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 2),
          Text(
            description,
            textAlign: TextAlign.center,
            style: AppTypography.labelSm.copyWith(
              color: const Color(0xFF9D9D9D),
              fontSize: 10,
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
                  color: AppColors.pricingWhite,
                  fontSize: 32,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -1,
                ),
              ),
              Text(
                '/month',
                style: AppTypography.bodyMd.copyWith(
                  color: const Color(0xFF888888),
                  fontSize: 10,
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
                        Container(
                          width: 14,
                          height: 14,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            border: Border.all(color: AppColors.pricingRedLight, width: 1),
                          ),
                          child: const Icon(
                            Icons.check,
                            size: 10,
                            color: AppColors.pricingRedLight,
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            f,
                            style: AppTypography.bodyMd.copyWith(
                              color: const Color(0xFFC8C8C8),
                              fontSize: 11,
                              height: 1.45,
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
            height: 44,
            child: FilledButton(
              onPressed: isActive ? null : onSubscribe,
              style: FilledButton.styleFrom(
                backgroundColor: isActive
                    ? Colors.transparent
                    : selected || isPopular
                        ? AppColors.pricingRed
                        : Colors.transparent,
                foregroundColor: isActive
                    ? const Color(0xFF777777)
                    : AppColors.pricingWhite,
                side: BorderSide(
                  color: isActive
                      ? const Color(0xFF444444)
                      : AppColors.pricingRed,
                  width: 1,
                ),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(6),
                ),
              ),
              child: Text(
                isActive
                    ? 'Current Plan'
                    : 'Subscribe — ${CurrencyService.format(price)}',
                style: AppTypography.labelMd.copyWith(
                  fontWeight: FontWeight.w700,
                  fontSize: 10,
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
