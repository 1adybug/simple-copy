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

The runtime source of design tokens is src/index.css. Root variables feed Tailwind 4 through its theme adapter, then the shared shadcn/ui components. This document mirrors accepted values. Palette and radius changes must update both locations.

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
