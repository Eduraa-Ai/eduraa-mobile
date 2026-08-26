# Teacher Review Decision Experience — Product and Delivery Plan

Created: August 23, 2026  
Status: Proposed for product and engineering sign-off  
Priority: P0 trust and usability  
Product area: Uploaded answer sheets → AI checking → teacher confirmation → publication

## 1. Executive decision

Eduraa must do the checking work and ask the teacher only for decisions that genuinely require professional judgment.

The product contract is:

1. A teacher uploads an answer sheet.
2. Eduraa verifies the file, extracts answers, maps them to questions, and proposes marks.
3. If checking succeeds, the result becomes ready for teacher review.
4. If uncertainty remains, Eduraa names the exact issue, scope, evidence, and available decisions.
5. The teacher reviews only the affected paper, page, or questions—not the entire script by default.
6. The teacher confirms final marks through one explicit, auditable action.
7. Publishing to the student remains a separate deliberate action.

AI output is a proposal. Teacher-confirmed marks are final. A confidence flag is not a grading failure and must not discard a usable provisional result.

## 2. Observed problem

The live Geography test produced a valid provisional result of 18/21 across 10 questions. The remaining flags were:

- answer-sheet language could not be verified for automatic release;
- a question type was not calibrated for automatic release.

The current experience then:

- labels the result only as `Needs your input`;
- does not explain the required action on the report screen;
- sends the teacher to `Review paper issue`;
- asks the teacher to review all 10 questions;
- displays `Student answer: Not detected` even where evaluator feedback contains the extracted response;
- requires one `Accept AI mark` action per question;
- separates scan evidence from the mark editor;
- hides final confirmation until every question is individually acknowledged.

This is technically completable but not teacher-usable at a production quality bar.

## 3. Product goals

### Primary goal

A teacher can understand why intervention is required, verify the relevant evidence, and confirm or correct final marks with minimum safe effort.

### Supporting goals

- Preserve trust by clearly separating AI suggestions, confidence flags, teacher decisions, and published results.
- Never describe missing data, authorization failure, or a server failure as a generic connection issue.
- Never require whole-paper review when the backend can identify a smaller affected scope.
- Preserve every teacher edit through refresh, retry, app backgrounding, and conflict recovery.
- Keep web and mobile behavior contract-equivalent while using a mobile-appropriate layout.

### Non-goals

- Automatically publishing flagged results.
- Removing teacher ownership of final marks.
- Hiding genuine extraction, mapping, calibration, or integrity uncertainty.
- Rewriting the complete checked-paper pipeline.
- Fabricating student answers or question evidence on the client.

## 4. Experience principles

1. **Name the decision, not the internal state.** Use `2 checks need confirmation`, not only `Needs your input`.
2. **Show scope.** Every issue must identify the paper, pages, questions, or clearly state that it is paper-wide.
3. **Evidence beside action.** The scan, extracted answer, expected answer, AI reason, and editable mark belong in one review context.
4. **Review exceptions, not everything.** Unaffected AI marks remain visible and can be accepted together.
5. **One primary action per step.** Avoid competing review, exception, confirmation, and navigation actions.
6. **Confirmation is explicit.** Summarize the proposed final score and changed questions before saving.
7. **Publication is separate.** Confirming marks must not silently publish them.
8. **Failures are recoverable.** Preserve work and provide retry, replace scan, sign in, or return-later actions as appropriate.

## 5. Target teacher journey

### A. Result summary

Header:

> **2 checks need your confirmation**  
> Eduraa graded all 10 questions and suggests **18/21**.

Show:

- 8 correct, 2 incorrect, 0 unanswered;
- provisional score 18/21;
- two concise issue summaries;
- affected scope, such as `Paper-wide language check` or `Questions 8 and 9`;
- primary action: `Review 2 checks`;
- secondary actions: `View full result`, `View original scan`, and `Replace scan` only when relevant.

### B. Focused review

For each issue:

- plain-language explanation;
- why teacher confirmation is required;
- affected question/page scope;
- original scan evidence;
- extracted student answer;
- expected answer or rubric;
- AI-suggested mark and reason;
- editable teacher mark;
- `Accept suggestion` and `Change mark` actions.

If an issue is paper-wide but does not invalidate question marks, it must be a single paper-level confirmation—not ten question acknowledgements.

### C. Final decision

Show before saving:

- `Final score: 18/21`;
- `8 AI marks accepted`;
- `2 reviewed`;
- any changed questions and old/new marks;
- unresolved issues, if any;
- primary action: `Confirm final marks`.

After confirmation:

- show a saved success state;
- record teacher, timestamp, revision, accepted issues, and mark changes;
- expose `Publish to student` only when policy and permissions allow it.

## 6. State and decision model

