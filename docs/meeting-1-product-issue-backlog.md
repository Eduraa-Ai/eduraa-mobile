# Eduraa Mobile - Meeting 1 Product Issue Backlog

Source: `Meeting - 1.pdf` (meeting attachment; original PDF not committed)  
Meeting: July 25, 2026 at 00:21 EDT  
Reviewed: all 42 PDF pages (notes, decisions, action items, and transcript)

## How to use this backlog

- `P0` blocks a critical journey or risks data/security.
- `P1` breaks a major workflow or produces incorrect academic output.
- `P2` is important UX, consistency, or reliability work.
- `P3` is polish or a lower-risk enhancement.
- `Confirmed` means the behavior was directly described or demonstrated in the meeting.
- `Verify current main` means a fix may have landed since the meeting and must be reproduced before implementation.
- These are prepared issue specifications. They have not been posted to GitHub.

## Master backlog

| ID | Priority | Issue | Type | Status | Primary page(s) | Users |
|---|---|---|---|---|---|---|
| M1-001 | P1 | Restore readable LaTeX and formula rendering everywhere | Bug | Confirmed | Generated Paper, Check Paper, Agentic Learning | Student, teacher |
| M1-002 | P1 | Render question diagrams and images in generated papers | Bug | Confirmed | Generated Paper, Paper Attempt | Student, teacher |
| M1-003 | P1 | Include question images in PDF exports and previous papers | Bug | Confirmed | PDF Export, Previous Papers | Student, teacher |
| M1-004 | P1 | Allow a selected answer option to be unselected | Bug | Confirmed | Paper Attempt, Quiz | Student |
| M1-005 | P1 | Move paper generation to a reliable background workflow | Reliability | Confirmed | Generate Paper | Teacher, student |
| M1-006 | P1 | Automatically reconcile completed paper generation without manual refresh | Bug | Confirmed | Papers List, Generate Paper | Teacher, student |
| M1-007 | P2 | Add a custom exam duration option | Feature | Approved | Generate Paper | Teacher, student |
| M1-008 | P2 | Remove AI teacher instructions and inaccessible AI-mode controls | UX | Approved | Generate Paper | Teacher |
| M1-009 | P2 | Rename the ambiguous Partial result category to Wrong | UX/Data | Approved | Check Paper, Results | Teacher, student |
| M1-010 | P1 | Align questions, options, and LaTeX in checked-paper review | Bug | Confirmed | Check Paper | Teacher |
| M1-011 | P1 | Replace Original Scan tab with a useful detailed explanation view | UX | Approved | Check Paper | Teacher, student |
| M1-012 | P1 | Display original question context when answer data is missing | Bug | Confirmed | Check Paper | Teacher |
| M1-013 | P1 | Show question options in checked-paper review | Bug | Confirmed | Check Paper | Teacher |
| M1-014 | P2 | Add per-question review flags for incorrect backend answers | Feature | Approved | Check Paper | Teacher |
| M1-015 | P1 | Fix Start a Focus Repair routing to Agentic Learning | Bug | Confirmed | Check Paper, Agentic Learning | Student |
| M1-016 | P2 | Add Agentic Learning as a clear home/learning entry point | Navigation | Approved | Home, Learning | Student |
| M1-017 | P1 | Stop Agentic Learning from hanging on indefinite loading states | Reliability | Confirmed | Agentic Learning | Student |
| M1-018 | P1 | Preprocess or normalize lesson LaTeX before display | Bug | Confirmed | Agentic Learning | Student |
| M1-019 | P1 | Fix AI Studio profile-detail retrieval failures | Bug | Confirmed | AI Studio | All authenticated users |
| M1-020 | P2 | Redesign AI Studio navigation and conversation history | UX | Approved | AI Studio | All authenticated users |
| M1-021 | P1 | Normalize AI Studio response formatting, including LaTeX | Bug | Confirmed | AI Studio | All authenticated users |
| M1-022 | P2 | Remove the obsolete JWE Workspace launcher and code paths | Cleanup | Approved | Home, Workspace | All users |
| M1-023 | P2 | Standardize headers and navigation across web pages | Design system | Approved | All web pages | All users |
| M1-024 | P2 | Redesign mobile bottom navigation using the approved WhatsApp pattern | Mobile UX | Approved | Mobile shell | Mobile users |
| M1-025 | P1 | Add real-time mobile notifications for paper generation and checking | Feature | Approved | Mobile notifications | Student, teacher |
| M1-026 | P1 | Preserve authenticated dashboard queries after login | Bug | Confirmed | Login, Home | All authenticated users |
| M1-027 | P0 | Clear private query data safely on logout or account switch | Security | Approved | Authentication | All authenticated users |
| M1-028 | P1 | Verify Google login and backend integration on mobile | Integration | Confirmed | Mobile Login | Mobile users |
| M1-029 | P2 | Improve mobile first-start experience and startup reliability | Mobile UX | Confirmed | Mobile startup | Mobile users |
| M1-030 | P1 | Complete Previous Papers mobile access, filters, and paper handoff | Feature | Confirmed | Previous Papers | Student |
| M1-031 | P2 | Validate Open Library / revision-resource changes before merge | Delivery | Approved | Learning Resources | Student, reviewer |
| M1-032 | P2 | Add backend issue visibility and retry states for long-running jobs | Observability | Confirmed | Generate Paper, Check Paper | Teacher, support |

