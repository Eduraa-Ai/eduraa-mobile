# PR #6 Merge-Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile PR #6 with current `main`, correct attempt recovery, complete the canonical Previous Papers row, prove it visually and automatically, and publish a green protected PR.

**Architecture:** Rebase first and retain current `main` at every overlapping architecture boundary. Put deterministic attempt and Previous Papers state decisions in pure model modules exercised by Node tests; keep React Native screens responsible for queries, navigation, and rendering. Treat the existing backend contract as authoritative and represent assembly progress as honest named stages rather than invented percentages.

**Tech Stack:** React Native 0.81, Expo SDK 54, TypeScript 5.9, React Navigation 6, TanStack Query 5, Axios, Node 20.19.4 `node:test`, Playwright CLI for React Native Web evidence, GitHub Actions, `gh api`.

## Global Constraints

- Current `main` navigation, API configuration, auth token access, Result Detail, Question Evidence, and delivery behavior remain authoritative.
- Use Node `20.19.4` and npm `10.8.2`; keep `package-lock.json` at lockfile version 3.
- Do not change backend schemas, seed production, automate store releases, or reorganize unrelated domains.
- Every new behavior starts with a focused test that is observed failing for the expected reason.
- Synthetic UI data contains no real credentials or student information.
- UI completion requires rendered 320x700 and 390x844 evidence plus an independent `eduraa-premium-ui-critic` `PASS`.
- GitHub delivery updates the existing `react_changes_for_prev_paper` branch and PR #6; it does not create or auto-merge a second PR.

---

### Task 1: Rebase and reconcile the architectural conflicts

**Files:**
- Modify: `package-lock.json`
- Modify: `package.json`
- Modify: `src/navigation/index.tsx`
- Modify: `src/screens/papers/AttemptPaperScreen.tsx`
- Modify: `src/screens/results/ResultDetailScreen.tsx`

**Interfaces:**
- Consumes: `origin/main` at the latest fetched revision and PR #6 commits.
- Produces: a clean rebased tree where `Quiz` accepts `{ paperId: string; examId?: string }`, Attempt Paper uses `getAccessToken()`, Result Detail retains evidence navigation, and the npm lockfile is regenerated.

- [ ] **Step 1: Refresh and record both remote tips**

Run:

```bash
git fetch origin main react_changes_for_prev_paper
git rev-parse origin/main origin/react_changes_for_prev_paper
git status --short --branch
```

Expected: a clean `codex/pr6-repair` worktree and two recorded immutable SHAs.

- [ ] **Step 2: Rebase onto current main and capture the conflict set**

Run:

```bash
git rebase origin/main
git status --short
```

Expected: conflicts limited to the known overlapping package/navigation/attempt/result files; unexpected conflicts stop execution for investigation.

- [ ] **Step 3: Resolve navigation and attempt authentication in favor of current architecture**

Retain all current-main routes and add only the optional quiz exam identifier:

```ts
Quiz: { paperId: string; examId?: string }
```

In Attempt Paper, preserve:

```ts
import apiClient, { API_BASE_URL, getAccessToken } from '../../api/client'
```

and integrate PR draft/attempt logic without importing `expo-secure-store` or the auth storage key.

- [ ] **Step 4: Resolve Result Detail surgically**

Keep current main's report surface, `AuthLogoMark`, role-aware navigation, and:

```ts
navigation.navigate('QuestionEvidence', {
  checkedPaperId: id,
  questionId: item.question_id,
  questionIndex: index,
})
```

Add only the PDF mutation/action backed by:

```ts
checkedPapersApi.downloadPdf(id)
presentPdf(download)
```

with a visible retryable error.

- [ ] **Step 5: Regenerate the lockfile instead of hand-merging it**

Resolve `package.json` with the union of current-main dependencies and the PR's required Expo file/sharing packages, then run:

