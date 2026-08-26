# Eduraa Mobile - Meeting 2 Implementation Backlog

Source: `Meeting - 2.pdf` (meeting attachment; original PDF not committed)  
Meeting: July 26, 2026 at 00:12 EDT  
Reviewed: all 12 PDF pages (summary, decisions, next steps, details, and transcript)  
GitHub tracker: [#24](https://github.com/Eduraa-Ai/eduraa-mobile/issues/24)

## Source coverage

| PDF pages | Content reviewed | Backlog result |
|---|---|---|
| 1 | Notes cover | No requirements |
| 2 | Meeting summary | Generate Paper changes, selection latency, checked-paper options/formatting, auto-reload |
| 3 | Decisions and next steps | Nine explicit action items mapped below |
| 4-5 | Detailed meeting notes | Confirmed owners, affected mobile surfaces, HTML export request, JEE scope |
| 6 | Transcript cover | No requirements |
| 7-12 | Full transcript | Cross-checked all summarized requirements and examples |

## Current-main assessment

The repository was inspected at `main` commit `1218f95`.

Already delivered in `e54fb93`:

- [x] Replace fixed duration presets with an optional custom `Duration (minutes)` field.
- [x] Treat an empty duration as no timer and validate invalid values inline.
- [x] Remove the AI / teacher instruction field and stop sending its values.
- [x] Remove the `Use textbook visuals` control from Generate Paper.

Verified without a new issue:

- [x] Competitive/JEE access and fallback subjects include Physics, Chemistry, and Mathematics.
- [x] Previous Papers supports JEE Main and JEE Advanced paper families in the current API types.

Remaining gap in the delivered duration work:

- [ ] The Approved books path sends duration, but the AI-syllabus generation request does not. This is tracked in [#17](https://github.com/Eduraa-Ai/eduraa-mobile/issues/17).

## GitHub issues created

| Order | Issue | Priority | Owner | Primary dependency |
|---|---|---|---|---|
| 1 | [#18 - Make paper answer selection immediate with the correct first-tap state](https://github.com/Eduraa-Ai/eduraa-mobile/issues/18) | P0 | `@SiddharthGianchandani` | Attempt rendering/performance |
| 2 | [#19 - Preserve every prior answer when selecting later paper questions](https://github.com/Eduraa-Ai/eduraa-mobile/issues/19) | P0 | `@SiddharthGianchandani` | Draft hydration and persistence ordering |
| 3 | [#22 - Keep paper checking in the background without visible auto-reloads](https://github.com/Eduraa-Ai/eduraa-mobile/issues/22) | P1 | `@AshishShethia` | Query polling vs. manual refresh state |
| 4 | [#20 - Show the complete four-option context in checked-paper review](https://github.com/Eduraa-Ai/eduraa-mobile/issues/20) | P1 | Team | Checked-paper API response completeness |
| 5 | [#21 - Render full LaTeX formatting throughout Previous Year Papers](https://github.com/Eduraa-Ai/eduraa-mobile/issues/21) | P1 | Team | Shared `LatexText` renderer |
| 6 | [#17 - Complete custom duration propagation across all Generate Paper modes](https://github.com/Eduraa-Ai/eduraa-mobile/issues/17) | P1 | `@Adarsh1999` | AI JEE generation API contract |
| 7 | [#23 - Export generated papers as standalone HTML files](https://github.com/Eduraa-Ai/eduraa-mobile/issues/23) | P2 | Team | Safe portable export architecture |
| 8 | [#27 - Restore checked-paper grading for Approved books generated papers](https://github.com/Eduraa-Ai/eduraa-mobile/issues/27) | P0 | `@AshishShethia` | Submission and grading pipeline |
| 9 | [#26 - Preserve and render question diagrams in generated papers](https://github.com/Eduraa-Ai/eduraa-mobile/issues/26) | P1 | `@AshishShethia` | Generated-paper visual contract |
| 10 | [#25 - Add one-tap Next question navigation to checked-paper evidence](https://github.com/Eduraa-Ai/eduraa-mobile/issues/25) | P2 | `@AshishShethia` | Question evidence navigation |

## Meeting requirement crosswalk

| Meeting requirement | Evidence | Status |
|---|---|---|
| Use an optional custom Generate Paper duration | Pages 2-4; 00:00:00 | UI delivered; end-to-end AI path in #17 |
| Remove AI teacher instructions | Pages 2-4; 00:04:00 | Delivered in `e54fb93` |
| Remove textbook visuals setting | Pages 2-4; 00:04:00 | Delivered in `e54fb93` |
| Fix slow option selection and wrong first-click color | Pages 2, 4-5, 9-10; 00:04:00 and 00:11:04 | #18 |
| Show all four options in Check Paper | Pages 2-4, 9; 00:06:50 | #20 |
| Add consistent LaTeX to Previous Year Papers | Pages 2-5, 9-10; 00:06:50 | #21 |
| Stop visible drag-to-reload while checking in the background | Pages 2-4, 10; 00:11:04 | #22 |
| Prevent later answers from clearing earlier answers | Pages 4-5, 10-11; 00:11:04-00:13:47 | #19 |
| Export a separate HTML file for generated paper content | Pages 4-5, 11; 00:13:47 | #23 |
| Confirm Chemistry/Mathematics and JEE scope | Pages 5, 11-12; 00:13:47 onward | Verified; no requested change |

## Additional user-reported issues

- [ ] [#25](https://github.com/Eduraa-Ai/eduraa-mobile/issues/25) - Move directly to the next checked-paper question from the evidence view.
- [ ] [#26](https://github.com/Eduraa-Ai/eduraa-mobile/issues/26) - Render a question's diagram in the generated paper when it is already available in checked-paper evidence.
- [ ] [#27](https://github.com/Eduraa-Ai/eduraa-mobile/issues/27) - Complete checking for papers generated through the reported "hooks" flow, interpreted from the current UI as `Approved books` pending reproduction confirmation.

All three additional issues are assigned to `@AshishShethia`.

## Implementation task list

### Phase 0 - Protect student answers

- [ ] Complete #27 Approved books generation-to-checking pipeline repair.
- [ ] Complete #18 first-tap performance and selection-state repair.
- [ ] Complete #19 answer isolation, hydration ordering, and resume persistence.
- [ ] Verify both issues together on the same 75-question Previous Year Paper.

### Phase 1 - Make checking and academic content trustworthy

- [ ] Complete #22 quiet background checking before refining result content.
- [ ] Complete #26 generated-paper visual propagation and rendering.
- [ ] Complete #20 checked-paper option contract and mobile rendering.
- [ ] Complete #21 rich Previous Papers LaTeX using the shared renderer.
- [ ] Complete #17 duration propagation for AI and Approved books generation.

### Phase 2 - Add the verification artifact

- [ ] Complete #23 safe, question-only standalone HTML export.
- [ ] Complete #25 one-tap next-question navigation.
- [ ] Verify HTML content parity against Paper Detail and the existing PDF export.

## Likely code areas

- Generate Paper: `src/screens/papers/GeneratePaperScreen.tsx`, `src/api/papers.ts`, `src/types/index.ts`
- Paper attempts: `src/screens/papers/AttemptPaperScreen.tsx`, `src/screens/papers/paperAttemptModel.ts`
- Checked papers: `src/screens/results/ResultDetailScreen.tsx`, `src/screens/results/QuestionEvidenceScreen.tsx`, `src/screens/results/checkedPaperDetailModel.ts`
- Previous Papers: `src/screens/learning/PreviousPapersScreen.tsx`, `src/screens/learning/previousPapersModel.ts`
- Shared math: `src/components/ui/LatexText.tsx`, `src/utils/latex.ts`
- Export: `src/screens/papers/PaperDetailScreen.tsx`, `src/utils/pdfDownload.ts`, and a new shared HTML export utility
- Tests: `scripts/generate-paper-settings.test.cjs`, `scripts/paper-attempt-model.test.cjs`, `scripts/checked-paper-detail-model.test.cjs`, `scripts/previous-papers-model.test.cjs`, rendered-journey scripts

## Delivery and QA gate

Each issue must satisfy its own acceptance criteria and:

- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] Relevant release-like build/export check
- [ ] Android QA at 320x700 and 390x844
- [ ] Loading, slow network, offline/retry, app resume, and terminal success states
- [ ] No duplicate submit, refresh, generation, or export action
- [ ] Long content, increased font size, accessible labels, and 44x44 touch targets
- [ ] Real rendered screenshots reviewed under the Eduraa mobile quality workflow
- [ ] Nearby paper generation, attempt, result, and Previous Papers journeys remain regression-free

## Product and backend dependencies

- #17 requires the AI JEE generation endpoint to accept and persist optional duration if it does not already.
- #20 requires the checked-paper response to carry the complete original option set; the client must not fabricate missing academic content.
- #23 starts as a question-only export matching the current PDF disclosure. Any answer-inclusive export needs explicit authorization rules and a separate product decision.
- #26 may require the generated-paper serializer to preserve the same visual payload later available to checked-paper results.
- #27 requires confirmation that the reported "hooks" flow is the `Approved books` source, then end-to-end diagnosis across the paper submission, grading job, and checked-paper persistence pipeline.