## Detailed issue specifications

### M1-001 - Restore readable LaTeX and formula rendering everywhere

- Evidence: 00:01:50-00:04:01 and 00:07:03.
- Problem: Formulas render as raw symbols or malformed text in generated papers, checked papers, and Agentic Learning.
- Likely code areas: markdown/math renderer, generated-paper question components, result evidence components, Agentic lesson renderer.
- Acceptance criteria:
  - Inline and block formulas render correctly on web, Android, and iOS.
  - Raw LaTeX wrappers are not shown to users.
  - Invalid formulas fall back to readable source text without crashing.
  - Snapshot coverage includes fractions, superscripts, subscripts, roots, matrices, and units.

### M1-002 - Render question diagrams and images in generated papers

- Evidence: 00:04:01-00:07:03.
- Problem: Question text and options appear, but diagrams do not.
- Acceptance criteria:
  - Relative and absolute protected image URLs resolve correctly.
  - Images preserve aspect ratio and remain legible on small screens.
  - Loading, unavailable, and retry states are shown.
  - Authorization is sent only to trusted API origins.

### M1-003 - Include question images in PDF exports and previous papers

- Evidence: 00:51:50-01:05:29 and meeting action items.
- Problem: Image-based questions are missing from generated PDFs and previous-paper PDFs.
- Acceptance criteria:
  - Exported PDFs include every available question image.
  - A failed image produces an explicit placeholder and diagnostic log.
  - Preview and downloaded PDF contain the same question set.

### M1-004 - Allow a selected answer option to be unselected

- Evidence: 00:07:03.
- Problem: Tapping the selected option cannot return the question to unanswered.
- Acceptance criteria:
  - Tapping an already-selected option clears it.
  - Draft persistence records the cleared state.
  - Answered/unanswered counters update immediately.
  - Submission accurately treats the cleared question as unanswered.

### M1-005 - Move paper generation to a reliable background workflow

- Evidence: 00:08:51, 01:00:03, and Decisions/Next Steps.
- Problem: Generation blocks the request, times out, or leaves users waiting without durable job state.
- Acceptance criteria:
  - Generation returns a durable job identifier quickly.
  - Work continues if the user leaves the page.
  - Duplicate taps do not create duplicate papers.
  - Failed jobs expose a retry action without losing selections.

### M1-006 - Reconcile generated papers without manual refresh

- Evidence: 00:08:51-00:10:26.
- Problem: A generated paper does not appear until the user refreshes.
- Acceptance criteria:
  - The paper list updates through polling, push, or query invalidation.
  - Completed jobs appear without a full page reload.
  - Refresh remains available as a recovery action.

### M1-007 - Add a custom exam duration option

- Evidence: 00:00:22.
- Acceptance criteria:
  - Users can select presets or enter a valid custom duration.
  - Minimum and maximum limits are explained.
  - Invalid, empty, negative, and nonnumeric values are blocked.
  - The selected duration is preserved through generation and attempts.

### M1-008 - Simplify AI-mode settings

- Evidence: 00:00:22-00:01:50.
- Problem: AI-mode controls and textbook visual settings are hard to access and unnecessary for the intended workflow.
- Acceptance criteria:
  - Remove AI teacher instructions from Generate Paper.
  - Remove or relocate inaccessible controls.
  - Preserve required backend defaults without exposing confusing UI.

