# Attendance end-to-end test accounts

These accounts are available only when the local attendance preview is running:

```powershell
npm run attendance:preview
```

All accounts use the password `Synthetic123!`.

| Role | Email | Institutional ID | Expected landing |
| --- | --- | --- | --- |
| Teacher | `attendance-teacher@example.test` | `TCH-1024` | Staff workspace |
| Student | `attendance-student@example.test` | `ST-001` | School learner home |
| Institution head | `attendance-leader@example.test` | — | Staff workspace |

## Attendance and leave journey

1. Sign in as the teacher and open **Attendance**.
2. Mark exceptions, submit attendance, and verify submitted records remain directly correctable by that teacher.
3. Sign out and sign in as the student.
4. Open **Attendance**, review history, and submit a leave request.
5. Sign out and return as the teacher.
6. Open **Attendance**, find the leave request, and approve or reject it.
7. Return as the student and confirm the decision is visible.

Unknown identifiers and incorrect passwords intentionally return `401` instead of opening a fallback dashboard.
