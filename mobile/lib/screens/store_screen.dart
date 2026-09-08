import 'package:flutter/material.dart';
import '../services/currency_service.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../core/responsive.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';
import '../widgets/ui/index.dart';
import '../widgets/features/index.dart';

final _productsProvider = FutureProvider<List<Map<String, dynamic>>>((
  ref,
) async {
  final api = ref.read(apiServiceProvider);
  final res = await api.getProducts();
  final data = res.data['products'] as List? ?? res.data['data'] as List? ?? [];
  return data.cast<Map<String, dynamic>>();
});

class StoreScreen extends ConsumerStatefulWidget {
  const StoreScreen({super.key});

  @override
  ConsumerState<StoreScreen> createState() => _StoreScreenState();
}

class _StoreScreenState extends ConsumerState<StoreScreen> {
  String _category = 'All';
  bool _cartOpen = false;
  bool _ordersOpen = false;
  bool _purchasing = false;
  final Map<int, int> _cart = {};

  int _itemId(Map<String, dynamic> item) {
    final id = item['id'];
    return id is num ? id.toInt() : int.tryParse(id.toString()) ?? 0;
  }

  int get _cartCount => _cart.values.fold(0, (a, b) => a + b);

  int _total() {
    final products = ref.read(_productsProvider).value ?? [];
    var total = 0;
    for (final p in products) {
      final id = _itemId(p);
      if (_cart.containsKey(id)) {
        total += ((p['price'] as num? ?? 0) * _cart[id]!).toInt();
      }
    }
    return total;
  }

  Future<void> _checkout() async {
    if (_cart.isEmpty || _purchasing) return;
    final user = ref.read(authProvider).user;
    if (user == null) {
      context.push('/login?redirect=/store');
      return;
    }
    setState(() => _purchasing = true);
    try {
      final api = ref.read(apiServiceProvider);
      final items = _cart.entries
          .map((e) => {'productId': e.key, 'quantity': e.value})
          .toList();
      final res = await api.checkoutStore(items);
      final body = res.data is Map ? res.data : <String, dynamic>{};
      if (body['free'] == true) {
        setState(() {
          _purchasing = false;
          _cart.clear();
        });
        _toast('Order placed! (Free items)');
      } else if (body['authorization_url'] != null) {
        setState(() => _purchasing = false);
        if (context.mounted) {
          context.push(
            '/payment-success?reference=${body['reference'] ?? ''}&source=store',
          );
        }
      } else {
        setState(() => _purchasing = false);
        _toast('Checkout failed. Try again.');
      }
    } catch (_) {
      if (mounted) {
        setState(() => _purchasing = false);
        _toast('Checkout failed. Try again.');
      }
    }
  }

  void _toast(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: AppColors.surfaceContainerHigh,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final products = ref.watch(_productsProvider);
    final width = MediaQuery.sizeOf(context).width;
    final hPadding = responsivePadding(width);
    final categories = <String>[
      'All',
      ...products.value?.map((p) => p['category']?.toString() ?? '').where((c) => c.isNotEmpty).toSet() ?? [],
    ];

    return Scaffold(
      backgroundColor: AppColors.background,
      body: Stack(
        children: [
          SingleChildScrollView(
            padding: EdgeInsets.fromLTRB(hPadding, 24, hPadding, 48),
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 1152),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _headerRow(categories),
                    const SizedBox(height: 4),
                    Text(
                      'Wear your love for cinema',
                      style: AppTypography.bodySm.copyWith(
                        color: AppColors.onSurfaceVariant.withValues(alpha: 0.6),
                      ),
                    ),
                    const SizedBox(height: 16),
                    if (categories.length > 1) _categoryChips(categories),
                    const SizedBox(height: 16),
                    products.when(
                      loading: () => const Padding(
                        padding: EdgeInsets.symmetric(vertical: 60),
                        child: Center(child: LoadingSpinner()),
                      ),
                      error: (e, _) => Padding(
                        padding: const EdgeInsets.symmetric(vertical: 40),
                        child: Center(
                          child: Text(
                            'Error: $e',
                            style: const TextStyle(color: AppColors.error),
                          ),
                        ),
                      ),
                      data: (items) {
                        final filtered = _category == 'All'
                            ? items
                            : items
                                  .where(
                                    (p) => p['category']?.toString() == _category,
                                  )
                                  .toList();
                        if (filtered.isEmpty) {
                          return const Padding(
                            padding: EdgeInsets.symmetric(vertical: 60),
                            child: Center(
                              child: Column(
                                children: [
                                  Icon(
                                    Icons.storefront,
                                    size: 48,
                                    color: AppColors.onSurfaceVariant,
                                  ),
                                  SizedBox(height: 12),
                                  Text(
                                    'No products available yet',
                                    style: TextStyle(
                                      color: AppColors.onSurfaceVariant,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          );
                        }
                        return _productGrid(filtered);
                      },
                    ),
                  ],
                ),
              ),
            ),
          ),
          if (_cartOpen) _cartDrawer(),
          if (_ordersOpen) _ordersDrawer(),
        ],
      ),
    );
  }

