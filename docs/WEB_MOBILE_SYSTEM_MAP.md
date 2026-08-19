# Eduraa Web ↔ Mobile System Map

Cross-repository index connecting this Expo app to the product's source of truth:
the `AI_Question_Paper_System` monorepo (FastAPI backend + React web frontend).
Use this as the lookup table when porting an existing web feature to mobile.

Indexed revisions:

| Repo | Path | Revision at indexing |
| --- | --- | --- |
| Web/backend monorepo | `/home/adarsh/AI_Question_Paper_System` | `12e8bd8` (2026-08-15) |
| Mobile (this repo) | `/home/adarsh/eduraa-mobile` | `e005905` (2026-08-12) |

Re-verify contracts against the backend source before implementing; this file
records structure, not a frozen API snapshot.

---

## 1. Topology

```
/home/adarsh/AI_Question_Paper_System/
├── eduraa-ai/
│   ├── backend/          FastAPI. Single API both clients consume.
│   │   └── app/api/v1/router.py     → all routes mounted under /api/v1
│   ├── frontend/         React 18 + Vite + React Router + TanStack Query + Zustand + Tailwind/Radix
│   ├── infra/            Terraform → Azure (Container Apps)
│   └── docker-compose*.yml
├── eduraa-mobile/        EMPTY placeholder dir — ignore it
└── CROSS_REPO_STUDENT_MOBILE_ANALYSIS.md   (older, partly stale analysis)

/home/adarsh/eduraa-mobile/      ← canonical mobile repo
└── src/{api,screens,components,navigation,stores,auth,data,utils,hooks,theme,types}
```

Backend is shared. Web and mobile are two clients of the same `/api/v1` surface.
There is no mobile-specific backend, no BFF, and no separate schema.

### Stack analogues

| Concern | Web (`eduraa-ai/frontend`) | Mobile (this repo) |
| --- | --- | --- |
| Routing | `react-router-dom`, `src/app/router.tsx` | `@react-navigation` stacks + tabs, `src/navigation/index.tsx` |
| Server state | `@tanstack/react-query` | `@tanstack/react-query` (same patterns port directly) |
| Auth state | `zustand` `src/stores/authStore.ts` | `zustand` `src/stores/authStore.ts` |
| HTTP | `axios` `src/api/client.ts` | `axios` `src/api/client.ts` |
| Role gating | `src/auth/RequireRole.tsx` + `src/data/navLinks.ts` | `src/auth/landing.ts` + `src/data/mobileControlCatalog.ts` |
| Markdown/math | `react-markdown` + `remark-math` + `rehype-katex` | `react-native-markdown-display` + `react-native-mathjax-html-to-svg`, wrapped by `src/components/ui/MathText.tsx` / `LatexText.tsx` |
| Auth'd images | `src/components/ui/AuthenticatedImage.tsx` | `src/components/ui/AuthenticatedImage.tsx`, `QuestionVisual.tsx`, `protectedImageCache.ts` |
| Charts | `recharts` | none yet (`ProgressRing`, `MetricCard`, hand-rolled SVG via `react-native-svg`) |
| Animation | `framer-motion` | `react-native-reanimated` |

---

## 2. Runtime / environment wiring

- Live dev backend (what mobile points at today):
  `https://eduraa-ai-dev-cin-api.gentleforest-0ad6efdc.centralindia.azurecontainerapps.io`
  — Azure Container Apps, Central India.
- Mobile base URL resolution: [src/api/apiConfig.cjs](src/api/apiConfig.cjs)
  (pure, unit-tested by [scripts/api-config.test.ts](scripts/api-config.test.ts)).
  - Dev, no env set → web: browser host `:8000`; Android emulator: `10.0.2.2:8000`; iOS sim: `localhost:8000`.
  - `EXPO_PUBLIC_API_URL` overrides everything; `EXPO_PUBLIC_WEB_API_URL` / `EXPO_PUBLIC_NATIVE_API_URL` are dev-only overrides and are **rejected** in release builds.
  - Release builds require a public HTTPS origin (validated in [app.config.ts](app.config.ts)).
  - `apiClient` baseURL is `${API_BASE_URL}/api/v1`, so mobile call sites use paths **without** the `/api/v1` prefix (e.g. `/papers/generate`).
