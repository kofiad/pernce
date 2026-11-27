---
version: alpha
name: Pernce
description: |
  Pernce is a multi-currency personal finance app for iOS, Android and the
  web. Screens are calm and dense with numbers: a true-black (dark) or
  white (light) canvas, cards one surface step up, Inter throughout with
  tabular figures for money, pill-shaped controls and no drop shadows.
  Emerald is the single brand colour; a set of accent colours identifies
  categories, accounts and chart series, and never fills a button.

colors:
  primary: "#0b7a62"
  primary-bright: "#14a37f"
  primary-deep: "#085c4a"
  on-primary: "#ffffff"
  ink: "#161b1a"
  body: "#1d2422"
  charcoal: "#363e3c"
  mute: "#4e5957"
  ash: "#5b6563"
  stone: "#8b9694"
  faint: "#c7cecc"
  on-dark: "#ffffff"
  on-dark-mute: "rgba(255,255,255,0.72)"
  canvas-light: "#ffffff"
  canvas-dark: "#000000"
  surface-soft: "#f2f5f4"
  surface-card: "#ffffff"
  surface-deep: "#0a0c0c"
  surface-elevated: "#151a19"
  surface-tint: "rgba(255,255,255,0.08)"
  hairline-light: "#dde3e1"
  hairline-dark: "rgba(255,255,255,0.12)"
  hairline-strong: "#161b1a"
  divider-soft: "rgba(255,255,255,0.06)"
  accent-teal: "#0e8f8a"
  accent-cyan: "#0f7f9c"
  accent-light-blue: "#2b7fd4"
  accent-blue-link: "#2a63c7"
  accent-steel: "#3f5f8f"
  accent-slate: "#5e6a7e"
  accent-violet: "#7046cc"
  accent-plum: "#96399f"
  accent-magenta: "#b8378a"
  accent-pink: "#d6325f"
  accent-danger: "#d63a3a"
  accent-deep-red: "#8f1b22"
  accent-coral: "#c9562a"
  accent-warning: "#df7a06"
  accent-yellow: "#a68700"
  accent-lime: "#739a10"
  accent-light-green: "#3f8c2c"
  accent-green-text: "#22661b"
  accent-brown: "#8c6656"
  link: "#2a63c7"

typography:
  display-xl:
    fontFamily: Inter
    fontSize: 80px
    fontWeight: 500
    lineHeight: 1.0
    letterSpacing: -0.8px
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: 500
    lineHeight: 1.21
    letterSpacing: -0.48px
  display-md:
    fontFamily: Inter
    fontSize: 40px
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: -0.4px
  heading-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: 500
    lineHeight: 1.19
    letterSpacing: -0.32px
  heading-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: 500
    lineHeight: 1.33
    letterSpacing: 0
  heading-sm:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0
  nav-title:
    fontFamily: Inter
    fontSize: 17px
    fontWeight: 600
    lineHeight: 1.41
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.56
    letterSpacing: -0.09px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0.24px
  body-md-bold:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: 0.16px
  row:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.47
  row-title:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: 500
    lineHeight: 1.47
  amount:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: 600
    lineHeight: 1.47
    fontVariant: tabular-nums
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.43
  caption:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.4
  field-label:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.4
  group-label:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1.42
    letterSpacing: 0.4px
  button-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: 0.24px
  button-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.43
  mono:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: 500

rounded:
  sm: 8px
  md: 12px
  lg: 20px
  xl: 28px
  full: 9999px

spacing:
  xxs: 4px
  xs: 6px
  sm: 8px
  md: 14px
  lg: 16px
  gutter: 20px
  xl: 24px
  xxl: 32px
  xxxl: 48px
  block: 80px

