# Previous Papers verification

- Seed: `pr6-pyq-20260725`
- Fixture: `test-artifacts/ai-studio/mock-server.mjs`
- App API: temporary validation override `EXPO_PUBLIC_API_URL=http://localhost:8000`
- Render target: React Native Web at Android-sized viewports
- Capture runner: `node scripts/capture-previous-papers.mjs`

## Captures

| File | Viewport | Verified state |
| --- | --- | --- |
| `nav-{home,learning,papers,results,profile,previous}-390x844.png` | 390 x 844 | Every eligible student root tab selected with the active orb fully visible |
| `nav-{home,learning,papers,results,profile,previous}-320x700.png` | 320 x 700 | All six eligible student tabs fit and render correctly on a compact phone |
| `00-library-loading-390x844.png` | 390 x 844 | Initial archive loading |
| `01-library-error-390x844.png` | 390 x 844 | Recoverable library failure |
| `02-library-390x844.png` | 390 x 844 | Search, filters, published papers, and independent bottom tab |
| `03-library-empty-390x844.png` | 390 x 844 | Honest empty archive |
| `04-builder-full-paper-390x844.png` | 390 x 844 | Full-paper mode with optional timer controls |
| `05-builder-multi-subject-390x844.png` | 390 x 844 | Physics and Chemistry selected together with 6 available questions |
| `06-builder-multi-chapter-390x844.png` | 390 x 844 | Chapters selected across Physics and Chemistry with 3 available questions |
| `06a-chapters-error-390x844.png` | 390 x 844 | Recoverable chapter-list failure with paper, mode, and subjects preserved |
| `06a2-chapters-recovered-390x844.png` | 390 x 844 | Chapter-list retry succeeds without changing paper, mode, or subjects |
| `06b-questions-error-390x844.png` | 390 x 844 | Recoverable question-list failure with the multi-chapter selection preserved |
| `06c-builder-untimed-390x844.png` | 390 x 844 | No-timer practice selection and complete start actions |
| `06d-builder-custom-timer-390x844.png` | 390 x 844 | 90-minute custom timer selection and complete start actions |
| `06e-builder-multi-chapter-320x700.png` | 320 x 700 | Compact builder with strongly marked cross-subject selections |
| `06f-builder-untimed-320x700.png` | 320 x 700 | Compact untimed builder with both start actions clear of navigation |
| `06g-builder-custom-timer-320x700.png` | 320 x 700 | Compact 90-minute timer selection with both start actions |
| `06h-timed-attempt-390x844.png` | 390 x 844 | Timed handoff displays the selected countdown in the attempt player |
| `07-preview-390x844.png` | 390 x 844 | Searchable question preview |
| `08-preview-320x700.png` | 320 x 700 | Compact-phone initial preview |
| `09-answer-revealed-320x700.png` | 320 x 700 | On-demand answer reveal |
| `09b-solution-revealed-320x700.png` | 320 x 700 | Fully expanded worked solution |
| `10-preview-end-320x700.png` | 320 x 700 | Final preview content and actions clear the bottom navigation |
| `11-resume-choice-390x844.png` | 390 x 844 | Same-selection unfinished-attempt choice without history browsing |
| `12-assembly-error-390x844.png` | 390 x 844 | Recoverable start failure with preserved selection |
| `13-assembly-390x844.png` | 390 x 844 | Server-request assembly progress with preserved selection |
| `14-attempt-handoff-390x844.png` | 390 x 844 | Untimed multi-chapter start opens the existing Attempt Paper player without a countdown |
| `14b-selected-option-cleared-390x844.png` | 390 x 844 | Tapping the selected MCQ option again clears it and updates every progress count to 0/3 |
| `15-library-back-home-390x844.png` | 390 x 844 | Library Back returns to Home; source guard also covers no-history fallback |
| `16-ineligible-home-390x844.png` | 390 x 844 | Ineligible B2C school learner does not receive the Previous Papers tab |
| `17-checking-attempt-again-390x844.png` | 390 x 844 | Submitted attempt polls real checking progress, displays the returned percentage, and offers Attempt again |
| `18-fresh-attempt-390x844.png` | 390 x 844 | Attempt again opens a new blank 0/3 attempt |
| `19-return-from-attempt-390x844.png` | 390 x 844 | Leaving the shared player restores the selected Previous Papers root tab and prior preview state |

PNG captures are intentionally gitignored. Regenerate them from the synthetic
fixture before a visual review rather than treating old screenshots as source
of truth.

## Synthetic failure controls

Set a state with:

```sh
curl -fsS -X POST http://localhost:8000/__test__/previous-papers-mode \
  -H 'Content-Type: application/json' \
  --data '{"mode":"papers-error"}'
```

Supported modes are `ready`, `loading`, `empty`, `papers-error`,
`papers-error-once`, `chapters-error`, `questions-error`, `start-error`,
`reused`, and `slow-start`.
