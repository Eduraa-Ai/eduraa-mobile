# Systems Quality

Apply only the dimensions relevant to the change; do not add infrastructure without a concrete need.

## APIs and Services

Check request and domain validation, authentication, authorization, ownership, tenant isolation, consistent error contracts, pagination, timeouts, retries, rate limits, and backward compatibility. Do not make the frontend compensate for broken server invariants.

For side effects, determine whether idempotency, deduplication, transactional boundaries, optimistic concurrency, leases, an outbox, or reconciliation is needed. Assume requests can repeat, messages can arrive late or out of order, workers can restart, and partial completion can occur.

## Data

Protect correctness with appropriate primary keys, uniqueness, foreign keys, nullability, checks, transactions, and constraints. Review indexes and query plans when data volume or latency makes them relevant. Design migrations for mixed-version deployment, lock duration, rollback or roll-forward, and existing data, not only empty databases.

## Security

Inspect trust boundaries and least privilege. Consider auth bypass, cross-tenant access, injection, XSS, CSRF, SSRF, path traversal, unsafe uploads, mass assignment, insecure redirects, credential exposure, sensitive logs, and abuse or rate amplification where relevant. Never rely on client-side authorization or expose secrets to the browser.

## Reliability and Observability

Define what happens when dependencies are slow, unavailable, or inconsistent. Make retries bounded and safe. Provide recovery for partial success. Add observability only where it helps answer what happened, to whom, when, why, and how often; favor structured logs, correlation identifiers, useful metrics, traces, audit events, and health checks over noisy logging.

## Performance

Look for request waterfalls, redundant calls, N+1 queries, missing indexes, excessive payloads or serialization, blocking work, render loops, repeated state updates, unbounded processing, and unnecessary model calls. Measure before introducing complex optimization. Think about the simplest design today, its first likely failure at 10x usage, and whether it can evolve rather than be replaced at 100x.
