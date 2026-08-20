# B2B mobile approvals role contract

This contract applies only to institution accounts. It does not grant approval capabilities to individual (`b2c_student`) accounts, platform admins, or developers.

| Role | Mobile experience | Queues visible | Decision scope | Server enforcement |
| --- | --- | --- | --- | --- |
| School super admin | Approval review desk | Pending principals | Principals in the same school | Role and `school_id` checked on list, approve, and reject routes; admin password required for decisions |
| Branch admin | Approval review desk | Pending principals | Principals in the same school and assigned branch | Role, `school_id`, and `branch_id` checked server-side; admin password required for decisions |
| Principal | Approval review desk | Pending teachers, class-teacher requests, teacher profile updates | Teachers and requests in the same school and branch | Approved-principal role plus school/branch scope checked on every read and mutation |
| Teacher | Approval review desk | Pending students | Students in the teacher's approved class section; an unassigned division may be claimed only within that class standard | Approved-teacher role, school/branch, class section, standard, and division checked on every read and mutation |
| Student | Private approval status | No queue; own pending/approved/rejected state only | Own credentialed account | `/auth/approval-status` verifies the student's ID/password and returns no queue, target IDs, or decision controls |

## Decision lifecycle

- Approve and reject both require an explicit native confirmation.
- Principal decisions additionally require the acting administrator's password.
- The mobile mutation has retries disabled, blocks repeated taps, removes the completed target immediately, and refetches only that target queue.
- Server mutations lock the target row. A same-result replay is idempotent; a conflicting stale decision returns `409` and causes the client to reconcile the queue.
- Account rejections deactivate the still-pending account without deleting it. Class-teacher and profile-update requests use an explicit `rejected` state.
- Each first completed decision writes an immutable `approval_audit_events` row containing actor ID/role, target ID/kind, approve/reject action, school/branch scope, optional reason, and server `created_at` timestamp.

## Recovery and privacy

- Each permitted queue is requested independently. A failed queue shows its own retry while successful sibling queues remain usable.
- Slow loading, offline/timeout, expired session, permission denial, empty queues, and successful decisions use human-readable states.
- Refresh and background query reconciliation only repeat reads. Mutations are neither persisted nor automatically retried.
- The screen also enforces an in-component role guard so an unauthorized internal/deep-link navigation cannot issue queue requests. Backend tests independently verify the server rejects unauthorized roles.
