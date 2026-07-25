# Website-to-Mobile Parity Plan

The website router contains more than 60 role and feature routes. Mobile has 32
screens across auth, home, learning, papers, results, workspace, AI Studio, and
profile. File count is not parity: each row below is complete only when behavior,
permissions, backend contracts, failure states, and device interaction agree.

## Sequence

| Phase | Scope | Current posture | Main risk |
| --- | --- | --- | --- |
| 0 | API configuration, repeatable install, CI | Established | Environment drift |
| 1 | Login, refresh/logout, registration, verification, role landing | Partial | Cookie/token and role mismatch |
| 2 | Papers, generation, attempts, exams, checked-paper results | Broad UI/API surface exists | Payload and async-state drift |
| 3 | Agentic learning, competitive learning, resources, previous papers | Broad UI/API surface exists | Hierarchy and streaming drift |
| 4 | Attendance, approvals, scan upload, staff workspace | Partial | Role permissions and state machines |
| 5 | Profile, teachers, homework, announcements, doubts, integrations | Mixed or absent | Missing workflows |
| 6 | Principal, admin, developer, and curriculum tools | Mostly absent | Desktop-only assumptions |

Do not begin with principal/admin parity. First prove one complete learner journey
and one complete staff journey against the same backend revision used by the web.

## Contract workflow

For each website feature row:

1. Record the website route, role guard, backend endpoint, request schema, response
   schema, and status/error states from the sibling repository.
2. Map the existing mobile screen and API adapter. Mark missing behavior explicitly;
   do not hide it behind a generic `FeatureScreen`.
3. Add pure model/contract tests using realistic synthetic payloads before visual
   refinement. Never put live Azure credentials or calls in unit tests.
4. Implement initial, loading, partial, empty, offline, error, retry, and success
   states appropriate to the workflow.
5. Run typecheck, tests, and all-platform export. Exercise the real endpoint in a
   development account only after deterministic checks pass.
6. Capture required Android-sized device states and obtain the independent premium
   UI critic `PASS` required by this repository.

## Definition of done

A feature is parity-complete only when all statements are true:

- Supported roles and permission failures match the website/backend contract.
- Requests and responses are verified against the current backend source revision.
- Navigation reaches every expected success and recovery outcome.
- Refresh, retry, duplicate-submit, offline, and expired-session behavior is known.
- No sample data or optimistic result is presented as real backend state.
- Accessibility labels, keyboard behavior, safe areas, and small-device layouts pass.
- Automated checks and real-device visual review pass.

## Folder migration rule

Keep `src/screens` grouped by product domain. Do not mass-move files merely to make
the tree look cleaner. When a domain is actively verified, its API adapters may be
moved together under `src/api/<domain>` with imports updated in the same reviewed
change. Keep `client.ts`, `apiConfig.ts`, and `index.ts` at `src/api` root. This
incremental rule improves ownership without deleting history or destabilizing every
feature at once.