components:
  button-primary:
    backgroundColor: "--btn: {colors.canvas-light} dark, {colors.canvas-dark} light"
    textColor: "--btn-t: {colors.canvas-dark} dark, {colors.canvas-light} light"
    typography: "{typography.button-md}"
    rounded: "{rounded.full}"
    padding: 0 28px
    height: 48px
  button-brand:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-md}"
    rounded: "{rounded.full}"
    height: 48px
  button-outline:
    backgroundColor: transparent
    textColor: "--text"
    border: "1px --out"
    typography: "{typography.button-md}"
    rounded: "{rounded.full}"
    height: 48px
  button-soft:
    backgroundColor: "--soft"
    textColor: "--soft-t"
    typography: "{typography.button-md}"
    rounded: "{rounded.full}"
    height: 48px
  button-danger:
    backgroundColor: transparent
    textColor: "--neg-t"
    border: "1px --hair"
    typography: "{typography.button-md}"
    rounded: "{rounded.full}"
    height: 48px
  button-sm:
    typography: "{typography.button-sm}"
    rounded: "{rounded.full}"
    padding: 0 16px
    height: 36px
  chip:
    backgroundColor: "--chip"
    textColor: "--chip-t"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: 0 16px
    height: 36px
  chip-selected:
    backgroundColor: "--chip-on"
    textColor: "--chip-on-t"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    height: 36px
  segmented:
    backgroundColor: "--chip"
    rounded: "{rounded.full}"
    padding: 4px
    itemHeight: 40px
  text-input:
    backgroundColor: "--field"
    textColor: "--text"
    border: "1px --field-b"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: 0 16px
    height: 56px
  card:
    backgroundColor: "--card"
    border: "1px --card-b"
    rounded: "{rounded.lg}"
    padding: 20px
  group:
    backgroundColor: "--card"
    border: "1px --card-b"
    rounded: "{rounded.lg}"
    padding: 0 16px
    rowHeight: 56px
  inset-card:
    backgroundColor: "--inset"
    rounded: "{rounded.lg}"
    padding: 20px
  badge:
    backgroundColor: "--chip"
    textColor: "--text"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: 4px 12px
  badge-brand:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: 4px 12px
  avatar:
    backgroundColor: "an accent token or a custom #rrggbb"
    textColor: "#ffffff"
    rounded: "{rounded.full}"
  toggle:
    width: 51px
    height: 31px
    rounded: "{rounded.full}"
    on: "--text"
    off: "--track"
  tab-dock:
    backgroundColor: "--card"
    textColor: "--stone"
    activeTextColor: "--text"
    activeIndicator: "--brand at 18%"
    typography: 11px / 14px, weight 600
    rounded: "{rounded.full}"
    height: 64px
    inset: 12px sides; bottom 30px on iOS, the navigation-bar inset + 12px on Android
  nav-rail:
    width: 72px
    backgroundColor: "--bg, 1px --hair right border"
    items: the tab-dock tabs, stacked 16px apart
    addButton: 48px {colors.primary} circle
  side-nav:
    width: 240px
    backgroundColor: "--bg, 1px --hair right border"
    item: 44px tall, {rounded.full}, 15px / 600
    activeIndicator: "--brand at 18%"
  dialog:
    backgroundColor: "--sheet, 1px --hair border"
    rounded: "{rounded.lg}"
    width: 560px for forms, 440px for choices
    backdrop: "rgba(0,0,0,0.5)"
  add-popover:
    backgroundColor: "--sheet, 1px --hair border"
    rounded: "{rounded.lg}"
    width: 320px
---

## Overview

Pernce tracks money that lives in more than one place and more than one
currency. The interface stays out of the way of the numbers:

- **Two modes, one drawing.** Every screen is designed once against
  semantic roles (`--bg`, `--card`, `--text`, …) and the system appearance,
  or Settings → Appearance, swaps their values. Dark is a true-black canvas
  (`{colors.canvas-dark}`); light is white (`{colors.canvas-light}`).
- **Depth from surface steps, not shadows.** Canvas → card → inset. Cards
  sit one step off the canvas (`{colors.surface-elevated}` in dark, white
  with a `{colors.hairline-light}` border in light).
- **One brand colour.** Emerald (`{colors.primary}`) marks the add actions,
  the logo, the active tab, brand badges and the primary chart series.
  It's never a theme wash.
- **Accents identify things.** Categories, accounts and chart series each
  carry an accent colour (white icon on a coloured circle). Accents never
  fill buttons.
- **Inter everywhere**, with tabular figures for every amount, and
  JetBrains Mono only for keys and hex values.
- **Pills and round corners.** Buttons, chips and the tab dock are pills
  (`{rounded.full}`); cards are `{rounded.lg}` (20px); inputs are
  `{rounded.md}` (12px).

`pernce-artboard.html` draws every screen in both modes (M = mobile frames,
W = wide web frames). This document holds the tokens and rules; the
artboard shows them applied. When code and these two disagree, these win.

## Colors

### Brand
- **Primary** (`{colors.primary}` — `#0b7a62`): emerald. The add button and other add actions (`button-brand`), the logo tile and app icon, `badge-brand`, the primary chart series, and the Travel category. White on it is 5.3:1.
- **Primary Bright** (`{colors.primary-bright}` — `#14a37f`): the brand stamp in dark mode (`--brand`: active tab icon, focus ring, selected-row tint), where plain primary would be too dim on black (6.6:1 on black).
- **Primary Deep** (`{colors.primary-deep}` — `#085c4a`): pressed state of brand-filled elements.
- **On-Primary** (`{colors.on-primary}` — `#ffffff`): text and icons on primary.

### Neutrals
A slightly green-tinted grey ramp, so neutrals sit comfortably next to the brand.

