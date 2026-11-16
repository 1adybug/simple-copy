---
version: alpha
name: Simple Copy
description: Compact, borderless clipboard history with Windows appearance integration and native keyboard interaction.
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
  muted-on-fill: "#63546b"
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
  on-tint-caption:
    textColor: "{colors.muted-on-fill}"
  switch:
    backgroundColor: "{colors.control}"
  switch-checked:
    backgroundColor: "{colors.primary}"
  button-hover:
    backgroundColor: "{colors.primary-hover}"
  button-active:
    backgroundColor: "{colors.primary-active}"
  card-hover:
    backgroundColor: "{colors.hover}"
  panel:
    backgroundColor: "{colors.panel}"
  destructive-action:
    backgroundColor: "{colors.danger}"
    textColor: "#ffffff"
---

# Simple Copy Design System

## Overview

The user-supplied Windows clipboard screenshot determines the composition, density, rounded cards and pin placement. The user's flat-design direction determines boundaries: use background colors and spacing throughout the software, without decorative borders, gradients or shadows. The explicitly requested Windows transparency setting controls native acrylic on the window shell; content cards and controls stay solid. The history list and settings form retain their explicitly requested blurred edge fades. The primary task is selecting recently copied content while working in another desktop application. The product follows the system language by default, offers a manual language choice and uses operating-system fonts.

The shared runtime source of brand colors and the body font is packages/brand/tokens.css. These colors remain the desktop fallback and the website palette. For Windows, apps/desktop/src-tauri/src/appearance owns native system appearance events and material results; apps/desktop/src/theme.ts consumes its versioned snapshots, and system-palette.ts generates the desktop semantic colors from the current system accent and resolved light/dark scheme. That shared adapter overrides the existing --sc-* variables once on the document. packages/ui/styles.css maps those variables into the existing desktop variables and Tailwind 4 theme adapter, then the shared shadcn/ui components. apps/website/src/styles.css imports the brand tokens for the marketing surface. This document mirrors accepted values. Shared brand palette changes must update the token package and this document together. Product geometry and component radii remain owned by packages/ui/styles.css. Both desktop and browser demonstration import this stylesheet and the shared @simple-copy/ui components.

The product mark is the round cartoon parrot reconstructed from the user-supplied reference in packages/brand/assets/logo.svg. Preserve its smooth organic silhouette without contour strokes, bright green body, yellow wing band, light and dark blue wing feathers, deeper blue tail, pale face, warm gold upper beak, dark gray lower beak, and transparent background. The upper beak stays visibly darker than the face, and adjacent blue feather sections use distinct fills without relying on an outline. The tail meets the lower feather with a continuous tangent; its closing edge stays behind the foreground feather. scripts/generate-brand-logo.py owns its editable geometry and subtle native SVG gradients. Website branding, favicon, desktop window headings and the website demonstration use this shared SVG. Native application, installer and tray icons are generated from the same source with the documented Tauri icon command; do not maintain a separate product mark for the desktop app.

The monorepo has two visual registers: the compact desktop product and a concise multilingual marketing website. The website introduces the existing Windows app; its browser demonstration uses sample content and must never read the visitor's system clipboard. Product facts come from README.md and apps/desktop/src-tauri/src; marketing copy must preserve the actual defaults and platform limits.

## Colors

History and settings share the same semantic surface and control colors. Windows always supplies the accent, independently of the app's light/dark choice. system-palette.ts derives lightly tinted panels, secondary controls, menus, selected options and hover fills from that accent. Primary actions, active pins, focus and text selection use an accent shade chosen for at least 4.5:1 text contrast against every consumed surface; their foreground is paired with the primary, hover and pressed fills. Muted copy also meets 4.5:1, and control indicators meet 3:1. Palette generation accounts for the translucent shell over a contrasting desktop. Errors and deletion confirmations preserve their semantic danger colors together with explicit text. The fallback remains lavender panel surfaces (#eae1f0), white content cards (#ffffff) and plum actions. Forced-colors mode uses system colors and borders so that controls remain distinguishable when background colors are replaced.