| State | Teacher meaning | Primary action | Result visibility |
|---|---|---|---|
| Checking | Eduraa is still processing | Leave and return later | No fabricated score |
| Needs confirmation | A provisional result exists with scoped uncertainty | Review N checks | Provisional teacher-only result |
| Checking failed | No trustworthy result could be produced | Retry or replace scan | No academic score |
| Ready for review | Checking completed without blocking uncertainty | Review and confirm | Teacher-visible result |
| Marks confirmed | Teacher final decision saved | Publish when ready | Final teacher result |
| Published | Student can view the result | Revoke with reason if authorized | Student-visible result |

Rules:

- `Needs confirmation` and `Checking failed` must never share the same message or recovery action.
- A missing extracted answer is not the same as a confirmed unanswered question.
- A paper-level confidence flag must not automatically mark every question as unreviewed.
- The client must not infer student answers by parsing narrative evaluator feedback.
- A stale revision must never overwrite a newer teacher decision.

## 7. Prioritized backlog

| ID | Priority | Outcome | Owner | Dependency |
|---|---|---|---|---|
| TDR-001 | P0 | Replace vague report status with issue count, scope, and next action | Product + mobile | Existing blocker payload |
| TDR-002 | P0 | Return canonical student-response evidence in the checked-paper contract | Backend + AI pipeline | Evidence/mapping persistence |
| TDR-003 | P0 | Review only affected questions or one paper-level confirmation | Backend + mobile | Scoped blocker contract |
| TDR-004 | P0 | Add accept-all-unchanged marks with final summary confirmation | Mobile + backend | Audited review mutation |
| TDR-005 | P0 | Show protected scan evidence in the focused review context | Mobile | Protected scan/page endpoints |
| TDR-006 | P0 | Separate mark confirmation from publication | Backend + mobile | Permission and status contract |
| TDR-007 | P1 | Preserve review drafts and recover from stale revisions | Mobile + backend | Row-version conflict handling |
| TDR-008 | P1 | Add actionable notifications for ready and needs-confirmation states | Backend + mobile | Notification infrastructure |
| TDR-009 | P1 | Instrument the teacher review funnel and failure taxonomy | Backend + analytics | Event schema approval |
| TDR-010 | P2 | Add keyboard/accessibility review efficiency for web and tablets | Web + mobile | Stable focused-review UX |

## 8. Detailed requirements and acceptance criteria

### TDR-001 — Clear status and next action

Requirements:

- Replace `Needs your input` as the sole explanation with `N checks need confirmation`.
- Display each issue in teacher language with scope and severity.
- Replace `Review paper issue` with `Review N checks` when a provisional result exists.
- Keep student learning advice separate from teacher workflow instructions.

Acceptance criteria:

- A first-time teacher can state what is wrong and what to do next from the result screen alone.
- Zero issues never render a review CTA.
- Missing scope is explicitly labelled `Whole paper` rather than silently mapping to every question.
- Long issue text remains readable at narrow width and increased text size.

### TDR-002 — Canonical response evidence

Requirements:

- Every grading result exposes a structured response state: `detected`, `unanswered`, `unavailable`, or `ambiguous`.
- Detected text/selection is returned in a canonical response field.
- Evidence citations include page and region when available.
- The client stops parsing narrative AI feedback to reconstruct student answers.

Acceptance criteria:

- `Not detected` cannot appear when the backend has persisted a detected answer.
- `Unanswered` requires affirmative blank evidence or an audited teacher decision.
- Missing response evidence does not silently become zero marks.
- MCQ, short answer, long answer, mixed handwriting, and crossed-out responses have contract fixtures.

### TDR-003 — Scoped review

Requirements:

- Every blocker carries `scope_type`, affected identifiers, teacher-resolvable status, and recommended action.
- The review screen contains only affected questions plus a collapsed summary of unaffected marks.
- Paper-level checks are confirmed once.

Acceptance criteria:

- A two-question issue never creates ten mandatory question acknowledgements.
- A paper-wide language confirmation requires one decision unless specific answers are uncertain.
- The teacher can expand unaffected questions for inspection without making them mandatory.
- Unresolved blocking issues prevent confirmation and explain why.

### TDR-004 — Efficient mark acceptance

Requirements:

- Offer `Accept all unchanged AI marks` when every suggested score is valid.
- Require a final score summary before persistence.
- Allow individual mark edits within question maximums.
- Protect the mutation with revision checking and duplicate-submit prevention.

Acceptance criteria:

- Accept-all does not publish the result.
- The confirmation summary identifies every changed question.
- Invalid, empty, negative, non-numeric, and over-maximum marks cannot be submitted.
- Double taps create one teacher-review decision.
- A 409 conflict preserves drafts, refreshes canonical state, and asks the teacher to reconfirm.

### TDR-005 — Evidence beside marks

Requirements:

