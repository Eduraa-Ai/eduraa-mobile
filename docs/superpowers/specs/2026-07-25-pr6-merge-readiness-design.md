# PR #6 Merge-Readiness Design

## Goal

Make `react_changes_for_prev_paper` safely mergeable into the current `main`
without losing the newer navigation, authentication, result-report, API
configuration, or delivery work. Complete the Previous Papers mobile workflow
represented by the four canonical PYQ states and prove it through deterministic
tests, rendered phone states, independent visual review, and a required GitHub
check.

## Scope

This change owns the Previous Papers/PYQ row and the attempt/result behavior
introduced by PR #6:

1. Published-paper browsing, including exam and year filters.
2. Subject and chapter practice-set selection.
3. Question preview with complete long-content scrolling.
4. Paper assembly, recoverable failure, retry, and handoff to the exam player.
5. Existing-attempt resume versus explicit new-attempt behavior.
6. Attempt recovery in both timed and interactive exam players.
7. PDF download/share from paper and result surfaces.
8. PR verification and protection of `main`.

It does not redesign unrelated learning rows, change backend schemas, seed
production data, automate store releases, or reorganize the repository.

## Integration Strategy

Rebase PR #6 onto the current `main` and treat `main` as authoritative wherever
the histories overlap.

- Keep current navigation routes, including `QuestionEvidence` and the expanded
  Agentic Learning routes, then add `examId?: string` to `Quiz`.
- Keep the current API configuration and `getAccessToken()` abstraction. The
  attempt screen must not restore direct knowledge of secure-storage keys.
- Keep the current Result Detail report and evidence navigation. Add PDF
  presentation as a focused action on that screen rather than replacing it with
  the older PR layout.
- Keep the Node 20.19.4/npm 10 lockfile format. Regenerate `package-lock.json`
  from the merged `package.json`; never hand-resolve generated dependency data.
- Preserve PR #6's attempt identifiers, server-backed start times, isolated local
  drafts, answer-key protection, duplicate-submit protection, and PDF support.

### Alternatives considered

1. **Preserve `main` and transplant PR behavior — selected.** This minimizes
   regression risk and produces a reviewable reconciliation of each conflict.
2. **Resolve in favor of the PR, then reapply `main`.** This would temporarily
   discard newer product behavior and makes omissions in navigation, auth, and
   Result Detail difficult to detect.
3. **Rewrite the workflow from scratch.** This might yield cleaner local code,
   but it expands scope, throws away already working backend integration, and
   makes parity validation harder.

## Data and State Model

### Paper browser

The screen loads the real published-paper response and derives filter choices
from returned metadata:

- exam choices are unique non-empty `paper.exam` values;
- year choices are unique non-empty `paper.year` values in descending order;
- visible papers satisfy both selected filters;
- changing filters clears an incompatible selected paper and selects the first
  visible result only when one exists;
- zero filtered results produce a useful empty state with a clear reset action.

Filter state is local presentation state. It is not sent to the backend and
does not invent papers.

### Practice builder

The selected paper supplies real subjects and question counts. Subject changes
clear incompatible chapter selection. Every returned chapter remains reachable:
the screen initially presents a concise subset and provides an explicit
show-all/show-less control when more chapters exist. Selection remains intact
across question-query retries and start failures.

### Assembly and handoff

Starting practice transitions to an explicit full-screen assembly state before
the start request. Progress communicates stages, not fabricated backend
percentages:

1. preparing the selected filters;
2. requesting or recovering the generated paper;
3. opening the exam player.

While the request is pending, duplicate starts are disabled. A failed request
keeps the paper, subject, and chapter selection and presents retry/back actions.
A successful new paper navigates to `AttemptPaper`. A reused paper presents the
existing Resume/New choice; Resume hands off to its returned paper and New
retries with `force_new`.

### Attempt recovery

The backend returns attempts ordered by ascending attempt number and creation
time. Both exam players must select the last in-progress item, which is the
newest recoverable attempt. If none exists, they create one with the correct
paper, optional exam, and reason.

The selection logic will live in a pure model helper so realistic arrays can be
tested without rendering a screen. Tests cover no attempts, a single
in-progress attempt, mixed submitted/in-progress attempts, and multiple
in-progress attempts ordered oldest-first.

### PDF presentation

API adapters return a normalized filename plus binary payload. The shared PDF
presenter keeps its current platform split:

