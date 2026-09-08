import 'package:flutter/material.dart';
import '../services/currency_service.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';
import '../services/api_service.dart';
import '../widgets/ui/index.dart';

class CreatorPlanPickerScreen extends ConsumerWidget {
  const CreatorPlanPickerScreen({super.key});

  static String _formatNaira(num v) {
    final s = v.round().toString();
    final buf = StringBuffer();
    for (var i = 0; i < s.length; i++) {
      final rem = s.length - i;
      buf.write(s[i]);
      if (rem > 1 && rem % 3 == 1) buf.write(',');
    }
    return buf.toString();
  }

  static const _plans = [
    {'name': 'Student', 'price': 800, 'desc': '720p · 1 screen · 1 download · Ads', 'recommended': false},
    {'name': 'Basic', 'price': 1500, 'desc': '720p · 1 screen · 1 download · Ad-free', 'recommended': false},
    {'name': 'Standard', 'price': 2500, 'desc': '1080p · 2 screens · 2 downloads · Ad-free', 'recommended': true},
    {'name': 'Premium', 'price': 5500, 'desc': '4K HDR/DV · Spatial Audio · 4 screens · 6 downloads', 'recommended': false},
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Choose Your Plan')),
      body: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _plans.length,
        itemBuilder: (_, i) {
          final p = _plans[i];
          final recommended = p['recommended'] as bool;
          return Container(
            margin: const EdgeInsets.only(bottom: 16),
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: recommended ? AppColors.primary.withValues(alpha: 0.1) : AppColors.surfaceContainerHigh,
              borderRadius: BorderRadius.circular(16),
              border: recommended ? Border.all(color: AppColors.primary, width: 2) : null,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (recommended)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(color: AppColors.primary, borderRadius: BorderRadius.circular(4)),
                    child: const Text('RECOMMENDED', style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
                  ),
                const SizedBox(height: 12),
                Text(p['name'] as String, style: AppTypography.headlineMd),
                const SizedBox(height: 4),
                Text('₦${_formatNaira(p['price'] as num)}/mo', style: AppTypography.headlineSm.copyWith(color: AppColors.primary)),
                const SizedBox(height: 8),
                Text(p['desc'] as String, style: TextStyle(color: AppColors.onSurfaceVariant, fontSize: 13)),
                const SizedBox(height: 16),
                AppButton(
                  label: 'Subscribe',
                  onPressed: () async {
                    final api = ref.read(apiServiceProvider);
                    try {
                      final res = await api.initializePayment(p['name'].toString().toLowerCase());
                      final url = res.data['authorization_url'] as String?;
                      if (url != null) context.push('/payment-success?plan=${p['name']}&reference=pending');
                    } catch (e) {
                      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
                    }
                  },
                  outlined: !recommended,
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
