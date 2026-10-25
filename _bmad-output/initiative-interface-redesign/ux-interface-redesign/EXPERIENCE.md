---
name: YNAPB
status: final
sources:
  - ../../initiative-interface-redesign.md
updated: 2026-10-26
---

# YNAPB — Experience Spine

## Foundation

Responsive web, desktop-first for planning and fully usable on mobile for review and simple edits. Existing Next.js, shadcn/Tailwind and sonner foundations remain. Dark mode is the only/default theme. `DESIGN.md` owns visual identity; this document owns behavior. Existing plan calculation, goal CRUD, YNAB import and preview/apply behavior do not change.

## Information Architecture

| Surface | Reached from | Purpose |
|---|---|---|
| Plan | App open / main navigation | Understand budget, adjust goals, inspect allocations and push reviewed changes |
| Settings | Main navigation | Connect YNAB, configure income and maintain synced data |
| Login | Unauthenticated visit | Sign in without application chrome |

Plan information order: identity and primary actions → three budget metrics → goal timeline → monthly allocation → conflicts. Creating a goal belongs with the timeline; importing and recalculating are secondary actions. Pushing to YNAB remains the primary final action and always opens its existing diff preview.

## Voice and Tone

Calm, specific and financially neutral. Lead with the result and next action.

| Do | Don't |
|---|---|
| “Available for goals” | “Free cash!!!” |
| “Import the latest YNAB data” | “Sync stuff” |
| “Review changes before applying them” | “Push now” |
| “No active goals yet. Create your first goal.” | “No data” |

## Component Patterns

- **App shell:** desktop rail and compact mobile navigation expose Plan and Settings in the same order. Active destination has `aria-current="page"`.
- **Plan header:** concise explanation and grouped actions. Push to YNAB uses `{colors.primary}`; import and recalculate use quieter variants. Loading disables only conflicting operations.
- **Budget summary:** planned income, obligations and available for goals remain visible together. Obligations details opens one dialog at a time.
- **Timeline:** create, edit, delete and drag behavior remains. Drag shows a live preview; Escape restores the snapshot. A nearby text instruction explains the gesture and offers form-based editing as an alternative.
- **Monthly allocation:** month first, goal contributions next, unallocated last. Amounts use tabular numbers and align right. Empty states direct the user to goal creation.
- **Dialogs:** destructive confirmation names the goal and irreversible consequence. Apply is unavailable until a valid preview exists.
- **Toasts:** operational success/error messages use sonner; descriptions carry actionable details.

## State Patterns

| State | Treatment |
|---|---|
| Initial loading | Skeletons mirror metrics and content shape; no layout jump |
| Background refresh | Keep current data visible and label the relevant action as busy |
| No active goals | Explain the value and expose Create goal directly in the timeline |
| Missing YNAB connection | Focused empty state linking to Settings |
| Stale YNAB cache | Persistent inline warning near Import; no toast-only warning |
| Plan conflict | Persistent conflict region with affected goal and corrective direction |
| Request failure | Preserve user input and current plan; sonner error with retry direction |
| Empty allocation | Explain why no rows exist instead of rendering an empty table |

## Interaction Primitives

Click/tap to act; keyboard navigation follows visual order. Enter submits focused forms; Escape closes the topmost dialog or cancels timeline drag preview. Focus moves into opened dialogs and returns to their trigger. Horizontal timeline/table scrolling never traps vertical page scrolling. Hover may reveal secondary actions only when the same actions remain keyboard and touch accessible.

Motion is limited to 120–180ms color/opacity transitions. `prefers-reduced-motion` removes nonessential transitions. No celebratory animation, parallax or automatic carousel.

## Accessibility Floor

WCAG 2.2 AA. Normal text reaches 4.5:1, large text and meaningful component boundaries 3:1. Keyboard focus uses `{colors.ring}` with sufficient offset against `{colors.background}`. Touch targets are at least 44px. Financial values use readable fonts and are not truncated without an accessible full value. Icons have accessible names; status includes text. Tables retain semantic headers and dialogs retain labels and modal semantics.

## Responsive & Platform

| Width | Behavior |
|---|---|
| ≥1024px | Left navigation rail; fluid content up to 1440px; actions aligned with page heading |
| 640–1023px | Compact top navigation; budget metrics remain three columns when legible; actions wrap |
| <640px | Single-column content and metrics; full-width primary action where useful; timeline and table scroll locally; touch targets ≥44px |

## Key Flows

### Review and adjust the monthly plan — Alex, evening budget review

1. Alex opens Plan and immediately sees planned income, obligations and the mint available-for-goals total.
2. Stale data, if present, appears beside Import rather than competing with the plan.
3. Alex drags a goal deadline and sees allocation and conflicts update in preview.
4. **Climax:** the plan visibly reflects the new deadline; Alex commits it, then opens Push to YNAB and reviews the exact diff before applying.

Failure: saving fails → the current plan and context remain, with a sonner explaining the failed save and retry direction.

### Create a first goal — Morgan, after connecting YNAB

1. Morgan opens Plan and sees that no active goals exist.
2. The timeline empty state offers Create goal without requiring navigation elsewhere.
3. Morgan enters a name, amount and deadline; persistent labels and inline validation prevent guessing.
4. **Climax:** the new goal appears in the timeline and monthly allocation, and a sonner confirms whether YNAB targets were updated.

Failure: goal creation fails → entered values remain in the dialog and the error description explains what to fix.
