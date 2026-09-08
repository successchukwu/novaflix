import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/wallet_provider.dart';
import '../services/currency_service.dart';
import '../widgets/ui/index.dart';
import '../widgets/layout/index.dart';

class CreatorWalletScreen extends ConsumerStatefulWidget {
  const CreatorWalletScreen({super.key});

  @override
  ConsumerState<CreatorWalletScreen> createState() => _CreatorWalletScreenState();
}

class _CreatorWalletScreenState extends ConsumerState<CreatorWalletScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final TextEditingController _amountController = TextEditingController();
  String _selectedGateway = 'paystack';
  WithdrawalPreview? _preview;
  bool _loadingPreview = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(walletProvider.notifier).loadAll();
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    _amountController.dispose();
    super.dispose();
  }

  Future<void> _updatePreview() async {
    if (_amountController.text.isEmpty) {
      setState(() => _preview = null);
      return;
    }
    setState(() => _loadingPreview = true);
    try {
      final amount = double.parse(_amountController.text);
      final preview = await ref.read(walletServiceProvider).previewWithdrawal(
        double.parse(_amountController.text),
        _selectedGateway,
      );
      setState(() => _preview = preview);
    } catch (e) {
      setState(() => _preview = null);
    } finally {
      setState(() => _loadingPreview = false);
    }
  }

  Future<void> _handleWithdraw() async {
    if (_amountController.text.isEmpty) return;
    final amount = double.parse(_amountController.text);
    
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Confirm Withdrawal'),
        content: Text(
          'Withdraw ${_formatAmount(amount)} via $_selectedGateway?\n'
          'You\'ll receive ${_preview?.netToCreator != null ? _formatAmount(_preview!.netToCreator.toDouble()) : 'calculating...'} '
          'after the gateway fee of ${_formatAmount(_preview?.gatewayFee.toDouble() ?? 0)}.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Confirm'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      final notifier = ref.read(walletProvider.notifier);
      await notifier.withdraw(amount, _selectedGateway);
      if (mounted) {
        final state = ref.read(walletProvider);
        if (state.error != null) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(state.error!)),
          );
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Withdrawal successful! Received ${_formatAmount((_preview?.netToCreator?.toDouble() ?? 0))}')),
          );
          _amountController.clear();
          setState(() => _preview = null);
        }
      }
    }
  }

  String _formatAmount(double amount) {
    return CurrencyService.format(amount);
  }

  @override
  Widget build(BuildContext context) {
    final walletState = ref.watch(walletProvider);
    final walletNotifier = ref.read(walletProvider.notifier);

    return AppShell(
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Wallet'),
          bottom: TabBar(
            controller: _tabController,
            tabs: const [
              Tab(text: 'Overview'),
              Tab(text: 'Earnings'),
              Tab(text: 'Withdraw'),
              Tab(text: 'History'),
            ],
          ),
        ),
        body: walletState.isLoading
            ? const Center(child: CircularProgressIndicator())
            : TabBarView(
                controller: _tabController,
                children: [
                  _buildOverviewTab(walletState),
                  _buildEarningsTab(walletState),
                  _buildWithdrawTab(),
                  _buildHistoryTab(walletState),
                ],
              ),
      ),
    );
  }

  Widget _buildOverviewTab(WalletState state) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildBalanceCard(state.balanceNgn),
          const SizedBox(height: 16),
          _buildStatsGrid(state),
          const SizedBox(height: 24),
          _buildRecentActivity(state),
        ],
      ),
    );
  }

  Widget _buildBalanceCard(int balance) {
    return Card(
      elevation: 4,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          gradient: LinearGradient(
            colors: [Theme.of(context).primaryColor, Theme.of(context).primaryColor.withOpacity(0.7)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Wallet Balance',
              style: TextStyle(color: Colors.white70, fontSize: 14),
            ),
            const SizedBox(height: 8),
            Text(
              _formatAmount(balance.toDouble()),
              style: const TextStyle(
                color: Colors.white,
                fontSize: 48,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Available for withdrawal',
              style: TextStyle(color: Colors.white.withOpacity(0.7), fontSize: 12),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatsGrid(WalletState state) {
    final thirtyDaysAgo = DateTime.now().subtract(const Duration(days: 30));
    final recentEarnings = state.transactions
        .where((t) => t.amountNgn > 0 && t.createdAt.isAfter(thirtyDaysAgo))
        .fold<int>(0, (sum, t) => sum + t.amountNgn);
    final withdrawn = state.transactions
        .where((t) => t.type == 'withdrawal')
        .fold<int>(0, (sum, t) => sum + t.amountNgn.abs());

    return GridView.count(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisCount: 4,
      childAspectRatio: 1.2,
      children: [
        _buildStatCard('Total Earned (30d)', _formatAmount(recentEarnings.toDouble()), Icons.trending_up, Colors.green),
        _buildStatCard('Withdrawn (30d)', _formatAmount(withdrawn.toDouble()), Icons.arrow_downward, Colors.red),
        _buildStatCard('Total Transactions', state.transactions.length.toString(), Icons.receipt_long, Colors.blue),
        _buildStatCard('Current Balance', _formatAmount(state.balanceNgn.toDouble()), Icons.account_balance_wallet, Theme.of(context).primaryColor),
      ],
    );
  }

  Widget _buildStatCard(String label, String value, IconData icon, Color color) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: color, size: 28),
            const SizedBox(height: 8),
            Text(value, style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: color)),
            const SizedBox(height: 4),
            Text(label, style: const TextStyle(fontSize: 10, color: Colors.grey), textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }

  Widget _buildRecentActivity(WalletState state) {
    final recent = state.transactions.take(5).toList();
    if (recent.isEmpty) {
      return const Card(
        child: Padding(
          padding: EdgeInsets.all(16),
          child: Center(child: Text('No recent activity')),
        ),
      );
    }

    return Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.all(16),
            child: Text('Recent Activity', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          ),
          ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: recent.length,
            separatorBuilder: (_, __) => const Divider(height: 1),
            itemBuilder: (context, index) {
              final tx = recent[index];
              final isCredit = tx.amountNgn > 0;
              return ListTile(
                leading: CircleAvatar(
                  backgroundColor: isCredit ? Colors.green.withOpacity(0.1) : Colors.red.withOpacity(0.1),
                  child: Icon(
                    _getIconForType(tx.type),
                    color: isCredit ? Colors.green : Colors.red,
                  ),
                ),
                title: Text(_getTypeLabel(tx.type)),
                subtitle: Text(_formatDate(tx.createdAt)),
                trailing: Text(
                  '${isCredit ? '+' : ''}${_formatAmount(tx.amountNgn.toDouble())}',
                  style: TextStyle(
                    color: isCredit ? Colors.green : Colors.red,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  String _getTypeLabel(String type) {
    switch (type) {
      case 'ppm_upload': return 'PPM - Uploads';
      case 'ppm_scraped': return 'PPM - Scraped';
      case 'ppm_youtube': return 'PPM - YouTube';
      case 'ppm_live': return 'PPM - Live→Shorts';
      case 'ppm_shorts': return 'PPM - Shorts';
      case 'tip': return 'Tip';
      case 'gift': return 'Glow Gift';
      case 'membership': return 'Membership';
      case 'withdrawal': return 'Withdrawal';
      case 'refund': return 'Refund';
      default: return type;
    }
  }

  Widget _buildEarningsTab(WalletState state) {
    if (state.earnings == null) {
      return const Center(child: Text('No earnings data'));
    }

    final earnings = state.earnings!;
    final items = [
      ('PPM - Uploads', earnings.ppmUpload),
      ('PPM - Scraped', earnings.ppmScraped),
      ('PPM - YouTube', earnings.ppmYoutube),
      ('PPM - Live→Shorts', earnings.ppmLive),
      ('PPM - Shorts', earnings.ppmShorts),
      ('Tips', earnings.tip),
      ('Glow Gifts', earnings.gift),
      ('Memberships', earnings.membership),
      ('Merchandise', earnings.merch),
    ].where((e) => e.$2 > 0).toList();

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Total Earnings', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 8),
                Text(
                  _formatAmount(earnings.total.toDouble()),
                  style: const TextStyle(fontSize: 32, fontWeight: FontWeight.bold, color: Colors.green),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        const Text('Breakdown', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        ...items.map((e) => Card(
          child: ListTile(
            title: Text(e.$1),
            trailing: Text(
              _formatAmount(e.$2.toDouble()),
              style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.green),
            ),
          ),
        )),
      ],
    );
  }

  Widget _buildWithdrawTab() {
    final walletState = ref.watch(walletProvider);
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Withdraw Earnings', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  Text(
                    'Minimum withdrawal: ${CurrencyService.format(10000)}. Gateway fees are deducted from your balance.',
                    style: TextStyle(color: Colors.grey[600], fontSize: 12),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: _amountController,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'Amount (₦)',
                      hintText: 'Enter amount (min ₦10,000)',
                      prefixIcon: Icon(Icons.attach_money),
                    ),
                    onChanged: (_) => _updatePreview(),
                  ),
                  const SizedBox(height: 16),
                  DropdownButtonFormField<String>(
                    value: _selectedGateway,
                    decoration: const InputDecoration(
                      labelText: 'Gateway',
                      prefixIcon: Icon(Icons.account_balance),
                    ),
                    items: const [
                      DropdownMenuItem(value: 'paystack', child: Text('Paystack (₦10 fee)')),
                      DropdownMenuItem(value: 'flutterwave', child: Text('Flutterwave (₦20 fee)')),
                    ],
                    onChanged: (value) {
                      setState(() {
                        _selectedGateway = value!;
                        _updatePreview();
                      });
                    },
                  ),
                  const SizedBox(height: 16),
                  if (_preview != null) ...[
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: Theme.of(context).primaryColor.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Column(
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceAround,
                            children: [
                              _buildPreviewItem('Net to You', _formatAmount(_preview!.netToCreator.toDouble()), Colors.green),
                              _buildPreviewItem('Gateway Fee', _formatAmount(_preview!.gatewayFee.toDouble()), Colors.red),
                              _buildPreviewItem('Total Deducted', _formatAmount(_preview!.totalDeduction.toDouble()), Colors.blue),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'You\'ll receive ${_formatAmount(_preview!.netToCreator.toDouble())} after ${_formatAmount(_preview!.gatewayFee.toDouble())} gateway fee',
                            style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                          ),
                        ],
                      ),
                    ),
                  ],
                  if (_preview != null) ...[
                    const SizedBox(height: 16),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: walletState.isWithdrawing || !(_preview?.canWithdraw ?? false) ? null : _handleWithdraw,
                        child: walletState.isWithdrawing
                            ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2))
                            : const Text('Withdraw Now'),
                      ),
                    ),
                  ],
                  if (walletState.error != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text(walletState.error!, style: const TextStyle(color: Colors.red)),
                    ),
                  const SizedBox(height: 8),
                  const Text(
                    'Gateway fees covered by creator on withdrawal. Subscription fees covered by user. See Terms & Conditions for full details.',
                    style: TextStyle(fontSize: 11, color: Colors.grey),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPreviewItem(String label, String value, Color color) {
    return Column(
      children: [
        Text(label, style: TextStyle(fontSize: 11, color: Colors.grey[600])),
        Text(value, style: TextStyle(fontWeight: FontWeight.bold, color: color, fontSize: 16)),
      ],
    );
  }

  Widget _buildHistoryTab(WalletState state) {
    if (state.transactions.isEmpty) {
      return const Center(child: Text('No transactions yet'));
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: state.transactions.length,
      itemBuilder: (context, index) {
        final tx = state.transactions[index];
        final isCredit = tx.amountNgn > 0;
        return Card(
          margin: const EdgeInsets.only(bottom: 8),
          child: ListTile(
            leading: CircleAvatar(
              backgroundColor: isCredit ? Colors.green.withOpacity(0.1) : Colors.red.withOpacity(0.1),
              child: Icon(
                _getIconForType(tx.type),
                color: isCredit ? Colors.green : Colors.red,
              ),
            ),
            title: Text(_getTypeLabel(tx.type)),
            subtitle: Text(_formatDate(tx.createdAt)),
            trailing: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  '${isCredit ? '+' : ''}${_formatAmount(tx.amountNgn.toDouble())}',
                  style: TextStyle(
                    color: isCredit ? Colors.green : Colors.red,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text(
                  _formatAmount(tx.balanceAfterNgn.toDouble()),
                  style: const TextStyle(fontSize: 10, color: Colors.grey),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  IconData _getIconForType(String type) {
    if (type.startsWith('ppm_')) return Icons.play_circle;
    if (type == 'tip') return Icons.favorite;
    if (type == 'gift') return Icons.card_giftcard;
    if (type == 'membership') return Icons.card_membership;
    if (type == 'withdrawal') return Icons.account_balance_wallet;
    return Icons.receipt;
  }

  String _formatDate(DateTime date) {
    return '${date.day}/${date.month}/${date.year} ${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
  }
}