- web creates and revokes a temporary object URL;
- native writes to the Expo cache and opens the platform share sheet;
- unavailable native sharing produces a clear recoverable error.

Result Detail preserves the current report layout and supplies the submission
or checked-paper identifier accepted by the existing backend fallback route.

## Visual Direction

The row will translate the canonical hierarchy rather than copying HTML:

- a compact editorial header replaces the oversized marketing-style statistic
  hero;
- exam/year controls form one horizontal discovery rail above the papers;
- paper selection is the dominant browsing structure, with metadata and
  question count aligned consistently;
- the practice builder reads as one continuous decision path rather than nested
  card-and-pill groups;
- the assembly state becomes the row's love moment: calm, honest progress that
  reassures the student their exact selection is preserved;
- `AppScreen` receives the correct protected-chrome treatment so scroll content,
  preview answers, and CTAs remain above the floating bottom navigation at
  320x700 and 390x844.

The warm canvas, trusted navy, restrained orange, and existing type system stay
unchanged. The row will not introduce decorative AI badges, fake personalization,
or new bitmap assets.

## Failure and Accessibility Model

- Loading states name what is loading and do not show stale actions.
- Empty states distinguish no published data from no filter matches.
- API errors normalize unknown FastAPI/Axios detail shapes to renderable text.
- Retry stays local to the failed query or start operation.
- Offline/network errors preserve selection and explain that work was retained.
- Buttons expose labels, roles, disabled/loading state, and minimum 44x44 targets.
- Filters expose selected state and a clear group label.
- Long paper names, chapter names, questions, options, answers, and solutions
  wrap without clipping.
- Scroll padding protects all content from the bottom navigation and safe area.
- Reduced-motion users receive state transitions without essential information
  depending on animation.

## Test and Evidence Strategy

### Deterministic checks

1. Add pure model tests for newest-attempt selection, paper filtering, filter
   reset behavior, chapter disclosure, and API error normalization.
2. Run each new test before implementation and record the expected failure.
3. Run the repository configuration, delivery, bridge, and existing model tests.
4. Run strict TypeScript, Expo dependency alignment, dependency audit at the
   repository's configured threshold, and an all-platform Expo export with the
   reserved HTTPS API origin used by CI.

### Rendered workflow

Use synthetic, non-sensitive data and capture both 320x700 and 390x844:

- browser loading, populated top, populated fully scrolled, empty, error, and
  successful retry;
- neutral and selected filters, no-match reset, collapsed and expanded chapters;
- start disabled, pressed/loading, and start error with preserved selection;
- complete question preview with long content;
- assembly preparing, request, recoverable error, retry, and handoff;
- existing-attempt modal and the outcomes of Resume, Start new attempt, and Not
  now;
- resulting timed player with recovered newest attempt.

The independent `eduraa-premium-ui-critic` receives the canonical row, viewport
details, and the real renders without an intended verdict. Any `REJECT` is
followed by a focused repair and another evidence pass until `PASS`.

## GitHub Delivery

After all local verification and the independent visual gate pass:

1. Commit the reconciled implementation and tests on the PR branch.
2. Push `react_changes_for_prev_paper` with `--force-with-lease` because the
   approved rebase rewrites its single existing commit.
3. Use `gh api` to verify the updated PR head and inspect the `Mobile CI` run.
4. Wait for `Mobile CI / Verify` to succeed.
5. Configure `main` branch protection through `gh api` to require the exact
   successful check context, require an up-to-date branch, require at least one
   approving review, dismiss stale approvals, and block force pushes/deletions.
6. Do not merge the PR automatically; leave the now-mergeable, green PR for the
   requested human approval because this repository has no prior approving
   review on PR #6.

## Acceptance Criteria

- The PR merges cleanly with current `main`.
- Current navigation, API configuration, auth token access, Result Detail, and
  Question Evidence behavior remain present.
- Both players recover the newest in-progress attempt.
- Every backend-returned chapter is reachable.
- The four canonical PYQ states and their recovery paths are implemented.
- No visible content or CTA is obscured by bottom navigation at either target
  viewport.
- New regression tests and the complete repository verification suite pass.
- All-platform Expo export succeeds with release configuration validation.
- The independent mobile critic returns `PASS`.
- The pushed PR head has a successful required `Mobile CI / Verify` check.
- `main` branch protection requires that check and an approving review.
