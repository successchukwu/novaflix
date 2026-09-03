import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../theme/app_colors.dart';
import '../services/api_service.dart';
import '../widgets/ui/index.dart';

class CreatorAnalyticsScreen extends ConsumerWidget {
  const CreatorAnalyticsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final api = ref.read(apiServiceProvider);
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Creator Analytics'), leading: const AppBackButton()),
      body: FutureBuilder(
        future: Future.wait([api.getCreatorDashboard(), api.getArtistGraph(), api.getPayoutHistory()]),
        builder: (ctx, snap) {
          if (snap.connectionState == ConnectionState.waiting) return const LoadingSpinner();
          if (snap.hasError) return Center(child: Text('Error: ${snap.error}', style: const TextStyle(color: Colors.white54)));
          final dash = (snap.data?[0].data as Map?)?['data'] ?? {};
          final graph = (snap.data?[1].data as Map?)?['data'] ?? {};
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text('Realtime Analytics', style: Theme.of(context).textTheme.titleLarge?.copyWith(color: Colors.white)),
              const SizedBox(height: 12),
              Card(color: AppColors.surfaceContainer, child: ListTile(title: const Text('Total Views', style: TextStyle(color: Colors.white)), subtitle: Text('${dash['totalViews'] ?? dash['views'] ?? 0}', style: const TextStyle(color: Colors.white70)))),
              Card(color: AppColors.surfaceContainer, child: ListTile(title: const Text('Earnings'), subtitle: Text('${dash['totalEarnings'] ?? 0} NGN', style: const TextStyle(color: Colors.white70)))),
              const SizedBox(height: 12),
              Text('Payout Graph: ${graph.toString().substring(0, (graph.toString().length).clamp(0, 200))}', style: const TextStyle(color: Colors.white54, fontSize: 12)),
            ],
          );
        },
      ),
    );
  }
}
