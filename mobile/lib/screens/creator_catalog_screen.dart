import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../theme/app_colors.dart';
import '../services/api_service.dart';
import '../widgets/ui/index.dart';

class CreatorCatalogScreen extends ConsumerWidget {
  const CreatorCatalogScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final api = ref.read(apiServiceProvider);
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Content Catalog'), leading: const AppBackButton()),
      body: FutureBuilder(
        future: api.getCreatorUploads(),
        builder: (ctx, snap) {
          if (snap.connectionState == ConnectionState.waiting) return const LoadingSpinner();
          if (snap.hasError) return Center(child: Text('Error: ${snap.error}', style: const TextStyle(color: Colors.white54)));
          final data = snap.data?.data['data'] as List? ?? snap.data?.data as List? ?? [];
          if (data.isEmpty) return const Center(child: Text('No uploads yet', style: TextStyle(color: Colors.white54)));
          return ListView.builder(
            padding: const EdgeInsets.all(12),
            itemCount: data.length,
            itemBuilder: (_, i) {
              final m = data[i] as Map;
              return Card(
                color: AppColors.surfaceContainer,
                child: ListTile(
                  title: Text('${m['title'] ?? 'Untitled'}', style: const TextStyle(color: Colors.white)),
                  subtitle: Text('Views: ${m['views'] ?? 0} | ${m['status'] ?? ''}', style: const TextStyle(color: Colors.white70)),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
