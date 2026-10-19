# Collins API — Verified Notes

Source: `API Developer Documentation 0.4.pdf` (provided by the user).
This file records only facts taken from that document. Nothing here is
guessed.

## Site

- API site: `http://api.collinsdictionary.com` — **only `https:` is supported**.
- Demo/explorer: `https://api.collinsdictionary.com/apidemo/`.

## Authentication

- A unique 64-character **access key** is supplied on request.
- The key is passed as an HTTP request header named `accessKey`
  (37): `accessKey: {accessKey}`.
- The key determines which datasets are accessible and the call quota.

## Transport

- REST, base path `/api/v1`.
- Response format chosen by the `Accept` header:
  - `application/json` → JSON
  - `application/xml` → XML
  - no `Accept` header → JSON (default)
  - any other `Accept` value → **406**
- The taskbook calls for JSON; we always send `Accept: application/json`.

## Endpoints (verbatim from the document)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/v1/dictionaries` | array of `{dictionaryCode, dictionaryName, dictionaryUrl}` |
| GET | `/api/v1/dictionaries/{dictionaryCode}` | single dictionary |
| GET | `/api/v1/dictionaries/{dictionaryCode}/search/?q={q}&pagesize={n}&pageindex={i}` | `pagesize` default 10, max 100; `pageindex` default 1 |
| GET | `/api/v1/dictionaries/{dictionaryCode}/search/didyoumean/?q={q}&entrynumber={n}` | `entrynumber` default 10, max 10 |
| GET | `/api/v1/dictionaries/{dictionaryCode}/search/first/?q={q}&format={format}` | format `html`\|`xml`, default `html` |
| GET | `/api/v1/dictionaries/{dictionaryCode}/entries/{entryId}?format={format}` | format `html`\|`xml`, default `html` |
| GET | `/api/v1/dictionaries/{dictionaryCode}/entries/{entryId}/pronunciations?lang={lang}` | lang optional |
| GET | `/api/v1/dictionaries/{dictionaryCode}/entries/{entryId}/nearbyentries?entrynumber={n}` | n default 10, max 50 |

## Response shapes (JSON)

- **search/first** and **entries/{id}** return:
  `dictionaryCode, format, entryContent, entryId, entryLabel, entryUrl,
  topics[]`. `entryContent` is the definition body rendered in the requested
  `format` — i.e. an **HTML string**. There is no structured meaning object.
- **search** returns `dictionaryCode, resultNumber, pageNumber,
  currentPageIndex, results[]` where each result has `entryId, entryLabel,
  entryUrl`.
- **didyoumean** returns `dictionaryCode, searchTerm, suggestions[]`.
- **pronunciations** returns an array of
  `{dictionaryCode, entryId, lang, pronunciationUrl}` (mp3 URL).
- **nearbyentries** returns preceding/following entry lists.
- **errors**: 5xx returns `{errorCode, errorMessage}` (JSON) or
  `<error><code/><message/></error>` (XML). The document states full error
  codes are in the *online* documentation, which we do not have.

## Consequences for our adapter

1. `entryContent` is HTML → we sanitise and render it; we do **not** assume a
   typed meaning/phonetic/example structure. Best-effort text extraction is
   used for the compact "example sentence hint".
2. **No Chinese translations** are returned. The UI marks Collins entries as
   `source: "collins"` and shows "无中文释义（来源未提供）" rather than a blank
   or fabricated value.
3. Pronunciations come from a separate endpoint and yield mp3 URLs.
4. Dictionary code defaults to `british` in our settings (the document's only
   named example). Other codes are discovered via `/dictionaries` at runtime.

## Not verified / unknown

- Exact error/status codes for 401/403/404/429 (only "5xx" and "an error is
  returned" are documented).
- Rate limits and concurrency limits are not stated numerically.
- Content caching / storage licence terms are not stated.
- Whether the key may be used in a desktop app or a local proxy is not stated;
  the document only warns that client libraries are for **server-side** use
  (line 411-413), which we honour.

These unknowns are surfaced in `docs/IMPLEMENTATION_STATUS.md` and treated
defensively in code (short cache TTL, no aggressive retries, manual refresh).
