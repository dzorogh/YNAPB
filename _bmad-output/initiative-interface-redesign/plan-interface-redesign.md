---
title: 'Calm dark interface redesign'
type: 'feature'
ticket: ''
created: '2026-10-26'
status: 'built'
baseline_revision: 'bcf821573737b737fdaed6d4e80be03f5008180e'
route: 'oneshot'
route_source: 'pinned'
risk: 'medium'
review: 'none'
review_source: 'pinned'
lenses_ran: []
review_loop_iteration: 0
context:
  - '_bmad-output/initiative-interface-redesign/ux-interface-redesign/DESIGN.md'
  - '_bmad-output/initiative-interface-redesign/ux-interface-redesign/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The functional planner uses generic light-first shadcn styling, weak information hierarchy, dense controls and desktop-oriented navigation. Users need a calm dark workspace that makes financial status and the next safe action clear.

**Approach:** Implement the approved calm financial design system across shared primitives and application chrome, then redesign Plan and align Settings, Login, forms and dialogs without changing planning, CRUD or YNAB behavior.

</frozen-after-approval>

## Implementation Notes

Oneshot route: the UX direction and behavior are already captured in final DESIGN.md and EXPERIENCE.md; this plan records implementation and verification rather than reopening discovery.

Implemented graphite/mint dark tokens and shared button, card, input, alert and toast treatments. Added responsive desktop rail/mobile navigation, redesigned Plan hierarchy, metrics, timeline, allocation and conflicts, and aligned Settings, Login, forms and dialogs. Planning, CRUD and YNAB behavior remained unchanged.

Verification: typecheck, dependency architecture, 79 unit tests and all 11 Playwright scenarios pass. Changed files pass Biome lint and formatting; `git diff --check` passes. Real Chromium screenshots at 1440px and 390px confirmed the corrected visual hierarchy and no page-level horizontal overflow. Repository-wide `npm run check` remains blocked by pre-existing cognitive complexity at `src/lib/ynab/sync.test.ts:246`; repository-wide format check also reports two pre-existing unrelated files.

## Review Triage Log

No separate review, pinned by the user.

## Verification

**Commands:**
- `npm run typecheck && npm run test:arch && npm run test:unit` — passed.
- `npm run test:e2e` — 11 scenarios passed against the redesigned UI.
- Biome lint/format on all changed files — passed.
- `npm run check` — blocked by unrelated pre-existing lint complexity in `src/lib/ynab/sync.test.ts:246`.

**Manual checks:**
- Opened Plan with mocked loaded data at desktop and mobile widths; confirmed dark theme, readable metrics, local horizontal timeline/table scrolling and no body overflow.
- Existing goal and YNAB push dialog scenarios, labels and toasts passed in Playwright.
