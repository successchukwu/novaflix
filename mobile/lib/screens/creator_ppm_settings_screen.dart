import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import '../services/currency_service.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/wallet_provider.dart';


class CreatorPPMSettingsScreen extends ConsumerStatefulWidget {
  const CreatorPPMSettingsScreen({super.key});

  @override
  ConsumerState<CreatorPPMSettingsScreen> createState() => _CreatorPPMSettingsScreenState();
}

class _CreatorPPMSettingsScreenState extends ConsumerState<CreatorPPMSettingsScreen> {
  String _baseRate = '';
  bool _saving = false;
  PPMRate? _previewRate;
  String _tier = 'student';

  final Map<String, Map<String, dynamic>> _tierParams = {
    'student': {'min_ppm': 5, 'max_ppm': 100, 'multiplier': 0.75, 'price': 800},
    'basic': {'min_ppm': 5, 'max_ppm': 200, 'multiplier': 1.0, 'price': 1500},
    'standard': {'min_ppm': 10, 'max_ppm': 300, 'multiplier': 1.25, 'price': 2500},
    'premium': {'min_ppm': 20, 'max_ppm': 500, 'multiplier': 1.5, 'price': 5500},
  };

  @override
  void initState() {
    super.initState();
    _loadConfig();
  }

  Future<void> _loadConfig() async {
    try {
      final config = await ref.read(walletServiceProvider).getPPMConfig();
      final rate = await ref.read(walletServiceProvider).getPPMRate('movie');
      setState(() {
        _baseRate = config.baseRate.toString();
        _previewRate = rate;
        // Determine tier from rate
        if (rate.tier.isNotEmpty) {
          setState(() => _tier = rate.tier);
        }
      });
    } catch (e) {
      debugPrint('Load PPM config error: $e');
    }
  }