Settings content maps its muted foreground to the shared --sc-muted-on-fill token (#63546b in light mode, #c4b2cd in dark mode). This paired caption color remains legible on both secondary and selected accent fills, including format descriptions, retention help and save status. The window shell retains the same tokens as history. The existing --sc-muted role continues to serve captions on lighter surfaces elsewhere.

Desktop settings label the choice 明暗模式 and offer system, light and dark, with system as the default for new and existing settings. Rust Settings owns this persisted preference and applies it to the native application; the shared App theme hook resolves system brightness changes and sets data-theme on the document for both history and settings. Both windows consume the same saved snapshot. Explicit light or dark mode stays fixed until the preference changes. Every mode continues following Windows accent, transparency, high contrast and reduced-motion preferences. These system preferences are never persisted as app settings. The marketing website retains its light brand palette.

The native appearance owner subscribes to UISettings ColorValuesChanged and AdvancedEffectsEnabledChanged and AccessibilitySettings HighContrastChanged, dispatches material changes onto the UI loop, and publishes a versioned appearance for each window. New settings windows receive the same current system state; destroying a window discards its material result before its label can be reused. The frontend subscribes before querying and rejects stale responses. Transparency is reported only after native acrylic application succeeds; failures, unsupported systems and high contrast retain solid surfaces. data-transparency enables a 78% panel-color overlay on the acrylic shell, with solid cards, controls and portals. system-palette.ts owns this opacity, passes it through --sc-panel-opacity to CSS, and uses the same value for contrast calculation. Reduced-transparency media preferences also suppress this overlay. Stopping the app revokes all native appearance subscriptions.

Native appearance subscriptions are independent. Windows may allow high-contrast reads while rejecting HighContrastChanged registration; that failure must not discard the current accent, effects or other active subscriptions. ColorValuesChanged refreshes the complete appearance, including the current high-contrast setting.

packages/brand/tokens.css remains the canonical palette source. Its dark selector maps the same semantic roles to background #1d1721, panel #251d2b, card #302637, popover and secondary #3a2d42, foreground #f2eaf6, muted #c4b2cd, primary #d2a4e6 and danger #ffa5b6. Primary and danger controls use their paired foreground tokens so text and selection indicators remain legible in both modes. Desktop icons, empty states and feedback also consume paired theme tokens; changing themes preserves the existing light colors, geometry, flat surfaces and forced-colors behavior. The desktop Tailwind dark variant follows data-theme rather than a separate system preference.

## Language and localization

packages/i18n owns the shared English, Simplified Chinese, Traditional Chinese, Japanese, Korean, German, French, Spanish, Portuguese and Russian catalogs, language matching, native language names and message interpolation. English is the fallback when no preferred language is supported, and for an unavailable translation. Match preferences in order, accept regional variants of supported languages, and honor an explicit Chinese Hans/Hant script before region; Taiwan, Hong Kong and Macao otherwise use Traditional Chinese. Rust Settings owns the persisted language choice: system by default, or one of the ten supported locales. The settings language dropdown shows each language's own name. Manual changes take effect after successful persistence and update history, settings, native window titles and tray labels without restarting. Returning to system restores the Windows locale. The website continues following browser language preferences and languagechange events.

On Windows, src-tauri/src/i18n.rs reads GetUserPreferredUILanguages and combines that system locale with the saved language choice. The system_locale command waits for settings initialization before either desktop window renders. Every versioned clipboard snapshot includes the resolved locale; native.ts applies it only when accepting the snapshot, so late responses cannot revert a newer selection. Native tray labels, window titles, operation feedback, validation and app-owned errors are translated at their source using the same bundled JSON catalogs as React; clipboard content and external diagnostic details remain unchanged. Changing Windows display languages in system mode takes effect after restarting the app. The NSIS installer follows the OS language with English first as its fallback.

The website and its isolated demo resolve the same browser preferences. Document language, page titles, descriptions, accessible names, sample content and feedback follow the active locale. Settings format and retention labels are translated at render time. Preserve the compact shared geometry while allowing long translated labels and confirmation actions to wrap. Japanese uses concise UI labels and polite guidance with the same local clipboard behavior as other locales; this is global language support, with no Japan-specific business rules. No native-language editorial review is claimed.

Language selection parity is enforced by packages/i18n/locale-cases.json in Rust and TypeScript. tests/ui/locale.spec.ts covers every supported locale, native authority over browser language, settings save and validation, website/demo consistency and English fallback. Existing Chinese interaction tests explicitly select zh-CN.

## Typography

The Windows font stack matches the reference. Shared brand font tokens select Microsoft JhengHei UI for Traditional Chinese, Yu Gothic UI for Japanese, and Malgun Gothic for Korean, with local platform fallbacks; the website display face uses the same locale-specific font. Japanese headings retain normal letter spacing and strict line breaking. History text uses 13px type with 1.65 line height. Settings use 13px section headings, 12px labels and 11px supporting copy. Preview text preserves source whitespace and wraps long lines.

## Layout

History and settings use the same WindowFrame in packages/ui/src/window-frame.tsx. It owns the borderless rounded panel and fixed single-row title bar, with the same system appearance, 24px product mark, 14px title, drag region, 25px action buttons and button states. Both windows use the shared 12px --window-padding for content edges and bottom feedback overlays; narrower settings layouts only adapt the form interior. Settings show 设置 and a single close action, without a brand subtitle or separate minimize/maximize controls. Closing settings still waits for the automatic-save queue.

The history window measures 360 by 400 logical pixels. Its single-row title bar contains clear-unpinned (a broom), settings and dismiss actions, in that order. There is no record-count toolbar or footer hint row. The history list owns scrolling and fills the remaining height. All four sides use 12px padding, owned by --history-list-padding in packages/ui/styles.css. The top and bottom padding contain static 3px blur fades; list content reaches zero opacity at both viewport edges and full opacity at the inner edge of the padding. These effects pass pointer events through and are disabled in forced-colors mode. Scroll padding keeps keyboard-focused cards inside the fully visible region. Cards reserve three 13px text lines at 1.65 line height plus 10px vertical padding on each side, with an 8px gap between cards. Image previews preserve aspect ratio. Settings keep the title bar visible while the form owns scrolling and narrow at 420px.

The fixed search field sits between the title bar and history list, uses the shared Input with a card fill, and aligns to the list's horizontal padding. It filters the current list's preview text and content-type labels immediately, ignoring case and surrounding whitespace. IME composition updates the input without filtering unfinished text. A localized clear button restores all items and focuses the input; Arrow Down enters the filtered list. Empty history shows a centered clipboard icon with an accessible name and no visible heading or description. No-results copy is distinct from empty history. Search is transient and resets when the popup opens; clipboard queries are not written to URLs or persistent storage. Clear-unpinned continues to apply to the complete history and states its full count in the confirmation.

Search remains borderless when focused, using the shared hover fill and a stronger search-icon color to indicate focus. It does not use the primary-color input outline; forced-colors mode retains a system Highlight outline for keyboard focus. Other inputs retain the shared Input focus treatment.

All desktop scroll surfaces, including history, settings, feedback and menus, hide native scrollbars while retaining wheel, touchpad and keyboard scrolling. Scrollbar tracks reserve no layout space. The global rule in packages/ui/styles.css owns this behavior.

Settings use a compact single page in the existing 480 by 640 logical-pixel window, with a 400 by 480 minimum. The form owns scrolling between the shared title bar and a persistent automatic-save status footer. Its top and bottom use the same 12px edge fades and 3px blur as history, shared through --scroll-edge-padding and the scroll viewport rules in packages/ui/styles.css. Each viewport clips blur sampling away from fixed controls; effects pass pointer events through and are disabled in forced-colors mode. Form padding and scroll padding keep content and keyboard focus inside the fully visible region. Three white panels group the controls: 使用偏好 contains the shortcut, language and theme; 记录与保存 contains record types, count limit and retention; 自动恢复 contains the restore switch and delay. Panels use 16px padding and 12px gaps, with a maximum content width of 620px. Below 420px, panel padding tightens and format tiles change from three columns to two; 文件与文件夹 spans two columns in both layouts. The title bar and save status remain accessible while the form scrolls.

## Elevation & Depth

All application surfaces are flat: history cards, settings rows, controls, menus, dialogs and feedback have no decorative borders or elevation shadows. Use solid fills and gaps to separate adjacent surfaces; separate groups with space instead of divider lines. Only the outer window shell uses native acrylic when Windows transparency is enabled; it becomes opaque when disabled or unavailable, regardless of the app's brightness choice. Menus and confirmation dialogs use shadcn/ui portals, with contrasting solid fills and a modal backdrop where appropriate. Feedback overlays the popup list without changing its geometry. Focus outlines and forced-colors borders are accessibility treatments. Preserve the existing product-mark artwork.

Native history and settings windows also disable system decorations and window shadows in apps/desktop/src-tauri/src/windows.rs. On Windows, enabling shadows for an undecorated window adds a white outer frame, so the borderless contract requires both options to stay disabled. Both window headings are native drag regions, including their logos, text and remaining space before the action buttons. Heading descendants pass pointer events to the drag region; adjacent buttons retain their own actions. Drag-region permissions are shared by the history and settings windows, including Tauri's internal double-click handler, which respects the fixed size of history. Explicit minimize, maximize/restore and destroy permissions remain limited to settings. Settings controls remain available while settings load or fail to load. Closing waits for pending automatic saves and keeps the window open if a pending save fails.

Windows also clips the native HWND to the same 9 logical-pixel shell radius using SetWindowRgn: CSS clipping cannot constrain the native acrylic behind the WebView. Recompute its physical region on creation, resize and DPI changes. Both windows are shaped before becoming visible. The complete header, its padded top and bottom, the heading row and gaps between actions are drag regions; actual buttons remain interactive.

## Shapes

The popup and cards use 9px corners. Body-level clipping shares the popup radius so portal overlays remain inside the transparent native window's rounded boundary. Standard controls use 7px corners and small controls use 5px corners. Most supporting icons use Lucide with 1.5–1.7px strokes. Hand-drawn actions share components/icons/action-icon.tsx, which owns their 24-unit viewBox, 2.1-unit currentColor outline, round caps and round joins. Rendered size follows the original shared Button SVG rule (size-4, one rem, 13px at the current root font size); action icons do not override that rule with a fixed pixel size. The title bar uses a round, broad-bristled BroomIcon, a softly rounded gear and a round-ended cross from window-action-icons.tsx. The close mark uses an optically heavier 2.6-unit stroke and is shared by the history and settings title bars. Their existing 25px button targets and interactions stay consistent. History pin, copy and delete use puffy SVG shapes in components/icons/clip-action-icons.tsx: a conventional thumbtack with a pillowy cap, short body and soft needle, overlapping pillow-shaped notes with a smile, and a symmetrical round-bellied bin with a level lid. Unselected pin, copy and delete use unfilled outlines. Only the selected pin stays solid, with a transparent highlight. The unpinned tack leans and the pinned tack stands upright, preserving shape and fill cues alongside its active color. The bin, its handle, lid and slots remain upright and centered. Unfilled areas remain transparent in every theme; do not paint opaque backgrounds into these icons.

Record types use hand-drawn content-type-icons.tsx built on the same ActionIcon: a soft text sheet, plump chain links, a rounded rich-text clipboard, a pillowy photo and a smiling folder. These remain editable, transparent SVG paths and render at 22px in settings and the website format list. Confirmation dialogs use the existing hand-drawn broom or bin at 25px inside a 44px rounded semantic tint.

## Components

Shared shadcn/ui Button, Card, DropdownMenu, AlertDialog, Select, Switch, RadioGroup, Checkbox, Label and Input own their respective interactions. History actions use sibling buttons to keep paste, pin, copy and delete targets independent. Pin, copy and delete form a right-hand column aligned to the three text line boxes; pin remains visible, while copy and delete appear on card hover or keyboard focus. Every icon action retains its accessible label. Application and tray tooltips are intentionally absent.

Button uses filled primary and secondary variants or a ghost variant. Input uses a secondary fill. Switch, RadioGroup and Checkbox use solid control fills, with thumb position, an inner dot or a checkmark identifying state as well as color. Settings use the shared Radix-backed RadioGroup card variant for fully exposed choices: three compact icon-and-label theme buttons and three horizontal retention choices with one help line for the current choice. Five format tiles use shared Checkbox and Label so clicking anywhere on a tile toggles it exactly once; all formats may be disabled. Their supporting descriptions remain accessible without adding a second visible line to each tile. Secondary fills distinguish controls within each white panel, with accent fills identifying selection. The existing authored Radix Select owns the language dropdown, including a trigger-width, collision-aware, keyboard-accessible popup. While it is open, the shared SelectContent makes background branches inert and restores their previous state on close, complementing Radix's accessibility hiding and focus containment. Shared brand surface and control tokens in packages/brand/tokens.css map through packages/ui/styles.css into these primitives on both desktop and the website demonstration.

Every enabled action has hover, pressed and visible keyboard-focus states. Busy actions are guarded against duplicate requests. Dialogs trap and restore focus. Settings save valid field changes automatically through the shared serialized settings queue, own numeric validation and error text, and confirm reductions in disk history retention. There is no manual save action or privacy note. A shared Feedback component announces action outcomes.

All confirmations share ui/alert-dialog.tsx and the app-dialog rules in packages/ui/styles.css: a solid card surface, 12px radius, 20px padding, left-aligned 14px title and 12px body, a hand-drawn semantic icon, and two equally sized horizontal actions. The overlay uses a 24% foreground tint and a 3px blur. Dialogs stay within 16px viewport insets and scroll when necessary; long action labels wrap. Radix owns focus containment, safe initial focus and Escape. Cancellation restores the initiating control; a confirmed history deletion returns focus to search. No screen-specific dialog layout overrides are maintained.

The 使用偏好 panel starts with 呼出快捷键: a clickable recorder containing individual keycaps, followed by concise recording/cancellation guidance and inline errors. Escape cancels, Tab cancels and leaves the recorder, and composing IME events do not record shortcuts. The 自动恢复 panel labels the feature 恢复置顶内容 and explains that it restores the first pinned item. Its 恢复延迟 stays editable while the feature is off, allowing preconfiguration; platform capability still governs the switch. Numeric fields include a visible 条 or 秒 suffix and hide native stepper arrows. Global save feedback lives in the fixed footer, distinguishes idle/saving/saved/error states, and never reports success before the queue completes. Field errors remain next to their controls. Retention and count confirmations restore keyboard focus to the initiating field.

The 记录与保存 panel includes 最多保存条数. Rust Settings owns the persisted count limit, which defaults to 20 for new settings and settings without a saved limit; explicit saved values remain intact. 0 removes the count limit and pinned entries do not count toward it. The existing byte budget still applies. Count edits commit on blur or non-composing Enter so intermediate digits cannot prune history. Reducing the limit requires the shared confirmation dialog; saving the setting and pruning disk history happen together, and in-memory history changes only after storage succeeds.

Arrow keys navigate history items, Enter selects and Escape dismisses the popup. Modified keys and IME composition retain their native behavior. Clipboard HTML is stored as data and previewed as plain text. Image previews use bounded PNG thumbnails in a stable 135px frame, preserving aspect ratio through object-fit. One observer per history list requests previews only within the viewport and a 160px margin; leaving that region releases the image object URL, and late responses cannot revive removed previews. Cards progressively use content-visibility with content-derived intrinsic heights; unsupported engines render the full list. All records remain in the DOM for keyboard navigation and assistive technology. Reduced-motion preferences shorten animation and transition durations.

History identity belongs to the Rust payload and history model. It compares complete text without trimming or case folding, decoded image pixels, or ordered file references, independently of companion clipboard formats. Repeated content refreshes the existing entry with the latest payload and recency, preserves its ID and pin order, and follows the usual persistence and clipboard-change/restore processing. Pinned entries keep their pin order; ordinary entries move ahead of older ordinary entries. Reloading old history merges duplicate content while preserving the latest payload/recency and newest pin order. HTML-only and RTF-only content retains its format identity; RTF buffer terminators do not affect equality.

The history entry loads independently of the settings form and its RadioGroup/Checkbox/Switch dependencies. SettingsPanel in packages/ui/src/settings-panel.tsx owns the shared settings form, validation, retention/count confirmations, shortcut recorder UI and save feedback. Its host supplies settings state, a save callback and an optional shortcut recorder adapter; it has no Tauri dependency. apps/desktop/src/SettingsView.tsx owns native shortcut recording and the close-before-save lifecycle. The settings title bar stays available while the form module or settings snapshot loads, and a module failure provides an explicit reload action. Both windows retain the shared serialized settings queue in apps/desktop/src/native.ts.

### Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Window Shell | packages/ui/src/window-frame.tsx and packages/ui/styles.css | Shared desktop shell rules in this document | History actions; settings close action; browser demonstration with inert settings/dismiss callbacks | tests/ui/desktop.spec.ts, settings.spec.ts and website.spec.ts; panel style comparison |
| Select/Listbox | packages/ui/src/ui/select.tsx | Authored dropdown ownership; fixed setting choices use RadioGroup | Language selector with native language names | tests/ui/locale.spec.ts popup sizing, keyboard, failure and persistence checks |
| Single/Multiple Choice | packages/ui/src/ui/radio-group.tsx and ui/checkbox.tsx | Settings groups in this document | Radio card; checkbox tile; native keyboard semantics | tests/ui/settings.spec.ts keyboard, theme and selection checks |
| Form | packages/ui/src/settings-panel.tsx; apps/desktop/src/SettingsView.tsx native adapter and native.ts settings queue | Settings and retention rules in README.md | Automatic save; numeric count commit on blur or Enter | tests/ui/settings.spec.ts save, failure, close and confirmation checks; Rust settings tests |
| Scrollbar | packages/ui/styles.css and apps/website/src/styles.css | Layout rules in this document | Hidden desktop scrollbars; visible website scrollbars | Browser layout and keyboard checks |
| Toast | packages/ui/src/app-controls.tsx Feedback | Shared feedback rules in this document | Error and status; website inline live regions | tests/ui accessibility and command-copy checks |
| Theme | apps/desktop/src/theme.ts and system-palette.ts; src-tauri/src/appearance | Windows owns accent, effects and accessibility; Rust Settings owns brightness choice | Shared system accent and native material in all three brightness modes; brand fallback | tests/ui/theme.spec.ts and system-palette.spec.ts; native compilation |
| Locale | packages/i18n and src-tauri/src/i18n.rs; Rust Settings and versioned snapshots | Persisted manual choice or system language; English fallback; shared catalogs | Immediate desktop selection and browser preference changes | tests/ui/locale.spec.ts and Rust locale fixtures |

## Do's and Don'ts

- Keep the popup compact and preserve the reference card structure.
- Keep action names consistent across the card, menu and settings.
- Use accessible labels for every icon-only action.
- Distinguish regions with solid background colors and spacing; keep normal surfaces borderless and shadowless.
- Preserve visible keyboard focus and system-color boundaries in high-contrast mode.

## Marketing website

The website software demonstration renders HistoryPanel from packages/ui/src/history-panel.tsx, including the same WindowFrame, search, cards, icons, action buttons, confirmation dialogs, feedback and packages/ui/styles.css used by the actual desktop app. Its separate demo.html document isolates product styles and viewport sizing from the marketing page; it does not duplicate product markup or CSS. Desktop history-window.tsx owns native IPC, popup events and thumbnail loading; the browser adapter owns only temporary sample data. Settings and dismiss buttons stay enabled with the shared hover, focus and pressed states, but their demo callbacks perform no action. Keep the reset control outside the product panel. Panel geometry and computed-style parity are checked in tests/ui/website.spec.ts.

The website feels like a small, useful object on a lavender desktop. Its signature is an interactive, faithful clipboard panel paired with a slightly angled note that receives the selected sample. Keep the rest of the page quiet: no stock photos, invented usage statistics, testimonials, or decorative dashboards.

The palette extends the shared plum (#793d91), ink (#261d2a), muted text (#716576) and flat lavender surfaces with a near-white page (#fdfcfe) and a lavender demo stage (#e0d1e9). Color blocks and whitespace replace borders and shadows throughout the website, including its product demonstration, format list and build guide. Website-only color roles live in the root variables in apps/website/src/styles.css; they do not change desktop colors. All visible text, including demo feedback, meets normal-text contrast.

Display type uses Segoe UI Variable Display with Segoe UI and Microsoft YaHei UI fallbacks; body type uses the shared operating-system stack. Commands use Cascadia Code and Consolas. No remote font requests or font-swap layout changes. Desktop headings reach 65px, mobile headings scale down to 36px. Section headings use 26–28px, body copy uses 13–15px, with compact supporting captions. Every meaningful text color, including demo captions, meets normal-text contrast against its actual surface.

The website uses a maximum 1160px content width. The hero places the product statement beside the working demonstration; at 760px it stacks naturally with all controls retained. Keep one short supporting sentence and the acquisition and demo actions. Show the three-step copy/paste sequence as a compact ordered list and five content formats as icons with labels. Pinning and optional restore receive short feature labels rather than a second illustration. Do not add privacy or FAQ sections, repeated slogans, decorative captions, or footer taglines.

Website controls use native buttons and anchors. Pin state is expressed with aria-pressed; demonstration and command-copy results use stable live regions. Demo copy writes only the selected sample text after an explicit click and reports failures through the shared feedback. The copy-command action writes only the displayed build commands after an explicit click, with an inline manual-copy error. Neither demonstration nor website reads the system clipboard. Global scrollbars, visible focus, forced colors, and reduced motion apply to every owned scroll surface. The scrollable build-command block is keyboard-focusable and has an accessible name.

The skip link moves focus to the hero heading without adding a stop to sequential Tab navigation. Coarse-pointer controls have a minimum 44px target. The shared product stylesheet expands the title-bar, search-clear and card action targets together, reserving a taller card and right-hand action column. Desktop history reveals copy and delete actions without hover on touch input. Busy command copying is announced and guards duplicate writes.

Without an actual configured installer URL, acquisition shows an honest local-build guide. VITE_DOWNLOAD_URL supplies a published HTTPS or root-relative download URL. The package:website command builds a deployable static site with a real local NSIS installer included in dist/downloads. No placeholder release URLs or nonfunctional download controls.
