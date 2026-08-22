# Verification and Adversarial Review

## Root-Cause Debugging

Observe the failure, collect evidence, trace execution and state transitions, form a falsifiable hypothesis, test it, identify the root cause, design the smallest complete fix, add regression protection when practical, and verify the real flow.

Depending on the system, inspect stack traces, logs, browser console, network traffic, payloads, database rows, timestamps, asynchronous boundaries, queues, retries, caches, environment configuration, flags, dependency versions, recent diffs, and relevant history. Do not edit randomly until the symptom disappears.

## Test Selection

Prioritize critical workflows, business rules, authorization boundaries, integration contracts, regressions, destructive operations, and concurrency-sensitive behavior. Select checks that prove observable behavior rather than implementation wording.

Run applicable unit and integration tests, type checking, linting, build, application startup, browser or mobile flow, API calls, migrations, queries, jobs, and end-to-end workflows. Investigate failures instead of hiding them or weakening checks.

## Break the Solution

Choose realistic adversarial cases based on risk:

- Empty, null, malformed, oversized, or unexpected input.
- Duplicate clicks, simultaneous requests, repeated events, and refresh/back navigation.
- Expired sessions, missing permissions, and cross-user or cross-tenant access.
- Slow networks, timeouts, 4xx and 5xx responses, dependency and database failure.
- Retry after partial success, stale caches, reopened sessions, and out-of-order events.
- Mobile viewports, text overflow, keyboard behavior, and accessibility navigation.

## Final Review

Ask, in order:

1. Does the intended behavior work end-to-end?
2. How can it fail, and can the user or system recover?
3. Is state protected from corruption, duplication, and unauthorized access?
4. Is this the simplest design that fully solves the problem?
5. Is the user experience obvious and responsive?
6. Would a rigorous staff-level reviewer approve the change and its evidence?

Fix legitimate findings, rerun affected checks, remove investigative debris, and report exactly what was and was not verified.
