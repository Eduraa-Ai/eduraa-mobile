# B2B student exams evidence

Synthetic fixture: `b2b-exams-20260725`

## Rendered states

- `00-loading-workspace-390x844.png` — unified loading skeleton.
- `01-teacher-workspace-390x844.png` — Teacher section with the first actionable paper above the fold.
- `02-teacher-primary-action-390x844.png` — collapsed primary action.
- `02b-teacher-expanded-actions-390x844.png` — spacious Download and Retest action sheet.
- `03-teacher-expanded-actions-320x700.png` — compact Android action sheet above navigation.
- `03b-teacher-increased-type-320x700.png` — increased-scale readability check.
- `04-teacher-retest-confirmation-390x844.png` — fresh-attempt reassurance.
- `05-teacher-fresh-retest-390x844.png` — new blank attempt.
- `05b-retained-prior-result-390x844.png` — prior submitted attempt remains available.
- `06-practice-workspace-390x844.png` — long-title practice card with primary actions.
- `07-practice-expanded-actions-390x844.png` — Download, Retest, and practice-only Delete sheet.
- `07b-practice-expanded-actions-320x700.png` — compact Android practice action sheet.
- `07c-practice-increased-type-320x700.png` — increased-type practice action sheet.
- `08-download-success-390x844.png` — checked-result PDF success.
- `09-delete-confirmation-390x844.png` — destructive confirmation and teacher-exam boundary.
- `10-delete-success-390x844.png` — owned practice paper removed.
- `11-practice-error-390x844.png` — recoverable partial failure with visible Retry.
- `12-empty-teacher-390x844.png` — useful Teacher empty state.
- `13-empty-practice-390x844.png` — useful Practice empty state.

## Network proof

`network-audit.json` records synthetic-only writes:

- Teacher Retest used `reason: "retest"` and the matching `exam_id`.
- Download used the checked-paper submission endpoint.
- Delete targeted an owned practice-paper id.

No production write was performed.
