---
version: alpha
name: Simple Copy
description: Compact Windows-style clipboard history with lavender surfaces and native keyboard interaction.
colors:
  primary: "#793d91"
  background: "#f8f5f9"
  foreground: "#261d2a"
  card: "#faf7fc"
  popover: "#fcf9fd"
  secondary: "#f0eaf3"
  accent: "#eee3f3"
  muted: "#716576"
  border: "#dfd5e4"
  danger: "#a4263b"
typography:
  sans:
    fontFamily: '"Segoe UI Variable Text", "Segoe UI", "Microsoft YaHei UI", system-ui, sans-serif'
    fontSize: "13px"
    lineHeight: "1.5"
rounded:
  DEFAULT: "9px"
  sm: "5px"
  md: "7px"
  lg: "9px"
  xl: "12px"
spacing:
  panel-width: "360px"
  panel-height: "400px"
  card-gap: "8px"
components:
  button:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
  dialog:
    backgroundColor: "{colors.popover}"
    textColor: "{colors.foreground}"
  input:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
  secondary-button:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.foreground}"
  selected-action:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.primary}"
  caption:
    textColor: "{colors.muted}"
  divider:
    backgroundColor: "{colors.border}"
  destructive-action:
    backgroundColor: "{colors.danger}"
    textColor: "#ffffff"
---

# Simple Copy Design System

## Overview

The user-supplied Windows clipboard screenshot determines the composition, density, lavender surfaces, rounded cards and pin placement. The primary task is selecting recently copied content while working in another desktop application. The product uses Simplified Chinese copy and operating-system fonts.

The shared runtime source of brand colors and the body font is packages/brand/tokens.css. apps/desktop/src/index.css maps those variables into the existing desktop variables and Tailwind 4 theme adapter, then the shared shadcn/ui components. apps/website/src/styles.css imports the same tokens for the marketing surface. This document mirrors accepted values. Shared palette changes must update the token package and this document together. Desktop geometry and component radii remain owned by apps/desktop/src/index.css.

The product mark is the round cartoon parrot reconstructed from the user-supplied reference in packages/brand/assets/logo.svg. Preserve its smooth organic silhouette, thick dark outline, bright green body, yellow-and-blue wing, pale face and beak, and transparent background. scripts/generate-brand-logo.py owns its editable geometry and subtle native SVG gradients. Website branding, favicon, desktop window headings and the website demonstration use this shared SVG. Native application, installer and tray icons are generated from the same source with the documented Tauri icon command; do not maintain a separate product mark for the desktop app.

The monorepo has two visual registers: the compact desktop product and a spacious Chinese marketing website. The website introduces the existing Windows app; its browser demonstration uses sample content and must never read the visitor's system clipboard. Product facts come from README.md and apps/desktop/src-tauri/src; marketing copy must preserve the actual defaults and platform limits.

## Colors

Lavender is used for the popup surface, white-purple for history cards and plum for active pins and primary actions. Errors and deletion confirmations use the danger color. Focus has a visible outline. Forced-colors mode uses system colors and borders.

## Typography

The Windows font stack matches the reference. History text uses 13px type with 1.65 line height. Settings use 12px labels and 11px supporting copy. Preview text preserves source whitespace and wraps long lines.

## Layout

The history window measures 360 by 400 logical pixels. Its header and footer keep stable heights while the history list owns scrolling. Cards have a minimum height of 78px with an 8px gap. Image previews preserve aspect ratio. Settings use document scrolling and narrow at 420px.

## Elevation & Depth

History cards use a thin lavender border and a shallow shadow. Menus and confirmation dialogs use shadcn/ui portals. Feedback overlays the popup list without changing its geometry.

## Shapes

The popup and cards use 9px corners. Standard controls use 7px corners and small controls use 5px corners. Icons use Lucide with mostly 1.5–1.7px strokes.

## Components

Shared shadcn/ui Button, Card, DropdownMenu, AlertDialog, Switch, RadioGroup, Label, Input and Tooltip own their respective interactions. History actions use sibling buttons to keep paste, pin and menu targets independent.

Every enabled action has hover, pressed and visible keyboard-focus states. Busy actions are guarded against duplicate requests. Dialogs trap and restore focus. Settings own numeric validation, error text and unsaved-change confirmation. A shared Feedback component announces action outcomes.

Arrow keys navigate history items, Enter selects and Escape dismisses the popup. Clipboard HTML is stored as data and previewed as plain text. Image previews use bounded PNG thumbnails. Reduced-motion preferences shorten animation and transition durations.

## Do's and Don'ts

- Keep the popup compact and preserve the reference card structure.
- Keep action names consistent across the card, menu and settings.
- Use accessible labels for every icon-only action.

## Marketing website

The website feels like a small, useful object on a lavender desktop. Its signature is an interactive, faithful clipboard panel paired with a slightly angled note that receives the selected sample. Keep the rest of the page quiet: no stock photos, invented usage statistics, testimonials, or decorative dashboards.

The palette extends the shared plum (#793d91), ink (#261d2a), muted text (#716576), lavender surfaces and thin borders with a near-white page (#fdfcfe) and a lavender demo stage (#f0e8f5). Website-only color roles live in the root variables in apps/website/src/styles.css; they do not change desktop colors. Muted illustration colors are reserved for decorative samples, not essential controls or body text.

Display type uses Segoe UI Variable Display with Segoe UI and Microsoft YaHei UI fallbacks; body type uses the shared operating-system stack. Commands use Cascadia Code and Consolas. No remote font requests or font-swap layout changes. Desktop headings reach 65px, mobile headings scale down to 36px. Section headings use 28–35px, body copy uses 13–15px, with compact supporting captions. Every meaningful text color, including demo captions, meets normal-text contrast against its actual surface.

The website uses a maximum 1160px content width. The hero places the product statement beside the working demonstration; at 760px it stacks naturally with all controls retained. Five content formats, the actual three-step copy/paste sequence, pinning and optional restore, local persistence, FAQs, and acquisition each add distinct information. Only the real three-step workflow is numbered.

Website controls use native buttons, anchors and details/summary. Pin state is expressed with aria-pressed; demonstration and command-copy results use stable live regions. The copy-command action writes only the displayed build commands after an explicit click, with an inline manual-copy error. Global scrollbars, visible focus, forced colors, and reduced motion apply to every owned scroll surface.

Without an actual configured installer URL, acquisition shows an honest local-build guide. VITE_DOWNLOAD_URL supplies a published HTTPS or root-relative download URL. The package:website command builds a deployable static site with a real local NSIS installer included in dist/downloads. No placeholder release URLs or nonfunctional download controls.
