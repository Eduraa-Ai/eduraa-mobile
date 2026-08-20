# B2B native profile field contract

This contract applies to the native Eduraa profile surface for institution students,
teachers, and principals. Server responses remain canonical. The client never sends a
general profile patch for a B2B account.

| Role | Visible | Directly editable | Immutable in native profile | Approval required |
| --- | --- | --- | --- | --- |
| Student | Name, email, student ID, school, branch, board, standard, division, subjects, class teacher, enrollment status | None | All visible identity, enrollment, and academic-assignment fields | None |
| Teacher | Name, email, teacher ID, school, branch, board, standards, divisions, subjects/classes, class-teacher status, assignment status, pending request status | None | Internal ID, school, class-teacher assignment, class/subject mappings, approval state, active state | Name, email, teacher ID, branch, board, standards, divisions, subjects |
| Principal | Name, email/account identifier, school, branch, leadership role | None | All visible identity, institution, and leadership-role fields | None |

## Update capability today

| Role | Can update the institution profile? | Supported path |
| --- | --- | --- |
| B2B student | No | The server exposes a role-protected read contract only. School identity and enrollment changes remain administrator-managed. |
| Teacher | Yes, with approval | The teacher submits the supported fields to one pending request; the principal approves before canonical profile data changes. |
| Principal | No | The dashboard/profile contract is read-only. School, branch, identity, and leadership role remain administrator-managed. |
| B2C learner | Yes | The existing B2C profile/onboarding update behavior is preserved separately. |

Password recovery and sign-out are account-security actions available to all three B2B roles;
they are not institution-profile mutations.

## Account preferences and security

- Every role can request password recovery only for the canonical account identifier.
- Every role can sign out. Query data is scoped by role and account ID, cleared when the account
  changes, and the backend refresh token is revoked through its native JSON fallback contract.
- The current B2B server contracts expose no user-editable notification, language, theme, or
  communication-preference fields. Native therefore shows only supported account settings and
  does not invent client-only preferences that could drift from canonical school data.
- Student and principal identity/institution changes are school-managed and have no native mutation endpoint.
- Teacher profile edits are submitted only to `POST /roster/teacher/profile-update-request`.
  The server owns authorization, branch/school validation, and allowed offerings. In serialized
  requests, a new submission updates the current pending request rather than creating a duplicate.

## Client payload boundary

`buildTeacherApprovalPayload` explicitly selects the nine server-supported teacher fields:
first name, last name, email, teacher ID, branch ID, board, standards, divisions, and subjects.
The client validates required values, email shape, deduplicated lists, and the same name/ID/board
length limits declared by the server schema and database fields. The server derives the branch name from the approved
branch ID; the client never supplies it as trusted text.
Injected properties such as `school_id`, `is_active`, `is_approved`, class-teacher fields,
assignment mappings, internal IDs, and request status are discarded before transport.
Students and principals expose no profile mutation method in `b2bProfileApi`.

The backend remains the security boundary: role checks guard each read endpoint, the teacher
approval endpoint accepts teachers only, and approval-controlled values are not applied to the
canonical teacher record until a principal approves the request.

## Backend follow-ups found during contract verification

- The request status enum and routes support `pending` and `approved`, but not principal rejection.
- The service reuses the latest pending request, but the database has no partial unique constraint
  preventing two concurrent pending rows for one teacher.
- The database limits standards/divisions to 20 characters and subjects to 50 characters per item;
  native validates these limits, but the backend Pydantic request schema should enforce them before commit.
