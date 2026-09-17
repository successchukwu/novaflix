---
name: Cinematic Creator Nexus
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#3a3939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353534'
  on-surface: '#e5e2e1'
  on-surface-variant: '#e9bcb6'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#af8782'
  outline-variant: '#5e3f3b'
  surface-tint: '#ffb4aa'
  primary: '#ffb4aa'
  on-primary: '#690003'
  primary-container: '#e50914'
  on-primary-container: '#fff7f6'
  inverse-primary: '#c0000c'
  secondary: '#53e076'
  on-secondary: '#003914'
  secondary-container: '#02b04c'
  on-secondary-container: '#003a14'
  tertiary: '#c6c6c7'
  on-tertiary: '#2f3131'
  tertiary-container: '#717373'
  on-tertiary-container: '#f9f9f9'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdad5'
  primary-fixed-dim: '#ffb4aa'
  on-primary-fixed: '#410001'
  on-primary-fixed-variant: '#930007'
  secondary-fixed: '#72fe8f'
  secondary-fixed-dim: '#53e076'
  on-secondary-fixed: '#002108'
  on-secondary-fixed-variant: '#005320'
  tertiary-fixed: '#e2e2e2'
  tertiary-fixed-dim: '#c6c6c7'
  on-tertiary-fixed: '#1a1c1c'
  on-tertiary-fixed-variant: '#454747'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 64px
    fontWeight: '800'
    lineHeight: 72px
    letterSpacing: -0.04em
  headline-lg:
    fontFamily: Inter
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 64px
  container-max: 1440px
---

## Brand & Style

The design system is built on a "Cinematic Nexus" philosophy—merging the immersive, high-stakes atmosphere of a premium streaming service with the agile, data-centric precision of a creator platform. It caters to two primary personas: the **Viewer**, who seeks effortless immersion and discovery, and the **Creator**, who requires powerful insights and professional tools.

The visual style is a hybrid of **Corporate Modern** and **Glassmorphism**. It utilizes a "lights out" approach to minimize interface distraction, using depth and translucency to suggest layers of content and data. The mood is energetic, premium, and authoritative, ensuring that user-generated content feels as prestigious as a studio blockbuster.

## Colors

The palette is anchored in **Deep Cinematic Blacks** (`#050505`) to create a canvas where content is the star. 

- **Nova Red:** Reserved for high-intent viewer actions (Play, Subscribe, Live) and brand markers. It signifies energy and the "theatrical" experience.
- **Creator Green:** A specialized accent used exclusively for the creator ecosystem. It signals growth, data metrics, and professional studio tools, effectively bifurcating the user experience without switching themes.
- **Surface Neutrals:** A range of dark charcoals and gunmetal grays are used to create hierarchy within the dark mode, preventing the interface from appearing flat.
- **High-Contrast White:** Used for primary typography to ensure maximum legibility against dark backgrounds.

## Typography

This design system utilizes **Inter** for its modern, neutral, and highly scalable characteristics. Bold weights are used for headlines to echo the impactful nature of movie titling. 

For the Creator Dashboard and technical metadata (durations, timestamps, analytics), **JetBrains Mono** is introduced as a secondary functional font. This monospaced choice provides a "data-driven" feel that distinguishes studio metrics from consumer-facing editorial content. Text should maintain high contrast; secondary text should drop to 70% opacity rather than shifting to a mid-gray color to maintain the cinematic depth.

## Layout & Spacing

The layout follows a **Fluid Grid** system with a heavy emphasis on horizontal density for content discovery (Netflix-style carousels) and vertical clarity for creator tools.

- **Desktop:** 12-column grid with wide 64px margins to create a premium, "breathable" feel for hero content.
- **Mobile:** 4-column grid with 16px margins, prioritizing vertical scrolling for creator feeds and horizontal carousels for movie browsing.
- **Spacing Rhythm:** Based on an 8px root. Use larger increments (48px, 64px) to separate distinct content sections (e.g., "Trending" vs "My List") and smaller increments (8px, 16px) for internal component grouping.

## Elevation & Depth

Hierarchy is established through **Glassmorphism** and **Tonal Layering** rather than traditional heavy shadows.

- **Base Layer:** The darkest neutral (`#050505`).
- **Surface Layer:** Dark charcoal (`#121212`) for cards and containers.
- **Overlays:** Navigation bars and modal backgrounds use a 60% opacity blur (Backdrop Filter: 20px) to maintain a sense of context behind the current action.
- **Shadows:** Use extremely subtle, large-radius ambient shadows (0px 20px 40px rgba(0,0,0,0.5)) only on floating elements like play buttons or focused movie cards to lift them off the grid.

## Shapes

The shape language is consistently **Rounded**, striking a balance between friendly consumer tech and professional hardware aesthetics.

- **Standard Elements:** Buttons, input fields, and tags use an 8px (`rounded`) corner radius.
- **Cards & Thumbnails:** Movie posters and creator video cards use a 12px (`rounded-lg`) radius to soften the high-contrast imagery.
- **Interactive States:** Focused elements should maintain their corner radius but gain a 2px outer stroke in the primary brand color (Red or Green depending on the context).

## Components

### Buttons
- **Primary (Viewer):** Nova Red background, white text, 8px radius. High-gloss finish on hover.
- **Primary (Creator):** Creator Green background, black text for high legibility, 8px radius.
- **Ghost:** White border (1px), transparent background. Used for secondary actions like "Add to List."

### Cards
- **Movie Card:** Aspect ratio 2:3 or 16:9. No visible border. On hover, the card scales up by 5% and displays a glassmorphic overlay with quick-action icons (Play, Like).
- **Metric Card (Creator):** Dark charcoal background with a Creator Green accent border on the left edge. Uses JetBrains Mono for data points.

### Inputs & Interactive
- **Input Fields:** Semi-transparent dark fills with a 1px border that glows Nova Red on focus.
- **Chips/Filters:** Pill-shaped with a glassmorphic background. Active state uses the primary brand color with a high-contrast label.
- **Progress Bars:** Thin 4px height. Unfilled state is 20% white; filled state is Nova Red (for viewing) or Creator Green (for upload/processing).