```bash
git checkout --ours package-lock.json
npm install --package-lock-only
node -e "const lock=require('./package-lock.json'); if(lock.lockfileVersion!==3) process.exit(1)"
git add package.json package-lock.json src/navigation/index.tsx src/screens/papers/AttemptPaperScreen.tsx src/screens/results/ResultDetailScreen.tsx
git rebase --continue
```

Expected: rebase completes and lockfile version is exactly 3.

- [ ] **Step 6: Run the narrow integration baseline**

Run:

```bash
npm ci
npm run typecheck
git diff --check origin/main...HEAD
```

Expected: clean install, no TypeScript failures, and no whitespace errors.

- [ ] **Step 7: Commit any post-rebase reconciliation amendment**

If conflict resolution is already captured by the rebased feature commit, do not create an empty commit. Otherwise:

```bash
git add package.json package-lock.json src/navigation/index.tsx src/screens/papers/AttemptPaperScreen.tsx src/screens/results/ResultDetailScreen.tsx
git commit -m "fix: reconcile paper workflow with current main"
```

### Task 2: Protect newest-attempt recovery with a pure model

**Files:**
- Create: `src/screens/papers/paperAttemptModel.ts`
- Create: `scripts/paper-attempt-model.test.cjs`
- Modify: `scripts/run-model-tests.cjs`
- Modify: `src/screens/papers/AttemptPaperScreen.tsx`
- Modify: `src/screens/papers/QuizScreen.tsx`

**Interfaces:**
- Consumes: an oldest-first `readonly T[]` where `T` has `grading_status`.
- Produces: `selectNewestInProgressAttempt<T>(attempts): T | undefined`.

- [ ] **Step 1: Add the failing test suite**

Add fixtures with complete attempt fields and literal expectations:

```js
test('selects the newest in-progress attempt from an oldest-first response', () => {
  const attempts = [
    attempt({ id: 'attempt-1', attempt_number: 1, grading_status: 'in_progress' }),
    attempt({ id: 'attempt-2', attempt_number: 2, grading_status: 'submitted' }),
    attempt({ id: 'attempt-3', attempt_number: 3, grading_status: 'in_progress' }),
  ]

  assert.equal(selectNewestInProgressAttempt(attempts)?.id, 'attempt-3')
})
```

Also assert empty, no-in-progress, and single-in-progress results.

- [ ] **Step 2: Wire the nonexistent model into the model-test runner and verify RED**

Add the future TypeScript model and CJS suite paths to `scripts/run-model-tests.cjs`, then run:

```bash
npm run test:models
```

Expected: FAIL because `paperAttemptModel.ts` or its export does not exist.

- [ ] **Step 3: Implement the minimal pure selector**

```ts
export function selectNewestInProgressAttempt<T extends { grading_status?: string }>(
  attempts: readonly T[],
): T | undefined {
  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    if (attempts[index]?.grading_status === 'in_progress') return attempts[index]
  }
  return undefined
}
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm run test:models
```

Expected: all existing suites and the new attempt suite pass.

- [ ] **Step 5: Use the selector in both players**

Replace `.find(...)` in both queries with:

```ts
const inProgress = selectNewestInProgressAttempt(attempts.items)
```

Do not change create-attempt payloads.

- [ ] **Step 6: Verify model and type integration**

Run:

```bash
npm run test:models
npm run typecheck
```

