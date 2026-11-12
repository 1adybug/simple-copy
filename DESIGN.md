---
version: alpha
name: Simple Copy
description: Compact, flat clipboard history with borderless lavender surfaces and native keyboard interaction.
colors:
  primary: "#793d91"
  primary-hover: "#633578"
  primary-active: "#552e67"
  background: "#f5f0f7"
  panel: "#eae1f0"
  foreground: "#261d2a"
  card: "#ffffff"
  popover: "#e7dced"
  secondary: "#eae1f0"
  accent: "#e4d3ed"
  hover: "#f4edf8"
  control: "#947f9f"
  muted: "#716576"
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
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.foreground}"
  secondary-button:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.foreground}"
  selected-action:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.primary}"
  caption:
    textColor: "{colors.muted}"
  panel:
    backgroundColor: "{colors.panel}"
  destructive-action:
    backgroundColor: "{colors.danger}"
    textColor: "#ffffff"
---

# Simple Copy Design System

## Overview

The user-supplied Windows clipboard screenshot determines the composition, density, lavender surfaces, rounded cards and pin placement. The user's flat-design direction determines boundaries: use solid background colors and spacing throughout the software, without decorative borders, gradients or shadows. The history list's explicitly requested blurred edge fades are the only surface exception. The primary task is selecting recently copied content while working in another desktop application. The product uses Simplified Chinese copy and operating-system fonts.

The shared runtime source of brand colors and the body font is packages/brand/tokens.css. apps/desktop/src/index.css maps those variables into the existing desktop variables and Tailwind 4 theme adapter, then the shared shadcn/ui components. apps/website/src/styles.css imports the same tokens for the marketing surface. This document mirrors accepted values. Shared palette changes must update the token package and this document together. Desktop geometry and component radii remain owned by apps/desktop/src/index.css.

The product mark is the round cartoon parrot reconstructed from the user-supplied reference in packages/brand/assets/logo.svg. Preserve its smooth organic silhouette without contour strokes, bright green body, yellow wing band, light and dark blue wing feathers, deeper blue tail, pale face, warm gold upper beak, dark gray lower beak, and transparent background. The upper beak stays visibly darker than the face, and adjacent blue feather sections use distinct fills without relying on an outline. The tail meets the lower feather with a continuous tangent; its closing edge stays behind the foreground feather. scripts/generate-brand-logo.py owns its editable geometry and subtle native SVG gradients. Website branding, favicon, desktop window headings and the website demonstration use this shared SVG. Native application, installer and tray icons are generated from the same source with the documented Tauri icon command; do not maintain a separate product mark for the desktop app.

The monorepo has two visual registers: the compact desktop product and a spacious Chinese marketing website. The website introduces the existing Windows app; its browser demonstration uses sample content and must never read the visitor's system clipboard. Product facts come from README.md and apps/desktop/src-tauri/src; marketing copy must preserve the actual defaults and platform limits.

## Colors