- Web base URL: `VITE_API_URL`, with a localhost→browser-host rewrite fallback.
- Expo web hits CORS against the live API, so local web runs proxy through
  [scripts/dev-api-bridge.cjs](scripts/dev-api-bridge.cjs) on `:8001` using `EDURAA_API_UPSTREAM_URL`.

---

## 3. Auth & session model

Both clients use the same routes. The session lifecycle differs:

| Aspect | Backend | Web | Mobile |
| --- | --- | --- | --- |
| Login | `POST /auth/login` (`identifier` + `password`) → `{access_token, token_type, user}` | same | same |
| Refresh | `POST /auth/refresh`, refresh token in httpOnly cookie | cookie-based | `withCredentials: true` + 401 interceptor retry in [src/api/client.ts](src/api/client.ts) |
| Access token storage | — | memory + `sessionPersistence` | memory + `expo-secure-store` ([src/auth/authStorage.ts](src/auth/authStorage.ts)) |
| Logout | `POST /auth/logout` | called | **not called** — mobile only clears local token |
| Identity | `GET /auth/me` → `AccountRead` | same | same |
| Google OAuth | `/auth/google/start`, `/auth/oauth/exchange`, `/auth/register/*/google` | implemented | **absent** |
| Password reset | `/auth/forgot-password`, `/auth/reset-password`, `/auth/reset-password/validate` | full flow | only `forgot-password` request |

Roles (`src/types` in both repos): `student`, `b2c_student`, `teacher`,
`principal`, `school_super_admin`, `branch_admin`, `admin`, `developer`.

Landing/IA resolution:
- Web: `eduraa-ai/frontend/src/data/navLinks.ts` with flags
  `requiresClassTeacher`, `requiresCompetitiveExam`, `requiresJee`, `hiddenForCompetitiveExam`, `allowAdminOverride`.
- Mobile: [src/auth/landing.ts](src/auth/landing.ts) resolves to
  `b2c_onboarding | competitive_learner | school_learner | staff_workspace | admin_workspace | developer_workspace`,
  and [src/data/mobileControlCatalog.ts](src/data/mobileControlCatalog.ts) mirrors `navLinks`
  entry-for-entry with `webPath`, `roles`, the same gating flags, plus `nativeStatus`
  (`native | partial | web-only`) and a navigation `target`.

**`mobileControlCatalog.ts` is the live parity ledger.** When a web feature is
ported, update its `nativeStatus` and `target` there in the same change.

---

## 4. Feature map: web route → backend → mobile

`Endpoints` are the primary calls; paths omit the `/api/v1` prefix.
Status: ✅ ported · 🟡 partial · ⛔ not in mobile.

### Learner (`student` / `b2c_student`)