### M1-009 - Rename Partial to Wrong

- Evidence: 00:10:26.
- Acceptance criteria:
  - User-facing labels use Correct, Wrong, and Missed.
  - API values remain backward compatible if the backend still emits `partial`.
  - Counts, filters, charts, and accessibility labels agree.

### M1-010 - Align checked-paper content

- Evidence: 00:10:26.
- Acceptance criteria:
  - Questions, answers, options, marks, and explanations have consistent alignment.
  - Long text and formulas do not overlap or clip.
  - Mobile and desktop layouts remain readable.

### M1-011 - Replace Original Scan with detailed explanation

- Evidence: 00:10:26-00:11:45.
- Acceptance criteria:
  - Remove the low-value Original Scan tab from the primary tab set.
  - Add a detailed explanation describing the solving approach and expected answer.
  - Preserve scan evidence through a secondary action when available.

### M1-012 - Display missing question context

- Evidence: 00:10:26-00:13:33.
- Problem: Some reviewed answers show answer data without the original question.
- Acceptance criteria:
  - Review never presents an answer without its question or a clear unavailable state.
  - Missing backend fields do not become fabricated content.
  - Users can flag incomplete records.

### M1-013 - Show options in checked-paper review

- Evidence: 00:13:33.
- Acceptance criteria:
  - MCQ options appear with the student selection and expected answer.
  - Unanswered questions clearly show no selected option.
  - Options remain readable with LaTeX and images.

### M1-014 - Add per-question review flags

- Evidence: 00:10:26-00:11:45.
- Acceptance criteria:
  - A reviewer can flag a specific question and add a reason.
  - Duplicate submissions are prevented.
  - The backend records question, submission, reporter, and status.
  - Users receive a confirmation and can see review status.

### M1-015 - Fix Focus Repair routing

- Evidence: 00:11:45-00:13:33.
- Problem: Start a Focus Repair redirects to Generate Paper instead of Agentic Learning.
- Acceptance criteria:
  - The action opens the matching Agentic concept/lesson.
  - Missing concept mappings show a recoverable explanation.
  - Back navigation returns to the originating result.

### M1-016 - Add Agentic Learning entry point

- Evidence: 00:13:33.
- Acceptance criteria:
  - Student Home or Learning has a clearly labeled Agentic Learning action.
  - Role-ineligible users do not see a dead entry point.
  - Deep links and back navigation work.

### M1-017 - Fix indefinite Agentic Learning loading

- Evidence: 00:15:35-00:21:21.
- Acceptance criteria:
  - Loading has a timeout and human-readable failure state.
  - Retry does not duplicate requests.
  - Cached usable results remain visible during refresh failures.
  - Diagnostics distinguish API, content, and rendering failures.

### M1-018 - Normalize Agentic lesson LaTeX

- Evidence: 00:15:35.
- Acceptance criteria:
  - Lesson content is normalized before rendering.
  - Malformed backend content degrades safely.
  - The result appears directly when already available rather than replaying generation.

### M1-019 - Fix AI Studio profile retrieval

- Evidence: 00:21:21-00:24:06.
- Acceptance criteria:
  - AI Studio opens for every supported role.
  - Missing optional profile data does not block chat.
  - The error state identifies recovery steps without exposing private data.

### M1-020 - Redesign AI Studio navigation and history

- Evidence: 00:21:21-00:26:30.
- Acceptance criteria:
  - Conversation history is clear and easy to reopen.
  - The left rail is responsive and not visually cramped.
  - New chat, history, and current conversation states are distinct.

### M1-021 - Normalize AI Studio response formatting

- Evidence: 00:21:21-00:24:06.
- Acceptance criteria:
  - Markdown, lists, code, and LaTeX render consistently.
  - Streaming does not duplicate or reorder content.
  - Saved and restored conversations match the original formatting.

### M1-022 - Remove obsolete JWE Workspace

- Evidence: 00:26:30-00:37:52.
- Acceptance criteria:
  - Remove the Home launcher, route, components, and dead code.
  - Existing valid workspace features remain available through their supported routes.
  - No broken links or navigation keys remain.

### M1-023 - Standardize web headers and navigation

- Evidence: 00:30:23-00:33:42.
- Acceptance criteria:
  - Pages use one shared header/navigation system.
  - Active, hover, mobile, and keyboard-focus states are consistent.
  - Legacy page-specific headers are removed after migration.

