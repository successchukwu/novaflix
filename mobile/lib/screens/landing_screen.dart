import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../core/responsive.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';
import '../services/api_service.dart';
import '../widgets/features/index.dart';

class LandingScreen extends ConsumerStatefulWidget {
  const LandingScreen({super.key});

  @override
  ConsumerState<LandingScreen> createState() => _LandingScreenState();
}

class _LandingScreenState extends ConsumerState<LandingScreen> {
  final _newsletterCtl = TextEditingController();
  bool _subscribing = false;
  String? _newsletterMsg;

  @override
  void dispose() {
    _newsletterCtl.dispose();
    super.dispose();
  }

  Future<void> _subscribe() async {
    final email = _newsletterCtl.text.trim();
    if (email.isEmpty || _subscribing) return;
    setState(() {
      _subscribing = true;
      _newsletterMsg = null;
    });
    try {
      await ref.read(apiServiceProvider).subscribeNewsletter(email);
      if (mounted) {
        setState(() {
          _subscribing = false;
          _newsletterMsg = 'Subscribed!';
        });
        _newsletterCtl.clear();
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _subscribing = false;
          _newsletterMsg = 'Subscription failed. Try again.';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    final size = screenSizeFor(width);
    final hPadding = responsivePadding(width);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _nav(hPadding),
            _hero(hPadding, size),
            _features(hPadding),
            _pricing(hPadding),
            _testimonials(hPadding),
            _newsletter(hPadding),
            _footer(hPadding),
          ],
        ),
      ),
    );
  }

  Widget _nav(double hPadding) {
    return Container(
      padding: EdgeInsets.symmetric(horizontal: hPadding, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border(
          bottom: BorderSide(color: AppColors.white.withValues(alpha: 0.05)),
        ),
      ),
      child: Row(
        children: [
          Image.asset(
            'assets/brand/leter-mark-logo.png',
            height: 28,
            fit: BoxFit.contain,
            errorBuilder: (_, __, ___) => const SizedBox(height: 28),
          ),
          const Spacer(),
          TextButton(
            onPressed: () => context.push('/login'),
            child: Text(
              'Sign In',
              style: AppTypography.labelMd.copyWith(
                color: AppColors.onSurfaceVariant,
              ),
            ),
          ),
          const SizedBox(width: 8),
          FilledButton(
            onPressed: () => context.push('/login'),
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.primaryContainer,
              foregroundColor: AppColors.onPrimaryContainer,
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(9),
              ),
            ),
            child: Text(
              'Get Started',
              style: AppTypography.labelSm.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _hero(double hPadding, ScreenSize size) {
    return Container(
      padding: EdgeInsets.fromLTRB(hPadding, size == ScreenSize.desktop ? 96 : 56, hPadding, size == ScreenSize.desktop ? 96 : 56),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            AppColors.primaryAccent.withValues(alpha: 0.05),
            AppColors.background,
          ],
        ),
      ),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 896),
          child: Column(
            children: [
              Text.rich(
                TextSpan(
                  children: [
                    TextSpan(text: 'Premium Streaming for '),
                    TextSpan(
                      text: 'Everyone',
                      style: TextStyle(
                        foreground: Paint()
                          ..shader = const LinearGradient(
                            colors: [
                              AppColors.primaryContainer,
                              AppColors.secondary,
                            ],
                          ).createShader(const Rect.fromLTWH(0, 0, 300, 60)),
                      ),
                    ),
                  ],
                ),
                textAlign: TextAlign.center,
                style: AppTypography.displayMd.copyWith(
                  fontSize: size == ScreenSize.desktop ? 64 : 36,
                  height: 1.15,
                  fontWeight: FontWeight.w700,
                  color: AppColors.onSurface,
                ),
              ),
              const SizedBox(height: 24),
              Text(
                'Discover thousands of movies, TV shows, and exclusive creator content. Watch anywhere, anytime.',
                textAlign: TextAlign.center,
                style: AppTypography.bodyLg.copyWith(
                  color: AppColors.onSurfaceVariant,
                  fontSize: size == ScreenSize.desktop ? 20 : 15,
                ),
              ),
              const SizedBox(height: 40),
              Wrap(
                spacing: 12,
                runSpacing: 12,
                alignment: WrapAlignment.center,
                children: [
                  FilledButton(
                    onPressed: () => context.push('/login'),
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.primaryContainer,
                      foregroundColor: AppColors.onPrimaryContainer,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 32,
                        vertical: 16,
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: Text(
                      'Start Free Trial',
                      style: AppTypography.bodyMd.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  OutlinedButton(
                    onPressed: () => context.push('/login'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.onSurface,
                      side: BorderSide(
                        color: AppColors.outline.withValues(alpha: 0.2),
                      ),
                      padding: const EdgeInsets.symmetric(
                        horizontal: 32,
                        vertical: 16,
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: Text(
                      'Explore Features',
                      style: AppTypography.bodyMd.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),
              Text(
                'No credit card required. Free plan available forever.',
                style: AppTypography.labelSm.copyWith(
                  color: AppColors.onSurfaceVariant.withValues(alpha: 0.6),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _features(double hPadding) {
    const features = [
      (Icons.play_circle, 'Unlimited Streaming', 'Watch thousands of movies and TV shows on any device, anytime.'),
      (Icons.auto_awesome, 'Personalized Picks', 'Smart recommendations tailored to your taste and watch history.'),
      (Icons.group, 'Watch Parties', 'Watch together in real-time with friends — built-in chat and sync.'),
      (Icons.videocam, 'Creator Hub', 'Upload your films, earn revenue, and build your audience.'),
      (Icons.download, 'Smart Downloads', 'Download to watch offline. Choose quality or let our algorithm decide.'),
      (Icons.language, 'Global Library', 'Curated films from around the world, from indie gems to blockbusters.'),
    ];
    return Padding(
      padding: EdgeInsets.fromLTRB(hPadding, 48, hPadding, 64),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1152),
          child: Column(
            children: [
              Text(
                'Everything you need',
                textAlign: TextAlign.center,
                style: AppTypography.headlineLg.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Built for viewers, creators, and everyone in between.',
                textAlign: TextAlign.center,
                style: AppTypography.bodyMd.copyWith(
                  color: AppColors.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 48),
              LayoutBuilder(
                builder: (context, constraints) => GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: gridColumns(constraints.maxWidth).clamp(2, 3),
                    crossAxisSpacing: 16,
                    mainAxisSpacing: 16,
                    childAspectRatio: 1.4,
                  ),
                  itemCount: features.length,
                  itemBuilder: (_, i) {
                    final f = features[i];
                    return Container(
                      padding: const EdgeInsets.all(24),
                    decoration: BoxDecoration(
                      color: AppColors.surfaceContainerHigh,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: AppColors.white.withValues(alpha: 0.05),
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(
                          f.$1,
                          size: 28,
                          color: AppColors.primaryContainer,
                        ),
                        const SizedBox(height: 12),
                        Text(
                          f.$2,
                          style: AppTypography.labelLg.copyWith(
                            color: AppColors.onSurface,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          f.$3,
                          style: AppTypography.bodySm.copyWith(
                            color: AppColors.onSurfaceVariant,
                          ),
                        ),
                      ],
),
              );
                },
              ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _pricing(double hPadding) {
    const plans = [
      ('Free', '₹0', 'forever', [
        '720p streaming',
        'Ad-supported',
        'Basic search',
        'Create watchlist',
      ], false),
      ('Premium', '₹9.99', '/month', [
        '4K HDR streaming',
        'No ads',
        'Offline downloads',
        'Watch parties',
        'Priority support',
      ], true),
      ('Duo', '₹14.99', '/month', [
        'Everything in Premium',
        '2 simultaneous streams',
        'Shared watchlist',
        'Family-friendly mode',
      ], false),
    ];
    return Container(
      padding: EdgeInsets.fromLTRB(hPadding, 48, hPadding, 64),
      color: AppColors.pricingBg,
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1152),
          child: Column(
            children: [
              Text(
                'Simple, transparent pricing',
                textAlign: TextAlign.center,
                style: AppTypography.headlineLg.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Choose the plan that fits you. Upgrade anytime.',
                textAlign: TextAlign.center,
                style: AppTypography.bodyMd.copyWith(
                  color: AppColors.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 48),
              LayoutBuilder(
                builder: (context, constraints) => GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: gridColumns(constraints.maxWidth).clamp(1, 3),
                    crossAxisSpacing: 16,
                    mainAxisSpacing: 16,
                    childAspectRatio: 0.75,
                  ),
                  itemCount: plans.length,
                  itemBuilder: (_, i) {
                    final p = plans[i];
                    return Container(
                      padding: const EdgeInsets.all(28),
                    decoration: BoxDecoration(
                      color: p.$5 ? AppColors.pricingCardHover : AppColors.pricingCard,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: p.$5
                            ? AppColors.pricingRed.withValues(alpha: 0.6)
                            : AppColors.pricingBorder,
                      ),
                      boxShadow: p.$5
                          ? [
                              BoxShadow(
                                color: AppColors.pricingRed.withValues(alpha: 0.08),
                                blurRadius: 24,
                              ),
                            ]
                          : null,
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Text(
                              p.$1,
                              style: AppTypography.headlineMd.copyWith(
                                color: AppColors.onSurface,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const Spacer(),
                            if (p.$5)
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 10,
                                  vertical: 4,
                                ),
                                decoration: BoxDecoration(
                                  color: AppColors.pricingRed,
                                  borderRadius: BorderRadius.circular(999),
                                ),
                                child: Text(
                                  'MOST POPULAR',
                                  style: AppTypography.labelXs.copyWith(
                                    color: AppColors.onPrimaryContainer,
                                    fontWeight: FontWeight.w700,
                                    letterSpacing: 1,
                                  ),
                                ),
                              ),
                          ],
                        ),
                        const SizedBox(height: 16),
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.baseline,
                          textBaseline: TextBaseline.alphabetic,
                          children: [
                            Text(
                              p.$2,
                              style: AppTypography.headlineLg.copyWith(
                                color: AppColors.primaryContainer,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            Text(
                              p.$3,
                              style: AppTypography.labelMd.copyWith(
                                color: AppColors.onSurfaceVariant,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),
                        Divider(color: AppColors.white.withValues(alpha: 0.05)),
                        const SizedBox(height: 12),
                        for (final f in p.$4)
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 5),
                            child: Row(
                              children: [
                                const Icon(
                                  Icons.check,
                                  size: 16,
                                  color: AppColors.secondary,
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    f,
                                    style: AppTypography.bodySm.copyWith(
                                      color: AppColors.onSurfaceVariant,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        const Spacer(),
                        const SizedBox(height: 16),
                        SizedBox(
                          width: double.infinity,
                          child: FilledButton(
                            onPressed: () => context.push('/pricing'),
                            style: FilledButton.styleFrom(
                              backgroundColor: p.$5
                                  ? AppColors.primaryContainer
                                  : AppColors.outline.withValues(alpha: 0.2),
                              foregroundColor: p.$5
                                  ? AppColors.onPrimaryContainer
                                  : AppColors.onSurface,
                              minimumSize: const Size.fromHeight(44),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(10),
                              ),
                            ),
                            child: Text(
                              p.$1 == 'Free' ? 'Get Free' : 'Go Premium',
                              style: AppTypography.labelSm.copyWith(
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _testimonials(double hPadding) {
    const testimonials = [
      ('Alex R.', 'Film Buff', 'The recommendation engine is uncanny. I discover movies I never knew I needed.'),
      ('Sarah K.', 'Indie Filmmaker', 'Uploading my short film and getting real analytics was a game-changer.'),
      ('Marcus J.', 'Creator', 'Finally a platform that pays creators based on actual watch time, not one-time fees.'),
    ];
    return Padding(
      padding: EdgeInsets.fromLTRB(hPadding, 48, hPadding, 64),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1152),
          child: Column(
            children: [
              Text(
                'Loved by viewers and creators',
                textAlign: TextAlign.center,
                style: AppTypography.headlineLg.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 48),
              LayoutBuilder(
                builder: (context, constraints) => GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: gridColumns(constraints.maxWidth).clamp(1, 3),
                    crossAxisSpacing: 16,
                    mainAxisSpacing: 16,
                    childAspectRatio: 1.4,
                  ),
                  itemCount: testimonials.length,
                  itemBuilder: (_, i) {
                    final t = testimonials[i];
                  return Container(
                    padding: const EdgeInsets.all(24),
                    decoration: BoxDecoration(
                      color: AppColors.surfaceContainerHigh,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(
                        color: AppColors.white.withValues(alpha: 0.05),
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Row(
                          children: [
                            Icon(Icons.star, size: 16, color: AppColors.primaryContainer),
                            Icon(Icons.star, size: 16, color: AppColors.primaryContainer),
                            Icon(Icons.star, size: 16, color: AppColors.primaryContainer),
                            Icon(Icons.star, size: 16, color: AppColors.primaryContainer),
                            Icon(Icons.star, size: 16, color: AppColors.primaryContainer),
                          ],
                        ),
                        const SizedBox(height: 12),
                        Expanded(
                          child: Text(
                            '"${t.$3}"',
                            style: AppTypography.bodySm.copyWith(
                              color: AppColors.onSurfaceVariant,
                              fontStyle: FontStyle.italic,
                            ),
                          ),
                        ),
                        const SizedBox(height: 12),
                        Text(
                          t.$1,
                          style: AppTypography.labelMd.copyWith(
                            color: AppColors.onSurface,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        Text(
                          t.$2,
                          style: AppTypography.labelXs.copyWith(
                            color: AppColors.onSurfaceVariant,
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _newsletter(double hPadding) {
    return Container(
      padding: EdgeInsets.fromLTRB(hPadding, 48, hPadding, 64),
      color: AppColors.surfaceContainerHigh.withValues(alpha: 0.3),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 512),
          child: Column(
            children: [
              Text(
                'Stay in the loop',
                textAlign: TextAlign.center,
                style: AppTypography.headlineMd.copyWith(
                  color: AppColors.onSurface,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                'Get the latest movies, creator highlights, and platform updates.',
                textAlign: TextAlign.center,
                style: AppTypography.bodySm.copyWith(
                  color: AppColors.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 20),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _newsletterCtl,
                      keyboardType: TextInputType.emailAddress,
                      style: const TextStyle(color: AppColors.onSurface, fontSize: 14),
                      decoration: InputDecoration(
                        hintText: 'your@email.com',
                        hintStyle: const TextStyle(
                          color: AppColors.onSurfaceVariant,
                          fontSize: 14,
                        ),
                        filled: true,
                        fillColor: AppColors.surfaceVariant.withValues(alpha: 0.2),
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 14,
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: BorderSide(
                            color: AppColors.outline.withValues(alpha: 0.2),
                          ),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(
                            color: AppColors.primaryContainer,
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  FilledButton(
                    onPressed: _subscribing ? null : _subscribe,
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.primaryContainer,
                      foregroundColor: AppColors.onPrimaryContainer,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 24,
                        vertical: 14,
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: _subscribing
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : Text(
                            'Subscribe',
                            style: AppTypography.labelSm.copyWith(
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                  ),
                ],
              ),
              if (_newsletterMsg != null) ...[
                const SizedBox(height: 10),
                Text(
                  _newsletterMsg!,
                  style: TextStyle(
                    color: _newsletterMsg == 'Subscribed!'
                        ? AppColors.secondary
                        : AppColors.error,
                    fontSize: 13,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _footer(double hPadding) {
    return Container(
      padding: EdgeInsets.symmetric(horizontal: hPadding, vertical: 32),
      decoration: BoxDecoration(
        border: Border(
          top: BorderSide(color: AppColors.white.withValues(alpha: 0.05)),
        ),
      ),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1152),
          child: Wrap(
            alignment: WrapAlignment.center,
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 24,
            runSpacing: 12,
            children: [
              Image.asset(
                'assets/brand/leter-mark-logo.png',
                height: 24,
                fit: BoxFit.contain,
                errorBuilder: (_, __, ___) => const SizedBox(height: 24),
              ),
              Text(
                '© 2026 NovaFlix. All rights reserved.',
                style: AppTypography.labelXs.copyWith(
                  color: AppColors.onSurfaceVariant.withValues(alpha: 0.6),
                ),
              ),
              const SizedBox(width: 24),
              TextButton(
                onPressed: () => context.push('/login'),
                child: Text(
                  'Sign In',
                  style: AppTypography.labelXs.copyWith(
                    color: AppColors.onSurfaceVariant.withValues(alpha: 0.8),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}