- Mobile: expandable scan page above or below the active question with page jump and zoom/open-full-screen.
- Desktop/tablet: scan and grading evidence may use a split view.
- Use the canonical authenticated checked-paper scan/page endpoints.

Acceptance criteria:

- The relevant scan page opens from each affected question.
- Missing scan, expired session, permission failure, and network failure have distinct messages and actions.
- Scan access remains tenant- and role-protected.
- Loading or reopening evidence does not erase mark drafts.

### TDR-006 — Confirmation and publication

Requirements:

- Save teacher-confirmed marks first.
- Publish only through a separate permission-gated action.
- Record who confirmed, when, source revision, issue acknowledgements, and mark changes.

Acceptance criteria:

- A successful mark confirmation produces a stable `Marks confirmed` state.
- Students cannot access provisional or unpublished results.
- Unauthorized roles cannot confirm or publish.
- Revoke requires a reason and preserves the audit trail.

## 9. Proposed API additions

Prefer extending the existing checked-paper response rather than creating a parallel review system.

Illustrative contract:

```json
{
  "review_summary": {
    "state": "needs_confirmation",
    "issue_count": 2,
    "affected_question_count": 2,
    "suggested_score": 18,
    "max_score": 21
  },
  "review_issues": [
    {
      "issue_id": "...",
      "code": "language_not_verified",
      "scope_type": "paper",
      "question_ids": [],
      "page_numbers": [],
      "teacher_resolvable": true,
      "blocks_confirmation": true,
      "title": "Confirm answer-sheet language",
      "message": "Eduraa detected English but needs teacher confirmation.",
      "recommended_action": "confirm_language"
    }
  ],
  "grading_results": [
    {
      "question_id": "...",
      "response_state": "detected",
      "student_response": "D",
      "evidence_citations": [{ "page": 1, "region_id": "..." }],
      "suggested_score": 1,
      "max_score": 1
    }
  ]
}
```

Exact field names require backend schema review. The required semantics are not optional.

## 10. Delivery plan

### Phase 0 — Contract and UX sign-off

Estimated effort: 1–2 working days.

- Confirm product state model and terminology.
- Map existing blocker codes to paper/page/question scope.
- Approve mobile focused-review wireframe and desktop parity behavior.
- Capture baseline teacher-review events before changing the funnel where possible.
- Produce API examples for success, scoped uncertainty, missing scan, and failed checking.

Exit gate: product, backend, mobile, web, and QA agree on state meanings and payload ownership.

### Phase 1 — Data correctness and auditability

Estimated effort: 2–4 working days.

- Add canonical response state and student response fields.
- Add scoped review issue data.
- Ensure teacher review mutation is revision-safe, auditable, and idempotent.
- Preserve backward compatibility for older checked-paper records.
- Add API/state-transition tests.

Exit gate: clients no longer need feedback parsing or all-question fallback for scoped issues.

### Phase 2 — Teacher decision experience

Estimated effort: 3–5 working days.

- Update result summary copy, issue count, scope, and CTA.
- Build focused exception review.
- Add protected scan evidence in context.
- Add accept-all, individual edits, final score summary, and separate confirm/publish actions.
- Implement loading, empty, offline, permission, missing-file, retry, and stale-revision states.
- Preserve review drafts across navigation and app backgrounding.

Exit gate: the Geography test is completable without reviewing ten unaffected questions.

### Phase 3 — Cross-platform QA and hardening

Estimated effort: 2–3 working days.

- Run contract, model, type, integration, build/export, and end-to-end checks.
- Test teacher, principal/admin, student, and unauthorized roles.
- Test narrow phone, large phone, tablet/desktop, increased text size, and keyboard navigation.
- Test slow network, offline recovery, expired session, missing scan, 409 conflict, duplicate tap, and app resume.
- Verify web/mobile behavioral parity using the same paper and role.

Exit gate: zero severity-one defects and no unresolved academic-correctness or authorization defects.

### Phase 4 — Controlled release

Estimated effort: 3–5 pilot days before broad rollout.

- Release behind an existing safe rollout mechanism if available.
- Pilot with internal/test teachers and representative paper types.
- Monitor review completion, errors, overrides, and scan access failures.
- Compare confirmed scores and audit trails against manual review samples.
- Roll forward after sign-off; disable the new surface if academic correctness or authorization regresses.

## 11. Critical path and dependencies

```text
Product state decision
  → scoped blocker + response contract
  → backend persistence and audit mutation
  → mobile/web focused review
  → end-to-end academic QA
  → teacher pilot
  → rollout
```

Dependencies:

- `checked-paper-trust-backlog.md` CPT-002 for extraction failure versus unanswered policy.
- Canonical protected scan and page endpoints.
- Existing row-version/idempotency conventions for teacher decisions.
- Role and publication visibility rules.
- Representative typed, handwritten, mixed-format, faint, crossed-out, and image-heavy test papers.

## 12. Ownership model

