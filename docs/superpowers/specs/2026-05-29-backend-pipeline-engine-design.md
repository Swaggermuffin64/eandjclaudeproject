# Backend Pipeline Engine Design

## Overview

Backend engine that orchestrates a 4-step AI-powered investment research pipeline. Users upload PDFs and select a rubric (Life Sciences or Technology). The engine processes documents through Sonnet (extraction) and Opus (research + scoring), streaming real-time progress to the frontend via SSE.

This is sub-project 1 of 3. Sub-project 2 (Frontend Pipeline UI) and sub-project 3 (Prompt Integration tuning) follow.

## Decisions

- **One evaluation at a time** — pipeline lock prevents concurrent runs
- **No persistence** — results stream to frontend, user can download. Nothing saved server-side.
- **PDF upload only** — no Google Drive, no URLs. Multiple PDFs supported with one designated as primary.
- **Reject files over 32MB** — 413 error, no server-side splitting
- **4 steps** — Ingest, Template, Dossier, Score. No self-audit (Step 5) in this version.
- **User selects rubric** — Life Sciences or Technology, chosen at submission time.

## API

### `POST /api/pipeline/run`

Replaces the 5 placeholder pipeline routes.

**Request:** `multipart/form-data`

| Field | Type | Required | Description |
|---|---|---|---|
| `primaryPdf` | File | Yes | Main pitch deck / source document |
| `supplementaryPdfs` | File[] | No | Additional documents (financials, one-pagers, etc.) |
| `rubric` | String | Yes | `"life-sciences"` or `"technology"` |

**Response:** `text/event-stream` (SSE)

**Error responses:**
- `409 Conflict` — pipeline already running
- `413 Payload Too Large` — file exceeds 32MB
- `400 Bad Request` — missing required fields or invalid rubric value

### `GET /api/health`

Unchanged from shell. Returns `{ status: "ok", timestamp: string }`.

### SSE Event Types

```typescript
// Step lifecycle
{ type: "step:start", step: "ingest" | "template" | "dossier" | "score", timestamp: string }
{ type: "step:complete", step: string, timestamp: string }

// Claude tool calls (web search during Opus research)
{ type: "tool:call", step: string, tool: string, input: string, timestamp: string }
{ type: "tool:result", step: string, tool: string, summary: string, timestamp: string }

// Streaming text output from Claude
{ type: "text:delta", step: string, content: string, timestamp: string }

// Final downloadable results
{ type: "result:dossier", content: string, timestamp: string }
{ type: "result:score", content: string, timestamp: string }

// Terminal events
{ type: "pipeline:complete", timestamp: string }
{ type: "pipeline:error", error: string, step: string, timestamp: string }
```

## Architecture

### File Structure

```
server/src/
  pipeline/
    orchestrator.ts      — Runs steps in sequence, manages SSE emitter
    steps/
      ingest.ts          — Step 1: PDF → extracted text + Sonnet entity manifest (OI-3)
      template.ts        — Step 2: Sonnet fills operator inputs (OI-1, OI-2, OI-3)
      dossier.ts         — Step 3: Opus generates full R0-R8 dossier with web search
      score.ts           — Step 4: Opus scores against selected rubric
    claude/
      client.ts          — Anthropic SDK wrapper (Sonnet + Opus, streaming, tool use loop)
    prompts/
      loader.ts          — Reads prompt .txt files from disk
    types.ts             — Pipeline-internal types (step I/O, events)
  routes/
    pipeline.ts          — POST /api/pipeline/run (replaces 5 placeholder routes)
    health.ts            — GET /api/health (unchanged)
  plugins/
    cors.ts              — CORS plugin (unchanged)
    multipart.ts         — @fastify/multipart registration
  app.ts                 — Updated to register new route + multipart plugin
  server.ts              — Unchanged
```

### Pipeline Orchestrator

The orchestrator is the central coordinator. It:

1. Receives uploaded files + rubric choice from the route handler
2. Creates a Node.js `EventEmitter` wired to the SSE response
3. Checks the pipeline lock — if busy, throws (route returns 409)
4. Acquires the lock
5. Calls each step in sequence, passing the previous step's output
6. Emits `step:start` / `step:complete` around each step
7. On success: emits `result:dossier`, `result:score`, then `pipeline:complete`
8. On error: emits `pipeline:error` with the failed step and error message
9. Releases the lock and cleans up temp files (always, via finally)

