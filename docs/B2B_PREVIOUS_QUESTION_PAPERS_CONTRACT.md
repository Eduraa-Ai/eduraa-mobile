# B2B Previous Question Papers contract

This mobile experience composes two existing, independently authorized backend catalogs. It does not convert PDF uploads into structured attempts and does not reuse the B2C-only `/previous-papers/*` routes for school users.

## Role and source contract

| Role | Practice-ready structured papers | School-shared PDFs | Permitted mobile actions |
| --- | --- | --- | --- |
| B2B student | `GET /papers?status=published` | `GET /question-papers/student` | Start/resume/submit a structured paper; open a permitted PDF |
| Teacher | `GET /papers?status=published` | `GET /question-papers/teacher` | Open owned structured-paper details; open owned shared PDFs |
| Principal | Not exposed | Not exposed | None in this scope |
| B2C student | Existing `/previous-papers/*` catalog | Not exposed | Existing JEE paper/subject/chapter assembly and canonical attempt flow |

Teachers never receive student attempt, retest, submission, or grading actions from the Previous Papers screen or its structured-paper detail destination. Teacher details open in an explicit reference mode that does not query attempts and exposes review/download only. Shared PDFs are reference documents only because the backend does not expose their questions as canonical structured paper records.

## Field and filter contract

| Field/filter | Source | Mobile behavior | Authorization significance |
| --- | --- | --- | --- |
| School and branch | Authenticated profile and server-side relationship | Shown as context; never sent as a catalog selector | Backend derives the tenant from the authenticated student or teacher |
| Board | Authenticated profile | Shown as curriculum context | Current paper responses have no per-paper board field; the client must not infer or broaden access with it |
| Standard and division | Profile plus response metadata | Shown and locally filterable when returned | Student structured and PDF access is enforced server-side against enrollment/class targeting |
| Subject | Paper response | Locally filterable; student PDF endpoint also accepts `subject_id` when an ID-based filter is available | Cannot override school/class access |
| Year | `published_at`, falling back to `created_at` | Derived for display and local filtering | Informational; not an authorization input |
| Publication | Structured query fixes `status=published`; student PDF route returns published papers; teacher PDFs expose their own status | Student cannot select unpublished content; teacher can filter owned PDF status | Backend remains authoritative |
| Paper content | Canonical structured paper or original PDF | Structured questions use the existing attempt/detail screens; PDFs open as protected authenticated downloads | Question order, options, marks, formulas, and figures remain owned by the canonical flow/document |

The client deliberately sends no `school_id`, `branch_id`, board, standard, or division parameters to either school catalog. A manipulated client therefore cannot use UI filters to cross a school or tenant boundary.

## Attempt and reliability contract

- Student practice papers navigate to the existing `AttemptPaper` stack. Existing attempt lookup, resume, submission, checking, checked-paper routing, background leave behavior, and Previous-tab stack reset remain canonical.
- The screen guards repeated open taps. The canonical attempts route and already-submitted behavior provide the server-side idempotency boundary.
- Catalog queries include the account cache scope, preventing one signed-in account from reusing another account's B2B or B2C cache entries.
- Loading, empty, partial-source, offline, retry, PDF failure, and incomplete optional metadata have explicit recoverable states.
- Session expiry continues through the shared authenticated API client and auth-store cleanup flow.

## Backend boundaries verified against `AI_Question_Paper_System` `origin/main`

- `/previous-papers/*` is B2C-student-only and remains untouched.
- `/question-papers/student` derives the student's school and enrollment and returns only published papers allowed for that class target.
- `/question-papers/teacher` returns the authenticated teacher's uploaded papers.
- Structured `/papers` access and `/papers/{id}/attempts` enforce role, school, publication, standard/division, assignment, and exam access on the server.

The current shared-PDF schema has no board/year fields and no canonical relationship to a structured `Paper`; year is therefore derived from timestamps, board is context-only, and PDFs cannot be attempted. Those constraints are represented honestly in the mobile UI rather than bypassed.
