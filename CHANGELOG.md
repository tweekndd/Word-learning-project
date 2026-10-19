# Changelog

All notable changes to Word Pocket are documented here. The format loosely
follows [Keep a Changelog](https://keepachangelog.com/) and
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Word appearance order** setting: `sequential` (due/import order) or
  `shuffle` (uniformly random within each priority block). Changing it rebuilds
  the day's queue; it is included in settings backups with a safe default for
  older backups.
- **In-app Collins API key management** on the Settings page: enter, save, test,
  and apply a key. Keys are stored only in the server-side dev proxy (in a
  gitignored `.collins-key`, or from `COLLINS_API_KEY`), never in the browser,
  build output, or JSON backups. New proxy endpoints: `POST/DELETE
  /api/collins/key`, `POST /api/collins/test`, and an extended
  `GET /api/collins/health`.
- The configured Collins dictionary code now actually reaches the provider.

### Changed

- `settingsRepo.get` merges persisted settings over current defaults so newly
  added fields appear without a database migration.

### Security

- Runtime keys are validated server-side, written with mode `0600`, and never
  returned to the client; the secret scanner still passes.

## [0.1.0] — MVP

### Added

- **Study flow** implementing the taskbook state machine: word front →
  context hint → answer reveal → confirmation → feedback, covering the three
  primary branches (direct recall, recall after hint, forgot-after-hint).
- **Two independent schedulers**: FSRS (`ts-fsrs` v5) for long-term review and a
  same-day reinforcement queue; short-term reinforcement never mutates FSRS.
- **Local-first persistence** on IndexedDB via Dexie (v1 schema) with
  single-transaction writes and idempotency keys to prevent double-counting.
- **Dictionary provider abstraction** with a built-in deterministic mock
  provider and a Collins provider; HTML is sanitised and never rendered as code.
- **Dev-only Collins proxy** (`server/index.mjs`) that injects the API key
  server-side; the key is never bundled or logged.
- **CSV import** with BOM/quote/newline handling, column mapping, a validation
  report, and a skip/overwrite duplicate policy.
- **Entry management**: edit, suspend, delete.
- **JSON backup & restore** with schema-version checks, replace/merge modes, and
  an automatic pre-restore backup.
- **Statistics**: first-recall and post-hint success rates, 7-day trend,
  difficult-word ranking, and due counts.
- **UI modes**: standard, compact (≈320×240), and management; light/dark/system
  themes; font scaling; keyboard shortcuts.
- **Test suite**: 83 Vitest unit/integration tests and 8 Playwright E2E specs.

### Security

- Server-side-only API key with a build-output secret scanner
  (`npm run scan:secrets`).
- Imported HTML treated strictly as data; external URLs validated.
- No telemetry; all user data stays in the browser.

[0.1.0]: https://example.invalid/word-pocket/releases/0.1.0
