# Product and UX Quality

## Solve the Outcome

Map the complete human journey rather than optimizing an isolated component. At each step the user should know where they are, what is happening, what they can do, what happened after an action, and what comes next.

Reduce work with safe defaults, prefilled known information, automatic synchronization, sensible recovery, batching, and progressive disclosure. If the system already knows something, avoid asking for it again. Remove clicks only when safety and clarity remain intact.

Prefer one obvious path over a cockpit of controls. Do not leak internal concepts such as queues, models, tokens, database state, or transport errors into mainstream UI unless they genuinely help the user recover.

## State Completeness

For each affected surface, assess:

- Initial: the purpose and next action are immediately clear.
- Loading: feedback is prompt and layout shift is controlled.
- Empty: explain why nothing is present and offer the useful next action.
- Success: completion is unmistakable and subsequent state is correct.
- Error: use human-readable language, preserve work, and offer recovery.
- Disabled: prevent invalid actions and explain why when ambiguity remains.
- Retry: make safe operations idempotent and avoid duplicate submissions.
- Offline or slow network: avoid lost input and misleading completion states when relevant.

## Interaction Quality

Use semantic controls, visible focus, labels, keyboard support, sensible focus movement, sufficient contrast, and realistic touch targets. Check narrow and wide viewports, content overflow, scrolling, virtual keyboards, safe areas, and repeated taps. Keep perceived performance in mind, not only benchmark numbers.

For an important flow, simulate a new user, a returning user, a hurried user who clicks twice, a user with missing data, and a user recovering from failure. Improve the workflow when those simulations reveal avoidable confusion.
