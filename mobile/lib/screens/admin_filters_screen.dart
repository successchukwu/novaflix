import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../theme/app_colors.dart';
import '../services/api_service.dart';
import '../widgets/ui/index.dart';

class AdminFiltersScreen extends ConsumerWidget {
  const AdminFiltersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final api = ref.read(apiServiceProvider);
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Content Filters'), leading: const AppBackButton()),
      body: FutureBuilder(
        future: api.getGenres(type: 'movie'),
        builder: (ctx, snap) {
          if (snap.connectionState == ConnectionState.waiting) return const LoadingSpinner();
          if (snap.hasError) return Center(child: Text('Error: ${snap.error}', style: const TextStyle(color: Colors.white54)));
          final data = snap.data?.data['data'] as List? ?? snap.data?.data as List? ?? [];
          return ListView.builder(
            padding: const EdgeInsets.all(12),
            itemCount: data.length,
            itemBuilder: (_, i) {
              final g = data[i] as Map;
              return Card(color: AppColors.surfaceContainer, child: ListTile(title: Text('${g['name'] ?? ''}', style: const TextStyle(color: Colors.white)), subtitle: Text('ID: ${g['id']}', style: const TextStyle(color: Colors.white70))));
            },
          );
        },
      ),
    );
  }
}
