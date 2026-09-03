import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../theme/app_colors.dart';
import '../services/api_service.dart';
import '../widgets/ui/index.dart';

class AdminLocalizationScreen extends ConsumerWidget {
  const AdminLocalizationScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final api = ref.read(apiServiceProvider);
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Localization'), leading: const AppBackButton()),
      body: FutureBuilder(
        future: Future.wait([api.getGenres(type: 'movie'), api.getGenres(type: 'tv')]),
        builder: (ctx, snap) {
          if (snap.connectionState == ConnectionState.waiting) return const LoadingSpinner();
          if (snap.hasError) return Center(child: Text('Error: ${snap.error}', style: const TextStyle(color: Colors.white54)));
          final movie = snap.data?[0].data['data'] as List? ?? [];
          final tv = snap.data?[1].data['data'] as List? ?? [];
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text('Movie Genres (${movie.length})', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              Wrap(spacing: 8, children: movie.map((g) => Chip(label: Text('${(g as Map)['name']}'))).toList()),
              const SizedBox(height: 16),
              Text('TV Genres (${tv.length})', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              Wrap(spacing: 8, children: tv.map((g) => Chip(label: Text('${(g as Map)['name']}'))).toList()),
            ],
          );
        },
      ),
    );
  }
}
