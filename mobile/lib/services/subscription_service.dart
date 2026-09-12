import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutterwave_standard/flutterwave.dart';
import '../models/subscription_plan.dart';
import '../models/user.dart';
import '../providers/auth_provider.dart';
import '../screens/subscription_activated_screen.dart';
import '../theme/app_colors.dart';
import '../widgets/subscription/securing_dialog.dart';
import '../services/api_service.dart';

/// Robust in-app checkout using **flutterwave_standard** Charge API.
/// - Enforces card tokenization for Spotify-style monthly billing via paymentOptions
/// - Ties user to Flutterwave Dashboard recurring plan via paymentPlanId
Future<void> executeInAppSubscription(
  BuildContext context,
  SubscriptionPlan selectedPlan, {
  WidgetRef? ref,
}) async {
  final container = ProviderScope.containerOf(context, listen: false);
  final authState = container.read(authProvider);
  final user = container.read(authProvider).user;

  // Dynamic customer profile from authProvider.user (require login)
  if (user == null) {
    if (context.mounted) context.go('/login?redirect=/pricing');
    return;
  }

  // 1) Dark loading overlay — bridges safely to checkout sheet
  showDialog(
    context: context,
    barrierDismissible: false,
    barrierColor: Colors.black54,
    builder: (_) => const SecuringMoviePassDialog(),
  );

  try {
    final txRef = 'NOVAFLEX_${selectedPlan.slug}_${DateTime.now().millisecondsSinceEpoch}';
    final email = user.email.trim();
    final name = user.username.trim().isNotEmpty ? user.username.trim() : 'NovaFlix User';
    const phoneFallback = '08000000000';

    final customer = Customer(email: email, name: name, phoneNumber: phoneFallback);

    const publicKey = String.fromEnvironment('FLUTTERWAVE_PUBLIC_KEY',
        defaultValue: 'FLWPUBK_TEST-e7ef088503fad91d261956291e4a351a-X');

    final flutterwave = Flutterwave(
      publicKey: const String.fromEnvironment('FLUTTERWAVE_PUBLIC_KEY',
          defaultValue: 'FLWPUBK_TEST-e7ef088503fad91d261956291e4a351a-X'),
      txRef: txRef,
      amount: selectedPlan.priceNgn.toString(),
      customer: Customer(email: email, name: name, phoneNumber: phoneFallback),
      paymentOptions: 'card',
      customization: Customization(title: 'NovaFlix — ${selectedPlan.name}'),
      redirectUrl: 'https://novaflix.app/payment-success',
      isTestMode: true,
      currency: 'NGN',
      paymentPlanId: selectedPlan.id,
    );

    // Dismiss loading BEFORE opening Flutterwave sheet (which has its own overlay) to avoid double-dialog
    if (context.mounted) Navigator.of(context, rootNavigator: true).pop();

    final ChargeResponse response = await flutterwave.charge(context);

    if (!context.mounted) return;

    final status = response.status?.toLowerCase();
    final success = response.success == true;

    if ((status == 'successful' || status == 'success') && success) {
      // Background server verification (best-effort)
      try {
        final api = ProviderScope.containerOf(context, listen: false).read(apiServiceProvider);
        await api.verifyPayment(response.transactionId ?? txRef, selectedPlan.slug);
        await ProviderScope.containerOf(context, listen: false).read(authProvider.notifier).refreshUser();
      } catch (_) {}

      if (context.mounted) {
        Navigator.of(context).popUntil((r) => r.isFirst);
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (_) => SubscriptionActivatedScreen(plan: selectedPlan)),
        );
      }
    } else if (response.status == null || status == 'cancelled' || status == 'failed') {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Payment cancelled — your movie pass is waiting.'),
            backgroundColor: Color(0xFF1E1E1E),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } else {
      throw Exception(response.status ?? 'Transaction failed — please try again.');
    }
  } catch (e) {
    try {
      if (context.mounted) Navigator.of(context, rootNavigator: true).pop();
    } catch (_) {}

    if (!context.mounted) return;
    final msg = e.toString().split(':').last.trim();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Oops — $msg', maxLines: 2, overflow: TextOverflow.ellipsis),
        backgroundColor: const Color(0xFF2A0B0B),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    );
  }
}

String planIntervalLabel(SubscriptionPlan plan) => 'Monthly ${plan.name}';