| Web route + page | Endpoints | Mobile screen | Mobile API | Status |
| --- | --- | --- | --- | --- |
| `/login` `Login.tsx` | `/auth/login` | [LoginScreen](src/screens/auth/LoginScreen.tsx) | `auth.ts` | ✅ |
| `/register` `RegisterPathSelect.tsx` | — | [RegisterScreen](src/screens/auth/RegisterScreen.tsx) | — | ✅ |
| `/register/individual` `RegisterIndividual.tsx` | `/auth/register/individual`, `/auth/verify-email-otp`, `/auth/resend-email-otp` | [RegisterIndividualScreen](src/screens/auth/RegisterIndividualScreen.tsx), [VerifyEmailScreen](src/screens/auth/VerifyEmailScreen.tsx) | `auth.ts` | ✅ |
| `/register/school` `Register.tsx` | `/auth/register/{student,teacher,principal}`, `/schools`, `/schools/:id/branches`, `/schools/:id/offerings` | [RegisterSchoolScreen](src/screens/auth/RegisterSchoolScreen.tsx) | `auth.ts` | ✅ |
| `/reset-password` `ResetPassword.tsx` | `/auth/reset-password`, `/auth/reset-password/validate` | — | — | ⛔ |
| `/auth/callback`, `*/google` | `/auth/oauth/exchange`, `/auth/google/start`, `/auth/register/*/google` | — | — | ⛔ |
| `/student/onboarding` `B2COnboarding.tsx` | `/b2c/onboarding`, `/b2c/profile` | (inline onboarding stack in [navigation](src/navigation/index.tsx)) | `b2c.ts` | 🟡 |
| `/student/dashboard-lab` `StudentDashboardLab.tsx` | `/analytics/student-dashboard-lab`, `/analytics/student-dashboard-insights`, `/attendance/students/me/summary` | [HomeScreen](src/screens/home/HomeScreen.tsx) | `analytics.ts` | 🟡 — mobile omits `student-dashboard-insights` |
| `/student/papers` `StudentPapers.tsx` | `/papers`, `/papers/:id`, `/papers/:id/submit`, `/papers/:id/submission`, `/analytics/student-dashboard` | [PapersScreen](src/screens/papers/PapersScreen.tsx), [PaperDetailScreen](src/screens/papers/PaperDetailScreen.tsx) | `papers.ts` | ✅ |
| `/student/exams` `StudentExams.tsx` | `/exams/student`, `/papers`, `/papers/:id/attempts`, `/papers/:id/submit`, `/papers/:id/submission`, `/papers/:id/practice-support/chat`, `/checked-papers/:id/download` | [AttemptPaperScreen](src/screens/papers/AttemptPaperScreen.tsx), [ExamsScreen](src/screens/workspace/ExamsScreen.tsx) | `papers.ts`, `exams.ts` | 🟡 — `practice-support/chat` missing |
| `/student/interactive-quiz/:paperId` `StudentInteractiveQuiz.tsx` | `GET /papers/:id/interactive`, `/papers/:id/interactive/assist`, `/papers/:id/submit` | [QuizScreen](src/screens/papers/QuizScreen.tsx) | `papers.ts` | 🟡 — mobile calls `assist` but not the `GET .../interactive` fetch |
| `/generate-paper` `GeneratePaperModern.tsx` | `/papers/generation-jobs` (+ `/active`, `/:id`, `/:id/regenerate`), `/papers/options`, `/chapters` | [GeneratePaperScreen](src/screens/papers/GeneratePaperScreen.tsx) | `papers.ts` | 🟡 — **mobile uses the synchronous `POST /papers/generate`; web uses the async generation-job + polling pipeline** |
| `/generate-paper-v3` `GeneratePaperV3.tsx` | `/papers/generate`, `/papers/parse-intent`, `/papers/parse-homework-intent`, `/ai/live-practice/*` | — | — | ⛔ (live-practice + intent parsing absent) |
| `/checked-papers` `CheckedPapers.tsx` | `/checked-papers`, `/checked-papers/:id`, `/:id/download`, `/:id/manual-review-request`, `/:id/scanned(/pages)`, `/:id/grading-runs/:id/events` (SSE) | [CheckedPapersLibraryScreen](src/screens/results/CheckedPapersLibraryScreen.tsx) (re-exported as `ResultsScreen`), [ResultDetailScreen](src/screens/results/ResultDetailScreen.tsx), [QuestionEvidenceScreen](src/screens/results/QuestionEvidenceScreen.tsx) | `checkedPapers.ts` | 🟡 — no scanned-page viewer, no live grading SSE |
| `/scan-upload` `ScanUpload.tsx` | `/checked-papers/options`, `/checked-papers/scan` | [ScanUploadScreen](src/screens/workspace/ScanUploadScreen.tsx) | `scanUpload.ts` | ✅ |
| `/student/agentic-learning` `StudentAgenticLearningV3.tsx` | `/agentic-learning/subjects`, `/subjects/:id/subtopics`, `/topics/:id`, `/topics/:id/resolve`, `/quick-actions` | [AgenticLearningScreen](src/screens/learning/AgenticLearningScreen.tsx), [AgenticSubjectScreen](src/screens/learning/AgenticSubjectScreen.tsx), [AgenticTopicScreen](src/screens/learning/AgenticTopicScreen.tsx) | `agenticLearning.ts` | ✅ |
| `/student/competitive-exam[/:subject[/:chapter]]` | `/papers/options`, `/chapters`, `/competitive-exam/workspace`, `/papers/generate` | [CompetitiveExamScreen](src/screens/learning/CompetitiveExamScreen.tsx), [CompetitiveSubjectScreen](src/screens/learning/CompetitiveSubjectScreen.tsx), [CompetitiveChapterScreen](src/screens/learning/CompetitiveChapterScreen.tsx) | `competitiveExam.ts` | ✅ |
| `/student/previous-papers` `StudentPreviousPapers.tsx` | `/previous-papers/published`, `/chapters`, `/questions`, `/:id/start-exam` | [PreviousPapersScreen](src/screens/learning/PreviousPapersScreen.tsx) | `previousPapers.ts` | ✅ |
| `/student/cheat-sheets` `StudentCheatSheets.tsx` | `/cheat-sheets`, `/learning-resources` | [CheatSheetsScreen](src/screens/learning/CheatSheetsScreen.tsx) | `cheatSheets.ts`, `learningResources.ts` | ✅ |
| `/ai-studio` `AiStudio.tsx` + `DashboardAiStudio.tsx` | `/ai/conversations(/:id/messages,/memory)`, `/ai/memory/profile`, `/ai/chat` | [AIStudioScreen](src/screens/studio/AIStudioScreen.tsx) | `ai.ts`, `aiStream.ts` | ✅ (mobile additionally streams via `/api/v1/ai/chat/stream`) |
| `/student/profile` `StudentProfile.tsx` | `/b2c/profile`, `/b2c/onboarding`, `/roster/student/master-profile` | [ProfileScreen](src/screens/profile/ProfileScreen.tsx) | `b2c.ts` | 🟡 — no `roster/student/master-profile` |
| `/attendance` `Attendance.tsx` | `/attendance/students/me/summary`, `/attendance/corrections` | [AttendanceScreen](src/screens/workspace/AttendanceScreen.tsx) | `attendance.ts` | ✅ |
| `/announcements` `Announcements.tsx` | `/communication/announcements` | — | — | ⛔ |
| `/student/doubts` `Doubts.tsx` | `/communication/doubts(/:id/messages)`, `/communication/doubts/teachers` | — | — | ⛔ |
| `/student/teachers` `StudentTeachers.tsx` | `/roster/student/teachers`, `/roster/student/master-profile` | — | — | ⛔ |
| `/student/question-papers` `StudentQuestionPapers.tsx` | `/question-papers/student`, `/question-papers/:id` | — | — | ⛔ |
| `/student/homework/:id`, `/student/exam/:id`, `/student/home` | (composed views over papers/exams) | — | — | ⛔ |