### M1-024 - Redesign mobile bottom navigation

- Evidence: 00:40:51-00:49:27.
- Acceptance criteria:
  - Use the approved simple, floating WhatsApp-inspired pattern.
  - Keep labels understandable and accessible.
  - Respect safe areas, small screens, keyboard, and touch targets.
  - Avoid hiding required role-specific destinations.

### M1-025 - Add real-time mobile notifications

- Evidence: 00:37:52.
- Acceptance criteria:
  - Notify when paper generation completes or fails.
  - Notify when checking completes or requires attention.
  - Tapping a notification opens the exact paper/result.
  - Permissions, denial, foreground, background, and duplicate delivery are handled.

### M1-026 - Preserve dashboard query after login

- Evidence: 01:09:50 and meeting Decisions.
- Acceptance criteria:
  - The first authenticated dashboard request is not cleared during identity initialization.
  - Login does not flash empty data or require manual refresh.
  - Automated tests cover initial sign-in.
- Note: PR #8 / `queryCacheScope` may already address this; verify before reopening.

### M1-027 - Clear private query data safely

- Evidence: Decisions and 01:09:50.
- Acceptance criteria:
  - Logout and account switching clear prior-user private cache.
  - Initial login does not clear the new user’s first request.
  - Public cache may remain when safe.
  - Tests cover login, logout, unchanged identity, and account switch.

### M1-028 - Verify Google login on mobile

- Evidence: 00:33:42 and 01:14:58 onward.
- Acceptance criteria:
  - Android and iOS Google login complete against the correct backend.
  - Cancellation and provider errors are recoverable.
  - Session restoration works after app restart.

### M1-029 - Improve mobile first-start experience

- Evidence: 00:33:42 and 01:14:58.
- Acceptance criteria:
  - First launch explains the next action.
  - Startup has branded loading, offline, and retry states.
  - No blank screen or indefinite spinner.

### M1-030 - Complete Previous Papers mobile workflow

- Evidence: 00:51:50-01:09:50.
- Acceptance criteria:
  - Students can reach Previous Papers from a visible entry point.
  - Exam, year, subject, and chapter filtering works.
  - Question preview shows text, options, formulas, and images.
  - Start/resume handoff opens the correct attempt.
  - PDF export and image questions work.
- Note: PR #6 was merged and later reverted by PR #9; current behavior must be re-evaluated.

### M1-031 - Validate Learning Resources before merge

- Evidence: 00:51:50-00:56:35.
- Acceptance criteria:
  - Review the open PR and resolve conflicts.
  - Verify library, revision resources, detail pages, and role access.
  - Require typecheck, tests, and mobile QA before approval.

### M1-032 - Add job visibility and retry

- Evidence: 00:08:51, 00:18:28, and 01:00:03.
- Acceptance criteria:
  - Long-running generation/checking jobs expose queued, running, completed, and failed states.
  - Support can correlate a UI job with backend logs.
  - Retry is idempotent and preserves user selections.

## Issues grouped by page / workflow

### Authentication and startup

- M1-026 - Preserve dashboard query after login
- M1-027 - Clear private query data safely
- M1-028 - Verify Google login on mobile
- M1-029 - Improve mobile first-start experience

### Home and application shell

- M1-016 - Add Agentic Learning entry point
- M1-022 - Remove obsolete JWE Workspace
- M1-023 - Standardize web headers/navigation
- M1-024 - Redesign mobile bottom navigation
- M1-025 - Add real-time mobile notifications

### Generate Paper

- M1-001 - LaTeX rendering
- M1-002 - Question images
- M1-005 - Background generation
- M1-006 - Automatic reconciliation
- M1-007 - Custom duration
- M1-008 - Simplify AI-mode settings
- M1-032 - Job visibility and retry

### Papers, attempts, and quizzes

- M1-002 - Question images
- M1-004 - Unselect answer option
- M1-006 - Automatic paper refresh
- M1-007 - Custom duration propagation

### Check Paper and Results

- M1-001 - LaTeX rendering
- M1-009 - Partial to Wrong
- M1-010 - Content alignment
- M1-011 - Detailed explanation
- M1-012 - Missing question context
- M1-013 - Question options
- M1-014 - Review flags
- M1-015 - Focus Repair routing
- M1-025 - Checking notifications
- M1-032 - Checking job visibility

### Agentic Learning