  Future<void> _handleSave() async {
    if (_baseRate.isEmpty) return;
    setState(() => _saving = true);
    try {
      await ref.read(walletProvider.notifier).updatePPMConfig(double.parse(_baseRate));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('PPM base rate updated')),
        );
        _loadConfig();
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to update: $e')),
      );
    } finally {
      setState(() => _saving = false);
    }
  }

  PPMRate? _calculatePreview(String rateStr) {
    final tierParams = _tierParams[_tier];
    if (tierParams == null) return null;
    
    final baseRate = double.tryParse(rateStr) ?? 0;
    final clampedRate = baseRate.clamp(tierParams['min_ppm'].toDouble(), tierParams['max_ppm'].toDouble()).toDouble();
    final multiplier = tierParams['multiplier'] as double;
    
    // For uploads: use base rate directly
    // For scraped: baseline VPM (2.0) * multiplier
    // For shorts: baseline VPM (0.2) * multiplier
    return PPMRate(
      contentType: 'movie',
      baselineVPM: 2.0,
      dynamicRate: clampedRate,
      tier: _tier,
      tierParams: {
        'min_ppm': tierParams['min_ppm'],
        'max_ppm': tierParams['max_ppm'],
        'multiplier': tierParams['multiplier'],
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final tierParams = _tierParams[_tier]!;
    final preview = _calculatePreview(_baseRate);

    return Scaffold(
      appBar: AppBar(title: const Text('PPM Settings')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Current Tier Badge
            Card(
              color: Theme.of(context).primaryColor.withOpacity(0.1),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: Theme.of(context).primaryColor,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Icon(Icons.trending_up, color: Colors.white, size: 28),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Current Tier: ${_tier[0].toUpperCase()}${_tier.substring(1)}',
                                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                              Text('₦${_tierParams[_tier]!['price']}/month',
                                  style: TextStyle(color: Colors.grey[600])),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        _TierStatCard(label: 'Min PPM', value: '₦${_tierParams[_tier]!['min_ppm']}', icon: Icons.arrow_downward, color: Colors.red),
                        _TierStatCard(label: 'Max PPM', value: '₦${_tierParams[_tier]!['max_ppm']}', icon: Icons.arrow_upward, color: Colors.green),
                        _TierStatCard(label: 'Multiplier', value: '${_tierParams[_tier]!['multiplier']}x', icon: Icons.trending_up, color: Colors.blue),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),

              // Base Rate Setting
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(Icons.tune, color: Theme.of(context).primaryColor),
                          const SizedBox(width: 8),
                          const Text('Base Rate (₦/min)', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'This rate applies to your direct uploads. Scraped/YouTube content earns dynamically using platform VPM × your tier multiplier (${_tierParams[_tier]!['multiplier']}x).',
                        style: TextStyle(color: Colors.grey[600]),
                      ),
                      const SizedBox(height: 16),
                      TextFormField(
                        initialValue: _baseRate,
                        decoration: InputDecoration(
                          labelText: 'Base Rate (₦/min)',
                          hintText: 'Enter base rate',
                          border: const OutlineInputBorder(),
                          helperText: 'Range: ₦${_tierParams[_tier]!['min_ppm']} - ₦${_tierParams[_tier]!['max_ppm']}',
                        ),
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        onChanged: (v) => setState(() => _baseRate = v),
                      ),
                      const SizedBox(height: 16),
                      if (preview != null) ...[
                        const Text('Live Preview', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            _RatePreviewCard(
                              label: 'Your Uploads',
                              rate: '${_calculatePreview(_baseRate)?.dynamicRate.toStringAsFixed(2) ?? '0.00'}',
                              subtitle: 'Your base rate',
                              color: Colors.green,
                            ),
                            const SizedBox(width: 8),
                            _RatePreviewCard(
                              label: 'Scraped/YouTube',
                              rate: '${(_tierParams[_tier]!['multiplier'] * 2.0).toStringAsFixed(2)}',
                              subtitle: 'Baseline × ${_tierParams[_tier]!['multiplier']}x',
                              color: Theme.of(context).primaryColor,
                            ),
                            const SizedBox(width: 8),
                            _RatePreviewCard(
                              label: 'Shorts',
                              rate: '${(_tierParams[_tier]!['multiplier'] * 0.2).toStringAsFixed(2)}',
                              subtitle: 'Shorts VPM × ${_tierParams[_tier]!['multiplier']}x',
                              color: Colors.orange,
                            ),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 24),
              FilledButton(
                onPressed: _baseRate.isEmpty ? null : () async {
                  await ref.read(walletProvider.notifier).updatePPMConfig(double.parse(_baseRate));
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('PPM base rate updated')),
                    );
                  }
                },
                child: const Text('Save Base Rate'),
              ),
              const SizedBox(height: 24),

              // Tier Comparison Table
              Card(
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: DataTable(
                    columns: const [
                      DataColumn(label: Text('Tier')),
                      DataColumn(label: Text('Monthly')),
                      DataColumn(label: Text('Min PPM')),
                      DataColumn(label: Text('Max PPM')),
                      DataColumn(label: Text('Multiplier')),
                      DataColumn(label: Text('Upload Range')),
                      DataColumn(label: Text('Scraped (est.)')),
                    ],
                    rows: _tierParams.entries.map((entry) {
                      final t = entry.key;
                      final p = entry.value;
                      return DataRow(
                        selected: _tier == t,
                        cells: [
                          DataCell(Text(t[0].toUpperCase() + t.substring(1))),
                          DataCell(Text('₦${p['price']}')),
                          DataCell(Text('₦${p['min_ppm']}')),
                          DataCell(Text('₦${p['max_ppm']}')),
                          DataCell(Text('${p['multiplier']}x', style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.blue))),
                          DataCell(Text('₦${p['min_ppm']} - ₦${p['max_ppm']}')),
                          DataCell(Text('~₦${(2.0 * p['multiplier']).toStringAsFixed(2)} - ₦${(0.2 * p['multiplier']).toStringAsFixed(2)}/min')),
                        ]);
                    }).toList(),
                  ),
                ),
              ),
              const SizedBox(height: 24),

              // How it works
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(Icons.info_outline, color: Theme.of(context).primaryColor),
                          const SizedBox(width: 8),
                          const Text('How It Works', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                        ],
                      ),
                      const SizedBox(height: 12),
                      _buildHowItWorksItem('Your base rate applies to direct uploads (clamped to tier limits)'),
                      _buildHowItWorksItem('Scraped/YouTube content earns dynamically: Platform VPM × Your Tier Multiplier'),
                      _buildHowItWorksItem('Shorts use the Shorts pool VPM (typically lower) × your tier multiplier'),
                      _buildHowItWorksItem('Live streams are saved as shorts and earn Shorts pool rates'),
                      _buildHowItWorksItem('Platform VPM updates hourly based on total pool revenue ÷ total minutes watched'),
                      _buildHowItWorksItem('Upgrade your subscription to unlock higher floors, ceilings, and multipliers'),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      );
  }

  Widget _buildHowItWorksItem(String text) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.check_circle, size: 20, color: Colors.green),
          const SizedBox(width: 8),
          Expanded(child: Text(text, style: const TextStyle(fontSize: 14))),
        ],
      ),
    );
  }
}

class _RatePreviewCard extends StatelessWidget {
  final String label;
  final String rate;
  final String subtitle;
  final Color color;

  const _RatePreviewCard({
    required this.label,
    required this.rate,
    required this.subtitle,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: color.withOpacity(0.1),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withOpacity(0.3)),
        ),
        child: Column(
          children: [
            Text(label, style: TextStyle(fontSize: 12, color: color, fontWeight: FontWeight.w500)),
            const SizedBox(height: 4),
            Text('₦$rate/min', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: color)),
            const SizedBox(height: 2),
            Text(subtitle, style: TextStyle(fontSize: 10, color: color.withOpacity(0.7))),
          ],
        ),
      ),
    );
  }
}

class _TierStatCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;

  const _TierStatCard({required this.label, required this.value, required this.icon, required this.color});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            children: [
              Icon(icon, color: color, size: 24),
              const SizedBox(height: 4),
              Text(value, style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: color)),
              Text(label, style: TextStyle(fontSize: 11, color: Colors.grey[600])),
            ],
          ),
        ),
      ),
    );
  }
}