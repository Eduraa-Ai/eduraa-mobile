# Checked-Paper Trust Backlog

Created: August 23, 2026  
Source: Live Std 10 Geography answer-sheet test  
Status: Product backlog; no implementation is included in this document

## Product decision

Keep a progress bar, but redefine what it means.

The bar must show **verified workflow completion**, not estimated time remaining.
It answers “which checking work has completed?” It must not claim to answer
“how much longer will this take?”

Examples:

- Good: `Answers matched · 6 of 10 ready for grading`
- Good: `Grading · 7 of 10 answers graded`
- Good: `Needs your input · We could not detect answer regions`
- Bad: `94% checked` when 94% is calculated only from elapsed time
- Bad: leaving the bar in `Checking` after the pipeline requires teacher action

Some stages, such as a model call, do not expose meaningful partial completion.
During those stages the current milestone remains fixed and the active stage uses
an indeterminate animation. The UI must never manufacture movement to appear busy.

## Priority order

| ID | Priority | Backlog item | Owner | Dependency |
|---|---|---|---|---|
| CPT-001 | P0 | Replace simulated 94% with backend-authoritative checking progress | Mobile + backend | Checked-paper progress contract |
| CPT-002 | P0 | Stop extraction failures from becoming automatic zero-mark results | AI pipeline + backend | Evidence inventory and grading policy |
| CPT-003 | P1 | Make terminal and teacher-input states update reliably in the background | Mobile + backend | Polling, notifications, query reconciliation |

## CPT-001 — Backend-authoritative checking progress

### User problem

The current result screen derives a percentage from elapsed time, advances it
automatically, and caps it at 94%. Teachers interpret the number as real grading
progress even when the backend is blocked, finished, or waiting for review.

### Required experience

Display one authoritative stage at a time:

1. Upload received
2. Pages verified
3. Answers detected
4. Answers matched
5. Answers graded
6. Result ready for teacher review

Where the backend has real unit counts, show them. For example, `7 of 10 answers
graded`. Where it has no granular measurement, keep the completed milestone fixed
and animate only the active-stage indicator.

### Proposed API contract

The checked-paper response should expose a server-authored progress object:

```json
{
  "state": "running",
  "stage": "grading",
  "completed_stages": ["upload", "integrity", "evidence", "mapping"],
  "completed_units": 7,
  "total_units": 10,
  "percent": 83,
  "started_at": "2026-08-23T19:39:43Z",
  "stage_started_at": "2026-08-23T19:40:45Z"
}
```

`percent` is server-owned and represents completed workflow units. It is not an
ETA. The backend must return `state = needs_input`, `failed`, or `complete` as
soon as the corresponding transition is persisted.

### Acceptance criteria

- The mobile app deletes the elapsed-time calculation used to produce 10–94%.
- Progress never advances unless the backend records additional completed work.
- The stage label and percentage originate from the same response revision.
- Question-level progress is shown only when both numerator and denominator are authoritative.
- `100%` appears only when a reviewable result has been persisted.
- `needs_input` immediately replaces the checking bar with the reason and recovery action.
- A stalled stage says `Taking longer than usual` and shows elapsed time, without increasing the percentage.
- Offline or polling failure says `Connection paused`; it does not imply backend progress.
- Returning from the background immediately reconciles the latest server state.
- Accessibility text describes the stage and real unit count, not an estimated percentage.

### Likely code areas

- `src/screens/results/ResultDetailScreen.tsx`
- `src/screens/results/checkedPaperDetailModel.ts`
- `src/screens/workspace/checkedPaperPipelineModel.ts`
- `src/screens/workspace/CheckedPaperStatusScreen.tsx`
- `src/types/index.ts`
- `backend/app/api/v1/checked_papers.py`
- Checked-paper pipeline run models and serializers

## CPT-002 — Extraction failure must not become zero marks

### User problem

In the reported test, both pages passed integrity, but the evidence stage found no
candidate answer regions. Grading then emitted ten `No answer provided` results
and a provisional `0 / 21`. This is an extraction failure, not proof that the
student submitted a blank paper.

### Product rule

A system-level inability to detect answer regions must be separated from a
confirmed blank response. Zero marks require positive blank evidence or teacher
confirmation; absence of extracted evidence is not sufficient.

### Acceptance criteria

- If readable pages contain no extracted attempts, the pipeline stops at `needs_input`.
- The UI says `We could not detect the answers` rather than displaying a score.
- `total_score`, correct/incorrect/missed counts, and student-visible results remain withheld.
- The teacher can inspect the scan, retry extraction, replace the scan, or manually review it.
- A genuinely blank script can receive zero only through a distinct, auditable blank-confirmation decision.
- Typed, handwritten, mixed-format, faint, crossed-out, and image-heavy answer sheets are represented in evaluation fixtures.
- No extraction failure can be published to a student as an academic result.

## CPT-003 — Reliable completion and intervention updates

### User problem

Teachers should not remain on a stale `Checking` screen after the backend has
finished or requires intervention.

### Acceptance criteria

- Polling continues for every non-terminal processing state.
- `needs_input`, `ready_for_review`, `failed`, and `published` are terminal UI transitions.
- App resume, tab focus, and manual refresh reconcile the canonical server state.
- A background notification is sent when checking becomes ready or needs input.
- Duplicate polling responses and out-of-order revisions cannot move the UI backwards.
- The result list and open result detail converge on the same status without a full reload.

## QA scenarios

- Normal ten-question paper reaches 100% and opens teacher review.
- One long model call keeps the milestone fixed instead of manufacturing progress.
- No answer regions detected produces `Needs your input`, never 0 marks.
- Genuine blank paper follows the explicit blank-confirmation policy.
- Extraction succeeds for typed, handwritten, and mixed typed/handwritten answers.
- Backend finishes while the app is backgrounded; reopening shows the terminal state.
- Network disconnect preserves the last confirmed stage and shows connection status.
- A stale response arriving after a newer revision does not regress progress.
- Teacher input, retry, replacement upload, approval, and publication each show the correct next state.

## Definition of done

- Backend contract and state-transition tests pass.
- Mobile model, screen, polling, and accessibility tests pass.
- The reported Geography workflow is repeated end to end with a readable result.
- No elapsed-time-derived percentage remains in checked-paper UI code.
- Product, engineering, and QA sign off using persisted stage timestamps and result evidence.