History and settings share lavender panel surfaces (#eae1f0) and white content cards (#ffffff), establishing boundaries through color. Secondary controls use a lavender fill, menus use the popover fill, and selected options use the accent fill. Hover uses a distinct light fill; pressed controls deepen their fill. Plum identifies active pins and primary actions. Errors and deletion confirmations use the danger color together with explicit text. Keyboard focus retains a visible outline. Forced-colors mode uses system colors and borders so that controls remain distinguishable when background colors are replaced.

Desktop settings offer system, light and dark theme modes, with system as the default for new and existing settings. Rust Settings owns the persisted preference and applies it to the native application; the shared App theme hook resolves system changes and sets data-theme on the document for both history and settings. Both windows consume the same saved snapshot. Explicit light or dark mode stays fixed until the preference changes. The marketing website retains its light palette.

packages/brand/tokens.css remains the canonical palette source. Its dark selector maps the same semantic roles to background #1d1721, panel #251d2b, card #302637, popover and secondary #3a2d42, foreground #f2eaf6, muted #c4b2cd, primary #d2a4e6 and danger #ffa5b6. Primary and danger controls use their paired foreground tokens so text and selection indicators remain legible in both modes. Desktop icons, empty states and feedback also consume paired theme tokens; changing themes preserves the existing light colors, geometry, flat surfaces and forced-colors behavior. The desktop Tailwind dark variant follows data-theme rather than a separate system preference.

## Typography

The Windows font stack matches the reference. History text uses 13px type with 1.65 line height. Settings use 12px labels and 11px supporting copy. Preview text preserves source whitespace and wraps long lines.

## Layout

The history window measures 360 by 400 logical pixels. Its single-row title bar contains clear-unpinned (a broom), settings and dismiss actions, in that order. There is no record-count toolbar or footer hint row. The history list owns scrolling and fills the remaining height. All four sides use 12px padding, owned by --history-list-padding in apps/desktop/src/index.css. The top and bottom padding contain static 3px blur fades; list content reaches zero opacity at both viewport edges and full opacity at the inner edge of the padding. These effects pass pointer events through and are disabled in forced-colors mode. Scroll padding keeps keyboard-focused cards inside the fully visible region. Cards reserve three 13px text lines at 1.65 line height plus 10px vertical padding on each side, with an 8px gap between cards. Image previews preserve aspect ratio. Settings keep the title bar visible while the form owns scrolling and narrow at 420px.

All desktop scroll surfaces, including history, settings, feedback and menus, hide native scrollbars while retaining wheel, touchpad and keyboard scrolling. Scrollbar tracks reserve no layout space. The global rule in apps/desktop/src/index.css owns this behavior.

## Elevation & Depth

All application surfaces are flat: history cards, settings rows, controls, menus, dialogs and feedback have no decorative borders or elevation shadows. Use solid fills and gaps to separate adjacent surfaces; separate groups with space instead of divider lines. Menus and confirmation dialogs use shadcn/ui portals, with contrasting fills and a modal backdrop where appropriate. Feedback overlays the popup list without changing its geometry. Focus outlines and forced-colors borders are accessibility treatments. Preserve the existing product-mark artwork.

Native history and settings windows also disable system decorations and window shadows in apps/desktop/src-tauri/src/windows.rs. On Windows, enabling shadows for an undecorated window adds a white outer frame, so the borderless contract requires both options to stay disabled. Both window headings are native drag regions, including their logos, text and remaining space before the action buttons. Heading descendants pass pointer events to the drag region; adjacent buttons retain their own actions. Drag-region permissions are shared by the history and settings windows, including Tauri's internal double-click handler, which respects the fixed size of history. Explicit minimize, maximize/restore and destroy permissions remain limited to settings. Settings controls remain available while settings load or fail to load. Closing waits for pending automatic saves and keeps the window open if a pending save fails.

## Shapes

The popup and cards use 9px corners. Body-level clipping shares the popup radius so portal overlays remain inside the transparent native window's rounded boundary. Standard controls use 7px corners and small controls use 5px corners. Icons use Lucide with mostly 1.5–1.7px strokes; the clear-unpinned action uses the plumper hand-drawn BroomIcon.

## Components

Shared shadcn/ui Button, Card, DropdownMenu, AlertDialog, Switch, RadioGroup, Label and Input own their respective interactions. History actions use sibling buttons to keep paste, pin, copy and delete targets independent. Pin, copy and delete form a right-hand column aligned to the three text line boxes; pin remains visible, while copy and delete appear on card hover or keyboard focus. Every icon action retains its accessible label. Application and tray tooltips are intentionally absent.

Button uses filled primary and secondary variants or a ghost variant. Input uses a secondary fill. Switch and RadioGroup use solid control fills, with thumb position and an inner dot identifying state as well as color. Settings rows and retention choices are independent color blocks separated by 4px gaps; the checked retention option uses the accent fill. Shared brand surface and control tokens in packages/brand/tokens.css map through apps/desktop/src/index.css into these primitives; website demonstrations consume the same tokens directly.

Every enabled action has hover, pressed and visible keyboard-focus states. Busy actions are guarded against duplicate requests. Dialogs trap and restore focus. Settings save valid field changes automatically through the shared serialized settings queue, own numeric validation and error text, and confirm reductions in disk history retention. There is no manual save action or privacy note. A shared Feedback component announces action outcomes.

Settings label the shortcut section 快捷键. The 其他设置 section presents 常驻回复 as the same icon, label, description and switch row used by recording-format settings. Shortcut and valid delay inputs use white card fills in light mode, mapped through the shared card token in dark mode; the numeric delay input hides native stepper arrows.

The 历史条数 section uses the same numeric setting row for 最多保存条数. Rust Settings owns the persisted count limit, which defaults to 100 for new and existing settings; 0 removes the count limit and pinned entries do not count toward it. The existing byte budget still applies. Count edits commit on blur or Enter so intermediate digits cannot prune history. Reducing the limit requires the shared confirmation dialog; saving the setting and pruning disk history happen together, and in-memory history changes only after storage succeeds.

Arrow keys navigate history items, Enter selects and Escape dismisses the popup. Clipboard HTML is stored as data and previewed as plain text. Image previews use bounded PNG thumbnails. Reduced-motion preferences shorten animation and transition durations.

## Do's and Don'ts

- Keep the popup compact and preserve the reference card structure.
- Keep action names consistent across the card, menu and settings.
- Use accessible labels for every icon-only action.
- Distinguish regions with solid background colors and spacing; keep normal surfaces borderless and shadowless.
- Preserve visible keyboard focus and system-color boundaries in high-contrast mode.

## Marketing website

The website feels like a small, useful object on a lavender desktop. Its signature is an interactive, faithful clipboard panel paired with a slightly angled note that receives the selected sample. Keep the rest of the page quiet: no stock photos, invented usage statistics, testimonials, or decorative dashboards.

The palette extends the shared plum (#793d91), ink (#261d2a), muted text (#716576) and flat lavender surfaces with a near-white page (#fdfcfe) and a lavender demo stage (#e0d1e9). Color blocks and whitespace replace borders and shadows throughout the website, including its product demonstrations, keyboard hints, FAQ and build guide. Website-only color roles live in the root variables in apps/website/src/styles.css; they do not change desktop colors. Muted illustration colors are reserved for decorative samples, not essential controls or body text.

Display type uses Segoe UI Variable Display with Segoe UI and Microsoft YaHei UI fallbacks; body type uses the shared operating-system stack. Commands use Cascadia Code and Consolas. No remote font requests or font-swap layout changes. Desktop headings reach 65px, mobile headings scale down to 36px. Section headings use 28–35px, body copy uses 13–15px, with compact supporting captions. Every meaningful text color, including demo captions, meets normal-text contrast against its actual surface.

The website uses a maximum 1160px content width. The hero places the product statement beside the working demonstration; at 760px it stacks naturally with all controls retained. Five content formats, the actual three-step copy/paste sequence, pinning and optional restore, local persistence, FAQs, and acquisition each add distinct information. Only the real three-step workflow is numbered.

Website controls use native buttons, anchors and details/summary. Pin state is expressed with aria-pressed; demonstration and command-copy results use stable live regions. The copy-command action writes only the displayed build commands after an explicit click, with an inline manual-copy error. Global scrollbars, visible focus, forced colors, and reduced motion apply to every owned scroll surface.

Without an actual configured installer URL, acquisition shows an honest local-build guide. VITE_DOWNLOAD_URL supplies a published HTTPS or root-relative download URL. The package:website command builds a deployable static site with a real local NSIS installer included in dist/downloads. No placeholder release URLs or nonfunctional download controls.
