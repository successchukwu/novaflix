import 'package:intl/intl.dart';

/// Production data class for recurring billing via Flutterwave Dashboard Plans.
/// Keeps the existing 4-tier layout (800/1500/2500/5500) — `id` is the Flutterwave Plan ID (numeric as string).
class SubscriptionPlan {
  const SubscriptionPlan({
    required this.id,
    required this.slug,
    required this.name,
    required this.priceNgn,
    required this.benefits,
    this.interval = 'mo',
  });

  /// Flutterwave Dashboard Payment Plan ID (e.g. "107089"). Must exist in dashboard with matching amount.
  final String id;
  /// DB slug: student/basic/standard/premium
  final String slug;
  final String name;
  final int priceNgn;
  final List<String> benefits;
  final String interval;

  String get displayPrice {
    final f = NumberFormat('#,###');
    return '₦${f.format(priceNgn)}/$interval';
  }

  DateTime get nextRenewal => DateTime.now().add(const Duration(days: 30));

  String get nextRenewalLabel => DateFormat('MMM dd, yyyy').format(nextRenewal);
}

/// 4-tier constants — mirrors server/config/schema.sql seeds.
/// Replace FLW_PLAN_* placeholders with real IDs from Flutterwave Dashboard > Payment Plans (amounts must match priceNgn, interval monthly).
const kSubscriptionPlans = [
  SubscriptionPlan(
    id: 'FLW_PLAN_STUDENT', // TODO: replace with e.g. "107086" (800 NGN)
    slug: 'student',
    name: 'Student',
    priceNgn: 800,
    benefits: ['720p HD quality', 'All devices supported', '1 screen at a time', 'Offline downloads (1 device)', 'Ad-supported', '6 skips per hour'],
  ),
  SubscriptionPlan(
    id: 'FLW_PLAN_BASIC', // TODO: "107087" (1500 NGN)
    slug: 'basic',
    name: 'Basic Pass',
    priceNgn: 1500,
    benefits: ['720p HD quality', 'All devices supported', '1 screen at a time', 'Offline downloads (1 device)', 'Completely ad-free', '6 skips per hour'],
  ),
  SubscriptionPlan(
    id: 'FLW_PLAN_STANDARD', // TODO: "107088" (2500 NGN)
    slug: 'standard',
    name: 'Standard',
    priceNgn: 2500,
    benefits: ['1080p Full HD', 'All devices supported', '2 screens simultaneously', 'Offline downloads (2 devices)', 'Completely ad-free', 'Unlimited skips'],
  ),
  SubscriptionPlan(
    id: 'FLW_PLAN_PREMIUM', // TODO: "107089" (5500 NGN)
    slug: 'premium',
    name: 'Premium Ultra',
    priceNgn: 5500,
    benefits: ['4K Ultra HD + Dolby Vision & HDR10', 'Spatial Audio support', 'All devices supported', '4 screens simultaneously', 'Offline downloads (6 devices)', 'Completely ad-free', 'Unlimited skips', 'Premier access: indie theatrical drops, ticketed masterclasses, virtual red carpet lobbies'],
  ),
];

/// Helper to find plan by slug (DB slug)
SubscriptionPlan planForSlug(String slug) =>
    kSubscriptionPlans.firstWhere((p) => p.slug == slug, orElse: () => kSubscriptionPlans[2]);
