import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../models/subscription_plan.dart';
import '../theme/app_colors.dart';

/// Premium dark cinematic success screen shown after Flutterwave `successful` charge.
/// Displays green check, summary card (tier, price, next renewal 30 days), and CTA to dashboard.
class SubscriptionActivatedScreen extends StatelessWidget {
  final SubscriptionPlan plan;

  const SubscriptionActivatedScreen({super.key, required this.plan});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF050505),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Green stylized checkmark
                Container(
                  width: 80,
                  height: 80,
                  decoration: BoxDecoration(
                    color: const Color(0xFF0A2F1A),
                    shape: BoxShape.circle,
                    border: Border.all(color: const Color(0xFF1DB954), width: 2),
                  ),
                  child: const Icon(Icons.check, color: Color(0xFF1DB954), size: 44),
                ),
                const SizedBox(height: 24),
                const Text(
                  'Subscription Activated!',
                  style: TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w800, letterSpacing: 0.3),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  'Welcome to ${plan.name} — unlimited streaming awaits.',
                  style: TextStyle(color: Colors.white, fontSize: 14),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 28),

                // Summary card
                Container(
                  width: double.infinity,
                  constraints: const BoxConstraints(maxWidth: 420),
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: const Color(0xFF141414),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
                  ),
                  child: Column(
                    children: [
                      _row('Plan Name', plan.name),
                      const Divider(color: Colors.white10, height: 28),
                      _row('Price', plan.displayPrice),
                      const Divider(color: Colors.white10, height: 28),
                      _row('Next Renewal', plan.nextRenewalLabel),
                    ],
                  ),
                ),
                const SizedBox(height: 32),
                SizedBox(
                  width: 280,
                  height: 52,
                  child: FilledButton(
                    onPressed: () => context.go('/home'),
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                    ),
                    child: const Text('Start Streaming Now'),
                  ),
                ),
                const SizedBox(height: 12),
                TextButton(
                  onPressed: () => context.go('/home'),
                  child: Text('Browse catalog', style: TextStyle(color: Colors.white.withValues(alpha: 0.5))),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _row(String label, String value) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: TextStyle(color: Colors.white.withValues(alpha: 0.5), fontSize: 13)),
        Text(value, style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w600)),
      ],
    );
  }
}