| Responsibility | Accountable role | Responsible roles |
|---|---|---|
| Product policy and acceptance | Product owner | Product manager, teacher representative |
| Interaction and copy | Product design | Product manager, mobile/web leads |
| Review and evidence contract | Backend lead | AI pipeline engineer, mobile/web leads |
| Academic evidence correctness | AI/assessment lead | Backend engineer, teacher QA reviewer |
| Mobile implementation | Mobile lead | Mobile engineers |
| Web parity | Web lead | Web engineers |
| Test strategy and release gate | QA lead | Engineering leads, teacher pilot group |
| Rollout decision | Product owner | Engineering lead, QA lead, operations |

Named individuals should be assigned during planning; this document does not invent ownership.

## 13. QA matrix

### Academic scenarios

- Clean MCQ paper with no flags.
- Long-answer paper with one low-confidence mapping.
- Paper-wide language confirmation with otherwise complete grading.
- Typed, handwritten, and mixed typed/handwritten responses.
- Crossed-out and replaced answers.
- Genuinely unanswered question.
- Extraction failure with readable scan.
- Missing question or answer-key context.
- Teacher changes one mark and accepts the rest.
- Teacher accepts all suggestions unchanged.

### Reliability scenarios

- Slow scan loading.
- Offline during review, then reconnect.
- Session expiry while opening evidence.
- App backgrounded with unsaved mark drafts.
- Duplicate confirm tap.
- Stale row version after another reviewer changes the paper.
- Backend 4xx/5xx response.
- Missing scan on disk.
- Retry after partial failure.

### Permission scenarios

- Assigned teacher confirms marks.
- Teacher without student access is denied.
- Principal/admin behavior follows explicit policy.
- Student cannot access provisional result.
- Student sees the result only after publication.
- Cross-school document and result access is denied.

## 14. Measurement plan

Instrument events without storing answer text or sensitive scan content in analytics:

- review summary viewed;
- issue review started;
- scan evidence opened or failed, with failure category;
- issue accepted, mark changed, or scan replaced;
- accept-all selected;
- confirmation attempted, succeeded, conflicted, or failed;
- review abandoned and later resumed;
- result published.

Core measures:

- time from opening the result to confirmed marks;
- mandatory actions per confirmed paper;
- review completion and abandonment rates;
- percentage of flags resolved without replacement upload;
- teacher override rate by issue code and question type;
- scan-evidence open failure rate;
- stale-revision and duplicate-submit rate;
- percentage of confirmed results later revoked or corrected.

Do not invent numerical success targets before collecting a baseline. Academic data loss, unauthorized access, silent publication, and extraction failure presented as a genuine zero are zero-tolerance release blockers.

## 15. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Accept-all encourages rubber-stamping | Incorrect marks confirmed | Show issue scope and final summary; exclude unresolved blocking items |
| Backend scope data is incomplete | Wrong questions omitted | Fall back to explicit paper-level review, never silently infer scope |
| Legacy records lack response fields | Contradictory UI | Label evidence unavailable and allow scan review; do not parse prose as truth |
| Two reviewers edit concurrently | Lost teacher work | Row-version conflict handling, preserved drafts, reconfirmation |
| Scan viewer fails | Teacher cannot verify | Protected page endpoint, actionable failure categories, retry/full-screen fallback |
| Confirmation accidentally publishes | Student sees unapproved result | Separate mutations and permission-gated publication |
| Metrics capture sensitive content | Privacy exposure | Event metadata only; no answers, scan URLs, or tokens |
| Mobile screen becomes too dense | Slow review | Focus one issue/question at a time; progressive disclosure and persistent summary |

## 16. Definition of done

- Product terminology and state model are approved.
- Backend returns structured response evidence and scoped issues.
- Mobile and web provide contract-equivalent teacher decisions.
- The teacher can accept unchanged marks in bulk and edit exceptions individually.
- Scan evidence is accessible in the review context without exposing protected URLs.
- Confirmation and publication are separate, authorized, audited transitions.
- Drafts survive navigation, retry, backgrounding, and conflict recovery.
- Relevant unit, contract, integration, type, build/export, and end-to-end tests pass.
- The exact Geography 18/21 scenario is repeated successfully.
- A teacher pilot confirms that the required action is understandable without coaching.
- Product, engineering, QA, and teacher representative sign off before broad rollout.

## 17. Immediate next actions

1. Product owner approves this product decision and terminology.
2. Backend lead audits current blocker scope and response-evidence payloads against TDR-002/TDR-003.
3. Product design produces the result-summary and focused-review wireframes.
4. Engineering splits TDR-001 through TDR-006 into reviewable implementation tickets.
5. QA prepares the Geography regression fixture and the academic/reliability matrix.
6. Team estimates after contract discovery; provisional total delivery range is 8–14 working days plus the controlled pilot.

