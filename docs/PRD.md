# Product Requirements (PRD) — Word Pocket MVP

Derived from `PROJECT_TASKBOOK.md` v1.0. Where the taskbook and this PRD
disagree, the taskbook wins.

## 1. Goal

A local-first English vocabulary trainer for PC browsers that emphasises
**active recall**, **context hints**, **same-day reinforcement** and
**FSRS long-term scheduling**, working over a user-supplied word list even when
the dictionary API is unavailable.

## 2. Users

Individuals with a CSV vocabulary export (business / exam English) who study in
1–5 minute bursts and want to know which words they keep forgetting.

## 3. MVP scope (P0)

1. Import / inspect / manage ≥ 1,000 entries.
2. Complete study state machine with no missing branches.
3. Same-day reinforcement capped (default 5 extra reviews/word/day).
4. Reinforcement never counted as long-term success.
5. Session/task state survives refresh.
6. Full JSON backup & restore.
7. Dictionary API failure never blocks study of cached/local data.
8. Compact mode usable at ~320×240 CSS px.
9. Automated tests for scheduling, state machine, import/export, date
   boundaries, migrations.
10. No real API key in the production build.

## 4. Learning flow (authoritative)

Front → (remember) → Answer → confirm → done today + schedule long-term.
Front → (forget) → Hint sentence → (remember) → Answer → confirm → done.
Front → (forget) → Hint sentence → (forget) → Answer → confirm → same-day queue.

- Answer reveal and "confirm read" are separate events.
- Refresh during answer reveal restores that state; no duplicate writes.
- Confirm-read is **not** a recall success and never a Good/Easy rating.

## 5. Review flow

Due long-term review uses the same hint mechanism. Final recall determines the
FSRS rating: direct success → Good; after hint → Hard; still failed → Again
(+ reinforcement). Answer reveal alone never rates.

## 6. Reinforcement queue

- Default steps: 10m, 30m, 2h, 4h (configurable, validated increasing > 0).
- Max 5 extra reviews/day/word (first try + post-hint retry excluded).
- Each step re-asks for recall, no auto-reveal.
- Success removes remaining steps (records a short-term success, never inflates
  long-term mastery).
- One active short-term task per word/step; cross-day tasks are rescheduled, not
  dumped all at once.

## 7. Dictionary

- `DictionaryProvider` abstraction; Mock + Collins + cache decorator.
- Collins is integrated strictly per the verified document; Chinese meanings are
  never fabricated.
- Cache-first; failure keeps old cache and keeps study running.

## 8. Import

- CSV (UTF-8 / BOM), quoted fields, embedded newlines, column mapping,
  preview with totals (rows/valid/duplicate/error), dedup policy selection,
  transactional write, batched processing with progress, downloadable error
  report. Never writes before user confirmation.

## 9. Data

Entities per taskbook §7.1: Vocabulary, DictionaryEntry, LearningState,
ReviewLog, ShortTermTask, DailySession, Settings. IndexedDB via Dexie, versioned
migrations, idempotency keys, multi-table transactions.

## 10. Statistics

New words today, long-term reviews, short-term reviews, failures, active time,
first-recall success rate, post-hint success rate, 7/30-day trends, due &
overdue counts, difficult-word ranking, per-word history. All derived from
`ReviewLog`.

## 11. UI modes

Compact (≈320×240), Standard (≈600×450), Management (wide). Themes light/dark/
system, font scale, keyboard shortcuts (toggleable), full a11y labels.

## 12. Out of scope (v1)

Accounts/cloud sync, community, OCR, browser extension, achievements, native
always-on-top / global hotkeys (reserved for Tauri phase).

## 13. Acceptance

All P0 items above pass automated tests; taskbook §12 core cases pass; local DB,
backup/restore and cross-day scheduling verified; Collins status disclosed
accurately; production build free of real keys; README drives a fresh install.