- M1-001 - LaTeX rendering
- M1-015 - Focus Repair routing
- M1-016 - Home/learning entry
- M1-017 - Loading reliability
- M1-018 - Lesson content normalization

### AI Studio

- M1-019 - Profile retrieval
- M1-020 - Navigation/history redesign
- M1-021 - Response formatting

### Previous Papers

- M1-003 - Images in PDF export
- M1-030 - Complete mobile workflow

### Learning Resources

- M1-031 - Validate library PR and workflow

### Shared backend / platform

- M1-005 - Background generation
- M1-025 - Notifications
- M1-027 - Private cache security
- M1-032 - Job observability and retry

## Issues grouped by user role

### B2C / competitive student

- M1-001, M1-002, M1-003 - Correct formulas and images
- M1-004 - Clear selected answers
- M1-006, M1-007 - Reliable papers and correct timing
- M1-009, M1-011 - Clear result categories and explanations
- M1-015, M1-016, M1-017, M1-018 - Reliable Agentic Learning
- M1-019, M1-020, M1-021 - Working AI Studio
- M1-024, M1-025, M1-029 - Mobile navigation, notifications, startup
- M1-030, M1-031 - Previous Papers and Learning Resources

### School student

- M1-001, M1-002, M1-003, M1-004 - Accurate paper content and attempts
- M1-009, M1-011, M1-015 - Understandable results and repair routing
- M1-016, M1-017, M1-018 - Agentic Learning
- M1-024, M1-025, M1-028, M1-029 - Mobile experience

### Teacher

- M1-001, M1-002, M1-003 - Accurate generated/exported papers
- M1-005, M1-006, M1-007, M1-008 - Reliable generation workflow
- M1-009 through M1-014 - Trustworthy checked-paper review
- M1-019 through M1-021 - AI Studio
- M1-025, M1-032 - Notifications and job visibility

### Admin / principal / developer

- M1-019 through M1-023 - AI Studio and workspace cleanup
- M1-025 - Notification infrastructure
- M1-027 - Private-cache security
- M1-032 - Operational visibility

### Mobile-only users

- M1-024 - Bottom navigation
- M1-025 - Push notifications
- M1-028 - Google authentication
- M1-029 - First startup
- M1-030 - Previous Papers access

### Support / QA / reviewers

- M1-014 - Per-question review flags
- M1-026, M1-027 - Authentication/cache regression coverage
- M1-030, M1-031 - PR and workflow verification
- M1-032 - Job diagnostics

## Cross-role shared issues

These should be implemented once at the platform/design-system level rather than separately per user:

- M1-001 - Shared math renderer
- M1-002 and M1-003 - Shared protected-media pipeline
- M1-023 and M1-024 - Shared navigation primitives
- M1-025 - Shared notification service
- M1-026 and M1-027 - Shared query-cache identity lifecycle
- M1-032 - Shared async-job status model

## Recommended implementation order

### Phase 1 - Correctness, security, and blockers

1. M1-027 - Private query data security
2. M1-001 - LaTeX correctness
3. M1-002 and M1-003 - Question/PDF images
4. M1-005, M1-006, M1-032 - Generation reliability
5. M1-010, M1-012, M1-013 - Checked-paper correctness
6. M1-015 and M1-017 - Agentic routing/loading

### Phase 2 - Complete core journeys

1. M1-030 - Previous Papers
2. M1-009, M1-011, M1-014 - Result/review experience
3. M1-019 and M1-021 - AI Studio reliability
4. M1-025 - Notifications
5. M1-028 and M1-029 - Mobile login/startup

### Phase 3 - UX consistency and polish

1. M1-007 and M1-008 - Generate Paper simplification
2. M1-016 - Agentic entry
3. M1-020 - AI Studio redesign
4. M1-022 - Workspace cleanup
5. M1-023 and M1-024 - Web/mobile navigation
6. M1-031 - Learning Resources PR verification

## Items requiring product clarification

1. Whether `Partial` must change only in the UI or also in persisted/API values.
2. Whether Original Scan is removed entirely or retained behind a secondary evidence action.
3. Exact minimum/maximum custom exam duration.
4. Which roles should receive each notification type.
5. Whether B2C students should receive assigned school exams in the Exams workspace.
6. Which branch/PR is now authoritative for Previous Papers after PR #9 reverted PR #6.
7. Whether Learning Resources is approved for all students or only competitive-exam profiles.
