import 'dart:io' show Platform, File, Directory;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:media_kit/media_kit.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'services/notification_service.dart';
import 'app.dart';

@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  debugPrint('Background message: ${message.messageId}');
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  // Load .env file from multiple possible locations
  String envPath;
  
  // Try 1: executable directory
  final executableDir = File(Platform.resolvedExecutable).parent;
  final envFile1 = File('${executableDir.path}/.env');
  
  // Try 2: build directory (where .env is copied during build)
  final buildDir = Directory('/home/success/Downloads/novaflix/mobile/build/linux/x64/release/bundle');
  final envFile2 = File('${buildDir.path}/.env');
  
  // Try 3: current working directory
  final envFile3 = File('.env');
  
  // Try 4: project root
  final projectEnvFile = File('/home/success/Downloads/novaflix/mobile/.env');
  
  // Check in order of preference
  if (File(Platform.resolvedExecutable).parent.path.isNotEmpty && 
      File('${File(Platform.resolvedExecutable).parent.path}/.env').existsSync()) {
    envPath = '${File(Platform.resolvedExecutable).parent.path}/.env';
  } else if (File('/home/success/Downloads/novaflix/mobile/build/linux/x64/release/bundle/.env').existsSync()) {
    envPath = '/home/success/Downloads/novaflix/mobile/build/linux/x64/release/bundle/.env';
  } else if (File('.env').existsSync()) {
    envPath = '.env';
  } else {
    envPath = '/home/success/Downloads/novaflix/mobile/build/linux/x64/release/bundle/.env';
  }
  
  await dotenv.load(fileName: envPath);
  
  MediaKit.ensureInitialized();
  
  final isLinuxDesktop = Platform.isLinux && !kIsWeb;
  if (!isLinuxDesktop) {
    await Firebase.initializeApp();
    await NotificationService.initialize();
    FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);
  }
  
  runApp(const ProviderScope(child: NovaflixApp()));
}