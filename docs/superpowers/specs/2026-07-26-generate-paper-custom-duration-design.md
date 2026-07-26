# Generate Paper Custom Duration

## Scope

Update only the `Settings & generate` state in the existing Generate Paper row. The Topic and Question mix states, navigation, textbook-visual behavior, paper summary, recovery flow, and generation action remain unchanged.

## Experience

- Replace the fixed duration chips with one always-visible field labeled `Duration (minutes)`.
- Use the numeric keyboard and show `Enter minutes` as the empty placeholder.
- Treat an empty value as no timer.
- Accept positive whole minutes. Invalid text, decimals, zero, and negative values show a concise inline error and block generation without clearing the form.
- Remove the `AI / teacher instruction` field.
- Remove the conditional red information notice shown for AI syllabus generation.
- Keep Difficulty alongside the duration setting when the viewport has room, while allowing the fields to stack safely on compact devices.

## Data Flow

The screen stores the duration as editable text so partial input remains stable while typing. At generation time, it converts a valid value to a number and sends it through the existing `timer_value`, `timer_unit`, `duration_minutes`, and blueprint-header fields. An empty field sends the existing no-timer values.

Because the instruction control no longer exists, this screen will no longer maintain instruction state or send `additional_instructions` and `instructions` values. The shared API request type remains unchanged because those optional fields may still be used by other callers.

## Validation and Accessibility

- The input exposes a clear accessibility label and error state.
- Validation feedback appears beside the field rather than in a popup.
- Invalid duration blocks only the final generation action and preserves all Topic, Question mix, Difficulty, and visual settings.
- The field remains reachable and visible when the Android keyboard is open through the existing keyboard-avoiding screen.

## Verification

- Add a focused model test first for empty, valid, and invalid duration parsing.
- Verify the test fails before implementation and passes afterward.
- Run the focused model suite, TypeScript typecheck, and the full available test suite.
- Render the Settings state on compact and larger Android viewports, including empty duration, entered custom duration, invalid duration, and keyboard-open states.
- Submit the screenshots to the independent Eduraa premium UI critic and iterate until it returns `PASS`.
