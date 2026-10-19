# Implementation Status

Status of the P0 MVP (taskbook §2.1) against the specification. Legend:
**Done** — implemented and tested; **Partial** — implemented with a noted gap;
**Deferred** — intentionally out of the P0 scope.

## Product scope

| Area | Spec | Status | Notes |
| --- | --- | --- | --- |
| Study flow / state machine | §3.3 | Done | All branches in `features/study/machine.ts` |
| Card information hierarchy | §3.2 | Done | Word front → hint → answer reveal → confirm |
| Same-day reinforcement queue | §3.4 | Done | `features/review/shortTerm.ts` |
| Keyboard shortcuts | §3.5 | Done | `1` remember, `2` forget, Space confirm, Enter next |
| Loading / empty / error states | §3.6 | Done | Spinner, `EmptyState`, error banner + retry |
| Two separate schedulers | §4.1 | Done | FSRS (long-term) vs. short-term queue |
| FSRS via `ts-fsrs` v5 | §4.2 | Done | `services/scheduler/fsrs.ts` |
| Rating mapping | §4.3 | Done | `services/scheduler/rating.ts` |
| Queue priority | §4.4 | Done | Short-term → long-term → new |
| Day boundary / timezone | §4.5 | Done | Local day key, clamped intervals |
| Dictionary provider abstraction | §5.1 | Done | mock + Collins providers |
| Internal DTO | §5.2 | Done | `types/dictionary.ts` |
| Collins verification checklist | §5.3 | Done | `docs/COLLINS_API_NOTES.md` |
| API security (server-side key) | §5.4, §11 | Done | Dev proxy only; secret scan passes |
| Caching strategy | §5.5 | Done | Dexie cache, stale-on-error retained |
| CSV import | §6.1 | Done | BOM/quotes/newlines, error report |
| Duplicate policy | §6.2 | Done | skip / overwrite selectable |
| Entry management | §6.3 | Done | Edit / suspend / delete |
| JSON backup & restore | §6.4 | Done | Export, parse, replace/merge, auto pre-backup |
| Data model & integrity | §7 | Done | Dexie v1, idempotency keys, single-transaction writes |
| Frontend architecture | §8 | Done | Feature modules, strict TS, no `any` |
| UI modes / compact | §9 | Done | Standard / compact / management + theme + font scale |
| Accessibility | §9.3 | Done | Focus, aria labels, disabled-state guards |
| Browser limits note | §9.4 | Done | Shown in Settings |
| Statistics | §10 | Done | Recall rates, trend, difficult ranking |
| Privacy / reliability | §11 | Done | No telemetry, local-first, sanitized I/O |
| Tests | §12 | Done | 95 unit/integration + 10 E2E, all passing |
| Word appearance order | §4.4 | Done | Sequential or shuffle within each priority block |
| In-app Collins key | §5.4 | Done | Save/test/apply via the server-side proxy |

## Known limitations

- **Web-only.** No desktop packaging (P2, §2.3).
- **Single browser engine tested** (Chromium). Firefox/WebKit are follow-ups.
- **No coverage threshold** configured (`@vitest/coverage-v8` not installed).
- **Collins live path** is exercised only through the dev proxy; automated tests
  mock `fetch`.
- **ECDICT** is used to generate the sample CSV, not bundled as a runtime
  dictionary (see D-010).

## Verification commands

All of the following pass at this commit:

```bash
npm run typecheck && npm run lint && npm run test && npm run build && npm run scan:secrets
npx playwright test --project=chromium
```

See `docs/TEST_REPORT.md` for the full report and `docs/DECISIONS.md` for the
decision log.
