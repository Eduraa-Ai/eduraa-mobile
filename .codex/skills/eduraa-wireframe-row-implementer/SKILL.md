---
name: eduraa-wireframe-row-implementer
description: 'Implement Eduraa React Native screens, pages, features, and complete workflow rows from design-mocks/main-html-whole-workflow.html. Use whenever a user asks to build, match, finish, or refine a page or feature represented in the canonical wireframe, including auth, profile, AI Studio, paper generation, checked papers, Agentic Learning, previous papers/PYQ, exams, or learning resources. Requires row-scoped implementation, synthetic-data testing, autonomous small fixes, rendered device evidence, and the Eduraa premium UI critic gate.'
argument-hint: 'Name the page or feature to implement'
---

# Eduraa Wireframe Row Implementer

Implement a user-named Eduraa page as its complete feature row, then prove the result in the running React Native app.

Use `eduraa-mobile-class-apart` as the primary product and implementation standard. Use this skill to resolve scope from the canonical wireframe and drive the implementation, test, repair, and visual-proof loop.

## Canonical Source

Treat `design-mocks/main-html-whole-workflow.html` as the source of truth for all React Native product implementation represented by that file:

- visual hierarchy, composition, copy, controls, and interaction intent;
- navigation and handoffs shown between states;
- loading, empty, error, disabled, selected, confirmation, and success states;
- every page or state grouped into the same horizontal feature row.

Do not use another mock as a competing design source unless the user explicitly asks. Do not edit the canonical HTML while implementing the app unless the user explicitly requests a wireframe change.

Translate the design into native components rather than copying HTML or CSS mechanically. Existing APIs, domain types, and backend contracts remain authoritative for data semantics. If a backend limitation prevents the exact wireframe behavior, preserve the wireframe experience as closely as the real contract permits and report the mismatch instead of inventing fake production behavior.

The user's latest explicit requirement overrides the wireframe. Call out any material conflict before implementing it.

## Resolve The Requested Row

The page named by the user is the entry point, not necessarily the whole scope.

1. Find the closest matching `id`, `aria-label`, iframe `title`, `data-*-state`, heading, or feature label in the canonical HTML.
2. Resolve its CSS grid row from explicit `grid-row`, its shared `*-master-page` class, row selectors such as `nth-child`, and any inline `grid-column` placement.
3. Include every `.page` assigned to that same row, in left-to-right `grid-column` or DOM order.
4. Include the JavaScript-generated `srcdoc`, state array, template, and interaction logic associated with every iframe in that row.
5. Write a short scope checklist naming the row's screens, states, transitions, and key failure paths before changing code.

Do not infer row membership from visual similarity alone. Re-read the current HTML each time because rows can be added or reordered.

If one user term matches multiple rows and nearby context cannot disambiguate it, ask one focused question. Otherwise proceed without making the user translate the HTML structure for you.

## Inspect The Native Path

Start from the React Native screen, route, or component that owns the requested behavior. Inspect only the nearby navigation, API methods, store, shared UI components, theme tokens, and tests needed for the resolved row.

Build a direct mapping:

- each wireframe page/state to a native route or explicit component state;
- each visible action to a real handler and destination;
- each displayed value to a real API/store field or an honest empty/loading state;
- each failure shown in the row to a recoverable native state.

State one falsifiable local implementation hypothesis and the cheapest check that can disprove it. Once that path is clear, make the smallest grounded edit and validate it before widening the change.

## Implement The Whole Row

- Implement all states and transitions in the resolved row, even when the user names only one page in that row.
- Keep changes inside the row's owning screens and the smallest necessary shared surfaces.
- Reuse established navigation, API clients, stores, components, tokens, fonts, icons, and assets.
- Preserve existing backend contracts, authentication, accessibility, and user data.
- Wire controls to real behavior. Do not leave dead buttons, decorative inputs, fake loading, or hard-coded success paths.
- Cover initial, loading, populated, empty, error/offline, disabled, retry, and success states wherever the row implies or the real workflow requires them.
- Preserve work across safe navigation, retries, and validation failures.
- Match the canonical hierarchy and interaction intent on small and large Android phones, including keyboard-open and scrolled layouts.
- Do not refactor unrelated rows or redesign adjacent screens while completing this row.

Prefer a sequence of small, reviewable edits. After each meaningful edit, run the narrowest executable check that can falsify it.

## Test With Synthetic Data

Testing is part of implementation and must be performed by the agent, not delegated to the user.

1. Run the relevant TypeScript, lint, unit, and focused integration checks available in the repository.
2. Start the actual app and exercise the resolved row with device or UI automation when available.
3. Generate valid, non-sensitive synthetic inputs for each run: unique names, emails, IDs, text, numeric boundaries, option combinations, and file fixtures appropriate to the feature.
4. Record a seed or the generated non-secret values so failures can be reproduced. Never print, store, or invent real credentials or personal data.
5. Use a development or test backend for write operations. Never seed random records into production or trigger irreversible actions merely to complete a test.
6. Exercise the happy path plus validation, empty, loading, API failure, retry, back navigation, keyboard, scrolling, and duplicate-submission behavior relevant to the row.
7. Test at least one compact Android viewport and one larger phone viewport. Capture the important initial, interactive, error, and success states.
8. Compare the real renders directly with the corresponding canonical row states.

If device automation is unavailable, use the strongest executable substitute, explain the exact limitation, and do not claim device or visual verification.

## Repair Failures Conservatively

When a check or journey fails:

1. Capture the exact error, failing state, and reproduction input.
2. Trace it to the nearest code that directly controls the behavior.
3. Fix the root cause with the smallest local change that preserves public behavior.
4. Rerun the same failing check before running broader validation.
5. Add a focused regression check when practical.

Do not respond to a local failure with a broad rewrite, dependency migration, navigation overhaul, disabled validation, swallowed error, hard-coded response, or unrelated cleanup. After three unsuccessful repairs in the same slice, stop changing it blindly and report the blocker with evidence.

## Independent Visual Gate

After every meaningful UI implementation, invoke `eduraa-premium-ui-critic` in a fresh independent agent. Give it:

- the user's requested page or feature;
- the canonical row states;
- actual device screenshots for the implemented states;
- relevant viewport and accessibility context.

Do not tell the critic what verdict to reach or defend the implementation. A UI row is not complete until the critic returns `PASS`. On `REJECT`, implement only the highest-leverage feedback, rerun focused checks, recapture the affected states, and repeat the independent review.

## Completion Contract

Finish only when:

- every page and state in the resolved row is implemented or a concrete external blocker is documented;
- all visible controls have working behavior;
- focused checks and the full available project validation pass;
- the synthetic-data journey passes without unexplained errors;
- required device states have rendered evidence;
- meaningful UI work has an independent critic `PASS`.

Report the resolved row and states, material UX behavior, files changed, commands and journeys actually run, synthetic cases covered, screenshots inspected, failures repaired, critic verdict, and any remaining risk. Never claim a check, device state, or visual comparison that was not actually completed.
