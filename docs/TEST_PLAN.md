# Test Plan

Maps to taskbook §12. Commands run from the repo root.

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | ESLint |
| `npm run test` | Vitest unit/integration |
| `npm run test:coverage` | Vitest with coverage |
| `npm run build` | production build |
| `npm run e2e` | Playwright (requires browsers) |

## 12.1 State machine (`tests/study/machine.test.ts`)

1. new → remember → answer → confirm → completed.
2. new → forget → hint → remember → answer → confirm → completed.
3. new → forget → hint → forget → answer → confirm → queued.
4. no example still allows second decision.
5. resume during answer-reveal stays in answer-reveal.
6. rapid double submit logs once (idempotency).
7. shortcuts do not bypass disabled state.
8. completed word not re-selected today.
9. suspended word not scheduled.
10. deleted word history retained per policy.

## 12.2 Short-term queue (`tests/review/shortTerm.test.ts`)

1. failure creates one valid task.
2. no duplicate task for same word/step.
3. max 5 extra reviews.
4. success removes remaining tasks.
5. failure advances step.
6. no 6th extra review.
7. persistence across reload.
8. cross-day overdue rescheduling is spread, not dumped.
9. clock/timezone change yields no negative intervals.
10. suspend/delete cancels pending tasks.

## 12.3 FSRS (`tests/scheduler/fsrs.test.ts`)

1. Again/Hard/Good/Easy mapping.
2. reveal/confirm never generates a rating.
3. at most one schedule update per long-term review.
4. short-term logs never counted as long-term success.
5. deterministic for same state+rating+now.
6. invalid values rejected/sanitised.
7. scheduler version migration strategy.
8. relearning/learning transitions valid.

## 12.4 Data layer (`tests/db/*.test.ts`)

1. CRUD vocabulary.
2. transaction rollback on failure.
3. unique keys / indexes.
4. migration from previous version.
5. unsupported schemaVersion → explicit error.
6. JSON export contains required fields.
7. restore yields matching counts.
8. failed restore leaves data intact.
9. CSV handles commas/quotes/newlines/BOM.
10. dedup strategies honoured.

## 12.5 Dictionary (`tests/dictionary/*.test.ts`)

1. normal response → DTO.
2. missing phonetic/definition/example/translation still renders.
3. 401/403/404/429/5xx/timeout/network handled.
4. cache hit avoids request.
5. failed refresh keeps old cache.
6. logs contain no key.
7. production bundle contains no real key (manual/CI check).
8. mock data clearly labelled.

## 12.6 E2E (`e2e/*.spec.ts`)

- import CSV → study three branches.
- reload restores state.
- complete review → stats.
- export JSON → clear → import → restored.
- switch compact/standard/dark.
- narrow window: buttons visible, long text scrolls.
- API down: cached words still studyable.
- no dead buttons / blocking errors.

## Reporting

Each phase updates `docs/IMPLEMENTATION_STATUS.md` with command, pass/fail/
skip counts, environment (Node/browser versions), and known gaps.