### Staff / admin

| Web route + page | Endpoints | Mobile | Status |
| --- | --- | --- | --- |
| `/approvals` `ApprovalsPage.tsx` | `/approvals/{principals,teachers,students,class-teacher-requests,teacher-profile-updates}/pending` + `/:id/approve` | [ApprovalsScreen](src/screens/workspace/ApprovalsScreen.tsx), `approvals.ts` | ✅ |
| `/attendance` (teacher/leadership) | `/attendance/teacher/today`, `/dashboard/teacher-summary`, `/dashboard/leadership`, `/sheets/:id/{records,submit,reopen,mark-all-present}`, `/classes/:id/sheet`, `/records/:id/override` | [AttendanceScreen](src/screens/workspace/AttendanceScreen.tsx), `attendance.ts` | 🟡 — no `classes/:id/sheet` or record override |
| `/exams` `Exams.tsx` | `/exams`, `/exams/:id`, `/papers`, `/papers/options`, `/papers/:id/export/pdf`, `/cheat-sheets/teacher/syllabi` | [ExamsScreen](src/screens/workspace/ExamsScreen.tsx), `exams.ts` | 🟡 |
| `/teacher` `TeacherPage.tsx` | `/roster/teacher/master-profile`, `/roster/teacher/profile-update-request`, `/class-teacher/{opt-in,options}`, `/agentic-learning/cohort-insights` | [FeatureScreen](src/screens/workspace/FeatureScreen.tsx) read-only snapshot via `workspace.ts` | 🟡 |
| `/teacher/students` `TeacherStudents.tsx` | `/roster/teacher/students(/:id)`, `/class-teacher/students` | `FeatureScreen` snapshot only | 🟡 |
| `/class-teacher` `ClassTeacherManagement.tsx` | `/class-teacher/*` (11 routes) | `FeatureScreen` snapshot only | 🟡 |
| `/teacher/question-papers`, `/teacher/paper/:id` | `/question-papers/teacher*`, `/analytics/teacher-dashboard-lab/paper/:id` | — | ⛔ |
| `/index-books` `IndexBooks.tsx` | `/documents/*`, `/chapters/*`, `/topics`, `/previous-papers/questions/:id` | `FeatureScreen` snapshot only | 🟡 |
| `/index-notes` `IndexNotes.tsx` | `/notes*` | `FeatureScreen` snapshot only | 🟡 |
| `/admin`, `/admin/cheat-sheets` | `/admin/accounts`, `/admin/teachers`, `/cheat-sheets/admin/b2c-library/generate`, `/admin/learning-resources/*` | `FeatureScreen` snapshot only | 🟡 |
| Principal / teacher dashboard labs | `/analytics/{principal,teacher}-dashboard-lab*` | — | ⛔ |
| `/generate-paper-classic`, `/generate-paper/custom` `GeneratePaper.tsx` | `/papers/:id/{publish,questions/:id,export/pdf}`, `/documents/visuals/:id`, paper-manifest APIs | — | ⛔ |
| `BlueprintExamMode.tsx` (JEE blueprint) | `/ai/jee/{syllabus,generate-form-paper,jobs/:id,drafts/:id,chat,me}`, `/papers/:id/{blueprint,instruct,instruct/stream,title,publish,questions/:id/regenerate,questions/:id/visual}` | mobile has `/ai/jee/syllabus` + `/ai/jee/generate-form-paper` only (`papers.ts`) | 🟡 |
| `/curriculum`, `/question-bank`, `/integrations/google-calendar`, bookings | `/subjects`, `/booking/availability`, `/bookings`, `/integrations/google/connect` | — | ⛔ |
| `/assistant` (`assistant/*` pages) | `/assistant/briefing`, `/assistant/actions/*` | — | ⛔ |
| Notifications | `/communication/notifications*` | — | ⛔ |