Expected: both commands exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/screens/papers/paperAttemptModel.ts scripts/paper-attempt-model.test.cjs scripts/run-model-tests.cjs src/screens/papers/AttemptPaperScreen.tsx src/screens/papers/QuizScreen.tsx
git commit -m "fix: resume the newest paper attempt"
```

### Task 3: Model Previous Papers filtering, disclosure, and safe errors

**Files:**
- Create: `src/screens/learning/previousPapersModel.ts`
- Create: `scripts/previous-papers-model.test.cjs`
- Modify: `scripts/run-model-tests.cjs`

**Interfaces:**
- Consumes: `PreviousPaper[]`, selected exam/year/paper IDs, chapters, and unknown API errors.
- Produces:
  - `getPreviousPaperFilters(papers): { exams: string[]; years: string[] }`
  - `filterPreviousPapers(papers, exam, year): PreviousPaper[]`
  - `reconcileSelectedPaperId(visiblePapers, selectedId): string | null`
  - `getVisibleChapters(chapters, expanded, limit): PreviousPaperChapter[]`
  - `getApiErrorMessage(error, fallback): string`

- [ ] **Step 1: Add failing behavior tests**

Use literal fixtures to prove:

- empty metadata is excluded and years sort descending;
- simultaneous exam/year filters use AND semantics;
- an invisible selected ID reconciles to the first visible ID;
- no visible papers reconcile to `null`;
- collapsed chapters return the first six and expanded chapters return all;
- string details render directly, FastAPI detail arrays become joined messages,
  and arbitrary objects fall back safely.

- [ ] **Step 2: Register the suite and verify RED**

Run:

```bash
npm run test:models
```

Expected: FAIL on the missing model/export.

- [ ] **Step 3: Implement the pure model**

Use stable insertion-order exam uniqueness, numeric descending year sort, pure
array filtering/slicing, and this error normalization boundary:

```ts
if (typeof detail === 'string' && detail.trim()) return detail
if (Array.isArray(detail)) {
  const messages = detail
    .map((item) => typeof item?.msg === 'string' ? item.msg : null)
    .filter((item): item is string => Boolean(item))
  if (messages.length) return messages.join(' ')
}
return fallback
```

- [ ] **Step 4: Verify GREEN and refactor only while green**

Run:

```bash
npm run test:models
```

Expected: the full model suite passes.

- [ ] **Step 5: Commit**

```bash
git add src/screens/learning/previousPapersModel.ts scripts/previous-papers-model.test.cjs scripts/run-model-tests.cjs
git commit -m "test: define previous papers state behavior"
```

### Task 4: Complete and polish the four-state Previous Papers row

**Files:**
- Modify: `src/screens/learning/PreviousPapersScreen.tsx`
- Create: `src/screens/learning/PreviousPaperAssemblyState.tsx`

**Interfaces:**
- Consumes: the Task 3 model functions, `previousPapersApi`, React Navigation, and current Eduraa UI tokens.
- Produces: explicit `browse`, `preview`, and `assembling` render states; assembly has `preparing | requesting | opening | error`.

- [ ] **Step 1: Verify the UI acceptance probe is RED**

Start the current React Native Web screen against deterministic synthetic paper
data and query for the accessible controls `All exams`, `All years`, `Show all
8 chapters`, and the heading `Assembling your paper`. Exercise the current start
action.

Expected: at least the exam/year controls, complete chapter disclosure, and
assembly heading are absent. Record that missing behavior before editing the
screen.

- [ ] **Step 2: Connect tested paper filters**

Derive exam/year choices and visible papers from the pure model. Render a labeled
horizontal discovery rail with `All exams`, real exams, `All years`, and real
years. Reconcile the selected paper whenever filtered visibility changes and
provide a `Clear filters` action for no-match results.

- [ ] **Step 3: Replace the silent chapter cap**

Use `getVisibleChapters(chapters, chaptersExpanded, 6)` and render an accessible
`Show all N chapters` / `Show fewer chapters` control only when `chapters.length
> 6`.

- [ ] **Step 4: Recompose hierarchy and protect bottom chrome**

Use `AppScreen protectedChrome`, replace the three-stat marketing hero with a
compact editorial header and paper count, remove unnecessary nested card
surfaces, and ensure the final paper, preview solution, and CTA remain
scrollable above the tab bar.

- [ ] **Step 5: Implement the assembly component**

`PreviousPaperAssemblyState` accepts:

```ts
type AssemblyStage = 'preparing' | 'requesting' | 'opening' | 'error'

