# 测试报告 / Test Report

Taskbook §12.7. This report describes the state of the test suite at the
current commit.

## 运行环境 / Environment

| Item | Value |
| --- | --- |
| Node | v22.23.2 |
| npm | 10.9.8 |
| OS | Linux |
| E2E browser | Chromium (Playwright headless shell 156) |
| Test runner | Vitest 2.1.9 (unit/integration), Playwright 1.64 (E2E) |

## 测试命令 / Commands

```bash
npm run typecheck     # tsc -b --noEmit
npm run lint          # eslint . --ext .ts,.tsx
npm run test          # vitest run
npm run e2e           # playwright test
npm run build         # tsc -b && vite build
npm run scan:secrets  # node scripts/scan-secrets.mjs
```

## 结果 / Results

| Suite | Files | Tests | Passed | Failed | Skipped |
| --- | --- | --- | --- | --- | --- |
| Unit / integration (`npm run test`) | 15 | 95 | 95 | 0 | 0 |
| E2E (`npx playwright test --project=chromium`) | 3 | 10 | 10 | 0 | 0 |
| TypeScript (`tsc -b --noEmit`) | — | — | ✅ | 0 | — |
| ESLint | — | — | ✅ | 0 | — |
| Production build | — | — | ✅ (471.88 kB / 150.98 kB gzip) | 0 | — |
| Secret scan | — | — | ✅ | 0 | — |

No failing or skipped cases.

## 覆盖映射 / Coverage map (taskbook §12)

| Taskbook case | Where covered |
| --- | --- |
| §12.1 state machine (10 cases) | `tests/study/machine.test.ts`, `tests/study/studyService.test.ts` |
| §12.2 short-term queue (10 cases) | `tests/review/shortTerm.test.ts`, `tests/review/queue.test.ts` |
| §12.3 FSRS (8 cases) | `tests/scheduler/fsrs.test.ts`, `tests/scheduler/rating.test.ts` |
| §12.4 data layer (10 cases) | `tests/db/repositories.test.ts`, `tests/vocabulary/csv.test.ts`, `tests/vocabulary/importer.test.ts`, `tests/backup/backup.test.ts` |
| §12.5 dictionary service (8 cases) | `tests/dictionary/mock.test.ts`, `tests/dictionary/collins.test.ts`, `tests/dictionary/cache.test.ts` |
| §12.6 end-to-end | `e2e/study.spec.ts`, `e2e/backup.spec.ts`, `e2e/settings.spec.ts` |
| §10.2 statistics definitions | `tests/stats/stats.test.ts` |
| Word order (sequential/shuffle) | `tests/review/queue.test.ts` |
| Collins key save/test | `tests/dictionary/keys.test.ts` |
| Legacy backup without `wordOrder` | `tests/backup/backup.test.ts` |

## 失败用例与修复 / Notable fixes found by tests

- **Restore-after-refresh reset.** The study card loads in two stages
  (base → enriched), so the "start flow" effect fired twice and the second run
  overwrote a restored `HINT_SENTENCE` context with `WORD_FRONT`. Fixed by keying
  the effect on the active context's `vocabularyId`; the active session is also
  mirrored to `localStorage` synchronously so a refresh can't lose it.
- **Validator rejected new cards.** `isValidSnapshot` treated a never-reviewed
  FSRS card (stability/difficulty 0) as corrupt. Now state-aware.
- **Silently invisible words.** Vocabulary rows without a `LearningState` were
  omitted from the daily queue. Now treated as new words.

## 未测试项目 / Not covered (and why)

- Real Collins HTTP calls: tests use a mocked `fetch`. Live calls require a key
  and would be non-deterministic; the dev proxy is the integration point.
- Firefox/WebKit E2E: the project targets Chromium for MVP; other engines are a
  follow-up.
- Coverage percentage: `@vitest/coverage-v8` is not installed; enable it if a
  numeric threshold is required.
