---
name: YNAPB
description: Calm, dark-first financial planning with legible data and one clear next action.
status: final
updated: 2026-10-26
colors:
  background: '#0B0D0C'
  foreground: '#F1F5F2'
  card: '#121614'
  card-foreground: '#F1F5F2'
  popover: '#181D1A'
  popover-foreground: '#F1F5F2'
  primary: '#A7E8BD'
  primary-foreground: '#102317'
  secondary: '#1D2420'
  secondary-foreground: '#E1E9E3'
  muted: '#181D1A'
  muted-foreground: '#98A59C'
  accent: '#22332A'
  accent-foreground: '#DDF7E5'
  destructive: '#F2A19A'
  border: '#29312C'
  input: '#354039'
  ring: '#A7E8BD'
  success: '#A7E8BD'
  warning: '#E7C984'
  info: '#9CC5E8'
typography:
  display:
    fontFamily: Geist
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.03em
  title:
    fontFamily: Geist
    fontSize: 20px
    fontWeight: '600'
    lineHeight: '1.35'
    letterSpacing: -0.015em
  body:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.55'
  label:
    fontFamily: Geist
    fontSize: 13px
    fontWeight: '500'
    lineHeight: '1.4'
  metric:
    fontFamily: Geist Mono
    fontSize: 24px
    fontWeight: '500'
    lineHeight: '1.25'
    letterSpacing: -0.025em
rounded:
  sm: 6px
  md: 10px
  lg: 14px
  xl: 18px
  full: 9999px
spacing:
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  '5': 24px
  '6': 32px
  '7': 48px
  '8': 64px
components:
  button-primary:
    background: '{colors.primary}'
    foreground: '{colors.primary-foreground}'
    radius: '{rounded.md}'
  surface-card:
    background: '{colors.card}'
    foreground: '{colors.card-foreground}'
    radius: '{rounded.lg}'
    border: '1px solid {colors.border}'
  metric-positive:
    foreground: '{colors.primary}'
    typography: '{typography.metric}'
  timeline-goal:
    background: '{colors.accent}'
    foreground: '{colors.accent-foreground}'
    radius: '{rounded.sm}'
---

## Brand & Style

YNAPB is a quiet financial workspace. It should feel dependable rather than celebratory: users come to make consequential money decisions, not to be entertained. Dark graphite surfaces, crisp typography and a single mint accent make the current plan and primary action easy to find. The system extends the existing shadcn/Tailwind foundation rather than inventing incompatible controls.

## Colors

- **Canvas** (`{colors.background}`) is near-black with a green undertone, never pure black.
- **Raised surfaces** (`{colors.card}`, `{colors.popover}`) create hierarchy through tone and hairline borders.
- **Mint** (`{colors.primary}`) means primary action, available money and healthy progress. Do not use it decoratively on every icon or heading.
- **Text** uses `{colors.foreground}` for values and headings and `{colors.muted-foreground}` for supporting content. Muted text remains readable, not disabled-looking.
- Amber is reserved for warnings and coral for destructive or unreachable states. State never relies on color alone.

## Typography

Geist is the interface family; Geist Mono aligns financial values. Use `display` only for page titles, `title` for sections, `body` for reading and controls, and `metric` for the three budget totals. Avoid all-caps labels and excessively small type: 12px is the floor for ancillary metadata, 14px for normal content.

## Layout & Spacing

The application uses a centered fluid shell with a 1440px maximum and 16px mobile / 32px desktop gutters. The four-pixel rhythm controls all spacing. Plan follows a clear sequence: page heading and actions, budget summary, timeline, monthly allocation, then conflicts. Desktop navigation is a compact left rail; small screens use a top bar with equivalent visible navigation. Tables and timelines scroll within their own region rather than widening the page.

## Elevation & Depth

Tonal layering and 1px borders carry hierarchy. Shadows belong only to overlays and toasts. No glassmorphism, glows, gradients or elevated cards on hover.

## Shapes

Cards use `{rounded.lg}`, dialogs `{rounded.xl}`, inputs and buttons `{rounded.md}`, and compact timeline elements `{rounded.sm}`. Pills are reserved for small statuses, not general buttons.

## Components

- **Buttons:** one primary action per region. Secondary actions use secondary/outline; quiet repeated actions use ghost. Minimum target 40px desktop and 44px touch. Loading labels preserve width and disabled controls remain legible.
- **Cards:** restrained border, no shadow, 20–24px padding. Section titles sit beside relevant actions; explanatory copy stays below the title.
- **Budget metrics:** three equal cells with the available-for-goals value emphasized in mint. Labels precede values; obligations expose an explicit details action.
- **Navigation:** active item uses a tonal accent and a small marker, not a solid high-contrast button. Brand and navigation remain visible without crowding content.
- **Timeline:** goal bars use tonal mint, visible handles, clear focus rings and text warnings. The goal identity column remains sticky. Current and deadline states have labels as well as color.
- **Tables:** tabular numbers, right-aligned amounts, sticky header where useful, comfortable 44px rows and subtle row separation.
- **Forms:** persistent labels, helpful descriptions, visible focus, errors adjacent to fields and operational failure details in sonner descriptions.
- **Feedback:** sonner for operational success/failure; inline alerts only for persistent plan state such as stale data or conflicts.

## Do's and Don'ts

| Do | Don't |
|---|---|
| Keep the primary financial action unmistakable | Give every action equal emphasis |
| Use tabular numerals for money | Mix proportional digits into financial tables |
| Preserve readable contrast in dark mode | Use low-opacity gray for essential text |
| Pair state color with icon or text | Encode state through color alone |
| Use one mint accent with intent | Add gradients, neon glow or decorative chart colors |
| Keep existing planning and YNAB behavior | Change financial semantics for visual simplicity |
