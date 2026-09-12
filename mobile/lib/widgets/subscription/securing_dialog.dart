import 'package:flutter/material.dart';
import '../../theme/app_colors.dart';

/// Dark-themed loading overlay shown immediately when checkout starts.
/// Bridges the gap safely between tap and Flutterwave sheet.
class SecuringMoviePassDialog extends StatelessWidget {
  const SecuringMoviePassDialog({super.key});

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: const Color(0xFF141414),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      insetPadding: const EdgeInsets.symmetric(horizontal: 32),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 28, 24, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(
              width: 36,
              height: 36,
              child: CircularProgressIndicator(strokeWidth: 3, color: AppColors.primary),
            ),
            const SizedBox(height: 18),
            const Text(
              'Securing your movie pass...',
              style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w700),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              'Contacting Flutterwave securely…',
              style: TextStyle(color: Colors.white.withValues(alpha: 0.6), fontSize: 13),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