  Widget _headerRow(List<String> categories) {
    final user = ref.watch(authProvider).user;
    return Row(
      children: [
        const Icon(Icons.storefront, size: 28, color: AppColors.primaryContainer),
        const SizedBox(width: 12),
        Expanded(
          child: Text('Merch Store', style: AppTypography.headlineLg),
        ),
        if (user != null)
          InkWell(
            onTap: () => setState(() {
              _ordersOpen = true;
              _cartOpen = false;
            }),
            child: Padding(
              padding: const EdgeInsets.all(8),
              child: Row(
                children: [
                  const Icon(
                    Icons.receipt,
                    size: 16,
                    color: AppColors.onSurfaceVariant,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    'Orders',
                    style: AppTypography.labelSm.copyWith(
                      color: AppColors.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
          ),
        const SizedBox(width: 8),
        InkWell(
          onTap: () => setState(() {
            _cartOpen = true;
            _ordersOpen = false;
          }),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: AppColors.surfaceContainer,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                Stack(
                  clipBehavior: Clip.none,
                  children: [
                    const Icon(
                      Icons.shopping_cart,
                      size: 18,
                      color: AppColors.onSurface,
                    ),
                    if (_cartCount > 0)
                      Positioned(
                        top: -6,
                        right: -6,
                        child: Container(
                          padding: const EdgeInsets.all(4),
                          constraints: const BoxConstraints(
                            minWidth: 18,
                            minHeight: 18,
                          ),
                          decoration: const BoxDecoration(
                            color: AppColors.primaryContainer,
                            shape: BoxShape.circle,
                          ),
                          child: Text(
                            '$_cartCount',
                            textAlign: TextAlign.center,
                            style: AppTypography.labelXs.copyWith(
                              color: AppColors.onPrimaryContainer,
                              fontSize: 9,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
                const SizedBox(width: 6),
                Text(
                  'Cart',
                  style: AppTypography.labelMd.copyWith(
                    color: AppColors.onSurface,
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _categoryChips(List<String> categories) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final c in categories)
          GestureDetector(
            onTap: () => setState(() => _category = c),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              decoration: BoxDecoration(
                color: _category == c
                    ? AppColors.primaryContainer
                    : AppColors.surfaceVariant.withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(12),
                border: _category == c
                    ? null
                    : Border.all(
                        color: AppColors.outline.withValues(alpha: 0.2),
                      ),
              ),
              child: Text(
                c,
                style: AppTypography.bodySm.copyWith(
                  color: _category == c
                      ? AppColors.onPrimaryContainer
                      : AppColors.onSurfaceVariant,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ),
      ],
    );
  }

  Widget _productGrid(List<Map<String, dynamic>> items) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final cols = gridColumnsForWidth(constraints.maxWidth);
        return GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: cols,
            crossAxisSpacing: 16,
            mainAxisSpacing: 16,
            childAspectRatio: gridAspectRatio(constraints.maxWidth, cols, spacing: 16),
          ),
          itemCount: items.length,
          itemBuilder: (_, i) => _ProductCard(
            item: items[i],
            inCart: _cart.containsKey(_itemId(items[i])),
            onToggle: () => setState(() {
              final id = _itemId(items[i]);
              if (_cart.containsKey(id)) {
                _cart.remove(id);
              } else {
                _cart[id] = 1;
              }
            }),
          ),
        );
      },
    );
  }

  Widget _cartDrawer() {
    final products = ref.read(_productsProvider).value ?? [];
    final w = MediaQuery.sizeOf(context).width;
    return Positioned(
      right: 0,
      top: 0,
      bottom: 0,
      child: Container(
        width: w >= 468 ? 420 : w - 48,
        color: AppColors.surfaceContainerLowest,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(20),
              child: Row(
                children: [
                  Text(
                    'Cart ($_cartCount)',
                    style: AppTypography.labelLg.copyWith(
                      color: AppColors.onSurface,
                    ),
                  ),
                  const Spacer(),
                  IconButton(
                    onPressed: () => setState(() => _cartOpen = false),
                    icon: const Icon(
                      Icons.close,
                      color: AppColors.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
            Divider(color: AppColors.white.withValues(alpha: 0.05)),
            if (_cart.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 60),
                child: Center(
                  child: Column(
                    children: [
                      Icon(
                        Icons.shopping_cart,
                        size: 40,
                        color: AppColors.onSurfaceVariant,
                      ),
                      SizedBox(height: 12),
                      Text(
                        'Your cart is empty',
                        style: TextStyle(color: AppColors.onSurfaceVariant),
                      ),
                    ],
                  ),
                ),
              )
            else
              Expanded(
                child: ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: _cart.length,
                  itemBuilder: (_, i) {
                    final id = _cart.keys.elementAt(i);
                    final product = products.firstWhere(
                      (p) => _itemId(p) == id,
                      orElse: () => <String, dynamic>{},
                    );
                    final qty = _cart[id] ?? 1;
                    final price = product['price'] as num? ?? 0;
                    return Container(
                      margin: const EdgeInsets.only(bottom: 10),
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: AppColors.surfaceContainer,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Row(
                        children: [
                          _thumb(product['image_url']?.toString(), 56),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  product['title']?.toString() ?? '',
                                  style: AppTypography.labelMd.copyWith(
                                    color: AppColors.onSurface,
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  '₦${price.toInt()} × $qty',
                                  style: AppTypography.labelSm.copyWith(
                                    color: AppColors.onSurfaceVariant,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          _stepper(id, qty),
                        ],
                      ),
                    );
                  },
                ),
              ),
            if (_cart.isNotEmpty)
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  border: Border(
                    top: BorderSide(color: AppColors.white.withValues(alpha: 0.05)),
                  ),
                ),
                child: Column(
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'Total',
                          style: AppTypography.labelLg.copyWith(
                            color: AppColors.onSurface,
                          ),
                        ),
                        Text(
                          '₦${_total().toString().replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (m) => ',')}',
                          style: AppTypography.headlineSm.copyWith(
                            color: AppColors.primaryContainer,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    FilledButton(
                      onPressed: _purchasing ? null : _checkout,
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.primaryContainer,
                        foregroundColor: AppColors.onPrimaryContainer,
                        minimumSize: const Size.fromHeight(46),
                      ),
                      child: _purchasing
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Text('Checkout'),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _thumb(String? url, double size) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(9),
      ),
      clipBehavior: Clip.antiAlias,
      child: url != null && url.isNotEmpty
          ? CachedNetworkImage(
              imageUrl: url,
              fit: BoxFit.cover,
              errorWidget: (_, _, _) =>
                  const Icon(Icons.checkroom, size: 20, color: AppColors.onSurfaceVariant),
            )
          : const Icon(Icons.checkroom, size: 20, color: AppColors.onSurfaceVariant),
    );
  }

  Widget _stepper(int id, int qty) {
    return Row(
      children: [
        _stepBtn(Icons.remove, () => setState(() {
          if (_cart[id] != null && _cart[id]! > 1) {
            _cart[id] = _cart[id]! - 1;
          } else {
            _cart.remove(id);
          }
        })),
        SizedBox(
          width: 32,
          child: Text(
            '$qty',
            textAlign: TextAlign.center,
            style: AppTypography.labelMd.copyWith(color: AppColors.onSurface),
          ),
        ),
        _stepBtn(Icons.add, () => setState(() => _cart[id] = (_cart[id] ?? 1) + 1)),
      ],
    );
  }

  Widget _stepBtn(IconData icon, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        width: 30,
        height: 30,
        decoration: BoxDecoration(
          color: AppColors.outline.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Icon(icon, size: 16, color: AppColors.onSurfaceVariant),
      ),
    );
  }

  Widget _ordersDrawer() {
    final w = MediaQuery.sizeOf(context).width;
    return Positioned(
      right: 0,
      top: 0,
      bottom: 0,
      child: Container(
        width: w >= 468 ? 420 : w - 48,
        color: AppColors.surfaceContainerLowest,
        child: FutureBuilder(
          future: ref.read(apiServiceProvider).getMyOrders(),
          builder: (context, snapshot) {
            final orders =
                snapshot.data?.data['orders'] as List? ?? snapshot.data?.data['data'] as List? ?? [];
            return Column(
              children: [
                Padding(
                  padding: const EdgeInsets.all(20),
                  child: Row(
                    children: [
                      Text(
                        'My Orders',
                        style: AppTypography.labelLg.copyWith(
                          color: AppColors.onSurface,
                        ),
                      ),
                      const Spacer(),
                      IconButton(
                        onPressed: () => setState(() => _ordersOpen = false),
                        icon: const Icon(
                          Icons.close,
                          color: AppColors.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
                Divider(color: AppColors.white.withValues(alpha: 0.05)),
                Expanded(
                  child: snapshot.connectionState == ConnectionState.waiting
                      ? const LoadingSpinner()
                      : snapshot.hasError || orders.isEmpty
                      ? const Padding(
                          padding: EdgeInsets.symmetric(vertical: 60),
                          child: Center(
                            child: Column(
                              children: [
                                Icon(
                                  Icons.receipt,
                                  size: 36,
                                  color: AppColors.onSurfaceVariant,
                                ),
                                SizedBox(height: 12),
                                Text(
                                  'No orders yet',
                                  style: TextStyle(
                                    color: AppColors.onSurfaceVariant,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        )
                      : ListView.builder(
                          padding: const EdgeInsets.all(16),
                          itemCount: orders.length,
                          itemBuilder: (_, i) {
                            final o =
                                Map<String, dynamic>.from(orders[i] as Map);
                            final status = o['status']?.toString() ?? '';
                            final total = o['total'] as num? ?? 0;
                            final date = o['created_at']?.toString() ?? '';
                            final items =
                                (o['items'] as List? ?? []).cast<Map<String, dynamic>>();
                            return Container(
                              margin: const EdgeInsets.only(bottom: 10),
                              padding: const EdgeInsets.all(14),
                              decoration: BoxDecoration(
                                color: AppColors.surfaceContainer,
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      _statusBadge(status),
                                      const Spacer(),
                                      Text(
                                        '₦${total.toInt()}',
                                        style: AppTypography.labelSm.copyWith(
                                          color: AppColors.onSurfaceVariant,
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    _formatDate(date),
                                    style: const TextStyle(
                                      color: AppColors.onSurfaceVariant,
                                      fontSize: 11,
                                    ),
                                  ),
                                  const SizedBox(height: 8),
                                  for (final it in items)
                                    Text(
                                      '${it['title']} × ${it['quantity']}',
                                      style: AppTypography.bodySm.copyWith(
                                        color: AppColors.onSurface,
                                      ),
                                    ),
                                ],
                              ),
                            );
                          },
                        ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _statusBadge(String status) {
    final paid = status == 'paid';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: paid
            ? AppColors.secondary.withValues(alpha: 0.2)
            : AppColors.secondaryFixed.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        status.toUpperCase(),
        style: AppTypography.labelXs.copyWith(
          color: paid ? AppColors.secondary : const Color(0xFFFFC107),
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  String _formatDate(String iso) {
    final dt = DateTime.tryParse(iso);
    if (dt == null) return iso;
    return '${dt.day}/${dt.month}/${dt.year}';
  }
}

class _ProductCard extends StatelessWidget {
  final Map<String, dynamic> item;
  final bool inCart;
  final VoidCallback onToggle;

  const _ProductCard({
    required this.item,
    required this.inCart,
    required this.onToggle,
  });

  @override
  Widget build(BuildContext context) {
    final title = item['title']?.toString() ?? '';
    final image = item['image_url']?.toString();
    final category = item['category']?.toString() ?? '';
    final creator = item['creator_name']?.toString() ?? '';
    final price = item['price'] as num? ?? 0;
    final popular = item['popular'] == true;

    return Container(
      decoration: BoxDecoration(
        color: AppColors.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.white.withValues(alpha: 0.05)),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AspectRatio(
            aspectRatio: 1,
            child: Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    AppColors.surfaceContainer,
                    AppColors.surfaceContainerHigh,
                  ],
                ),
              ),
              child: image != null && image.isNotEmpty
                  ? CachedNetworkImage(
                      imageUrl: image,
                      fit: BoxFit.cover,
                      errorWidget: (_, _, _) =>
                          const Icon(Icons.checkroom, size: 56, color: AppColors.onSurfaceVariant),
                    )
                  : const Icon(Icons.checkroom, size: 56, color: AppColors.onSurfaceVariant),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        title,
                        style: AppTypography.labelMd.copyWith(
                          color: AppColors.onSurface,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    if (popular)
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: AppColors.primaryAccent.withValues(alpha: 0.2),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          'Popular',
                          style: const TextStyle(
                            color: AppColors.primaryAccent,
                            fontSize: 10,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                  ],
                ),
                if (category.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    category,
                    style: TextStyle(
                      color: AppColors.onSurfaceVariant.withValues(alpha: 0.6),
                      fontSize: 13,
                    ),
                  ),
                ],
                if (creator.isNotEmpty)
                  Text(
                    'by $creator',
                    style: TextStyle(
                      color: AppColors.onSurfaceVariant.withValues(alpha: 0.4),
                      fontSize: 11,
                    ),
                  ),
                const SizedBox(height: 6),
                Text(
                  '₦${_formatPrice(price)}',
                  style: AppTypography.bodyLg.copyWith(
                    color: AppColors.primaryContainer,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 10),
                SizedBox(
                  height: 36,
                  child: FilledButton(
                    onPressed: onToggle,
                    style: FilledButton.styleFrom(
                      backgroundColor: inCart
                          ? AppColors.outline.withValues(alpha: 0.2)
                          : AppColors.primaryContainer,
                      foregroundColor: inCart
                          ? AppColors.onSurface
                          : AppColors.onPrimaryContainer,
                      padding: EdgeInsets.zero,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(9),
                      ),
                    ),
                    child: Text(
                      inCart ? 'Remove' : 'Add to Cart',
                      style: AppTypography.labelSm.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _formatPrice(num p) {
    final n = p.toInt();
    final s = n.toString();
    final b = StringBuffer();
    for (var i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 == 0) b.write(',');
      b.write(s[i]);
    }
    return b.toString();
  }
}