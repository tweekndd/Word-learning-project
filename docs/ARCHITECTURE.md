# Architecture

## Overview

```
┌────────────────────────────────────────────────────────────┐
│ React UI (pages / components)                              │
│   Study · Vocabulary · Review · Difficult · Stats · Settings│
└───────────────▲───────────────────────────▲────────────────┘
                │ hooks / hooks use cases    │
┌───────────────┴───────────┐   ┌────────────┴───────────────┐
│ features/study            │   │ features/review            │
│  - state machine (pure)   │   │  - short-term queue        │
│  - session controller     │   │  - long-term scheduler      │
└───────────────▲───────────┘   └────────────▲───────────────┘
                │                             │
┌───────────────┴─────────────────────────────┴──────────────┐
│ services/                                                   │
│  dictionary (Mock/Collins/Cached) · scheduler (ts-fsrs)     │
│  backup · stats                                             │
└───────────────▲─────────────────────────────────────────────┘
                │ repositories (transactional)
┌───────────────┴─────────────────────────────────────────────┐
│ db/ : Dexie schema, migrations, repositories                │
└─────────────────────────────────────────────────────────────┘
```

## Module map

| Path | Responsibility |
| --- | --- |
| `src/types/` | Shared domain types & Zod schemas |
| `src/db/` | Dexie schema, migrations, repositories |
| `src/features/study/` | Pure state machine + study controller hook |
| `src/features/vocabulary/` | CSV parse/import UI, management |
| `src/features/review/` | Short-term queue logic, due-queue building |
| `src/services/dictionary/` | Providers, DTO, cache, HTML extraction |
| `src/services/scheduler/` | ts-fsrs adapter + rating mapping |
| `src/services/backup/` | JSON export/restore |
| `src/services/stats/` | Metrics derived from ReviewLog |
| `src/pages/` | Route containers |
| `src/components/` | Reusable UI |
| `src/utils/` | date, id, validation, text |
| `server/` | Optional dev Collins proxy |

## Study state machine

Pure reducer in `src/features/study/machine.ts`. States:
`WORD_FRONT`, `HINT_SENTENCE`, `ANSWER_REVEAL`, `SHORT_TERM_QUEUED`,
`SHORT_TERM_REVIEW`, `LONG_TERM_REVIEW`, `COMPLETED_TODAY`, `SUSPENDED`,
`ERROR_RECOVERY`. Events: `RECALL_REMEMBER`, `RECALL_FORGET`, `CONFIRM_REVEAL`,
`RESUME`, `SUSPEND`. The reducer returns the next state plus a list of
**effects** (log write, FSRS update, queue mutation) so persistence is
testable and deterministic.

The machine is independent of React and of the database. The
`useStudySession` hook executes effects transactionally.

## Scheduling separation

- Short-term: `ShortTermTask` rows + `src/features/review/shortTerm.ts`.
- Long-term: FSRS via `src/services/scheduler/fsrs.ts`; card state persisted in
  `LearningState`.
- Every `ReviewLog` carries `reviewType: new | short-term | long-term | manual`
  and `schedulerType` (`short-term` | `long-term` | `none`).
- Reinforcement success is logged as `reviewType: "short-term"` and never
  updates FSRS.

## Ratings

`src/services/scheduler/rating.ts` is the single mapping:
direct success → `Good`; after-hint success → `Hard`; failed → `Again`;
explicit "very easy" → `Easy`. Unit-tested.

## Idempotency

Every user answer produces an `idempotencyKey`
(`vocabId:stage:localDayKey:attempt`) stored on `ReviewLog` and unique-indexed;
double clicks and retries collide harmlessly.

## Time

- Store epoch ms (UTC).
- `localDayKey` from device local time zone (`timezoneMode: "device"`).
- On startup `reconcileOnStartup()` re-schedules overdue short-term tasks per
  cross-day rules and detects large clock jumps.

## Persistence strategy

Dexie tables: `vocabulary`, `dictionaryEntries`, `learningStates`,
`reviewLogs`, `shortTermTasks`, `dailySessions`, `settings`, `meta`.
Migrations are described in `src/db/migrations.ts`; a failed upgrade keeps the
old DB and demands a backup-based recovery instead of wiping.

## Dictionary DTO

`src/services/dictionary/dto.ts` defines the internal shape; providers map
their raw responses to it. `CollinsDictionaryProvider` stores sanitised HTML and
extracted examples/definitions and marks `source: "collins"`. `MockProvider`
marks `source: "mock"`. `CachedDictionaryProvider` reads/writes
`dictionaryEntries`.

## Backend proxy (dev only)

`server/index.mjs` is a small Node http server exposing `/api/collins/*`. It:
- injects the `accessKey` header from `COLLINS_API_KEY`,
- restricts the upstream host to `api.collinsdictionary.com`,
- validates the word/entryId pattern,
- caps response size and sets timeouts,
- never logs the key.
The Vite dev server proxies `/api/collins` to it. Production deployments either
host the same proxy or use the Mock/local-only mode.
