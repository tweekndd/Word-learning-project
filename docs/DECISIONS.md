# Decision Log (ADR)

This file records architecture and product decisions required by
`PROJECT_TASKBOOK.md` §0 and §16. Each entry states the decision, the reason,
and the risk.

## D-001 — Stack: React + TypeScript + Vite

- **Decision**: React 18 + TypeScript (strict) + Vite, Tailwind CSS for styling.
- **Reason**: Mandated by taskbook §2.1 / §8.1. Widely supported, fast HMR,
  easy static build.
- **Risk**: Browser storage limits for large vocabularies. Mitigated by
  IndexedDB and batch imports.

## D-002 — Persistence: Dexie over IndexedDB

- **Decision**: Use Dexie 4 as the IndexedDB wrapper.
- **Reason**: Taskbook §7.2 explicitly suggests IndexedDB/Dexie. Dexie provides
  typed tables, compound indexes, transactions and versioned migrations.
- **Risk**: Users can clear browser storage. Mitigated by backup reminders and
  JSON export (taskbook §7.2).

## D-003 — FSRS library: `ts-fsrs`

- **Decision**: Use `ts-fsrs` (MIT, actively maintained) as the FSRS engine.
- **Version pinned**: see `package.json`.
- **License**: MIT — compatible with this project.
- **Integration**: The library computes scheduling from `Card` state + `Rating`.
  We persist `stability`, `difficulty`, `reps`, `lapses`, `state`, `last_review`
  and `due` ourselves in `LearningState` because ts-fsrs is stateless.
- **Mapping**: Centralised in `src/services/scheduler/rating.ts` with unit tests.
- **Risk**: FSRS algorithm parameter changes across major versions. Mitigated by
  persisting `schedulerVersion` with every card.

## D-004 — Dictionary providers

- **Decision**: Define a single `DictionaryProvider` interface with:
  `MockDictionaryProvider`, `CollinsDictionaryProvider` and a
  `CachedDictionaryProvider` decorator.
- **Reason**: Taskbook §5.1.
- **Collins specifics** (verified against
  `API Developer Documentation 0.4.pdf`, see `docs/COLLINS_API_NOTES.md`):
  - Base URL `https://api.collinsdictionary.com/api/v1`
  - Auth via `accessKey` header (64-char key).
  - `GET /dictionaries/{dictCode}/search/first?q={word}&format=html`
  - `GET /dictionaries/{dictCode}/entries/{entryId}?format=html`
  - `GET /dictionaries/{dictCode}/entries/{entryId}/pronunciations?lang=en`
  - `GET /dictionaries/{dictCode}/search/didyoumean?q={word}`
  - Entry bodies are **HTML strings**, not structured JSON.
- **Consequence**: The Collins provider stores the raw HTML (sanitised on
  render) and derives a best-effort `englishDefinition` / `examples` from it.
  Chinese translations are **not** supplied by Collins; the UI must label them
  as absent rather than fabricate them (taskbook §5.3, §16.2).
- **Key safety**: The key is never placed in `VITE_*`. It is only accepted by
  the dev-time proxy (`server/`) from the server environment.

## D-005 — Dev-time Collins proxy

- **Decision**: Provide an optional Node/Fastify proxy under `server/` that
  injects the access key server-side, restricts the upstream host, validates
  input and rate-limits. The browser talks to `/api/collins/*`.
- **Reason**: Taskbook §5.4 forbids exposing the key to the frontend.
- **Risk**: Local proxy is not production hardened; documented as dev-only.

## D-006 — Time / day boundary

- **Decision**: Timestamps stored as Unix epoch milliseconds (UTC). "Learning
  day" key (`localDayKey`, `YYYY-MM-DD`) computed from the device local time
  zone by default (`timezoneMode: "device"`).
- **Reason**: Taskbook §4.5, §16.9.

## D-007 — Reinforcement defaults

- **Decision**: Default short-term intervals `[10m, 30m, 2h, 4h]` and
  `maxExtraReviewsPerWord = 5` (first try + post-hint retry excluded).
- **Reason**: Taskbook §3.4.
- **Validation**: intervals must be positive and strictly increasing.

## D-008 — Chinese translations source policy

- **Decision**: Chinese meanings come only from user input or an explicitly
  labelled local source (e.g. ECDICT import). Collins entries are shown with
  source `collins` and never given fabricated Chinese content.
- **Reason**: Taskbook §5.3, §16.2.

## D-009 — No telemetry

- **Decision**: No analytics, no third-party scripts, no data leaves the
  machine except user-initiated dictionary queries.
- **Reason**: Taskbook §11.1.

## D-010 — ECDICT as local dictionary source

- **Decision**: `samples/business_english.csv` is generated from ECDICT
  (MIT-licensed) and used purely as an import fixture. ECDICT is *not* bundled
  as a runtime dictionary to avoid shipping a 65 MB file with the web build.
- **Reason**: keep the build small; taskbook §11.1 privacy.

## Open questions

- Collins content caching duration must respect the licence terms; until
  confirmed, cached Collins entries carry a 7-day `expiresAt` and a manual
  refresh/clear control (taskbook §16.3).

## D-011 — Word appearance order is a settings choice

- **Decision**: `Settings.wordOrder` is `sequential` (default) or `shuffle`.
  Shuffling is applied *within* each priority block (short-term → long-term →
  new → difficult) using Fisher–Yates, so taskbook §4.4 priority is preserved.
- **Reason**: users asked for a no-pattern random order without breaking the
  scheduling priority. The RNG is injectable so tests remain deterministic.
- **Migration**: `settingsSchema` gives the field a default, and
  `settingsRepo.get` merges persisted rows over current defaults; old backups and
  old databases gain the field without a schema bump.

## D-012 — Collins key entry via the server-side proxy

- **Decision**: The Settings page can save/test a Collins key, but the key is
  sent to the dev proxy and stored server-side only (in a gitignored
  `.collins-key`, mode `0600`), or read from `COLLINS_API_KEY`. The browser never
  stores the key and the key is never included in exports.
- **Reason**: preserves D-004/D-005 and the §5.4 rule that the key must not be
  exposed to the client. Direct browser→Collins calls would expose the key and
  depend on CORS.
- **Consequence**: in-app key entry requires the proxy (`npm run dev:all`). The
  UI reports "本地代理未连接" otherwise; a static production deploy would need a
  real backend proxy to support this flow.
