/// App-wide configuration.
///
/// Supports all devices: emulator (10.0.2.2), physical LAN (dart-define override),
/// iOS simulator/desktop (localhost). `--dart-define=BASE_URL=...` always wins.
import 'package:flutter/foundation.dart' show kIsWeb, defaultTargetPlatform, TargetPlatform;

class AppConfig {
  AppConfig._();

  static const String _override = String.fromEnvironment('BASE_URL');

  static String get productionBase {
    if (kIsWeb) return 'http://localhost:3030/api';
    if (defaultTargetPlatform == TargetPlatform.android) return 'http://10.0.2.2:3030/api';
    return 'http://localhost:3030/api';
  }

  static String get apiBaseUrl {
    if (_override.isNotEmpty) return _override;
    return productionBase;
  }

  /// Persisted key marking that the first-run onboarding guide was seen.
  static const String onboardingSeenKey = 'novaflix-onboarding-seen';
}