type PreviousPaperAssemblyStateProps = {
  stage: AssemblyStage
  paperTitle: string
  selectionLabel: string
  errorMessage?: string
  onRetry: () => void
  onBack: () => void
}
```

It renders honest named-stage progress, preserved-selection copy, and retry/back
actions only for the error stage.

- [ ] **Step 6: Wire start, reused-paper, and navigation transitions**

Enter `preparing`, allow one render frame, run the existing mutation in
`requesting`, move to `opening` immediately before navigation, and preserve the
existing Resume/New modal contract. On failure, remain in `error` with the
selection intact. Prevent duplicate mutation calls while pending.

- [ ] **Step 7: Use safe error normalization throughout**

Replace the local cast-based `errorMessage()` with `getApiErrorMessage()` for
paper, chapter, question, and start failures.

- [ ] **Step 8: Verify the UI acceptance probe is GREEN**

Repeat the exact synthetic browser probe from Step 1.

Expected: exam/year controls and complete chapter disclosure are reachable, the
start action enters the assembly heading before navigation, and the failure
mode retains selected filters.

- [ ] **Step 9: Run focused checks**

Run:

```bash
npm run test:models
npm run typecheck
git diff --check
```

Expected: all pass.

- [ ] **Step 10: Commit**

```bash
git add src/screens/learning/PreviousPapersScreen.tsx src/screens/learning/PreviousPaperAssemblyState.tsx
git commit -m "feat: complete previous papers workflow"
```

### Task 5: Prove PDF, navigation, and full repository integrity

**Files:**
- Verify: `src/api/checkedPapers.ts`
- Verify: `src/api/papers.ts`
- Verify: `src/utils/pdfDownload.ts`
- Verify: `src/screens/papers/PaperDetailScreen.tsx`
- Verify: `src/screens/results/ResultDetailScreen.tsx`
- Modify only if a failing check identifies a scoped defect.

**Interfaces:**
- Consumes: merged PDF API/presenter behavior and navigation params.
- Produces: no answer-key regression, correct PDF action on current Result Detail, and successful repository verification.

- [ ] **Step 1: Inspect the final diff for conflict casualties**

Run:

```bash
git diff --stat origin/main...HEAD
git diff origin/main...HEAD -- src/navigation/index.tsx src/api/client.ts src/screens/papers/AttemptPaperScreen.tsx src/screens/results/ResultDetailScreen.tsx src/utils/pdfDownload.ts
```

Confirm `QuestionEvidence`, `getAccessToken`, refresh-capable API configuration,
server timestamps, draft isolation, submission confirmation, and PDF action all
remain.

- [ ] **Step 2: Run the complete local CI contract**

Run:

```bash
npm ci
npm audit --audit-level=critical
npm run check:deps
npm run typecheck
npm test
EXPO_PUBLIC_API_URL=https://api.example.com npm run export:ci -- --output-dir /tmp/eduraa-mobile-pr6-export
git diff --check origin/main...HEAD
```

Expected: every command exits 0; known moderate/high advisories may be reported
but no critical advisory may fail the audit.

- [ ] **Step 3: Inspect generated dependency integrity**

Run:

```bash
npm ls --depth=0
node -e "const lock=require('./package-lock.json'); if(lock.lockfileVersion!==3) process.exit(1)"
```

Expected: valid dependency tree and lockfile version 3.

- [ ] **Step 4: Commit any evidence-driven repair**

Only if Step 1-3 reveal a defect, first add a failing focused regression test,
repair it, rerun the failing command, then commit:

```bash
git add src/api/checkedPapers.ts src/api/papers.ts src/utils/pdfDownload.ts src/screens/papers/PaperDetailScreen.tsx src/screens/results/ResultDetailScreen.tsx scripts
git commit -m "fix: preserve paper workflow integration"
```

### Task 6: Render, critique, and iterate to PASS

**Files:**
- Create: `test-artifacts/previous-papers/` screenshots and a synthetic-data manifest.
- Modify: the smallest Previous Papers UI files needed by critic feedback.

**Interfaces:**
- Consumes: the real Expo web runtime, deterministic local mock API, canonical row, and two phone viewports.
- Produces: reproducible screenshots for required states and independent critic `PASS`.

- [ ] **Step 1: Prepare deterministic synthetic data**

Use fixed seed `pr6-pyq-20260725` with at least three exam/year combinations,
eight chapters, long paper/question text, one reused attempt, and explicit
loading/empty/error/retry/start-error modes. Store only the seed and non-secret
fixture description in the manifest.

- [ ] **Step 2: Start the app and mock API**

Build or serve the actual React Native Web output against localhost test APIs.
Do not call or mutate Azure production.

- [ ] **Step 3: Capture required 390x844 states**

Capture browser loading/populated/scrolled/empty/error/retry; neutral/selected
filters; collapsed/expanded chapters; preview long content; start loading/error;
assembly stages; reused-attempt modal and each modal outcome.

- [ ] **Step 4: Capture the equivalent critical 320x700 states**

At minimum capture populated top/scrolled, selected builder/CTA, expanded
chapters, complete preview bottom, assembly/error, modal, and recovered exam
handoff with no tab overlap.

- [ ] **Step 5: Invoke the independent critic**

Provide the canonical row, task context, exact viewport sizes, and screenshots
without an intended verdict. Require its exact output contract.

- [ ] **Step 6: Repair a REJECT through a new focused loop**

For each `REJECT`, implement at most the critic's three highest-leverage changes,
rerun model/type checks, recapture affected states, and invoke a fresh critic.
Stop only on `PASS` or a concrete external blocker.

- [ ] **Step 7: Commit approved UI/evidence**

```bash
git add src/screens/learning test-artifacts/previous-papers
git commit -m "test: capture previous papers device states"
```

### Task 7: Publish the repaired PR and enforce its gate

**Files:**
- No repository files expected.
- External changes: remote PR branch and `main` branch protection.

**Interfaces:**
- Consumes: verified local branch, expected old remote SHA, active Mobile CI workflow, and approved GitHub token/session.
- Produces: updated PR #6, successful required check, clean mergeability, and protected `main`.

- [ ] **Step 1: Re-run completion verification on the exact push candidate**

Run:

```bash
npm test
npm run typecheck
git status --short --branch
git log --oneline origin/main..HEAD
git diff --check origin/main...HEAD
```

Expected: tests/typecheck pass, tree clean, and the commit list contains only the
PR feature plus its repair/design/test commits.

- [ ] **Step 2: Push the rebased existing PR branch safely**

Record the remote head, ensure it still matches the earlier fetched SHA, then:

```bash
EXPECTED_REMOTE_SHA="$(git rev-parse origin/react_changes_for_prev_paper)"
git push --force-with-lease=refs/heads/react_changes_for_prev_paper:"${EXPECTED_REMOTE_SHA}" origin HEAD:refs/heads/react_changes_for_prev_paper
```

- [ ] **Step 3: Verify PR and Actions through `gh api`**

Query:

```bash
NEW_SHA="$(git rev-parse HEAD)"
gh api repos/Eduraa-Ai/eduraa-mobile/pulls/6
gh api repos/Eduraa-Ai/eduraa-mobile/commits/"${NEW_SHA}"/check-runs
gh api "repos/Eduraa-Ai/eduraa-mobile/actions/runs?head_sha=${NEW_SHA}"
```

Wait until `Mobile CI / Verify` is completed with conclusion `success`. If it
fails, inspect job logs, reproduce locally, repair test-first, and push normally.

- [ ] **Step 4: Configure branch protection**

Use `gh api --method PUT repos/Eduraa-Ai/eduraa-mobile/branches/main/protection`
with:

```json
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["Verify"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "required_conversation_resolution": true,
  "allow_force_pushes": false,
  "allow_deletions": false
}
```

If the repository plan does not permit branch protection, report the exact API
response and leave the PR green rather than weakening requirements.

- [ ] **Step 5: Verify final remote state**

Through `gh api`, confirm:

- PR head equals the pushed SHA;
- `mergeable` is true and `mergeable_state` is clean or blocked only by review;
- `Mobile CI / Verify` is successful;
- branch protection requires the exact check and one approval;
- no unresolved review threads or failing statuses exist.

Do not merge PR #6 automatically.