| Token | Value | Use |
|---|---|---|
| `{colors.canvas-dark}` | `#000000` | Dark canvas and sheets. True black. |
| `{colors.surface-elevated}` | `#151a19` | Dark cards, fields, the tab dock. |
| `{colors.surface-deep}` | `#0a0c0c` | Dark inset areas. |
| `{colors.surface-tint}` | `rgba(255,255,255,0.08)` | Dark chips, soft buttons, badges. A white wash, so it reads on the canvas and on a card alike. |
| `{colors.on-dark}` | `#ffffff` | Dark-mode text. |
| `{colors.on-dark-mute}` | `rgba(255,255,255,0.72)` | Dark-mode secondary text. |
| `{colors.hairline-dark}` | `rgba(255,255,255,0.12)` | Dark borders. |
| `{colors.divider-soft}` | `rgba(255,255,255,0.06)` | Dark dividers; the dark hover tint. |
| `{colors.canvas-light}` / `{colors.surface-card}` | `#ffffff` | Light canvas and cards. |
| `{colors.surface-soft}` | `#f2f5f4` | Light chips, soft buttons, inset areas. |
| `{colors.hairline-light}` | `#dde3e1` | Light card borders and dividers. |
| `{colors.ink}` / `{colors.hairline-strong}` | `#161b1a` | Light-mode text; selected chips in light mode. |
| `{colors.body}` | `#1d2422` | Long-form text in light mode. |
| `{colors.charcoal}` | `#363e3c` | Muted chart bars (dark). |
| `{colors.mute}` | `#4e5957` | Light-mode secondary text (7.3:1 on white). |
| `{colors.ash}` | `#5b6563` | Light-mode metadata. |
| `{colors.stone}` | `#8b9694` | Dark-mode metadata, placeholders, inactive tabs. |
| `{colors.faint}` | `#c7cecc` | Disabled foreground; muted chart bars (light). |

### Accents
Accents are stored by token name on categories, accounts and budgets, so
**names never change**; values may. Every accent keeps at least 3:1 with a
white icon (the avatar rule) and stays visible on the dark canvas.

| Token | Value | Default use |
|---|---|---|
| `{colors.accent-teal}` | `#0e8f8a` | Utilities, Business & Sales |
| `{colors.accent-cyan}` | `#0f7f9c` | Phone & Internet, Freelance |
| `{colors.accent-light-blue}` | `#2b7fd4` | Transport |
| `{colors.accent-blue-link}` / `{colors.link}` | `#2a63c7` | Insurance; links in light mode |
| `{colors.accent-steel}` | `#3f5f8f` | Rent & Mortgage, Interest & Dividends |
| `{colors.accent-slate}` | `#5e6a7e` | Vehicle Maintenance, Pension, transfers |
| `{colors.accent-violet}` | `#7046cc` | Childcare & Education, Remittances |
| `{colors.accent-plum}` | `#96399f` | Family Support |
| `{colors.accent-magenta}` | `#b8378a` | Subscriptions |
| `{colors.accent-pink}` | `#d6325f` | Shopping |
| `{colors.accent-danger}` | `#d63a3a` | Negative amounts (dots, fills), over budget, errors; Gifts & Donations |
| `{colors.accent-deep-red}` | `#8f1b22` | Negative text in light mode; Debt Repayment |
| `{colors.accent-coral}` | `#c9562a` | Personal Care |
| `{colors.accent-warning}` | `#df7a06` | Warnings, near budget; Dining Out |
| `{colors.accent-yellow}` | `#a68700` | Entertainment, Bonuses |
| `{colors.accent-lime}` | `#739a10` | Groceries |
| `{colors.accent-light-green}` | `#3f8c2c` | Positive amounts (dots, fills); Salary, Sports & Fitness |
| `{colors.accent-green-text}` | `#22661b` | Positive text in light mode |
| `{colors.accent-brown}` | `#8c6656` | Health & Medical, Rental Income |

The colour picker's presets are, in order: yellow, light-blue, pink, teal,
warning, primary, brown, violet. Custom colours are stored as `#rrggbb` and
look the same in both modes.

### Mode mapping
Every screen is drawn against these roles (CSS variables in the artboard,
keys of `mobile/src/lib/theme.ts`):

