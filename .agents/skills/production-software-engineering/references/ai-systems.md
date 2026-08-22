# AI Systems

Use AI where language, ambiguity, unstructured data, adaptation, or reasoning creates genuine leverage. Prefer deterministic software for deterministic rules. Do not add AI merely because it is available.

Treat model output as untrusted input. Use structured outputs and schemas, validation, grounding or retrieval, tool constraints, deterministic post-processing, confidence or abstention behavior where useful, bounded retries and timeouts, versioned prompts, tracing, evaluations, and fallback behavior proportional to the risk.

For irreversible, sensitive, or high-impact actions, separate proposal from execution: the model proposes, deterministic checks verify, and a human approves when appropriate.

For autonomous workflows, define:

- Goal and observable completion criteria.
- Available tools and least-privilege permissions.
- State, memory, checkpoints, and resumability.
- Explicit action boundaries and prohibited actions.
- Verification evidence for each consequential action.
- Bounded retries, failure recovery, and termination conditions.

Avoid a single giant prompt that hides state and control flow. Make agent actions inspectable and stop when success is verified, the authorized scope is exhausted, or a genuine external decision is required.

Evaluate AI behavior with representative examples, including ambiguous input, missing context, adversarial content, malformed tool results, hallucinated facts, timeouts, and deterministic fallback paths. Never fake citations, sources, metrics, or successful actions.