`FeatureScreen` + [src/api/workspace.ts](src/api/workspace.ts) is a deliberate
generic fallback: it fetches raw snapshots for a `featureId` and renders them as
labelled blocks. Every 🟡 "snapshot only" row above is a candidate for a real
native screen.

---

## 5. Backend router index

`app/api/v1/router.py` mounts these modules. Column 3 marks whether mobile calls
anything in that module today.

| Module | Prefix | Mobile |
| --- | --- | --- |
| `auth.py` | `/auth` | ✅ partial (no logout/oauth/reset) |
| `b2c.py` | `/b2c` | ✅ |
| `schools.py` | `/schools` | ✅ |
| `users.py` | `/users` | ⛔ |
| `analytics.py` | `/analytics` | ✅ student-dashboard-lab only |
| `papers.py` | `/papers` | ✅ partial |
| `question_papers.py` | `/question-papers` | ⛔ |
| `previous_papers.py` | `/previous-papers` | ✅ |
| `checked_papers.py` | `/checked-papers` | ✅ partial |
| `checked_paper_integrity.py` | — | ⛔ |
| `paper_manifests.py` | — | ⛔ |
| `exams.py` | `/exams` | ✅ |
| `chapters.py`, `subjects.py`, `topics.py` | | ✅ chapters/subjects · ⛔ topics |
| `agentic_learning.py` | | ✅ |
| `competitive_exam.py` | | ✅ |
| `cheat_sheets.py` | | ✅ read-only |
| `learning_resources.py` | | ✅ |
| `ai/` (+ `ai/jee`) | `/ai` | ✅ partial (chat, memory, jee syllabus/generate) |
| `ai_studio_2.py` | `/ai-studio-2` | ⛔ |
| `live_practice.py` | `/ai/live-practice` | ⛔ |
| `assistant/` | | ⛔ |
| `attendance.py` | | ✅ partial |
| `approvals.py` | | ✅ |
| `class_teacher.py` | | 🟡 snapshot |
| `roster.py` | `/roster` | 🟡 snapshot |
| `communication.py` | | ⛔ |
| `admin_accounts.py`, `admin_teachers.py` | | 🟡 snapshot |
| `documents.py`, `notes.py` | | 🟡 snapshot |
| `vision.py` | `/vision` | ⛔ |
| `bookings.py`, `integrations.py` | | ⛔ |
| `health.py` | | ⛔ |

