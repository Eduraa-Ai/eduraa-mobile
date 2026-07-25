# Previous Papers verification

- Seed: `pr6-pyq-20260725`
- Fixture: `test-artifacts/ai-studio/mock-server.mjs`
- App API: `EXPO_PUBLIC_WEB_API_URL=http://localhost:8000`
- Render target: React Native Web at Android-sized viewports

## Captures

| File | Viewport | Verified state |
| --- | --- | --- |
| `01-browse-390x844.png` | 390 x 844 | Published papers, exam/year filters, selected paper, protected bottom navigation |
| `02-preview-390x844.png` | 390 x 844 | Locked-answer question preview and long question wrapping |
| `03-preview-320x700.png` | 320 x 700 | Compact-phone layout without horizontal clipping |
| `04-assembly-390x844.png` | 390 x 844 | Server-backed assembly progress and preserved selection |
| `05-resumed-attempt-390x844.png` | 390 x 844 | Successful handoff with answer `B` restored from the newest unfinished attempt |

PNG captures are intentionally gitignored. Regenerate them from the synthetic
fixture before a visual review rather than treating old screenshots as source
of truth.

## Synthetic failure controls

Set a state with:

```sh
curl -fsS -X POST http://localhost:8000/__test__/previous-papers-mode \
  -H 'Content-Type: application/json' \
  --data '{"mode":"papers-error"}'
```

Supported modes are `ready`, `loading`, `empty`, `papers-error`,
`papers-error-once`, `chapters-error`, `questions-error`, `start-error`,
`reused`, and `slow-start`.