```typescript
type StepFn<TIn, TOut> = (input: TIn, emitter: EventEmitter) => Promise<TOut>
```

### Step Data Flow

```
Step 1 (ingest) — Sonnet
  Input:  { primaryPdf: Buffer, supplementaryPdfs: Buffer[] }
  Output: { extractedText: string, entityManifest: string }

Step 2 (template) — Sonnet
  Input:  { extractedText: string, entityManifest: string }
  Output: { filledTemplate: string }
  Uses:   Research Dossier Template prompt (operator input sections)

Step 3 (dossier) — Opus
  Input:  { filledTemplate: string }
  Output: { dossier: string }
  Uses:   Research Dossier Template prompt (full R0-R8), web_search tool
  Emits:  tool:call / tool:result events for each web search

Step 4 (score) — Opus
  Input:  { dossier: string, rubric: "life-sciences" | "technology" }
  Output: { score: string }
  Uses:   Selected rubric prompt file
```

### Claude API Integration

**SDK:** `@anthropic-ai/sdk`

**Models used:**

| Step | Model | Rationale |
|---|---|---|
| 1 (Ingest) | claude-sonnet-4-6 | Mechanical extraction — fast, cheap |
| 2 (Template) | claude-sonnet-4-6 | Structured extraction of operator inputs |
| 3 (Dossier) | claude-opus-4-6 | Deep research, web search, cross-validation |
| 4 (Score) | claude-opus-4-6 | Nuanced rubric interpretation |

**Client wrapper** (`claude/client.ts`):

- `callSonnet(systemPrompt, userContent, emitter, step)` — for Steps 1-2
- `callOpus(systemPrompt, userContent, tools, emitter, step)` — for Steps 3-4
- Both methods stream responses:
  - Token arrives → emits `text:delta`
  - `tool_use` content block → emits `tool:call`, executes tool, emits `tool:result`, feeds result back
  - `end_turn` → returns accumulated response text
- PDF input uses Anthropic's native document support (base64-encoded `type: "document"` content blocks)
- Web search uses Claude's built-in `web_search` tool (no external API needed)

**API key:** Read from `process.env.ANTHROPIC_API_KEY` (loaded from `.env`).

### Prompt Loading

`prompts/loader.ts` reads the three prompt files from `prompts/` at the project root:

- `Research Dossier Template.txt` — used in Steps 2 and 3
- `Life Sciences Rubric v5.1.txt` — used in Step 4 when rubric is "life-sciences"
- `Technology Rubric.txt` — used in Step 4 when rubric is "technology"

Files are read once at startup and cached in memory. They don't change between evaluations.

### File Handling

**Upload:**
- `@fastify/multipart` handles multipart form data
- Files are written to `os.tmpdir()/pipeline-{uuid}/`
- File size limit: 32MB per file. Exceeding this returns 413.
- Primary PDF is required. Supplementary PDFs are optional.

**Cleanup:**
- After pipeline completes (success or error), the temp directory and all files are deleted
- Cleanup runs in a `finally` block — always executes

### Pipeline Lock

A module-level boolean flag:
- Set `true` when pipeline starts
- Set `false` in the `finally` block (after cleanup)
- Route handler checks the flag before starting — returns `409 Conflict` if locked

### Dependencies (new)

| Package | Purpose |
|---|---|
| `@anthropic-ai/sdk` | Claude API calls |
| `@fastify/multipart` | File upload handling |
| `dotenv` | Load .env for API key |

### Error Handling

- If a Claude API call fails (rate limit, network, invalid response), the orchestrator catches it, emits `pipeline:error` with the step name and error message, and cleans up.
- If file upload validation fails (missing primary PDF, oversized file, invalid rubric), the route handler returns a synchronous HTTP error before opening the SSE stream.
- The SSE connection stays open until `pipeline:complete` or `pipeline:error` is emitted.

### Environment Variables

```
ANTHROPIC_API_KEY=sk-ant-...
```

Read from `.env` at project root via `dotenv`.