Schemas live in `backend/app/schemas/*.py` and are the authoritative request/response
contract. Mobile mirrors them in [src/types/index.ts](src/types/index.ts) — keep the
snake_case field names identical to the Pydantic models; do not camel-case at the
API boundary.

---

## 6. Porting recipe (web feature → mobile)

1. **Locate the web page**: `eduraa-ai/frontend/src/pages/<Page>.tsx`, plus any
   `features/<domain>/` hook/store it uses. Read its role guard in `app/router.tsx`
   and its entry in `data/navLinks.ts`.
2. **Locate the backend contract**: the endpoint module in
   `backend/app/api/v1/<module>.py` and its Pydantic schema in
   `backend/app/schemas/<module>.py`. Note allowed roles (including whether
   `b2c_student` is accepted — several routes are `student`-only).
3. **Mirror types** into [src/types/index.ts](src/types/index.ts) exactly, including
   optional/array fields the web ignores.
4. **Add/extend the mobile API adapter** in `src/api/<domain>.ts` using the shared
   `apiClient` (paths without `/api/v1`).
5. **Extract a pure model module** (`<screen>Model.ts`) for derivation/formatting and
   cover it with a `scripts/*.test.cjs` node test using synthetic payloads — this repo
   tests logic without hitting Azure. Register it in
   [scripts/run-model-tests.cjs](scripts/run-model-tests.cjs).
6. **Build the screen** under `src/screens/<domain>/`, register it in
   [src/navigation/index.tsx](src/navigation/index.tsx), and update the matching entry
   in [src/data/mobileControlCatalog.ts](src/data/mobileControlCatalog.ts)
   (`nativeStatus`, `target`).
7. **Cover all states**: loading, empty, partial, offline, error+retry, success.
   Never render sample data as real backend state.
8. **Verify**: `npm run typecheck`, `npm test`, `npm run export:ci`, then real-device
   capture and the independent premium-UI-critic `PASS` required by
   [AGENTS.md](AGENTS.md).

### Cross-repo gotchas

- Web calls the async **generation-job** pipeline (`POST /papers/generation-jobs` →
  poll `GET /papers/generation-jobs/:id`) with streaming `preview_questions`; mobile
  still calls the blocking `POST /papers/generate`. Any generation UX work should
  decide deliberately which pipeline to use.
- `QuestionVisualPayload` supports multi-image (`asset_urls[]`, `captions[]`,
  `layout`, `placement`). Mobile normalizes it in
  [src/utils/questionVisual.ts](src/utils/questionVisual.ts); check the web's
  `lib/questionVisual.ts` for the reference behaviour before changing rendering.
- Paper/checked-paper assets require the bearer token — use
  [AuthenticatedImage](src/components/ui/AuthenticatedImage.tsx),
  [QuestionVisual](src/components/ui/QuestionVisual.tsx) or
  [openProtectedDocument](src/utils/openProtectedDocument.ts), never a bare `Image` URI.
- Pagination on `/papers` is `skip`/`limit`, not `page`/`size`.
- `/chapters` expects a normalized standard label (`Std 11`, `JEE (Mains & Advanced)`);
  mobile replicates the web's `standardRequestValue` in [src/api/papers.ts](src/api/papers.ts).
- SSE/streaming endpoints (`/papers/:id/instruct/stream`,
  `/checked-papers/:id/grading-runs/:id/events`, `/ai/chat/stream`) need the
  `fetch`-based reader in [src/api/aiStream.ts](src/api/aiStream.ts), not axios.