| Role | Variable | Dark | Light |
|---|---|---|---|
| Canvas | `--bg` | `canvas-dark` | `canvas-light` |
| Alert box | `--bg-2` | `surface-elevated` | `surface-soft` |
| Card | `--card` / `--card-b` | `surface-elevated`, no border | white + `hairline-light` |
| Inset | `--inset` | `surface-deep` | `surface-soft` |
| Text | `--text` | `on-dark` | `ink` |
| Secondary text | `--mute` | `on-dark-mute` | `mute` |
| Metadata | `--stone` | `stone` | `ash` |
| Divider | `--divider` | `divider-soft` | `hairline-light` |
| Border | `--hair` | `hairline-dark` | `hairline-light` |
| Primary button | `--btn` / `--btn-t` | white / black | black / white |
| Outline | `--out` | `on-dark` | `ink` |
| Chip, soft button | `--chip`, `--soft` | `surface-tint` | `surface-soft` |
| Chip selected | `--chip-on` / `--chip-on-t` | white / `ink` | `ink` / white |
| Input | `--field` / `--field-b` | `surface-elevated` / `hairline-dark` | white / `hairline-light` |
| Placeholder | `--ph` | `stone` | `stone` |
| Positive | `--pos` / `--pos-t` | `accent-light-green` / `#5fb04a` | `accent-light-green` / `accent-green-text` |
| Negative | `--neg` / `--neg-t` | `accent-danger` / `#ff6f6f` | `accent-danger` / `accent-deep-red` |
| Link | `--link` | `#5c9df0` | `accent-blue-link` |
| Brand stamp | `--brand` | `primary-bright` | `primary` |
| Sheet | `--sheet` | `canvas-dark` | white |
| Chart grid | `--grid` | `rgba(255,255,255,.08)` | `hairline-light` |
| Muted bar | `--muted-bar` | `charcoal` | `faint` |
| Hover (web) | `--hover` | `rgba(255,255,255,.06)` | `rgba(0,0,0,.04)` |

The dark-mode `--pos-t`, `--neg-t` and `--link` values are lifted versions
of their accents so text clears 4.5:1 on black (7.5:1 or more).

## Typography

**Inter** for everything (`@expo-google-fonts/inter`, weights 400, 500,
600, 700), **JetBrains Mono** 500 for keys and hex values. Both are under
the SIL Open Font License.

| Token | Size / line | Weight | Tracking | Use |
|---|---|---|---|---|
| `{typography.display-xl}` | 80 / 1.0 | 500 | −0.8px | Web onboarding headline (W14). |
| `{typography.display-lg}` | 48 / 1.21 | 500 | −0.48px | Net worth on Home; the phone onboarding headline. |
| `{typography.display-md}` | 40 / 1.2 | 500 | −0.4px | Amount entry, account and budget balances. |
| `{typography.heading-lg}` | 32 / 1.19 | 500 | −0.32px | Page titles (Home, account and budget pages, onboarding). |
| `{typography.heading-md}` | 24 / 1.33 | 500 | 0 | Tab titles; sheet and dialog titles. |
| `{typography.heading-sm}` | 20 / 1.4 | 500 | 0 | Card and section titles. |
| `{typography.nav-title}` | 17 / 1.41 | 600 | 0 | Stack screen headers. |
| `{typography.body-lg}` | 18 / 1.56 | 400 | −0.09px | Onboarding copy. |
| `{typography.body-md}` | 16 / 1.5 | 400 | 0.24px | Default body; input text. |
| `{typography.body-md-bold}` | 16 / 1.5 | 600 | 0.16px | Emphasis. |
| `{typography.row-title}` | 15 / 1.47 | 500 | 0 | Transaction row title. |
| `{typography.row}` | 15 / 1.47 | 400 | 0 | List and settings rows. |
| `{typography.amount}` | 15 / 1.47 | 600 | 0 | Row amounts (tabular). |
| `{typography.body-sm}` | 14 / 1.43 | 400 | 0 | Secondary lines. |
| `{typography.label}` | 14 / 1.43 | 600 | 0 | Chips, segmented control. |
| `{typography.caption}` | 13 / 1.4 | 400 | 0 | Metadata, badges, help text. |
| `{typography.field-label}` | 13 / 1.4 | 600 | 0 | Labels above inputs. |
| `{typography.group-label}` | 12 / 1.42 | 600 | 0.4px | Grouped-list headers. |
| `{typography.button-md}` | 16 / 1.5 | 600 | 0.24px | Button labels. |
| `{typography.button-sm}` | 14 / 1.43 | 600 | 0 | Small button labels. |

### Principles
- Every amount uses tabular figures (`fontVariant: tabular-nums`, `.num` in the artboard) so columns of money line up.
- Display sizes and headings are weight 500 with negative tracking that grows with size. Body is 400 or 600, never 500, except `row-title`.
- React Native needs one font family per weight (`FONT` in `mobile/src/lib/theme.ts`); don't set `fontWeight` on Inter.
- Amounts in another currency show their converted value underneath in `--stone` ("≈ $47.58").

## Layout

- **Spacing scale**: 4 · 6 · 8 · 14 · 16 · 20 · 24 · 32 · 48 · 80 (`{spacing.xxs}` … `{spacing.block}`).
- **Gutter**: 20px side padding on phone screens (`GUTTER`).
- **Cards**: 20px padding; grouped lists use 16px sides and 56px rows; transaction rows are at least 64px.
- **Fields**: 20px between stacked fields; the label sits above in `{typography.field-label}`.
- **Touch targets**: at least 44px at every width.

## Elevation & Depth

