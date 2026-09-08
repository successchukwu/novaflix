import 'api_service.dart';

class CurrencyService {
  static String _cachedCurrency = 'NGN';
  static bool _fetched = false;

  static const Map<String, String> symbols = {
    'NGN': '₦',
    'USD': '\$',
    'EUR': '€',
    'GBP': '£',
    'GHS': '₵',
    'KES': 'KSh',
    'ZAR': 'R',
    'CAD': 'C\$',
    'AUD': 'A\$',
    'JPY': '¥',
    'CNY': '¥',
    'INR': '₹',
    'BRL': 'R\$',
  };

  static String get currency => _cachedCurrency;
  static String get symbol => symbols[_cachedCurrency] ?? _cachedCurrency;

  static Future<String> fetchCurrency() async {
    if (_fetched) return _cachedCurrency;
    try {
      final api = ApiService();
      final res = await api.get('/payment/settings');
      final data = res.data;
      if (data is Map && data['success'] == true && data['currency'] != null) {
        _cachedCurrency = data['currency'] as String;
        _fetched = true;
      }
    } catch (_) {}
    return _cachedCurrency;
  }

  static String format(num amount, {String? currency}) {
    final code = currency ?? _cachedCurrency;
    final sym = symbols[code] ?? code;
    // Format with commas, no decimals for whole numbers
    final s = amount.toStringAsFixed(amount % 1 == 0 ? 0 : 2);
    final parts = s.split('.');
    final intPart = parts[0].replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (m) => '${m[1]},');
    final dec = parts.length > 1 ? '.${parts[1]}' : '';
    return '$sym$intPart$dec';
  }

  static String formatCompact(num amount, {String? currency}) {
    final code = currency ?? _cachedCurrency;
    final sym = symbols[code] ?? code;
    if (amount >= 1000000) return '$sym${(amount / 1000000).toStringAsFixed(1)}M';
    if (amount >= 1000) return '$sym${(amount / 1000).toStringAsFixed(1)}K';
    return format(amount, currency: code);
  }

  static void clearCache() {
    _cachedCurrency = 'NGN';
    _fetched = false;
  }
}