| Level | Dark | Light | Use |
|---|---|---|---|
| Canvas | `canvas-dark` | `canvas-light` | Screens, sheets. |
| Card | `surface-elevated` | white + `hairline-light` border | Cards, grouped lists, the tab dock. |
| Inset | `surface-deep` | `surface-soft` | Notes and sunken areas inside a page. |
| Dialog | `--sheet` + 1px `--hair` over a 50% black dim | same | Wide-screen modals. |

There are **no drop shadows**. Depth comes from surface steps and borders.

## Shapes

| Token | Value | Use |
|---|---|---|
| `{rounded.sm}` | 8px | Small tags. |
| `{rounded.md}` | 12px | Inputs. |
| `{rounded.lg}` | 20px | Cards, grouped lists, dialogs, sheet top corners. |
| `{rounded.xl}` | 28px | Large containers. |
| `{rounded.full}` | 9999px | Buttons, chips, badges, avatars, the tab dock, toggles. |

### App Icon & Favicon
- Source of truth: `docs/design/icons/` — `pernce-icon.svg` (full-bleed: iOS, Expo, the web's apple-touch and PWA icons), `pernce-favicon.svg` (rounded corners: the web favicon), `pernce-icon-foreground.svg` (transparent, mark scaled to 0.78 for the Android adaptive safe zone; also the monochrome layer).
- The mark is a geometric white "P" on `{colors.primary}`: stem and bowl share one stroke weight (116/1024), and the bowl's counter reads as a coin. A second coin at 40% white sits behind the bowl, separated by a gap in the brand colour, to signal more than one currency.
- In the UI (onboarding, the lock screen, the sidebar and rail) the logo is the same mark, drawn in code from `pernce-favicon.svg` (`BrandMark` in `mobile/src/components/ui/display.tsx`): 32px beside the wordmark, 48px on onboarding, 64px on the lock screen. Never a lettered tile.
- The second coin fades to a smudge at 16px; that's acceptable — the P carries the icon at small sizes. Don't add detail beyond it.
- Re-export the PNGs (`mobile/assets/icon.png`, `android-icon-background.png`, `favicon.png`, and `mobile/public/apple-touch-icon.png`, `icon-192.png`, `icon-512.png`) from these SVGs whenever they change; never edit the PNGs directly. The adaptive foreground and monochrome PNGs are colourless and only change with the mark. The `backgroundColor` in `mobile/app.json` and `theme_color` in `mobile/public/manifest.webmanifest` follow `{colors.primary}`.

## Components

### Buttons
All buttons are 48px pills with 28px sides (`button-sm`: 36px, 16px sides), an optional 8px-gapped leading icon, and full width on phones unless they sit in a row.

- **`button-primary`**: the default action. White on black in dark mode, black on white in light mode — the highest-contrast thing on screen.
- **`button-brand`**: emerald fill, white label. Add actions only: the sidebar's Add pill and the small plus icon buttons on Accounts, Budgets and Categories.
- **`button-outline`**: transparent with a 1px `--out` border. Secondary actions next to a primary.
- **`button-soft`**: `--soft` fill. Tertiary actions and icon buttons (36px circles, 18px glyph).
- **`button-danger`**: transparent, `--neg-t` label, 1px `--hair` border. Destructive actions, always last in a group.
- Text buttons (`variant="text"`) for low-weight actions in headers.

### Selection
- **`chip`** / **`chip-selected`**: 36px pills for filters and choices; selected chips invert (`--chip-on`). Horizontal chip rows scroll on phones and wrap on wide screens.
- **`segmented`**: a `--chip` pill holding equal 40px pill items; the selected item takes `--chip-on`. Used for Expense / Income / Transfer and Budgets / Trends.
- **`toggle`**: 51 × 31 pill; `--text` when on, `--track` when off.

### Inputs & Forms

**`text-input`** — 56px, `{rounded.md}`, `--field` with a 1px `--field-b` border. Focused: the border turns `--text` with a 1px ring of the same colour. Error: the border turns `--neg` and the help text below is in `--neg-t`.

**`colour-row`** — the colour choice (accounts, categories, budgets, profile)
- 36px swatches, 12px apart; the selected one is ringed (2px canvas gap, 2px `--text`). Up to eight token presets, then the custom swatch: a hue ring around a plus that opens `colour-wheel`. Once a custom colour is picked it fills that last swatch.
- Presets are stored as their token name (`accent-teal`); custom colours as `#rrggbb`. A custom colour is the same in both modes.

**`colour-wheel`** — custom colour sheet (artboard M22a)
- A 248px wheel (hue by angle, saturation by distance from the centre), a 28px brightness slider under it, and a monospace hex field. Knobs are 28px, with a 3px white border.
- The preview is the real avatar (white icon on the colour). If white has less than 3:1 contrast on the colour, a caption under the preview says so; the colour can still be used.

**`icon-row`** / **`icon-pack`** — the icon choice (artboard M22b)
- `icon-row`: a six-column grid of 44px soft plates (selected in `--chip-on`), eleven suggestions and a last, dashed "More" plate with a search icon. Accounts and the profile have an extra first plate with their initials, which is the default.
- `icon-pack`: a sheet with a search field (matches names and keywords), group chips, and the same six-column grid over the whole Lucide set. Picking closes the sheet.
- Pack icons are stored as `lucide:<name>`; built-in ones keep their bare names (`food`, `bag`). Every icon is drawn at the artboard's `.i` stroke widths, so pack and built-in icons look like one set.

### Cards, lists & status
- **`card`**: `--card`, 20px padding, `{rounded.lg}`; in light mode a 1px `hairline-light` border.
- **`group`**: grouped list (Settings and similar): a card with 16px sides and 56px rows separated by `--divider`. A `group-label` sits above it. Destructive rows go last.
- **`inset-card`**: `--inset`, used for notes and empty states inside a page.
- **`avatar`**: a circle in an accent (or custom colour) holding a white icon or initials. Categories, accounts and the profile all use it.
- **`badge`** / **`badge-brand`**: 13px caption pills; brand badges mark something new.
- **Progress**: 8px pill track (`--track`); the fill is `--pos` under budget, `--warning` near the limit and `--neg` over it.
- **`sync-banner`** (artboard M05a, M05b): sync has stopped on this device. A `card` with 16px padding at the top of Home, under the header, 24px above the net worth (on wide pages, the top of the page column, full width). One row, 12px gaps: a 36px soft icon plate with the `alert` glyph in `--warning` (the icon only: `--warning` is under 4.5:1 as text on light), a 15px / 600 title over a caption in `--mute`, and a small primary pill on the right. The whole card opens Sync. Shown while signed out ("Sync stopped" / "Sign in again to keep this device up to date." / "Sign in"), while the data key needs the recovery key ("Sync stopped" / "Unlock your synced data to keep this device up to date." / "Unlock"), and once syncs have failed for more than a day ("Sync isn't working" / "Last synced <date>. Changes stay on this phone." / "Details"). Never dismissible; it goes as soon as sync works.

### Navigation

**`tab-dock`** — app tab bar (mobile app)
- A floating row, not a full-width bar: 12px from each side, 30px above the bottom edge on iOS (clears the home indicator). On Android it sits 12px above the system navigation bar, whatever its height: about 24px of gesture handle, or 48px of Back / Home / Recents buttons, which must never be covered. Scrolling content clears the dock by the same amount. No drop shadow, no top hairline across the screen.
- Left: a 64px-tall capsule (`rounded: {rounded.full}`) on the card surface (`--card`: `{colors.surface-elevated}` dark, white light) with a 1px `--hair` border, holding four equal tabs: Home, Accounts, Activity, Insights. Each is an icon (20px) over a label (11px / 14px, weight 600); the icon sits in a 52×30 indicator pill.
- Inactive: icon and label in `--stone`. Active: label in `--text`, icon in `--brand`, indicator filled with `--brand` at 18%.
- Right, 8px gap: the add button, a 64px `{colors.primary}` circle with a 28px plus, opening the add menu (`add-menu`). It is on every tab and replaces the old floating FAB.
- Four tabs is the cap. Budgets and analytics live together under Insights, switched by a segmented control (Budgets / Trends) at the top of that screen.
- Every tab's header ends in a gear (36px soft icon button, 18px glyph) that opens Settings; it is the right-most action. Home has no gear: its profile avatar opens Settings. From 768px the rail or sidebar carries Settings, so the gear is dropped.

**`add-menu`** — what the add button opens (mobile app, artboard M14)
- A short choice sheet (`--sheet`, `{rounded.lg}` top corners, grab and close) over the current tab, titled "Add".
- A 3-column grid of 56px soft plates over 13px / 600 labels: Expense (icon in `--neg-t`), Income (icon in `--pos-t`), Transfer on the first row; Account, Budget, Category on the second.
- Each plate goes straight to its own form, already on that type. There is no intermediate quick-entry screen and no on-screen keypad: amount fields use the system number pad.
- The app-icon long-press shortcuts mirror the first row (Expense, Income, Transfer).

**`nav-rail`**: app navigation from 768 to 1023px wide (web, artboard W01a)
- A 72px column on the left edge, with a 1px `--hair` border on its right. From the top: the logo mark, the add button (a 48px `{colors.primary}` circle that opens `add-popover`), then the dock's four tabs stacked 16px apart, drawn exactly as in `tab-dock` (icon in a 52×30 indicator over an 11px label). The profile avatar sits at the bottom and opens Settings. On Settings and the pages under it, it's ringed in `--brand`.

**`side-nav`**: app navigation from 1024px wide (web, artboard W01)
- A 240px column: the logo and wordmark, then a full-width `{colors.primary}` "Add" pill (opens `add-popover`), then the four tabs as 44px rows (20px icon, 15px / 600 label).
- Inactive rows are in `--stone`. The active row takes the dock's active treatment, stretched to a full-row pill: `--brand` at 18%, the icon in `--brand`, the label in `--text`.
- At the bottom, a 56px profile row (avatar, name, "Settings", gear) opens Settings, and takes the same active fill while Settings or a page under it is open.

**`dialog`**: sheets on wide screens (web from 768, artboard W09–W11, W13)
- Every modal route (transaction, account, budget and category forms, the sync account flow) and every `ChoiceSheet` opens centred over a 50% black dim instead of sliding up. Forms are 560 wide and choices 440, at most 88% of the window's height.
- Surface `--sheet` with a 1px `--hair` border, `{rounded.lg}` on all corners. The header has the title in `{typography.heading-md}` and the close button. The body scrolls.
- The footer has a `--divider` line on top. Actions are auto-width pills on the right, primary last ("Cancel", then "Save"). A destructive action ("Delete") sits alone on the left, in place of Cancel (the close button still cancels).
- Esc, the close button or a click on the dim closes it. Focus moves into the dialog, stays there, and returns afterwards to whatever opened it. A choice opened from a form stacks on top with its own dim, and picking closes only the choice.

**`add-popover`**: the add menu on wide screens (artboard W02)
- `add-menu`'s six plates in a 320 card (`--sheet`, 1px `--hair`, `{rounded.lg}`) anchored under the sidebar's Add button, or beside the rail's. No title and no dim. Esc or a click outside closes it. Opened from the keyboard, focus starts on Expense, and the arrow keys move between plates.

### Charts

**Trend** — line chart for change over time (Money in vs out, Net worth)
- Gridlines on round values (`--grid`), labelled short ($1k) in a 40px right gutter so labels never cover data; day or month labels underneath.
- One series: a 2.5px `{colors.primary}` line with a fading fill and a dot on the latest point. Several series: 2px lines and a legend with line keys. The axis starts at 0 unless the chart is `fit` (net worth).
- Press and drag (or hover on the web) shows the readout (M10a): it snaps to the nearest point, floats above the plot and lists every series there plus Net.

**`donut`** — spending by category (M10, M10b)
- A ring with 2px gaps between slices, starting at 12 o'clock and running clockwise, beside its legend. Six slices at most; the rest share one (Other).
- Tapping a slice or its legend row picks it: the other slices dim to 30% and their rows to 40%, the picked row turns semibold, and the hole shows the category (`{typography.caption}`, muted), its amount in the base currency (bold, tabular) and its share with a **View** link. A selection haptic ticks on each pick.
- Tapping the hole opens that category's spending in Activity (M07b), for the same period. Tapping the picked slice or row again, or anywhere else on the card, lets it go. Other and Uncategorized have no View.
- On the web, pointing picks with no click, and leaving the donut and legend lets go (W06a). A click on a slice, row or the hole opens its spending. With keyboard focus, the arrow keys step through the slices, Enter opens the picked one, and Esc lets go.

## Do's and Don'ts

### Do
- Draw against the semantic roles (`--card`, `--text`, `--brand`…), never raw hex, so both modes come for free.
- Keep emerald for the brand stamp: add actions, the logo, the active tab, brand badges, the primary chart series.
- Use accents to identify categories, accounts and series, always as a white icon on the colour or as a chart mark.
- Show every amount in tabular figures, with the converted base-currency value beneath foreign amounts.
- Use `--pos-t` / `--neg-t` for coloured amounts; the plain accents fail AA as text on black.
- Keep buttons, chips and badges as pills, cards at 20px and inputs at 12px.

### Don't
- Don't fill buttons with accent colours, or use emerald as a background wash.
- Don't add drop shadows; use a surface step or a border.
- Don't rename colour tokens: users' data stores them. Change values instead, and keep the 3:1 white-icon rule.
- Don't set Inter body text in weight 500.
- Don't use a near-black canvas in dark mode. It's `#000000`; cards carry the lift.
- Don't use `Alert.alert` for messages; use `showAlert()` so they also show on the web.

## Responsive Behavior

Native phones always use the phone layout. The breakpoints below apply only to the web app, by window width.

### Breakpoints

| Name | Width | Navigation | Pages |
|---|---|---|---|
| Compact | < 768px | `tab-dock` | The mobile frames (M01–M32), full width. Sheets and the add menu slide up as on the phone. |
| Medium | 768–1023px | `nav-rail` | Wide pages, padded 32. Sheets become `dialog`s and the add menu an `add-popover`. |
| Expanded | ≥ 1024px | `side-nav` | Wide pages, padded 48, at most 1200 wide, starting at the left. |

### Page types
- **Tab pages** (Home, Accounts, Activity, Insights): wide pages laid out on grids. Two-column rows (`main 1.6fr + side 1fr`) need at least 880 of content width; below that they stack. Card grids run four across for account cards and three across for budgets and KPIs, at most, and drop to two across under 880.
- **Detail pages** (account, budget): the list on the left and a 360 summary column on the right, stacking under 880. A crumb back to the parent tab replaces the back button, and the actions move into the header as auto-width pills.
- **Settings-style pages** (Settings, Categories, Exchange rates, Your data, Sync): centred, at most 720 wide, with the phone's grouped lists. Settings has no back control, because the profile in the nav opens it. The pages under it have a crumb back.
- **First run** (onboarding): from 1024, the headline sits on an `--inset` band beside a 400-wide form (W14). Below 1024, M01 is centred at 480.

### What changes on wide pages
- Horizontal rails (chips, category rails, the accounts rail on Home) wrap or become grids, because a mouse can't swipe them.
- Activity becomes a table (description, category, account, converted, amount) at Expanded. At Medium it keeps M07's rows.
- Activity's search field stays open beside the title.
- Trend charts show their readout (M10a) on hover. It follows the pointer, needs no press, and hides when the pointer leaves the plot. The arrow keys step through a focused chart's points.
- The spending donut picks a slice on hover (W06a) and opens its spending on click; see `donut`.

### Landing page (pernce.com/)
- The public site (S01 desktop, S02 phone, on the artboard's Site page). It lives at `pernce.com/`; the store web app moves to `pernce.com/app`, and every "Open the app" goes there.
- A marketing page, not an app page: content is 1200 wide and **centred** (app pages start at the left), with 120 between sections (72 under 768) and the 20 gutter on phones. Same tokens, both modes, no shadows.
- One primary action everywhere: "Open the app" (`btn` primary). "View on GitHub" is the outline secondary. No pricing, testimonials, sign-up forms or analytics.
- Store badges are outlined pills with a generic phone icon and "Coming soon". No Apple or Google marks until there are store listings.
- The logo is the brand mark (`icons/pernce-favicon.svg`), as everywhere else.
- The landing page has its own frames: S01 (desktop), S01a (features in another state) and S02 (phone).
- The hero shot is two whole phones in device bezels on an `--inset` stage: M05 in dark in front, with M09 in light peeking out behind it. Each phone keeps its theme in either page mode, so the page always shows both. Don't crop text mid-word at the stage edges.
- Features follow a GitHub-style tabs + accordion pattern. Pill tabs (`chip` at 44 high) pick an area: Accounts, Net worth, Budgets, Insights. Below them, an `--inset` panel holds an accordion on the left with one item open, marked by a 2px `--brand` bar, with its text and a link. Closed items sit on a `--hair` bar. On the right is the tab's visual, built from live components on a `--card`, not screenshots. Three plain points follow the panel. On the shipped page every figure in the visuals comes from the demo backup (`docs/demo/`), the same data as the hero screenshots, so the page never shows two different net worths. The artboard keeps its own sample data. The Insights legend isn't dimmed (dimmed rows fail 4.5:1); the selected slice is shown by the donut and the bold row. Accordion titles are 44px tap targets. On phones the tabs become a swipeable chip row and the visual sits under the accordion.
- Copy must stay true to the build: offline, no account, Apache-2.0, 150+ currencies, English and French. Sync is described only as coming and end-to-end encrypted.

### Pointer and keyboard (web)
- **Hover**: filled buttons, the add button and plates fade to 88%. Rows, sidebar items, chips and soft or outline buttons take `--hover` (`rgba(255,255,255,.06)` dark, `rgba(0,0,0,.04)` light), a tint laid over the element's own fill so it shows on every surface. Anything clickable shows the pointer cursor.
- **Focus**: keyboard focus (`:focus-visible` only, never on click) draws a 2px `--brand` ring, 2px outside the element's own shape. Inputs keep their existing focused border.
- **Keys**: Esc closes the top dialog or popover. Tab order follows reading order, starting with the nav.
- Touch targets stay at least 44px at every width, because tablets are touch screens.

## Working on the design

1. Change tokens here first, then port them: `core/src/tokens.ts` (colour values), `mobile/src/lib/theme.ts` (mode mapping, radii, spacing, fonts) and the artboard's `:root` / `.t-dark` / `.t-light` blocks.
2. Add or update frames in `pernce-artboard.html` with its `ms()` / `wsx()` templates, in both modes; state variants get a suffix (`M10a`).
3. Reference tokens and component names directly (`{colors.primary}`, `--brand`, `tab-dock`) — don't paraphrase values.
4. Check contrast when changing a colour: text 4.5:1 against its surface, accents 3:1 against a white icon.
5. If the brand colour changes, update the icon SVGs and re-export the PNGs (see App Icon & Favicon).
